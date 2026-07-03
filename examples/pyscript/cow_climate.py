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


# ─── Calcolo stato ricco per stanza (air_state, §5) ───────────────────
def _room_air_state(slug, sistema):
    r = ROOMS[slug]
    if not _included(slug):
        return "excluded"
    if sistema in ("off", "unknown", "unavailable", "none", None):
        return "idle"
    cur = _num(r["temp"])
    sp = _setpoint(slug)
    if cur is None or sp is None:
        return "idle"
    if r["floor_only"]:
        # solo pavimento: rilevante solo in heat
        if sistema == "heat":
            gap = sp - cur
            if gap > IDLE:
                return "heating_floor"
            return "comfort"
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

    # 3) Pavimento — solo in Heat, solo stanze incluse ─────────────────
    for slug, r in ROOMS.items():
        pav = r["pavimento"]
        if sistema == "heat" and _included(slug):
            sp = _setpoint(slug)
            if state.get(pav) != "heat":
                climate.set_hvac_mode(entity_id=pav, hvac_mode="heat")
            climate.set_temperature(entity_id=pav, temperature=sp - FLOOR_OFFSET)
        else:
            if state.get(pav) not in ("off", None, "unavailable"):
                climate.set_hvac_mode(entity_id=pav, hvac_mode="off")

    # 4) Pubblica stato ricco + echo (unico writer) ────────────────────
    for slug, r in ROOMS.items():
        air = _room_air_state(slug, sistema)
        base = "cow/casa/%s" % slug
        cur = _num(r["temp"])
        hum = _num(r["hum"])
        if cur is not None:
            _publish("%s/current/state" % base, cur)
        if hum is not None:
            _publish("%s/humidity/state" % base, hum)
        _publish("%s/action/state" % base, _hvac_action(air))
        floor_on = (sistema == "heat" and _included(slug)
                    and state.get(r["pavimento"]) == "heat")
        _publish("%s/attrs/state" % base,
                 json.dumps({"air_state": air, "floor_on": floor_on}))
        # echo per persistenza retain (optimistic non pubblica lo state)
        _publish("%s/mode/state" % base, state.get(r["proxy"]))
        _publish("%s/setpoint/state" % base, _setpoint(slug))

    # Sistema: echo + action
    _publish("cow/casa/sistema/mode/state", sistema)
    _publish("cow/casa/sistema/fan/state", _attr(SYSTEM, "fan_mode", "auto"))
    sys_action = {
        "off": "off", "heat": "heating", "cool": "cooling",
        "dry": "drying", "fan_only": "fan",
    }.get(state.get(MITSU), "idle")
    _publish("cow/casa/sistema/action/state", sys_action)


@time_trigger("startup")
def cow_climate_startup():
    log.info("cow_climate v4 orchestrator caricato")
    cow_climate_orchestrate()
