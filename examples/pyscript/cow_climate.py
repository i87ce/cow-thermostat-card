"""
Cow Climate v4 — orchestratore unico (Pyscript).

Spec: docs/08-climate-system-redesign-analysis.md

Unico writer di stato: legge Sistema (modo+ventola) e stanze
(setpoint + include), decide serrande / Mitsubishi / pavimento nel
rispetto di REGOLA 1, e pubblica su MQTT lo stato ricco `air_state`
per la UI.

Entity governate (mai in UI):
  climate.koolnova_clima_clim1                 — Mitsubishi
  cover.koolnova_serrande_serranda_1..5        — serrande
  climate.*pavimento* / switch.display_*       — pavimento per stanza

Deploy: /config/pyscript/cow_climate.py  (+ pyscript: in configuration.yaml)
"""

import json

# ─── Costanti (spec §2.6, §6, §7) ─────────────────────────────────────
IDLE = 1.0        # ±°C attorno al setpoint = "a comfort"
BOOST = 5.0       # in Heat: spinta Mitsubishi solo se T < SP - BOOST
HEAT_T = 30       # setpoint fisso Mitsubishi in heat
COOL_T = 16       # setpoint fisso Mitsubishi in cool/dry
FLOOR_OFFSET = 1.0  # pavimento punta a setpoint - offset

SYSTEM = "climate.casa_sistema"
MITSU = "climate.koolnova_clima_clim1"

ALL_SERRANDE = [
    "cover.koolnova_serrande_serranda_1",
    "cover.koolnova_serrande_serranda_2",
    "cover.koolnova_serrande_serranda_3",
    "cover.koolnova_serrande_serranda_4",
    "cover.koolnova_serrande_serranda_5",
]

FAN_MAP = {"auto": "auto", "low": "low", "medium": "medium",
           "high": "high", "middle": "medium", "quiet": "low"}

# slug → configurazione stanza
ROOMS = {
    "camera_padronale": {
        "proxy": "climate.casa_camera_padronale",
        "temp": "sensor.display_camera_padronale_temperature",
        "hum": "sensor.display_camera_padronale_humidity",
        "serrande": ["cover.koolnova_serrande_serranda_1"],
        "pavimento": "climate.display_camera_padronale_pavimento_camera_padronale",
        "floor_only": False,
    },
    "studio_chiara": {
        "proxy": "climate.casa_studio_chiara",
        "temp": "sensor.display_camera_2_temperature",
        "hum": "sensor.display_camera_2_humidity",
        "serrande": ["cover.koolnova_serrande_serranda_2"],
        "pavimento": "climate.pavimento_camera_2",
        "floor_only": False,
    },
    "camera": {
        "proxy": "climate.casa_camera",
        "temp": "sensor.display_camera_1_temperature",
        "hum": "sensor.display_camera_1_humidity",
        "serrande": ["cover.koolnova_serrande_serranda_3"],
        "pavimento": "climate.display_camera_1_pavimento_camera_1",
        "floor_only": False,
    },
    "sala_cucina": {
        "proxy": "climate.casa_sala_cucina",
        "temp": "sensor.display_sala_temperature",
        "hum": "sensor.display_sala_humidity",
        "serrande": [
            "cover.koolnova_serrande_serranda_4",
            "cover.koolnova_serrande_serranda_5",
        ],
        "pavimento": "climate.display_sala_pavimento_sala_cucina",
        "floor_only": False,
    },
    "ingresso_pt": {
        "proxy": "climate.casa_ingresso_pt",
        "temp": "sensor.display_ingresso_pt_temperature",
        "hum": "sensor.display_ingresso_pt_humidity",
        "serrande": [],
        "pavimento": "climate.pavimento_ingresso_pt",
        "floor_only": True,
    },
    "bagno_padronale": {
        "proxy": "climate.casa_bagno_padronale",
        "temp": "sensor.display_bagno_padronale_temperature",
        "hum": "sensor.display_bagno_padronale_humidity",
        "serrande": [],
        "pavimento": "climate.pavimento_bagno_padronale",
        "floor_only": True,
    },
    "bagno_ospiti": {
        "proxy": "climate.casa_bagno_ospiti",
        "temp": "sensor.display_bagno_ospiti_temperature",
        "hum": "sensor.display_bagno_ospiti_humidity",
        "serrande": [],
        "pavimento": "climate.display_bagno_ospiti_pavimento_bagno_ospiti",
        "floor_only": True,
    },
}

AIR_SLUGS = [s for s, r in ROOMS.items() if not r["floor_only"]]


# ─── Helper lettura stato ─────────────────────────────────────────────
def _num(eid, default=None):
    try:
        return float(state.get(eid))
    except Exception:
        return default


def _attr(eid, name, default=None):
    try:
        val = state.getattr(eid)
        if val and name in val and val[name] is not None:
            return val[name]
    except Exception:
        pass
    return default


def _setpoint(slug):
    return _attr(ROOMS[slug]["proxy"], "temperature", 20.0)


def _included(slug):
    # proxy state: "auto" = Inclusa, "off" = Esclusa
    return state.get(ROOMS[slug]["proxy"]) == "auto"


def _serranda_open(cover):
    try:
        if state.get(cover) == "open":
            return True
        pos = _attr(cover, "current_position", 0)
        return (pos or 0) > 0
    except Exception:
        return False


def _open_count():
    return sum(1 for c in ALL_SERRANDE if _serranda_open(c))


def _publish(topic, payload, retain=True):
    service.call("mqtt", "publish", topic=topic,
                 payload=str(payload), retain=retain)


# ─── Persistenza intento (sopravvive a riavvii / retain perso) ────────
# Usiamo un helper input_text (HA lo ripristina nativamente da .storage al
# riavvio), NON un file: il sandbox pyscript non fa vera I/O su file.
# Formato compatto: "mode|fan|inc1,inc2,...|sp1,sp2,..." (ordine ROOMS).
INTENT_ENTITY = "input_text.cow_climate_intent"
_intent_sig = None
# I salvataggi sono bloccati durante la finestra d'avvio (prima che il
# restore abbia riportato lo stato buono), così il watchdog non sovrascrive
# l'intento salvato con i default (off/21) che le entità mostrano al boot.
# Parte True così un semplice reload di pyscript (senza startup) continua a
# salvare; lo startup lo mette a False finché il restore non è completato.
_ready = True


def _current_intent_str():
    mode = state.get(SYSTEM) or "off"
    fan = _attr(SYSTEM, "fan_mode", "auto") or "auto"
    inc = [str(state.get(r["proxy"]) or "off") for r in ROOMS.values()]
    sp = [str(_setpoint(slug)) for slug in ROOMS]
    return "%s|%s|%s|%s" % (mode, fan, ",".join(inc), ",".join(sp))


def _save_intent():
    """Salva l'intento nell'helper input_text, solo quando cambia."""
    global _intent_sig
    if not _ready:
        return  # finestra d'avvio: non sovrascrivere l'intento salvato
    val = _current_intent_str()
    if val == _intent_sig:
        return
    _intent_sig = val
    try:
        input_text.set_value(entity_id=INTENT_ENTITY, value=val)
    except Exception as e:
        log.warning("cow_climate: salvataggio intento fallito: %r" % e)


def _restore_intent():
    """All'avvio ripubblica l'ultimo intento salvato sui topic di stato."""
    val = state.get(INTENT_ENTITY)
    if not val or val in ("unknown", "unavailable", ""):
        return  # nessun intento salvato: si parte dai retain del broker
    try:
        mode, fan, inc_csv, sp_csv = val.split("|")
        incs = inc_csv.split(",")
        sps = sp_csv.split(",")
        slugs = list(ROOMS.keys())
        _publish("cow/casa/sistema/mode/state", mode)
        _publish("cow/casa/sistema/fan/state", fan)
        for i, slug in enumerate(slugs):
            base = "cow/casa/%s" % slug
            if i < len(incs) and incs[i]:
                _publish("%s/mode/state" % base, incs[i])
            if i < len(sps) and sps[i]:
                _publish("%s/setpoint/state" % base, sps[i])
        log.info("cow_climate: intento ripristinato da %s" % INTENT_ENTITY)
    except Exception as e:
        log.warning("cow_climate: ripristino intento fallito: %r" % e)


# ─── Log tracciabile (Logbook HA) ─────────────────────────────────────
# Stato precedente per rilevare i cambiamenti (persiste tra i trigger).
_prev = {"motor": None, "rooms": {}}

# Etichette leggibili per il log
ROOM_LABEL = {
    "camera_padronale": "Camera Padronale",
    "studio_chiara": "Studio Chiara",
    "camera": "Camera 1",
    "sala_cucina": "Sala & Cucina",
    "ingresso_pt": "Ingresso PT",
    "bagno_padronale": "Bagno Padronale",
    "bagno_ospiti": "Bagno Ospiti",
}
AIR_LABEL = {
    "excluded": "esclusa",
    "idle": "in attesa",
    "comfort": "a comfort",
    "heating": "riscalda (aria)",
    "heating_floor": "riscalda (pavimento)",
    "cooling": "raffredda",
    "drying": "deumidifica",
    "fan": "ventila",
}
MOTOR_LABEL = {
    "off": "spento",
    "heat": "heat 30°",
    "cool": "cool 16°",
    "dry": "dry 16°",
    "fan_only": "fan",
}


def _cause(kwargs):
    t = kwargs.get("trigger_type", "?")
    v = kwargs.get("var_name", "")
    if t == "time":
        return "watchdog 30s"
    if t == "state" and v:
        return v
    if t in ("event", "startup"):
        return "avvio"
    return t


def _open_summary(want_open):
    nums = [c.rsplit("_", 1)[-1] for c in want_open]
    return ("serrande " + ", ".join(nums)) if nums else "nessuna serranda"


def _logbook(name, message, entity_id=None):
    # Sintassi diretta pyscript: logbook.log(...). NB: service.call("logbook",
    # "log", name=...) andrebbe in conflitto col parametro posizionale `name`.
    if entity_id:
        logbook.log(name=name, message=message, entity_id=entity_id)
    else:
        logbook.log(name=name, message=message)


def _log_changes(kwargs, motor_mode, want_open, air_by_slug):
    cause = _cause(kwargs)
    # Motore
    if motor_mode != _prev["motor"]:
        prev = MOTOR_LABEL.get(_prev["motor"], _prev["motor"] or "—")
        now = MOTOR_LABEL.get(motor_mode, motor_mode)
        _logbook(
            "Cow Clima · Motore",
            "%s → %s (causa: %s) · %s aperte" % (prev, now, cause, _open_summary(want_open)),
            MITSU,
        )
        _prev["motor"] = motor_mode
    # Stanze
    for slug, air in air_by_slug.items():
        if _prev["rooms"].get(slug) != air:
            prev = AIR_LABEL.get(_prev["rooms"].get(slug), _prev["rooms"].get(slug) or "—")
            now = AIR_LABEL.get(air, air)
            _logbook(
                "Cow Clima · " + ROOM_LABEL.get(slug, slug),
                "%s → %s (causa: %s)" % (prev, now, cause),
                ROOMS[slug]["proxy"],
            )
            _prev["rooms"][slug] = air


# ─── Calcolo stato ricco per stanza (air_state, §5) ───────────────────
def _room_air_state(slug, sistema):
    r = ROOMS[slug]
    if not _included(slug):
        return "excluded"
    cur = _num(r["temp"])
    sp = _setpoint(slug)
    if r["floor_only"]:
        # Pavimento indipendente dal modo globale (impianto idronico a parte).
        if cur is None or sp is None:
            return "idle"
        return "heating_floor" if cur < sp - IDLE else "comfort"
    if sistema in ("off", "unknown", "unavailable", "none", None):
        return "idle"
    if cur is None or sp is None:
        return "idle"
    if sistema == "heat":
        gap = sp - cur
        if gap > BOOST:
            return "heating"
        if gap > IDLE:
            return "heating_floor"
        return "comfort"
    if sistema == "cool":
        return "cooling" if cur > sp + IDLE else "comfort"
    if sistema == "dry":
        return "drying" if cur > sp + IDLE else "comfort"
    if sistema == "fan_only":
        return "fan"
    return "idle"


def _hvac_action(air_state):
    return {
        "excluded": "off", "idle": "off", "comfort": "idle",
        "heating": "heating", "heating_floor": "heating",
        "cooling": "cooling", "drying": "drying", "fan": "fan",
    }.get(air_state, "off")


# ─── Serranda che DEVE stare aperta (deficit d'aria) ──────────────────
def _wants_air(slug, sistema):
    """True se la stanza ha bisogno dell'aria Mitsubishi (serranda aperta)."""
    if not _included(slug):
        return False
    r = ROOMS[slug]
    if r["floor_only"]:
        return False
    cur = _num(r["temp"])
    sp = _setpoint(slug)
    if cur is None or sp is None:
        return False
    if sistema == "heat":
        return cur < sp - BOOST          # spinta solo per gap grandi
    if sistema in ("cool", "dry"):
        return cur > sp + IDLE
    if sistema == "fan_only":
        return True
    return False


# ─── Orchestrazione principale ────────────────────────────────────────
@state_trigger(
    "climate.casa_sistema",
    "climate.casa_camera_padronale",
    "climate.casa_studio_chiara",
    "climate.casa_camera",
    "climate.casa_sala_cucina",
    "climate.casa_ingresso_pt",
    "climate.casa_bagno_padronale",
    "climate.casa_bagno_ospiti",
    "sensor.display_sala_temperature",
    "sensor.display_camera_1_temperature",
    "sensor.display_camera_2_temperature",
    "sensor.display_camera_padronale_temperature",
    "sensor.display_ingresso_pt_temperature",
    "sensor.display_bagno_padronale_temperature",
    "sensor.display_bagno_ospiti_temperature",
)
@time_trigger("period(now, 30sec)")
def cow_climate_orchestrate(**kwargs):
    task.unique("cow_climate_orchestrate")  # come mode: restart

    sistema = state.get(SYSTEM)
    fan = FAN_MAP.get(_attr(SYSTEM, "fan_mode", "auto") or "auto", "auto")
    if sistema in ("unknown", "unavailable", "none", None):
        sistema = "off"

    # 1) Serrande desiderate + modo motore ────────────────────────────
    want_open = []
    for slug in AIR_SLUGS:
        if _wants_air(slug, sistema):
            want_open += ROOMS[slug]["serrande"]
    want_open = list(dict.fromkeys(want_open))  # unique, ordine stabile

    if sistema == "off":
        motor_mode = "off"
    elif sistema == "fan_only":
        motor_mode = "fan_only" if want_open else "off"
    elif sistema == "heat":
        motor_mode = "heat" if want_open else "off"
    elif sistema == "cool":
        motor_mode = "cool" if want_open else "off"
    elif sistema == "dry":
        motor_mode = "dry" if want_open else "off"
    else:
        motor_mode = "off"

    # 2) Applica su hardware — REGOLA 1 ────────────────────────────────
    if motor_mode == "off":
        # motore OFF prima, poi chiudi tutte (anche l'ultima)
        if state.get(MITSU) != "off":
            climate.set_hvac_mode(entity_id=MITSU, hvac_mode="off")
            task.sleep(1)
        for c in ALL_SERRANDE:
            if _serranda_open(c):
                cover.close_cover(entity_id=c)
    else:
        # apri le necessarie PRIMA di accendere / cambiare il motore
        for c in want_open:
            if not _serranda_open(c):
                cover.open_cover(entity_id=c)
        task.sleep(2)
        climate.set_hvac_mode(entity_id=MITSU, hvac_mode=motor_mode)
        if motor_mode in ("heat", "cool", "dry"):
            climate.set_temperature(
                entity_id=MITSU,
                temperature=HEAT_T if motor_mode == "heat" else COOL_T,
            )
        climate.set_fan_mode(entity_id=MITSU, fan_mode=fan)
        # chiudi le non necessarie (>=1 resta aperta: want_open non vuoto)
        for c in ALL_SERRANDE:
            if c not in want_open and _serranda_open(c):
                cover.close_cover(entity_id=c)

    # 3) Pavimento ─────────────────────────────────────────────────────
    #   - stanze con aria: pavimento solo in Heat globale + incluse (@ sp-offset)
    #   - stanze SOLO pavimento (bagni, ingresso): indipendenti dal modo
    #     globale, on quando incluse (@ setpoint, impianto idronico separato)
    for slug, r in ROOMS.items():
        pav = r["pavimento"]
        inc = _included(slug)
        if r["floor_only"]:
            want = inc
            target = _setpoint(slug)
        else:
            want = (sistema == "heat" and inc)
            target = _setpoint(slug) - FLOOR_OFFSET
        if want:
            if state.get(pav) != "heat":
                climate.set_hvac_mode(entity_id=pav, hvac_mode="heat")
            climate.set_temperature(entity_id=pav, temperature=target)
        else:
            if state.get(pav) not in ("off", None, "unavailable"):
                climate.set_hvac_mode(entity_id=pav, hvac_mode="off")

    # 4) Pubblica stato ricco + echo (unico writer) ────────────────────
    air_by_slug = {}
    for slug, r in ROOMS.items():
        air = _room_air_state(slug, sistema)
        air_by_slug[slug] = air
        base = "cow/casa/%s" % slug
        cur = _num(r["temp"])
        hum = _num(r["hum"])
        if cur is not None:
            _publish("%s/current/state" % base, cur)
        if hum is not None:
            _publish("%s/humidity/state" % base, hum)
        _publish("%s/action/state" % base, _hvac_action(air))
        floor_on = state.get(r["pavimento"]) == "heat"
        _publish("%s/attrs/state" % base,
                 json.dumps({
                     "air_state": air,
                     "floor_on": floor_on,
                     "floor_only": r["floor_only"],
                 }))
        # NB: nessun echo di mode/setpoint qui. Con optimistic:true l'entità
        # gestisce da sé lo stato dai comandi; ripubblicarlo creava una race
        # che sovrascriveva i comandi utente. La persistenza è su input_text.

    # Sistema: solo action (hvac_action). Se il sistema è acceso ma il motore
    # è momentaneamente off (target raggiunto) mostriamo "idle", non "off".
    mitsu_state = state.get(MITSU)
    if sistema == "off":
        sys_action = "off"
    elif mitsu_state == "off":
        sys_action = "idle"
    else:
        sys_action = {
            "heat": "heating", "cool": "cooling",
            "dry": "drying", "fan_only": "fan",
        }.get(mitsu_state, "idle")
    _publish("cow/casa/sistema/action/state", sys_action)

    # 5) Log tracciabile dei cambi (stanze + motore) ───────────────────
    _log_changes(kwargs, motor_mode, want_open, air_by_slug)

    # 6) Persisti l'intento (solo se cambiato) ─────────────────────────
    _save_intent()


@time_trigger("startup")
def cow_climate_startup():
    global _ready
    log.info("cow_climate v4 orchestrator caricato")
    # Blocca i salvataggi durante il boot così il watchdog non sovrascrive
    # l'intento salvato con i default che le entità mostrano prima del restore.
    _ready = False
    # pyscript parte prima che MQTT e input_text siano pronti: aspetta che
    # l'intento salvato sia disponibile (max ~40s) + margine MQTT.
    for _ in range(40):
        if state.get(INTENT_ENTITY) not in (None, "unavailable", "unknown", ""):
            break
        task.sleep(1)
    task.sleep(8)
    _restore_intent()
    task.sleep(5)  # lascia aggiornare le entità dai topic di stato
    _ready = True
    cow_climate_orchestrate(trigger_type="startup")


# ─── Riconciliazione al ritorno online di un ESP32 (post-reboot) ──────
# Gli ESP32 (Mitsubishi + serrande) al riavvio possono ripartire in uno
# stato di sicurezza (es. serrande tutte aperte). Appena tornano
# raggiungibili ri-applichiamo subito lo stato desiderato, senza aspettare
# il watchdog dei 30s. (Fire solo sulla transizione unavailable→online,
# quindi niente thrash sui normali cambi di stato.)
@state_trigger(
    "climate.koolnova_clima_clim1",
    "cover.koolnova_serrande_serranda_1",
    "cover.koolnova_serrande_serranda_2",
    "cover.koolnova_serrande_serranda_3",
    "cover.koolnova_serrande_serranda_4",
    "cover.koolnova_serrande_serranda_5",
)
def cow_climate_device_online(value=None, old_value=None, **kwargs):
    offline = (None, "unavailable", "unknown")
    if old_value in offline and value not in offline:
        task.sleep(2)  # attende che l'ESP32 pubblichi lo stato iniziale
        cow_climate_orchestrate(trigger_type="event", var_name="esp32 online")
