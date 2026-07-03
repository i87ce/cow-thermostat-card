# Analisi — ridisegno sistema clima (UI + orchestratore)

> **Stato:** spec **vincolante** — §2 e tutte le decisioni §12 (D1–D8)
> confermate dall’utente (2026-07-03). Pronta per implementazione v4.  
> **Data:** 2026-07-03  
> **Motivazione:** v3 accumula patch su naming ambiguo (`heat` = partecipazione),
> stati MQTT non allineati alla realtà fisica, e UI che mescola “sistema” e “stanza”.
> L’utente ha definito il modello centralizzato: vedi **§2**.

---

## 1. Perché non funziona oggi (sintomi → cause)

| Sintomo | Causa probabile |
|---|---|
| Sala 20,9 °C, setpoint 20, ma sembra ancora “in participating” | Non c’è uno **stato utente** “a temperatura / in pausa” distinto da “aria on”. L’orchestratore può chiudere la serranda ma il proxy resta `heat` e l’UI non distingue **esclusa** vs **attiva** vs **a setpoint**. |
| Camera con Aria Off ma display mostra **Cool** | La card, in split, colora l’hero dal **sistema** (`casa_aria`) o da `hvac_action` stale, non da “questa stanza è esclusa”. |
| Confusione “stanze in heat” con sistema in cool | Sul proxy stanza `state: heat` significa solo **Aria On**, non modalità riscaldamento. |
| Bucchi dopo ogni fix | Logica sparsa tra template Jinja fragili, `publish_action` separato da `sync_air`, e UI che ricostruisce stato con euristiche. |

**Conclusione:** serve un modello a **tre livelli** con nomi e stati espliciti, poi UI che li riflette 1:1 senza interpretare.

---

## 2. Modello centralizzato (confermato dall’utente 2026-07-03)

> Questa è la **fonte di verità** del comportamento. Tutto il resto del
> documento discende da qui.

### 2.1 Un motore solo → una modalità sola per tutta la casa

Il lato aria (Mitsubishi) ha **un solo motore**: può stare in **una modalità
alla volta**. La modalità è quindi **globale**. Se una stanza chiede una
modalità diversa da quella attiva, il sistema **la cambia per tutti** (previa
**conferma** sul display che l’ha richiesta).

### 2.2 Le 5 modalità (globali)

| Modo | Cosa fa | Pavimento | Serrande |
|---|---|---|---|
| **Spento** | Motore spento | Off | Chiuse (motore off prima) |
| **Dry** | Deumidifica | Off | Solo zone in deficit |
| **Fan** | Solo ventole (ricircolo) | Off | Zone incluse aperte |
| **Cool** | Condizionatore | Off | Solo zone in deficit |
| **Heat** | Riscaldamento **+ pavimento** | **On** | Boost quando gap grande |

### 2.3 Heat = unica modalità con pavimento

In **Heat** lavorano **due sorgenti**:

- **Pavimento** — mantiene la temperatura della stanza aprendo/chiudendo la
  valvola (lento, di base).
- **Mitsubishi (aria calda)** — dà la **spinta** solo quando i gradi da
  recuperare sono **troppi**, cioè gap **> ±5 °C** dal setpoint. Sotto quella
  soglia ci pensa il pavimento da solo.

### 2.4 Serrande e stato “idle”

- La serranda di una stanza **si chiude** quando la stanza raggiunge il
  setpoint **±1 °C** (stato **idle / a comfort**).
- Se **tutte** le stanze incluse sono in temperatura → **tutte le serrande
  chiuse**, MA **prima di chiudere l’ultima** il sistema **spegne il motore**
  (REGOLA 1: mai motore acceso a serrande tutte chiuse → si rompe).
- Se una stanza **esce** dalla tolleranza (caldo o freddo) → il sistema
  **esce da idle**, riapre la sua serranda e riaccende il motore per riportarla.

### 2.5 Due “Off” diversi (chiarimento pulsanti)

| Comando | Ambito | Effetto |
|---|---|---|
| **Sistema → Spento** | **Globale** (come il cambio modo) | Spegne il **motore per tutta la casa** |
| **Stanza → Esclusa** | **Solo quella stanza** | Toglie la stanza dal loop; motore resta acceso per le altre |

I due pulsanti oggi si somigliano troppo → vanno etichettati e separati
chiaramente (vedi §4 e §9).

### 2.6 Ventola = globale, solo Mitsubishi, senza conferma

- La **velocità ventola** (Auto/Bassa/Media/Alta) è **centrale** come il modo:
  vale per tutta la casa.
- Riguarda **solo il Mitsubishi** (il pavimento non ha ventola).
- A differenza del modo, il cambio ventola è **immediato, senza conferma**
  (non ferma né inverte il motore, cambia solo la portata d’aria).

### 2.7 UI allineata ovunque

- Tutti i display mostrano **la stessa modalità e ventola** (sono globali).
- Il display **Sala (XL)**, che mostra tutte le altre stanze come il mobile,
  dev’essere **allineato** su modo/ventola con gli altri.

### Principi tecnici derivati

1. **Un solo posto per la verità** — lo stato che vede l’utente è quello che pubblica l’orchestratore (MQTT retain), non calcolato dalla card.
2. **Niente overload di `heat`** — la partecipazione aria non si chiama `heat` né sul wire né in UI (usiamo **Inclusa/Esclusa**).
3. **Sistema vs stanza** — modalità e ventola sono **solo globali**; setpoint e inclusione aria sono **solo per stanza**.
4. **Pavimento solo in Heat** — segue setpoint stanza; la spinta aria entra solo oltre ±5 °C.
5. **REGOLA 1** — motore acceso ⇒ almeno una serranda aperta; per spegnere “tutte chiuse” si spegne prima il motore.
6. **Due tolleranze** — `IDLE = ±1 °C` (serranda), `BOOST = ±5 °C` (spinta Mitsubishi in heat).

---

## 3. Modello concettuale (tre livelli)

```
┌─────────────────────────────────────────────────────────────┐
│  LIVELLO 1 — SISTEMA (uguale su TUTTI i display)            │
│  Modalità: Off | Heat | Cool | Dry | Fan only               │
│  Ventola:  Auto | Bassa | Media | Alta                        │
│  Entity HA: climate.casa_sistema                            │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│  LIVELLO 2 — STANZA CON ARIA (4 zone + sala/cucina)         │
│  Setpoint temperatura (0,5 °C)                               │
│  Inclusione aria: Inclusa | Esclusa                          │
│  Stato derivato (solo lettura): vedi §5                      │
│  Entity: climate.casa_<room> (proxy MQTT)                   │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│  LIVELLO 3 — PAVIMENTO (tutte le zone con valvola)          │
│  Gestito dall’orchestratore quando Sistema = Heat           │
│  Setpoint effettivo = setpoint stanza − 1 °C                 │
│  Entity: climate.pavimento_* (Generic Thermostat, no UI)    │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│  HARDWARE (mai in UI)                                        │
│  climate.koolnova_clima_clim1 — Mitsubishi @ 30 / 16 °C fix │
│  cover.koolnova_serrande_serranda_1..5 — serrande ESP32      │
└─────────────────────────────────────────────────────────────┘
```

### Zone aria (serranda)

| Stanza | Sensore temp | Serranda/e |
|---|---|---|
| Camera padronale | `sensor.display_camera_padronale_temperature` | 1 |
| Studio Chiara (cam 2) | `sensor.display_camera_2_temperature` | 2 |
| Camera 1 | `sensor.display_camera_1_temperature` | 3 |
| Sala & Cucina | `sensor.display_sala_temperature` | 4 + 5 |

### Zone solo pavimento (nessuna riga “Aria” in UI)

| Stanza | Proxy stanza |
|---|---|
| Bagno ospiti | `climate.casa_bagno_ospiti` |
| Bagno padronale | `climate.casa_bagno_padronale` |
| Ingresso PT | `climate.casa_ingresso_pt` |

---

## 4. Cosa vede e cosa può fare l’utente — per tipo di display

### 4.1 Wall display stanza **con aria** (Camera 1, Camera 2, Camera padronale, Sala XL)

**Layout proposto (sinistra = stato, destra = comandi):**

| Area | Contenuto | Azioni utente |
|---|---|---|
| **Hero sinistro** | Temperatura attuale, **stato stanza** (§5), colore da stato | Tap setpoint (sempre, anche se esclusa) |
| **Setpoint** | Valore + ▲▼ | Modifica setpoint |
| **Riga Sistema (Tutta la casa)** | Chip: Cool · Heat · Dry · Fan · Spento | Cambia modalità **globale** (con conferma se motore attivo in altro modo) |
| **Riga Ventola (Tutta la casa)** | Chip ventola | Cambia ventola **globale** |
| **Riga Stanza (Questa stanza)** | Toggle **Inclusa** / **Esclusa** (mai “Heat/On”) | Include/esclude la stanza dal loop aria |
| **Pavimento** | *(nessun controllo)* | In Heat il pavimento segue setpoint in automatico |

> **Chiarezza pulsanti:** la riga Sistema è etichettata *“Tutta la casa”*, la
> riga stanza *“Questa stanza”*. Così **Spento** (sistema) e **Esclusa** (stanza)
> non si confondono: il primo spegne il motore per tutti, il secondo isola la stanza.

**Cosa NON deve esserci:** chip Cool/Heat sulla riga stanza; controlli serrande; entity Mitsubishi.

### 4.2 Wall display **solo pavimento** (bagni, ingresso PT)

| Area | Contenuto | Azioni |
|---|---|---|
| Hero | Temperatura + stato pavimento | — |
| Setpoint | ▲▼ | Setpoint |
| **Clima** | **On** / **Off** | Accende/spegne **solo pavimento** (non legato a `casa_aria`) |

### 4.3 Mobile / XL home

| Superficie | Comportamento |
|---|---|
| Riga **Sistema aria** | Stessi chip di `casa_aria` |
| Tile stanza | Colore da **stato stanza** (§5), non da sistema se esclusa |
| Drawer stanza | Come wall display di quella stanza |

### 4.4 Display senza clima (Studio Alessio, Esterno, …)

Nessuna riga clima; solo luci/tapparelle come oggi.

---

## 5. Stati stanza (lettura) — la chiave per UI e MQTT

Ogni proxy stanza con aria espone un attributo **`room_air_state`** (nome proposto; oggi è `hvac_action` ma va ripensato):

| Stato UI | Significato | Colore hero | Serranda | Motore |
|---|---|---|---|---|
| **Esclusa** | Utente ha messo Inclusa = No | Grigio | Chiusa | (indifferente per la stanza) |
| **In attesa** | Inclusa, sistema Off | Grigio tenue | Chiusa | Off |
| **A comfort** | Inclusa, \|T − SP\| ≤ 1 °C | Verde | Chiusa | Off se **tutte** a comfort |
| **Riscaldando** | Heat, gap > 5 °C (spinta aria) | Arancio | Aperta | Heat @ 30 °C |
| **Riscaldando (pavimento)** | Heat, 1 < gap ≤ 5 °C | Arancio tenue | Chiusa | Off (solo pavimento) |
| **Raffreddando** | Cool, T > SP + 1 | Blu | Aperta | Cool @ 16 °C |
| **Deumidificando** | Dry, T > SP + 1 | Blu/viola | Aperta | Dry @ 16 °C |
| **Ventilazione** | Fan only, inclusa | Verde acqua | Aperta | Fan only |

In **Fan only** le stanze **escluse** restano con serranda **chiusa**.

**Regola d’oro UI:** se la stanza è **Esclusa**, l’hero mostra sempre **Esclusa** (grigio), **anche** se il sistema è Cool e altre stanze raffreddano. Mai “Cool” su una stanza esclusa.

**Esempio sala 20,9 °C, SP 20, sistema Cool, Inclusa:**  
→ stato **A comfort** (non “participating”, non “raffreddando”) → serranda chiusa.

---

## 6. Comportamento orchestratore — stagione calda (Cool / Dry)

**Input:** `sistema.mode`, `sistema.fan`, per ogni stanza `{inclusa, setpoint, temperatura}`.

### 6.1 Sistema = Off

1. Mitsubishi → Off  
2. Tutte le serrande → Chiuse  
3. Pavimento → Off  
4. Tutte le stanze → stato **Esclusa** o **In attesa** (se inclusa ma sistema off)

### 6.2 Sistema = Cool (o Dry)

Per ogni stanza **esclusa**: serranda chiusa, stato **Esclusa**.

Per ogni stanza **inclusa**:

| Condizione | Serranda | Stato stanza |
|---|---|---|
| T > SP + 1 °C | Apri | Raffreddando (o Deumidificando se Dry) |
| \|T − SP\| ≤ 1 °C | Chiudi | **A comfort** |
| T < SP − 1 °C (raro in cool) | Chiudi | A comfort |

**Mitsubishi:** acceso in Cool (o Dry) @ 16 °C se **almeno una** stanza inclusa ha deficit; altrimenti Off o fan only secondo §6.4.

### 6.3 Sistema = Fan only

- Stanze **incluse**: serranda aperta, stato Ventilazione, Mitsubishi fan only.  
- Stanze **escluse**: serranda chiusa, stato Esclusa.

### 6.4 Tutte le stanze incluse a comfort (nessun deficit) → **idle globale**

Ordine **obbligatorio** (REGOLA 1):

1. **Spegni il motore** (Mitsubishi → Off)  
2. **Poi** chiudi **tutte** le serrande  
3. Ogni stanza inclusa → stato **A comfort (idle)**

> Non si fa ricircolo fan: a comfort il motore è **spento**. La ventola gira
> solo se l’utente sceglie esplicitamente modo **Fan** (§6.3).

### 6.5 Una stanza esce dal comfort → **esci da idle**

1. Apri la/e serranda/e della zona tornata in deficit  
2. Mitsubishi → Cool/Dry @ 16 °C  
3. Le altre zone: serranda aperta solo se in deficit, altrimenti chiusa  
4. REGOLA 1 sempre garantita (motore acceso solo con ≥1 serranda aperta)  

---

## 7. Comportamento orchestratore — Heat (pavimento + spinta aria)

In Heat ci sono **due sorgenti**: pavimento (base) e Mitsubishi (spinta oltre
±5 °C). Due soglie: `IDLE = 1 °C`, `BOOST = 5 °C`.

### 7.1 Pavimento (base, in Heat, solo stanze incluse)

- Pavimento **On** @ `setpoint − 1 °C` per ogni stanza **inclusa** con valvola.
- Stanza **Esclusa** → pavimento **Off** (D1: esclusione spegne tutto il clima
  della stanza, aria **e** pavimento).
- Vale solo con sistema **Heat**; negli altri modi il pavimento è Off ovunque.

### 7.2 Aria / Mitsubishi (spinta solo per gap grandi)

Per ogni stanza **inclusa**, con `gap = SP − T` (positivo = fa freddo):

| Condizione | Serranda | Mitsubishi (motore) | Pavimento | Stato stanza |
|---|---|---|---|---|
| `gap > 5 °C` (molto sotto SP) | **Apri** | Heat @ 30 °C (spinta) | On | **Riscaldando** |
| `1 °C < gap ≤ 5 °C` | Chiusa | — | On | **Riscaldando (pavimento)** |
| `|gap| ≤ 1 °C` (a comfort) | Chiusa | — | On (mantiene) | **A comfort** |
| `gap < −1 °C` (sopra SP) | Chiusa | — | On (mantiene) | A comfort |

Per ogni stanza **esclusa**: serranda chiusa, **pavimento off**, stato **Esclusa**.

### 7.3 Motore Mitsubishi in Heat

- Acceso **Heat @ 30 °C** solo se **almeno una** stanza inclusa ha `T < SP − 5`.
- Quando nessuna stanza supera più i 5 °C di gap → **spegni motore** (prima di
  chiudere l’ultima serranda) e lascia lavorare il pavimento.
- Idle globale aria = nessuna stanza oltre soglia boost → motore off, serrande
  chiuse, il pavimento delle stanze incluse continua a mantenere.

### 7.4 Cool / Dry / Fan / Off (pavimento off)

- Pavimento → **Off** (è solo riscaldamento).  
- Aria segue §6.  

---

## 8. Matrice azioni utente → effetto fisico

| Azione utente | Dove | Ambito | Effetto immediato | Effetto fisico (dopo orchestratore) |
|---|---|---|---|---|
| Sistema → Cool | Qualsiasi display | **Globale** | `mode = cool` | Deficit per stanze **incluse**; apri/chiudi serrande; motore cool @ 16 |
| Sistema → **Spento** | Qualsiasi display | **Globale** | `mode = off` | Motore off (tutta la casa), serrande chiuse, pavimento off |
| Ventola → Media | Qualsiasi display | **Globale, senza conferma** | `fan = medium` | Mitsubishi cambia portata subito; pavimento non coinvolto |
| Setpoint 22 °C | Display stanza | Stanza | `setpoint = 22` | Ricalcolo deficit; può aprire serranda / accendere motore |
| Stanza → **Esclusa** | Display stanza | Stanza | `include = false` | Chiudi **subito** serranda **+ pavimento off**; hero **Esclusa**; altre zone invariate |
| Stanza → **Inclusa** | Display stanza | Stanza | `include = true` | Entra nel calcolo; serranda se fuori tolleranza; pavimento on se Heat |
| Clima On (bagno) | Bagno | Stanza | `pavimento = on` | Solo pavimento on @ SP−1 |

---

## 8-bis. Conflitto di modalità (un solo motore)

Poiché il motore fa **una modalità alla volta**, cambiare modo su un display
la cambia **per tutta la casa**.

**Flusso proposto:**

1. Utente in Camera tocca **Cool**, ma il sistema è in **Heat**.  
2. La card mostra **conferma**: *“Il sistema è in Riscaldamento. Passare a
   Raffreddamento per **tutta la casa**?”* → [Annulla] / [Cambia per tutti].  
3. Alla conferma: `mode = cool` globale, l’orchestratore riconfigura tutto.

**Quando chiedere conferma (D3, deciso):**

- Conferma **solo se il motore è già attivo in un modo diverso** da quello richiesto.
- Se il sistema è **Spento** o già nel modo richiesto → cambio **immediato**.

**Nessuna conferma** per: **Ventola** (globale ma non ferma/inverte il motore),
**Setpoint** e **Inclusa/Esclusa** (locali alla stanza).

---

## 9. Problemi v3 da non ripetere

| Anti-pattern v3 | Cosa fare in v4 |
|---|---|
| `modes: [off, heat]` sul proxy = confusione | `modes: [off, on]` o campo boolean `air_include` |
| `hvac_action` calcolato in automazione separata | Un solo script `orchestrate` che scrive **mode + setpoint + room_air_state** atomico |
| Template Jinja con `set` in loop | Logica in **script Python** (AppDaemon / Pyscript) o `template sensor` + `choose` minimali |
| UI che inferisce cooling da deficit | Card legge **solo** `room_air_state` dal proxy |
| `all_at_setpoint` apriva tutte le serrande (anche escluse) e faceva ricircolo | A comfort globale → **motore off + serrande chiuse** (no ricircolo automatico) |
| Serrande zone escluse non chiuse dal sync | Chiusura escluse è parte del ciclo, con guardia REGOLA 1 |
| Pavimento legato a `room.mode == heat` | Pavimento legato a `sistema.mode == heat` + setpoint stanza |
| Due “Off” indistinguibili | **Sistema → Spento** (globale) vs **Stanza → Esclusa** (locale), etichette diverse |

---

## 10. Proposta wire protocol MQTT (bozza v4)

Per ogni stanza con aria, topic `cow/casa/<slug>/`:

| Topic | Direzione | Valori |
|---|---|---|
| `setpoint/set` → `setpoint/state` | UI → HA | numero |
| `include/set` → `include/state` | UI → HA | `true` / `false` |
| `air_state/state` | HA → UI (retain) | `excluded` \| `idle` \| `comfort` \| `heating` \| `heating_floor` \| `cooling` \| `drying` \| `fan` |
| `current/state` | HA → UI | temperatura |
| `humidity/state` | HA → UI | umidità |

Sistema `cow/casa/sistema/`:

| Topic | Valori |
|---|---|
| `mode/set` → `mode/state` | `off` \| `heat` \| `cool` \| `dry` \| `fan_only` |
| `fan/set` → `fan/state` | `auto` \| `low` \| `medium` \| `high` |

---

## 10-bis. Mappa naming vecchio (v3) → nuovo (v4)

| v3 | v4 | Note |
|---|---|---|
| `climate.casa_aria` | **`climate.casa_sistema`** | mode + fan globali |
| `cow/casa/aria/*` | `cow/casa/sistema/*` | topic sistema |
| `climate.casa_<room>` con `mode: [off,heat]` | `climate.casa_<room>` con **`include`** bool | `heat` non significa più “aria on” |
| attr `hvac_action` (calcolato a parte) | attr/topic **`air_state`** (scritto dall’orchestratore) | stati §5 |
| automazioni `cow_climate_*` (Jinja) | modulo **Pyscript** `cow_climate.py` | single writer |
| `clima_casa_auto`, `koolnova_*` per-zona | **rimossi** dalla UI | hardware invariato dietro l’orchestratore |

Hardware invariato (mai in UI): `climate.koolnova_clima_clim1`,
`cover.koolnova_serrande_serranda_1..5`, `climate.pavimento_*`.

---

## 11. Checklist accettazione (test manuali)

### Cool

- [ ] Sala SP 20, T 20,9, Inclusa → **A comfort**, serranda sala chiusa, hero verde (non “cooling”)  
- [ ] Camera padronale **Esclusa**, sistema Cool, altre in deficit → serranda 1 **chiusa**, hero **Esclusa** grigio  
- [ ] Una stanza T 28, Inclusa → **Raffreddando**, serranda aperta, motore cool  
- [ ] Tutte incluse a comfort → **motore off, tutte serrande chiuse** (ultima chiusa dopo lo spegnimento), stato **A comfort**  
- [ ] Stanza torna sopra SP+1 → esce da idle, riapre serranda, riaccende motore  
- [ ] Sistema Spento → tutto off, hero In attesa/Esclusa  

### Heat

- [ ] Sistema Heat, stanza Inclusa, gap > 5 °C → pavimento on + serranda aperta + motore heat, **Riscaldando**  
- [ ] Sistema Heat, stanza Inclusa, 1 < gap ≤ 5 °C → **solo pavimento**, serranda chiusa, **Riscaldando (pavimento)**  
- [ ] Sistema Heat, stanza a comfort (±1) → pavimento mantiene, serranda chiusa, **A comfort**  
- [ ] Sistema Heat, stanza **Esclusa** → serranda chiusa **+ pavimento off** (D1), hero **Esclusa**  
- [ ] Sistema Cool → pavimento off ovunque  

### Conflitto modo / UI

- [ ] Cambio modo su display A → conferma → applicato e visibile su display B  
- [ ] Cambio Ventola su A → allineato su B e su Sala XL  
- [ ] **Sistema → Spento** su un display spegne il motore per tutti  
- [ ] **Stanza → Esclusa** esclude solo quella stanza, motore resta acceso  
- [ ] Nessun display mostra Cool/Heat sulla riga stanza  
- [ ] Console card: versione allineata  

---

## 12. Decisioni (2026-07-03)

**D1. Stanza Esclusa = spegne TUTTO il clima della stanza** ✅ *deciso*  
Escludere una stanza spegne **sia l’aria sia il pavimento** di quella stanza.
Esclusione = “questa stanza non fa clima”. Hero **Esclusa** (grigio), nessun
pavimento attivo. *(Impatta §7.1: il pavimento segue l’inclusione.)*

**D2. Soglie** ✅ *deciso*  
`IDLE = ±1 °C` (serranda). `BOOST` in Heat: la spinta Mitsubishi entra quando
`T < SP − 5` (più di 5 °C sotto il setpoint). Sotto quel gap → solo pavimento.

**D3. Conferma cambio modo** ✅ *deciso*  
Conferma **solo se il motore è già attivo in un modo diverso**. Se il sistema
è Spento (o già nel modo richiesto) → cambio immediato senza popup.

**D4. Comfort globale in Cool** ✅ *confermato*  
A comfort totale → **motore off + serrande chiuse** (l’ultima dopo lo
spegnimento). Nessun ricircolo automatico; la ventola parte solo con modo
**Fan** esplicito.

**D5. Dry** ✅ *confermato*  
Stessa logica di Cool (deficit se `T > SP + 1`) per ora; soglia umidità in
futuro.

**D6. Implementazione = Pyscript** ✅ *deciso*  
Orchestratore in **Pyscript/Python**: elimina i bug Jinja (`set` in loop,
`True` vs `'true'`), logica unica e testabile. Un solo writer di stato.

**D7. Migrazione = Big-bang** ✅ *deciso*  
Spegniamo v3 e accendiamo v4 in un’unica sessione. Backup del package v3 prima.

**D8. Naming entity** ✅ *deciso*  
Abbandoniamo tutto il vecchio. In v4:

- Sistema: **`climate.casa_sistema`** (era `casa_aria`) — mode + fan globali.
- Stanza: **`climate.casa_<room>`** mantiene il nome ma cambia semantica:
  `setpoint` + **`include`** (bool, era `mode heat/off`) + **`air_state`** (retain).
- Nessun proxy usa più `mode: heat` per indicare “aria on”.

Vedi §10-bis per la mappa completa vecchio → nuovo.

---

## 13. Piano di implementazione (v4)

Decisioni chiave: **Pyscript** (D6), **big-bang** (D7).

**Fase 0 — preparazione**
1. Backup package v3 (`cow_climate.yaml.bak.v3`).  
2. Installare/abilitare **Pyscript** (HACS integration) su HA.

**Fase 1 — orchestratore Pyscript (un solo writer)**
3. Modulo `cow_climate.py`: stato macchina completo (§6–7), REGOLA 1,
   idle/boost, esclusione = aria+pavimento off.  
4. Pubblica atomico su MQTT: `air_state`, setpoint echo, mode/fan echo.  
5. Trigger: cambio `mode/fan/setpoint/include` + sensori temperatura.

**Fase 2 — proxy MQTT v4**
6. Sistema **`climate.casa_sistema`** (mode+fan), topic `cow/casa/sistema/*`.  
7. Per stanza: `setpoint` + **`include`** (bool) + **`air_state`** (retain).

**Fase 3 — card v2**
8. Riga **Tutta la casa** (mode+fan) con conferma cambio modo (D3).  
9. Riga **Questa stanza** (Inclusa/Esclusa + setpoint).  
10. Hero colorato **solo** da `air_state` (no euristiche).  
11. Sala XL e mobile allineati su mode/fan.

**Fase 4 — dismissione v3**
12. Disabilitare automazioni v3 + `publish_action` + trigger Jinja.  
13. Test checklist §11.  

---

## Riferimenti

- Architettura attuale (v3): [`06-house-hvac-architecture.md`](./06-house-hvac-architecture.md)  
- Package HA oggi: [`examples/ha-cow-climate-orchestration.yaml`](../examples/ha-cow-climate-orchestration.yaml)  
- Display inventory: [`05-push-configuration-from-ha.md`](./05-push-configuration-from-ha.md)
