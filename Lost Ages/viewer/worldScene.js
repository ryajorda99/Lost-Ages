// worldScene.js — the open world's scenery, built from the map the server sends (src/world/worldMap.js).
//
//   · a real sky: gradient, sun (or moon) glow, drifting clouds, stars at night, lightning over Stormreach
//   · the ground: region colours, detail texture, packed-dirt roads, mountains (and far peaks) all round
//   · grass that sways in the wind, flowers, bushes, pine and leafy trees, mossy boulders
//   · Emberhold: cobbled plaza, timber-framed houses with chimneys, a well, market stalls,
//     crates and barrels, lantern posts, a log palisade with watchtowers and signposts at each road
//   · The Hollow Barrows: graveyards with iron fences, mausoleums, dead trees, ground fog, will-o'-wisps
//   · Ashen Wastes: basalt columns, obsidian, flowing lava pools, smoking vents
//   · Stormreach Peaks: slate spires, glowing crystal clusters, wind-bent grass
//   · THE GATES: a stone archway on a rune-carved dais, a swirling portal, orbiting rune stones,
//     braziers and an avenue of glowing obelisks — each in its boss's element
//
// 3d.html calls buildWorld(map, env) once and then world.animate(dt, t, theme) every frame.

import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

// ---------------------------------------------------------------------
//  Little helpers
// ---------------------------------------------------------------------
function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
// smooth value noise (for terrain, rocks and placement)
function makeNoise(seed) {
  const r = rng(seed), P = new Uint8Array(512), V = new Float32Array(256);
  for (let i = 0; i < 256; i++) { P[i] = i; V[i] = r(); }
  for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [P[i], P[j]] = [P[j], P[i]]; }
  for (let i = 0; i < 256; i++) P[i + 256] = P[i];
  const h = (x, y) => V[P[(x & 255) + P[y & 255]]];
  const s = (t) => t * t * (3 - 2 * t);
  const n2 = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = s(xf), v = s(yf);
    return (h(xi, yi) * (1 - u) + h(xi + 1, yi) * u) * (1 - v) + (h(xi, yi + 1) * (1 - u) + h(xi + 1, yi + 1) * u) * v;
  };
  const fbm = (x, y, oct = 4) => { let v = 0, a = 0.5, f = 1; for (let i = 0; i < oct; i++) { v += a * n2(x * f, y * f); f *= 2.03; a *= 0.5; } return v / 0.9375; };
  const n3 = (x, y, z) => n2(x + z * 1.7, y - z * 1.3) * 0.5 + n2(y * 1.1 + z, x * 0.9 - z * 0.7) * 0.5;
  return { n2, fbm, n3 };
}
const NZ = makeNoise(77);

function canvas(size, h = size) { const c = document.createElement("canvas"); c.width = size; c.height = h; return [c, c.getContext("2d")]; }
function toTex(c, { repeat = [1, 1], color = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = 8;
  if (color) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
// draw something on a seamless (wrapping) canvas
const wrapDraw = (S, fn) => { for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) fn(ox, oy); };

// Push every vertex in and out with noise (rocks, bark, foliage) — makes shapes look natural
function roughen(geo, amount, freq = 1.3, seed = 0) {
  const p = geo.attributes.position, v = new THREE.Vector3();
  const seen = new Map();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const key = `${v.x.toFixed(3)},${v.y.toFixed(3)},${v.z.toFixed(3)}`;   // move shared corners together (no cracks)
    let d = seen.get(key);
    if (d == null) { d = (NZ.n3(v.x * freq + seed, v.y * freq, v.z * freq - seed) - 0.5) * 2 * amount; seen.set(key, d); }
    const len = v.length() || 1;
    v.multiplyScalar(1 + d / len);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}
// give a geometry a flat colour attribute (so merged parts can be tinted differently)
function paint(geo, hex) {
  const c = new THREE.Color(hex), n = geo.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
  geo.setAttribute("color", new THREE.BufferAttribute(a, 3));
  return geo;
}
const nonIndexed = (g) => (g.index ? g.toNonIndexed() : g);

// ---------------------------------------------------------------------
//  TEXTURES (all drawn here — no image files needed)
// ---------------------------------------------------------------------
function makeTextures() {
  const T = {};
  // Ground detail: soft patches, pebbles and short grass strokes (tinted by each region's colour)
  {
    const S = 512, [c, g] = canvas(S), r = rng(3);
    g.fillStyle = "#b4b4b4"; g.fillRect(0, 0, S, S);
    for (let i = 0; i < 260; i++) {
      const x = r() * S, y = r() * S, rad = 10 + r() * 60, v = 150 + r() * 70;
      wrapDraw(S, (ox, oy) => {
        const grd = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, rad);
        grd.addColorStop(0, `rgba(${v},${v},${v},.35)`); grd.addColorStop(1, `rgba(${v},${v},${v},0)`);
        g.fillStyle = grd; g.fillRect(x + ox - rad, y + oy - rad, rad * 2, rad * 2);
      });
    }
    for (let i = 0; i < 2600; i++) {   // grass strokes
      const x = r() * S, y = r() * S, L = 3 + r() * 7, a = -Math.PI / 2 + (r() - 0.5) * 0.9, v = 120 + r() * 120;
      g.strokeStyle = `rgba(${v},${v},${v},.55)`; g.lineWidth = 1;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * L, y + Math.sin(a) * L); g.stroke();
    }
    for (let i = 0; i < 500; i++) {   // pebbles
      const x = r() * S, y = r() * S, rad = 0.8 + r() * 2.2, v = 90 + r() * 140;
      g.fillStyle = `rgba(${v},${v},${v},.8)`; g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.fill();
    }
    T.ground = toTex(c, { repeat: [90, 90], color: false });
  }
  // Road: packed dirt with wheel ruts, stones, soft edges
  {
    const [c, g] = canvas(256, 512), r = rng(8);
    const grd = g.createLinearGradient(0, 0, 256, 0);
    grd.addColorStop(0, "rgba(120,98,66,0)"); grd.addColorStop(0.16, "rgba(120,98,66,.9)");
    grd.addColorStop(0.84, "rgba(120,98,66,.9)"); grd.addColorStop(1, "rgba(120,98,66,0)");
    g.fillStyle = grd; g.fillRect(0, 0, 256, 512);
    for (let i = 0; i < 900; i++) {
      const x = 40 + r() * 176, y = r() * 512, rad = 1 + r() * 4, v = r() < 0.5 ? "70,56,38" : "150,130,98";
      g.fillStyle = `rgba(${v},${0.2 + r() * 0.3})`; g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.fill();
    }
    for (const rx of [84, 172]) {   // ruts
      g.strokeStyle = "rgba(60,46,30,.35)"; g.lineWidth = 14; g.beginPath(); g.moveTo(rx, 0); g.lineTo(rx, 512); g.stroke();
      g.strokeStyle = "rgba(60,46,30,.25)"; g.lineWidth = 5; g.beginPath(); g.moveTo(rx + 3, 0); g.lineTo(rx + 3, 512); g.stroke();
    }
    for (let i = 0; i < 45; i++) {   // stones
      const x = 30 + r() * 196, y = r() * 512, w = 3 + r() * 6, v = 95 + r() * 55;
      g.fillStyle = `rgba(${v},${v * 0.93},${v * 0.82},.85)`;
      g.beginPath(); g.ellipse(x, y, w, w * 0.7, r() * 3, 0, Math.PI * 2); g.fill();
    }
    T.road = toTex(c, { repeat: [1, 1] });
  }
  // Grass clump: a fan of tapered blades (white — tinted per clump)
  {
    const [c, g] = canvas(128), r = rng(12);
    for (let i = 0; i < 22; i++) {
      const x = 14 + r() * 100, lean = (r() - 0.5) * 50, h = 60 + r() * 64, w = 2.5 + r() * 2.5, v = 170 + r() * 85;
      const grd = g.createLinearGradient(0, 128, 0, 128 - h);
      grd.addColorStop(0, `rgb(${v * 0.55},${v * 0.55},${v * 0.55})`); grd.addColorStop(1, `rgb(${v},${v},${v})`);
      g.fillStyle = grd;
      g.beginPath(); g.moveTo(x - w, 128); g.quadraticCurveTo(x + lean * 0.3, 128 - h * 0.6, x + lean, 128 - h); g.quadraticCurveTo(x + lean * 0.3 + w * 0.4, 128 - h * 0.6, x + w, 128); g.fill();
    }
    T.grass = toTex(c, { color: false }); T.grass.wrapS = T.grass.wrapT = THREE.ClampToEdgeWrapping;
  }
  // Flowers: a few small blossoms on stems
  {
    const [c, g] = canvas(64), r = rng(14);
    for (let i = 0; i < 4; i++) {
      const x = 10 + r() * 44, h = 26 + r() * 30;
      g.strokeStyle = "#7a8a5a"; g.lineWidth = 2; g.beginPath(); g.moveTo(x, 64); g.lineTo(x + (r() - 0.5) * 6, 64 - h); g.stroke();
      g.fillStyle = "#fff";
      for (let k = 0; k < 5; k++) { const a = k / 5 * Math.PI * 2; g.beginPath(); g.arc(x + Math.cos(a) * 3.2, 64 - h + Math.sin(a) * 3.2, 2.6, 0, Math.PI * 2); g.fill(); }
      g.fillStyle = "#ffd84a"; g.beginPath(); g.arc(x, 64 - h, 1.8, 0, Math.PI * 2); g.fill();
    }
    T.flower = toTex(c); T.flower.wrapS = T.flower.wrapT = THREE.ClampToEdgeWrapping;
  }
  // Bark: vertical ridges
  {
    const [c, g] = canvas(128, 256), r = rng(5);
    g.fillStyle = "#8a8a8a"; g.fillRect(0, 0, 128, 256);
    for (let i = 0; i < 90; i++) {
      const x = r() * 128, w = 1 + r() * 5, v = 60 + r() * 110;
      g.fillStyle = `rgba(${v},${v},${v},.6)`; g.fillRect(x, 0, w, 256);
      g.fillRect(x - 128, 0, w, 256);
    }
    for (let i = 0; i < 120; i++) { const y = r() * 256, x = r() * 128; g.fillStyle = "rgba(40,40,40,.4)"; g.fillRect(x, y, 3 + r() * 10, 1 + r() * 2); }
    T.bark = toTex(c, { repeat: [2, 2], color: false });
  }
  // Foliage: dappled leaves / needles
  {
    const S = 256, [c, g] = canvas(S), r = rng(6);
    g.fillStyle = "#9a9a9a"; g.fillRect(0, 0, S, S);
    for (let i = 0; i < 2200; i++) {
      const x = r() * S, y = r() * S, v = 90 + r() * 165, w = 2 + r() * 5;
      g.fillStyle = `rgba(${v},${v},${v},.7)`;
      wrapDraw(S, (ox, oy) => { g.beginPath(); g.ellipse(x + ox, y + oy, w, w * 0.45, r() * 3, 0, Math.PI * 2); g.fill(); });
    }
    T.foliage = toTex(c, { repeat: [2, 2], color: false });
  }
  // Plaster walls with a timber frame (the classic fantasy town house)
  {
    const S = 512, [c, g] = canvas(S), r = rng(9);
    g.fillStyle = "#d9ccb0"; g.fillRect(0, 0, S, S);
    for (let i = 0; i < 700; i++) { const x = r() * S, y = r() * S, v = 180 + r() * 60; g.fillStyle = `rgba(${v},${v - 8},${v - 24},.35)`; g.beginPath(); g.arc(x, y, 2 + r() * 10, 0, Math.PI * 2); g.fill(); }
    const beam = (x1, y1, x2, y2, w) => { g.strokeStyle = "#4a321e"; g.lineWidth = w; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
      g.strokeStyle = "rgba(255,230,190,.08)"; g.lineWidth = 2; g.beginPath(); g.moveTo(x1 + 3, y1); g.lineTo(x2 + 3, y2); g.stroke(); };
    beam(0, 12, S, 12, 26); beam(0, S - 12, S, S - 12, 26); beam(12, 0, 12, S, 24); beam(S - 12, 0, S - 12, S, 24);
    beam(0, S * 0.5, S, S * 0.5, 18);
    for (const x of [S / 3, S * 2 / 3]) beam(x, 0, x, S, 18);
    beam(24, S - 24, S / 3 - 10, S * 0.5 + 12, 14); beam(S - 24, S - 24, S * 2 / 3 + 10, S * 0.5 + 12, 14);
    beam(S / 3 + 10, 24, S * 2 / 3 - 10, S * 0.5 - 12, 12);
    T.plaster = toTex(c);
  }
  // Roof shingles
  {
    const S = 256, [c, g] = canvas(S), r = rng(10);
    const rowH = 32, tileW = 36;
    for (let row = 0; row < S / rowH; row++) {
      const off = row % 2 ? tileW / 2 : 0;
      for (let x = -tileW; x < S + tileW; x += tileW) {
        const v = 150 + r() * 80;
        g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(x + off + 1, row * rowH + 1, tileW - 2, rowH - 1);
        const grd = g.createLinearGradient(0, row * rowH, 0, row * rowH + rowH);
        grd.addColorStop(0, "rgba(255,255,255,.15)"); grd.addColorStop(0.75, "rgba(0,0,0,0)"); grd.addColorStop(1, "rgba(0,0,0,.45)");
        g.fillStyle = grd; g.fillRect(x + off + 1, row * rowH + 1, tileW - 2, rowH - 1);
      }
    }
    T.roof = toTex(c, { color: false });
  }
  // Stone blocks (foundations, the well, the gates)
  {
    const S = 256, [c, g] = canvas(S), r = rng(11);
    g.fillStyle = "#555"; g.fillRect(0, 0, S, S);
    const rowH = 32;
    for (let row = 0; row < S / rowH; row++) {
      let x = row % 2 ? -24 : 0;
      while (x < S) {
        const w = 40 + r() * 36, v = 140 + r() * 70;
        g.fillStyle = `rgb(${v},${v},${v - 6})`; g.fillRect(x + 2, row * rowH + 2, w - 4, rowH - 4);
        for (let k = 0; k < 14; k++) { const vv = v + (r() - 0.5) * 50; g.fillStyle = `rgba(${vv},${vv},${vv},.5)`; g.fillRect(x + 2 + r() * (w - 8), row * rowH + 2 + r() * (rowH - 8), 2 + r() * 6, 1 + r() * 4); }
        x += w;
      }
    }
    T.blocks = toTex(c, { color: false });
  }
  // Wood planks
  {
    const S = 256, [c, g] = canvas(S), r = rng(13);
    for (let x = 0; x < S; x += 32) {
      const v = 130 + r() * 60;
      g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(x, 0, 32, S);
      for (let k = 0; k < 9; k++) { g.strokeStyle = `rgba(60,60,60,${0.15 + r() * 0.2})`; g.lineWidth = 1; g.beginPath(); const xx = x + 3 + r() * 26; g.moveTo(xx, 0); g.bezierCurveTo(xx + 4, S * 0.3, xx - 4, S * 0.6, xx + 2, S); g.stroke(); }
      g.fillStyle = "rgba(20,20,20,.7)"; g.fillRect(x, 0, 2, S);
    }
    T.wood = toTex(c, { color: false });
  }
  // Glowing rune strip (the gates and obelisks) — used as a glow map
  {
    const [c, g] = canvas(128, 512), r = rng(21);
    g.fillStyle = "#000"; g.fillRect(0, 0, 128, 512);
    g.strokeStyle = "#fff"; g.lineWidth = 6; g.lineCap = "round"; g.shadowColor = "#fff"; g.shadowBlur = 10;
    for (let y = 40; y < 500; y += 70) {
      g.beginPath(); g.moveTo(64, y - 26); g.lineTo(64, y + 26);
      for (let k = 0; k < 3; k++) { const y1 = y + (r() - 0.5) * 44, x = 64 + (r() < 0.5 ? -1 : 1) * (14 + r() * 16); g.moveTo(64, y1); g.lineTo(x, y1 + (r() - 0.5) * 30); }
      g.stroke();
    }
    g.lineWidth = 3; g.strokeRect(10, 6, 108, 500);
    T.runes = toTex(c, { color: false });
  }
  // Rune circle for the gate's dais
  {
    const S = 1024, [c, g] = canvas(S), r = rng(22);
    g.translate(S / 2, S / 2); g.strokeStyle = g.fillStyle = "#fff"; g.lineCap = "round"; g.shadowColor = "#fff"; g.shadowBlur = 14;
    const ring = (rad, w) => { g.lineWidth = w; g.beginPath(); g.arc(0, 0, rad, 0, Math.PI * 2); g.stroke(); };
    ring(500, 8); ring(478, 3); ring(380, 3); ring(360, 7); ring(200, 4);
    for (let i = 0; i < 48; i++) {
      g.save(); g.rotate(i / 48 * Math.PI * 2); g.translate(0, -429); g.lineWidth = 5; g.beginPath(); g.moveTo(0, -26); g.lineTo(0, 26);
      for (let k = 0; k < 2 + (r() * 2 | 0); k++) { const y1 = (r() - 0.5) * 44, x = (r() < 0.5 ? -1 : 1) * (8 + r() * 10); g.moveTo(0, y1); g.lineTo(x, y1 + (r() - 0.5) * 30); }
      g.stroke(); g.restore();
    }
    for (let i = 0; i < 3; i++) { g.save(); g.rotate(i / 3 * Math.PI * 2 / 2); g.lineWidth = 5; g.beginPath(); for (let k = 0; k <= 3; k++) { const a = k / 3 * Math.PI * 2 - Math.PI / 2; g.lineTo(Math.cos(a) * 360, Math.sin(a) * 360); } g.stroke(); g.restore(); }
    T.runeCircle = toTex(c, { color: false }); T.runeCircle.wrapS = T.runeCircle.wrapT = THREE.ClampToEdgeWrapping;
  }
  // Soft round puff (fog banks, glows)
  {
    const [c, g] = canvas(128);
    const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grd.addColorStop(0, "rgba(255,255,255,1)"); grd.addColorStop(0.4, "rgba(255,255,255,.55)"); grd.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
    T.puff = toTex(c, { color: false }); T.puff.wrapS = T.puff.wrapT = THREE.ClampToEdgeWrapping;
  }
  // Striped awning cloth
  {
    const [c, g] = canvas(128);
    for (let x = 0; x < 128; x += 32) { g.fillStyle = "#e8dcc0"; g.fillRect(x, 0, 16, 128); g.fillStyle = "#a83a2a"; g.fillRect(x + 16, 0, 16, 128); }
    T.awning = toTex(c, { repeat: [2, 1] });
  }
  return T;
}

// ---------------------------------------------------------------------
//  SHADERS
// ---------------------------------------------------------------------
const NOISE_GLSL = `
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }
float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.03 + 17.0; a *= 0.5; } return v; }`;
const SKY_VS = `varying vec3 vDir; void main() { vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`;
const SKY_FS = `
uniform vec3 uTop; uniform vec3 uHorizon; uniform vec3 uBottom; uniform vec3 uSun; uniform vec3 uSunDir;
uniform float uTime; uniform float uCloud; uniform float uStars; uniform float uFlash;
varying vec3 vDir;
${NOISE_GLSL}
float hash3(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = h > 0.0 ? mix(uHorizon, uTop, pow(smoothstep(0.0, 1.0, h), 0.55)) : mix(uHorizon, uBottom, smoothstep(0.0, -0.2, h));
  float sd = max(dot(d, normalize(uSunDir)), 0.0);
  col += uSun * (pow(sd, 900.0) * 3.0 + pow(sd, 24.0) * 0.4 + pow(sd, 4.0) * 0.12);
  float cl = 0.0;
  if (h > 0.0) {
    vec2 uv = d.xz / (h + 0.12) * 0.9 + vec2(uTime * 0.008, uTime * 0.003);
    float c = fbm(uv * 1.3);
    cl = smoothstep(0.78 - uCloud * 0.28, 1.0, c) * smoothstep(0.0, 0.16, h);
    float lit = fbm(uv * 1.3 + normalize(uSunDir).xz * 0.06);
    vec3 cc = mix(uHorizon * 0.55 + uTop * 0.25, uSun * 0.9 + uHorizon * 0.3, clamp((c - lit) * 6.0 + 0.35 + pow(sd, 6.0) * 0.5, 0.0, 1.0));
    col = mix(col, cc, cl * 0.92);
  }
  if (uStars > 0.0 && h > 0.0) {
    vec3 p = floor(d * 380.0);
    float s = step(0.9982, hash3(p)) * (0.5 + 0.5 * sin(uTime * 2.0 + hash3(p + 3.0) * 30.0));
    col += vec3(s) * uStars * smoothstep(0.04, 0.35, h) * (1.0 - cl);
  }
  col += uFlash * vec3(0.55, 0.65, 0.95) * (0.35 + 0.65 * max(h, 0.0)) * (0.4 + cl);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;
const LAVA_VS = `varying vec2 vUv; varying vec3 vW; void main() { vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const LAVA_FS = `
uniform float uTime; varying vec2 vUv; varying vec3 vW;
${NOISE_GLSL}
void main() {
  vec2 p = vW.xz * 0.35;
  float n = fbm(p + vec2(uTime * 0.05, uTime * 0.03));
  float n2 = fbm(p * 2.2 - vec2(uTime * 0.08, -uTime * 0.04) + n);
  float crust = smoothstep(0.52, 0.7, n2);
  vec3 hot = mix(vec3(1.0, 0.32, 0.04), vec3(1.0, 0.85, 0.35), smoothstep(0.3, 0.05, abs(n - 0.5)));
  vec3 col = mix(hot * 2.2, vec3(0.08, 0.03, 0.02), crust);
  float edge = smoothstep(0.5, 0.42, length(vUv - 0.5));
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;
const PORTAL_VS = `varying vec2 vP; void main() { vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const PORTAL_FS = `
uniform vec3 uDeep; uniform vec3 uMain; uniform vec3 uCore; uniform float uTime; uniform float uSeed; uniform vec2 uCenter; uniform vec2 uSize;
varying vec2 vP;
${NOISE_GLSL}
void main() {
  vec2 p = (vP - uCenter) / uSize;
  float r = length(p);
  float a = atan(p.y, p.x);
  float swirl = a + 1.9 / (r + 0.28) - uTime * 0.85;
  vec2 q = vec2(cos(swirl), sin(swirl)) * (0.4 + r * 2.4);
  float n = fbm(q * 1.4 + uSeed + vec2(uTime * 0.12, 0.0));
  float n2 = fbm(q * 3.1 - uTime * 0.25 + n * 1.5);
  float bands = smoothstep(0.32, 0.92, n * 0.65 + n2 * 0.55);
  vec3 col = mix(uDeep, uMain, bands);
  col = mix(col, uCore, smoothstep(0.42, 0.0, r) * 0.85);                         // the bright eye
  col += uCore * pow(max(0.0, 1.0 - abs(r - 0.22 - 0.04 * sin(uTime * 2.3)) * 7.0), 3.0) * 0.35;
  col *= 0.75 + 0.6 * bands;
  float edge = smoothstep(0.78, 1.0, r);
  col += uMain * edge * 0.9;
  gl_FragColor = vec4(col, 0.9 + 0.1 * bands);
  #include <colorspace_fragment>
}`;

// Water: rippling surface that reflects the sky and glints in the sun
const WATER_VS = `
varying vec3 vW;
#include <fog_pars_vertex>
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz;
  vec4 mvPosition = viewMatrix * w;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const WATER_FS = `
uniform float uTime; uniform vec3 uTop; uniform vec3 uHorizon; uniform vec3 uSun; uniform vec3 uSunDir; uniform vec3 uDeep;
uniform vec3 uCenter; uniform float uRadius; uniform float uSpecK;
varying vec3 vW;
${NOISE_GLSL}
#include <fog_pars_fragment>
float waves(vec2 p) {
  return noise(p * 0.7 + uTime * vec2(0.25, 0.17)) * 0.55 + noise(p * 1.9 - uTime * vec2(0.2, 0.33)) * 0.3 + noise(p * 4.7 + uTime * 0.6) * 0.15;
}
void main() {
  vec2 p = vW.xz;
  float e = 0.15;
  float dx = waves(p + vec2(e, 0.0)) - waves(p - vec2(e, 0.0));
  float dz = waves(p + vec2(0.0, e)) - waves(p - vec2(0.0, e));
  vec3 n = normalize(vec3(-dx * 1.4, 1.0, -dz * 1.4));
  vec3 V = normalize(cameraPosition - vW);
  float fres = 0.03 + 0.97 * pow(1.0 - max(dot(n, V), 0.0), 5.0);
  vec3 R = reflect(-V, n);
  vec3 sky = mix(uHorizon, uTop, pow(clamp(R.y, 0.0, 1.0), 0.5));
  float d = length(vW.xz - uCenter.xz) / uRadius;
  vec3 deep = mix(uDeep, uDeep * 1.8 + vec3(0.02, 0.05, 0.04), smoothstep(0.55, 1.0, d));   // shallower (lighter) near the shore
  vec3 col = mix(deep, sky, fres);
  float spec = pow(max(dot(R, normalize(uSunDir)), 0.0), 220.0);
  col += uSun * spec * 2.5 * uSpecK;   // bright sun glints by day, a faint shimmer of moonlight at night
  float alpha = mix(0.93, 0.55, smoothstep(0.82, 1.0, d));
  gl_FragColor = vec4(col, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

// ---------------------------------------------------------------------
//  The sky for each part of the world
// ---------------------------------------------------------------------
const SKIES = {
  town:   { top: 0x22335a, horizon: 0xc98f66, bottom: 0x2a2420, sun: 0xffc78a, dir: [0.8, 0.16, 0.55], cloud: 0.55, stars: 0.2 },
  shadow: { top: 0x070918, horizon: 0x342f52, bottom: 0x0c0a14, sun: 0x9fb0ff, dir: [0.4, 0.32, -0.6], cloud: 0.6, stars: 1.0 },
  fire:   { top: 0x170604, horizon: 0x8a3212, bottom: 0x1c0806, sun: 0xff7a3a, dir: [0.55, 0.07, 0.5], cloud: 0.9, stars: 0 },
  storm:  { top: 0x0d1424, horizon: 0x48607f, bottom: 0x141a26, sun: 0xb8ccff, dir: [0.1, 0.45, 0.7], cloud: 1.0, stars: 0 },
};
// Times of day (the town and the wilds follow these; the three regions keep most of their own mood)
const DAY_SKY   = { top: 0x2f62b8, horizon: 0xaecbe8, bottom: 0x4a4e44, sun: 0xfff0d6, cloud: 0.3, stars: 0 };
const NIGHT_SKY = { top: 0x03060f, horizon: 0x141c34, bottom: 0x07080d, sun: 0x9aaae0, cloud: 0.45, stars: 1 };
const DAY_LENGTH = 24 * 60;   // seconds for a full day and night when the time of day is "cycle"
const TIME_FIXED = { day: 0.4, dusk: 0.735, night: 0.0 };
const THEME = {
  shadow: { deep: 0x12062a, main: 0x8a4cff, core: 0xeadcff, flame: 0x9a6aff, light: 0x9a6aff },
  fire:   { deep: 0x2a0602, main: 0xff5a14, core: 0xffe8a0, flame: 0xff7a2a, light: 0xff6a1a },
  storm:  { deep: 0x041228, main: 0x3a9cff, core: 0xeaf6ff, flame: 0x6ac8ff, light: 0x6ac8ff },
};

// =====================================================================
//  BUILD
// =====================================================================
export function buildWorld(map, env) {
  const { scene, effects, taperTube, lavaTex, stoneTex } = env;
  const G = new THREE.Group();
  scene.add(G);
  const disposables = [];
  const T = makeTextures();
  Object.values(T).forEach(t => disposables.push(t));
  const R = map.radius, rnd = rng(1234);
  const town = map.town;
  let windowMatRef = { emissiveIntensity: 0 };
  const anim = { fires: [], smokes: [], banners: [], wisps: [], fogs: [], portals: [], stones: [], lights: [], crystals: [], vents: [], arcs: [], timeUniforms: [] };
  const time = { value: 0 };

  // ----- where things can go -----
  const roadDist = (x, y) => Math.min(...map.doors.map(d => {
    const ax = town.x, ay = town.y, bx = d.x - ax, by = d.y - ay, L = bx * bx + by * by;
    const t = Math.max(0, Math.min(1, ((x - ax) * bx + (y - ay) * by) / L));
    return Math.hypot(x - (ax + bx * t), y - (ay + by * t));
  }));
  const regionOf = (x, y) => {
    for (const r of map.regions) if (Math.hypot(x - r.center.x, y - r.center.y) < r.radius) return r.key;
    return Math.hypot(x - town.x, y - town.y) < town.radius + 6 ? "town" : "wilds";
  };
  const lakes = [];   // filled in just below — nothing grows or stands in the water
  const inLake = (x, y, margin = 0) => lakes.some(l => Math.hypot(x - l.x, y - l.y) < l.r + margin);
  const clear = (x, y, gap = 6) => !inLake(x, y, 2.5) && roadDist(x, y) > 6 + gap
    && map.camps.every(c => Math.hypot(x - c.x, y - c.y) > 10)
    && (map.havens || []).every(h => Math.hypot(x - h.x, y - h.y) > 13)
    && map.doors.every(d => Math.hypot(x - d.x, y - d.y) > 26)
    && Math.hypot(x - town.x, y - town.y) > town.radius + 5
    && Math.hypot(x, y) < R - 6;
  const scatter = (n, inRegion, gap = 6, test = clear) => {
    const out = [];
    const want = Array.isArray(inRegion) ? inRegion : [inRegion];
    for (let tries = 0; out.length < n && tries < n * 50; tries++) {
      const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * R;
      const x = Math.cos(a) * d, y = Math.sin(a) * d;
      if (want.includes(regionOf(x, y)) && test(x, y, gap)) out.push({ x, y, s: 0.7 + rnd() * 0.7, r: rnd() * Math.PI * 2 });
    }
    return out;
  };
  // Lakes in the wilds, well away from roads, camps and town
  {
    const lr = rng(91);
    for (let tries = 0; lakes.length < 3 && tries < 400; tries++) {
      const a = lr() * Math.PI * 2, d = 70 + lr() * (R - 110), r = 11 + lr() * 8;
      const x = Math.cos(a) * d, y = Math.sin(a) * d;
      if (regionOf(x, y) !== "wilds") continue;
      if (roadDist(x, y) < r + 10 || map.camps.some(c => Math.hypot(x - c.x, y - c.y) < r + 14) || Math.hypot(x - town.x, y - town.y) < town.radius + r + 14) continue;
      if (map.doors.some(dd => Math.hypot(x - dd.x, y - dd.y) < r + 40) || lakes.some(l => Math.hypot(x - l.x, y - l.y) < l.r + r + 30) || Math.hypot(x, y) > R - r - 20) continue;
      lakes.push({ x, y, r, seed: lr() * 100 });
    }
  }
  // Many copies of one shape in a single draw (with a colour per copy)
  const instanced = (geo, material, spots, { y = 0, tilt = 0, shadow = true, colors = null, scaleY = 1, cast = shadow } = {}) => {
    if (!spots.length) return null;
    const m = new THREE.InstancedMesh(geo, material, spots.length);
    const o = new THREE.Object3D(), c = new THREE.Color();
    spots.forEach((p, i) => {
      o.position.set(p.x, (p.h ?? 0) + y * p.s, p.y);
      o.rotation.set((rnd() - 0.5) * tilt, p.r, (rnd() - 0.5) * tilt);
      o.scale.set(p.s * (p.sx ?? 1), p.s * scaleY * (p.sy ?? 1), p.s * (p.sz ?? 1));
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
      if (colors) { c.setHex(typeof colors === "function" ? colors(p, i) : colors[i % colors.length]); m.setColorAt(i, c); }
    });
    m.castShadow = cast; m.receiveShadow = true;
    G.add(m);
    disposables.push(geo);
    return m;
  };
  const M = (color, o = {}) => { const m = new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0, ...o }); disposables.push(m); return m; };
  const mesh = (geo, material, x = 0, y = 0, z = 0, parent = G) => { const m = new THREE.Mesh(geo, material); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m; };
  const spriteGlow = (color, size, x, y, z, opacity = 0.8, parent = G) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.puff, color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, fog: true }));
    s.scale.setScalar(size); s.position.set(x, y, z); parent.add(s); disposables.push(s.material);
    return s;
  };
  // grass and flowers sway in the wind (a small change to the standard shader)
  const windy = (material, strength = 1) => {
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = time;
      shader.vertexShader = "uniform float uTime;\n" + shader.vertexShader.replace("#include <begin_vertex>", `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec3 ip = vec3(instanceMatrix[3][0], 0.0, instanceMatrix[3][2]);
        #else
          vec3 ip = vec3(0.0);
        #endif
        float sway = sin(uTime * 1.7 + ip.x * 0.31 + ip.z * 0.23) + 0.45 * sin(uTime * 3.3 + ip.x * 0.9 - ip.z * 0.4);
        transformed.x += sway * ${(0.13 * strength).toFixed(3)} * position.y;
        transformed.z += sway * ${(0.08 * strength).toFixed(3)} * position.y;`);
      shader.fragmentShader = shader.fragmentShader.replace("#include <normal_fragment_begin>", "#include <normal_fragment_begin>\n  normal = normalize(vNormal);");
    };
    return material;
  };

  // =================================================================
  //  SKY
  // =================================================================
  const skyU = {
    uTop: { value: new THREE.Color(SKIES.town.top) }, uHorizon: { value: new THREE.Color(SKIES.town.horizon) }, uBottom: { value: new THREE.Color(SKIES.town.bottom) },
    uSun: { value: new THREE.Color(SKIES.town.sun) }, uSunDir: { value: new THREE.Vector3(...SKIES.town.dir) }, uTime: time,
    uCloud: { value: SKIES.town.cloud }, uStars: { value: SKIES.town.stars }, uFlash: { value: 0 },
  };
  const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 48, 24), new THREE.ShaderMaterial({ uniforms: skyU, vertexShader: SKY_VS, fragmentShader: SKY_FS, side: THREE.BackSide, depthWrite: false, fog: false }));
  sky.frustumCulled = false; sky.renderOrder = -100;
  G.add(sky); disposables.push(sky.geometry, sky.material);

  // =================================================================
  //  GROUND + MOUNTAINS
  // =================================================================
  const size = (R + 140) * 2, seg = 260;
  const groundGeo = new THREE.PlaneGeometry(size, size, seg, seg).rotateX(-Math.PI / 2);
  const pos = groundGeo.attributes.position, cols = new Float32Array(pos.count * 3), rockMask = new Float32Array(pos.count);
  const C = {
    wilds: new THREE.Color(0x4a5a2c), wilds2: new THREE.Color(0x5e6a34), town: new THREE.Color(0x6e6044), crypt: new THREE.Color(0x3c3a44),
    volcano: new THREE.Color(0x2c1a16), storm: new THREE.Color(0x4c5658), rock: new THREE.Color(0x5a5650), rock2: new THREE.Color(0x3e3a36),
    snow: new THREE.Color(0xdde4ee), road: new THREE.Color(0x7a6448),
  };
  const col = new THREE.Color(), tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getZ(i), d = Math.hypot(x, y);
    const n = NZ.fbm(x * 0.02, y * 0.02);
    col.copy(C.wilds).lerp(C.wilds2, NZ.fbm(x * 0.05 + 9, y * 0.05) * 1.2 - 0.2);
    col.lerp(C.town, 1 - Math.min(1, Math.max(0, (Math.hypot(x - town.x, y - town.y) - town.radius) / 22)));
    for (const r of map.regions) {
      const w = 1 - Math.min(1, Math.max(0, (Math.hypot(x - r.center.x, y - r.center.y) - r.radius * 0.62) / (r.radius * 0.5)));
      if (w > 0) col.lerp(C[r.key], w);
    }
    const rd = roadDist(x, y);
    if (rd < 8 && d < R) col.lerp(C.road, 0.35 * (1 - rd / 8));
    for (const l of lakes) {   // wet dark mud round the water, a deep bed under it
      const ld = Math.hypot(x - l.x, y - l.y) / l.r;
      if (ld < 1.35) col.lerp(tmp.setHex(ld < 1 ? 0x1c2a26 : 0x3a3424), ld < 1 ? 0.85 : 0.6 * (1 - (ld - 1) / 0.35));
    }
    let rk = 0;
    for (const r of map.regions) if (r.key !== "crypt") rk = Math.max(rk, 0.55 * (1 - Math.min(1, Math.max(0, (Math.hypot(x - r.center.x, y - r.center.y) - r.radius * 0.55) / (r.radius * 0.4)))));
    // mountains round the edge: ridged peaks, rock faces, snow on top
    let h = 0;
    if (d > R - 6) {
      const k = d - (R - 6);
      const ridge = 1 - Math.abs(NZ.fbm(x * 0.012, y * 0.012) * 2 - 1);
      h = Math.min(k, 50) * 0.55 + ridge * Math.min(k, 80) * 0.6 + NZ.fbm(x * 0.06, y * 0.06) * Math.min(k, 30) * 0.4;   // up to ~90 m
      const steep = Math.min(1, k / 10);
      rk = Math.max(rk, steep);
      col.lerp(tmp.copy(C.rock).lerp(C.rock2, NZ.fbm(x * 0.08, y * 0.08)), steep);
      if (h > 52 + n * 16) col.lerp(C.snow, Math.min(1, (h - 52 - n * 16) / 10));
    }
    pos.setY(i, h);
    col.multiplyScalar(0.8 + n * 0.35);
    cols.set([col.r, col.g, col.b], i * 3);
    rockMask[i] = rk;
  }
  // With your own photo textures (realistic mode) the colours become a gentle tint instead
  const colsReal = new Float32Array(cols.length);
  for (let i = 0; i < cols.length; i += 3) for (let c = 0; c < 3; c++) colsReal[i + c] = Math.min(1.25, 0.45 + 0.55 * cols[i + c] / [C.wilds.r, C.wilds.g, C.wilds.b][c]);
  const groundColors = new THREE.BufferAttribute(cols, 3), groundColorsReal = new THREE.BufferAttribute(colsReal, 3);
  groundGeo.setAttribute("color", groundColors);
  groundGeo.setAttribute("aRock", new THREE.BufferAttribute(rockMask, 1));
  groundGeo.computeVertexNormals();
  const groundMat = M(0xffffff, { vertexColors: true, map: T.ground, roughness: 1 });
  // (realistic mode blends a rock texture onto mountains and the rocky regions)
  const rockU = { uRockMap: { value: null }, uUseRock: { value: 0 }, uRockScale: { value: 0.12 } };
  groundMat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, rockU);
    sh.vertexShader = "attribute float aRock;\nvarying float vRock;\nvarying vec2 vWXZ;\n" + sh.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\n  vRock = aRock; vWXZ = (modelMatrix * vec4(transformed, 1.0)).xz;");
    sh.fragmentShader = "uniform sampler2D uRockMap;\nuniform float uUseRock;\nuniform float uRockScale;\nvarying float vRock;\nvarying vec2 vWXZ;\n" + sh.fragmentShader.replace("#include <map_fragment>", `#ifdef USE_MAP
    vec4 sampledDiffuseColor = texture2D( map, vMapUv );
    if (uUseRock > 0.5) sampledDiffuseColor = mix(sampledDiffuseColor, texture2D(uRockMap, vWXZ * uRockScale), clamp(vRock, 0.0, 1.0));
    diffuseColor *= sampledDiffuseColor;
  #endif`);
  };
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.receiveShadow = true;
  G.add(ground); disposables.push(groundGeo);
  // far peaks beyond the ring (silhouettes in the haze)
  {
    const peaks = [], pr = rng(55);
    for (let i = 0; i < 46; i++) {
      const a = i / 46 * Math.PI * 2 + pr() * 0.1, d = R + 150 + pr() * 120;
      peaks.push({ x: Math.cos(a) * d, y: Math.sin(a) * d, s: 1, r: pr() * 6, sx: 60 + pr() * 50, sy: 60 + pr() * 70, sz: 60 + pr() * 50 });
    }
    instanced(roughen(new THREE.ConeGeometry(1, 1, 9, 4), 0.12, 2.2, 3), M(0x4a4a52, { flatShading: true }), peaks, { y: 0.5, shadow: false });
  }

  // =================================================================
  //  ROADS (dirt tracks from town out to each gate)
  // =================================================================
  for (const d of map.doors) {
    const ax = town.x, ay = town.y, dx = d.x - ax, dy = d.y - ay, L = Math.hypot(dx, dy);
    const start = town.radius - 4, end = L - 24, len = end - start;
    const geo = new THREE.PlaneGeometry(8, len, 1, Math.ceil(len / 4)).rotateX(-Math.PI / 2);
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) * len / 10);
    const road = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: T.road, transparent: true, depthWrite: false, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2 }));
    const mid = (start + end) / 2;
    road.position.set(ax + dx / L * mid, 0.03, ay + dy / L * mid);
    road.rotation.y = Math.atan2(dx, dy);
    road.receiveShadow = true;
    G.add(road); disposables.push(geo, road.material);
  }

  // =================================================================
  //  PLANTS AND ROCKS
  // =================================================================
  // Grass (dense in the wilds and round town, sparse and dry elsewhere)
  {
    const g1 = new THREE.PlaneGeometry(1.3, 0.9).translate(0, 0.45, 0);
    const parts = [0, 1, 2].map(k => g1.clone().rotateY(k * Math.PI / 3));
    const grassGeo = mergeGeometries(parts);
    const nrm = grassGeo.attributes.normal;
    for (let i = 0; i < nrm.count; i++) nrm.setXYZ(i, 0, 1, 0);   // lit like the ground (soft, no dark backsides)
    const grassMat = windy(M(0xffffff, { map: T.grass, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 1 }));
    const grassOK = (x, y) => !inLake(x, y, 0.5) && roadDist(x, y) > 4.5 && (map.havens || []).every(h => Math.hypot(x - h.x, y - h.y) > 7.5) && Math.hypot(x - town.x, y - town.y) > 17 && map.doors.every(d => Math.hypot(x - d.x, y - d.y) > 16) && Math.hypot(x, y) < R - 4;
    const tint = { wilds: [0x6f8a3a, 0x86a046, 0x5c7a32, 0x9aa850], town: [0x7a8a42, 0x8a9a4a], crypt: [0x6a6658, 0x5a5a50, 0x787060], storm: [0x7a8a7a, 0x8a9a8a, 0x6a7a74], volcano: [0x3a2a20] };
    const make = (region, n, s0) => {
      const spots = scatter(n, region, 0, grassOK).map(p => ({ ...p, s: s0 * (0.6 + rnd() * 0.8) }));
      // clumps of grass grow together: add a few neighbours round each spot
      const all = [];
      for (const p of spots) for (let k = 0; k < 3; k++) all.push({ x: p.x + (rnd() - 0.5) * 2.4, y: p.y + (rnd() - 0.5) * 2.4, s: p.s * (0.7 + rnd() * 0.5), r: rnd() * 6 });
      instanced(grassGeo.clone(), grassMat, all, { shadow: false, colors: (p, i) => tint[region][i % tint[region].length] });
    };
    make("wilds", 2600, 1.1); make("town", 300, 0.9); make("crypt", 700, 0.8); make("storm", 600, 0.75);
    disposables.push(grassGeo);
    // flowers in the wilds
    const fGeo = mergeGeometries([0, 1].map(k => new THREE.PlaneGeometry(0.6, 0.6).translate(0, 0.3, 0).rotateY(k * Math.PI / 2)));
    const fn = fGeo.attributes.normal; for (let i = 0; i < fn.count; i++) fn.setXYZ(i, 0, 1, 0);
    const fMat = windy(M(0xffffff, { map: T.flower, alphaTest: 0.5, side: THREE.DoubleSide }), 0.8);
    const flowerSpots = [];
    for (const p of scatter(260, ["wilds", "town"], 0, grassOK)) for (let k = 0; k < 4; k++) flowerSpots.push({ x: p.x + (rnd() - 0.5) * 3, y: p.y + (rnd() - 0.5) * 3, s: 0.8 + rnd() * 0.6, r: rnd() * 6 });
    const fCols = [0xffffff, 0xf6d8ff, 0xffe28a, 0xd0e4ff, 0xffc0c0];
    instanced(fGeo, fMat, flowerSpots, { shadow: false, colors: (p, i) => fCols[i % fCols.length] });
  }
  // Rocks: lumpy boulders (mossy in the wilds, dark in the wastes, blue-grey in the peaks)
  const rockGeos = [0, 1, 2].map(k => roughen(new THREE.IcosahedronGeometry(1, 3), 0.28, 1.4, k * 7).scale(1.2, 0.75, 1).translate(0, 0.35, 0));
  const rockMat = M(0xffffff, { map: env.hideTex(1, 1), roughness: 0.95 });
  const rocks = (region, n, colors, gap = 3) => {
    const spots = scatter(n, region, gap);
    rockGeos.forEach((g, k) => instanced(g.clone(), rockMat, spots.filter((_, i) => i % 3 === k), { tilt: 0.4, colors }));
  };
  rocks("wilds", 90, [0x7a7a70, 0x6a7a5a, 0x8a8478, 0x5a6a4a]);
  rocks("crypt", 50, [0x5a5866, 0x4a4856, 0x6a6876]);
  rocks("volcano", 110, [0x2a2422, 0x342a26, 0x1e1a18]);
  rocks("storm", 90, [0x5a6a7c, 0x4a5a6c, 0x6a7888]);
  rockGeos.forEach(g => disposables.push(g));
  // Trees
  const barkMat = M(0xffffff, { map: T.bark, roughness: 1 });
  const leafMat = M(0xffffff, { map: T.foliage, roughness: 0.85, vertexColors: true });
  disposables.push(barkMat, leafMat);
  const pineGeo = (() => {
    const trunk = paint(new THREE.CylinderGeometry(0.16, 0.34, 3.2, 8).translate(0, 1.6, 0), 0xffffff);
    const tiers = [];
    for (let i = 0; i < 5; i++) {
      const r = 2.3 * (1 - i * 0.17), h = 2.7 - i * 0.12;
      const g = new THREE.ConeGeometry(r, h, 11, 3, true);
      const p = g.attributes.position, v = new THREE.Vector3();
      for (let k = 0; k < p.count; k++) {   // ragged branch tips that droop a little
        v.fromBufferAttribute(p, k);
        const rr = Math.hypot(v.x, v.z);
        if (rr > 0.05) { const j = 1 + (NZ.n3(v.x * 3, v.y * 2 + i, v.z * 3) - 0.5) * 0.5; v.x *= j; v.z *= j; v.y -= (rr / r) * 0.25; }
        p.setXYZ(k, v.x, v.y, v.z);
      }
      g.computeVertexNormals();
      g.translate(0, 2.2 + i * 1.35 + h / 2, 0);
      tiers.push(paint(nonIndexed(g), i % 2 ? 0xdde8dd : 0xffffff));
    }
    const geo = mergeGeometries([nonIndexed(trunk), mergeGeometries(tiers)], true);
    return geo;
  })();
  const broadGeo = (seed) => {
    const r = rng(seed);
    const trunk = taperTube([[0, 0, 0], [0.15, 1.6, 0.05], [-0.1, 3.2, 0.1], [0.05, 4.2, 0]], 0.32, 0.45, 8, 10);
    const parts = [nonIndexed(paint(trunk, 0xffffff))];
    const blobs = [];
    for (let i = 0; i < 6; i++) {
      const b = roughen(new THREE.IcosahedronGeometry(1.3 + r() * 0.8, 2), 0.35, 1.8, seed + i);
      b.translate((r() - 0.5) * 2.6, 4.4 + r() * 2.2, (r() - 0.5) * 2.6);
      blobs.push(paint(nonIndexed(b), [0xffffff, 0xe6f0d8, 0xd8e4cc][i % 3]));
    }
    return mergeGeometries([parts[0], mergeGeometries(blobs)], true);
  };
  const treeColors = { pine: [0x2e4a2c, 0x34522e, 0x28402a, 0x3a5634], broad: [0x4e6a2c, 0x5a7432, 0x6a7a30, 0x46622a] };
  const plantTrees = (geo, spots, colors) => {
    if (!spots.length) return;
    const m = new THREE.InstancedMesh(geo, [barkMat, leafMat], spots.length);
    const o = new THREE.Object3D(), c = new THREE.Color();
    spots.forEach((p, i) => {
      o.position.set(p.x, 0, p.y); o.rotation.set(0, p.r, 0); o.scale.setScalar(p.s * 1.1); o.updateMatrix();
      m.setMatrixAt(i, o.matrix); m.setColorAt(i, c.setHex(colors[i % colors.length]));
    });
    m.castShadow = true; m.receiveShadow = true;
    G.add(m); disposables.push(geo);
  };
  // the trunk shouldn't be tinted green: bark keeps its own colour
  barkMat.color.setHex(0x5a4430);
  barkMat.onBeforeCompile = (s) => { s.fragmentShader = s.fragmentShader.replace("#include <color_fragment>", ""); };
  // forests grow in clusters
  const forest = (n, region, perCluster, spread) => {
    const out = [];
    for (const c of scatter(n, region, 6)) for (let k = 0; k < perCluster; k++) {
      const a = rnd() * 6.28, d = Math.sqrt(rnd()) * spread, x = c.x + Math.cos(a) * d, y = c.y + Math.sin(a) * d;
      if (clear(x, y, 3) && regionOf(x, y) === region) out.push({ x, y, s: 0.75 + rnd() * 0.6, r: rnd() * 6 });
    }
    return out;
  };
  plantTrees(pineGeo, forest(26, "wilds", 8, 16), treeColors.pine);
  plantTrees(broadGeo(3), forest(14, "wilds", 4, 12), treeColors.broad);
  plantTrees(broadGeo(9), scatter(30, "wilds", 4), treeColors.broad);
  plantTrees(pineGeo.clone(), forest(10, "storm", 5, 12).map(p => ({ ...p, s: p.s * 0.8 })), [0x2a4038, 0x30483e, 0x26383a]);
  // bushes
  const bushGeo = roughen(new THREE.IcosahedronGeometry(1, 2), 0.3, 2, 4).scale(1.2, 0.8, 1.2).translate(0, 0.5, 0);
  instanced(bushGeo, M(0xffffff, { map: T.foliage, roughness: 0.9 }), scatter(140, ["wilds", "town"], 3), { colors: [0x4a6a2a, 0x56722e, 0x3e5a26, 0x6a7a34] });

  // =================================================================
  //  LAKES: rippling water that mirrors the sky, reeds, lily pads, a fishing dock
  // =================================================================
  const waterMats = [];
  const specK = { value: 1 };
  {
    const reedGeo = mergeGeometries([0, 1, 2].map(k => new THREE.PlaneGeometry(0.9, 1.6).translate(0, 0.8, 0).rotateY(k * Math.PI / 3)));
    const rn = reedGeo.attributes.normal; for (let i = 0; i < rn.count; i++) rn.setXYZ(i, 0, 1, 0);
    const reedMat = windy(M(0xffffff, { map: T.grass, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 1 }), 0.7);
    const padMat = M(0x3e6a2c, { roughness: 0.6, side: THREE.DoubleSide });
    const plank = M(0x6a4a2c, { map: T.wood, roughness: 0.9 });
    const reeds = [], pads = [], shoreRocks = [];
    lakes.forEach((l, li) => {
      const shape = new THREE.Shape();
      for (let k = 0; k <= 40; k++) {
        const a = k / 40 * Math.PI * 2, rr = l.r * (0.92 + NZ.n2(Math.cos(a) * 1.5 + l.seed, Math.sin(a) * 1.5) * 0.16);
        k ? shape.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : shape.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      const wm = new THREE.ShaderMaterial({
        uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uDeep: { value: new THREE.Color(0x0a1e22) }, uCenter: { value: new THREE.Vector3(l.x, 0, l.y) }, uRadius: { value: l.r } }]),
        vertexShader: WATER_VS, fragmentShader: WATER_FS, transparent: true, fog: true, depthWrite: false,
      });
      // share the sky's colours so the water always mirrors the current sky
      Object.assign(wm.uniforms, { uTime: time, uTop: skyU.uTop, uHorizon: skyU.uHorizon, uSun: skyU.uSun, uSunDir: skyU.uSunDir, uSpecK: specK });
      waterMats.push(wm); disposables.push(wm);
      const water = new THREE.Mesh(new THREE.ShapeGeometry(shape, 6).rotateX(-Math.PI / 2), wm);
      water.position.set(l.x, 0.07, l.y); water.renderOrder = 1;
      G.add(water); disposables.push(water.geometry);
      // reeds and rocks round the shore, lily pads floating near the edge
      for (let k = 0; k < 46; k++) {
        const a = rnd() * Math.PI * 2, rr = l.r * (0.95 + rnd() * 0.18);
        if (roadDist(l.x + Math.cos(a) * rr, l.y + Math.sin(a) * rr) < 5) continue;
        reeds.push({ x: l.x + Math.cos(a) * rr, y: l.y + Math.sin(a) * rr, s: 0.8 + rnd() * 0.6, r: rnd() * 6 });
      }
      for (let k = 0; k < 14; k++) { const a = rnd() * Math.PI * 2, rr = l.r * (1.02 + rnd() * 0.1); shoreRocks.push({ x: l.x + Math.cos(a) * rr, y: l.y + Math.sin(a) * rr, s: 0.35 + rnd() * 0.5, r: rnd() * 6 }); }
      for (let k = 0; k < 22; k++) { const a = rnd() * Math.PI * 2, rr = l.r * (0.55 + rnd() * 0.35); pads.push({ x: l.x + Math.cos(a) * rr, y: l.y + Math.sin(a) * rr, h: 0.09, s: 0.35 + rnd() * 0.35, r: rnd() * 6 }); }
      // a fishing dock on the lake nearest town
      if (li === lakes.reduce((b, L, i) => (Math.hypot(L.x - town.x, L.y - town.y) < Math.hypot(lakes[b].x - town.x, lakes[b].y - town.y) ? i : b), 0)) {
        const a = Math.atan2(town.y - l.y, town.x - l.x);
        const g = new THREE.Group(); g.position.set(l.x + Math.cos(a) * l.r * 1.05, 0, l.y + Math.sin(a) * l.r * 1.05); g.rotation.y = -a - Math.PI / 2; G.add(g);
        for (let k = 0; k < 14; k++) mesh(new THREE.BoxGeometry(2.2, 0.08, 0.32), plank, 0, 0.42, -0.4 - k * 0.38, g);
        for (let k = 0; k < 4; k++) for (const sx of [-1, 1]) mesh(new THREE.CylinderGeometry(0.09, 0.1, 1.2, 7), plank, sx * 1.05, 0.1, -0.5 - k * 1.6, g);
        mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.75, 12), M(0x6a4a2c, { map: T.wood }), 0.6, 0.85, -4.6, g);   // a barrel
      }
    });
    instanced(reedGeo, reedMat, reeds, { shadow: false, colors: [0x4a6a2a, 0x5a7a30, 0x6a7a3a] });
    instanced(new THREE.CircleGeometry(1, 10, 0.3, Math.PI * 2 - 0.3).rotateX(-Math.PI / 2), padMat, pads, { shadow: false, colors: [0x3e6a2c, 0x4a7a34, 0x56823a] });
    instanced(rockGeos[0].clone(), rockMat, shoreRocks, { tilt: 0.5, colors: [0x6a6a60, 0x5a6050] });
  }

  // =================================================================
  //  EMBERHOLD (the town)
  // =================================================================
  const stoneMat = M(0xa8a29a, { map: T.blocks, roughness: 0.95 });
  const plasterMat = M(0xffffff, { map: T.plaster, roughness: 0.95 });
  const roofMat = M(0x8a3a2a, { map: T.roof, roughness: 0.85 });
  const roofMat2 = M(0x5a5a68, { map: T.roof, roughness: 0.8 });
  const woodMat = M(0x8a6440, { map: T.wood, roughness: 0.9 });
  const darkWood = M(0x4a3420, { map: T.wood, roughness: 0.9 });
  const windowMat = new THREE.MeshStandardMaterial({ color: 0x1a1008, emissive: 0xffb45a, emissiveIntensity: 1.6, roughness: 0.4 });
  windowMatRef = windowMat;
  disposables.push(windowMat);
  // plaza: cobbles and a ring of kerb stones
  const plaza = new THREE.Mesh(new THREE.CircleGeometry(16, 48).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: stoneTex, color: 0xb0a690, roughness: 0.95 }));
  plaza.position.set(town.x, 0.04, town.y); plaza.receiveShadow = true; G.add(plaza);
  disposables.push(plaza.geometry, plaza.material);
  {
    const kerb = [];
    for (let k = 0; k < 72; k++) { const a = k / 72 * Math.PI * 2; kerb.push({ x: town.x + Math.cos(a) * 16.2, y: town.y + Math.sin(a) * 16.2, s: 1, r: -a }); }
    instanced(new THREE.BoxGeometry(0.5, 0.22, 1.45).translate(0, 0.11, 0), stoneMat, kerb);
  }
  // A fire that really burns: flickering light plus flames, embers and smoke (the particles do the work)
  const fire = (x, z, y, size, color = 0xff7a2a, light = true) => {
    const f = { x, y, z, size, color, light: null, phase: rnd() * 6 };
    if (light) {
      f.light = new THREE.PointLight(color, 35 * size, 20 * size, 1.6);
      f.light.position.set(x, y + 1.2 * size, z);
      G.add(f.light); anim.lights.push(f.light);
    }
    f.glow = spriteGlow(color, 3.2 * size, x, y + 0.6 * size, z, 0.55);
    anim.fires.push(f);
    return f;
  };
  // campfire in the plaza
  {
    const g = new THREE.Group(); g.position.set(town.x, 0, town.y); G.add(g);
    for (let k = 0; k < 6; k++) { const log = mesh(new THREE.CylinderGeometry(0.14, 0.16, 1.7, 7), darkWood, 0, 0.3, 0, g); log.rotation.set(Math.PI / 2 - 0.4, k / 6 * Math.PI * 2, 0); }
    for (let k = 0; k < 10; k++) { const a = k / 10 * Math.PI * 2; mesh(roughen(new THREE.IcosahedronGeometry(0.28, 1), 0.08, 3, k), stoneMat, Math.cos(a) * 1.1, 0.12, Math.sin(a) * 1.1, g); }
    fire(town.x, town.y, 0.3, 1.4);
  }
  // HAVENS — safe campsites out in the regions: a flat stone circle carved with glowing blue runes
  // (daemons won't come near), standing stones, a fire pit, a tent and bedrolls
  const havenRunes = [];
  {
    const [rc, rg] = canvas(512);
    rg.translate(256, 256);
    rg.strokeStyle = "#fff"; rg.fillStyle = "#fff"; rg.lineCap = "round";
    for (const [r, w] of [[236, 7], [222, 2.5], [150, 3], [138, 1.5]]) { rg.lineWidth = w; rg.beginPath(); rg.arc(0, 0, r, 0, Math.PI * 2); rg.stroke(); }
    const gr = rng(77);
    for (let i = 0; i < 24; i++) {   // a ring of glyphs between the circles
      rg.save(); rg.rotate(i / 24 * Math.PI * 2); rg.translate(0, -186); rg.lineWidth = 3.5;
      rg.beginPath();
      const n = 2 + Math.floor(gr() * 3);
      for (let k = 0; k < n; k++) { const x1 = (gr() - 0.5) * 22, y1 = (gr() - 0.5) * 30, x2 = (gr() - 0.5) * 22, y2 = (gr() - 0.5) * 30; rg.moveTo(x1, y1); rg.lineTo(x2, y2); }
      rg.stroke();
      if (gr() < 0.5) { rg.beginPath(); rg.arc(0, 0, 4, 0, Math.PI * 2); rg.fill(); }
      rg.restore();
    }
    for (let i = 0; i < 6; i++) { rg.save(); rg.rotate(i / 6 * Math.PI * 2); rg.lineWidth = 2.5; rg.beginPath(); rg.moveTo(0, -138); rg.lineTo(0, -60); rg.stroke(); rg.restore(); }   // spokes
    const runeTex = toTex(rc); disposables.push(runeTex);
    const slab = M(0x8f8a84, { map: T.blocks, roughness: 0.95 });
    const canvasMat = M(0xd8cfb8, { roughness: 0.95, side: THREE.DoubleSide });
    const bedroll = M(0x6a3a2a, { roughness: 0.95 });
    for (const h of (map.havens || [])) {
      if (h.town) continue;   // the town's own fire is the town haven
      const g = new THREE.Group(); g.position.set(h.x, 0, h.y); g.rotation.y = rnd() * Math.PI * 2; G.add(g);
      // the stone platform
      const plat = mesh(roughen(new THREE.CylinderGeometry(6.2, 6.6, 0.4, 40, 1), 0.04, 1.2, 3), slab, 0, 0.12, 0, g);
      plat.castShadow = false;
      // glowing runes lying on it
      const runes = new THREE.Mesh(new THREE.CircleGeometry(6.0, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: runeTex, color: 0x6ad0ff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, fog: true }));
      runes.position.y = 0.33; g.add(runes); disposables.push(runes.material, runes.geometry);
      havenRunes.push(runes);
      // standing stones around the edge
      for (let k = 0; k < 6; k++) {
        const a = k / 6 * Math.PI * 2 + 0.26;
        const st = mesh(roughen(new THREE.BoxGeometry(0.7, 2.2 + (k % 2) * 0.6, 0.5, 2, 3, 2), 0.06, 2, k + 9), stoneMat, Math.cos(a) * 7.2, 1.1, Math.sin(a) * 7.2, g);
        st.rotation.y = -a; st.rotation.z = (rnd() - 0.5) * 0.12;
        const glyph = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.9), new THREE.MeshBasicMaterial({ map: runeTex, color: 0x6ad0ff, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }));
        glyph.position.set(Math.cos(a) * 6.93, 1.3, Math.sin(a) * 6.93); glyph.rotation.y = -a - Math.PI / 2;
        g.add(glyph); havenRunes.push(glyph); disposables.push(glyph.material, glyph.geometry);
      }
      // fire pit
      for (let k = 0; k < 5; k++) { const log = mesh(new THREE.CylinderGeometry(0.12, 0.14, 1.4, 7), darkWood, 0, 0.55, 0, g); log.rotation.set(Math.PI / 2 - 0.45, k / 5 * Math.PI * 2, 0); }
      for (let k = 0; k < 9; k++) { const a = k / 9 * Math.PI * 2; mesh(roughen(new THREE.IcosahedronGeometry(0.24, 1), 0.08, 3, k), stoneMat, Math.cos(a) * 0.95, 0.42, Math.sin(a) * 0.95, g); }
      fire(h.x, h.y, 0.55, 1.1, 0xff8a3a);
      // a tent and bedrolls round the fire
      const tent = new THREE.Group(); tent.position.set(0, 0.32, -3.8); g.add(tent);
      const cloth = new THREE.ConeGeometry(1.9, 2.3, 4, 1, true); cloth.rotateY(Math.PI / 4); cloth.scale(1, 1, 1.35);
      mesh(cloth, canvasMat, 0, 1.15, 0, tent);
      mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.6, 6), darkWood, 0, 1.3, 0, tent);
      for (let k = 0; k < 3; k++) {
        const a = Math.PI * 0.15 + k * 0.55;
        const b = mesh(new THREE.CapsuleGeometry(0.28, 1.4, 4, 10).rotateZ(Math.PI / 2), bedroll, Math.cos(a) * 2.7, 0.46, Math.sin(a) * 2.7, g);
        b.rotation.y = -a; b.scale.set(1, 0.45, 1);
      }
      mesh(new THREE.BoxGeometry(0.7, 0.5, 0.5), darkWood, -2.6, 0.57, -1.2, g);   // a supply crate
    }
  }
  // a well
  {
    const g = new THREE.Group(); g.position.set(town.x + 8, 0, town.y - 7); G.add(g);
    mesh(new THREE.CylinderGeometry(1.3, 1.4, 0.9, 20, 1, true), M(0xa8a29a, { map: T.blocks, side: THREE.DoubleSide }), 0, 0.45, 0, g);
    mesh(new THREE.TorusGeometry(1.32, 0.16, 6, 24).rotateX(Math.PI / 2), stoneMat, 0, 0.92, 0, g);
    mesh(new THREE.CircleGeometry(1.25, 20).rotateX(-Math.PI / 2), M(0x0a1418, { roughness: 0.1, metalness: 0.3 }), 0, 0.5, 0, g);
    for (const sx of [-1, 1]) mesh(new THREE.BoxGeometry(0.18, 2.4, 0.18).translate(0, 1.2, 0), darkWood, sx * 1.2, 0, 0, g);
    const roof = mesh(new THREE.ConeGeometry(1.9, 1.1, 4).rotateY(Math.PI / 4).translate(0, 2.9, 0), roofMat, 0, 0, 0, g); roof.scale.z = 0.7;
    mesh(new THREE.CylinderGeometry(0.1, 0.1, 2.5, 8).rotateZ(Math.PI / 2), darkWood, 0, 2.05, 0, g);
  }
  const roadAngles = map.doors.map(d => Math.atan2(d.y - town.y, d.x - town.x));
  const nearRoad = (a, w) => roadAngles.some(r => Math.abs(Math.atan2(Math.sin(a - r), Math.cos(a - r))) < w);
  // timber-framed houses (doors toward the plaza)
  const house = (x, z, rot, w, d, floors, rs) => {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rot; G.add(g);
    const wallH = 2.7 * floors;
    mesh(new THREE.BoxGeometry(w + 0.4, 0.6, d + 0.4).translate(0, 0.3, 0), stoneMat, 0, 0, 0, g);
    const wallMat = floors > 1 ? (() => { const m = plasterMat.clone(); m.map = T.plaster.clone(); m.map.repeat.set(1, floors); m.map.needsUpdate = true; disposables.push(m, m.map); return m; })() : plasterMat;
    mesh(new THREE.BoxGeometry(w, wallH, d).translate(0, 0.6 + wallH / 2, 0), wallMat, 0, 0, 0, g);
    // gabled roof (ridge along the width)
    const rise = d * 0.5, slope = Math.hypot(d / 2, rise), ang = Math.atan2(rise, d / 2), top = 0.6 + wallH;
    const rm = rs > 0.5 ? roofMat : roofMat2;
    for (const s of [-1, 1]) {
      const slab = new THREE.BoxGeometry(w + 0.9, 0.16, slope + 0.6);
      const uv = slab.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (w + 0.9) / 2.5, uv.getY(i) * (slope + 0.6) / 2.5);
      const m = mesh(slab, rm, 0, top + rise / 2, s * d / 4, g);
      m.rotation.x = s * ang;
    }
    const gableShape = new THREE.Shape([new THREE.Vector2(-d / 2, 0), new THREE.Vector2(d / 2, 0), new THREE.Vector2(0, rise)]);
    for (const s of [-1, 1]) {
      const gm = mesh(new THREE.ShapeGeometry(gableShape), plasterMat, s * w / 2, top, 0, g);
      gm.rotation.y = s * Math.PI / 2; gm.material = plasterMat;
      const gg = gm.geometry.attributes.uv; for (let i = 0; i < gg.count; i++) gg.setXY(i, (gg.getX(i) + d / 2) / d, gg.getY(i) / rise * 0.5);
    }
    mesh(new THREE.BoxGeometry(w + 1, 0.22, 0.22), darkWood, 0, top + rise + 0.05, 0, g);   // ridge beam
    // chimney with smoke
    const cx = w * 0.28 * (rs > 0.3 ? 1 : -1);
    mesh(new THREE.BoxGeometry(0.75, rise + 1.6, 0.75).translate(0, (rise + 1.6) / 2, 0), stoneMat, cx, top, -d * 0.15, g);
    anim.smokes.push({ obj: g, local: new THREE.Vector3(cx, top + rise + 1.7, -d * 0.15), acc: rnd() });
    // door with a little step, windows with shutters
    mesh(new THREE.BoxGeometry(1.15, 2.05, 0.14).translate(0, 1.6, d / 2 + 0.05), darkWood, 0, 0, 0, g);
    mesh(new THREE.BoxGeometry(1.6, 0.25, 0.7).translate(0, 0.12, d / 2 + 0.4), stoneMat, 0, 0, 0, g);
    for (let f = 0; f < floors; f++) for (const sx of [-1, 1]) {
      const wy = 0.6 + 1.5 + f * 2.7, wx = sx * w * 0.3;
      if (f === 0 && Math.abs(wx) < 1) continue;
      mesh(new THREE.BoxGeometry(0.8, 0.85, 0.08).translate(wx, wy, d / 2 + 0.03), windowMat, 0, 0, 0, g);
      for (const s2 of [-1, 1]) mesh(new THREE.BoxGeometry(0.42, 0.95, 0.06).translate(wx + s2 * 0.64, wy, d / 2 + 0.06), woodMat, 0, 0, 0, g);
      mesh(new THREE.BoxGeometry(1.0, 0.1, 0.25).translate(wx, wy - 0.5, d / 2 + 0.1), darkWood, 0, 0, 0, g);
    }
    // side windows
    for (const sx of [-1, 1]) mesh(new THREE.BoxGeometry(0.08, 0.8, 0.75).translate(sx * (w / 2 + 0.03), 2.1, 0), windowMat, 0, 0, 0, g);
    return g;
  };
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2 + 0.17;
    if (nearRoad(a, 0.36)) continue;
    const r = 23 + rnd() * 3;
    house(town.x + Math.cos(a) * r, town.y + Math.sin(a) * r, -a - Math.PI / 2, 5 + rnd() * 2, 4.2 + rnd() * 1.4, rnd() < 0.45 ? 2 : 1, rnd());
  }
  // market stalls, crates and barrels round the plaza
  const crateGeo = new THREE.BoxGeometry(0.8, 0.8, 0.8).translate(0, 0.4, 0);
  const barrelGeo = (() => { const g = new THREE.CylinderGeometry(0.36, 0.36, 1, 14, 4); const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i), k = 1 + (0.25 - y * y) * 0.5; p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k); } g.computeVertexNormals(); return g.translate(0, 0.5, 0); })();
  const crates = [], barrels = [];
  for (let k = 0; k < 4; k++) {
    const a = k / 4 * Math.PI * 2 + 0.75;
    if (nearRoad(a, 0.3)) continue;
    const x = town.x + Math.cos(a) * 12.5, z = town.y + Math.sin(a) * 12.5;
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = -a - Math.PI / 2; G.add(g);   // facing the plaza
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) mesh(new THREE.BoxGeometry(0.14, 2.4, 0.14).translate(0, 1.2, 0), darkWood, sx * 1.4, 0, sz * 0.9, g);
    const awn = mesh(new THREE.PlaneGeometry(3.3, 2.4), M(0xffffff, { map: T.awning, side: THREE.DoubleSide }), 0, 2.45, 0, g);
    awn.rotation.x = -Math.PI / 2 + 0.25;
    mesh(new THREE.BoxGeometry(2.8, 0.9, 0.9).translate(0, 0.45, 0.5), woodMat, 0, 0, 0, g);
    for (let i = 0; i < 3; i++) crates.push({ x: x + (rnd() - 0.5) * 3, y: z + (rnd() - 0.5) * 3, s: 0.7 + rnd() * 0.4, r: rnd() * 6 });
    barrels.push({ x: x + (rnd() - 0.5) * 3.5, y: z + (rnd() - 0.5) * 3.5, s: 0.9 + rnd() * 0.2, r: rnd() * 6 });
  }
  instanced(crateGeo, woodMat, crates);
  instanced(barrelGeo, M(0x7a5434, { map: T.wood }), barrels);
  // lantern posts round the plaza
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + 0.2, x = town.x + Math.cos(a) * 17.2, z = town.y + Math.sin(a) * 17.2;
    mesh(new THREE.CylinderGeometry(0.08, 0.11, 3.4, 8).translate(0, 1.7, 0), darkWood, x, 0, z);
    mesh(new THREE.BoxGeometry(0.9, 0.08, 0.08).translate(0.4, 3.3, 0), darkWood, x, 0, z).rotation.y = -a;
    const lx = x - Math.cos(a) * 0.75, lz = z - Math.sin(a) * 0.75;
    mesh(new THREE.BoxGeometry(0.32, 0.45, 0.32), windowMat, lx, 3.0, lz);
    mesh(new THREE.ConeGeometry(0.28, 0.22, 4).rotateY(Math.PI / 4), darkWood, lx, 3.33, lz);
    spriteGlow(0xffb45a, 1.6, lx, 3.0, lz, 0.6);
  }
  // log palisade (sharpened stakes) with watchtowers and signposts where the roads leave
  {
    const stake = mergeGeometries([new THREE.CylinderGeometry(0.28, 0.32, 4, 7).translate(0, 2, 0), new THREE.ConeGeometry(0.28, 0.8, 7).translate(0, 4.4, 0)]);
    const posts = [];
    for (let k = 0; k < 150; k++) {
      const a = (k / 150) * Math.PI * 2;
      if (nearRoad(a, 0.15)) continue;
      posts.push({ x: town.x + Math.cos(a) * (town.radius + 1), y: town.y + Math.sin(a) * (town.radius + 1), s: 0.9 + rnd() * 0.25, r: rnd() * 6 });
    }
    instanced(stake, M(0x6a4e30, { map: T.bark }), posts);
    const signNames = map.regions.map(r => r.name);
    for (const ra of roadAngles) {
      for (const side of [-1, 1]) {   // watchtowers either side of the road
        const a = ra + side * 0.19, x = town.x + Math.cos(a) * (town.radius + 2), z = town.y + Math.sin(a) * (town.radius + 2);
        const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = -a; G.add(g);
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const leg = mesh(new THREE.CylinderGeometry(0.16, 0.2, 6.2, 7).translate(0, 3.1, 0), darkWood, sx * 1.1, 0, sz * 1.1, g); leg.rotation.set(sz * 0.05, 0, -sx * 0.05); }
        mesh(new THREE.BoxGeometry(3.2, 0.25, 3.2), woodMat, 0, 6.1, 0, g);
        for (let k = 0; k < 4; k++) { const rail = mesh(new THREE.BoxGeometry(3.2, 0.9, 0.12), woodMat, 0, 6.7, 0, g); rail.rotation.y = k * Math.PI / 2; rail.position.set(Math.sin(k * Math.PI / 2) * 1.55, 6.7, Math.cos(k * Math.PI / 2) * 1.55); }
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) mesh(new THREE.CylinderGeometry(0.08, 0.08, 2, 6).translate(0, 7.1, 0), darkWood, sx * 1.45, 0, sz * 1.45, g);
        mesh(new THREE.ConeGeometry(2.6, 1.8, 4).rotateY(Math.PI / 4).translate(0, 9, 0), roofMat, 0, 0, 0, g);
        // a torch on the tower
        const tx = x + Math.cos(ra) * 1.7, tz = z + Math.sin(ra) * 1.7;
        mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.8, 6), darkWood, tx, 4.4, tz);
        fire(tx, tz, 4.8, 0.45, 0xff8a3a, false);
      }
      // a signpost just outside the gate pointing to each region
      const sx = town.x + Math.cos(ra + 0.32) * (town.radius + 7), sz = town.y + Math.sin(ra + 0.32) * (town.radius + 7);
      mesh(new THREE.CylinderGeometry(0.1, 0.12, 3.2, 7).translate(0, 1.6, 0), darkWood, sx, 0, sz);
      map.regions.forEach((r, i) => {
        const [c, g] = canvas(256, 48);
        g.fillStyle = "#6a4a2c"; g.fillRect(0, 0, 256, 48); g.fillStyle = "rgba(0,0,0,.25)"; g.fillRect(0, 40, 256, 8);
        g.fillStyle = "#f0dcb0"; g.font = "700 26px Georgia, serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(signNames[i], 128, 24);
        const tex = toTex(c); tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping; disposables.push(tex);
        const board = mesh(new THREE.BoxGeometry(1.9, 0.36, 0.06), [darkWood, darkWood, darkWood, darkWood, M(0xffffff, { map: tex }), M(0xffffff, { map: tex })], sx, 2.9 - i * 0.45, sz);
        const ang = Math.atan2(r.center.y - sz, r.center.x - sx);
        board.rotation.y = -ang; board.translateX(0.9);
      });
    }
  }
  // banners on the gates of town
  for (const ra of roadAngles) for (const side of [-1, 1]) {
    const a = ra + side * 0.11, x = town.x + Math.cos(a) * (town.radius + 1.5), z = town.y + Math.sin(a) * (town.radius + 1.5);
    mesh(new THREE.CylinderGeometry(0.09, 0.11, 7.5, 7).translate(0, 3.75, 0), darkWood, x, 0, z);
    const flag = mesh(new THREE.PlaneGeometry(1.3, 2.6, 6, 6).translate(0.68, 0, 0), M(0x8a1a1a, { side: THREE.DoubleSide, roughness: 0.9 }), x, 6, z);
    flag.userData = { phase: rnd() * 6, base: flag.geometry.attributes.position.array.slice(), dynamic: true };
    anim.banners.push(flag);
  }

  // =================================================================
  //  THE HOLLOW BARROWS
  // =================================================================
  {
    const graveMat = M(0x8a8690, { map: env.hideTex(1, 1), roughness: 0.95 });
    const rounded = (() => { const s = new THREE.Shape(); s.moveTo(-0.38, 0); s.lineTo(0.38, 0); s.lineTo(0.38, 0.95); s.absarc(0, 0.95, 0.38, 0, Math.PI, false); s.lineTo(-0.38, 0);
      return new THREE.ExtrudeGeometry(s, { depth: 0.2, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 1 }).translate(0, 0, -0.1); })();
    const cross = mergeGeometries([new THREE.BoxGeometry(0.18, 1.6, 0.16).translate(0, 0.8, 0), new THREE.BoxGeometry(0.85, 0.16, 0.16).translate(0, 1.15, 0)]);
    const obelisk = new THREE.CylinderGeometry(0.15, 0.3, 2.1, 4).rotateY(Math.PI / 4).translate(0, 1.05, 0);
    const plots = scatter(9, "crypt", 8);
    const graves = [[], [], []];
    for (const p of plots) {   // rows of graves in each graveyard, with an iron fence round it
      const rows = 3 + (rnd() * 3 | 0), cols = 4 + (rnd() * 3 | 0), ca = Math.cos(p.r), sa = Math.sin(p.r);
      for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) {
        if (rnd() < 0.15) continue;
        const lx = (j - (cols - 1) / 2) * 2.2 + (rnd() - 0.5) * 0.4, lz = (i - (rows - 1) / 2) * 2.8;
        graves[(rnd() * 3) | 0].push({ x: p.x + lx * ca - lz * sa, y: p.y + lx * sa + lz * ca, s: 0.85 + rnd() * 0.35, r: -p.r + (rnd() - 0.5) * 0.3 });
      }
      const hw = cols * 1.1 + 1, hd = rows * 1.4 + 1;
      const fence = new THREE.Group(); fence.position.set(p.x, 0, p.y); fence.rotation.y = -p.r; G.add(fence);
      const ironMat = M(0x1a1a20, { metalness: 0.6, roughness: 0.5 });
      for (const [L, x0, z0, ry] of [[hw * 2, 0, hd, 0], [hw * 2, 0, -hd, 0], [hd * 2, hw, 0, Math.PI / 2], [hd * 2, -hw, 0, Math.PI / 2]]) {
        if (z0 > 0 && ry === 0) continue;   // the front is open (it's a gateway)
        const seg = new THREE.Group(); seg.position.set(x0, 0, z0); seg.rotation.y = ry; fence.add(seg);
        const bars = Math.floor(L / 0.35);
        const barGeo = mergeGeometries(Array.from({ length: bars }, (_, b) => new THREE.CylinderGeometry(0.025, 0.025, 1.5, 4).translate(-L / 2 + b * 0.35, 0.75, 0)));
        mesh(barGeo, ironMat, 0, 0, 0, seg);
        mesh(new THREE.BoxGeometry(L, 0.06, 0.06), ironMat, 0, 1.35, 0, seg);
        mesh(new THREE.BoxGeometry(L, 0.06, 0.06), ironMat, 0, 0.3, 0, seg);
        disposables.push(barGeo);
      }
    }
    for (const p of scatter(70, "crypt", 2)) graves[(rnd() * 3) | 0].push({ ...p, r: p.r, s: 0.8 + rnd() * 0.3 });
    instanced(rounded, graveMat, graves[0], { tilt: 0.18, colors: [0x9a96a0, 0x8a8890, 0x7a7680] });
    instanced(cross, graveMat, graves[1], { tilt: 0.2, colors: [0x9a96a0, 0x8a8890] });
    instanced(obelisk, graveMat, graves[2], { tilt: 0.12, colors: [0x8a8690, 0xa09ca8] });
    // grave mounds
    instanced(new THREE.SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(0.5, 0.18, 1).translate(0, 0, 1.1), M(0x2c2830), graves.flat(), { shadow: false });
    // mausoleums: steps, columns, a pediment and a dark doorway
    const mStone = M(0x9a96a2, { map: T.blocks });
    for (const p of scatter(5, "crypt", 12)) {
      const g = new THREE.Group(); g.position.set(p.x, 0, p.y); g.rotation.y = p.r; G.add(g);
      mesh(new THREE.BoxGeometry(7, 0.5, 8.5).translate(0, 0.25, 0), mStone, 0, 0, 0, g);
      mesh(new THREE.BoxGeometry(6, 0.3, 7.5).translate(0, 0.65, 0), mStone, 0, 0, 0, g);
      mesh(new THREE.BoxGeometry(5, 3.6, 5.2).translate(0, 2.6, -0.9), mStone, 0, 0, 0, g);
      for (const sx of [-2.1, -0.7, 0.7, 2.1]) mesh(new THREE.CylinderGeometry(0.28, 0.32, 3.6, 12).translate(0, 2.6, 0), mStone, sx, 0, 2.6, g);
      mesh(new THREE.BoxGeometry(5.8, 0.5, 7.2).translate(0, 4.65, 0.2), mStone, 0, 0, 0, g);
      const ped = new THREE.Shape([new THREE.Vector2(-2.9, 0), new THREE.Vector2(2.9, 0), new THREE.Vector2(0, 1.5)]);
      mesh(new THREE.ExtrudeGeometry(ped, { depth: 7.2, bevelEnabled: false }).translate(0, 0, -3.4), mStone, 0, 4.9, 0, g);
      mesh(new THREE.BoxGeometry(1.6, 2.6, 0.1).translate(0, 2.1, 1.72), M(0x030205), 0, 0, 0, g);
      spriteGlow(0x9a6aff, 2.5, 0, 2.1, 1.9, 0.4, g);
    }
    // dead trees
    const dead = M(0x2e2824, { map: T.bark });
    for (const p of scatter(34, "crypt", 4)) {
      const parts = [taperTube([[0, 0, 0], [0.2, 2, 0.1], [-0.15, 4, -0.2], [0.3, 6, 0], [0.1, 7, 0.2]], 0.38, 0.1, 7, 14)];
      for (let k = 0; k < 6; k++) {
        const a = rnd() * Math.PI * 2, y0 = 2.5 + rnd() * 3.5, L = 1.5 + rnd() * 2.5;
        parts.push(taperTube([[0, y0, 0], [Math.cos(a) * L * 0.5, y0 + 0.5, Math.sin(a) * L * 0.5], [Math.cos(a) * L, y0 + 1.2 + rnd(), Math.sin(a) * L], [Math.cos(a) * L * 1.3, y0 + 2 + rnd(), Math.sin(a) * L * 1.3]], 0.13, 0.08, 5, 8));
      }
      const t = mesh(mergeGeometries(parts.map(nonIndexed)), dead, p.x, 0, p.y);
      t.scale.setScalar(p.s); t.rotation.y = p.r;
      disposables.push(t.geometry);
    }
    // ground fog drifting between the graves
    const fogMat = new THREE.SpriteMaterial({ map: T.puff, color: 0x8a86a8, transparent: true, opacity: 0.16, depthWrite: false, fog: true });
    disposables.push(fogMat);
    for (const p of scatter(70, "crypt", 0, (x, y) => Math.hypot(x, y) < R - 10)) {
      const s = new THREE.Sprite(fogMat); s.scale.set(16 + rnd() * 10, 3 + rnd() * 2, 1); s.position.set(p.x, 1, p.y);
      s.userData = { x: p.x, y: p.y, ph: rnd() * 6 }; G.add(s); anim.fogs.push(s);
    }
    // will-o'-wisps
    for (const p of scatter(26, "crypt", 2)) {
      const w = spriteGlow(0xb08cff, 0.9, p.x, 1.4, p.y, 0.9);
      w.userData = { x: p.x, y: p.y, ph: rnd() * 6 }; anim.wisps.push(w);
    }
  }

  // =================================================================
  //  ASHEN WASTES
  // =================================================================
  {
    // basalt columns: clusters of hexagonal pillars
    const hex = new THREE.CylinderGeometry(0.9, 0.95, 1, 6).translate(0, 0.5, 0);
    const cols = [];
    for (const c of scatter(30, "volcano", 6)) {
      const n = 5 + (rnd() * 8 | 0);
      for (let k = 0; k < n; k++) {
        const a = rnd() * 6.28, d = rnd() * 2.6;
        cols.push({ x: c.x + Math.cos(a) * d, y: c.y + Math.sin(a) * d, s: 1, r: rnd() * 6, sx: 0.8 + rnd() * 0.4, sz: 0.8 + rnd() * 0.4, sy: 1.5 + rnd() * 6 * (1 - d / 3) });
      }
    }
    const basalt = M(0x2a2624, { map: T.blocks, roughness: 0.8 });
    instanced(hex, basalt, cols, { colors: [0x3a3432, 0x2c2826, 0x443c38] });
    // obsidian shards
    instanced(roughen(new THREE.ConeGeometry(0.8, 5, 5, 3), 0.15, 2, 8).translate(0, 2.3, 0), M(0x0a080c, { roughness: 0.15, metalness: 0.5, envMap: env.metalEnv, envMapIntensity: 0.9 }), scatter(55, "volcano", 3), { tilt: 0.5 });
    // lava pools with a crust of rock round them
    const lavaU = { uTime: time };
    const lavaMat = new THREE.ShaderMaterial({ uniforms: lavaU, vertexShader: LAVA_VS, fragmentShader: LAVA_FS });
    disposables.push(lavaMat);
    for (const p of scatter(18, "volcano", 7)) {
      const r0 = 3 + p.s * 3;
      const shape = new THREE.Shape();
      for (let k = 0; k <= 28; k++) { const a = k / 28 * Math.PI * 2, rr = r0 * (0.75 + NZ.n2(Math.cos(a) * 2 + p.x, Math.sin(a) * 2 + p.y) * 0.5); k ? shape.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : shape.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); }
      const pool = new THREE.Mesh(new THREE.ShapeGeometry(shape, 4).rotateX(-Math.PI / 2), lavaMat);
      pool.position.set(p.x, 0.06, p.y); G.add(pool); disposables.push(pool.geometry);
      const rim = [];
      for (let k = 0; k < 18; k++) { const a = k / 18 * Math.PI * 2; rim.push({ x: p.x + Math.cos(a) * r0 * 1.05, y: p.y + Math.sin(a) * r0 * 1.05, s: 0.5 + rnd() * 0.5, r: rnd() * 6 }); }
      instanced(rockGeos[k3(p)].clone(), rockMat, rim, { tilt: 0.5, colors: [0x241c18, 0x2e2420] });
      spriteGlow(0xff5a14, r0 * 2.6, p.x, 0.8, p.y, 0.35);
      anim.vents.push({ x: p.x, z: p.y, r: r0, acc: rnd() });
    }
  }
  function k3(p) { return Math.abs(Math.floor(p.x * 7 + p.y * 3)) % 3; }

  // =================================================================
  //  STORMREACH PEAKS
  // =================================================================
  {
    const spire = roughen(new THREE.ConeGeometry(2.4, 16, 7, 6), 0.45, 0.9, 5).translate(0, 7.5, 0);
    instanced(spire, M(0x5a6676, { map: T.blocks, roughness: 0.9 }), scatter(38, "storm", 6), { tilt: 0.25, colors: [0x6a7686, 0x5a6676, 0x4e5a6a] });
    // crystal clusters: six-sided prisms with pointed tips
    const crystal = mergeGeometries([new THREE.CylinderGeometry(0.32, 0.36, 2, 6).translate(0, 1, 0), new THREE.ConeGeometry(0.32, 0.8, 6).translate(0, 2.4, 0)]);
    const crystalMat = new THREE.MeshStandardMaterial({ color: 0x0c1c30, emissive: 0x4aaeff, emissiveIntensity: 1.6, roughness: 0.15, metalness: 0.3, transparent: true, opacity: 0.92 });
    disposables.push(crystalMat);
    const shards = [];
    for (const c of scatter(30, "storm", 3)) {
      const n = 4 + (rnd() * 5 | 0);
      for (let k = 0; k < n; k++) {
        shards.push({ x: c.x + (rnd() - 0.5) * 1.6, y: c.y + (rnd() - 0.5) * 1.6, s: 0.5 + rnd() * 0.9, r: rnd() * 6 });
      }
      spriteGlow(0x4aaeff, 4, c.x, 1.2, c.y, 0.3);
      anim.crystals.push({ x: c.x, z: c.y });
    }
    instanced(crystal, crystalMat, shards, { tilt: 0.7, cast: false });
    anim.crystalMat = crystalMat;
  }

  // =================================================================
  //  CAMPS: a brazier in each (flames in the region's colour)
  // =================================================================
  for (const c of map.camps) {
    const fc = c.region === "crypt" ? 0x9a6aff : c.region === "storm" ? 0x6ac8ff : 0xff7a2a;
    const x = c.x + 5, z = c.y + 5;
    mesh(new THREE.CylinderGeometry(0.18, 0.3, 1.2, 8).translate(0, 0.6, 0), M(0x2a2a30, { metalness: 0.6, roughness: 0.4 }), x, 0, z);
    mesh(new THREE.CylinderGeometry(0.65, 0.3, 0.45, 12, 1, true).translate(0, 1.4, 0), M(0x2a2a30, { metalness: 0.6, roughness: 0.4, side: THREE.DoubleSide }), x, 0, z);
    fire(x, z, 1.5, 0.6, fc, false);
  }

  // =================================================================
  //  THE GATES — the way into each raid
  // =================================================================
  for (const d of map.doors) buildGate(d);

  function buildGate(d) {
    const th = THEME[d.theme] || THEME.shadow;
    const g = new THREE.Group();
    g.position.set(d.x, 0, d.y);
    g.rotation.y = Math.atan2(-Math.cos(d.angle), -Math.sin(d.angle));   // faces back down the road
    G.add(g);
    const stoneCol = { shadow: 0x8e8a9a, fire: 0x2e2622, storm: 0x5e6a7a }[d.theme] || 0x888888;
    const gateStone = M(stoneCol, { map: T.blocks, roughness: 0.85 });
    if (d.theme === "fire") { const lt = lavaTex(1, 1); gateStone.emissiveMap = lt.glow; gateStone.emissive = new THREE.Color(0xff5a14); gateStone.emissiveIntensity = 0.9; }
    const runeMat = new THREE.MeshBasicMaterial({ map: T.runes, color: th.main, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    disposables.push(runeMat);
    // the dais: two round steps with a rune circle carved into the top
    mesh(new THREE.CylinderGeometry(13, 13.6, 0.55, 56).translate(0, 0.27, 0), gateStone, 0, 0, 0, g);
    mesh(new THREE.CylinderGeometry(10.6, 11.2, 0.55, 56).translate(0, 0.82, 0), gateStone, 0, 0, 0, g);
    const circle = new THREE.Mesh(new THREE.PlaneGeometry(20.4, 20.4).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: T.runeCircle, color: th.main, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false }));
    circle.position.y = 1.11; g.add(circle); disposables.push(circle.geometry, circle.material);
    // two pillars
    const top = 1.1, pillarH = 11, span = 6.6;
    for (const sx of [-1, 1]) {
      mesh(new THREE.BoxGeometry(3.2, 1.3, 3.2).translate(0, top + 0.65, 0), gateStone, sx * span, 0, 0, g);
      mesh(new THREE.BoxGeometry(2.3, pillarH, 2.3).translate(0, top + 1.3 + pillarH / 2, 0), gateStone, sx * span, 0, 0, g);
      mesh(new THREE.BoxGeometry(2.9, 0.8, 2.9).translate(0, top + 1.3 + pillarH + 0.4, 0), gateStone, sx * span, 0, 0, g);
      for (const face of [1, -1]) {   // glowing runes down the front and back
        const strip = new THREE.Mesh(new THREE.PlaneGeometry(0.9, pillarH * 0.8), runeMat);
        strip.position.set(sx * span, top + 1.3 + pillarH / 2, face * 1.16);
        if (face < 0) strip.rotation.y = Math.PI;
        g.add(strip); disposables.push(strip.geometry);
      }
    }
    // the arch: wedge-shaped stones round a half circle, a keystone with a glowing gem
    const archY = top + 1.3 + pillarH + 0.8, archR = span;
    const N = 15;
    for (let k = 0; k <= N; k++) {
      const a = k / N * Math.PI;
      const isKey = k === Math.round(N / 2);
      const b = mesh(new THREE.BoxGeometry(isKey ? 2.6 : 2.2, isKey ? 1.9 : 1.45, isKey ? 2.8 : 2.4), gateStone, Math.cos(a) * archR, archY + Math.sin(a) * archR, 0, g);
      b.rotation.z = a - Math.PI / 2;
    }
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.7, 0), new THREE.MeshStandardMaterial({ color: 0x111111, emissive: th.main, emissiveIntensity: 3 }));
    gem.position.set(0, archY + archR, 1.45); gem.scale.set(1, 1.4, 0.6); gem.userData.dynamic = true; g.add(gem); disposables.push(gem.geometry, gem.material);
    // the portal: a swirling vortex filling the arch
    const inner = span - 1.15, bottom = top + 0.05, height = archY - bottom;
    const shape = new THREE.Shape();
    shape.moveTo(-inner, 0); shape.lineTo(inner, 0); shape.lineTo(inner, height); shape.absarc(0, height, inner, 0, Math.PI, false); shape.lineTo(-inner, 0);
    const portalU = {
      uDeep: { value: new THREE.Color(th.deep) }, uMain: { value: new THREE.Color(th.main) }, uCore: { value: new THREE.Color(th.core) },
      uTime: time, uSeed: { value: rnd() * 40 }, uCenter: { value: new THREE.Vector2(0, (height + inner) * 0.55) }, uSize: { value: new THREE.Vector2(inner, (height + inner) * 0.55) },
    };
    const portal = new THREE.Mesh(new THREE.ShapeGeometry(shape, 24), new THREE.ShaderMaterial({ uniforms: portalU, vertexShader: PORTAL_VS, fragmentShader: PORTAL_FS, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
    portal.position.y = bottom; g.add(portal); disposables.push(portal.geometry, portal.material);
    // a glowing rim round the opening
    const rimPts = [];
    for (let k = 0; k <= 40; k++) { const a = k / 40 * Math.PI; rimPts.push(new THREE.Vector3(Math.cos(a) * inner, bottom + height + Math.sin(a) * inner, 0)); }
    rimPts.unshift(new THREE.Vector3(inner, bottom, 0)); rimPts.push(new THREE.Vector3(-inner, bottom, 0));
    const rim = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rimPts), 80, 0.14, 6), new THREE.MeshBasicMaterial({ color: th.core, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
    g.add(rim); disposables.push(rim.geometry, rim.material);
    // rune stones floating round the gate
    const runeStone = roughen(new THREE.DodecahedronGeometry(0.75, 1), 0.12, 2, 3);
    const rsMat = new THREE.MeshStandardMaterial({ color: stoneCol, map: T.blocks, emissive: th.main, emissiveIntensity: 0.35, roughness: 0.8 });
    disposables.push(runeStone, rsMat);
    for (let k = 0; k < 6; k++) {
      const s = new THREE.Mesh(runeStone, rsMat); s.castShadow = true;
      s.userData = { a: k / 6 * Math.PI * 2, y: 5 + (k % 3) * 3.5, r: 10 + (k % 2) * 1.5, ph: rnd() * 6, dynamic: true };
      g.add(s); anim.stones.push(s);
      const glow = spriteGlow(th.main, 2.2, 0, 0, 0, 0.35, s);
      glow.position.set(0, 0, 0);
    }
    // braziers in front, flames in the gate's colour
    for (const sx of [-1, 1]) {
      const bx = sx * 9.5, bz = 9;
      mesh(new THREE.CylinderGeometry(0.55, 0.75, 2, 8).translate(0, 1, 0), gateStone, bx, 0, bz, g);
      mesh(new THREE.CylinderGeometry(1, 0.55, 0.6, 12, 1, true).translate(0, 2.3, 0), M(0x1a1a20, { metalness: 0.7, roughness: 0.4, side: THREE.DoubleSide }), bx, 0, bz, g);
      const wp = new THREE.Vector3(bx, 2.5, bz).applyMatrix4(new THREE.Matrix4().compose(g.position, new THREE.Quaternion().setFromEuler(g.rotation), new THREE.Vector3(1, 1, 1)));
      fire(wp.x, wp.z, wp.y, 0.9, th.flame, false);
    }
    // an avenue of obelisks along the road, runes glowing
    for (let k = 0; k < 5; k++) for (const sx of [-1, 1]) {
      const z = 16 + k * 8, h = 4.5 + (k % 2) * 0.6;
      mesh(new THREE.CylinderGeometry(0.45, 0.75, h, 4).rotateY(Math.PI / 4).translate(0, h / 2, 0), gateStone, sx * 8, 0, z, g);
      mesh(new THREE.ConeGeometry(0.5, 0.8, 4).rotateY(Math.PI / 4).translate(0, h + 0.4, 0), gateStone, sx * 8, 0, z, g);
      const strip = new THREE.Mesh(new THREE.PlaneGeometry(0.5, h * 0.75), runeMat);
      strip.position.set(sx * 8 - sx * 0.62, h * 0.48, z); strip.rotation.y = -sx * Math.PI / 2;
      g.add(strip); disposables.push(strip.geometry);
    }
    // the boss's name over the gate
    const [cnv, cx] = canvas(1024, 192);
    cx.font = "700 76px Cinzel, Georgia, serif"; cx.textAlign = "center"; cx.textBaseline = "middle";
    const hex = "#" + new THREE.Color(th.core).getHexString(), hexMain = "#" + new THREE.Color(th.main).getHexString();
    cx.shadowColor = hexMain; cx.shadowBlur = 28; cx.fillStyle = hex; cx.fillText(d.name || d.boss, 512, 96);
    cx.shadowBlur = 0; cx.lineWidth = 2; cx.strokeStyle = "rgba(0,0,0,.6)"; cx.strokeText(d.name || d.boss, 512, 96);
    const ltex = toTex(cnv); ltex.wrapS = ltex.wrapT = THREE.ClampToEdgeWrapping; disposables.push(ltex);
    const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: ltex, transparent: true, depthWrite: false }));
    label.scale.set(24, 4.5, 1); label.position.y = archY + archR + 4.5; g.add(label); disposables.push(label.material);
    // its light
    const light = new THREE.PointLight(th.light, 110, 48, 1.5);
    light.position.set(0, 7, 5); g.add(light);
    anim.portals.push({ g, d, th, light, circle, gem, inner, bottom, height, archY, acc: 0, arcT: 1 });
  }

  // =================================================================
  //  Merge everything that never moves into a few big meshes (one per material):
  //  hundreds of separate pieces become a handful of draws — much faster on any PC
  // =================================================================
  {
    G.updateMatrixWorld(true);
    const buckets = new Map();
    G.traverse(o => {
      if (!o.isMesh || o.isInstancedMesh || Array.isArray(o.material) || o.material.isShaderMaterial || o.material.transparent || o === ground || o === sky) return;
      for (let p = o; p && p !== G; p = p.parent) if (p.userData.dynamic) return;
      const g = o.geometry;
      const key = o.material.uuid + "|" + Object.keys(g.attributes).sort().join(",") + "|" + (o.castShadow ? 1 : 0);
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(o);
    });
    for (const list of buckets.values()) {
      if (list.length < 2) continue;
      const geos = list.map(o => { const g = (o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone()); g.clearGroups(); return g.applyMatrix4(o.matrixWorld); });
      const merged = mergeGeometries(geos);
      geos.forEach(g => g.dispose());
      if (!merged) continue;
      const m = new THREE.Mesh(merged, list[0].material);
      m.castShadow = list[0].castShadow; m.receiveShadow = true;
      G.add(m); disposables.push(merged);
      for (const o of list) { o.parent.remove(o); disposables.push(o.geometry); }
    }
  }

  // =================================================================
  //  ANIMATION (every frame)
  // =================================================================
  const skyFrom = { top: new THREE.Color(), horizon: new THREE.Color(), bottom: new THREE.Color(), sun: new THREE.Color() };
  let flash = 0, nextFlash = 3;
  const v = new THREE.Vector3(), w2 = new THREE.Vector3();
  const C1 = new THREE.Color(), C2 = new THREE.Color(), C3 = new THREE.Color();
  const light = { sunDir: new THREE.Vector3(0.5, 0.7, 0.4), sunColor: new THREE.Color(), sun: 1, hemi: 1, night: 0, tod: 0.5 };
  // The sky (and light) for a time of day: night → dawn/dusk glow → day, by how high the sun is
  function timeOfDay(tod) {
    const e = Math.sin((tod - 0.25) * Math.PI * 2);   // sun height: 1 = noon, -1 = midnight
    const mix = (A, B, k) => ({
      top: C1.setHex(A.top).lerp(C2.setHex(B.top), k).getHex(), horizon: C1.setHex(A.horizon).lerp(C2.setHex(B.horizon), k).getHex(),
      bottom: C1.setHex(A.bottom).lerp(C2.setHex(B.bottom), k).getHex(), sun: C1.setHex(A.sun).lerp(C2.setHex(B.sun), k).getHex(),
      cloud: A.cloud + (B.cloud - A.cloud) * k, stars: A.stars + (B.stars - A.stars) * k,
    });
    const dusk = SKIES.town;
    let S;
    if (e >= 0.28) S = mix(DAY_SKY, DAY_SKY, 0);
    else if (e >= 0) S = mix(dusk, DAY_SKY, e / 0.28);
    else if (e >= -0.18) S = mix(NIGHT_SKY, dusk, 1 + e / 0.18);
    else S = mix(NIGHT_SKY, NIGHT_SKY, 0);
    const az = tod * Math.PI * 2 + 0.6, el = Math.asin(Math.max(-1, Math.min(1, e)));
    const dir = e > -0.05 ? [Math.cos(az) * Math.cos(el), Math.max(0.04, Math.sin(el)), Math.sin(az) * Math.cos(el)]
      : [-Math.cos(az) * 0.6, 0.55, -Math.sin(az) * 0.6];   // at night the "sun" is the moon, high on the other side
    return { S: { ...S, dir }, e };
  }
  let lastMode = null;
  function animate(dt, t, theme, camera, focus, fancy, timeMode = "cycle") {
    time.value = t;
    // the sky follows the camera; its colours come from the time of day, mixed with the mood of where you are
    sky.position.copy(camera.position);
    // timeMode: "cycle" / "day" / "dusk" / "night", or a number = the server's time of day (0–1)
    const serverClock = typeof timeMode === "number";
    const tod = serverClock ? timeMode : timeMode in TIME_FIXED ? TIME_FIXED[timeMode] : (0.62 + t / DAY_LENGTH) % 1;
    if (serverClock) timeMode = "server";
    const { S: TS, e } = timeOfDay(tod);
    const RS = SKIES[theme] || SKIES.town;
    const rk = theme === "town" || !SKIES[theme] ? 0 : 0.72;   // the regions keep most of their own sky
    const S = rk ? {
      top: C1.setHex(TS.top).lerp(C2.setHex(RS.top), rk).getHex(), horizon: C1.setHex(TS.horizon).lerp(C2.setHex(RS.horizon), rk).getHex(),
      bottom: C1.setHex(TS.bottom).lerp(C2.setHex(RS.bottom), rk).getHex(), sun: C1.setHex(TS.sun).lerp(C2.setHex(RS.sun), rk * 0.6).getHex(),
      cloud: TS.cloud + (RS.cloud - TS.cloud) * rk, stars: Math.max(TS.stars, RS.stars * (1 - Math.max(0, e))), dir: TS.dir,
    } : TS;
    const k = lastMode !== timeMode ? 1 : Math.min(1, dt * 1.2);   // a new time of day (or the first frame) shows at once
    lastMode = timeMode;
    skyU.uTop.value.lerp(skyFrom.top.setHex(S.top), k);
    skyU.uHorizon.value.lerp(skyFrom.horizon.setHex(S.horizon), k);
    skyU.uBottom.value.lerp(skyFrom.bottom.setHex(S.bottom), k);
    skyU.uSun.value.lerp(skyFrom.sun.setHex(S.sun), k);
    skyU.uSunDir.value.lerp(v.set(...S.dir), k);
    skyU.uCloud.value += (S.cloud - skyU.uCloud.value) * k;
    skyU.uStars.value += (S.stars - skyU.uStars.value) * k;
    // the light that goes with it (3d.html applies it to the sun and the sky light)
    const day = Math.max(0, Math.min(1, (e + 0.08) / 0.4));
    light.tod = tod; light.night = 1 - Math.max(0, Math.min(1, (e + 0.18) / 0.3));
    light.sunDir.lerp(v.set(...S.dir).normalize(), k);
    light.sun = 0.22 + 0.78 * day;
    specK.value = 0.12 + 0.88 * day;
    light.hemi = 0.42 + 0.58 * day;
    light.sunColor.copy(skyU.uSun.value).lerp(C3.setHex(0xffffff), day * 0.5);
    // lit windows, lanterns and fires matter more at night
    windowMatRef.emissiveIntensity = 0.7 + light.night * 1.6;
    // lightning flickering in the clouds over Stormreach
    if (theme === "storm") { nextFlash -= dt; if (nextFlash <= 0) { flash = 1; nextFlash = 2 + Math.random() * 6; } }
    flash = Math.max(0, flash - dt * 5);
    skyU.uFlash.value = flash > 0.5 || (flash > 0.2 && Math.random() < 0.5) ? flash : 0;
    const near = (x, z, d = 90) => Math.hypot(x - focus.x, z - focus.z) < d;
    const P = effects.P;
    // fires
    for (const f of anim.fires) {
      const flick = 0.85 + Math.sin(t * 11 + f.phase) * 0.08 + Math.random() * 0.07;
      if (f.light) f.light.intensity = 35 * f.size * flick * (0.7 + light.night * 0.8);
      f.glow.material.opacity = 0.45 * flick;
      if (!fancy || !near(f.x, f.z, 70) || dt <= 0) continue;
      f.acc = (f.acc || 0) + dt * 40 * f.size;
      while (f.acc >= 1) {
        f.acc--;
        const s = f.size;
        P.flame.spawn(f.x + (Math.random() - 0.5) * 0.5 * s, f.y + 0.05, f.z + (Math.random() - 0.5) * 0.5 * s, (Math.random() - 0.5) * 0.3, 1.6 + Math.random() * 1.4, (Math.random() - 0.5) * 0.3,
          { life: 0.4 + Math.random() * 0.4, size: 1.05 * s, size1: 0.2 * s, color: Math.random() < 0.45 ? 0xfff0c0 : f.color, color1: f.color === 0xff7a2a || f.color === 0xff8a3a ? 0x8a1a04 : f.color, alpha: 0.85, drag: 1.5, spin: (Math.random() - 0.5) * 4 });
        if (Math.random() < 0.12) P.glow.spawn(f.x, f.y + 0.4, f.z, (Math.random() - 0.5) * 0.8, 2 + Math.random() * 2, (Math.random() - 0.5) * 0.8, { life: 1 + Math.random(), size: 0.07, color: 0xffd080, color1: f.color, drag: 0.5, grav: -0.3 });
        if (Math.random() < 0.06 * s) P.smoke.spawn(f.x, f.y + 1.4 * s, f.z, 0, 1 + Math.random(), 0, { life: 2, size: 0.5 * s, size1: 2 * s, color: 0x3a3430, alpha: 0.3, drag: 0.8, spin: 0.6 });
      }
    }
    // chimney smoke
    if (fancy) for (const c of anim.smokes) {
      c.acc += dt * 2.2;
      if (c.acc < 1) continue;
      c.acc = 0;
      w2.copy(c.local).applyMatrix4(c.obj.matrixWorld);
      if (!near(w2.x, w2.z, 80)) continue;
      P.smoke.spawn(w2.x, w2.y, w2.z, 0.3 + Math.random() * 0.3, 0.8 + Math.random() * 0.4, 0.2, { life: 3 + Math.random(), size: 0.5, size1: 2.6, color: 0x6a6670, alpha: 0.35, drag: 0.3, spin: 0.4 });
    }
    // banners ripple
    for (const b of anim.banners) {
      const p = b.geometry.attributes.position, base = b.userData.base;
      for (let i = 0; i < p.count; i++) {
        const x = base[i * 3], y = base[i * 3 + 1];
        p.setZ(i, Math.sin(t * 3 + x * 2.4 + b.userData.phase) * 0.18 * x + Math.sin(t * 5.3 + y * 1.5) * 0.04 * x);
      }
      p.needsUpdate = true;
    }
    // ground fog drifting, wisps bobbing
    for (const s of anim.fogs) { const u = s.userData; s.position.set(u.x + Math.sin(t * 0.07 + u.ph) * 4, 0.9 + Math.sin(t * 0.3 + u.ph) * 0.15, u.y + Math.cos(t * 0.05 + u.ph) * 4); }
    for (const s of anim.wisps) { const u = s.userData; s.position.set(u.x + Math.sin(t * 0.6 + u.ph) * 2.5, 1.3 + Math.sin(t * 1.7 + u.ph) * 0.5, u.y + Math.cos(t * 0.45 + u.ph) * 2.5); s.material.opacity = 0.6 + Math.sin(t * 4 + u.ph) * 0.3; }
    // lava vents smoking, crystals pulsing
    if (fancy) for (const vnt of anim.vents) {
      if (!near(vnt.x, vnt.z, 90)) continue;
      vnt.acc += dt * 3;
      while (vnt.acc >= 1) {
        vnt.acc--;
        const a = Math.random() * 6.28, d = Math.random() * vnt.r * 0.8;
        P.smoke.spawn(vnt.x + Math.cos(a) * d, 0.4, vnt.z + Math.sin(a) * d, 0, 1.2 + Math.random(), 0, { life: 2.5, size: 1, size1: 4, color: 0x2a2220, alpha: 0.35, drag: 0.6, spin: 0.5 });
        P.glow.spawn(vnt.x + Math.cos(a) * d, 0.3, vnt.z + Math.sin(a) * d, (Math.random() - 0.5), 2 + Math.random() * 2, (Math.random() - 0.5), { life: 1.2, size: 0.08, color: 0xffb040, color1: 0xff3a0a, drag: 0.4, grav: -0.3 });
      }
    }
    if (anim.crystalMat) anim.crystalMat.emissiveIntensity = 1.4 + Math.sin(t * 2.1) * 0.4 + (flash > 0.3 ? 1.5 : 0);
    // the gates
    for (const p of anim.portals) {
      p.circle.rotation.y = t * 0.08;
      p.circle.material.opacity = 0.6 + Math.sin(t * 1.6) * 0.15;
      p.light.intensity = 100 + Math.sin(t * 2.2) * 20;
      p.gem.rotation.y = t * 0.8;
      const gx = p.g.position.x, gz = p.g.position.z;
      if (!fancy || !near(gx, gz, 110) || dt <= 0) continue;
      // motes drifting into the portal
      p.acc += dt * 24;
      while (p.acc >= 1) {
        p.acc--;
        const a = Math.random() * 6.28, rr = 7 + Math.random() * 5, y = 2 + Math.random() * 14;
        v.set(Math.cos(a) * rr, y, Math.sin(a) * rr * 0.6 + 2).applyMatrix4(p.g.matrixWorld);
        w2.set(0, p.bottom + p.height * 0.6, 0).applyMatrix4(p.g.matrixWorld).sub(v).multiplyScalar(0.7);
        P.glow.spawn(v.x, v.y, v.z, w2.x, w2.y, w2.z, { life: 1.4, size: 0.16, size1: 0.04, color: p.th.core, color1: p.th.main, drag: 0 });
        if (p.d.theme === "fire" && Math.random() < 0.3) { v.set((Math.random() - 0.5) * 9, 1.2, 1 + Math.random() * 3).applyMatrix4(p.g.matrixWorld); P.glow.spawn(v.x, v.y, v.z, (Math.random() - 0.5), 2 + Math.random() * 3, (Math.random() - 0.5), { life: 1.6, size: 0.1, color: 0xffc060, color1: 0xff3a0a, drag: 0.5, grav: -0.4 }); }
        if (p.d.theme === "shadow" && Math.random() < 0.15) { v.set((Math.random() - 0.5) * 20, 1.2, (Math.random() - 0.5) * 20).applyMatrix4(p.g.matrixWorld); P.smoke.spawn(v.x, v.y, v.z, 0, 0.4, 0, { life: 3, size: 1.5, size1: 4, color: 0x1a1028, alpha: 0.35, drag: 0.5, spin: 0.4 }); }
      }
      // lightning crackling across the storm gate
      if (p.d.theme === "storm") {
        p.arcT -= dt;
        if (p.arcT <= 0) {
          p.arcT = 0.4 + Math.random() * 0.9;
          const a1 = Math.random() * Math.PI, a2 = Math.min(Math.PI, Math.max(0, a1 + (Math.random() - 0.5) * 1.6));
          v.set(Math.cos(a1) * (p.inner + 0.6), p.archY + Math.sin(a1) * (p.inner + 0.6), 1.3).applyMatrix4(p.g.matrixWorld);
          w2.set(Math.cos(a2) * (p.inner + 0.6), p.archY + Math.sin(a2) * (p.inner + 0.6), 1.3).applyMatrix4(p.g.matrixWorld);
          effects.arc(0x8fd8ff, v.clone(), w2.clone(), 0.2, 0.14);
        }
      }
    }
    for (let i = 0; i < havenRunes.length; i++) havenRunes[i].material.opacity = 0.55 + 0.3 * Math.sin(t * 1.6 + i * 0.7) * (0.5 + light.night * 0.5) + light.night * 0.15;   // the runes breathe (brighter at night)
    for (const s of anim.stones) {
      const u = s.userData, a = u.a + t * 0.15;
      s.position.set(Math.cos(a) * u.r, u.y + Math.sin(t * 0.9 + u.ph) * 0.6, Math.sin(a) * u.r * 0.55);
      s.rotation.set(t * 0.3 + u.ph, t * 0.4, 0);
    }
    if (envOn && env.renderer && t - envT > 20) updateEnv(t);   // refresh the sky reflections now and then (the sky changes slowly; doing it often caused hitches)
    return light;
  }

  // ---- how high the ground is at a spot (the gate steps and haven platforms you can stand on) ----
  // (must match the shapes: gate dais = two round steps, tops at 0.55 and 1.1; haven stone circle top at 0.32)
  function groundAt(x, z) {
    for (const d of map.doors) {
      const dx = x - d.x, dz = z - d.y;
      if (dx * dx + dz * dz > 13.3 * 13.3) continue;
      const r = Math.sqrt(dx * dx + dz * dz);
      return r < 10.85 ? 1.1 : 0.55;
    }
    for (const h of map.havens || []) {
      if (h.town) continue;
      const dx = x - h.x, dz = z - h.y;
      if (dx * dx + dz * dz < 6.4 * 6.4) return 0.32;
    }
    return 0;
  }

  // ---- sky reflections: every few seconds the sky is captured so metal, water and stone pick up its colour ----
  let envOn = false, envT = -99, envRT = null, pmrem = null;
  const envScene = new THREE.Scene();
  const envSky = new THREE.Mesh(new THREE.SphereGeometry(40, 32, 16), sky.material);
  envScene.add(envSky); disposables.push(envSky.geometry);
  function updateEnv(t) {
    envT = t;
    pmrem = pmrem || new THREE.PMREMGenerator(env.renderer);
    const rt = pmrem.fromScene(envScene, 0.03);
    if (scene.environment === envRT?.texture || !scene.environment) scene.environment = rt.texture;
    envRT?.dispose(); envRT = rt;
  }
  function setReflections(on) {
    envOn = on;
    if (!on && envRT) { if (scene.environment === envRT.texture) scene.environment = null; envRT.dispose(); envRT = null; envT = -99; }
  }
  // ---- grass and flowers can be switched off on slow PCs ----
  const grassMeshes = [];
  G.traverse(o => { if (o.isInstancedMesh && o.material?.alphaTest > 0) grassMeshes.push(o); });
  const setGrass = (on) => grassMeshes.forEach(m => { m.visible = on; });
  // ---- your own photo textures (realistic mode): ground, rock and dirt from viewer/assets/ ----
  const stylised = { ground: groundMat.map, road: null, rock: rockMat.map };
  const roadMats = [];
  G.traverse(o => { if (o.isMesh && o.material?.map === T.road) roadMats.push(o.material); });
  const roadAlpha = (() => {   // the soft edges of the road, so a photo texture blends into the grass
    const [c, g] = canvas(64, 4); const grd = g.createLinearGradient(0, 0, 64, 0);
    grd.addColorStop(0, "#000"); grd.addColorStop(0.18, "#fff"); grd.addColorStop(0.82, "#fff"); grd.addColorStop(1, "#000");
    g.fillStyle = grd; g.fillRect(0, 0, 64, 4); const t = toTex(c, { color: false }); disposables.push(t); return t;
  })();
  const withRepeat = (tex, r) => { if (!tex) return null; const t = tex.clone(); t.repeat.set(r, r); t.needsUpdate = true; disposables.push(t); return t; };
  function setRealistic(A) {
    const g = A?.ground, r = A?.rock, d = A?.dirt;
    groundMat.map = g?.map ? withRepeat(g.map, size / 5) : stylised.ground;
    groundMat.normalMap = g?.normalMap ? withRepeat(g.normalMap, size / 5) : null;
    groundMat.roughnessMap = g?.roughnessMap ? withRepeat(g.roughnessMap, size / 5) : null;
    groundGeo.setAttribute("color", g?.map ? groundColorsReal : groundColors);
    rockU.uRockMap.value = r?.map ? withRepeat(r.map, 1) : null;
    rockU.uUseRock.value = g?.map && r?.map ? 1 : 0;
    rockMat.map = r?.map ? withRepeat(r.map, 2) : stylised.rock;
    rockMat.normalMap = r?.normalMap ? withRepeat(r.normalMap, 2) : null;
    for (const m of roadMats) {
      if (d?.map) { m.map = withRepeat(d.map, 1); m.map.repeat.set(2, 6); m.alphaMap = roadAlpha; m.normalMap = d.normalMap ? withRepeat(d.normalMap, 1) : null; if (m.normalMap) m.normalMap.repeat.set(2, 6); }
      else { m.map = T.road; m.alphaMap = null; m.normalMap = null; }
      m.needsUpdate = true;
    }
    for (const m of [groundMat, rockMat]) m.needsUpdate = true;
  }

  function dispose() {
    setReflections(false);
    pmrem?.dispose();
    scene.remove(G);
    G.traverse(o => { if (o.isInstancedMesh) o.dispose(); });
    for (const d of new Set(disposables)) d?.dispose?.();
  }
  return { group: G, animate, dispose, skyHorizon: () => skyU.uHorizon.value, setRealistic, setGrass, setReflections, light, groundAt };
}