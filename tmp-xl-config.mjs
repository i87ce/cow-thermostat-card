// Proposed config for walldisplay-sala-cucina (XL 10.1" display in Sala).
// Combines the preview-xl.html scaffold (groups, lights, covers) with the
// new climate.casa_<room> / climate.pavimento_* proxies, plus the
// per-room sensor.display_<room>_temperature / _humidity readings that
// every other wall display now uses.
const config = {
  type: "custom:cow-room-dashboard-card",
  weather_entity: "weather.pirateweather",
  sun_entity: "sun.sun",
  moon_entity: "sensor.moon",
  media_player: "media_player.music_assistant",
  locale: "it",
  rooms: [
    // ── Living ────────────────────────────────────────────────────
    {
      name: "Sala & Cucina",
      icon: "🛋",
      group: "Living",
      climate: "climate.casa_sala_cucina",
      temperature: "sensor.display_sala_temperature",
      humidity: "sensor.display_sala_humidity",
      light: [
        "light.led_calda_sala",
        "light.led_sala_fredda",
        "light.luce_tavolo_sala",
        "light.luce_cucina",
        "light.led_cucina",
      ],
      light_labels: ["Sala calda", "Sala fredda", "Tavolo", "Cucina", "Cucina LED"],
      cover: [
        "cover.tapparella_sala",
        "cover.tapparella_sala_terrazza",
        "cover.tapparella_cucina",
        "cover.tapparella_cucina_terrazza",
      ],
      cover_labels: ["Sala", "Sala terr.", "Cucina", "Cucina terr."],
    },

    // ── Zona notte ────────────────────────────────────────────────
    {
      name: "Padronale",
      icon: "🛏",
      group: "Zona notte",
      climate: "climate.casa_camera_padronale",
      temperature: "sensor.display_camera_padronale_temperature",
      humidity: "sensor.display_camera_padronale_humidity",
      light: [
        "light.comodino_01",
        "light.comodino_02",
        "light.led_camera_3",
        "light.led_cabina_armadio",
      ],
      light_labels: ["Comodino 1", "Comodino 2", "LED", "Cabina"],
      cover: "cover.tapparella_camera_padronale",
    },
    {
      name: "Studio Chiara",
      icon: "📚",
      group: "Zona notte",
      climate: "climate.casa_studio_chiara",
      temperature: "sensor.display_camera_2_temperature",
      humidity: "sensor.display_camera_2_humidity",
      light: "light.led_camera_2_2",
      cover: "cover.tapparella_camera_2",
    },
    {
      name: "Camera",
      icon: "🛌",
      group: "Zona notte",
      climate: "climate.casa_camera",
      temperature: "sensor.display_camera_1_temperature",
      humidity: "sensor.display_camera_1_humidity",
      light: "light.led_camera_1",
      cover: "cover.tapparella_camera_1",
    },

    // ── Servizi ───────────────────────────────────────────────────
    {
      name: "Bagno P.",
      icon: "🚿",
      group: "Servizi",
      climate: "climate.pavimento_bagno_padronale",
      temperature: "sensor.display_bagno_padronale_temperature",
      humidity: "sensor.display_bagno_padronale_humidity",
      light: ["light.luce_bagno_padronale", "light.luce_specchio_bagno_padronale"],
      light_labels: ["Soffitto", "Specchio"],
      cover: "cover.tapparella_bagno_padronale",
    },
    {
      name: "Bagno O.",
      icon: "🚿",
      group: "Servizi",
      climate: "climate.pavimento_bagno_ospiti",
      temperature: "sensor.display_bagno_ospiti_temperature",
      humidity: "sensor.display_bagno_ospiti_humidity",
      light: ["light.led_bagno_piccolo", "light.luce_specchio_bagno_piccolo"],
      light_labels: ["Soffitto", "Specchio"],
      cover: "cover.tapparella_bagno_piccola",
    },
    {
      name: "Lavanderia",
      icon: "🧺",
      group: "Servizi",
      // No climate: Lavanderia shares no Koolnova zone and isn't
      // driven by a floor thermostat (the wired BTicino is just an
      // on/off relay). Temp comes from the Ajax door sensor.
      temperature: "sensor.lavanderia_temperature",
      light: "light.luce_bagno_pt",
      cover: "cover.tapparella_bagno_pt",
    },

    // ── Altro ─────────────────────────────────────────────────────
    {
      name: "Ingresso PT",
      icon: "🚪",
      group: "Altro",
      climate: "climate.casa_ingresso_pt",
      temperature: "sensor.display_ingresso_pt_temperature",
      humidity: "sensor.display_ingresso_pt_humidity",
      light: ["light.luce_scala", "light.sgabuzzino_pt"],
      light_labels: ["Scala", "Sgabuzzino"],
    },
    {
      name: "Studio",
      icon: "💻",
      group: "Altro",
      light: ["light.luce_calda_studio", "light.luce_fredda_studio"],
      light_labels: ["Calda", "Fredda"],
      cover: "cover.tapparella_studio",
    },
    {
      name: "Garage",
      icon: "🚗",
      group: "Altro",
      light: "light.luce_box",
    },
    {
      name: "Esterno",
      icon: "🌳",
      group: "Altro",
      light: [
        "light.led_terrazzo",
        "light.led_esterno_p1",
        "light.luce_esterna_studio",
      ],
      light_labels: ["Terrazzo", "Esterno P1", "Studio"],
    },
  ],
};

// Pretty-print for review
console.log("=== proposed walldisplay-sala-cucina config ===\n");
console.log(`rooms (${config.rooms.length}):`);
for (const r of config.rooms) {
  const lights = Array.isArray(r.light) ? r.light.length : r.light ? 1 : 0;
  const covers = Array.isArray(r.cover) ? r.cover.length : r.cover ? 1 : 0;
  console.log(
    `  ${(r.icon ?? "").padEnd(2)} ${r.name.padEnd(15)} [${(r.group ?? "—").padEnd(10)}] climate=${(r.climate ?? "—").padEnd(40)} L=${lights} C=${covers}`,
  );
}
console.log(
  `\nhero entities: weather=${config.weather_entity}, sun=${config.sun_entity}, moon=${config.moon_entity}, media_player=${config.media_player}`,
);
console.log("\n(no save yet — run with --save to apply)");

if (process.argv.includes("--save")) {
  import("ws").then(async ({ default: WebSocket }) => {
    const ws = new WebSocket("wss://" + process.env.HA_HOST + "/api/websocket");
    let mid = 1;
    const pending = new Map();
    function send(type, payload = {}) {
      return new Promise((res, rej) => {
        const id = mid++;
        pending.set(id, { res, rej });
        ws.send(JSON.stringify({ id, type, ...payload }));
      });
    }
    ws.on("message", (data) => {
      const m = JSON.parse(data.toString());
      if (m.type === "auth_required") {
        ws.send(JSON.stringify({ type: "auth", access_token: process.env.HA_TOKEN }));
        return;
      }
      if (m.type === "auth_ok") {
        (async () => {
          const lovelaceCfg = {
            title: "Sala & Cucina",
            views: [
              {
                title: "Casa",
                path: "0",
                type: "panel",
                cards: [config],
              },
            ],
          };
          await send("lovelace/config/save", {
            url_path: "walldisplay-sala-cucina",
            config: lovelaceCfg,
          });
          console.log("\n✓ saved to walldisplay-sala-cucina");
          process.exit(0);
        })().catch((e) => { console.error("ERR", e.message); process.exit(1); });
        return;
      }
      if (m.id != null && pending.has(m.id)) {
        const p = pending.get(m.id);
        pending.delete(m.id);
        if (m.success === false) p.rej(new Error(JSON.stringify(m.error)));
        else p.res(m.result);
      }
    });
  });
}
