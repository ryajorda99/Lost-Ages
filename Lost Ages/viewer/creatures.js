// creatures.js — proper bodies for the monsters, so each one looks like its name.
//
//   skeleton  Crypt Skeleton, Bone Archer, Hollow Skeleton — real bones: skull, ribcage, spine, pelvis
//   ghoul     Crypt Ghoul, Corrupted Servant — gaunt, hunched, long clawed arms, a gaping jaw
//   imp       Cinder Imp — a small lava demon: horns, pointed ears, a wicked grin, bat wings, a tail
//   golem     Molten Giant — a hulking giant of cracked lava rock with boulder fists
//   hound     Magma Hound — a four-legged lava hound with a burning mane (trots, lunges, bites, howls)
//   hawk      Thunderhawk — a great storm hawk that hovers on beating wings and dives with its talons
//   wisp      Gale Wisp, Stormling, Ash Elemental — floating elemental spirits wrapped in whirling wind
//             (or, for the Ash Elemental, a fire core with burning rocks circling it)
//
// The two-legged ones use the same joints as the normal figures, so they walk, swing and cast with
// the normal animations. The hound, hawk and wisps have their own (animateCreature below).
// 3d.html calls initCreatures(...) once with its helpers.

import * as THREE from "three";

let E = null;   // helpers from 3d.html: mat, glowMat, hideTex, lavaTex, bandsTex, taperTube, buildWeapon, buildBatWing, metalEnv, effects
export function initCreatures(env) { E = env; }

// Which kind of creature a monster is (null = an ordinary figure)
export function creatureKind(name = "") {
  if (/Skeleton|Bone Archer/i.test(name)) return "skeleton";
  if (/Ghoul|Corrupted Servant/i.test(name)) return "ghoul";
  if (/Imp\b/i.test(name)) return "imp";
  if (/Molten Giant/i.test(name)) return "golem";
  if (/Hound/i.test(name)) return "hound";
  if (/Thunderhawk/i.test(name)) return "hawk";
  if (/Gale Wisp|Stormling|Ash Elemental/i.test(name)) return "wisp";
  return null;
}

// ---------------------------------------------------------------------
//  helpers
// ---------------------------------------------------------------------
function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const lerp = (a, b, k) => a + (b - a) * k;
function mk(geo, material, x = 0, y = 0, z = 0, parent = null) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true;
  if (parent) parent.add(m);
  return m;
}
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
// a tapered rod from point a to point b
function rod(a, b, r1, r2, material, parent, seg = 8) {
  _a.set(...a); _b.set(...b);
  const len = _a.distanceTo(_b);
  const m = mk(new THREE.CylinderGeometry(r2, r1, len, seg), material, 0, 0, 0, parent);
  m.position.copy(_a).add(_b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(_up, _b.clone().sub(_a).normalize());
  return m;
}
// lumpy, natural shapes (rocks, muscles, skulls)
function roughen(geo, amount, freq = 3, seed = 1) {
  const p = geo.attributes.position, v = new THREE.Vector3(), cache = new Map();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const key = `${v.x.toFixed(3)},${v.y.toFixed(3)},${v.z.toFixed(3)}`;
    let d = cache.get(key);
    if (d == null) { d = (Math.sin(v.x * freq * 7.1 + seed) * Math.cos(v.y * freq * 5.3 - seed) + Math.sin(v.z * freq * 6.7 + v.x * 3 + seed * 2)) * 0.5 * amount; cache.set(key, d); }
    const len = v.length() || 1;
    v.multiplyScalar(1 + d / len);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}
let glowTexCache = null;
function glowTex() {
  if (glowTexCache) return glowTexCache;
  const c = document.createElement("canvas"); c.width = c.height = 64;
  const g = c.getContext("2d"), grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, "rgba(255,255,255,1)"); grd.addColorStop(0.35, "rgba(255,255,255,.5)"); grd.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  return (glowTexCache = new THREE.CanvasTexture(c));
}
const sprite = (color, size, opacity = 0.8) => {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false }));
  s.scale.setScalar(size);
  return s;
};
const additive = (color, opacity = 0.7) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });

// =====================================================================
//  BUILD
// =====================================================================
export function buildCreature(kind, look, seed = 1) {
  const mats = [];
  const track = (m) => { mats.push(m); return m; };
  const mat = (c, o) => track(E.mat(c, o));
  const glow = (c) => E.glowMat(c);
  const r = rng(seed * 31 + 7);
  const lava = (tint = 0xffffff, glowI = 1.4) => {
    const L = E.lavaTex(2, 2);
    return mat(tint, { map: L.map, emissiveMap: L.glow, emissive: 0xffffff, emissiveIntensity: glowI, bumpMap: L.bump, bumpScale: 4, roughness: 0.85, metalness: 0 });
  };
  const builders = { skeleton, ghoul, imp, golem, hound, hawk, wisp };
  const out = builders[kind]();
  out.body.traverse(o => { if (o.isMesh && !o.material.blending) o.castShadow = true; });
  return { ...out, mats };

  // ---------------------------------------------------------------
  //  SKELETON — bones on the same joints as a normal figure
  // ---------------------------------------------------------------
  function skeleton() {
    const body = new THREE.Group(), parts = {};
    const B = mat(0xe4dac2, { roughness: 0.72, metalness: 0, map: E.hideTex(1, 1), bumpMap: E.hideTex(1, 1), bumpScale: 1.5 });
    const dark = mat(0x0a0806, { roughness: 1 });
    const knob = (rad, x, y, z, p) => mk(new THREE.SphereGeometry(rad, 10, 8), B, x, y, z, p);
    // legs
    for (const side of [-1, 1]) {
      const hip = new THREE.Group(); hip.position.set(0.09 * side, 0.95, 0); body.add(hip);
      knob(0.042, 0, 0, 0, hip);
      rod([0, -0.02, 0], [0, -0.44, 0.01], 0.026, 0.021, B, hip);
      knob(0.036, 0.01 * side, -0.45, 0.01, hip);
      const knee = new THREE.Group(); knee.position.y = -0.46; hip.add(knee);
      rod([0.01, 0, 0], [0.01, -0.42, 0], 0.022, 0.017, B, knee);
      rod([-0.02 * side, -0.02, -0.01], [-0.015 * side, -0.41, -0.01], 0.01, 0.009, B, knee);
      knob(0.026, 0, -0.43, 0, knee);
      mk(new THREE.BoxGeometry(0.06, 0.025, 0.1), B, 0, -0.445, 0.03, knee);
      for (let k = -1; k <= 1; k++) rod([k * 0.018, -0.45, 0.08], [k * 0.022, -0.455, 0.15], 0.008, 0.006, B, knee, 5);
      parts[side < 0 ? "legL" : "legR"] = hip; parts[side < 0 ? "kneeL" : "kneeR"] = knee;
    }
    // pelvis
    for (const side of [-1, 1]) { const il = mk(new THREE.SphereGeometry(0.075, 12, 8), B, 0.07 * side, 1.0, -0.01, body); il.scale.set(0.9, 0.85, 0.35); il.rotation.z = -0.4 * side; }
    mk(new THREE.BoxGeometry(0.07, 0.09, 0.05), B, 0, 0.98, -0.05, body);
    // spine, ribs, shoulders
    const spine = new THREE.Group(); spine.position.y = 0.95; body.add(spine); parts.spine = spine;
    for (let i = 0; i < 12; i++) {
      const y = 0.03 + i * 0.047;
      mk(new THREE.CylinderGeometry(0.021, 0.023, 0.03, 8), B, 0, y, -0.06, spine);
      mk(new THREE.BoxGeometry(0.012, 0.022, 0.04), B, 0, y, -0.09, spine);
    }
    const gap = 0.7;
    for (let i = 0; i < 7; i++) {
      const rad = 0.135 - Math.abs(i - 2.5) * 0.012, y = 0.22 + i * 0.045;
      const rib = mk(new THREE.TorusGeometry(rad, 0.011, 5, 20, Math.PI * 2 - gap), B, 0, y, -0.01, spine);
      rib.rotation.x = -Math.PI / 2; rib.rotation.z = gap / 2 - Math.PI / 2 + Math.PI;
      rib.scale.set(1, 0.72, 1);
    }
    mk(new THREE.BoxGeometry(0.03, 0.2, 0.018), B, 0, 0.35, 0.09, spine);   // breastbone
    for (const side of [-1, 1]) rod([0.015 * side, 0.52, 0.07], [0.19 * side, 0.52, 0.0], 0.012, 0.011, B, spine);
    rod([0, 0.6, -0.05], [0, 0.7, -0.02], 0.02, 0.018, B, spine);   // neck bones
    // arms
    for (const side of [-1, 1]) {
      const sh = new THREE.Group(); sh.position.set(0.2 * side, 0.5, 0); spine.add(sh);
      knob(0.034, 0, 0, 0, sh);
      rod([0, -0.02, 0], [0, -0.28, 0], 0.021, 0.017, B, sh);
      const el = new THREE.Group(); el.position.y = -0.3; sh.add(el);
      knob(0.026, 0, 0, 0, el);
      rod([0.012, 0, 0], [0.012, -0.27, 0], 0.011, 0.009, B, el);
      rod([-0.012, 0, 0], [-0.01, -0.27, 0], 0.011, 0.009, B, el);
      const hand = new THREE.Group(); hand.position.y = -0.3; el.add(hand);
      mk(new THREE.BoxGeometry(0.045, 0.045, 0.014), B, 0, -0.01, 0, hand);
      for (let f = 0; f < 4; f++) rod([-0.018 + f * 0.012, -0.03, 0], [-0.02 + f * 0.013, -0.09, 0.012], 0.005, 0.004, B, hand, 5);
      parts[side < 0 ? "armL" : "armR"] = sh; parts[side < 0 ? "elbowL" : "elbowR"] = el; parts[side < 0 ? "handL" : "handR"] = hand;
    }
    // skull
    const head = new THREE.Group(); head.position.y = 0.78; spine.add(head); parts.head = head;
    const skull = mk(roughen(new THREE.SphereGeometry(0.1, 20, 16), 0.004, 3, seed), B, 0, 0.03, -0.005, head); skull.scale.set(0.9, 1, 1.08);
    const face = mk(new THREE.SphereGeometry(0.075, 16, 12), B, 0, -0.01, 0.04, head); face.scale.set(0.95, 1, 0.85);
    for (const side of [-1, 1]) {
      mk(new THREE.SphereGeometry(0.027, 10, 8), dark, 0.034 * side, 0.015, 0.094, head);
      mk(new THREE.SphereGeometry(0.009, 8, 6), glow(look.eyes ?? 0x88aaff), 0.034 * side, 0.015, 0.104, head);
      mk(new THREE.SphereGeometry(0.02, 8, 6), B, 0.06 * side, -0.02, 0.07, head).scale.set(1, 0.6, 1);   // cheekbones
    }
    mk(new THREE.ConeGeometry(0.012, 0.03, 4), dark, 0, -0.018, 0.112, head).rotation.x = Math.PI;   // nose hole
    mk(new THREE.BoxGeometry(0.07, 0.02, 0.025), B, 0, -0.05, 0.088, head);   // upper teeth
    const jaw = new THREE.Group(); jaw.position.set(0, -0.055, 0.0); jaw.rotation.x = 0.18; head.add(jaw);
    mk(new THREE.BoxGeometry(0.075, 0.022, 0.09), B, 0, -0.018, 0.05, jaw);
    mk(new THREE.BoxGeometry(0.066, 0.016, 0.02), B, 0, -0.004, 0.088, jaw);
    // scraps of what they were: rusted helm and a tattered loincloth (warriors), a ragged hood (archers)
    const rust = mat(0x5a3e2a, { metalness: 0.55, roughness: 0.75, map: E.hideTex(1, 1) });
    if (look.weapon !== "bow") {
      const helm = mk(new THREE.SphereGeometry(0.112, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), rust, 0, 0.04, -0.005, head); helm.scale.set(0.95, 0.95, 1.08);
      mk(new THREE.BoxGeometry(0.018, 0.08, 0.02), rust, 0, -0.01, 0.112, head);   // nose guard
      const p = mk(new THREE.SphereGeometry(0.09, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), rust, 0.215, 0.53, 0, spine); p.scale.set(1.1, 0.8, 1.1);
    } else {
      const hood = mk(new THREE.SphereGeometry(0.13, 18, 12, Math.PI / 2 + 0.9, Math.PI * 2 - 1.8, 0, Math.PI * 0.7), mat(0x2a2620, { side: THREE.DoubleSide, roughness: 1 }), 0, 0.03, -0.02, head);
      hood.scale.set(1, 1.1, 1.05);
    }
    const cloth = mat(0x2e2a24, { side: THREE.DoubleSide, roughness: 1 });
    const loin = mk(new THREE.PlaneGeometry(0.18, 0.3, 3, 4), cloth, 0, 0.82, 0.08, body);
    const lp = loin.geometry.attributes.position;
    for (let i = 0; i < lp.count; i++) if (lp.getY(i) < -0.1) lp.setY(i, lp.getY(i) - r() * 0.06);   // ragged hem
    mk(new THREE.TorusGeometry(0.11, 0.012, 5, 18), cloth, 0, 0.97, 0, body).rotation.x = Math.PI / 2;
    // weapon (rusted sword and shield, or a bow)
    if (!look.noWeapon) {
      const w = E.buildWeapon(look.weapon || "sword", { ...look, worn: true });
      if (look.weapon === "bow") parts.handL.add(w); else parts.handR.add(w);
    }
    if (look.offhand === "shield") {
      const sg = new THREE.Group(); parts.handL.add(sg);
      const wood = mat(0x5a4028, { roughness: 0.95, map: E.hideTex(1, 1) });
      const disc = mk(new THREE.CylinderGeometry(0.24, 0.24, 0.035, 20), wood, 0.05, 0, 0.02, sg); disc.rotation.z = Math.PI / 2;
      const rim = mk(new THREE.TorusGeometry(0.24, 0.016, 6, 24), rust, 0.05, 0, 0.02, sg); rim.rotation.y = Math.PI / 2;
      mk(new THREE.SphereGeometry(0.05, 12, 8), rust, 0.075, 0, 0.02, sg).scale.set(0.6, 1, 1);
      for (let k = 0; k < 3; k++) mk(new THREE.BoxGeometry(0.008, 0.46, 0.02), mat(0x2a1e14), 0.07, 0, -0.12 + k * 0.12, sg);   // cracks between the planks
    } else if (look.offhand) parts.handL.add(E.buildWeapon(look.offhand, look));
    return { body, parts, height: 1.85, rig: "figure" };
  }

  // ---------------------------------------------------------------
  //  GHOUL — starved, hunched, long arms ending in claws
  // ---------------------------------------------------------------
  function ghoul() {
    const body = new THREE.Group(), parts = {};
    const F = mat(look.body ?? 0x6a7a5a, { roughness: 0.62, metalness: 0.05, map: E.hideTex(2, 2), bumpMap: E.hideTex(2, 2), bumpScale: 2.5 });
    F.color.multiplyScalar(1.25);
    const Fd = mat(look.trim ?? 0x334422, { roughness: 0.7, map: E.hideTex(1, 1) });
    const claw = mat(0x15120e, { roughness: 0.35 });
    const dark = mat(0x050404, { roughness: 1 });
    for (const side of [-1, 1]) {   // bony, bent legs
      const hip = new THREE.Group(); hip.position.set(0.1 * side, 0.92, 0); body.add(hip);
      mk(new THREE.SphereGeometry(0.06, 10, 8), F, 0, 0, 0, hip);
      rod([0, 0, 0], [0, -0.44, 0.02], 0.055, 0.035, F, hip);
      const knee = new THREE.Group(); knee.position.set(0, -0.45, 0.02); hip.add(knee);
      mk(new THREE.SphereGeometry(0.042, 10, 8), F, 0, 0, 0, knee);
      rod([0, 0, 0], [0, -0.4, -0.02], 0.036, 0.026, F, knee);
      mk(new THREE.BoxGeometry(0.07, 0.035, 0.17), F, 0, -0.42, 0.04, knee);
      for (let k = -1; k <= 1; k++) { const c = mk(new THREE.ConeGeometry(0.009, 0.05, 5), claw, k * 0.022, -0.43, 0.14, knee); c.rotation.x = Math.PI / 2; }
      parts[side < 0 ? "legL" : "legR"] = hip; parts[side < 0 ? "kneeL" : "kneeR"] = knee;
    }
    const spine = new THREE.Group(); spine.position.y = 0.92; spine.rotation.x = 0.5; body.add(spine); parts.spine = spine;
    const torso = mk(roughen(new THREE.CylinderGeometry(0.15, 0.11, 0.56, 16, 6), 0.012, 3, seed), F, 0, 0.3, 0, spine); torso.scale.set(1, 1, 0.72);
    mk(new THREE.SphereGeometry(0.11, 14, 10), F, 0, 0.04, 0, spine).scale.set(1.1, 0.7, 0.8);   // hollow belly
    for (let i = 0; i < 5; i++) {   // ribs pushing through the skin
      const rib = mk(new THREE.TorusGeometry(0.14 - i * 0.004, 0.012, 5, 16, Math.PI * 0.9), F, 0, 0.26 + i * 0.05, 0.004, spine);
      rib.rotation.set(-Math.PI / 2, 0, Math.PI * 0.05); rib.scale.set(1, 0.75, 1);
    }
    for (let i = 0; i < 9; i++) mk(new THREE.SphereGeometry(0.022, 8, 6), F, 0, 0.08 + i * 0.06, -0.1, spine);   // knobbly spine
    rod([0, 0.56, 0], [0, 0.7, 0.04], 0.04, 0.035, F, spine);   // scrawny neck
    // head: bald, sunken eyes, pointed ears and a gaping jaw full of teeth
    const head = new THREE.Group(); head.position.set(0, 0.74, 0.05); spine.add(head); parts.head = head;
    const skull = mk(roughen(new THREE.SphereGeometry(0.105, 20, 14), 0.006, 3, seed), F, 0, 0.02, 0, head); skull.scale.set(0.85, 1, 1.15);
    for (const side of [-1, 1]) {
      mk(new THREE.SphereGeometry(0.026, 10, 8), dark, 0.038 * side, 0.025, 0.09, head);
      mk(new THREE.SphereGeometry(0.012, 8, 6), glow(look.eyes ?? 0xccff66), 0.038 * side, 0.025, 0.1, head);
      const ear = mk(new THREE.ConeGeometry(0.025, 0.13, 6), F, 0.1 * side, 0.04, -0.01, head); ear.rotation.set(-0.3, 0, -1.2 * side);
    }
    const jaw = new THREE.Group(); jaw.position.set(0, -0.05, 0.02); jaw.rotation.x = 0.45; head.add(jaw);
    mk(new THREE.BoxGeometry(0.09, 0.03, 0.13), F, 0, -0.02, 0.06, jaw);
    const tooth = mat(0xd8cfa8, { roughness: 0.4 });
    for (let k = 0; k < 6; k++) {
      const x = -0.035 + k * 0.014;
      mk(new THREE.ConeGeometry(0.006, 0.03, 4), tooth, x, -0.002, 0.12, jaw);
      mk(new THREE.ConeGeometry(0.006, 0.03, 4), tooth, x, -0.06, 0.12, head).rotation.x = Math.PI;
    }
    mk(new THREE.BoxGeometry(0.07, 0.04, 0.02), mat(0x3a0a0a), 0, -0.05, 0.1, head);   // throat
    // long arms with claws
    for (const side of [-1, 1]) {
      const sh = new THREE.Group(); sh.position.set(0.19 * side, 0.5, 0); spine.add(sh);
      mk(new THREE.SphereGeometry(0.048, 10, 8), F, 0, 0, 0, sh);
      rod([0, 0, 0], [0, -0.36, 0], 0.04, 0.03, F, sh);
      const el = new THREE.Group(); el.position.y = -0.37; sh.add(el);
      mk(new THREE.SphereGeometry(0.034, 10, 8), F, 0, 0, 0, el);
      rod([0, 0, 0], [0, -0.35, 0], 0.031, 0.022, F, el);
      const hand = new THREE.Group(); hand.position.y = -0.36; el.add(hand);
      mk(new THREE.BoxGeometry(0.06, 0.06, 0.025), F, 0, -0.02, 0, hand);
      for (let f = 0; f < 4; f++) { const c = mk(new THREE.ConeGeometry(0.008, 0.13, 5), claw, -0.024 + f * 0.016, -0.11, 0.015, hand); c.rotation.x = Math.PI + 0.25; }
      parts[side < 0 ? "armL" : "armR"] = sh; parts[side < 0 ? "elbowL" : "elbowR"] = el; parts[side < 0 ? "handL" : "handR"] = hand;
    }
    const rag = mk(new THREE.PlaneGeometry(0.22, 0.26, 3, 3), mat(0x2a2620, { side: THREE.DoubleSide, roughness: 1 }), 0, 0.8, 0.09, body);
    rag.rotation.x = -0.15;
    return { body, parts, height: 1.6, rig: "figure" };
  }

  // ---------------------------------------------------------------
  //  CINDER IMP — a small lava demon
  // ---------------------------------------------------------------
  function imp() {
    const body = new THREE.Group(), parts = {};
    const S = lava(0xff9a80, 1.3);
    const horn = mat(0x1a1210, { roughness: 0.4, metalness: 0.1, map: E.bandsTex(1, 6), bumpMap: E.bandsTex(1, 6), bumpScale: 3 });
    const hoof = mat(0x120c0a, { roughness: 0.5 });
    for (const side of [-1, 1]) {   // goat legs ending in hooves
      const hip = new THREE.Group(); hip.position.set(0.1 * side, 0.9, 0); body.add(hip);
      mk(roughen(new THREE.SphereGeometry(0.08, 12, 10), 0.006, 3, side), S, 0, -0.05, 0.02, hip).scale.set(1, 1.3, 1);
      rod([0, -0.02, 0.02], [0, -0.42, 0.08], 0.07, 0.045, S, hip);
      const knee = new THREE.Group(); knee.position.set(0, -0.44, 0.08); hip.add(knee);
      rod([0, 0, 0], [0, -0.2, -0.12], 0.042, 0.03, S, knee);
      rod([0, -0.2, -0.12], [0, -0.42, -0.04], 0.03, 0.035, S, knee);
      mk(new THREE.CylinderGeometry(0.04, 0.05, 0.05, 8), hoof, 0, -0.43, -0.03, knee);
      parts[side < 0 ? "legL" : "legR"] = hip; parts[side < 0 ? "kneeL" : "kneeR"] = knee;
    }
    const spine = new THREE.Group(); spine.position.y = 0.9; body.add(spine); parts.spine = spine;
    mk(roughen(new THREE.SphereGeometry(0.17, 18, 14), 0.01, 3, seed), S, 0, 0.17, 0.02, spine).scale.set(1, 1.1, 0.9);   // pot belly
    mk(roughen(new THREE.SphereGeometry(0.16, 18, 14), 0.01, 3, seed + 1), S, 0, 0.38, 0, spine).scale.set(1.15, 0.9, 0.85);   // chest
    for (let i = 0; i < 4; i++) { const sp = mk(new THREE.ConeGeometry(0.03, 0.1, 5), horn, 0, 0.18 + i * 0.09, -0.13, spine); sp.rotation.x = -0.9; }   // back spikes
    // big head: curled horns, pointed ears, a wide glowing grin
    const head = new THREE.Group(); head.position.set(0, 0.62, 0.03); spine.add(head); parts.head = head;
    mk(roughen(new THREE.SphereGeometry(0.16, 20, 16), 0.008, 3, seed), S, 0, 0.04, 0, head).scale.set(1.05, 0.95, 1);
    mk(new THREE.SphereGeometry(0.1, 14, 10), S, 0, -0.03, 0.08, head).scale.set(1.2, 0.8, 0.9);   // snout / cheeks
    for (const side of [-1, 1]) {
      head.add(mk(E.taperTube([[0.07 * side, 0.13, 0.02], [0.14 * side, 0.24, -0.02], [0.2 * side, 0.27, -0.12], [0.24 * side, 0.2, -0.2], [0.22 * side, 0.12, -0.18]], 0.035, 0.1, 8, 20), horn));
      const ear = mk(new THREE.ConeGeometry(0.035, 0.2, 6), S, 0.17 * side, 0.05, -0.02, head); ear.rotation.set(-0.2, 0, -1.25 * side);
      mk(new THREE.SphereGeometry(0.032, 10, 8), glow(look.eyes ?? 0xffee00), 0.06 * side, 0.06, 0.135, head).scale.set(1.3, 0.8, 0.6);
      for (let k = 0; k < 2; k++) { const f = mk(new THREE.ConeGeometry(0.009, 0.04, 4), mat(0xf0e6c8, { roughness: 0.4 }), (0.03 + k * 0.03) * side, -0.07, 0.15, head); f.rotation.x = Math.PI; }
    }
    const grin = mk(new THREE.TorusGeometry(0.075, 0.012, 6, 16, Math.PI), glow(0xff8a2a), 0, -0.03, 0.14, head); grin.rotation.z = Math.PI; grin.scale.y = 0.55;
    // thin clawed arms; a ball of fire in one hand
    for (const side of [-1, 1]) {
      const sh = new THREE.Group(); sh.position.set(0.19 * side, 0.46, 0); spine.add(sh);
      mk(new THREE.SphereGeometry(0.055, 10, 8), S, 0, 0, 0, sh);
      rod([0, 0, 0], [0, -0.27, 0], 0.045, 0.035, S, sh);
      const el = new THREE.Group(); el.position.y = -0.28; sh.add(el);
      rod([0, 0, 0], [0, -0.25, 0], 0.035, 0.028, S, el);
      const hand = new THREE.Group(); hand.position.y = -0.27; el.add(hand);
      mk(new THREE.SphereGeometry(0.04, 10, 8), S, 0, -0.01, 0, hand);
      for (let f = 0; f < 3; f++) { const c = mk(new THREE.ConeGeometry(0.008, 0.07, 5), horn, -0.016 + f * 0.016, -0.06, 0.015, hand); c.rotation.x = Math.PI + 0.3; }
      parts[side < 0 ? "armL" : "armR"] = sh; parts[side < 0 ? "elbowL" : "elbowR"] = el; parts[side < 0 ? "handL" : "handR"] = hand;
    }
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.075, 14, 10), new THREE.MeshStandardMaterial({ color: 0x220800, emissive: 0xff6a1a, emissiveIntensity: 2 }));
    orb.position.set(0, -0.1, 0.06); parts.handR.add(orb); parts.orb = orb;
    orb.add(sprite(0xff7a2a, 0.5, 0.7));
    // little bat wings and a spade tail
    const wingMat = mat(0x3a120a, { side: THREE.DoubleSide, roughness: 0.8, emissive: 0x551100, emissiveIntensity: 0.6 });
    const bw = {};
    for (const side of [-1, 1]) {
      const pivot = new THREE.Group(); pivot.position.set(0.06 * side, 0.44, -0.12);
      const w = E.buildBatWing(0.8, wingMat, horn, horn); w.scale.x = side; pivot.add(w);
      spine.add(pivot); bw[side < 0 ? "left" : "right"] = pivot;
    }
    parts.batWings = bw;
    const tail = new THREE.Group(); tail.position.set(0, 0.85, -0.12); body.add(tail); parts.tail = tail;
    tail.add(mk(E.taperTube([[0, 0, 0], [0, -0.1, -0.2], [0.08, -0.3, -0.38], [0.2, -0.5, -0.42], [0.3, -0.58, -0.3]], 0.035, 0.3, 8, 20), S));
    const spade = mk(new THREE.ConeGeometry(0.06, 0.13, 4), horn, 0.33, -0.6, -0.26, tail); spade.rotation.set(0.6, 0, -1.4); spade.scale.set(1, 1, 0.3);
    return { body, parts, height: 1.55, rig: "figure" };
  }

  // ---------------------------------------------------------------
  //  MOLTEN GIANT — a hulking golem of cracked lava rock
  // ---------------------------------------------------------------
  function golem() {
    const body = new THREE.Group(), parts = {};
    const S = lava(0xffffff, 1.7);
    const core = new THREE.MeshStandardMaterial({ color: 0x220400, emissive: 0xff5a10, emissiveIntensity: 3 });
    const chunk = (rad, x, y, z, parent, sx = 1, sy = 1, sz = 1, s2 = 0) => { const m = mk(roughen(new THREE.IcosahedronGeometry(rad, 2), rad * 0.16, 2.2, seed + s2), S, x, y, z, parent); m.scale.set(sx, sy, sz); m.rotation.set(r() * 3, r() * 3, r() * 3); return m; };
    for (const side of [-1, 1]) {   // short, massive legs
      const hip = new THREE.Group(); hip.position.set(0.17 * side, 0.95, 0); body.add(hip);
      chunk(0.21, 0, -0.2, 0, hip, 1, 1.3, 1, side);
      const knee = new THREE.Group(); knee.position.y = -0.46; hip.add(knee);
      chunk(0.2, 0, -0.17, 0, knee, 1.05, 1.3, 1.05, side + 3);
      chunk(0.17, 0, -0.42, 0.07, knee, 1.35, 0.6, 1.6, side + 5);   // a slab of a foot
      parts[side < 0 ? "legL" : "legR"] = hip; parts[side < 0 ? "kneeL" : "kneeR"] = knee;
    }
    const spine = new THREE.Group(); spine.position.y = 0.95; body.add(spine); parts.spine = spine;
    chunk(0.24, 0, 0.12, 0, spine, 1.1, 0.8, 0.9, 1);           // waist
    chunk(0.36, 0, 0.42, 0.02, spine, 1.25, 0.95, 0.9, 2);      // huge chest
    mk(new THREE.SphereGeometry(0.1, 16, 12), core, 0, 0.42, 0.29, spine);   // the molten heart showing through
    spine.children.at(-1).add(sprite(0xff6a1a, 0.7, 0.8));
    for (const side of [-1, 1]) chunk(0.2, 0.36 * side, 0.6, -0.02, spine, 1, 0.9, 1, 3 + side);   // boulder shoulders
    for (let i = 0; i < 5; i++) { const sp = mk(new THREE.ConeGeometry(0.06, 0.25, 5), S, (r() - 0.5) * 0.4, 0.62 + r() * 0.12, -0.2, spine); sp.rotation.x = -0.7; }   // jagged back
    // a small head sunk between the shoulders
    const head = new THREE.Group(); head.position.set(0, 0.74, 0.08); spine.add(head); parts.head = head;
    chunk(0.13, 0, 0.02, 0, head, 1, 0.85, 1, 9);
    for (const side of [-1, 1]) mk(new THREE.BoxGeometry(0.05, 0.016, 0.03), glow(look.eyes ?? 0xffaa33), 0.045 * side, 0.03, 0.115, head);
    mk(new THREE.BoxGeometry(0.08, 0.018, 0.03), core, 0, -0.04, 0.11, head);
    // long arms with boulder fists
    for (const side of [-1, 1]) {
      const sh = new THREE.Group(); sh.position.set(0.38 * side, 0.55, 0); spine.add(sh);
      chunk(0.13, 0, -0.17, 0, sh, 1, 1.5, 1, 11 + side);
      const el = new THREE.Group(); el.position.y = -0.36; sh.add(el);
      chunk(0.14, 0, -0.17, 0, el, 1.05, 1.5, 1.05, 13 + side);
      const hand = new THREE.Group(); hand.position.y = -0.38; el.add(hand);
      chunk(0.17, 0, -0.08, 0.02, hand, 1.1, 1, 1.15, 15 + side);
      parts[side < 0 ? "armL" : "armR"] = sh; parts[side < 0 ? "elbowL" : "elbowR"] = el; parts[side < 0 ? "handL" : "handR"] = hand;
    }
    mats.push(core);
    return { body, parts, height: 1.9, rig: "figure" };
  }

  // ---------------------------------------------------------------
  //  MAGMA HOUND — four legs, a burning mane, jaws that open
  // ---------------------------------------------------------------
  function hound() {
    const body = new THREE.Group(), parts = { legs: [] };
    const S = lava(0xffb0a0, 1.5);
    const dark = mat(0x1a0c08, { roughness: 0.6 });
    const flameMat = new THREE.MeshStandardMaterial({ color: 0x220600, emissive: 0xff6a1a, emissiveIntensity: 2.6, roughness: 0.6 });
    mats.push(flameMat);
    const torso = new THREE.Group(); torso.position.set(0, 0.68, 0); body.add(torso); parts.torso = torso;
    mk(roughen(new THREE.SphereGeometry(0.3, 20, 16), 0.02, 2.5, seed), S, 0, 0.02, 0.32, torso).scale.set(0.95, 1.0, 1.1);    // deep chest
    mk(roughen(new THREE.SphereGeometry(0.27, 20, 16), 0.02, 2.5, seed + 1), S, 0, 0.04, -0.12, torso).scale.set(0.72, 0.78, 1.3); // lean belly
    mk(roughen(new THREE.SphereGeometry(0.24, 18, 14), 0.02, 2.5, seed + 2), S, 0, 0.06, -0.5, torso).scale.set(0.85, 0.85, 0.95); // haunches
    for (let i = 0; i < 9; i++) {   // a mane of flame spikes along the back
      const z = 0.55 - i * 0.12, h = 0.22 - Math.abs(i - 2) * 0.018;
      const sp = mk(new THREE.ConeGeometry(0.05, h, 5), flameMat, (r() - 0.5) * 0.06, 0.28 - i * 0.008, z, torso); sp.rotation.x = -0.9;
    }
    // neck and head
    const neck = new THREE.Group(); neck.position.set(0, 0.16, 0.55); torso.add(neck); parts.neck = neck;
    rod([0, 0, 0], [0, 0, 0.32], 0.16, 0.12, S, neck, 12);
    const head = new THREE.Group(); head.position.set(0, 0, 0.36); neck.add(head); parts.head = head;
    mk(roughen(new THREE.SphereGeometry(0.16, 18, 14), 0.01, 3, seed), S, 0, 0.02, 0, head).scale.set(0.95, 0.85, 1.05);
    mk(roughen(new THREE.BoxGeometry(0.15, 0.1, 0.3, 3, 2, 4), 0.008, 3, seed), S, 0, -0.02, 0.2, head);   // muzzle
    mk(new THREE.SphereGeometry(0.035, 10, 8), dark, 0, 0.02, 0.36, head);   // nose
    for (const side of [-1, 1]) {
      mk(new THREE.SphereGeometry(0.026, 10, 8), glow(look.eyes ?? 0xffaa33), 0.07 * side, 0.06, 0.12, head).scale.set(1.3, 0.7, 0.7);
      const ear = mk(new THREE.ConeGeometry(0.045, 0.16, 5), S, 0.08 * side, 0.15, -0.04, head); ear.rotation.set(-0.5, 0, -0.25 * side);
      for (let k = 0; k < 2; k++) { const f = mk(new THREE.ConeGeometry(0.012, 0.06, 5), mat(0xf0e0c0, { roughness: 0.3 }), (0.035 + k * 0.03) * side, -0.07, 0.3 - k * 0.06, head); f.rotation.x = Math.PI; }
    }
    const jaw = new THREE.Group(); jaw.position.set(0, -0.07, 0.06); head.add(jaw); parts.jaw = jaw;
    mk(roughen(new THREE.BoxGeometry(0.12, 0.045, 0.28, 3, 1, 4), 0.006, 3, seed), S, 0, -0.02, 0.14, jaw);
    for (const side of [-1, 1]) for (let k = 0; k < 2; k++) mk(new THREE.ConeGeometry(0.01, 0.05, 5), mat(0xf0e0c0, { roughness: 0.3 }), (0.035 + k * 0.025) * side, 0.02, 0.25 - k * 0.06, jaw);
    mk(new THREE.PlaneGeometry(0.1, 0.24), flameMat, 0, 0.005, 0.14, jaw).rotation.x = -Math.PI / 2;   // the glowing inside of the mouth
    // four legs: hip → (knee/hock) → paw
    const leg = (x, z, front) => {
      const hip = new THREE.Group(); hip.position.set(x, -0.04, z); torso.add(hip);
      rod([0, 0.06, 0], [0, -0.3, 0], front ? 0.1 : 0.12, 0.06, S, hip, 10);
      const knee = new THREE.Group(); knee.position.y = -0.32; hip.add(knee);
      mk(new THREE.SphereGeometry(0.06, 10, 8), S, 0, 0, 0, knee);
      rod([0, 0, 0], [0, -0.28, 0], 0.055, 0.045, S, knee, 10);
      const paw = mk(roughen(new THREE.SphereGeometry(0.07, 10, 8), 0.005, 3, x * 10), S, 0, -0.29, 0.04, knee); paw.scale.set(1.05, 0.55, 1.4);
      for (let k = -1; k <= 1; k++) { const c = mk(new THREE.ConeGeometry(0.011, 0.05, 5), dark, k * 0.026, -0.31, 0.13, knee); c.rotation.x = Math.PI / 2 + 0.4; }
      parts.legs.push({ hip, knee, front, phase: 0 });
    };
    leg(-0.16, 0.42, true); leg(0.16, 0.42, true); leg(-0.15, -0.55, false); leg(0.15, -0.55, false);
    // trot: diagonal pairs move together
    parts.legs[0].phase = 0; parts.legs[3].phase = 0; parts.legs[1].phase = Math.PI; parts.legs[2].phase = Math.PI;
    // a tail that ends in flame
    const tail = new THREE.Group(); tail.position.set(0, 0.1, -0.72); torso.add(tail); parts.tail = tail;
    tail.add(mk(E.taperTube([[0, 0, 0], [0, 0.12, -0.2], [0, 0.28, -0.36], [0, 0.42, -0.42]], 0.055, 0.3, 8, 16), S));
    const tip = mk(new THREE.ConeGeometry(0.06, 0.25, 6), flameMat, 0, 0.52, -0.44, tail); tip.rotation.x = -0.3;
    tip.add(sprite(0xff6a1a, 0.55, 0.7));
    parts.flame = flameMat;
    return { body, parts, height: 1.0, rig: "hound" };
  }

  // ---------------------------------------------------------------
  //  THUNDERHAWK — a great storm hawk
  // ---------------------------------------------------------------
  function hawk() {
    const body = new THREE.Group(), parts = {};
    const brown = look.body ?? 0x5a4630, pale = 0xd8ccb0, tipC = look.trim ?? 0xffe08a;
    const featherMat = mat(0xffffff, { vertexColors: true, side: THREE.DoubleSide, roughness: 0.85, metalness: 0, emissive: tipC, emissiveIntensity: 0.0 });
    const bodyMat = mat(brown, { roughness: 0.85, map: E.hideTex(2, 2), bumpMap: E.hideTex(2, 2), bumpScale: 1.2 });
    bodyMat.color.multiplyScalar(1.3);
    const chestMat = mat(pale, { roughness: 0.9, map: E.hideTex(2, 2) });
    const yellow = mat(0xd8a830, { roughness: 0.5 });
    const talonMat = mat(0x141210, { roughness: 0.35 });
    // one feather: a long leaf shape lying back along -Z, darker at the root, light (and electric) at the tip
    const feather = (len, wid) => {
      const sh = new THREE.Shape();
      sh.moveTo(0, 0); sh.quadraticCurveTo(wid, len * 0.35, wid * 0.55, len * 0.95); sh.lineTo(0, len); sh.lineTo(-wid * 0.45, len * 0.9); sh.quadraticCurveTo(-wid * 0.9, len * 0.35, 0, 0);
      const g = new THREE.ShapeGeometry(sh, 3).rotateX(-Math.PI / 2);
      const p = g.attributes.position, cols = new Float32Array(p.count * 3), c = new THREE.Color(), c1 = new THREE.Color(brown).multiplyScalar(1.2), c2 = new THREE.Color(tipC);
      for (let i = 0; i < p.count; i++) { const k = Math.min(1, -p.getZ(i) / len); c.copy(c1).lerp(c2, Math.pow(k, 3) * 0.75); cols.set([c.r, c.g, c.b], i * 3); }
      g.setAttribute("color", new THREE.BufferAttribute(cols, 3));
      return g;
    };
    const core = new THREE.Group(); core.position.set(0, 0.5, 0); body.add(core); parts.core = core;
    mk(new THREE.SphereGeometry(0.26, 20, 16), bodyMat, 0, 0, 0, core).scale.set(0.82, 0.78, 1.55);
    mk(new THREE.SphereGeometry(0.22, 18, 14), chestMat, 0, -0.06, 0.16, core).scale.set(0.85, 0.85, 1.1);
    for (let i = 0; i < 4; i++) { const b = mk(new THREE.TorusGeometry(0.15 - i * 0.012, 0.008, 4, 16, Math.PI), mat(0x8a7a60), 0, -0.1 - i * 0.03, 0.12 + i * 0.03, core); b.rotation.set(Math.PI / 2 + 0.3, 0, 0); }   // chest bars
    // head with a hooked beak and a crest
    const head = new THREE.Group(); head.position.set(0, 0.17, 0.4); core.add(head); parts.head = head;
    mk(new THREE.SphereGeometry(0.14, 18, 14), bodyMat, 0, 0, 0, head).scale.set(0.85, 0.9, 1.05);
    mk(new THREE.SphereGeometry(0.12, 14, 10), chestMat, 0, -0.04, 0.04, head).scale.set(0.9, 0.7, 0.9);
    head.add(mk(E.taperTube([[0, 0.02, 0.1], [0, 0.01, 0.2], [0, -0.03, 0.27], [0, -0.09, 0.28]], 0.045, 0.1, 8, 14), yellow));
    const lowerBeak = new THREE.Group(); lowerBeak.position.set(0, -0.02, 0.12); head.add(lowerBeak); parts.beak = lowerBeak;
    mk(new THREE.ConeGeometry(0.03, 0.12, 6), yellow, 0, -0.01, 0.05, lowerBeak).rotation.x = Math.PI / 2;
    for (const side of [-1, 1]) {
      mk(new THREE.SphereGeometry(0.026, 10, 8), glow(look.eyes ?? 0xffee88), 0.07 * side, 0.03, 0.08, head);
      const brow = mk(new THREE.BoxGeometry(0.05, 0.015, 0.06), bodyMat, 0.07 * side, 0.06, 0.08, head); brow.rotation.z = 0.3 * side;
    }
    for (let k = 0; k < 4; k++) { const f = mk(feather(0.22 - k * 0.03, 0.03), featherMat, (k - 1.5) * 0.02, 0.1, -0.06, head); f.rotation.set(0.6, (k - 1.5) * 0.15, 0); }   // crest
    // wings: inner feathers on the arm, long primaries on the hand
    const wings = {};
    for (const side of [-1, 1]) {
      const arm = new THREE.Group(); arm.position.set(0.17 * side, 0.08, 0.08); core.add(arm);
      mk(new THREE.SphereGeometry(0.09, 12, 8), bodyMat, 0.3 * side, 0, -0.06, arm).scale.set(3.5, 0.45, 1.6);   // coverts
      for (let i = 0; i < 8; i++) {
        const f = mk(feather(0.55 + i * 0.015, 0.075), featherMat, (0.08 + i * 0.09) * side, -0.005 * i, 0.02, arm);
        f.rotation.y = side * (0.05 - i * 0.02);
      }
      const hand = new THREE.Group(); hand.position.set(0.82 * side, 0, 0.02); arm.add(hand);
      mk(new THREE.SphereGeometry(0.06, 10, 8), bodyMat, 0.12 * side, 0, -0.03, hand).scale.set(2.6, 0.4, 1.3);
      for (let i = 0; i < 7; i++) {
        const f = mk(feather(0.95 - i * 0.07, 0.07), featherMat, (0.02 + i * 0.035) * side, 0.004 * i, 0, hand);
        f.rotation.y = side * (-0.15 - i * 0.2);   // fanning out from back to sideways
      }
      wings[side < 0 ? "left" : "right"] = { arm, hand, side };
    }
    parts.wings = wings;
    // tail fan
    const tail = new THREE.Group(); tail.position.set(0, -0.02, -0.36); core.add(tail); parts.tail = tail;
    for (let i = 0; i < 9; i++) { const f = mk(feather(0.62, 0.075), featherMat, (i - 4) * 0.025, 0, 0, tail); f.rotation.y = (i - 4) * 0.13; f.rotation.x = 0.08; }
    // legs with talons, tucked up while it flies
    const legs = [];
    for (const side of [-1, 1]) {
      const legG = new THREE.Group(); legG.position.set(0.09 * side, -0.16, 0.05); core.add(legG);
      mk(new THREE.SphereGeometry(0.06, 10, 8), bodyMat, 0, 0, 0, legG).scale.set(1, 1.3, 1);   // feathered thigh
      rod([0, -0.04, 0], [0, -0.24, 0.02], 0.022, 0.02, yellow, legG);
      for (let k = -1; k <= 1; k++) { const t = mk(E.taperTube([[k * 0.02, -0.25, 0.02], [k * 0.035, -0.27, 0.08], [k * 0.04, -0.3, 0.11]], 0.012, 0.2, 5, 8), talonMat); legG.add(t); }
      legG.add(mk(E.taperTube([[0, -0.25, 0.0], [0, -0.28, -0.05], [0, -0.31, -0.07]], 0.012, 0.2, 5, 8), talonMat));
      legs.push(legG);
    }
    parts.legs = legs;
    parts.featherMat = featherMat;
    return { body, parts, height: 1.0, rig: "hawk" };
  }

  // ---------------------------------------------------------------
  //  WISP — a floating elemental spirit (air, or fire with burning rocks)
  // ---------------------------------------------------------------
  function wisp() {
    const body = new THREE.Group(), parts = {};
    const fire = /Ash|fire/i.test(look.kindHint || "") || (look.glow != null && new THREE.Color(look.glow).r > 0.6);
    const col = look.glow ?? (fire ? 0xff6a1a : 0x4aa0ff);
    const core = new THREE.Group(); core.position.y = 1.15; body.add(core); parts.core = core;
    const coreMat = new THREE.MeshStandardMaterial({ color: fire ? 0x2a0800 : 0x061a33, emissive: col, emissiveIntensity: 2.4, roughness: 0.3, transparent: true, opacity: 0.95 });
    mats.push(coreMat);
    const heart = mk(new THREE.IcosahedronGeometry(0.22, 3), coreMat, 0, 0, 0, core); heart.castShadow = false;
    parts.heart = heart;
    core.add(sprite(col, 1.6, 0.75));
    core.add(sprite(0xffffff, 0.55, 0.9));
    // a face: two bright slanted eyes
    for (const side of [-1, 1]) { const e = mk(new THREE.BoxGeometry(0.06, 0.018, 0.02), glow(look.eyes ?? 0xffffff), 0.06 * side, 0.03, 0.2, core); e.rotation.z = -0.35 * side; e.castShadow = false; }
    // whirling bands of wind (or fire)
    const rings = [];
    const ringMat = additive(fire ? 0xffa050 : 0xbfe6ff, 0.55);
    for (let i = 0; i < 4; i++) {
      const g = new THREE.Group(); core.add(g);
      const rr = 0.36 + i * 0.07;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(rr, 0.018 - i * 0.002, 6, 48, Math.PI * (1.1 + r() * 0.5)), ringMat);
      g.rotation.set(r() * 3, r() * 3, r() * 3);
      g.add(ring); rings.push({ g, speed: (2 + r() * 2.5) * (i % 2 ? -1 : 1), axis: new THREE.Vector3(r() - 0.5, 1, r() - 0.5).normalize() });
    }
    // a twisting tail of wind beneath it
    const tail = new THREE.Group(); core.add(tail); parts.tail = tail;
    for (let i = 0; i < 4; i++) {
      const t = new THREE.Mesh(new THREE.TorusGeometry(0.2 - i * 0.04, 0.014, 5, 32, Math.PI * 1.4), ringMat);
      t.position.y = -0.3 - i * 0.18; t.rotation.x = Math.PI / 2; t.rotation.z = i * 1.3;
      tail.add(t);
    }
    // the Ash Elemental: burning rocks circling its fire
    const rocks = [];
    if (fire) {
      const S = lava(0xffffff, 1.6);
      for (let i = 0; i < 7; i++) {
        const m = mk(roughen(new THREE.IcosahedronGeometry(0.09 + r() * 0.07, 1), 0.02, 3, i), S, 0, 0, 0, core);
        rocks.push({ m, a: i / 7 * Math.PI * 2, rr: 0.42 + r() * 0.15, y: (r() - 0.5) * 0.5, sp: 1 + r() });
      }
    }
    parts.rings = rings; parts.rocks = rocks; parts.fire = fire; parts.color = col;
    return { body, parts, height: 1.7, rig: "wisp" };
  }
}

// =====================================================================
//  ANIMATION for the hound, hawk and wisps (u = the Unit from 3d.html)
// =====================================================================
export function animateCreature(u, dt, t, fancy) {
  const P = u.parts;
  u.runBlend = lerp(u.runBlend || 0, u.running ? 1 : 0, Math.min(1, dt * 7));
  const rb = u.runBlend;
  const shot = u.oneShot, k = shot ? shot.t / shot.len : 0, e = shot ? Math.sin(Math.PI * k) : 0;
  const attack = shot && shot.kind === "attack", spell = (shot && shot.kind !== "attack") || u.casting;
  const dK = u.deathK || 0;
  const fx = E.effects.P;

  if (u.creature === "hound") {
    const cyc = t * 11 + u.phase;
    const breathe = Math.sin(t * 2.4 + u.phase);
    for (const L of P.legs) {
      const s = Math.sin(cyc + L.phase), lift = Math.max(0, Math.sin(cyc + L.phase + 0.9));
      if (L.front) { L.hip.rotation.x = s * 0.55 * rb - (attack ? 0.7 * e : 0); L.knee.rotation.x = -lift * 0.7 * rb + (attack ? -0.5 * e : 0.05); }
      else { L.hip.rotation.x = 0.25 + s * 0.5 * rb; L.knee.rotation.x = -0.35 + lift * 0.6 * rb; }
      if (u.dead) { L.hip.rotation.x = L.front ? -0.3 : 0.6; L.knee.rotation.x = 0.1; }
    }
    P.torso.position.y = 0.68 + Math.abs(Math.sin(cyc)) * 0.05 * rb + breathe * 0.006 - (attack ? 0.08 * e : 0);
    P.torso.position.z = attack ? 0.28 * e : 0;
    P.torso.rotation.x = (attack ? 0.18 * e : 0) + Math.sin(cyc * 2) * 0.03 * rb;
    let neck = -0.3 + rb * 0.2, head = 0.3 - rb * 0.1, jaw = 0.12 + Math.sin(t * 7 + u.phase) * 0.06 * (1 - rb);   // panting
    if (attack) { neck = lerp(neck, -0.05, e); head = lerp(head, 0.15, e); jaw = k < 0.55 ? 0.75 * (k / 0.55) : 0.75 * Math.max(0, 1 - (k - 0.55) * 5); }
    if (spell) { neck = -1.15; head = 0.05; jaw = 0.65; }   // howl
    P.neck.rotation.x = neck; P.head.rotation.x = head; P.jaw.rotation.x = jaw;
    P.tail.rotation.y = Math.sin(t * (3 + rb * 6) + u.phase) * 0.35; P.tail.rotation.x = -0.2 * rb;
    P.flame.emissiveIntensity = 2.2 + Math.sin(t * 13 + u.phase) * 0.4 + Math.random() * 0.3;
    // death: falls onto its side
    u.pose.rotation.x = 0; u.pose.rotation.z = dK * 1.45; u.pose.position.y = dK * 0.08;
    if (fancy && !u.dead && dt > 0 && Math.random() < dt * 22) {   // embers off the burning mane
      const p = u.root.position, s = u.size, a = u.facing, back = (Math.random() - 0.3) * 0.9 * s;
      fx.flame.spawn(p.x + Math.cos(a) * back, p.y + 1.1 * s, p.z + Math.sin(a) * back, (Math.random() - 0.5) * 0.4, 1 + Math.random(), (Math.random() - 0.5) * 0.4,
        { life: 0.35, size: 0.35 * s, size1: 0.08, color: 0xffc060, color1: 0xb02a06, alpha: 0.6, drag: 1.5 });
    }
    return;
  }

  if (u.creature === "hawk") {
    // hovering above the ground on beating wings; drops when killed
    const alt = u.dead ? Math.max(0.0, (u.alt ?? 2.2) - dt * 4) : 2.2 + Math.sin(t * 1.4 + u.phase) * 0.22 - (attack ? 0.9 * e : 0);
    u.alt = alt;
    u.root.position.y = alt;
    u.ring.position.y = 0.03 - alt / u.size;
    const speed = u.dead ? 0 : spell ? 9 : 6 + rb * 2.5;
    const f = Math.sin(t * speed + u.phase), f2 = Math.sin(t * speed + u.phase - 0.9);
    for (const W of Object.values(P.wings)) {
      const s = W.side;
      let up = 0.15 + f * 0.75, tip = f2 * 0.4 - 0.05;
      if (spell) { up = 0.35 + f * 0.25; tip = 0.1; }            // wings spread wide: a storm screech
      if (attack) { up = lerp(up, -0.2, e); tip = lerp(tip, 0.6, e); }   // swept back in the dive
      if (u.dead) { up = -0.9; tip = 0.5; }
      W.arm.rotation.set(0, s * (attack ? 0.4 * e : 0), s * up);
      W.hand.rotation.set(0, s * (attack ? 0.5 * e : 0), s * tip);
    }
    P.core.rotation.x = (attack ? 0.45 * e : 0) + rb * 0.18 + f * 0.03;
    P.core.position.y = 0.5 - f * 0.04;
    P.head.rotation.x = spell ? -0.5 : attack ? 0.3 * e : Math.sin(t * 0.7 + u.phase) * 0.1;
    P.head.rotation.y = Math.sin(t * 0.5 + u.phase) * 0.35 * (1 - rb);
    P.beak.rotation.x = spell ? 0.5 : attack ? 0.4 * e : 0;
    P.tail.rotation.x = 0.1 + f * 0.06;
    for (const L of P.legs) L.rotation.x = attack ? -1.3 * e : 0.9;   // talons forward to strike, else tucked back
    P.featherMat.emissiveIntensity = (spell ? 0.6 : 0.12) + (Math.random() < 0.04 ? 0.8 : 0);   // lightning flickers along its feathers
    u.pose.rotation.x = 0; u.pose.rotation.z = dK * 1.3; u.pose.position.y = 0;
    if (fancy && !u.dead && dt > 0 && Math.random() < dt * (spell ? 30 : 8)) {
      const p = u.root.position, s = u.size, side = Math.random() < 0.5 ? -1 : 1, a = u.facing + Math.PI / 2;
      const reach = (0.4 + Math.random() * 1.4) * s;
      fx.spark.spawn(p.x + Math.cos(a) * side * reach, p.y + 0.6 * s, p.z + Math.sin(a) * side * reach, (Math.random() - 0.5) * 2, -0.5 - Math.random(), (Math.random() - 0.5) * 2,
        { life: 0.25, size: 0.25, color: 0xffffff, color1: 0xffe08a, drag: 3 });
    }
    return;
  }

  if (u.creature === "wisp") {
    const bob = Math.sin(t * 2.1 + u.phase) * 0.12;
    P.core.position.y = 1.15 + bob - dK * 0.6;
    P.core.position.z = attack ? 0.45 * e : 0;
    const swell = 1 + (spell ? 0.25 + Math.sin(t * 12) * 0.08 : 0) + (attack ? 0.2 * e : 0);
    P.core.scale.setScalar(Math.max(0.001, swell * (1 - dK)));
    P.heart.rotation.y += dt * 1.5; P.heart.rotation.x += dt * 0.7;
    P.heart.material.emissiveIntensity = 2.2 + Math.sin(t * 6 + u.phase) * 0.5 + (spell ? 1.5 : 0);
    const spin = 1 + rb * 1.5 + (spell ? 2 : 0);
    for (const R of P.rings) R.g.rotateOnAxis(R.axis, dt * R.speed * spin);
    P.tail.rotation.y += dt * 5 * spin;
    P.tail.rotation.z = Math.sin(t * 2 + u.phase) * 0.15 - rb * 0.3;
    for (const R of P.rocks) {
      const a = R.a + t * R.sp * spin;
      R.m.position.set(Math.cos(a) * R.rr, R.y + Math.sin(t * 2 + R.a) * 0.08, Math.sin(a) * R.rr);
      R.m.rotation.x += dt * 2; R.m.rotation.y += dt * 1.5;
    }
    u.pose.rotation.x = 0; u.pose.rotation.z = 0; u.pose.position.y = 0;
    if (fancy && !u.dead && dt > 0 && Math.random() < dt * 26) {
      const p = u.root.position, s = u.size, a = Math.random() * Math.PI * 2, rr = (0.25 + Math.random() * 0.3) * s, y = p.y + (1.15 + bob) * s;
      if (P.fire) fx.flame.spawn(p.x + Math.cos(a) * rr * 0.5, y, p.z + Math.sin(a) * rr * 0.5, 0, 1 + Math.random(), 0, { life: 0.45, size: 0.45 * s, size1: 0.1, color: 0xffd080, color1: 0xb02a06, alpha: 0.6, drag: 1.5 });
      else fx.glow.spawn(p.x + Math.cos(a) * rr, y - 0.2 * s, p.z + Math.sin(a) * rr, -Math.sin(a) * 2, -0.6, Math.cos(a) * 2, { life: 0.6, size: 0.18, size1: 0.05, color: 0xdff2ff, color1: P.color, drag: 2 });
    }
  }
}