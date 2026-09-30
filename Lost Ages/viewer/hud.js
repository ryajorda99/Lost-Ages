// hud.js — the MMO-style interface drawn over the 3D fight (used by viewer/3d.html).
//
//   Boss frame (top)        health, phase, cast bar, who he's attacking
//   Raid frames (left)      4 groups of 5 — class colours, role icons, mana/rage, boss target glow
//   Player frame (bottom)   the player you're following: health, resource, cast bar and ACTION BAR
//                           (every ability, lights up when used, cooldown sweep while it recharges)
//   Minimap (top right)     top-down view of the whole arena: players, enemies, fire, your camera
//   Chat / combat log       with All / Combat / Chat tabs
//
// It builds its own HTML and CSS, so 3d.html only has to call the functions at the bottom.

import { castColor } from "./effects.js";

// Icons for the action bar (any ability not listed shows its initials)
const ICONS = {
  // Knight
  righteousStrike: "⚔️", shieldOfValor: "🛡️", divineTaunt: "📢", challenge: "🗯️", holyTouch: "✋",
  holyGrounds: "✨", judgment: "🔨", sonOfLight: "☀️", redemption: "🕊️",
  // Healer
  flashHeal: "💫", greaterHeal: "💖", renew: "🔁", holyWard: "🔰", smite: "⚡", prayerOfMending: "🙏",
  purify: "💧", divineHymn: "🎶", resurrection: "🕊️",
  // Mage
  fireball: "🔥", frostBolt: "❄️", fireBlast: "💥", frostNova: "🧊", blink: "✴️", counterspell: "🚫",
  manaShield: "🔷", meteor: "☄️",
  // Rogue
  stealth: "👤", ambush: "🗡️", sinisterStrike: "🔪", eviscerate: "🩸", kick: "🦶", evasion: "💨",
  vanish: "🌫️", deathMark: "🎯",
  // Warrior
  charge: "🐂", heroicStrike: "⚔️", mortalStrike: "🪓", whirlwind: "🌀", execute: "☠️", pummel: "👊",
  battleShout: "📯", recklessness: "😡",
  // Druid
  wrath: "🌿", moonfire: "🌙", starsurge: "⭐", rejuvenation: "🌱", regrowth: "🌸", tranquility: "🍃",
  removeCorruption: "💧", innervate: "💠", markOfTheWild: "🐾", barkskin: "🌳",
  // Necromancer
  reaperForm: "💀", deathcallerForm: "🔮", deathBolt: "👻", plague: "🦠", reap: "⚰️", soulCleave: "🌀",
  raiseCorrupted: "🧟", boneShield: "🦴",
};
const ROLE_ICON = { tank: "🛡", healer: "✚", dps: "⚔" };
const RESOURCE_COLOR = { Mana: "#3a7bff", Rage: "#d63a3a", Energy: "#f2d23c", "Holy Power": "#f5c542" };
const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "-", "="];
const hex = (n) => "#" + n.toString(16).padStart(6, "0");
const esc = (s) => String(s).replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

const CSS = `
:root {
  --gold:#d9b25f; --gold-hi:#f3dc9a; --gold-lo:#7a5b22; --stone:#16181f; --stone-hi:#232633;
  --ink:#ece6d6; --dim:#9a93a8; --red:#c9302c; --display:"Cinzel", Georgia, serif; --ui:"Alegreya Sans", "Segoe UI", sans-serif;
}
body { font-family: var(--ui); }
.hud-frame {
  position:absolute; color:var(--ink);
  background: linear-gradient(180deg, rgba(35,38,51,.94), rgba(14,16,22,.94));
  border:1px solid var(--gold-lo); border-radius:6px;
  box-shadow: inset 0 1px 0 rgba(255,235,180,.12), inset 0 -3px 8px rgba(0,0,0,.6),
              0 0 0 1px rgba(0,0,0,.8), 0 8px 22px rgba(0,0,0,.55);
}
.hud-frame::before {   /* thin inner gold line = the "bevelled" MMO frame look */
  content:""; position:absolute; inset:3px; border:1px solid rgba(217,178,95,.22); border-radius:4px; pointer-events:none;
}
.hud-title { font-family:var(--display); font-weight:700; letter-spacing:.06em; color:var(--gold-hi); text-shadow:0 1px 0 #000, 0 0 8px rgba(217,178,95,.35); }

/* Glossy bars */
.gbar { position:relative; overflow:hidden; background:linear-gradient(#0b0c10,#1a1c24); border:1px solid #000; border-radius:3px; box-shadow: inset 0 1px 3px rgba(0,0,0,.8); }
.gbar > .f { position:absolute; inset:0 auto 0 0; width:100%; transition:width .12s linear; }
.gbar > .f::after { content:""; position:absolute; inset:0 0 50% 0; background:linear-gradient(rgba(255,255,255,.28), rgba(255,255,255,.04)); }
.gbar > span { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; font-size:11px; font-weight:700; text-shadow:0 1px 2px #000, 0 0 2px #000; white-space:nowrap; }

/* ---------- Top-left crest + controls ---------- */
#hud-crest { top:10px; left:10px; padding:7px 14px 8px; display:flex; align-items:center; gap:12px; }
#hud-crest .hud-title { font-size:17px; }
#hud-status { color:var(--dim); font-size:12px; max-width:36vw; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
#hud-controls { top:254px; right:10px; width:196px; padding:6px; display:flex; flex-wrap:wrap; gap:5px; align-items:center; justify-content:center; }
.hbtn, #hud-replays {
  font:600 12px var(--ui); color:var(--ink); cursor:pointer; padding:4px 9px; border-radius:4px;
  background:linear-gradient(#2c2f3d,#15171e); border:1px solid var(--gold-lo);
  box-shadow: inset 0 1px 0 rgba(255,255,255,.1), 0 1px 2px #000;
}
.hbtn:hover, #hud-replays:hover { border-color:var(--gold); color:var(--gold-hi); }
.hbtn.on { border-color:var(--gold); color:var(--gold-hi); box-shadow: inset 0 0 8px rgba(217,178,95,.35), 0 1px 2px #000; }
#hud-replays { width:100%; }
#hud-controls a { color:var(--dim); font-size:12px; padding:0 4px; }

/* ---------- Boss frame ---------- */
#hud-boss { top:10px; left:50%; transform:translateX(-50%); width:min(560px, calc(100% - 640px)); min-width:320px; padding:10px 14px 10px 74px; display:none; }
#hud-boss .medal {
  position:absolute; left:8px; top:50%; transform:translateY(-50%); width:56px; height:56px; border-radius:50%;
  background: radial-gradient(circle at 35% 30%, #5a2a2a, #1a0808 70%); border:2px solid var(--gold);
  box-shadow: 0 0 0 2px #000, 0 0 14px rgba(255,80,40,.35), inset 0 0 10px #000;
  display:flex; align-items:center; justify-content:center; font-size:28px;
}
#hud-boss .row { display:flex; justify-content:space-between; align-items:baseline; margin-bottom:4px; gap:10px; }
#hud-boss .name { font-family:var(--display); font-weight:700; font-size:15px; color:#ffd2b0; text-shadow:0 1px 0 #000; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
#hud-boss .phase { font-family:var(--display); font-size:11px; color:var(--gold-hi); padding:1px 8px; border:1px solid var(--gold-lo); border-radius:10px; background:rgba(0,0,0,.35); white-space:nowrap; }
#hud-boss .hp { height:20px; }
#hud-boss .hp > .f { background:linear-gradient(#e0473f,#8c1612); }
#hud-boss .sub { display:flex; justify-content:space-between; margin-top:5px; gap:10px; font-size:11px; color:var(--dim); }
#hud-boss .cast { height:14px; flex:1; display:none; }
#hud-boss .cast > .f { background:linear-gradient(#f7cf5a,#a8740f); transition:none; }
#hud-boss .aggro { white-space:nowrap; }
#hud-boss .aggro b { color:#ff8a7a; }

/* ---------- Raid frames ---------- */
#hud-raid { top:64px; left:10px; padding:8px; width:176px; max-height:calc(100% - 330px); overflow:auto; }
#hud-raid .grp { font-family:var(--display); font-size:10px; color:var(--gold); letter-spacing:.1em; margin:4px 2px 3px; }
.rf { position:relative; height:24px; margin-bottom:3px; cursor:pointer; border-radius:3px; }
.rf .gbar { position:absolute; inset:0; }
.rf .gbar > .f { opacity:.85; }
.rf .role { position:absolute; left:4px; top:3px; font-size:10px; opacity:.9; z-index:1; text-shadow:0 1px 2px #000; }
.rf .nm { position:absolute; left:18px; top:3px; right:34px; font-size:12px; font-weight:700; color:#fff; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; text-shadow:0 1px 2px #000, 0 0 3px #000; z-index:1; }
.rf .pc { position:absolute; right:5px; top:4px; font-size:10px; color:#fff; opacity:.85; z-index:1; text-shadow:0 1px 2px #000; }
.rf .res { position:absolute; left:1px; right:1px; bottom:1px; height:3px; z-index:1; }
.rf.dead .gbar > .f { width:0 !important; }
.rf.dead .nm { color:#888 !important; }
.rf.dead .pc::before { content:"💀 "; }
.rf.aggro { box-shadow: 0 0 0 1px #ff4a3a, 0 0 8px rgba(255,60,40,.7); }
.rf.follow { box-shadow: 0 0 0 2px var(--gold-hi), 0 0 10px rgba(243,220,154,.5); }
.rf:hover { filter:brightness(1.2); }

/* ---------- Player frame + action bar ---------- */
#hud-player { bottom:14px; left:50%; transform:translateX(-50%); padding:10px 14px 12px 88px; width:min(620px, calc(100% - 20px)); }
#hud-player .medal {
  position:absolute; left:10px; top:12px; width:64px; height:64px; border-radius:50%;
  border:2px solid var(--gold); box-shadow: 0 0 0 2px #000, inset 0 0 12px #000;
  display:flex; align-items:center; justify-content:center; font-size:30px;
}
#hud-player .top { display:flex; justify-content:space-between; align-items:baseline; margin-bottom:4px; }
#hud-player .pname { font-family:var(--display); font-weight:700; font-size:15px; text-shadow:0 1px 0 #000; }
#hud-player .pclass { font-size:11px; color:var(--dim); }
#hud-player .hint { font-size:11px; color:var(--dim); }
#hud-player .hp { height:16px; margin-bottom:3px; }
#hud-player .hp > .f { background:linear-gradient(#4fd14a,#1f7a1c); }
#hud-player .res { height:10px; }
#hud-player .res > span { font-size:9px; }
#hud-player .cast { height:12px; margin-top:6px; visibility:hidden; }
#hud-player .cast > .f { background:linear-gradient(#f7cf5a,#a8740f); transition:none; }
#hud-bar { display:flex; gap:5px; margin-top:8px; margin-left:-74px; justify-content:center; flex-wrap:wrap; }
.slot {
  position:relative; width:42px; height:42px; border-radius:5px; border:1px solid #000;
  box-shadow: 0 0 0 1px var(--gold-lo), inset 0 1px 0 rgba(255,255,255,.25), inset 0 -6px 10px rgba(0,0,0,.45);
  display:flex; align-items:center; justify-content:center; font-size:21px; overflow:hidden;
}
.slot .ini { font:700 13px var(--ui); color:#fff; text-shadow:0 1px 2px #000; }
.slot .key { position:absolute; top:1px; right:3px; font:700 9px var(--ui); color:#fff; text-shadow:0 1px 1px #000; opacity:.8; }
.slot .cd { position:absolute; inset:0; background:conic-gradient(rgba(0,0,0,.72) var(--p), transparent 0); display:none; }
.slot .cdt { position:absolute; inset:0; display:none; align-items:center; justify-content:center; font:700 13px var(--ui); color:#fff3c4; text-shadow:0 1px 2px #000, 0 0 3px #000; }
.slot.cooling .cd { display:block; } .slot.cooling .cdt { display:flex; }
.slot.casting { box-shadow: 0 0 0 2px var(--gold-hi), 0 0 12px rgba(243,220,154,.8); }
.slot.flash { animation: slotflash .45s ease-out; }
@keyframes slotflash { 0% { box-shadow: 0 0 0 2px #fff, 0 0 20px #fff; filter:brightness(2); } 100% { } }
.slot[title]:hover { filter:brightness(1.25); }

/* ---------- Minimap ---------- */
#hud-map { top:10px; right:10px; width:196px; padding:8px; text-align:center; }
#hud-map canvas { width:180px; height:180px; border-radius:50%; display:block;
  box-shadow: 0 0 0 3px #000, 0 0 0 5px var(--gold-lo), 0 0 0 6px #000, inset 0 0 20px #000; }
#hud-map .zone { font-family:var(--display); font-size:11px; color:var(--gold-hi); margin-top:8px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
#hud-map .clock { font-size:11px; color:var(--dim); }

/* ---------- Chat / combat log ---------- */
#hud-log { right:10px; bottom:14px; width:min(390px, calc(100% - 20px)); height:230px; display:flex; flex-direction:column; padding:0; }
#hud-log .tabs { display:flex; gap:2px; padding:6px 8px 0; }
#hud-log .tab { font:700 11px var(--display); letter-spacing:.05em; color:var(--dim); padding:3px 10px; border:1px solid transparent; border-bottom:none; border-radius:4px 4px 0 0; cursor:pointer; }
#hud-log .tab.on { color:var(--gold-hi); border-color:var(--gold-lo); background:rgba(0,0,0,.35); }
#hud-log .lines { flex:1; overflow:auto; margin:0 8px 8px; padding:4px 6px; background:rgba(0,0,0,.35); border:1px solid rgba(217,178,95,.2); border-radius:0 4px 4px 4px; font-size:12.5px; }
#hud-log .lines div { padding:1px 0; }
#hud-log .t { color:#6d6a78; margin-right:6px; font-variant-numeric:tabular-nums; }
#hud-log .death { color:#ff8a80; } #hud-log .rez { color:#ffe28a; } #hud-log .boss { color:#ffb35c; font-weight:700; }
#hud-log .chat { color:#8fd0ff; } #hud-log .info { color:#b8f5b0; } #hud-log .warn { color:#ffcf6b; }
#hud-log.f-combat .chat, #hud-log.f-combat .info { display:none; }
#hud-log.f-chat div:not(.chat) { display:none; }

/* ---------- Help, models panel, banner ---------- */
#hud-help { left:10px; bottom:14px; padding:6px 12px; font-size:11px; color:var(--dim); max-width:calc(50% - 330px); }
#hud-help b { color:var(--ink); }
#hud-models { top:340px; right:220px; width:min(330px, calc(100% - 20px)); padding:12px 14px; display:none; max-height:50%; overflow:auto; font-size:12px; }
#hud-models code { color:#ffd9a0; } #hud-models .ok { color:#8f8; } #hud-models .no { color:var(--dim); }
#hud-banner { position:absolute; top:34%; left:50%; transform:translate(-50%,-50%); pointer-events:none; display:none; text-align:center; }
#hud-banner .big { font-family:var(--display); font-weight:700; font-size:72px; letter-spacing:.12em;
  background:linear-gradient(#fff6d8, #f3dc9a 40%, #b8862e 60%, #f3dc9a); -webkit-background-clip:text; background-clip:text; color:transparent;
  filter: drop-shadow(0 3px 0 #000) drop-shadow(0 0 22px rgba(243,220,154,.55)); }
#hud-banner.wipe .big { background:linear-gradient(#ffd0c8, #ff5a4a 45%, #7a0f0a 60%, #ff7a6a); -webkit-background-clip:text; background-clip:text;
  filter: drop-shadow(0 3px 0 #000) drop-shadow(0 0 22px rgba(255,70,50,.5)); }
#hud-banner .small { font-family:var(--display); color:var(--ink); font-size:16px; letter-spacing:.2em; text-shadow:0 2px 4px #000; }

@media (max-width: 900px) {
  #hud-raid, #hud-help { display:none; }
  #hud-boss { width:calc(100% - 230px); left:10px; transform:none; top:64px; }
  #hud-log { height:150px; }
  #hud-player { bottom:auto; top:auto; }
  #hud-controls { right:10px; top:216px; }
}
@media (max-width: 600px) { #hud-map { transform:scale(.7); transform-origin:top right; } #hud-player { display:none; } #hud-banner .big { font-size:44px; } }
`;

const HTML = `
<div id="hud-crest" class="hud-frame"><span class="hud-title">⚔ LOST AGES</span><span id="hud-status">connecting…</span></div>
<div id="hud-controls" class="hud-frame">
  <button class="hbtn" id="hud-live" title="Watch the fight that's running now">● Live</button>
  <select id="hud-replays" title="Saved replays"><option value="">Saved replays…</option></select>
  <button class="hbtn" id="hud-pause" title="Pause (Space)">❚❚</button>
  <button class="hbtn" id="hud-speed" title="Replay speed">1×</button>
  <button class="hbtn" id="hud-gfx" title="Glow + particles (G)">✨</button>
  <button class="hbtn" id="hud-modelsbtn" title="3D model files (M)">Models</button>
  <a href="/2d" title="Old top-down view">2D</a>
</div>
<div id="hud-boss" class="hud-frame">
  <div class="medal">💀</div>
  <div class="row"><span class="name"></span><span class="phase"></span></div>
  <div class="gbar hp"><div class="f"></div><span></span></div>
  <div class="sub"><div class="gbar cast"><div class="f"></div><span></span></div><span class="aggro"></span></div>
</div>
<div id="hud-raid" class="hud-frame"></div>
<div id="hud-map" class="hud-frame"><canvas width="360" height="360"></canvas><div class="zone"></div><div class="clock"></div></div>
<div id="hud-player" class="hud-frame">
  <div class="medal"></div>
  <div class="top"><span><span class="pname"></span> <span class="pclass"></span></span><span class="hint">click a name to switch</span></div>
  <div class="gbar hp"><div class="f"></div><span></span></div>
  <div class="gbar res"><div class="f"></div><span></span></div>
  <div class="gbar cast"><div class="f"></div><span></span></div>
  <div id="hud-bar"></div>
</div>
<div id="hud-log" class="hud-frame">
  <div class="tabs"><span class="tab on" data-f="all">All</span><span class="tab" data-f="combat">Combat</span><span class="tab" data-f="chat">Chat</span></div>
  <div class="lines"></div>
</div>
<div id="hud-help" class="hud-frame"><b>Drag</b> rotate · <b>Right-drag</b> pan · <b>Scroll</b> zoom · <b>Click a name</b> follow · <b>B</b> boss · <b>N</b> names · <b>G</b> graphics · <b>M</b> models · <b>Space</b> pause</div>
<div id="hud-models" class="hud-frame"></div>
<div id="hud-banner"><div class="big"></div><div class="small"></div></div>
`;

export function createHUD({ classColors, onFollow }) {
  const style = document.createElement("style");
  style.textContent = CSS;
  document.head.appendChild(style);
  const root = document.createElement("div");
  root.innerHTML = HTML;
  document.body.append(...root.children);

  const q = (sel) => document.querySelector(sel);
  const boss = q("#hud-boss"), raid = q("#hud-raid"), player = q("#hud-player"), bar = q("#hud-bar");
  const logBox = q("#hud-log"), lines = q("#hud-log .lines");
  const map = q("#hud-map canvas"), mctx = map.getContext("2d");

  let data = null, frames = [], slots = [], shown = null;
  const usedAt = [];   // usedAt[playerIndex][abilityKey] = fight time it was last used

  // Log tabs
  logBox.querySelectorAll(".tab").forEach(tab => tab.onclick = () => {
    logBox.querySelectorAll(".tab").forEach(t => t.classList.toggle("on", t === tab));
    logBox.classList.remove("f-combat", "f-chat");
    if (tab.dataset.f !== "all") logBox.classList.add("f-" + tab.dataset.f);
    lines.scrollTop = lines.scrollHeight;
  });

  function buildRaid(units) {
    raid.innerHTML = "";
    frames = [];
    units.forEach((u, i) => {
      if (i % 5 === 0) raid.insertAdjacentHTML("beforeend", `<div class="grp">GROUP ${i / 5 + 1}</div>`);
      const el = document.createElement("div");
      el.className = "rf";
      const c = classColors[u.className] || "#ccc";
      const res = RESOURCE_COLOR[data.players[i]?.resource] || "#3a7bff";
      el.innerHTML = `<div class="gbar"><div class="f" style="background:linear-gradient(${c}99, ${c}44)"></div></div>
        <span class="role">${ROLE_ICON[u.role] || ""}</span><span class="nm" style="color:#fff">${esc(u.name)}</span><span class="pc"></span>
        <div class="gbar res"><div class="f" style="background:${res}"></div></div>`;
      el.onclick = () => onFollow(u);
      raid.appendChild(el);
      frames.push({ el, hp: el.querySelector(".gbar .f"), pc: el.querySelector(".pc"), res: el.querySelector(".res .f") });
    });
  }

  // Player frame + action bar for the unit being watched
  function showPlayer(u, i) {
    shown = { u, i };
    const info = data.players[i];
    const c = classColors[u.className] || "#ccc";
    player.querySelector(".medal").textContent = { Knight: "🛡️", Warrior: "🪓", Rogue: "🗡️", Mage: "🔮", Healer: "✚", Druid: "🌿", Necromancer: "💀" }[u.className] || "⚔";
    player.querySelector(".medal").style.background = `radial-gradient(circle at 35% 30%, ${c}66, #0c0d12 72%)`;
    player.querySelector(".pname").textContent = u.name;
    player.querySelector(".pname").style.color = c;
    player.querySelector(".pclass").textContent = `${u.className} · ${u.role}`;
    player.querySelector(".res .f").style.background = `linear-gradient(${RESOURCE_COLOR[info.resource] || "#3a7bff"}, #0d1a44)`;
    bar.innerHTML = "";
    slots = (info.abilities || []).map(([key, name, cd, castTime], n) => {
      const el = document.createElement("div");
      el.className = "slot";
      const col = hex(castColor(key));
      el.style.background = `radial-gradient(circle at 35% 25%, ${col}cc, ${col}33 60%, #0b0c10)`;
      el.title = `${name}${castTime ? ` · ${castTime}s cast` : " · instant"}${cd ? ` · ${cd}s cooldown` : ""}`;
      const icon = ICONS[key];
      el.innerHTML = (icon ? icon : `<span class="ini">${name.split(" ").map(w => w[0]).join("").slice(0, 2)}</span>`) +
        `<span class="key">${KEYS[n] || ""}</span><div class="cd"></div><div class="cdt"></div>`;
      bar.appendChild(el);
      return { key, cd, el, cdt: el.querySelector(".cdt") };
    });
  }

  function setBar(barEl, pct, text) {
    barEl.querySelector(".f").style.width = Math.max(0, Math.min(100, pct * 100)) + "%";
    if (text != null) barEl.querySelector("span").textContent = text;
  }

  const api = {
    reset(d, units) {
      data = d;
      usedAt.length = 0;
      d.players.forEach(() => usedAt.push({}));
      lines.innerHTML = "";
      boss.style.display = "none";
      q("#hud-banner").style.display = "none";
      q("#hud-map .zone").textContent = d.title;
      buildRaid(units);
      if (units.length) showPlayer(units[0], 0);
    },

    // Called for every frame from the simulation
    frame(f, s) {
      if (!data) return;
      // Boss
      if (s.bossUnit) {
        boss.style.display = "block";
        boss.querySelector(".medal").textContent = /Azgaroth|Tyrant/i.test(s.bossUnit.name) ? "🔥" : /Hollow/i.test(s.bossUnit.name) ? "👑" : "💀";
        boss.querySelector(".name").textContent = s.bossUnit.name;
        boss.querySelector(".phase").textContent = f.ph ? `PHASE ${f.ph}` : "";
        boss.querySelector(".phase").style.display = f.ph ? "" : "none";
        setBar(boss.querySelector(".hp"), s.bossUnit.hp, `${(s.bossUnit.hp * 100).toFixed(1)}%`);
        const cast = boss.querySelector(".cast");
        cast.style.display = f.c ? "block" : "none";
        if (f.c) setBar(cast, f.c[1], f.c[0]);
        boss.querySelector(".aggro").innerHTML = s.bossTarget ? `attacking <b>${esc(s.bossTarget.name)}</b>` : "";
      }
      // Raid frames
      s.players.forEach((u, i) => {
        const fr = frames[i];
        if (!fr) return;
        fr.hp.style.width = (u.hp * 100) + "%";
        fr.pc.textContent = u.dead ? "" : Math.round(u.hp * 100) + "%";
        fr.res.style.width = ((u.resourcePct ?? 0) * 100) + "%";
        fr.el.classList.toggle("dead", u.dead);
        fr.el.classList.toggle("aggro", s.bossTarget === u);
        fr.el.classList.toggle("follow", s.follow === u);
      });
      // Player frame: whoever you're following, otherwise the first tank
      const watched = s.follow && s.follow.kind === "p" ? s.follow : s.players[0];
      const wi = s.players.indexOf(watched);
      if (watched && (!shown || shown.u !== watched)) showPlayer(watched, wi);
      if (shown) {
        const u = shown.u, info = data.players[shown.i];
        setBar(player.querySelector(".hp"), u.hp, u.dead ? "DEAD" : `${Math.round(u.hp * 100)}%`);
        setBar(player.querySelector(".res"), u.resourcePct ?? 0, `${info.resource} ${Math.round((u.resourcePct ?? 0) * 100)}%`);
        const cast = player.querySelector(".cast");
        const casting = u.casting && u.casting !== "_cast" ? info.abilities.find(a => a[0] === u.casting) : null;
        cast.style.visibility = casting ? "visible" : "hidden";
        if (casting) setBar(cast, u.castProg, casting[1]);
        const used = usedAt[shown.i] || {};
        for (const sl of slots) {
          const left = sl.cd > 0 && used[sl.key] != null ? sl.cd - (f.t - used[sl.key]) : 0;
          sl.el.classList.toggle("cooling", left > 0);
          sl.el.classList.toggle("casting", u.casting === sl.key);
          if (left > 0) {
            sl.el.style.setProperty("--p", `${(left / sl.cd) * 360}deg`);
            sl.cdt.textContent = left >= 10 ? Math.ceil(left) : left.toFixed(1);
          }
        }
      }
      q("#hud-map .clock").textContent = `${Math.floor(f.t / 60)}:${String(Math.floor(f.t % 60)).padStart(2, "0")}`;
    },

    // A player used an ability (from the simulation's action list)
    abilityUsed(i, key, t) {
      if (!usedAt[i]) return;
      usedAt[i][key] = t;
      if (shown && shown.i === i) {
        const sl = slots.find(x => x.key === key);
        if (sl) { sl.el.classList.remove("flash"); void sl.el.offsetWidth; sl.el.classList.add("flash"); }
      }
    },

    log(time, text, cls = "") {
      if (!cls) cls = /💀|died/.test(text) ? "death" : /✨|revive/i.test(text) ? "rez" : /⚠/.test(text) ? "warn"
        : /^>>>|PHASE|BERSERK/.test(text) ? "boss" : /💬/.test(text) ? "chat" : "";
      const row = document.createElement("div");
      row.className = cls;
      row.innerHTML = (time != null ? `<span class="t">${Math.floor(time / 60)}:${String(Math.floor(time % 60)).padStart(2, "0")}</span>` : "") + esc(text);
      lines.appendChild(row);
      while (lines.children.length > 150) lines.firstChild.remove();
      lines.scrollTop = lines.scrollHeight;
    },

    result(r) {
      if (!r) return;
      const b = q("#hud-banner");
      b.className = r.won ? "win" : "wipe";
      b.querySelector(".big").textContent = r.won ? "VICTORY" : "DEFEAT";
      b.querySelector(".small").textContent = r.won ? `${data?.title || ""} — ${r.time}s` : `The raid has fallen at ${r.time}s`;
      b.style.display = "block";
    },

    status(text) { q("#hud-status").textContent = text; },
    models(html) { q("#hud-models").innerHTML = html; },
    toggleModels() { const m = q("#hud-models"); m.style.display = m.style.display === "block" ? "none" : "block"; q("#hud-modelsbtn").classList.toggle("on"); },
    setReplays(list, selected = "") {
      const sel = q("#hud-replays");
      sel.innerHTML = `<option value="">Saved replays…</option>` + list.map(f => `<option${f === selected ? " selected" : ""}>${esc(f)}</option>`).join("");
    },
    el: (id) => q("#hud-" + id),

    // Top-down minimap — call every rendered frame. s = { players, enemies, pets, zones, zoneColor, follow, camTarget, camAngle }
    drawMinimap(s) {
      const W = map.width, R = W / 2, scale = R / 48;   // shows 48 m around the middle of the arena
      const px = (x) => R + x * scale, py = (y) => R + y * scale;
      mctx.clearRect(0, 0, W, W);
      mctx.save();
      mctx.beginPath(); mctx.arc(R, R, R, 0, Math.PI * 2); mctx.clip();
      const bg = mctx.createRadialGradient(R, R, 10, R, R, R);
      bg.addColorStop(0, s.theme === "fire" ? "#3a1a12" : s.theme === "shadow" ? "#1a1a30" : "#262830");
      bg.addColorStop(1, "#08090c");
      mctx.fillStyle = bg; mctx.fillRect(0, 0, W, W);
      // Arena ring + pillars
      mctx.strokeStyle = "rgba(217,178,95,.25)"; mctx.lineWidth = 2;
      mctx.beginPath(); mctx.arc(R, R, 62 * scale, 0, Math.PI * 2); mctx.stroke();
      mctx.fillStyle = "rgba(200,190,170,.35)";
      for (let i = 0; i < 18; i++) { const a = (i / 18) * Math.PI * 2; mctx.beginPath(); mctx.arc(px(Math.cos(a) * 62), py(Math.sin(a) * 62), 3, 0, Math.PI * 2); mctx.fill(); }
      // Ground effects
      for (const [x, y, r, age, hostile, nameId, warn] of s.zones || []) {
        const col = hex(s.zoneColor(nameId, hostile));
        mctx.fillStyle = col + (age < (warn ?? 0) ? "33" : "77");
        mctx.strokeStyle = col;
        mctx.lineWidth = 1.5;
        mctx.beginPath(); mctx.arc(px(x), py(y), Math.max(2, r * scale), 0, Math.PI * 2); mctx.fill(); mctx.stroke();
      }
      // Camera view cone
      if (s.camTarget) {
        const cx = px(s.camTarget.x), cy = py(s.camTarget.z);
        const g = mctx.createRadialGradient(cx, cy, 0, cx, cy, 70);
        g.addColorStop(0, "rgba(243,220,154,.28)"); g.addColorStop(1, "rgba(243,220,154,0)");
        mctx.fillStyle = g;
        mctx.beginPath(); mctx.moveTo(cx, cy); mctx.arc(cx, cy, 70, s.camAngle - 0.55, s.camAngle + 0.55); mctx.closePath(); mctx.fill();
      }
      const dot = (u, r, fill, stroke) => {
        if (!u || !u.root.visible) return;
        const x = px(u.root.position.x), y = py(u.root.position.z);
        mctx.fillStyle = fill; mctx.strokeStyle = stroke; mctx.lineWidth = 1.5;
        mctx.beginPath(); mctx.arc(x, y, r, 0, Math.PI * 2); mctx.fill(); mctx.stroke();
      };
      for (const u of s.pets || []) if (u) dot(u, 2, "#6fbf3a", "#000");
      for (const u of s.enemies || []) if (u && !u.dead) dot(u, u.isBoss ? 7 : 4, u.isBoss ? "#ff3a2a" : "#d9542c", u.isBoss ? "#ffd27a" : "#000");
      for (const u of s.players || []) {
        if (u.dead) {
          const x = px(u.root.position.x), y = py(u.root.position.z);
          mctx.strokeStyle = "#999"; mctx.lineWidth = 1.5;
          mctx.beginPath(); mctx.moveTo(x - 3, y - 3); mctx.lineTo(x + 3, y + 3); mctx.moveTo(x + 3, y - 3); mctx.lineTo(x - 3, y + 3); mctx.stroke();
        } else dot(u, u === s.follow ? 4.5 : 3.2, classColors[u.className] || "#fff", u === s.follow ? "#fff3c4" : "#000");
      }
      mctx.restore();
      // North marker
      mctx.fillStyle = "#f3dc9a"; mctx.font = "bold 18px Cinzel, serif"; mctx.textAlign = "center";
      mctx.fillText("N", R, 22);
    },
  };
  return api;
}