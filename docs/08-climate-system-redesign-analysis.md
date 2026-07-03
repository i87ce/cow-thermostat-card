# Analisi — ridisegno sistema clima (UI + orchestratore)

> **Stato:** bozza in revisione — §2 confermato dall’utente (2026-07-03), restano
> aperte le domande §12.  
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

### 2.6 UI allineata ovunque

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
│  Entity HA: climate.casa_aria (o successore)                │
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

### 7.1 Pavimento (base, sempre in Heat)

- Pavimento **On** @ `setpoint − 1 °C` per ogni stanza con valvola.
- Vale **finché il sistema è Heat**; l’inclusione aria **non** spegne il pavimento.
- (Da decidere §12: se una stanza è **Esclusa**, il pavimento resta comunque
  on? Proposta: sì, esclusione = solo aria.)

### 7.2 Aria / Mitsubishi (spinta solo per gap grandi)

Per ogni stanza **inclusa**, con `gap = SP − T` (positivo = fa freddo):

| Condizione | Serranda | Mitsubishi (motore) | Stato stanza |
|---|---|---|---|
| `gap > 5 °C` (molto sotto SP) | **Apri** | Heat @ 30 °C (spinta) | **Riscaldando** |
| `1 °C < gap ≤ 5 °C` | Chiusa | (solo pavimento) | **Riscaldando (pavimento)** |
| `|gap| ≤ 1 °C` (a comfort) | Chiusa | — | **A comfort** |
| `gap < −1 °C` (sopra SP) | Chiusa | — | A comfort |

Per ogni stanza **esclusa**: serranda chiusa, stato **Esclusa** (pavimento vedi §7.1).

### 7.3 Motore Mitsubishi in Heat

- Acceso **Heat @ 30 °C** solo se **almeno una** stanza inclusa ha `gap > 5 °C`.
- Quando nessuna stanza supera più i 5 °C di gap → **spegni motore** (prima di
  chiudere l’ultima serranda) e lascia lavorare il pavimento.
- Idle globale aria = tutte sotto soglia boost → motore off, serrande chiuse,
  pavimento continua a mantenere.

### 7.4 Cool / Dry / Fan / Off (pavimento off)

- Pavimento → **Off** (è solo riscaldamento).  
- Aria segue §6.  

---

## 8. Matrice azioni utente → effetto fisico

| Azione utente | Dove | Ambito | Effetto immediato | Effetto fisico (dopo orchestratore) |
|---|---|---|---|---|
| Sistema → Cool | Qualsiasi display | **Globale** | `mode = cool` | Deficit per stanze **incluse**; apri/chiudi serrande; motore cool @ 16 |
| Sistema → **Spento** | Qualsiasi display | **Globale** | `mode = off` | Motore off (tutta la casa), serrande chiuse, pavimento off |
| Ventola → Media | Qualsiasi display | **Globale** | `fan = medium` | Prossimo ciclo usa quella velocità |
| Setpoint 22 °C | Display stanza | Stanza | `setpoint = 22` | Ricalcolo deficit; può aprire serranda / accendere motore |
| Stanza → **Esclusa** | Display stanza | Stanza | `include = false` | Chiudi **subito** serranda; hero **Esclusa**; altre zone invariate |
| Stanza → **Inclusa** | Display stanza | Stanza | `include = true` | Entra nel calcolo; serranda solo se fuori tolleranza |
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

**Quando chiedere conferma (da decidere §12):**

- Sempre al cambio modo? oppure
- Solo se il modo attivo è **diverso e attivo** (motore acceso)? oppure
- Mai, cambio immediato (più semplice, ma può sorprendere).

**Setpoint e Inclusa/Esclusa** non richiedono conferma: sono locali alla stanza.

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

Sistema `cow/casa/aria/`:

| Topic | Valori |
|---|---|
| `mode/state` | `off` \| `heat` \| `cool` \| `dry` \| `fan_only` |
| `fan/state` | `auto` \| `low` \| `medium` \| `high` |

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
- [ ] Sistema Heat, stanza **Esclusa** → serranda chiusa; pavimento (vedi §12 D1)  
- [ ] Sistema Cool → pavimento off ovunque  

### Conflitto modo / UI

- [ ] Cambio modo su display A → conferma → applicato e visibile su display B  
- [ ] Cambio Ventola su A → allineato su B e su Sala XL  
- [ ] **Sistema → Spento** su un display spegne il motore per tutti  
- [ ] **Stanza → Esclusa** esclude solo quella stanza, motore resta acceso  
- [ ] Nessun display mostra Cool/Heat sulla riga stanza  
- [ ] Console card: versione allineata  

---

## 12. Domande aperte (da decidere prima di implementare)

**D1. Stanza Esclusa in Heat + pavimento**  
Se escludo una stanza dall’aria mentre il sistema è in Heat, il **pavimento**
di quella stanza resta **acceso** (esclusione = solo aria) o si spegne?  
→ *Proposta: pavimento resta on (esclusione = solo aria). Hero “Esclusa” ma
con piccola nota “pavimento attivo”.*

**D2. Soglie**  
Confermi `IDLE = ±1 °C` (serranda) e `BOOST = 5 °C` (spinta Mitsubishi in
heat)? Il boost è **gap assoluto > 5** o `T < SP − 5`?

**D3. Conferma cambio modo**  
Sempre / solo se motore attivo in modo diverso / mai? (vedi §8-bis)

**D4. Comfort globale in Cool**  
Confermi: a comfort totale **motore off + serrande chiuse** (niente ricircolo
fan automatico)? La ventola parte solo con modo **Fan** esplicito.

**D5. Dry**  
Stessa logica di Cool (deficit se T > SP + 1) per ora, soglia umidità in futuro?

**D6. Implementazione orchestratore**  
YAML puro o **Pyscript**? Consiglio Pyscript: elimina i bug Jinja (`set` in
loop, `True` vs `'true'`) che ci hanno fatto perdere tempo, logica testabile.

**D7. Migrazione**  
Big-bang (un pomeriggio, spegniamo v3 e accendiamo v4) o convivenza graduale?

**D8. Naming entity**  
Rinominiamo `climate.casa_aria` → qualcosa di più chiaro (es.
`climate.casa_sistema`)? E i proxy stanza da `mode heat` a `include on/off`?

---

## 13. Prossimi passi suggeriti

1. **Tu confermi / correggi** §5 (stati), §6–7 (heat/cool), §12 (domande).  
2. Aggiorniamo questo doc come **spec vincolante**.  
3. Implementazione in ordine:  
   - orchestratore v4 (un solo writer di stato)  
   - proxy MQTT con `include` + `air_state`  
   - card v2 (layout + label italiane: Inclusa/Esclusa, stati §5)  
   - dismissione `heat` come partecipazione e `publish_action` separato  

---

## Riferimenti

- Architettura attuale (v3): [`06-house-hvac-architecture.md`](./06-house-hvac-architecture.md)  
- Package HA oggi: [`examples/ha-cow-climate-orchestration.yaml`](../examples/ha-cow-climate-orchestration.yaml)  
- Display inventory: [`05-push-configuration-from-ha.md`](./05-push-configuration-from-ha.md)
