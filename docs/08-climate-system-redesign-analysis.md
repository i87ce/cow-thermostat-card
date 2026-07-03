# Analisi — ridisegno sistema clima (UI + orchestratore)

> **Stato:** bozza di lavoro — base per rifare da zero logica HA e card.  
> **Data:** 2026-07-03  
> **Motivazione:** v3 accumula patch su naming ambiguo (`heat` = partecipazione),
> stati MQTT non allineati alla realtà fisica, e UI che mescola “sistema” e “stanza”.

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

## 2. Principi di design (da rispettare nel rifacimento)

1. **Un solo posto per la verità** — lo stato che vede l’utente è quello che pubblica l’orchestratore (MQTT retain), non calcolato dalla card.
2. **Niente overload di `heat`** — la partecipazione aria non si chiama `heat` né sul wire né in UI.
3. **Sistema vs stanza** — modalità e ventola sono **solo globali**; setpoint e inclusione aria sono **solo per stanza**.
4. **Pavimento indipendente** — in inverno il pavimento segue setpoint stanza quando il sistema è in **Heat**; non dipende da “aria on”.
5. **REGOLA 1** — Mitsubishi acceso ⇒ almeno una serranda aperta (invariante fisica, non negoziabile).
6. **Tolera 1 °C** — dentro ±1 °C dal setpoint la stanza è “a comfort” per l’aria (serranda chiusa, nessun deficit).

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
| **Riga Sistema** | Chip: Cool · Heat · Dry · Fan · Off | Cambia modalità **globale** (tutti i display) |
| **Riga Ventola** | Chip ventola | Cambia ventola **globale** |
| **Riga Stanza** | **Inclusa** / **Esclusa** (mai “Heat/On”) | Esclude o include la stanza dal loop aria |
| **Pavimento** | *(nessun controllo)* | In Heat il pavimento segue setpoint in automatico |

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

| Stato UI | Significato | Colore hero | Serranda | Mitsubishi |
|---|---|---|---|---|
| **Esclusa** | Utente ha messo Inclusa = No | Grigio | Chiusa | Solo se altre zone lo richiedono |
| **In attesa** | Inclusa, sistema Off o nessun bisogno | Verde tenue / idle | Chiusa | Off |
| **A comfort** | Inclusa, \|T − SP\| ≤ 1 °C | Verde | Chiusa | Dipende dalle altre zone* |
| **Riscaldando** | Sistema Heat, T < SP − 1 | Arancio | Aperta | Heat @ 30 °C |
| **Raffreddando** | Sistema Cool, T > SP + 1 | Blu | Aperta | Cool @ 16 °C |
| **Deumidificando** | Sistema Dry, T > SP + 1 | Blu / viola | Aperta | Dry @ 16 °C |
| **Ventilazione** | Sistema Fan only, inclusa | Verde | Aperta** | Fan only |

\* Se **tutte** le stanze incluse sono a comfort → REGOLA ventilazione: tutte le serrande aperte, Mitsubishi fan only (circolazione).  
\** In Fan only le stanze **escluse** restano con serranda **chiusa**.

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

### 6.4 Tutte le stanze incluse a comfort (nessun deficit)

1. Apri **tutte e cinque** le serrande (circolazione)  
2. Mitsubishi → Fan only  
3. Ogni stanza inclusa → stato **A comfort** (o Ventilazione se si preferisce un solo label)

### 6.5 Una stanza esce dal comfort

1. Chiudi serrande delle zone a comfort (opzionale, per ridurre sprechi)  
2. Apri serrande delle zone in deficit  
3. Mitsubishi → Cool/Dry @ 16 °C  
4. REGOLA 1: mai zero serrande aperte con Mitsubishi non Off  

---

## 7. Comportamento orchestratore — stagione calda/fredda (Heat)

### 7.1 Sistema = Heat

**Pavimento (tutte le stanze con valvola, tranne logica bagno se diversa):**

- Pavimento **On** @ setpoint − 1 °C per ogni stanza (indipendente da inclusione aria).

**Aria (solo stanze con serranda):**

| Stanza | Condizione | Serranda | Stato |
|---|---|---|---|
| Esclusa | — | Chiusa | Esclusa |
| Inclusa, T < SP − 1 | deficit | Aperta | Riscaldando |
| Inclusa, a comfort | \|T−SP\| ≤ 1 | Chiusa | A comfort |

**Mitsubishi:** acceso Heat @ 30 °C solo se almeno una stanza **inclusa** ha deficit; se tutte a comfort → fan only + tutte serrande aperte (come in cool).

### 7.2 Sistema = Cool / Dry / Fan / Off in inverno

- Pavimento → Off (pavimento è solo riscaldamento)  
- Aria segue §6  

---

## 8. Matrice azioni utente → effetto fisico

| Azione utente | Dove | Effetto immediato | Effetto fisico (dopo orchestratore) |
|---|---|---|---|
| Sistema → Cool | Qualsiasi display | `casa_aria.mode = cool` | Valuta deficit per stanze **incluse**; apri/chiudi serrande; Mitsubishi cool @ 16 |
| Sistema → Off | Qualsiasi display | `casa_aria.mode = off` | Mitsubishi off, serrande chiuse, pavimento off |
| Ventola → Media | Qualsiasi display | `casa_aria.fan = medium` | Prossimo ciclo Mitsubishi usa quella velocità |
| Setpoint 22 °C | Display stanza | `casa_sala.setpoint = 22` | Ricalcolo deficit; può aprire serranda o accendere Mitsubishi |
| Stanza → **Esclusa** | Display quella stanza | `inclusa = false` | Chiudi **subito** serranda di quella zona; hero **Esclusa**; altre zone invariate |
| Stanza → **Inclusa** | Display quella stanza | `inclusa = true` | Entra nel calcolo deficit; apri serranda solo se T fuori tolleranza |
| Clima On (bagno) | Bagno | `proxy.mode = on` | Solo pavimento on @ SP−1 |

---

## 9. Problemi v3 da non ripetere

| Anti-pattern v3 | Cosa fare in v4 |
|---|---|
| `modes: [off, heat]` sul proxy = confusione | `modes: [off, on]` o campo boolean `air_include` |
| `hvac_action` calcolato in automazione separata | Un solo script `orchestrate` che scrive **mode + setpoint + room_air_state** atomico |
| Template Jinja con `set` in loop | Logica in **script Python** (AppDaemon / Pyscript) o `template sensor` + `choose` minimali |
| UI che inferisce cooling da deficit | Card legge **solo** `room_air_state` dal proxy |
| `all_at_setpoint` apre tutte le serrande incluso zone escluse | Prima chiudi escluse, poi applica regola circolazione solo su **incluse** |
| Pavimento legato a `room.mode == heat` | Pavimento legato a `sistema.mode == heat` + setpoint stanza |

---

## 10. Proposta wire protocol MQTT (bozza v4)

Per ogni stanza con aria, topic `cow/casa/<slug>/`:

| Topic | Direzione | Valori |
|---|---|---|
| `setpoint/set` → `setpoint/state` | UI → HA | numero |
| `include/set` → `include/state` | UI → HA | `true` / `false` |
| `air_state/state` | HA → UI (retain) | `excluded` \| `idle` \| `comfort` \| `heating` \| `cooling` \| `drying` \| `fan` |
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
- [ ] Una stanza T 28, Inclusa → **Raffreddando**, serranda aperta, Mitsubishi cool  
- [ ] Tutte incluse a comfort → fan only, 5 serrande aperte, stato **A comfort**  
- [ ] Sistema Off → tutto spento, hero Esclusa/In attesa  

### Heat

- [ ] Sistema Heat, stanza Inclusa, T sotto SP → pavimento on, serranda aperta se deficit aria, **Riscaldando**  
- [ ] Sistema Heat, stanza **Esclusa** → pavimento **on** comunque, serranda chiusa, hero **Esclusa** (o “Pavimento” se vogliamo mostrare solo pavimento?)  
- [ ] Sistema Cool → pavimento off ovunque  

### UI

- [ ] Cambio Sistema su display A visibile entro pochi secondi su display B  
- [ ] Nessun display mostra Cool/Heat sulla riga stanza  
- [ ] Console card: versione allineata  

---

## 12. Domande aperte (da decidere prima di implementare)

1. **Stanza Esclusa in Heat:** l’hero mostra solo “Esclusa” o anche “Pavimento attivo” se la valvola è aperta?  
2. **Sala 20,9 vs SP 20:** confermi tolleranza **±1 °C** (quindi 19–21 = comfort)?  
3. **Fan only con escluse:** le escluse restano sempre a serranda chiusa (proposta: sì).  
4. **Implementazione orchestratore:** restiamo su YAML puro o passiamo a **Pyscript** per evitare bug Jinja?  
5. **Migrazione:** big-bang su un pomeriggio o convivenza v3/v4 per stanza?  
6. **Dry:** stessa logica di Cool (deficit quando T > SP + 1) o soglia umidità in futuro?

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
