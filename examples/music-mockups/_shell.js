// Shared layout fragments + mock data so the 3 mockups share the same
// surrounding context (header chips, hero, scenes) and only differ in
// the music block + its expand behavior.
export const MOCK = {
  track: {
    title: "Felicità Puttana",
    artist: "Thegiornalisti",
    album: "Completamente",
    duration: 215, // s
    progress: 84,  // s
    art: "https://i.scdn.co/image/ab67616d0000b273e6f2a3d7e9c9c8e9e7e9e9e9", // not real, placeholder
  },
  device: "Display Sala",
  volume: 60,
  radios: [
    { name: "Radio Deejay", icon: "📻", color: "#e6202d" },
    { name: "RDS 105",      icon: "📻", color: "#0066ff" },
    { name: "Radio Italia", icon: "📻", color: "#21c25e" },
  ],
  playlists: [
    { name: "Daily Mix 1",  desc: "Personalizzato per te" },
    { name: "Discover Weekly", desc: "Aggiornata ogni lunedì" },
    { name: "Brani che ti piacciono", desc: "1.234 brani" },
    { name: "Lo-fi Italia", desc: "1h 32min" },
  ],
};

export function fmt(sec){
  const m = Math.floor(sec/60);
  const s = Math.floor(sec%60).toString().padStart(2,"0");
  return `${m}:${s}`;
}

export function renderShell(container, { hideMusicPill = false } = {}){
  container.innerHTML = `
    <div class="label-stanze">STANZE</div>
    <div class="top-pills">
      <div class="pill-pill">☀ 13°C  💧 44%</div>
      ${hideMusicPill ? "" : `<div class="pill-pill" id="music-pill-slot"></div>`}
    </div>

    <div class="groups">
      <div class="groups-row">
        <div class="group" style="--g:1">
          <div class="group-label">LIVING</div>
          <div class="group-chips">
            <div class="chip" data-active>
              <span class="chip-icon">🛋</span>
              <div class="chip-name">Sala &amp; Cucina</div>
            </div>
          </div>
        </div>
        <div class="group" style="--g:3">
          <div class="group-label">ZONA NOTTE</div>
          <div class="group-chips">
            <div class="chip"><span class="chip-icon">🛏</span><div class="chip-name">Padronale</div></div>
            <div class="chip"><span class="chip-icon">🛌</span><div class="chip-name">Studio Chiara</div></div>
            <div class="chip"><span class="chip-icon">🛌</span><div class="chip-name">Camera 1</div></div>
          </div>
        </div>
      </div>
      <div class="groups-row">
        <div class="group" style="--g:3">
          <div class="group-label">SERVIZI</div>
          <div class="group-chips">
            <div class="chip"><span class="chip-icon">🚿</span><div class="chip-name">Bagno P.</div></div>
            <div class="chip"><span class="chip-icon">🚿</span><div class="chip-name">Bagno O.</div></div>
            <div class="chip"><span class="chip-icon">🧺</span><div class="chip-name">Lavanderia</div></div>
          </div>
        </div>
        <div class="group" style="--g:4">
          <div class="group-label">ALTRO</div>
          <div class="group-chips">
            <div class="chip"><span class="chip-icon">💻</span><div class="chip-name">Studio</div></div>
            <div class="chip"><span class="chip-icon">🚗</span><div class="chip-name">Garage</div></div>
            <div class="chip"><span class="chip-icon">🚪</span><div class="chip-name">Ingresso PT</div></div>
            <div class="chip"><span class="chip-icon">🌳</span><div class="chip-name">Esterno</div></div>
          </div>
        </div>
      </div>
    </div>

    <div class="divider"></div>
    <div class="hero">
      <div class="sun"></div>
      <div class="clock">07:04</div>
      <div class="date">mercoledì 13 maggio 2026</div>
      <div class="meteo">
        <div class="t">13°</div>
        <div class="d">Sereno · sens. 11° · vento 4 km/h</div>
      </div>
    </div>
    <div class="scenes">
      <div class="scene"><span class="dot" style="background:#8C8C99"></span>○ Tutto OFF</div>
      <div class="scene"><span class="dot" style="background:#26A673"></span>△ Apri tutto</div>
      <div class="scene"><span class="dot" style="background:#1F1F2E"></span>☾ Notte</div>
      <div class="scene"><span class="dot" style="background:#FA6B2E"></span>■ Cinema</div>
    </div>
    <div class="drawer-peek">
      <div class="handle"></div>
      <div>Tocca una stanza per aprire i controlli</div>
    </div>
  `;
}
