// effects.js — spell and attack visuals for the 3D viewer (viewer/3d.html).
//
// Every ability has an EFFECT TYPE (what happens) and an ELEMENT (what it's made of):
//
//   TYPES
//   projectile  a bolt flies from the caster to the target and explodes (Fireball, Shadow Bolt)
//   slash       a glowing weapon trail sweeps in front of the attacker, sparks fly off the target
//   nova        a shockwave rolls across the ground (Frost Nova, Challenge, Heat Wave)
//                 styles: "ice" (ice spikes burst up), "rain" (fire rains down), "storm" (lightning
//                 strikes all over), "graves" (the ground erupts), "spin" (a spinning blade storm)
//   whirlwind   the warrior spins: blade trails all around him
//   shout       a roar: rings of force and a flash of rage
//   heal        a glowing sigil under the target, spirals of light rising around them
//   shield      a shimmering bubble pops up around the target
//   pillar      a column of light from the sky (Resurrection, Redemption)
//   beam        an energy beam between caster and target (Soul Drain, taunts); storm beams are lightning
//   cone        breath (fire / lightning pouring out) or, with style "sweep", a huge cleaving arc
//   strike      something hits the target from above: lightning, a shaft of light, a fire eruption...
//   meteor      a burning rock falls from the sky and explodes (count: 5 for a swarm)
//   poof        smoke / a flash on the caster (Stealth, Vanish, Blink, transformations)
//
//   ELEMENTS   holy · fire · frost · arcane · shadow · nature · storm · blood · physical · smoke · bone · earth
//   (worked out from the colour if you don't say — but you can set it: el: "storm")
//
// To give a NEW ability a look, just add a line here, e.g.
//   lightningBolt: { type: "projectile", el: "storm", size: 0.3, speed: 40 },
// Abilities not listed fall back to a slash (melee range) or a projectile (ranged).

import * as THREE from "three";

export const COLORS = {
  physical: 0xe8e8e8, holy: 0xffd966, fire: 0xff6a1a, frost: 0x7fd4ff, arcane: 0xc77dff,
  shadow: 0x9b5cff, blood: 0xff3344, nature: 0x7dff6a, smoke: 0x333344, storm: 0x9fdcff,
  bone: 0xe8e0c8, earth: 0x9a7a4a,
};
const C = COLORS;

export const EFFECTS = {
  // ---------- Knight ----------
  righteousStrike: { type: "slash", color: C.holy, big: true },
  shieldOfValor:   { type: "shield", color: C.holy, onSelf: true, also: [{ type: "nova", color: C.holy, radius: 8 }] },   // the shield slams out in a ring
  divineTaunt:     { type: "beam", color: C.holy },
  challenge:       { type: "shout", color: C.holy, radius: 12 },
  holyTouch:       { type: "heal", color: C.holy, big: true, also: [{ type: "strike", color: C.holy, el: "holy" }] },   // light bursts out of whoever you healed
  holyGrounds:     { type: "consecrate", color: C.holy },   // the big effect is the zone itself (3d.html → HOLY GROUNDS)
  judgment:        { type: "strike", color: C.holy },
  sonOfLight:      { type: "shield", color: 0xfff2b0, el: "holy", onSelf: true, big: true, pillar: true, also: [{ type: "nova", color: C.holy, radius: 10 }] },
  redemption:      { type: "pillar", color: C.holy },
  sanctifiedAura:  { type: "nova", color: C.holy, radius: 10, pillar: true },   // the aura flaring up

  // ---------- Healer ----------
  flashHeal:       { type: "heal", color: C.holy },
  greaterHeal:     { type: "heal", color: C.holy, big: true },
  renew:           { type: "heal", color: 0xc8ff9a, el: "nature" },
  holyWard:        { type: "shield", color: C.holy },
  smite:           { type: "strike", color: C.holy },
  prayerOfMending: { type: "nova", color: C.holy, radius: 30 },
  purify:          { type: "heal", color: 0xfff8e0, el: "holy" },
  divineHymn:      { type: "nova", color: C.holy, radius: 40, pillar: true },
  resurrection:    { type: "pillar", color: C.holy, big: true },

  // ---------- Mage ----------
  fireball:        { type: "projectile", color: C.fire, size: 0.4, speed: 28 },
  frostBolt:       { type: "projectile", color: C.frost, el: "frost", size: 0.32, speed: 26 },
  fireBlast:       { type: "strike", color: C.fire },
  frostNova:       { type: "nova", color: C.frost, el: "frost", radius: 8, style: "ice" },
  blink:           { type: "poof", color: C.arcane, onSelf: true },
  warpStrike:      { type: "warp", color: 0x5ab8ff, el: "frost" },   // throw your weapon, appear where it lands
  counterspell:    { type: "beam", color: C.arcane },
  manaShield:      { type: "shield", color: C.arcane, onSelf: true },
  meteor:          { type: "meteor", color: C.fire },

  // ---------- Rogue ----------
  stealth:         { type: "poof", color: C.smoke, onSelf: true },
  ambush:          { type: "slash", color: C.blood, big: true },
  sinisterStrike:  { type: "slash", color: C.physical },
  eviscerate:      { type: "slash", color: C.blood, big: true, double: true },
  kick:            { type: "slash", color: C.physical, small: true },
  evasion:         { type: "shield", color: 0xaaaaaa, el: "smoke", onSelf: true },
  vanish:          { type: "poof", color: C.smoke, onSelf: true, big: true },
  deathMark:       { type: "beam", color: C.blood },

  // ---------- Warrior ----------
  charge:          { type: "poof", color: 0xbb9966, el: "earth", onSelf: true },
  heroicStrike:    { type: "slash", color: C.physical },
  mortalStrike:    { type: "slash", color: C.blood, big: true, chop: true },
  whirlwind:       { type: "whirlwind", color: C.physical, radius: 8 },
  execute:         { type: "slash", color: C.blood, big: true, chop: true },
  pummel:          { type: "slash", color: C.physical, small: true },
  battleShout:     { type: "shout", color: C.blood, radius: 20 },
  recklessness:    { type: "shield", color: C.blood, onSelf: true },

  // ---------- Druid ----------
  wrath:           { type: "projectile", color: C.nature, size: 0.32, speed: 28 },
  moonfire:        { type: "strike", color: 0xb8c8ff, el: "arcane" },
  starsurge:       { type: "projectile", color: C.arcane, size: 0.55, speed: 24 },
  rejuvenation:    { type: "heal", color: C.nature },
  regrowth:        { type: "heal", color: C.nature, big: true },
  tranquility:     { type: "nova", color: C.nature, radius: 40, pillar: true },
  removeCorruption:{ type: "heal", color: 0xf0fff0, el: "nature" },
  innervate:       { type: "beam", color: C.frost, el: "arcane" },
  markOfTheWild:   { type: "nova", color: C.nature, radius: 40 },
  barkskin:        { type: "shield", color: 0x9a7a4a, el: "earth", onSelf: true },

  // ---------- Necromancer ----------
  reaperForm:      { type: "poof", color: C.shadow, onSelf: true, big: true },
  deathcallerForm: { type: "poof", color: C.nature, el: "nature", onSelf: true, big: true },
  deathBolt:       { type: "projectile", color: C.shadow, size: 0.38, speed: 26 },
  plague:          { type: "strike", color: C.nature },
  reap:            { type: "slash", color: C.shadow, big: true },
  soulCleave:      { type: "nova", color: C.shadow, radius: 8, style: "spin" },
  raiseCorrupted:  { type: "nova", color: C.nature, radius: 5, style: "graves" },
  boneShield:      { type: "shield", color: 0xe8e0c8, el: "bone", onSelf: true },

  // ---------- Valkyrie ----------
  valkyriesCall:   { type: "beam", color: 0x9fe7ff, el: "storm" },
  aegisOfValhalla: { type: "shield", color: 0xbfe9ff, el: "frost", onSelf: true, big: true },
  skyLance:        { type: "slash", color: 0xdff6ff, el: "storm", thrust: true },
  divingStrike:    { type: "strike", color: 0x9fe7ff, el: "storm", big: true },
  stormGallop:     { type: "nova", color: 0x9fe7ff, el: "storm", radius: 8 },
  thunderLance:    { type: "strike", color: 0x7fd4ff, el: "storm", big: true },
  wingedSlash:     { type: "slash", color: 0xfff2c8, el: "holy" },
  heavensFall:     { type: "strike", color: C.holy, big: true, radius: 6 },
  soulspear:       { type: "projectile", color: C.holy, size: 0.4, speed: 40, spear: true },
  wingGuard:       { type: "shield", color: 0xfff6dc, el: "holy", onSelf: true },

  // ---------- Vorathyx, the Storm Sovereign ----------
  thunderclaw:     { type: "slash", color: 0x7fd4ff, el: "storm", big: true },
  lightningBreath: { type: "cone", color: 0x8fdcff, el: "storm", length: 14, angle: 1.1 },
  cyclone:         { type: "poof", color: 0x9fc8ff, el: "storm", onSelf: true, swirl: true },
  thunderstorm:    { type: "nova", color: 0x7fb4ff, el: "storm", radius: 12, style: "storm" },
  stormCall:       { type: "strike", color: 0xbfe8ff, el: "storm", big: true },
  chainLightning:  { type: "beam", color: 0xcff4ff, el: "storm" },
  ionSurge:        { type: "strike", color: 0x9f8cff, el: "storm" },
  recharge:        { type: "pillar", color: 0x7fd4ff, el: "storm", onSelf: true },
  tempest:         { type: "nova", color: 0x9fd8ff, el: "storm", radius: 60 },
  staticField:     { type: "nova", color: 0x7fe0ff, el: "storm", radius: 60 },
  summonStormlings:{ type: "nova", color: 0x7fd4ff, el: "storm", radius: 15, style: "storm" },
  skyborne:        { type: "nova", color: 0xffffff, el: "storm", radius: 14 },

  // ---------- The Hollow King ----------
  soulEruption:    { type: "poof", color: C.shadow, onSelf: true },   // the eruption itself is the purple circle on the ground
  shadowBolt:      { type: "projectile", color: C.shadow, size: 0.65, speed: 22 },
  cleave:          { type: "cone", color: C.shadow, length: 8, angle: 1.6, style: "sweep" },
  raiseDead:       { type: "nova", color: C.shadow, radius: 15, style: "graves" },
  soulDrain:       { type: "beam", color: C.shadow, drain: true },
  crushingBlow:    { type: "slash", color: C.shadow, big: true, chop: true },
  shadowNova:      { type: "nova", color: C.shadow, radius: 60 },
  deathGrip:       { type: "beam", color: C.shadow, pull: true },
  doom:            { type: "strike", color: C.shadow, big: true },

  // ---------- Azgaroth, the Ashen Tyrant ----------
  moltenBrand:     { type: "strike", color: C.fire },
  flameBreath:     { type: "cone", color: C.fire, length: 13, angle: 1.2 },
  infernoRift:     { type: "poof", color: C.fire, onSelf: true, big: true },
  rainOfFire:      { type: "nova", color: C.fire, radius: 10, style: "rain" },
  pyroclasm:       { type: "strike", color: C.fire, big: true },
  meteorSwarm:     { type: "meteor", color: C.fire, count: 5 },
  cataclysm:       { type: "nova", color: C.fire, radius: 60 },
  summonElementals:{ type: "nova", color: C.fire, radius: 15, style: "graves" },
  rekindle:        { type: "pillar", color: C.fire, onSelf: true },
  heatWave:        { type: "nova", color: 0xff9944, el: "fire", radius: 60 },
};

// Pick the effect for an ability. `_swing` is a normal auto-attack.
export function effectFor(key, distance) {
  if (key === "_swing") {
    return distance > 6
      ? { type: "projectile", color: 0xd8c8a0, el: "physical", size: 0.12, speed: 40, arrow: true }   // bow / ranged mob
      : { type: "slash", color: C.physical, small: true };
  }
  return EFFECTS[key] || (distance > 6
    ? { type: "projectile", color: C.physical, size: 0.25, speed: 30 }
    : { type: "slash", color: C.physical });
}

// Cast-bar colour for the glowing orb in a caster's hands
export function castColor(key) {
  return EFFECTS[key]?.color ?? C.arcane;
}

// =====================================================================
//  ELEMENTS — the colours and the "stuff" each kind of magic is made of
// =====================================================================
const ELEMENTS = {
  holy:     { core: 0xfffbe8, main: 0xffd966, deep: 0xffa424, light: 0xffd27a },
  fire:     { core: 0xfff0b8, main: 0xff7a1a, deep: 0xb8240a, light: 0xff7a2a, smoke: 0x2a2220 },
  frost:    { core: 0xf4fdff, main: 0x8fdcff, deep: 0x2f7fd8, light: 0x8fd0ff },
  arcane:   { core: 0xfbefff, main: 0xc77dff, deep: 0x5a22c8, light: 0xc080ff },
  shadow:   { core: 0xe6d6ff, main: 0x9b5cff, deep: 0x2a0a4a, light: 0x8a4cff, smoke: 0x2a1240 },
  nature:   { core: 0xf2ffe0, main: 0x7dff6a, deep: 0x2f9a2a, light: 0x8aff7a, smoke: 0x1c3a14 },
  storm:    { core: 0xffffff, main: 0x9fdcff, deep: 0x3a7cff, light: 0xa8dcff },
  blood:    { core: 0xffe0e0, main: 0xff3344, deep: 0x8a0010, light: 0xff4040, smoke: 0x2a0606 },
  physical: { core: 0xffffff, main: 0xe8e8e8, deep: 0x9a9a9a, light: 0xfff0d8, smoke: 0x6a5e50 },
  smoke:    { core: 0xb0b0c0, main: 0x6a6a7a, deep: 0x2a2a36, light: null, smoke: 0x6a6a78 },
  bone:     { core: 0xffffff, main: 0xe8e0c8, deep: 0x9a8a6a, light: 0xfff0d0, smoke: 0x5a5448 },
  earth:    { core: 0xf0e0b8, main: 0x9a7a4a, deep: 0x4a3418, light: null, smoke: 0x6a5a40 },
};
const KNOWN = new Map([[C.holy, "holy"], [C.fire, "fire"], [C.frost, "frost"], [C.arcane, "arcane"], [C.shadow, "shadow"],
  [C.blood, "blood"], [C.nature, "nature"], [C.smoke, "smoke"], [C.physical, "physical"], [C.storm, "storm"], [C.bone, "bone"], [C.earth, "earth"]]);
const _hsl = {};
function elementOf(spec) {
  if (spec.el && ELEMENTS[spec.el]) return spec.el;
  if (KNOWN.has(spec.color)) return KNOWN.get(spec.color);
  new THREE.Color(spec.color ?? 0xffffff).getHSL(_hsl);
  const { h, s, l } = _hsl;
  if (s < 0.2) return l < 0.35 ? "smoke" : "physical";
  if (h < 0.03 || h > 0.95) return "blood";
  if (h < 0.11) return "fire";
  if (h < 0.19) return "holy";
  if (h < 0.45) return "nature";
  if (h < 0.62) return "frost";
  if (h < 0.76) return "arcane";
  return "shadow";
}
function paletteFor(spec) {
  const el = elementOf(spec);
  const base = ELEMENTS[el];
  return { el, ...base, main: spec.color ?? base.main };
}
// The colours of an element (3d.html uses these for the boss danger zones)
export const paletteOf = (el, color) => paletteFor({ el, color });

// =====================================================================
//  TEXTURES (drawn once)
// =====================================================================
function canvasTex(size, draw) {
  const c = document.createElement("canvas"); c.width = c.height = size;
  const g = c.getContext("2d");
  draw(g, size);
  const t = new THREE.CanvasTexture(c);
  t.needsUpdate = true;
  return t;
}
let _seed = 1;
const rnd = () => (_seed = (_seed * 16807) % 2147483647) / 2147483647;
const radial = (g, S, stops) => {
  const grd = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  stops.forEach(([o, a]) => grd.addColorStop(o, `rgba(255,255,255,${a})`));
  g.fillStyle = grd; g.fillRect(0, 0, S, S);
};
const TEX = {
  glow: canvasTex(64, (g, S) => radial(g, S, [[0, 1], [0.25, 0.7], [0.6, 0.18], [1, 0]])),
  spark: canvasTex(64, (g, S) => {
    radial(g, S, [[0, 1], [0.15, 0.75], [0.4, 0.12], [1, 0]]);
    g.globalCompositeOperation = "lighter";
    for (const [w, h] of [[S * 0.7, 2], [2, S * 0.7]]) {
      const grd = w > h ? g.createLinearGradient((S - w) / 2, 0, (S + w) / 2, 0) : g.createLinearGradient(0, (S - h) / 2, 0, (S + h) / 2);
      grd.addColorStop(0, "rgba(255,255,255,0)"); grd.addColorStop(0.5, "rgba(255,255,255,.7)"); grd.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = grd; g.fillRect((S - w) / 2, (S - h) / 2, w, h);
    }
  }),
  smoke: canvasTex(128, (g, S) => {
    _seed = 3;
    radial(g, S, [[0, 0.55], [0.5, 0.25], [0.8, 0]]);
    for (let i = 0; i < 30; i++) {   // lumpy billows, all kept well inside the edge
      const a = rnd() * Math.PI * 2, d = rnd() * S * 0.18, r = S * (0.1 + rnd() * 0.16);
      const x = S / 2 + Math.cos(a) * d, y = S / 2 + Math.sin(a) * d;
      const grd = g.createRadialGradient(x, y, 0, x, y, r);
      grd.addColorStop(0, `rgba(255,255,255,${0.18 + rnd() * 0.16})`); grd.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = grd; g.fillRect(0, 0, S, S);
    }
    g.globalCompositeOperation = "destination-in";   // round off: nothing reaches the square's edge
    radial(g, S, [[0, 1], [0.7, 1], [0.98, 0]]);
  }),
  shard: canvasTex(64, (g, S) => {
    g.fillStyle = "#fff"; g.shadowColor = "#fff"; g.shadowBlur = 6;
    g.beginPath(); g.moveTo(S / 2, 4); g.lineTo(S / 2 + 9, S / 2); g.lineTo(S / 2, S - 4); g.lineTo(S / 2 - 9, S / 2); g.closePath(); g.fill();
  }),
  leaf: canvasTex(64, (g, S) => {
    g.fillStyle = "#fff";
    g.beginPath(); g.moveTo(S / 2, 6); g.quadraticCurveTo(S - 10, S / 2, S / 2, S - 6); g.quadraticCurveTo(10, S / 2, S / 2, 6); g.fill();
    g.strokeStyle = "rgba(0,0,0,.35)"; g.lineWidth = 2; g.beginPath(); g.moveTo(S / 2, 10); g.lineTo(S / 2, S - 10); g.stroke();
  }),
  feather: canvasTex(64, (g, S) => {
    g.fillStyle = "#fff";
    g.beginPath(); g.moveTo(S / 2, 3); g.quadraticCurveTo(S / 2 + 13, S / 2, S / 2 + 2, S - 10); g.lineTo(S / 2 - 2, S - 10); g.quadraticCurveTo(S / 2 - 13, S / 2, S / 2, 3); g.fill();
    g.fillRect(S / 2 - 1, S - 12, 2, 10);
  }),
  // a soft ring (shockwaves)
  ring: canvasTex(256, (g, S) => radial(g, S, [[0, 0], [0.55, 0], [0.82, 0.25], [0.93, 1], [0.97, 0.6], [1, 0]])),
  // a filled glow (ground flashes)
  disc: canvasTex(128, (g, S) => radial(g, S, [[0, 1], [0.4, 0.55], [1, 0]])),
  // a scorch mark on the floor
  scorch: canvasTex(256, (g, S) => {
    _seed = 9;
    radial(g, S, [[0, 0.95], [0.45, 0.75], [0.8, 0.25], [1, 0]]);
    g.globalCompositeOperation = "destination-out";
    for (let i = 0; i < 40; i++) {
      const a = rnd() * Math.PI * 2, d = S * (0.3 + rnd() * 0.2), r = S * (0.03 + rnd() * 0.08);
      const x = S / 2 + Math.cos(a) * d, y = S / 2 + Math.sin(a) * d;
      const grd = g.createRadialGradient(x, y, 0, x, y, r);
      grd.addColorStop(0, "rgba(0,0,0,.8)"); grd.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = grd; g.fillRect(0, 0, S, S);
    }
  }),
  // a magic circle (heals, pillars, blinks)
  sigil: canvasTex(512, (g, S) => {
    g.translate(S / 2, S / 2);
    g.strokeStyle = g.fillStyle = "#fff"; g.lineCap = "round"; g.shadowColor = "#fff"; g.shadowBlur = 10;
    const ring = (r, w) => { g.lineWidth = w; g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.stroke(); };
    ring(246, 6); ring(232, 2); ring(170, 3); ring(90, 4);
    for (let i = 0; i < 6; i++) {   // a hexagram
      const a = i / 6 * Math.PI * 2, b = (i + 2) / 6 * Math.PI * 2;
      g.lineWidth = 3; g.beginPath(); g.moveTo(Math.sin(a) * 170, -Math.cos(a) * 170); g.lineTo(Math.sin(b) * 170, -Math.cos(b) * 170); g.stroke();
    }
    for (let i = 0; i < 48; i++) {
      g.save(); g.rotate(i / 48 * Math.PI * 2);
      g.lineWidth = i % 4 ? 2 : 4; g.beginPath(); g.moveTo(0, -176); g.lineTo(0, i % 4 ? -192 : -226); g.stroke();
      g.restore();
    }
    for (let i = 0; i < 12; i++) { g.save(); g.rotate(i / 12 * Math.PI * 2); g.beginPath(); g.arc(0, -205, 6, 0, Math.PI * 2); g.fill(); g.restore(); }
  }),
  // vertical fade: bright at the bottom (walls of light, shockwave walls)
  wall: canvasTex(64, (g, S) => {
    const grd = g.createLinearGradient(0, S, 0, 0);
    grd.addColorStop(0, "rgba(255,255,255,1)"); grd.addColorStop(0.35, "rgba(255,255,255,.4)"); grd.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grd; g.fillRect(0, 0, S, S);
  }),
  // glowing cracks for the meteor rock
  lava: (() => {
    const t = canvasTex(256, (g, S) => {
      _seed = 21;
      g.fillStyle = "#000"; g.fillRect(0, 0, S, S);
      g.strokeStyle = "#ffb040"; g.shadowColor = "#ff6010"; g.shadowBlur = 8;
      for (let i = 0; i < 26; i++) {
        let x = rnd() * S, y = rnd() * S; g.lineWidth = 1 + rnd() * 3; g.beginPath(); g.moveTo(x, y);
        for (let k = 0; k < 5; k++) { x += (rnd() - 0.5) * 60; y += (rnd() - 0.5) * 60; g.lineTo(x, y); }
        g.stroke();
      }
    });
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })(),
};
const GEO = {
  plane: new THREE.PlaneGeometry(2, 2),
  tube: new THREE.CylinderGeometry(1, 1, 1, 24, 1, true).translate(0, 0.5, 0),
  sphere: new THREE.SphereGeometry(1, 32, 20),
  rock: (() => {
    const g = new THREE.IcosahedronGeometry(1, 2);
    const p = g.attributes.position;
    _seed = 33;
    for (let i = 0; i < p.count; i++) {
      const v = new THREE.Vector3().fromBufferAttribute(p, i);
      v.multiplyScalar(0.78 + Math.sin(v.x * 4.1) * 0.08 + Math.cos(v.y * 3.7 + v.z * 2) * 0.08 + rnd() * 0.1);
      p.setXYZ(i, v.x, v.y, v.z);
    }
    g.computeVertexNormals();
    return g;
  })(),
  chunk: new THREE.DodecahedronGeometry(1, 0),
  spike: new THREE.ConeGeometry(1, 1, 5, 1).translate(0, 0.5, 0),
  boneBit: new THREE.CapsuleGeometry(0.05, 0.28, 3, 6),
};

// =====================================================================
//  SHADERS
// =====================================================================
const COLORSPACE = "#include <colorspace_fragment>";
// Particles: soft sprites with their own size, colour, fade and spin
const PARTICLE_VS = `
attribute float aSize; attribute float aAlpha; attribute float aRot;
varying vec3 vColor; varying float vAlpha; varying float vRot;
uniform float uViewH;
void main() {
  vColor = color; vAlpha = aAlpha; vRot = aRot;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = aAlpha <= 0.0 ? 0.0 : aSize * projectionMatrix[1][1] * uViewH * 0.5 / max(0.2, -mv.z);
}`;
const PARTICLE_FS = `
uniform sampler2D map;
varying vec3 vColor; varying float vAlpha; varying float vRot;
void main() {
  vec2 p = gl_PointCoord - 0.5;
  float c = cos(vRot), s = sin(vRot);
  p = mat2(c, -s, s, c) * p + 0.5;
  vec4 t = texture2D(map, p);
  float a = t.a * vAlpha;
  if (a < 0.004) discard;
  gl_FragColor = vec4(vColor * t.rgb, a);
  ${COLORSPACE}
}`;
// Weapon trails: bright along the blade's edge, fading toward the tail
const SLASH_VS = `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const SLASH_FS = `
uniform vec3 uColor; uniform vec3 uCore; uniform float uHead; uniform float uTail; uniform float uOpacity;
varying vec2 vUv;
void main() {
  float u = vUv.x, v = vUv.y;
  if (u > uHead || u < uHead - uTail) discard;
  float along = smoothstep(uHead - uTail, uHead, u);
  float edge = pow(v, 4.0);
  float body = smoothstep(0.0, 0.9, v) * 0.55;
  float a = (edge * 1.3 + body) * along * uOpacity;
  vec3 col = mix(uColor, uCore, clamp(edge * along * 1.2, 0.0, 1.0));
  gl_FragColor = vec4(col, a);
  ${COLORSPACE}
}`;
// Energy beams / lightning: a bright core with a soft glow, flowing along its length
const BEAM_VS = SLASH_VS;
const BEAM_FS = `
uniform vec3 uColor; uniform vec3 uCore; uniform float uOpacity; uniform float uTime; uniform float uLen; uniform float uFlow; uniform float uNoise;
varying vec2 vUv;
float h(float x) { return fract(sin(x * 12.9898) * 43758.5453); }
float n1(float x) { float i = floor(x), f = fract(x); return mix(h(i), h(i + 1.0), f * f * (3.0 - 2.0 * f)); }
void main() {
  float across = 1.0 - abs(vUv.y * 2.0 - 1.0);
  float core = pow(across, 7.0);
  float glow = pow(across, 1.8);
  float x = vUv.x * uLen;
  float flow = mix(1.0, 0.35 + 1.1 * n1(x * 1.7 - uTime * uFlow) * n1(x * 0.6 + uTime * 2.0), uNoise);
  float ends = smoothstep(0.0, 0.03, vUv.x) * smoothstep(1.0, 0.97, vUv.x);
  float a = (glow * 0.75 * flow + core * 1.2) * uOpacity * mix(1.0, ends, 0.6);
  gl_FragColor = vec4(mix(uColor, uCore, clamp(core * 1.5, 0.0, 1.0)), a);
  ${COLORSPACE}
}`;
// Shields: a bubble that glows at its edges, with a faint pattern and a light scanning over it
const SHIELD_VS = `
varying vec3 vN; varying vec3 vV; varying vec2 vUv;
void main() {
  vUv = uv;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;
const SHIELD_FS = `
uniform vec3 uColor; uniform vec3 uCore; uniform float uOpacity; uniform float uScan; uniform float uPattern; uniform float uTime;
varying vec3 vN; varying vec3 vV; varying vec2 vUv;
void main() {
  float rim = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.4);
  vec2 g = vec2(vUv.x * 30.0, vUv.y * 15.0);
  vec2 f = vec2(fract(g.x), fract(g.y + floor(g.x) * 0.5));
  float cell = smoothstep(0.40, 0.48, max(abs(f.x - 0.5), abs(f.y - 0.5)));
  float scan = smoothstep(0.07, 0.0, abs(vUv.y - uScan));
  float shimmer = 0.85 + 0.15 * sin(vUv.y * 40.0 + uTime * 6.0);
  float a = (rim * 1.15 + 0.05 + cell * uPattern * (0.1 + rim * 0.5) + scan * 0.45) * uOpacity * shimmer;
  gl_FragColor = vec4(mix(uColor, uCore, clamp(rim * 0.5 + scan, 0.0, 1.0)), a);
  ${COLORSPACE}
}`;
// Columns of light: brightest facing you, fading at the top, light streaming down through them
const COLUMN_FS = `
uniform vec3 uColor; uniform vec3 uCore; uniform float uOpacity; uniform float uTime;
varying vec3 vN; varying vec3 vV; varying vec2 vUv;
float h(float x) { return fract(sin(x * 12.9898) * 43758.5453); }
float n1(float x) { float i = floor(x), f = fract(x); return mix(h(i), h(i + 1.0), f * f * (3.0 - 2.0 * f)); }
void main() {
  float facing = abs(dot(normalize(vN), normalize(vV)));
  float body = pow(facing, 1.6);
  float vfade = smoothstep(0.0, 0.04, vUv.y) * (1.0 - smoothstep(0.35, 1.0, vUv.y));
  float streak = 0.55 + 0.6 * n1(vUv.x * 26.0) * n1(vUv.y * 5.0 + uTime * 4.0 + vUv.x * 9.0);
  float a = body * vfade * streak * uOpacity;
  gl_FragColor = vec4(mix(uColor, uCore, pow(facing, 6.0)), a);
  ${COLORSPACE}
}`;

const additive = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending };
function spriteMat(color, map = TEX.glow, opacity = 1, normal = false) {
  return new THREE.SpriteMaterial({ map, color, opacity, transparent: true, depthWrite: false, blending: normal ? THREE.NormalBlending : THREE.AdditiveBlending });
}
function flatMat(map, color, opacity = 1, normal = false) {
  return new THREE.MeshBasicMaterial({ map, color, opacity, transparent: true, depthWrite: false, blending: normal ? THREE.NormalBlending : THREE.AdditiveBlending, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 });
}
const col3 = (hex) => new THREE.Color(hex);

// =====================================================================
//  PARTICLES — thousands of soft sprites (flames, smoke, sparks, shards, leaves...)
// =====================================================================
class ParticleSystem {
  constructor(scene, map, { max = 2000, normal = false, order = 0 } = {}) {
    this.max = max; this.next = 0; this.alive = 0;
    const f = (n) => new Float32Array(max * n);
    this.pos = f(3); this.col = f(3); this.alpha = f(1); this.size = f(1); this.rot = f(1);
    this.vel = f(3); this.c0 = f(3); this.c1 = f(3); this.life = f(1); this.maxLife = f(1);
    this.drag = f(1); this.grav = f(1); this.s0 = f(1); this.s1 = f(1); this.a0 = f(1); this.spin = f(1);
    this.pos.fill(-9999);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(this.col, 3));
    geo.setAttribute("aAlpha", new THREE.BufferAttribute(this.alpha, 1));
    geo.setAttribute("aSize", new THREE.BufferAttribute(this.size, 1));
    geo.setAttribute("aRot", new THREE.BufferAttribute(this.rot, 1));
    for (const k of ["position", "color", "aAlpha", "aSize", "aRot"]) geo.attributes[k].setUsage(THREE.DynamicDrawUsage);
    this.uniforms = { map: { value: map }, uViewH: { value: 800 } };
    this.points = new THREE.Points(geo, new THREE.ShaderMaterial({
      uniforms: this.uniforms, vertexShader: PARTICLE_VS, fragmentShader: PARTICLE_FS, vertexColors: true,
      transparent: true, depthWrite: false, blending: normal ? THREE.NormalBlending : THREE.AdditiveBlending,
    }));
    this.points.frustumCulled = false;
    this.points.renderOrder = order;
    scene.add(this.points);
    this.tc = new THREE.Color();
  }
  // o: { p (Vector3-like) | x,y,z, vx,vy,vz, life, size, size1, color, color1, alpha, drag, grav (+ = falls), spin }
  spawn(x, y, z, vx, vy, vz, o) {
    const i = this.next; this.next = (this.next + 1) % this.max;
    const k = i * 3;
    this.pos[k] = x; this.pos[k + 1] = y; this.pos[k + 2] = z;
    this.vel[k] = vx; this.vel[k + 1] = vy; this.vel[k + 2] = vz;
    this.tc.setHex(o.color ?? 0xffffff); this.c0[k] = this.tc.r; this.c0[k + 1] = this.tc.g; this.c0[k + 2] = this.tc.b;
    if (o.color1 != null) this.tc.setHex(o.color1);
    this.c1[k] = this.tc.r; this.c1[k + 1] = this.tc.g; this.c1[k + 2] = this.tc.b;
    this.life[i] = this.maxLife[i] = o.life ?? 0.6;
    this.s0[i] = o.size ?? 0.3; this.s1[i] = o.size1 ?? this.s0[i];
    this.a0[i] = o.alpha ?? 1; this.drag[i] = o.drag ?? 1; this.grav[i] = o.grav ?? 0;
    this.spin[i] = o.spin ?? 0; this.rot[i] = Math.random() * Math.PI * 2;
    this.alpha[i] = 0;
  }
  update(dt, viewH) {
    this.uniforms.uViewH.value = viewH;
    let alive = 0;
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      const k = i * 3;
      if (this.life[i] <= 0) { this.alpha[i] = 0; this.pos[k + 1] = -9999; continue; }
      alive++;
      const d = Math.max(0, 1 - this.drag[i] * dt);
      this.vel[k] *= d; this.vel[k + 1] = this.vel[k + 1] * d - this.grav[i] * dt; this.vel[k + 2] *= d;
      this.pos[k] += this.vel[k] * dt; this.pos[k + 1] += this.vel[k + 1] * dt; this.pos[k + 2] += this.vel[k + 2] * dt;
      if (this.pos[k + 1] < 0.02 && this.grav[i] > 0) { this.pos[k + 1] = 0.02; this.vel[k + 1] *= -0.3; this.vel[k] *= 0.6; this.vel[k + 2] *= 0.6; }
      const t = 1 - this.life[i] / this.maxLife[i];            // 0 → 1 over its life
      this.alpha[i] = this.a0[i] * Math.min(1, t * 12) * (1 - t);
      this.size[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * (1 - (1 - t) * (1 - t));
      this.rot[i] += this.spin[i] * dt;
      this.col[k] = this.c0[k] + (this.c1[k] - this.c0[k]) * t;
      this.col[k + 1] = this.c0[k + 1] + (this.c1[k + 1] - this.c0[k + 1]) * t;
      this.col[k + 2] = this.c0[k + 2] + (this.c1[k + 2] - this.c0[k + 2]) * t;
    }
    this.alive = alive;
    const a = this.points.geometry.attributes;
    a.position.needsUpdate = a.color.needsUpdate = a.aAlpha.needsUpdate = a.aSize.needsUpdate = a.aRot.needsUpdate = true;
  }
  clear() { this.life.fill(0); this.alpha.fill(0); this.pos.fill(-9999); }
}

// Where on a unit effects should aim
function chest(u, out = new THREE.Vector3()) {
  return out.copy(u.root.position).setY(u.root.position.y + u.height * 0.55);
}
const feet = (u, out = new THREE.Vector3()) => out.copy(u.root.position).setY(Math.max(0, u.root.position.y));
const ease = (k) => 1 - Math.pow(1 - Math.min(1, Math.max(0, k)), 3);
const rand = (a, b) => a + Math.random() * (b - a);
const UP = new THREE.Vector3(0, 1, 0);

// A ribbon along a path, made of two crossed strips so it looks solid from any side
function ribbonGeometry(points, width, geo) {
  const n = points.length;
  const pos = new Float32Array(n * 4 * 3), uv = new Float32Array(n * 4 * 2), idx = [];
  const dir = new THREE.Vector3(), s1 = new THREE.Vector3(), s2 = new THREE.Vector3();
  let along = 0;
  const total = points.reduce((acc, p, i) => acc + (i ? p.distanceTo(points[i - 1]) : 0), 0) || 1;
  for (let i = 0; i < n; i++) {
    const a = points[Math.max(0, i - 1)], b = points[Math.min(n - 1, i + 1)];
    dir.subVectors(b, a).normalize();
    s1.crossVectors(dir, Math.abs(dir.y) > 0.95 ? new THREE.Vector3(1, 0, 0) : UP).normalize();
    s2.crossVectors(dir, s1).normalize();
    if (i) along += points[i].distanceTo(points[i - 1]);
    const w = (Array.isArray(width) ? width[i] : width) / 2, u = along / total, p = points[i];
    const vs = [[s1, -w], [s1, w], [s2, -w], [s2, w]];
    vs.forEach(([s, ww], j) => {
      pos.set([p.x + s.x * ww, p.y + s.y * ww, p.z + s.z * ww], (i * 4 + j) * 3);
      uv.set([u, j % 2], (i * 4 + j) * 2);
    });
    if (i < n - 1) for (const o of [0, 2]) {
      const q = i * 4 + o, r = (i + 1) * 4 + o;
      idx.push(q, q + 1, r, q + 1, r + 1, r);
    }
  }
  geo = geo || new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  return geo;
}
// A jagged lightning path from a to b
function boltPath(a, b, jag = 0.3, depth = 5) {
  let pts = [a.clone(), b.clone()];
  let off = a.distanceTo(b) * jag;
  for (let d = 0; d < depth; d++) {
    const next = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      const m = pts[i - 1].clone().add(pts[i]).multiplyScalar(0.5);
      m.x += (Math.random() - 0.5) * off; m.y += (Math.random() - 0.5) * off * 0.6; m.z += (Math.random() - 0.5) * off;
      next.push(m, pts[i]);
    }
    pts = next; off *= 0.55;
  }
  return pts;
}

// =====================================================================
//  The effect system — creates meshes, animates them, cleans them up
// =====================================================================
export class EffectSystem {
  constructor(scene) {
    this.scene = scene;
    this.list = [];            // active effects: { t, life, update(k, dt, fx), objects }
    this.fancy = true;         // particles on (G in the viewer turns them off)
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    this.time = 0;
    this.P = {
      smoke: new ParticleSystem(scene, TEX.smoke, { max: 1800, normal: true, order: 1 }),
      flame: new ParticleSystem(scene, TEX.smoke, { max: 2400, order: 2 }),
      glow: new ParticleSystem(scene, TEX.glow, { max: 2600, order: 3 }),
      spark: new ParticleSystem(scene, TEX.spark, { max: 1800, order: 3 }),
      shard: new ParticleSystem(scene, TEX.shard, { max: 900, order: 3 }),
      leaf: new ParticleSystem(scene, TEX.leaf, { max: 600, order: 3 }),
      feather: new ParticleSystem(scene, TEX.feather, { max: 400, order: 3 }),
      chunk: new ParticleSystem(scene, TEX.shard, { max: 600, normal: true, order: 1 }),
    };
    // Lights that spells cast on everything around them (made once — adding lights later makes the game stutter)
    this.lights = Array.from({ length: 5 }, () => {
      const l = new THREE.PointLight(0xffffff, 0, 10, 1.7);
      l.position.set(0, -200, 0);
      scene.add(l);
      return { l, t: 0, life: 0, peak: 0, follow: null, hold: 0 };
    });
    this.swingSide = new WeakMap();   // so swings alternate left/right
  }

  // 1 when the screen is calm; less when lots of effects are already playing (a 20-player raid)
  busy() { return Math.max(0.3, Math.min(1, 45 / (this.list.length + 1))); }

  add(life, objects, update) {
    const fx = { t: 0, life, objects, update };
    update(0, 0, fx);   // set the starting size/opacity BEFORE the first frame is drawn
    objects.forEach(o => { o.frustumCulled = false; this.scene.add(o); });
    this.list.push(fx);
    return fx;
  }
  later(delay, fn) { this.add(Math.max(0.001, delay), [], (k) => { if (k >= 1) fn(); }); }

  update(dt) {
    this.time += dt;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const fx = this.list[i];
      fx.t += dt;
      const k = Math.min(1, fx.t / fx.life);   // 0 → 1 over the effect's life
      const keep = fx.update(k, dt, fx) !== false && k < 1;
      if (!keep) {
        fx.objects.forEach(o => this.dispose(o));
        fx.onEnd?.();
        this.list.splice(i, 1);
      }
    }
    const viewH = window.innerHeight * this.pixelRatio;
    for (const p of Object.values(this.P)) p.update(dt, viewH);
    for (const L of this.lights) {
      if (L.life <= 0) continue;
      L.t += dt;
      const k = Math.min(1, L.t / L.life);
      if (L.follow) { const p = L.follow(); if (p) L.l.position.copy(p); }
      L.l.intensity = L.peak * (k < L.hold ? 1 : Math.pow(1 - (k - L.hold) / (1 - L.hold), 2));
      if (k >= 1) { L.life = 0; L.l.intensity = 0; L.l.position.y = -200; L.follow = null; }
    }
  }
  dispose(o) {
    this.scene.remove(o);
    o.traverse?.(c => { if (c.material && !c.userData.keepMat) c.material.dispose?.(); if (c.userData.ownGeo) c.geometry.dispose(); });
  }

  clear() {
    this.list.forEach(fx => fx.objects.forEach(o => this.scene.remove(o)));
    this.list = [];
    Object.values(this.P).forEach(p => p.clear());
    this.lights.forEach(L => { L.life = 0; L.l.intensity = 0; L.l.position.y = -200; });
  }

  // ---------- building blocks ----------
  light(color, pos, peak, life, range = 10, follow = null, hold = 0) {
    if (color == null) return;
    const L = this.lights.find(L => L.life <= 0) || this.lights.reduce((a, b) => (a.t / a.life > b.t / b.life ? a : b));
    peak *= 0.45 * this.busy();   // a raid has lots of these at once: keep each one modest
    L.l.color.setHex(color); L.l.position.copy(pos); L.l.distance = range;
    Object.assign(L, { t: 0, life, peak, follow, hold });
    L.l.intensity = peak;
    return L;
  }
  // let a light that was following something fade out now (its spell is over)
  release(L, follow) { if (L && L.follow === follow && L.life > 0) { L.hold = 0; L.life = L.t + 0.12; L.follow = null; } }
  shake(amount, pos) { this.onShake?.(amount, pos); }
  flash(pos, color, size, life = 0.25, map = TEX.glow) {
    const s = new THREE.Sprite(spriteMat(color, map));
    s.position.copy(pos);
    this.add(life, [s], (k) => { s.scale.setScalar(size * (0.6 + ease(k) * 0.6)); s.material.opacity = Math.pow(1 - k, 1.5); });
  }
  // a ring rolling out across the ground (soft, with an optional wall of light riding it)
  groundRing(color, center, radius, life, { from = 0.2, wall = 0, opacity = 1, delay = 0 } = {}) {
    const m = new THREE.Mesh(GEO.plane, flatMat(TEX.ring, color, 0));
    m.rotation.x = -Math.PI / 2;
    m.position.set(center.x, 0.07, center.z);
    const objs = [m];
    let w = null;
    if (wall) {
      w = new THREE.Mesh(GEO.tube, new THREE.MeshBasicMaterial({ map: TEX.wall, color, ...additive, side: THREE.DoubleSide, opacity: 0 }));
      w.position.set(center.x, 0, center.z);
      objs.push(w);
    }
    this.add(life + delay, objs, (k, dt, fx) => {
      const kk = Math.max(0, (fx.t - delay) / life);
      const r = from + (radius - from) * ease(kk);
      m.scale.setScalar(r);
      const fade = kk <= 0 ? 0 : Math.pow(1 - Math.min(1, kk), 1.3);
      m.material.opacity = fade * opacity;
      if (w) { w.scale.set(r * 0.93, wall * (0.4 + 0.6 * (1 - kk)), r * 0.93); w.material.opacity = fade * 0.55 * opacity; }
    });
  }
  groundGlow(color, center, radius, life, opacity = 0.8, map = TEX.disc) {
    const m = new THREE.Mesh(GEO.plane, flatMat(map, color, opacity));
    m.rotation.x = -Math.PI / 2;
    m.position.set(center.x, 0.06, center.z);
    m.scale.setScalar(radius);
    this.add(life, [m], (k) => { m.material.opacity = opacity * Math.pow(1 - k, 1.4); });
    return m;
  }
  scorch(center, radius, life = 6, color = 0x000000) {
    const m = new THREE.Mesh(GEO.plane, flatMat(TEX.scorch, color, 0.75, true));
    m.rotation.x = -Math.PI / 2; m.rotation.z = Math.random() * 6;
    m.position.set(center.x, 0.03, center.z);
    m.scale.setScalar(radius);
    m.renderOrder = -1;
    this.add(life, [m], (k) => { m.material.opacity = 0.75 * (k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3); });
  }
  sigil(color, center, radius, life, spin = 0.6) {
    const m = new THREE.Mesh(GEO.plane, flatMat(TEX.sigil, color, 0));
    m.rotation.x = -Math.PI / 2;
    m.position.set(center.x, 0.08, center.z);
    const follow = center.isVector3 ? null : center;
    this.add(life, [m], (k, dt) => {
      if (follow) m.position.set(follow.root.position.x, 0.08, follow.root.position.z);
      m.rotation.z += spin * dt;
      m.scale.setScalar(radius * (0.7 + 0.3 * ease(k * 4)));
      m.material.opacity = Math.min(1, k * 6) * Math.pow(1 - k, 1.2);
    });
  }
  // A column of light (pillars, heals from above, smite)
  column(pal, pos, radius, height, life, { grow = 0.12, core = true } = {}) {
    const mk = (color, r) => {
      const m = new THREE.Mesh(GEO.tube, new THREE.ShaderMaterial({
        uniforms: { uColor: { value: col3(color) }, uCore: { value: col3(pal.core) }, uOpacity: { value: 0 }, uTime: { value: 0 } },
        vertexShader: SHIELD_VS, fragmentShader: COLUMN_FS, ...additive, side: THREE.DoubleSide,
      }));
      m.userData.r = r;
      return m;
    };
    const outer = mk(pal.main, radius), inner = core ? mk(pal.el === "fire" ? 0xffa040 : pal.core, radius * 0.35) : null;
    const objs = inner ? [outer, inner] : [outer];
    const follow = pos.isVector3 ? null : pos;
    const busy = this.busy();
    this.add(life, objs, (k, dt) => {
      const p = follow ? follow.root.position : pos;
      const open = ease(k / grow), close = k > 0.6 ? 1 - (k - 0.6) / 0.4 : 1;
      for (const m of objs) {
        m.position.set(p.x, 0, p.z);
        const r = m.userData.r * (0.25 + 0.75 * open) * (0.6 + 0.4 * close);
        m.scale.set(r, height, r);
        m.material.uniforms.uOpacity.value = open * close * (m === inner ? 0.75 : 0.5) * (pal.el === "fire" ? 0.5 : 1) * busy;
        m.material.uniforms.uTime.value += dt;
      }
    });
  }

  // Element particles. mode: "burst" (flies outward), "trail" (drifts), "rise" (floats up), "fall" (rains down)
  emit(pal, mode, p, n, power = 1, dir = null) {
    if (!this.fancy || n <= 0) return;
    if (n > 1) n = Math.max(1, Math.round(n * this.busy()));
    const P = this.P, el = pal.el;
    for (let i = 0; i < n; i++) {
      let vx, vy, vz, sp;
      if (mode === "burst") {
        const a = Math.random() * Math.PI * 2, up = Math.random() * 0.9 + 0.1;
        sp = rand(2, 6) * Math.sqrt(power);
        vx = Math.cos(a) * sp * (1 - up * 0.5); vy = up * sp * 0.9; vz = Math.sin(a) * sp * (1 - up * 0.5);
        if (dir) { vx += dir.x * sp * 0.8; vy += dir.y * sp * 0.8; vz += dir.z * sp * 0.8; }
      } else if (mode === "rise") { vx = rand(-0.3, 0.3); vy = rand(0.8, 2.2) * power; vz = rand(-0.3, 0.3); }
      else if (mode === "fall") { vx = rand(-0.2, 0.2); vy = rand(-1.5, -0.4); vz = rand(-0.2, 0.2); }
      else { vx = rand(-0.4, 0.4); vy = rand(-0.2, 0.5); vz = rand(-0.4, 0.4); }
      const s = mode === "trail" ? 0.7 : 1;
      const x = p.x + rand(-0.1, 0.1) * power, y = p.y + rand(-0.1, 0.1) * power, z = p.z + rand(-0.1, 0.1) * power;
      switch (el) {
        case "fire":
          P.flame.spawn(x, y, z, vx, vy + 1.2, vz, { life: rand(0.25, 0.55) * (mode === "rise" ? 1.6 : 1), size: rand(0.4, 0.8) * power * s, size1: 0.15 * power, color: Math.random() < 0.3 ? pal.core : pal.main, color1: pal.deep, alpha: 0.6, drag: 2.5, grav: -2.5, spin: rand(-2, 2) });
          if (Math.random() < 0.35) P.glow.spawn(x, y, z, vx * 1.3, vy + 2, vz * 1.3, { life: rand(0.6, 1.4), size: rand(0.05, 0.11), color: 0xffd080, color1: pal.deep, drag: 0.8, grav: -1.5 });
          if (Math.random() < 0.25) P.smoke.spawn(x, y + 0.3, z, vx * 0.3, rand(0.6, 1.4), vz * 0.3, { life: rand(0.9, 1.7), size: 0.4 * power, size1: 1.4 * power, color: pal.smoke, alpha: 0.45, drag: 1.2, grav: -0.4, spin: rand(-1, 1) });
          break;
        case "frost":
          P.shard.spawn(x, y, z, vx, vy, vz, { life: rand(0.5, 1.0), size: rand(0.1, 0.22) * Math.sqrt(power), color: pal.core, color1: pal.main, drag: 1.2, grav: 7, spin: rand(-8, 8) });
          if (Math.random() < 0.5) P.glow.spawn(x, y, z, vx * 0.3, vy * 0.2 + 0.2, vz * 0.3, { life: rand(0.5, 1.0), size: rand(0.5, 0.9) * power * s, size1: 1.3 * power, color: pal.main, alpha: 0.22, drag: 2 });
          if (Math.random() < 0.3) P.spark.spawn(x, y, z, vx * 0.5, vy * 0.5, vz * 0.5, { life: rand(0.3, 0.6), size: 0.18, color: 0xffffff, drag: 2 });
          break;
        case "shadow":
          if (Math.random() < 0.5) P.smoke.spawn(x, y, z, vx * 0.6, vy * 0.5 + 0.3, vz * 0.6, { life: rand(0.6, 1.2), size: rand(0.3, 0.6) * power * s, size1: 1.3 * power, color: pal.smoke, alpha: 0.5, drag: 2, spin: rand(-2, 2) });
          P.flame.spawn(x, y, z, vx * 0.5, vy * 0.5 + 0.4, vz * 0.5, { life: rand(0.4, 0.8), size: rand(0.3, 0.6) * power * s, size1: 0.9 * power, color: pal.main, color1: pal.deep, alpha: 0.35, drag: 2, spin: rand(-2, 2) });
          P.glow.spawn(x, y, z, vx, vy, vz, { life: rand(0.4, 0.9), size: rand(0.1, 0.25), color: pal.main, color1: pal.deep, drag: 1.8, grav: -0.6 });
          if (Math.random() < 0.3) P.flame.spawn(x, y, z, vx * 0.5, vy * 0.5 + 0.5, vz * 0.5, { life: 0.5, size: 0.4 * power * s, size1: 0.1, color: pal.main, color1: pal.deep, alpha: 0.6, drag: 2 });
          break;
        case "arcane":
          P.spark.spawn(x, y, z, vx, vy, vz, { life: rand(0.4, 0.9), size: rand(0.15, 0.32), color: pal.core, color1: pal.main, drag: 2.5, spin: rand(-3, 3) });
          P.glow.spawn(x, y, z, vx * 0.6, vy * 0.6, vz * 0.6, { life: rand(0.3, 0.7), size: rand(0.2, 0.4) * s, color: pal.main, color1: pal.deep, drag: 2 });
          break;
        case "nature":
          if (Math.random() < 0.5) P.leaf.spawn(x, y, z, vx * 0.7, vy * 0.7 + 0.4, vz * 0.7, { life: rand(0.8, 1.6), size: rand(0.12, 0.22), color: pal.main, color1: pal.deep, drag: 1.5, grav: 1.2, spin: rand(-5, 5) });
          P.glow.spawn(x, y, z, vx * 0.6, vy * 0.6, vz * 0.6, { life: rand(0.5, 1.0), size: rand(0.12, 0.28), color: pal.core, color1: pal.main, drag: 2, grav: -0.5 });
          if (pal.smoke && mode !== "trail" && Math.random() < 0.3) P.smoke.spawn(x, y, z, vx * 0.3, 0.6, vz * 0.3, { life: 1.2, size: 0.4 * power, size1: 1.2 * power, color: pal.smoke, alpha: 0.4, drag: 1.5, spin: 1 });
          break;
        case "holy":
          P.glow.spawn(x, y, z, vx * 0.8, vy * 0.8 + 0.4, vz * 0.8, { life: rand(0.5, 1.1), size: rand(0.1, 0.26), color: pal.core, color1: pal.main, drag: 2, grav: -0.8 });
          if (Math.random() < 0.45) P.spark.spawn(x, y, z, vx, vy, vz, { life: rand(0.3, 0.6), size: rand(0.18, 0.3), color: 0xffffff, color1: pal.main, drag: 3 });
          if (mode !== "trail" && Math.random() < 0.12) P.feather.spawn(x, y, z, vx * 0.4, vy * 0.4, vz * 0.4, { life: rand(1.2, 2), size: 0.22, color: 0xfffaf0, drag: 2, grav: 0.6, spin: rand(-2, 2) });
          break;
        case "storm":
          P.spark.spawn(x, y, z, vx * 1.6, vy * 1.4, vz * 1.6, { life: rand(0.15, 0.4), size: rand(0.15, 0.35), color: 0xffffff, color1: pal.main, drag: 4 });
          if (Math.random() < 0.4) P.glow.spawn(x, y, z, vx * 0.4, vy * 0.4, vz * 0.4, { life: rand(0.2, 0.5), size: rand(0.3, 0.6) * s, color: pal.main, color1: pal.deep, drag: 3 });
          break;
        case "blood":
          P.glow.spawn(x, y, z, vx * 1.1, vy * 1.1 + 1, vz * 1.1, { life: rand(0.4, 0.8), size: rand(0.07, 0.16), color: pal.main, color1: pal.deep, drag: 0.6, grav: 9 });
          if (Math.random() < 0.3) P.spark.spawn(x, y, z, vx * 1.4, vy * 1.4, vz * 1.4, { life: 0.25, size: 0.25, color: pal.core, color1: pal.main, drag: 4 });
          break;
        case "smoke":
          P.smoke.spawn(x, y, z, vx * 0.7, vy * 0.4 + 0.3, vz * 0.7, { life: rand(0.8, 1.5), size: rand(0.4, 0.8) * power, size1: 1.8 * power, color: pal.smoke, alpha: 0.6, drag: 2, spin: rand(-1.5, 1.5) });
          break;
        case "bone":
          P.chunk.spawn(x, y, z, vx, vy + 1, vz, { life: rand(0.6, 1.1), size: rand(0.1, 0.18), color: pal.main, drag: 0.8, grav: 9, spin: rand(-8, 8) });
          if (Math.random() < 0.4) P.smoke.spawn(x, y, z, vx * 0.3, 0.4, vz * 0.3, { life: 0.9, size: 0.3, size1: 1, color: pal.smoke, alpha: 0.35, drag: 2 });
          break;
        case "earth":
          P.smoke.spawn(x, y, z, vx * 0.8, vy * 0.3 + 0.3, vz * 0.8, { life: rand(0.8, 1.4), size: rand(0.3, 0.6) * power, size1: 1.5 * power, color: pal.smoke, alpha: 0.5, drag: 2.2, spin: rand(-1, 1) });
          if (Math.random() < 0.5) P.chunk.spawn(x, y, z, vx, vy + 2, vz, { life: rand(0.5, 0.9), size: rand(0.06, 0.14), color: pal.deep, drag: 0.5, grav: 12, spin: rand(-8, 8) });
          break;
        default:   // physical: hot sparks and a little dust
          P.spark.spawn(x, y, z, vx * 1.5, vy * 1.5 + 1, vz * 1.5, { life: rand(0.2, 0.45), size: rand(0.12, 0.24), color: 0xffffff, color1: 0xffb050, drag: 1.5, grav: 9 });
          if (Math.random() < 0.25) P.smoke.spawn(x, y, z, vx * 0.3, 0.3, vz * 0.3, { life: 0.8, size: 0.25 * power, size1: 0.9 * power, color: pal.smoke, alpha: 0.35, drag: 2 });
      }
    }
  }
  // A hit landing: flash, light, element burst
  impact(pal, pos, power = 1) {
    this.flash(pos, pal.core, 1.0 * power, 0.14);
    this.flash(pos, pal.main, 2.4 * power, 0.32);
    if (pal.el === "storm" || pal.el === "arcane" || pal.el === "holy") this.flash(pos, 0xffffff, 1.6 * power, 0.12, TEX.spark);
    this.emit(pal, "burst", pos, Math.round(12 * power), power);
    this.light(pal.light, pos, 30 * power, 0.3, 5 + 5 * power);
    if (power >= 1.4) {
      this.groundRing(pal.main, pos, 2.5 * power, 0.5, { opacity: 0.8 });
      if (pal.el === "fire" || pal.el === "shadow") this.scorch(pos, 1.2 * power, 5);
    }
  }

  // ---------- the effect types ----------
  /** Play an ability's effect. actor/target are Units from 3d.html (target may be null). */
  play(spec, actor, target) {
    if (this.list.length > 260) return;   // the screen is already full (or the game is catching up after lag)
    if (spec.also) for (const extra of spec.also) this.play(extra, actor, target);   // abilities with two effects (e.g. a shield that also blasts out)
    const to = spec.onSelf || !target ? actor : target;
    const s = actor.size || 1;   // bosses are big — their effects are too
    const pal = paletteFor(spec);
    switch (spec.type) {
      case "projectile": return this.projectile(spec, pal, actor, to, s);
      case "slash":      return this.slash(spec, pal, actor, target, s);
      case "nova":       this.nova(spec, pal, actor, s); if (spec.pillar) this.pillar(spec, pal, actor); return;
      case "whirlwind":  return this.whirlwind(spec, pal, actor, s);
      case "shout":      return this.shout(spec, pal, actor, s);
      case "heal":       return this.heal(spec, pal, to);
      case "shield":     return this.shield(spec, pal, to);
      case "pillar":     return this.pillar(spec, pal, to);
      case "beam":       return this.beam(spec, pal, actor, to);
      case "cone":       return spec.style === "sweep" ? this.sweep(spec, pal, actor, s) : this.breath(spec, pal, actor, s);
      case "strike":     return this.strike(spec, pal, to);
      case "meteor":     return this.meteorFall(spec, pal, to);
      case "poof":       return this.poof(spec, pal, to);
      case "warp":       return this.warp(spec, pal, actor, target);
    }
  }

  /**
   * WARP STRIKE: a glowing blade flies to the target, you burst into blue crystal shards where you
   * stood and reappear at the blade with a heavy strike. actor.warpFrom = where you warped from
   * (3d.html sets it — by the time this plays, the unit is already standing at the target).
   */
  warp(spec, pal, actor, target) {
    const from = actor.warpFrom ? actor.warpFrom.clone() : actor.root.position.clone();
    const a = from.clone(); a.y += actor.height * 0.55;
    const b = chest(target || actor);
    const dir = b.clone().sub(a), len = dir.length() || 1; dir.divideScalar(len);
    const crystal = { core: 0xeaf8ff, main: 0x5ab8ff, deep: 0x1a4aa8, light: 0x7ac8ff, el: "frost" };
    // where you were: a burst of crystal shards and a fading afterimage
    this.flash(a, 0xffffff, 1.6, 0.12, TEX.spark);
    this.flash(a, crystal.main, 3.0, 0.4);
    this.emit(crystal, "burst", a, 26, 1.1);
    if (this.fancy) for (let i = 0; i < 28; i++) {   // shards scattering
      this.P.shard.spawn(a.x + rand(-0.3, 0.3), a.y + rand(-0.8, 0.5), a.z + rand(-0.3, 0.3), rand(-3, 3), rand(-1, 3), rand(-3, 3),
        { life: rand(0.4, 0.8), size: rand(0.08, 0.18), color: Math.random() < 0.5 ? crystal.core : crystal.main, alpha: 1, drag: 1.5, grav: 6, spin: rand(-8, 8) });
    }
    // the thrown blade and the streak it leaves
    const blade = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.08, 1.4, 6).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: crystal.core, ...additive }));
    blade.userData.ownGeo = true;
    const glow = new THREE.Sprite(spriteMat(crystal.main, TEX.glow, 0.95));
    const streakMat = new THREE.MeshBasicMaterial({ color: crystal.main, transparent: true, opacity: 0.9, ...additive, side: THREE.DoubleSide });
    const streakGeo = new THREE.BufferGeometry(), streak = new THREE.Mesh(streakGeo, streakMat);
    streak.userData.ownGeo = true;
    const flight = Math.min(0.18, 0.05 + len / 220);   // it's FAST
    let hit = false;
    const p = new THREE.Vector3();
    this.add(0.75, [blade, glow, streak], (k, dt, fx) => {
      const t = fx.t;
      const f = Math.min(1, t / flight);
      p.copy(a).lerp(b, f);
      blade.position.copy(p); blade.lookAt(b); glow.position.copy(p);
      blade.visible = glow.visible = f < 1;
      glow.scale.setScalar(1.4);
      // a ribbon from where you were to the blade, thinning as it fades
      const fade = t < flight ? 1 : Math.max(0, 1 - (t - flight) / 0.5);
      ribbonGeometry([a, a.clone().lerp(p, 0.5), p.clone()], 0.35 * fade + 0.05, streakGeo);
      streakMat.opacity = 0.85 * fade;
      if (this.fancy && f < 1) for (let i = 0; i < 3; i++) {
        const q = a.clone().lerp(p, Math.random());
        this.P.glow.spawn(q.x, q.y, q.z, rand(-0.5, 0.5), rand(-0.2, 0.6), rand(-0.5, 0.5), { life: rand(0.25, 0.5), size: rand(0.25, 0.5), color: crystal.main, alpha: 0.8, drag: 2 });
      }
      if (!hit && f >= 1) {   // ARRIVE: flash, shards, a heavy strike
        hit = true;
        this.flash(b, 0xffffff, 2.4, 0.14, TEX.spark);
        this.flash(b, crystal.main, 4.2, 0.45);
        this.light(crystal.light, b, 60, 0.45, 12);
        this.emit(crystal, "burst", b, 30, 1.4);
        this.groundRing(crystal.main, new THREE.Vector3(b.x, 0, b.z), 3.2, 0.45, { wall: 0.8 });
        if (target) this.slash({ type: "slash", color: crystal.main, el: "frost", big: true }, crystal, actor, target, actor.size || 1);
        this.onShake?.(0.25, b);
      }
    });
  }

  // A quick flash that grows and fades (used when things hit; 3d.html uses it too)
  burst(color, pos, size = 0.8, life = 0.3) {
    this.onBurst?.(pos, color, size);
    const pal = paletteFor({ color });
    this.flash(pos, color, size * 2, life);
    this.emit(pal, "burst", pos, Math.round(4 + size * 5), Math.min(1.5, size));
  }

  projectile(spec, pal, from, to, s) {
    const size = (spec.size || 0.3) * Math.max(1, s * 0.6);
    const objs = [];
    let core, halo, body = null;
    if (spec.arrow) {   // an arrow: a thin shaft with a faint streak
      body = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.8, 5).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x6a5238 }));
      body.userData.ownGeo = true;
      objs.push(body);
    } else {
      core = new THREE.Sprite(spriteMat(pal.core, TEX.glow, 1));
      halo = new THREE.Sprite(spriteMat(pal.main, TEX.glow, 0.85));
      objs.push(halo, core);
      if (spec.spear) {   // a spear of light
        body = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.07, 2.2, 6).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: pal.core, ...additive }));
        body.userData.ownGeo = true;
        objs.push(body);
      }
    }
    const start = chest(from);
    start.x += Math.cos(from.facing) * 0.6 * s; start.z += Math.sin(from.facing) * 0.6 * s;
    const end = new THREE.Vector3(), pos = start.clone(), prev = start.clone(), dirV = new THREE.Vector3();
    const speed = spec.speed || 30;
    const wob = pal.el === "arcane" || pal.el === "nature" ? 0.35 : 0;
    const t0 = this.time;
    const followPos = () => pos;
    let L = null;
    if (!spec.arrow) {
      L = this.light(pal.light, pos, 14 * size / 0.3, 3, 4 + size * 10, followPos, 0.95);
      this.flash(start, pal.main, size * 4, 0.2);   // the launch
    }
    let trail = 0, done = false;
    const fx = this.add(3, objs, (k, dt) => {
      chest(to, end);   // follow the target if it moves
      const d = pos.distanceTo(end);
      if (d < 0.35 + size) {
        done = true;
        this.release(L, followPos);
        if (spec.arrow) this.emit(pal, "burst", end, 4, 0.6);
        else this.impact(pal, end, Math.max(0.8, size / 0.3) * (size > 0.5 ? 1.3 : 1));
        return false;
      }
      prev.copy(pos);
      dirV.subVectors(end, pos).normalize();
      pos.addScaledVector(dirV, Math.min(d, speed * dt));
      const wobble = wob ? Math.sin((this.time - t0) * 18) * wob * Math.min(1, d / 4) : 0;
      const shown = pos.clone(); shown.y += wobble;
      for (const o of objs) o.position.copy(shown);
      if (body) body.lookAt(shown.clone().add(dirV));
      if (this.fancy && (pal.el === "fire" || pal.el === "shadow")) for (let i = 0; i < 2; i++) {   // the ball itself burns
        this.P.flame.spawn(shown.x, shown.y, shown.z, rand(-1, 1), rand(-0.5, 1.5), rand(-1, 1),
          { life: 0.2, size: size * rand(2.2, 3.2), size1: size, color: pal.main, color1: pal.deep, alpha: 0.5, drag: 3, spin: rand(-4, 4) });
      }
      if (core) {
        core.scale.setScalar(size * 2.2);
        halo.scale.setScalar(size * (5 + Math.sin(this.time * 40) * 0.5));
      }
      // the trail
      trail += dt;
      if (!spec.arrow) {
        const n = Math.max(1, Math.ceil(prev.distanceTo(shown) / 0.14));
        trail = 0;
        for (let i = 0; i < n; i++) {
          const q = prev.clone().lerp(shown, i / n);
          this.emit(pal, "trail", q, 1, size / 0.3);
          if (this.fancy) this.P.glow.spawn(q.x, q.y, q.z, 0, 0, 0, { life: 0.22, size: size * 2.2, size1: size * 0.6, color: pal.main, alpha: 0.35, drag: 0 });
        }
      } else if (spec.arrow && trail > 0.03) { trail = 0; if (this.fancy) this.P.glow.spawn(shown.x, shown.y, shown.z, 0, 0, 0, { life: 0.15, size: 0.12, color: 0xfff0d0, alpha: 0.5 }); }
    });
    return fx;
  }

  slash(spec, pal, actor, target, s) {
    if (spec.thrust) return this.thrust(spec, pal, actor, target, s);
    const big = spec.big, small = spec.small;
    const R = (big ? 2.2 : small ? 1.3 : 1.75) * s, r0 = R * (big ? 0.35 : 0.5);
    const side = (this.swingSide.get(actor) || 1) * -1;
    this.swingSide.set(actor, side);
    // The arc: in front of the attacker, sweeping from one side to the other. It's shaped like a
    // shallow bowl (the inner edge lower than the blade's edge) so you can see it from any angle.
    const N = 40, sweep = big ? 2.6 : 2.2, dip = R * 0.4;
    const pos = [], uv = [], idx = [];
    for (let i = 0; i <= N; i++) {
      const th = (i / N - 0.5) * sweep * side;
      for (const [r, v, y] of [[r0, 0, -dip], [R, 1, 0]]) { pos.push(Math.sin(th) * r, y, Math.cos(th) * r); uv.push(i / N, v); }
      if (i < N) { const q = i * 2; idx.push(q, q + 1, q + 2, q + 1, q + 3, q + 2); }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    const mat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: col3(pal.main) }, uCore: { value: col3(pal.core) }, uHead: { value: 0 }, uTail: { value: 0.6 }, uOpacity: { value: 1 } },
      vertexShader: SLASH_VS, fragmentShader: SLASH_FS, ...additive, side: THREE.DoubleSide,
    });
    const mk = (tilt, lift, scale) => {
      const m = new THREE.Mesh(geo, mat);
      m.userData.keepMat = scale !== 1;
      const g = new THREE.Group();
      g.add(m);
      const p = actor.root.position;
      g.position.set(p.x, p.y + actor.height * lift, p.z);
      g.rotation.order = "YZX";
      g.rotation.y = Math.PI / 2 - actor.facing;
      g.rotation.z = tilt;
      m.scale.setScalar(scale);
      return g;
    };
    // A level swing tilts a little; a chop (Mortal Strike, Execute) comes down almost vertically
    const tilt = spec.chop ? side * 1.35 : side * rand(0.55, 0.8);   // a diagonal swing reads from every camera angle
    // Two layers at different angles: whichever way the camera looks, at least one of them faces it
    const groups = [mk(tilt, spec.chop ? 0.6 : 0.5, 1)];
    groups.push(mk(spec.double ? -tilt : spec.chop ? tilt * 0.7 : tilt - side * 0.95, spec.chop ? 0.62 : 0.52, 0.86));
    groups[0].children[0].userData.ownGeo = true;
    const life = big ? 0.42 : 0.32, swingT = big ? 0.17 : 0.13;
    const edge = new THREE.Vector3();
    this.add(life, groups, (k, dt, fx) => {
      const t = fx.t;
      mat.uniforms.uHead.value = Math.min(1.02, ease(t / swingT) * 1.02);
      mat.uniforms.uTail.value = 0.75 - Math.max(0, t - swingT) / (life - swingT) * 0.6;
      mat.uniforms.uOpacity.value = t < swingT ? 1 : Math.pow(1 - (t - swingT) / (life - swingT), 1.4);
      // sparks fly off the blade's edge while it swings
      if (this.fancy && t < swingT && !small) {
        const head = mat.uniforms.uHead.value, th = (head - 0.5) * sweep * side;
        const g = groups[0];
        edge.set(Math.sin(th) * R, 0, Math.cos(th) * R).applyEuler(g.rotation).add(g.position);
        this.emit(pal, "trail", edge, pal.el === "physical" ? 0 : 1, 0.6);
      }
    });
    this.meleeHit(spec, pal, actor, target, s, swingT * 0.8);
  }
  // A melee hit landing on the target: sparks fly away from the attacker
  meleeHit(spec, pal, actor, target, s, delay) {
    const big = spec.big, small = spec.small;
    if (target && target !== actor && target.root.position.distanceTo(actor.root.position) < 10 * s) {
      this.later(delay, () => {
        const p = chest(target);
        const power = big ? 1.3 : small ? 0.6 : 0.9;
        this.flash(p, pal.core, 0.9 * power, 0.1, TEX.spark);
        this.flash(p, pal.main, 1.8 * power, 0.22);
        const away = p.clone().sub(actor.root.position).setY(0.3).normalize();
        this.emit(pal, "burst", p, Math.round(8 * power), power, away);
        if (pal.el !== "physical") this.emit({ ...ELEMENTS.physical, el: "physical" }, "burst", p, Math.round(4 * power), 0.8, away);
        this.light(pal.light, p, 18 * power, 0.2, 5);
        if (big) this.shake(0.06 * s, p);
      });
    }
  }

  // A lance thrust: a bright streak shoots straight ahead
  thrust(spec, pal, actor, target, s) {
    const len = 4.2 * s;
    const pts = [];
    for (let i = 0; i <= 16; i++) pts.push(new THREE.Vector3(0, 0, 0.3 + i / 16 * len));
    const widths = pts.map((_, i) => 0.55 * (1 - i / 16 * 0.75));
    const mat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: col3(pal.main) }, uCore: { value: col3(pal.core) }, uOpacity: { value: 1 }, uTime: { value: 0 }, uLen: { value: len }, uFlow: { value: 14 }, uNoise: { value: 0.5 } },
      vertexShader: BEAM_VS, fragmentShader: BEAM_FS, ...additive, side: THREE.DoubleSide,
    });
    const m = new THREE.Mesh(ribbonGeometry(pts, widths), mat);
    m.userData.ownGeo = true;
    const g = new THREE.Group(); g.add(m);
    const p = actor.root.position;
    g.position.set(p.x, p.y + actor.height * 0.55, p.z);
    g.rotation.y = Math.PI / 2 - actor.facing;
    const tip = new THREE.Sprite(spriteMat(pal.core, TEX.spark));
    this.add(0.32, [g, tip], (k, dt, fx) => {
      const grow = ease(fx.t / 0.1);
      g.scale.set(1, 1, Math.max(0.05, grow));
      mat.uniforms.uTime.value = fx.t;
      mat.uniforms.uOpacity.value = fx.t < 0.1 ? 1.2 : Math.pow(1 - (fx.t - 0.1) / 0.22, 1.5) * 1.2;
      tip.position.set(0, 0, 0.3 + len * grow).applyEuler(g.rotation).add(g.position);
      tip.scale.setScalar(1.2 * (1 - k));
    });
    this.meleeHit({ ...spec, big: true }, pal, actor, target, s, 0.08);
  }

  nova(spec, pal, actor, s) {
    const c = feet(actor), R = spec.radius || 6;
    switch (spec.style) {
      case "ice": return this.iceNova(pal, c, R);
      case "rain": return this.rainNova(pal, c, R);
      case "storm": return this.stormNova(pal, c, R);
      case "graves": return this.gravesNova(pal, c, R);
      case "spin": this.whirlwind(spec, pal, actor, s); break;
    }
    const huge = R >= 30;
    const life = 0.45 + Math.min(1, R / 40) * 0.9;
    this.groundRing(pal.main, c, R, life, { wall: huge ? 0 : Math.min(2.5, 0.6 + R * 0.12), from: 0.4, opacity: huge ? 0.45 : 0.9 });
    if (!huge) this.groundRing(pal.core, c, R * 0.82, life * 1.1, { opacity: 0.35, delay: 0.08 });
    this.groundGlow(pal.main, c, Math.min(R, 8), 0.6, huge ? 0.4 : 0.6);
    this.flash(chest(actor), pal.main, 3 * s, 0.35);
    this.light(pal.light, chest(actor), huge ? 60 : 40, life, Math.min(40, R * 2.2));
    if (huge) {   // raid-wide: rings roll out one after another, the whole arena lights up
      this.groundRing(pal.main, c, R, life * 1.2, { opacity: 0.3, delay: 0.25 });
      this.groundRing(pal.deep, c, R, life * 1.4, { opacity: 0.25, delay: 0.5 });
      this.shake(pal.el === "holy" || pal.el === "nature" ? 0.05 : 0.18, c);
    } else if (R >= 8 && pal.el !== "holy" && pal.el !== "nature") this.shake(0.06, c);
    // particles riding the wavefront
    if (this.fancy) {
      let last = 0;
      this.add(life, [], (k) => {
        const r = 0.4 + (R - 0.4) * ease(k), n = Math.round(Math.min(huge ? 60 : 30, r * (huge ? 1.4 : 3)) * (k - last) * 6);
        last = k;
        for (let i = 0; i < n; i++) {
          const a = Math.random() * Math.PI * 2;
          this.emit(pal, huge ? "rise" : "burst", { x: c.x + Math.cos(a) * r, y: 0.2, z: c.z + Math.sin(a) * r }, 1, huge ? 1.5 : 0.7);
        }
      });
    }
  }
  // Frost Nova: a ring of ice spikes bursts out of the ground, then shatters
  iceNova(pal, c, R) {
    this.groundRing(pal.main, c, R, 0.45, { wall: 1.2, from: 0.3 });
    this.groundGlow(pal.main, c, R * 1.05, 2.2, 0.22, TEX.disc);   // frost spreading over the floor
    this.light(pal.light, c.clone().setY(1.5), 50, 0.8, R * 2.5);
    this.shake(0.05, c);
    const mat = new THREE.MeshStandardMaterial({ color: 0xcfefff, emissive: pal.main, emissiveIntensity: 0.6, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.88 });
    const spikes = [], n = Math.min(34, Math.round(R * 4));
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(GEO.spike, mat);
      m.userData.keepMat = true;
      const a = i / n * Math.PI * 2 + rand(-0.1, 0.1), d = R * rand(0.55, 1.0);
      m.position.set(c.x + Math.cos(a) * d, 0, c.z + Math.sin(a) * d);
      m.rotation.set(rand(-0.35, 0.35), rand(0, 6), rand(-0.35, 0.35));
      m.userData.d = d / R; m.userData.h = rand(0.7, 1.6); m.userData.w = rand(0.14, 0.26);
      spikes.push(m);
    }
    let shattered = false;
    this.add(1.9, spikes, (k, dt, fx) => {
      const t = fx.t;
      for (const m of spikes) {
        const grow = ease((t - m.userData.d * 0.3) / 0.12);
        const melt = t > 1.5 ? 1 - (t - 1.5) / 0.4 : 1;
        m.scale.set(m.userData.w * grow, m.userData.h * grow * melt, m.userData.w * grow);
      }
      if (!shattered && t > 1.5) {
        shattered = true;
        for (const m of spikes) this.emit(pal, "burst", m.position.clone().setY(0.5), 3, 0.6);
      }
    }).onEnd = () => mat.dispose();
    if (this.fancy) for (let i = 0; i < 40; i++) {   // freezing mist
      const a = Math.random() * Math.PI * 2, d = Math.random() * R;
      this.P.glow.spawn(c.x + Math.cos(a) * d, 0.3, c.z + Math.sin(a) * d, 0, rand(0.1, 0.4), 0, { life: rand(1, 2), size: rand(1, 2), size1: 2.6, color: pal.main, alpha: 0.08, drag: 1 });
    }
  }
  // Rain of Fire: burning rocks pour down all over the area
  rainNova(pal, c, R) {
    this.groundGlow(pal.deep, c, R, 2.2, 0.35);
    for (let i = 0; i < 16; i++) {
      this.later(i * 0.09 + Math.random() * 0.05, () => {
        const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * R;
        this.fireballDrop(pal, new THREE.Vector3(c.x + Math.cos(a) * d, 0.1, c.z + Math.sin(a) * d));
      });
    }
    this.light(pal.light, c.clone().setY(3), 45, 1.8, R * 2.5, null, 0.6);
  }
  // A short crackling arc of electricity between two points (the storm gate uses these)
  arc(color, a, b, life = 0.18, width = 0.12) {
    const mat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: col3(color) }, uCore: { value: col3(0xffffff) }, uOpacity: { value: 1 }, uTime: { value: 0 }, uLen: { value: a.distanceTo(b) }, uFlow: { value: 6 }, uNoise: { value: 0.2 } },
      vertexShader: BEAM_VS, fragmentShader: BEAM_FS, ...additive, side: THREE.DoubleSide,
    });
    const m = new THREE.Mesh(ribbonGeometry(boltPath(a, b, 0.3, 4), width), mat);
    m.userData.ownGeo = true;
    let flick = 0;
    this.add(life, [m], (k, dt) => {
      flick -= dt;
      if (flick <= 0) { flick = 0.05; ribbonGeometry(boltPath(a, b, 0.3, 4), width, m.geometry); }
      mat.uniforms.uOpacity.value = (1 - k) * (Math.random() < 0.3 ? 0.4 : 1.3);
    });
  }

  // One burning rock dropping out of the sky onto a spot
  fireballDrop(pal, end, scale = 1) {
    const start = end.clone().add(new THREE.Vector3(rand(-3, -1.5), rand(12, 16), rand(-2, 2)));
    const core = new THREE.Sprite(spriteMat(pal.core, TEX.glow)), halo = new THREE.Sprite(spriteMat(pal.main, TEX.glow, 0.8));
    core.scale.setScalar(0.45 * scale); halo.scale.setScalar(1.3 * scale);
    const p = new THREE.Vector3(), prev = start.clone();
    this.add(0.45, [halo, core], (k) => {
      p.lerpVectors(start, end, k * k);
      core.position.copy(p); halo.position.copy(p);
      const n = Math.max(1, Math.ceil(prev.distanceTo(p) / 0.4));
      for (let i = 0; i < n; i++) this.emit(pal, "trail", prev.clone().lerp(p, i / n), 1, 0.8 * scale);
      prev.copy(p);
      if (k >= 1) { this.impact(pal, end.clone().setY(0.4), 0.9 * scale); this.scorch(end, 1.1 * scale, 4); }
    });
  }

  // A boss's danger zone going off: whatever was warning you erupts
  eruption(el, center, radius) {
    const pal = paletteFor({ el });
    const c = new THREE.Vector3(center.x, 0, center.z);
    const spot = { root: { position: c }, height: 1.8, size: 1 };
    if (el === "fire") return this.explosion(pal, c, Math.max(0.45, Math.min(0.9, radius / 6)));
    if (el === "storm") {
      this.lightningStrike(pal, spot, true);
      this.groundRing(pal.main, c, radius * 1.3, 0.5, { wall: 1.6 });
      return;
    }
    // shadow: souls burst up out of the ground
    this.column(pal, c, radius * 0.4, 16, 0.7, { grow: 0.04 });
    this.impact(pal, c.clone().setY(1), 2);
    this.groundRing(pal.main, c, radius * 1.4, 0.6, { wall: 1.8 });
    this.flash(c.clone().setY(1.2), pal.main, radius * 2.2, 0.4);
    this.shake(0.14, c);
    if (this.fancy) for (let i = 0; i < 26; i++) {
      const a = Math.random() * Math.PI * 2, d = Math.random() * radius * 0.8;
      this.P.flame.spawn(c.x + Math.cos(a) * d, 0.2, c.z + Math.sin(a) * d, Math.cos(a) * 0.6, rand(4, 9), Math.sin(a) * 0.6,
        { life: rand(0.5, 0.9), size: rand(0.6, 1.2), size1: 0.2, color: pal.main, color1: pal.deep, alpha: 0.5, drag: 2, spin: rand(-3, 3) });
      this.P.glow.spawn(c.x + Math.cos(a) * d, 0.3, c.z + Math.sin(a) * d, Math.cos(a) * 1.5, rand(5, 10), Math.sin(a) * 1.5, { life: rand(0.8, 1.4), size: 0.22, color: pal.core, color1: pal.main, drag: 1.5 });
    }
  }

  // Thunderstorm: lightning strikes all over the area
  stormNova(pal, c, R) {
    this.groundGlow(pal.deep, c, R, 1.6, 0.3);
    for (let i = 0; i < 7; i++) this.later(i * 0.12 + Math.random() * 0.08, () => {
      const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * R;
      const spot = { root: { position: new THREE.Vector3(c.x + Math.cos(a) * d, 0, c.z + Math.sin(a) * d) }, height: 1.8, size: 1 };
      this.lightningStrike(pal, spot, i % 3 === 0);
    });
  }
  // Raise Dead / Summon: the ground cracks open in several places and things climb out
  gravesNova(pal, c, R) {
    this.groundRing(pal.main, c, R, 0.8, { from: 0.5, opacity: 0.7 });
    this.shake(0.06, c);
    for (let i = 0; i < 6; i++) this.later(i * 0.1, () => {
      const a = i / 6 * Math.PI * 2 + rand(-0.4, 0.4), d = R * rand(0.35, 0.85);
      const p = new THREE.Vector3(c.x + Math.cos(a) * d, 0.1, c.z + Math.sin(a) * d);
      this.groundGlow(pal.main, p, 1.4, 1.5, 0.9);
      this.scorch(p, 1.3, 5, pal.el === "fire" ? 0x000000 : 0x05020a);
      this.flash(p.clone().setY(0.6), pal.main, 2.4, 0.4);
      this.light(pal.light, p.clone().setY(1), 20, 0.6, 6);
      this.emit({ ...ELEMENTS.earth, el: "earth" }, "burst", p, 6, 0.8);
      if (this.fancy) for (let j = 0; j < 14; j++) this.emit(pal, "rise", p.clone().add(new THREE.Vector3(rand(-0.4, 0.4), 0, rand(-0.4, 0.4))), 1, 1.6);
    });
  }

  // Whirlwind / Soul Cleave: blade trails spinning all the way around
  whirlwind(spec, pal, actor, s) {
    const R = Math.min(spec.radius || 6, 5) * 0.55 * s, r0 = R * 0.45;
    const N = 48, sweep = 2.2;
    const pos = [], uv = [], idx = [];
    for (let i = 0; i <= N; i++) {
      const th = (i / N) * sweep;
      for (const [r, v] of [[r0, 0], [R, 1]]) { pos.push(Math.sin(th) * r, 0, Math.cos(th) * r); uv.push(i / N, v); }
      if (i < N) { const q = i * 2; idx.push(q, q + 1, q + 2, q + 1, q + 3, q + 2); }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    const mat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: col3(pal.main) }, uCore: { value: col3(pal.core) }, uHead: { value: 1 }, uTail: { value: 1 }, uOpacity: { value: 1 } },
      vertexShader: SLASH_VS, fragmentShader: SLASH_FS, ...additive, side: THREE.DoubleSide,
    });
    const blades = [0, 1].map(i => { const m = new THREE.Mesh(geo, mat); m.userData.keepMat = i > 0; m.userData.ownGeo = i === 0; return m; });
    const group = new THREE.Group(); group.add(...blades);
    blades[1].rotation.y = Math.PI; blades[1].position.y = 0.25;
    blades[0].rotation.z = 0.12; blades[1].rotation.z = -0.12;
    this.add(0.85, [group], (k, dt) => {
      const p = actor.root.position;
      group.position.set(p.x, p.y + actor.height * 0.45, p.z);
      group.rotation.y -= dt * 17;
      mat.uniforms.uOpacity.value = Math.min(1, k * 8) * Math.pow(1 - k, 0.8);
      if (this.fancy && Math.random() < 0.8) {
        const a = Math.random() * Math.PI * 2;
        this.emit(pal.el === "physical" ? { ...ELEMENTS.earth, el: "earth" } : pal, "burst", { x: p.x + Math.cos(a) * R, y: 0.15, z: p.z + Math.sin(a) * R }, 1, 0.6);
      }
    });
    this.groundRing(pal.main, feet(actor), R * 1.3, 0.6, { opacity: 0.6 });
  }

  // Battle Shout / Challenge: a roar — rings of force and a flash of rage
  shout(spec, pal, actor, s) {
    const c = feet(actor), R = spec.radius || 12;
    for (let i = 0; i < 3; i++) this.groundRing(pal.main, c, R * (0.6 + i * 0.2), 0.7, { delay: i * 0.12, wall: 1.4 - i * 0.3, opacity: 0.9 - i * 0.2 });
    const head = chest(actor); head.y += actor.height * 0.3;
    this.flash(head, pal.main, 3.5 * s, 0.4);
    this.flash(head, pal.core, 1.5 * s, 0.2, TEX.spark);
    this.light(pal.light, head, 45, 0.6, 14);
    this.emit(pal, "burst", head, 16, 1.2);
    this.shake(0.08, c);
  }

  heal(spec, pal, target) {
    const big = spec.big;
    this.sigil(pal.main, target, (big ? 1.6 : 1.1) * (target.size || 1), big ? 1.6 : 1.2);
    this.flash(chest(target), pal.main, big ? 3.2 : 2.2, 0.45);
    this.light(pal.light, chest(target), big ? 30 : 16, big ? 1.2 : 0.8, 6, () => chest(target), 0.3);
    if (big) this.column(pal, target, 0.5, 7, 1.0, { grow: 0.15 });
    if (!this.fancy) return;
    // spirals of light rising around them
    const strands = 3;
    let acc = 0;
    this.add(big ? 1.1 : 0.85, [], (k, dt, fx) => {
      acc += dt;
      while (acc > 0.012) {
        acc -= 0.012;
        const p = target.root.position, r = 0.55 * (target.size || 1);
        for (let j = 0; j < strands; j++) {
          const a = fx.t * 11 + j / strands * Math.PI * 2;
          const y = 0.1 + ((fx.t / fx.life + j * 0.23) % 1) * target.height * 1.1;
          this.P.glow.spawn(p.x + Math.cos(a) * r, y, p.z + Math.sin(a) * r, 0, 0.3, 0, { life: 0.28, size: 0.36, size1: 0.1, color: pal.core, color1: pal.main, drag: 2 });
        }
      }
      if (Math.random() < 0.5) this.emit(pal, "rise", { x: target.root.position.x + rand(-0.6, 0.6), y: 0.2, z: target.root.position.z + rand(-0.6, 0.6) }, 1, 1);
    });
    if (pal.el === "holy" && big) for (let i = 0; i < 10; i++) {   // feathers drifting down
      const p = target.root.position;
      this.P.feather.spawn(p.x + rand(-1, 1), target.height + rand(1, 2.5), p.z + rand(-1, 1), rand(-0.2, 0.2), -0.6, rand(-0.2, 0.2), { life: 2, size: 0.25, color: 0xfffaf0, drag: 1.5, grav: 0.3, spin: rand(-2, 2) });
    }
  }

  shield(spec, pal, target) {
    if (pal.el === "smoke") return this.evade(pal, target);
    const big = spec.big;
    const mat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: col3(pal.main) }, uCore: { value: col3(pal.core) }, uOpacity: { value: 0 }, uScan: { value: 0 }, uTime: { value: 0 },
        uPattern: { value: pal.el === "arcane" || pal.el === "storm" || pal.el === "frost" ? 1 : pal.el === "holy" ? 0.5 : 0.2 } },
      vertexShader: SHIELD_VS, fragmentShader: SHIELD_FS, ...additive, side: THREE.DoubleSide,
    });
    const bubble = new THREE.Mesh(GEO.sphere, mat);
    const objs = [bubble];
    // Bone Shield: bones circling; Barkskin: bark chips; Recklessness: rage flames
    const bits = [];
    if (pal.el === "bone") for (let i = 0; i < 7; i++) {
      const b = new THREE.Mesh(GEO.boneBit, new THREE.MeshStandardMaterial({ color: 0xf0e8d0, roughness: 0.7, emissive: 0x6a5a3a }));
      b.userData.a = i / 7 * Math.PI * 2; b.userData.y = rand(0.3, 0.8);
      bits.push(b); objs.push(b);
    }
    const life = big ? 1.8 : 1.4;
    const r = () => target.height * (big ? 0.85 : 0.68);
    this.add(life, objs, (k, dt, fx) => {
      const c = chest(target);
      bubble.position.copy(c);
      const pop = fx.t < 0.18 ? ease(fx.t / 0.18) * 1.12 : 1.12 - Math.min(0.12, (fx.t - 0.18) * 0.6);
      const rr = r() * pop;
      bubble.scale.set(rr * 0.85, rr, rr * 0.85);
      mat.uniforms.uOpacity.value = (fx.t < 0.12 ? 1.6 : 1) * (k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1) * 0.9;
      mat.uniforms.uScan.value = (fx.t * 0.9) % 1.2 - 0.1;
      mat.uniforms.uTime.value = fx.t;
      for (const b of bits) {
        const a = b.userData.a + fx.t * 3.2;
        b.position.set(c.x + Math.cos(a) * rr * 1.05, target.root.position.y + target.height * b.userData.y, c.z + Math.sin(a) * rr * 1.05);
        b.rotation.set(fx.t * 4 + b.userData.a, a, 0.6);
        b.scale.setScalar(2.2 * Math.min(1, fx.t * 6) * (k > 0.8 ? (1 - k) * 5 : 1));
      }
      if (this.fancy && Math.random() < (pal.el === "blood" ? 0.9 : 0.35)) {
        const a = Math.random() * Math.PI * 2;
        const p = { x: c.x + Math.cos(a) * rr * 0.8, y: target.root.position.y + rand(0.1, target.height), z: c.z + Math.sin(a) * rr * 0.8 };
        if (pal.el === "blood") this.P.flame.spawn(p.x, 0.1, p.z, 0, rand(1.5, 3), 0, { life: 0.5, size: 0.45, size1: 0.1, color: 0xff8060, color1: pal.deep, alpha: 0.8, drag: 2 });
        else this.emit(pal, "rise", p, 1, 0.6);
      }
    });
    this.groundRing(pal.main, feet(target), r() * 1.6, 0.5, { opacity: 0.8 });
    this.flash(chest(target), pal.core, r() * 2.4, 0.2);
    this.light(pal.light, chest(target), big ? 30 : 15, life, 6, () => chest(target), 0.4);
    if (spec.pillar) this.column(pal, target, 1.2, 14, 1.4);
  }
  // Evasion: afterimages — smoke swirling round the rogue
  evade(pal, target) {
    if (!this.fancy) return;
    this.add(0.9, [], (k, dt, fx) => {
      const p = target.root.position;
      for (let j = 0; j < 2; j++) {
        const a = fx.t * 10 + j * Math.PI;
        this.P.smoke.spawn(p.x + Math.cos(a) * 0.7, rand(0.3, target.height), p.z + Math.sin(a) * 0.7, -Math.sin(a) * 2, 0.2, Math.cos(a) * 2, { life: 0.6, size: 0.4, size1: 0.9, color: 0x8a8a9a, alpha: 0.45, drag: 3, spin: 2 });
      }
    });
  }

  pillar(spec, pal, target) {
    const big = spec.big || pal.el === "holy";
    this.column(pal, target, big ? 1.0 : 0.8, 18, big ? 2.0 : 1.5, { grow: 0.1 });
    this.sigil(pal.main, target, big ? 2.4 : 1.8, big ? 2.2 : 1.6, 0.4);
    this.groundRing(pal.main, feet(target), 4, 0.7, { wall: 1.2, opacity: 0.6 });
    this.flash(chest(target), pal.core, 4, 0.5);
    this.light(pal.light, chest(target), 60, 1.8, 14, () => chest(target), 0.4);
    if (!this.fancy) return;
    this.add(1.6, [], (k) => {
      const p = target.root.position;
      for (let i = 0; i < 3; i++) this.emit(pal, "rise", { x: p.x + rand(-1, 1), y: rand(0, 1), z: p.z + rand(-1, 1) }, 1, 2);
    });
    if (pal.el === "holy") for (let i = 0; i < 16; i++) {
      const p = target.root.position;
      this.P.feather.spawn(p.x + rand(-1.5, 1.5), rand(4, 8), p.z + rand(-1.5, 1.5), rand(-0.3, 0.3), -0.8, rand(-0.3, 0.3), { life: 2.6, size: 0.26, color: 0xfffaf0, drag: 1.2, grav: 0.4, spin: rand(-2, 2) });
    }
  }

  beam(spec, pal, from, to) {
    const storm = pal.el === "storm";
    const mat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: col3(pal.main) }, uCore: { value: col3(pal.core) }, uOpacity: { value: 1 }, uTime: { value: 0 }, uLen: { value: 1 },
        uFlow: { value: spec.drain ? -9 : 9 }, uNoise: { value: storm ? 0.2 : 1 } },
      vertexShader: BEAM_VS, fragmentShader: BEAM_FS, ...additive, side: THREE.DoubleSide,
    });
    const geo = new THREE.BufferGeometry();
    const mesh = new THREE.Mesh(geo, mat);
    mesh.userData.ownGeo = true;
    const endA = new THREE.Sprite(spriteMat(pal.main, TEX.glow, 0.9)), endB = new THREE.Sprite(spriteMat(pal.main, TEX.glow, 0.9));
    const a = new THREE.Vector3(), b = new THREE.Vector3();
    const life = storm ? 0.45 : spec.drain ? 0.9 : 0.6;
    let regen = 0, width = storm ? 0.22 : spec.drain || spec.pull ? 0.5 : 0.36;
    this.add(life, [mesh, endA, endB], (k, dt, fx) => {
      chest(from, a); chest(to, b);
      a.x += Math.cos(from.facing) * 0.4; a.z += Math.sin(from.facing) * 0.4;
      mat.uniforms.uTime.value = fx.t;
      mat.uniforms.uLen.value = a.distanceTo(b);
      regen -= dt;
      if (regen <= 0) {
        regen = storm ? 0.045 : 0.0;
        const pts = storm ? boltPath(a, b, 0.22, 5) : (() => {   // a gently waving beam
          const out = [];
          for (let i = 0; i <= 24; i++) {
            const t = i / 24, p = a.clone().lerp(b, t);
            const wave = Math.sin(t * Math.PI) * (spec.pull ? 0.5 : 0.15);
            p.y += Math.sin(t * 9 - fx.t * 14) * wave; p.x += Math.cos(t * 7 - fx.t * 11) * wave * 0.6;
            out.push(p);
          }
          return out;
        })();
        ribbonGeometry(pts, width, geo);
      }
      const op = k < 0.1 ? k / 0.1 : 1 - Math.pow(Math.max(0, k - 0.5) / 0.5, 2);
      mat.uniforms.uOpacity.value = op * (storm ? (Math.random() < 0.25 ? 0.4 : 1.2) : 1);
      endA.position.copy(a); endB.position.copy(b);
      endA.scale.setScalar(0.9 * op); endB.scale.setScalar(1.6 * op);
      // energy flowing along it (toward the caster for drains)
      if (this.fancy && Math.random() < 0.8) {
        const t = Math.random(), p = a.clone().lerp(b, t);
        const v = (spec.drain ? a.clone().sub(b) : b.clone().sub(a)).normalize().multiplyScalar(6);
        if (storm) this.emit(pal, "burst", p, 1, 0.4);
        else this.P.glow.spawn(p.x, p.y, p.z, v.x, v.y, v.z, { life: 0.35, size: 0.22, size1: 0.05, color: pal.core, color1: pal.main, drag: 0.5 });
      }
    });
    this.light(pal.light, chest(to), 20, life, 6, () => chest(to));
    this.later(0.04, () => this.impact(pal, chest(to), 0.7));
    if (storm) this.flash(chest(to), 0xffffff, 2.5, 0.15, TEX.spark);
  }

  // Breath: fire or lightning pours out over the cone
  breath(spec, pal, actor, s) {
    const len = (spec.length || 8) * Math.max(1, s * 0.4), half = (spec.angle || 1.2) / 2;
    const mouth = () => {
      const p = chest(actor); p.y += actor.height * 0.15;
      p.x += Math.cos(actor.facing) * actor.height * 0.35; p.z += Math.sin(actor.facing) * actor.height * 0.35;
      return p;
    };
    const life = 1.1, storm = pal.el === "storm";
    this.light(pal.light, mouth(), 70, life, len * 1.4, () => mouth().addScaledVector(new THREE.Vector3(Math.cos(actor.facing), 0, Math.sin(actor.facing)), len * 0.4), 0.6);
    const bolts = [];
    if (storm) for (let i = 0; i < 4; i++) {
      const mat = new THREE.ShaderMaterial({
        uniforms: { uColor: { value: col3(pal.main) }, uCore: { value: col3(pal.core) }, uOpacity: { value: 1 }, uTime: { value: 0 }, uLen: { value: len }, uFlow: { value: 9 }, uNoise: { value: 0.2 } },
        vertexShader: BEAM_VS, fragmentShader: BEAM_FS, ...additive, side: THREE.DoubleSide,
      });
      const m = new THREE.Mesh(new THREE.BufferGeometry(), mat);
      m.userData.ownGeo = true; m.userData.regen = 0;
      bolts.push(m);
    }
    // the scorched (or charged) ground in front
    const fanGeo = (() => {   // a fan-shaped patch: u = out from the mouth, v = across
      const pos = [], uv = [], idx = [], N = 24, M = 6;
      for (let i = 0; i <= N; i++) for (let j = 0; j <= M; j++) {
        const a = -half + (i / N) * half * 2, r = (j / M) * len;
        pos.push(Math.cos(a) * r, Math.sin(a) * r, 0); uv.push(j / M, i / N);
        if (i < N && j < M) { const q = i * (M + 1) + j; idx.push(q, q + M + 1, q + 1, q + 1, q + M + 1, q + M + 2); }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
      return g;
    })();
    const fan = new THREE.Mesh(fanGeo, new THREE.ShaderMaterial({
      uniforms: { uColor: { value: col3(pal.main) }, uOpacity: { value: 0 } },
      vertexShader: SLASH_VS,
      fragmentShader: `uniform vec3 uColor; uniform float uOpacity; varying vec2 vUv;
        void main() { float a = smoothstep(0.0, 0.4, vUv.y) * smoothstep(1.0, 0.6, vUv.y) * smoothstep(1.0, 0.5, vUv.x) * smoothstep(0.05, 0.3, vUv.x);
          gl_FragColor = vec4(uColor, a * uOpacity);
          ${COLORSPACE}
        }`,
      ...additive, side: THREE.DoubleSide,
    }));
    fan.userData.ownGeo = true;
    fan.rotation.x = -Math.PI / 2;
    this.add(life + 1.2, [fan, ...bolts], (k, dt, fx) => {
      const t = fx.t, on = t < life;
      const m = mouth(), f = actor.facing;
      fan.position.set(actor.root.position.x, 0.05, actor.root.position.z);
      fan.rotation.z = -f;
      fan.material.uniforms.uOpacity.value = Math.min(0.5, t * 1.5) * (on ? 1 : Math.max(0, 1 - (t - life) / 1.2));
      if (on && this.fancy) {
        const n = storm ? 4 : 9;
        for (let i = 0; i < n; i++) {
          const a = f + rand(-half, half) * 0.9, sp = len / rand(0.45, 0.65);
          const vx = Math.cos(a) * sp, vz = Math.sin(a) * sp, vy = -m.y / 0.55 * rand(0.3, 0.8);
          if (pal.el === "fire") {
            this.P.flame.spawn(m.x, m.y, m.z, vx, vy, vz, { life: rand(0.45, 0.65), size: 0.4 * s, size1: rand(1.6, 2.6) * Math.sqrt(s), color: Math.random() < 0.25 ? pal.core : pal.main, color1: pal.deep, alpha: 0.32, drag: 1.4, grav: -1, spin: rand(-3, 3) });
            if (Math.random() < 0.25) this.P.smoke.spawn(m.x + vx * 0.4, m.y + 0.5, m.z + vz * 0.4, vx * 0.4, 1, vz * 0.4, { life: 1.2, size: 1, size1: 3, color: pal.smoke, alpha: 0.35, drag: 1.5, spin: 1 });
          } else this.emit(pal, "burst", { x: m.x + vx * 0.2 * Math.random(), y: m.y, z: m.z + vz * 0.2 * Math.random() }, 1, 1.5, new THREE.Vector3(vx, vy, vz).normalize());
        }
      }
      for (const b of bolts) {
        b.userData.regen -= dt;
        if (b.userData.regen <= 0 && on) {
          b.userData.regen = rand(0.04, 0.09);
          const a = f + rand(-half, half), d = len * rand(0.6, 1);
          const end = new THREE.Vector3(actor.root.position.x + Math.cos(a) * d, rand(0, 1), actor.root.position.z + Math.sin(a) * d);
          ribbonGeometry(boltPath(m, end, 0.25, 5), 0.16, b.geometry);
          b.material.uniforms.uOpacity.value = rand(0.6, 1.3);
        }
        if (!on) b.material.uniforms.uOpacity.value = 0;
      }
    });
    this.shake(0.12, actor.root.position);
  }
  // The Hollow King's Cleave: one huge sweeping arc of shadow across the ground in front of him
  sweep(spec, pal, actor, s) {
    const len = spec.length || 8;
    this.slash({ ...spec, big: true }, pal, { ...actor, size: 1, height: actor.height, root: actor.root, facing: actor.facing }, null, len / 1.9);
    const c = feet(actor), half = (spec.angle || 1.6) / 2;
    for (let i = 0; i < 18; i++) {
      const a = actor.facing + rand(-half, half), d = len * rand(0.4, 1);
      this.later(i * 0.01, () => this.emit(pal, "burst", { x: c.x + Math.cos(a) * d, y: 0.3, z: c.z + Math.sin(a) * d }, 2, 1));
    }
    this.light(pal.light, c.clone().setY(2), 50, 0.5, len * 1.6);
    this.shake(0.14, c);
  }

  // Something hits the target from above (or out of the ground)
  strike(spec, pal, target) {
    const big = spec.big, p = chest(target), f = feet(target);
    switch (pal.el) {
      case "storm": return this.lightningStrike(pal, target, big);
      case "holy": case "arcane": {   // a shaft of light slams down
        this.column(pal, target, big ? 1.2 : 0.45, 24, big ? 0.9 : 0.5, { grow: 0.05 });
        this.impact(pal, p, big ? 1.8 : 1.1);
        this.groundRing(pal.core, f, big ? spec.radius || 5 : 2.5, 0.5, { wall: big ? 1.6 : 0.8 });
        if (big) { this.sigil(pal.main, f, spec.radius || 4, 1.2, 1); this.shake(0.12, f); }
        return;
      }
      case "fire": {   // the ground erupts in a column of fire
        this.groundGlow(pal.main, f, big ? 3.5 : 2, 0.6, 0.9);
        this.scorch(f, big ? 3 : 1.6, 6);
        this.light(pal.light, p, big ? 80 : 40, 0.8, big ? 16 : 9);
        this.flash(p, pal.core, big ? 4 : 2.2, 0.3);
        if (this.fancy) this.add(0.5, [], () => {
          for (let i = 0; i < (big ? 14 : 7); i++) {
            const a = Math.random() * Math.PI * 2, d = Math.random() * (big ? 1.3 : 0.6);
            this.P.flame.spawn(f.x + Math.cos(a) * d, 0.2, f.z + Math.sin(a) * d, Math.cos(a) * 0.8, rand(5, 10) * (big ? 1.3 : 1), Math.sin(a) * 0.8,
              { life: rand(0.4, 0.7), size: big ? 1.2 : 0.7, size1: 0.2, color: Math.random() < 0.3 ? pal.core : pal.main, color1: pal.deep, alpha: 0.5, drag: 1.8, spin: rand(-3, 3) });
          }
          if (Math.random() < 0.5) this.P.smoke.spawn(f.x, 1.5, f.z, 0, rand(2, 3), 0, { life: 1.6, size: 1, size1: big ? 4 : 2.5, color: pal.smoke, alpha: 0.4, drag: 1.2, spin: 1 });
        });
        this.emit(pal, "burst", p, big ? 24 : 12, big ? 1.8 : 1.1);
        if (big) { this.groundRing(pal.main, f, 6, 0.6, { wall: 1.6 }); this.shake(0.2, f); }
        return;
      }
      case "shadow": {   // Doom: darkness gathers, collapses inward... then bursts
        const r = big ? 2.4 : 1.6;
        this.groundGlow(pal.main, f, r * 1.5, 0.9, 0.6);
        this.light(pal.light, p, 30, 0.6, 8, null, 0.7);
        if (this.fancy) for (let i = 0; i < 30; i++) {
          const a = Math.random() * Math.PI * 2, d = rand(1.5, 3) * r, y = rand(0.2, 2.5);
          const q = new THREE.Vector3(f.x + Math.cos(a) * d, y, f.z + Math.sin(a) * d);
          const v = p.clone().sub(q).multiplyScalar(1 / 0.45);
          this.P.smoke.spawn(q.x, q.y, q.z, v.x, v.y, v.z, { life: 0.45, size: 0.6, size1: 0.2, color: pal.smoke, alpha: 0.75, drag: 0, spin: 3 });
          this.P.glow.spawn(q.x, q.y, q.z, v.x, v.y, v.z, { life: 0.45, size: 0.3, color: pal.main, color1: pal.core, drag: 0 });
          this.P.spark.spawn(q.x, q.y, q.z, v.x, v.y, v.z, { life: 0.45, size: 0.25, color: pal.core, drag: 0 });
        }
        this.later(0.45, () => {
          this.column(pal, target, 0.7, 20, 0.5, { grow: 0.04 });
          this.impact(pal, p, big ? 2 : 1.3);
          this.groundRing(pal.main, f, 4, 0.5, { wall: 1.2 });
          this.scorch(f, 2, 6, 0x05020a);
          if (big) this.shake(0.15, f);
        });
        return;
      }
      case "nature": {   // Plague: a sickly cloud bursts out of them
        this.flash(p, pal.main, 2.6, 0.4);
        this.light(pal.light, p, 25, 0.8, 7);
        if (this.fancy) for (let i = 0; i < 26; i++) {
          const a = Math.random() * Math.PI * 2, sp = rand(0.6, 2);
          this.P.smoke.spawn(p.x, p.y + rand(-0.5, 0.5), p.z, Math.cos(a) * sp, rand(0.2, 1), Math.sin(a) * sp, { life: rand(1.2, 2), size: 0.5, size1: rand(1.5, 2.5), color: 0x4a8a2a, alpha: 0.45, drag: 1.4, spin: rand(-1, 1) });
          this.P.glow.spawn(p.x, p.y, p.z, Math.cos(a) * sp * 1.5, rand(0.5, 2), Math.sin(a) * sp * 1.5, { life: rand(0.8, 1.4), size: rand(0.08, 0.18), color: 0xc8ff6a, color1: pal.deep, drag: 1.5, grav: -0.5 });
        }
        return;
      }
      case "frost": {   // a spear of ice drops and shatters
        this.rainShard(pal, target);
        return;
      }
      default:
        this.impact(pal, p, big ? 1.8 : 1.1);
    }
  }
  lightningStrike(pal, target, big) {
    const f = feet(target), top = f.clone().add(new THREE.Vector3(rand(-3, 3), 28, rand(-3, 3)));
    const hit = chest(target); hit.y = Math.max(0.3, hit.y - target.height * 0.3);
    const mats = [], meshes = [];
    for (let i = 0; i < (big ? 3 : 2); i++) {
      const mat = new THREE.ShaderMaterial({
        uniforms: { uColor: { value: col3(pal.main) }, uCore: { value: col3(0xffffff) }, uOpacity: { value: 1 }, uTime: { value: 0 }, uLen: { value: 28 }, uFlow: { value: 4 }, uNoise: { value: 0.15 } },
        vertexShader: BEAM_VS, fragmentShader: BEAM_FS, ...additive, side: THREE.DoubleSide,
      });
      const m = new THREE.Mesh(new THREE.BufferGeometry(), mat);
      m.userData.ownGeo = true;
      mats.push(mat); meshes.push(m);
    }
    const build = () => {
      // the main bolt, and forks breaking off it
      const main = boltPath(top, hit, 0.18, 6);
      ribbonGeometry(main, big ? 0.5 : 0.32, meshes[0].geometry);
      for (let i = 1; i < meshes.length; i++) {
        const from = main[Math.floor(rand(0.2, 0.7) * main.length)];
        const to = from.clone().add(new THREE.Vector3(rand(-5, 5), -rand(4, 9), rand(-5, 5)));
        ribbonGeometry(boltPath(from, to, 0.35, 4), 0.14, meshes[i].geometry);
      }
    };
    build();
    let flick = 0;
    this.add(big ? 0.42 : 0.3, meshes, (k, dt) => {
      flick -= dt;
      if (flick <= 0) { flick = 0.05; if (Math.random() < 0.6) build(); }
      const o = (1 - k) * (Math.random() < 0.3 ? 0.35 : 1.4);
      mats.forEach(m => m.uniforms.uOpacity.value = o);
    });
    this.impact(pal, hit, big ? 1.9 : 1.2);
    this.flash(hit, 0xffffff, big ? 6 : 3.5, 0.12, TEX.spark);
    this.light(pal.light, hit.clone().setY(3), big ? 160 : 90, 0.35, big ? 30 : 20);
    this.groundRing(pal.main, f, big ? 6 : 3, 0.45, { wall: big ? 1.5 : 0.8 });
    this.scorch(f, big ? 2.2 : 1.3, 5, 0x030612);
    if (big) this.shake(0.16, f);
  }
  rainShard(pal, target) {
    const f = feet(target), start = f.clone().add(new THREE.Vector3(0, 14, 0));
    const m = new THREE.Mesh(GEO.spike, new THREE.MeshStandardMaterial({ color: 0xdff6ff, emissive: pal.main, emissiveIntensity: 0.7, roughness: 0.1, transparent: true, opacity: 0.9 }));
    m.rotation.x = Math.PI; m.scale.set(0.3, 1.6, 0.3);
    this.add(0.3, [m], (k) => {
      m.position.lerpVectors(start, f.clone().setY(1.4), k * k);
      if (k >= 1) { this.impact(pal, chest(target), 1.3); this.groundGlow(pal.core, f, 2.2, 1.5, 0.5); }
    });
  }

  meteorFall(spec, pal, target) {
    const n = spec.count || 1;
    for (let i = 0; i < n; i++) {
      const off = i === 0 ? new THREE.Vector3() : new THREE.Vector3(rand(-9, 9), 0, rand(-9, 9));
      this.later(i * rand(0.15, 0.3), () => this.oneMeteor(pal, feet(target).add(off), n > 1 ? 0.75 : 1));
    }
  }
  oneMeteor(pal, end, scale) {
    const rock = new THREE.Mesh(GEO.rock, new THREE.MeshStandardMaterial({ color: 0x2a1a12, roughness: 0.95, emissive: 0xffffff, emissiveMap: TEX.lava, emissiveIntensity: 2.2 }));
    const halo = new THREE.Sprite(spriteMat(pal.main, TEX.glow, 0.9));
    const start = end.clone().add(new THREE.Vector3(-9, 30, -6));
    const size = 1.1 * scale, pos = new THREE.Vector3();
    const life = 1.0;
    this.light(pal.light, start, 70 * scale, life + 0.05, 18, () => pos, 0.95);
    // a warning glow where it will land
    this.groundGlow(pal.main, end, 3.5 * scale, life, 0.35);
    this.add(life, [rock, halo], (k, dt) => {
      pos.lerpVectors(start, end, k * k);
      rock.position.copy(pos); halo.position.copy(pos);
      rock.scale.setScalar(size); halo.scale.setScalar(size * 4.5);
      rock.rotation.x += dt * 3; rock.rotation.y += dt * 2;
      if (this.fancy) {
        for (let i = 0; i < 4; i++) this.P.flame.spawn(pos.x + rand(-0.4, 0.4), pos.y + rand(-0.4, 0.4), pos.z + rand(-0.4, 0.4), rand(-1, 1), rand(1, 3), rand(-1, 1),
          { life: rand(0.3, 0.6), size: size * rand(1.2, 2), size1: 0.3, color: Math.random() < 0.4 ? pal.core : pal.main, color1: pal.deep, alpha: 0.6, drag: 2, spin: rand(-3, 3) });
        if (Math.random() < 0.7) this.P.smoke.spawn(pos.x, pos.y + 0.5, pos.z, rand(-0.5, 0.5), 1, rand(-0.5, 0.5), { life: rand(1.2, 2), size: size * 1.5, size1: size * 4, color: 0x2a2220, alpha: 0.5, drag: 1, spin: rand(-1, 1) });
      }
      if (k >= 1) this.explosion(pal, end, scale);
    });
  }
  explosion(pal, c, scale = 1) {
    const p = c.clone().setY(1);
    this.flash(p, 0xffffff, 5 * scale, 0.18, TEX.spark);
    this.flash(p, pal.core, 7 * scale, 0.35);
    this.flash(p, pal.main, 11 * scale, 0.6);
    this.light(pal.light, p.clone().setY(3), 220 * scale, 0.9, 34 * scale);
    this.groundRing(pal.main, c, 9 * scale, 0.65, { wall: 2.5 * scale });
    this.groundRing(0xffffff, c, 6 * scale, 0.35, { opacity: 0.6 });
    this.scorch(c, 4.5 * scale, 8);
    this.groundGlow(pal.deep, c, 4 * scale, 2.5, 0.8);
    this.shake(0.35 * scale, c);
    if (!this.fancy) return;
    for (let i = 0; i < 60 * scale; i++) {   // the fireball
      const a = Math.random() * Math.PI * 2, up = Math.random(), sp = rand(4, 11) * scale;
      this.P.flame.spawn(p.x, p.y, p.z, Math.cos(a) * sp * (1 - up * 0.6), up * sp + 2, Math.sin(a) * sp * (1 - up * 0.6),
        { life: rand(0.4, 0.8), size: rand(1, 2) * scale, size1: rand(2.2, 3.4) * scale, color: i % 4 ? pal.main : pal.core, color1: pal.deep, alpha: 0.45, drag: 3.2, spin: rand(-2, 2) });
    }
    for (let i = 0; i < 26 * scale; i++) {   // the smoke column
      const a = Math.random() * Math.PI * 2, sp = rand(0.5, 3);
      this.P.smoke.spawn(p.x + Math.cos(a), p.y + rand(0, 2), p.z + Math.sin(a), Math.cos(a) * sp, rand(2, 5), Math.sin(a) * sp,
        { life: rand(1.8, 3), size: 1.5 * scale, size1: rand(4, 6) * scale, color: 0x241c18, alpha: 0.55, drag: 1.3, spin: rand(-0.8, 0.8) });
    }
    for (let i = 0; i < 30 * scale; i++) {   // rocks and embers flying
      const a = Math.random() * Math.PI * 2, sp = rand(5, 13), up = rand(4, 11);
      this.P.chunk.spawn(p.x, p.y, p.z, Math.cos(a) * sp, up, Math.sin(a) * sp, { life: rand(0.8, 1.5), size: rand(0.12, 0.3), color: 0x3a2a20, drag: 0.3, grav: 16, spin: rand(-10, 10) });
      this.P.glow.spawn(p.x, p.y, p.z, Math.cos(a) * sp * 0.8, up * 1.2, Math.sin(a) * sp * 0.8, { life: rand(0.8, 1.8), size: rand(0.08, 0.16), color: 0xffd080, color1: pal.deep, drag: 0.5, grav: 7 });
    }
  }

  poof(spec, pal, target) {
    const big = spec.big, c = chest(target), f = feet(target);
    const sz = target.size || 1;
    if (spec.swirl) {   // Cyclone: winds whipping round
      this.add(1.3, [], (k, dt, fx) => {
        if (!this.fancy) return;
        for (let j = 0; j < 4; j++) {
          const a = fx.t * 12 + j * Math.PI / 2, r = (1 + fx.t * 3) * sz, y = rand(0, target.height * 1.5);
          this.P.glow.spawn(f.x + Math.cos(a) * r, y, f.z + Math.sin(a) * r, -Math.sin(a) * 9, 2, Math.cos(a) * 9, { life: 0.4, size: 0.3, size1: 0.6, color: pal.main, alpha: 0.4, drag: 2 });
          this.P.smoke.spawn(f.x + Math.cos(a) * r, y * 0.5, f.z + Math.sin(a) * r, -Math.sin(a) * 6, 1, Math.cos(a) * 6, { life: 0.8, size: 0.8, size1: 2, color: 0x8a9ab0, alpha: 0.3, drag: 2, spin: 3 });
        }
      });
      this.groundRing(pal.main, f, 6 * sz, 0.8, { wall: 2 });
      return;
    }
    switch (pal.el) {
      case "arcane":   // Blink: a sharp flash, a rune ring and sparkles where you were
        this.flash(c, 0xffffff, 2, 0.12, TEX.spark);
        this.flash(c, pal.main, 3.5, 0.35);
        this.sigil(pal.main, f, 1.4, 0.8, 4);
        this.emit(pal, "burst", c, 22, 1.2);
        this.light(pal.light, c, 30, 0.4, 8);
        return;
      case "smoke": {  // Stealth / Vanish: a thick cloud of smoke
        if (this.fancy) for (let i = 0; i < (big ? 36 : 20); i++) {
          const a = Math.random() * Math.PI * 2, sp = rand(0.5, 2.5);
          this.P.smoke.spawn(f.x + Math.cos(a) * 0.3, rand(0.1, target.height), f.z + Math.sin(a) * 0.3, Math.cos(a) * sp, rand(0.1, 0.8), Math.sin(a) * sp,
            { life: rand(1, 1.8), size: 0.6, size1: rand(1.8, 2.8), color: 0x7a7a8a, alpha: 0.85, drag: 2.5, spin: rand(-1.5, 1.5) });
        }
        if (big) this.flash(c, 0xffffff, 1.6, 0.1, TEX.spark);
        return;
      }
      case "earth": {  // Charge: dust kicked up
        this.emit(pal, "burst", f.clone().setY(0.2), 16, 1);
        this.groundRing(pal.main, f, 3, 0.4, { opacity: 0.5 });
        return;
      }
      default: {      // transformations, rifts, eruptions: a swirl of the element rising round them
        const R = (big ? 1.4 : 1) * sz;
        this.flash(c, pal.main, 3.5 * R, 0.45);
        this.light(pal.light, c, big ? 50 : 25, 0.8, 9 * R);
        this.groundRing(pal.main, f, 3 * R, 0.6, { wall: 1.6 });
        this.groundGlow(pal.main, f, 2 * R, 1, 0.7);
        if (big && pal.el === "fire") this.strike({ big: true }, pal, target);
        else if (big) this.column(pal, target, 0.9 * R, 12, 0.9, { grow: 0.08 });
        if (!this.fancy) return;
        this.add(0.7, [], (k, dt, fx) => {
          for (let j = 0; j < 3; j++) {
            const a = fx.t * 8 + j / 3 * Math.PI * 2, r = 0.7 * R;
            this.emit(pal, "rise", { x: f.x + Math.cos(a) * r, y: 0.2 + fx.t * target.height, z: f.z + Math.sin(a) * r }, 1, 1.4);
          }
        });
        this.emit(pal, "burst", c, big ? 20 : 10, big ? 1.4 : 1);
      }
    }
  }
}