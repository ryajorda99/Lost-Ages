// effects.js — spell and attack visuals for the 3D viewer (viewer/3d.html).
//
// EFFECTS maps an ability key (the same keys as in your class/boss files) to a visual:
//   projectile  a glowing ball flies from the caster to the target (Fireball, Shadow Bolt)
//   slash       a weapon arc in front of the attacker (Mortal Strike, Cleave)
//   nova        a ring that expands across the ground (Frost Nova, Challenge, Heat Wave)
//   heal        rising sparkles + ground ring on the target (Flash Heal)
//   shield      a bubble around the target (Shield of Valor, Holy Ward)
//   pillar      a tall beam of light on the target (Resurrection, Redemption)
//   beam        a line connecting caster and target (Soul Drain, Death Grip, taunts)
//   cone        a flat fan in front of the caster (Flame Breath)
//   strike      a bolt that hits the target from above (Smite, Doom)
//   meteor      a rock that falls from the sky onto the target (Meteor, Meteor Swarm)
//   poof        a puff of smoke on the caster (Stealth, Vanish, Blink)
//
// To give a NEW ability a look, just add a line here, e.g.
//   lightningBolt: { type: "projectile", color: COLORS.arcane, size: 0.3, speed: 40 },
// Abilities not listed fall back to a slash (melee range) or a projectile (ranged).

import * as THREE from "three";

export const COLORS = {
  physical: 0xe8e8e8, holy: 0xffd966, fire: 0xff6a1a, frost: 0x7fd4ff, arcane: 0xc77dff,
  shadow: 0x9b5cff, blood: 0xff3344, nature: 0x7dff6a, smoke: 0x333344,
};
const C = COLORS;

export const EFFECTS = {
  // ---------- Knight ----------
  righteousStrike: { type: "slash", color: C.holy },
  shieldOfValor:   { type: "shield", color: C.holy, onSelf: true },
  divineTaunt:     { type: "beam", color: C.holy },
  challenge:       { type: "nova", color: C.holy, radius: 12 },
  holyTouch:       { type: "heal", color: C.holy, big: true },
  holyGrounds:     { type: "nova", color: C.holy, radius: 6 },
  judgment:        { type: "projectile", color: C.holy, size: 0.35, speed: 35 },
  sonOfLight:      { type: "shield", color: 0xfff2b0, onSelf: true, big: true },
  redemption:      { type: "pillar", color: C.holy },
  sanctifiedAura:  { type: "nova", color: C.holy, radius: 10, pillar: true },   // the aura flaring up

  // ---------- Healer ----------
  flashHeal:       { type: "heal", color: C.holy },
  greaterHeal:     { type: "heal", color: C.holy, big: true },
  renew:           { type: "heal", color: 0xc8ff9a },
  holyWard:        { type: "shield", color: C.holy },
  smite:           { type: "strike", color: C.holy },
  prayerOfMending: { type: "nova", color: C.holy, radius: 30 },
  purify:          { type: "heal", color: 0xffffff },
  divineHymn:      { type: "nova", color: C.holy, radius: 40, pillar: true },
  resurrection:    { type: "pillar", color: C.holy },

  // ---------- Mage ----------
  fireball:        { type: "projectile", color: C.fire, size: 0.35, speed: 28 },
  frostBolt:       { type: "projectile", color: C.frost, size: 0.3, speed: 26 },
  fireBlast:       { type: "strike", color: C.fire },
  frostNova:       { type: "nova", color: C.frost, radius: 8 },
  blink:           { type: "poof", color: C.arcane, onSelf: true },
  counterspell:    { type: "beam", color: C.arcane },
  manaShield:      { type: "shield", color: C.arcane, onSelf: true },
  meteor:          { type: "meteor", color: C.fire },

  // ---------- Rogue ----------
  stealth:         { type: "poof", color: C.smoke, onSelf: true },
  ambush:          { type: "slash", color: C.blood, big: true },
  sinisterStrike:  { type: "slash", color: C.physical },
  eviscerate:      { type: "slash", color: C.blood, big: true },
  kick:            { type: "slash", color: C.physical, small: true },
  evasion:         { type: "shield", color: 0xaaaaaa, onSelf: true },
  vanish:          { type: "poof", color: C.smoke, onSelf: true },
  deathMark:       { type: "beam", color: C.blood },

  // ---------- Warrior ----------
  charge:          { type: "poof", color: 0xbb9966, onSelf: true },
  heroicStrike:    { type: "slash", color: C.physical },
  mortalStrike:    { type: "slash", color: C.blood, big: true },
  whirlwind:       { type: "nova", color: C.physical, radius: 8 },
  execute:         { type: "slash", color: C.blood, big: true },
  pummel:          { type: "slash", color: C.physical, small: true },
  battleShout:     { type: "nova", color: C.blood, radius: 20 },
  recklessness:    { type: "shield", color: C.blood, onSelf: true },

  // ---------- Druid ----------
  wrath:           { type: "projectile", color: C.nature, size: 0.3, speed: 28 },
  moonfire:        { type: "strike", color: 0xb8c8ff },
  starsurge:       { type: "projectile", color: C.arcane, size: 0.5, speed: 24 },
  rejuvenation:    { type: "heal", color: C.nature },
  regrowth:        { type: "heal", color: C.nature, big: true },
  tranquility:     { type: "nova", color: C.nature, radius: 40, pillar: true },
  removeCorruption:{ type: "heal", color: 0xffffff },
  innervate:       { type: "beam", color: C.frost },
  markOfTheWild:   { type: "nova", color: C.nature, radius: 40 },
  barkskin:        { type: "shield", color: 0x9a7a4a, onSelf: true },

  // ---------- Necromancer ----------
  reaperForm:      { type: "poof", color: C.shadow, onSelf: true },
  deathcallerForm: { type: "poof", color: C.nature, onSelf: true },
  deathBolt:       { type: "projectile", color: C.shadow, size: 0.35, speed: 26 },
  plague:          { type: "strike", color: C.nature },
  reap:            { type: "slash", color: C.shadow, big: true },
  soulCleave:      { type: "nova", color: C.shadow, radius: 8 },
  raiseCorrupted:  { type: "nova", color: C.nature, radius: 5 },
  boneShield:      { type: "shield", color: 0xe8e0c8, onSelf: true },

  // ---------- Valkyrie ----------
  valkyriesCall:   { type: "beam", color: 0x9fe7ff },
  aegisOfValhalla: { type: "shield", color: 0xbfe9ff, onSelf: true, big: true },
  skyLance:        { type: "slash", color: 0xdff6ff },
  divingStrike:    { type: "strike", color: 0x9fe7ff, big: true },
  stormGallop:     { type: "nova", color: 0x9fe7ff, radius: 8 },
  thunderLance:    { type: "strike", color: 0x7fd4ff, big: true },
  wingedSlash:     { type: "slash", color: 0xfff2c8 },
  heavensFall:     { type: "nova", color: C.holy, radius: 6 },
  soulspear:       { type: "projectile", color: C.holy, size: 0.4, speed: 40 },
  wingGuard:       { type: "shield", color: 0xfff6dc, onSelf: true },

  // ---------- Vorathyx, the Storm Sovereign ----------
  thunderclaw:     { type: "slash", color: 0x7fd4ff, big: true },
  lightningBreath: { type: "cone", color: 0x8fdcff, length: 14, angle: 1.1 },
  cyclone:         { type: "poof", color: 0x9fc8ff, onSelf: true },
  thunderstorm:    { type: "nova", color: 0x7fb4ff, radius: 12 },
  stormCall:       { type: "strike", color: 0xbfe8ff, big: true },
  chainLightning:  { type: "beam", color: 0xcff4ff },
  ionSurge:        { type: "strike", color: 0x9f8cff },
  recharge:        { type: "pillar", color: 0x7fd4ff, onSelf: true },
  tempest:         { type: "nova", color: 0x9fd8ff, radius: 60 },
  staticField:     { type: "nova", color: 0x7fe0ff, radius: 60 },
  summonStormlings:{ type: "nova", color: 0x7fd4ff, radius: 15 },
  skyborne:        { type: "nova", color: 0xffffff, radius: 14 },

  // ---------- The Hollow King ----------
  soulEruption:    { type: "poof", color: C.shadow, onSelf: true },   // the eruption itself is the purple circle on the ground
  shadowBolt:      { type: "projectile", color: C.shadow, size: 0.6, speed: 22 },
  cleave:          { type: "cone", color: C.shadow, length: 8, angle: 1.6 },
  raiseDead:       { type: "nova", color: C.shadow, radius: 15 },
  soulDrain:       { type: "beam", color: C.shadow },
  crushingBlow:    { type: "slash", color: C.shadow, big: true },
  shadowNova:      { type: "nova", color: C.shadow, radius: 60 },
  deathGrip:       { type: "beam", color: C.shadow },
  doom:            { type: "strike", color: C.shadow },

  // ---------- Azgaroth, the Ashen Tyrant ----------
  moltenBrand:     { type: "strike", color: C.fire },
  flameBreath:     { type: "cone", color: C.fire, length: 13, angle: 1.2 },
  infernoRift:     { type: "poof", color: C.fire, onSelf: true },
  rainOfFire:      { type: "nova", color: C.fire, radius: 10 },
  pyroclasm:       { type: "strike", color: C.fire, big: true },
  meteorSwarm:     { type: "meteor", color: C.fire },
  cataclysm:       { type: "nova", color: C.fire, radius: 60 },
  summonElementals:{ type: "nova", color: C.fire, radius: 15 },
  rekindle:        { type: "pillar", color: C.fire, onSelf: true },
  heatWave:        { type: "nova", color: 0xff9944, radius: 60 },
};

// Pick the effect for an ability. `_swing` is a normal auto-attack.
export function effectFor(key, distance) {
  if (key === "_swing") {
    return distance > 6
      ? { type: "projectile", color: 0xd8c8a0, size: 0.12, speed: 40 }   // bow / ranged mob
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
//  The effect system — creates meshes, animates them, cleans them up
// =====================================================================
const glow = (color, opacity = 0.9) => new THREE.MeshBasicMaterial({
  color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
});
const SPHERE = new THREE.SphereGeometry(1, 16, 12);
const RING = new THREE.RingGeometry(0.85, 1, 48);
const DISC = new THREE.CircleGeometry(1, 40);
const TUBE = new THREE.CylinderGeometry(1, 1, 1, 16, 1, true);

// Where on a unit effects should aim: its chest
function chest(u, out = new THREE.Vector3()) {
  return out.copy(u.root.position).setY(u.root.position.y + u.height * 0.55);
}

export class EffectSystem {
  constructor(scene) {
    this.scene = scene;
    this.list = [];   // active effects: { t, life, update(k, dt), objects }
  }

  add(life, objects, update) {
    const fx = { t: 0, life, objects, update };
    update(0, 0, fx);   // set the starting size/opacity BEFORE the first frame is drawn
    objects.forEach(o => this.scene.add(o));
    this.list.push(fx);
  }

  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const fx = this.list[i];
      fx.t += dt;
      const k = Math.min(1, fx.t / fx.life);   // 0 → 1 over the effect's life
      const keep = fx.update(k, dt, fx) !== false && k < 1;
      if (!keep) {
        fx.objects.forEach(o => { this.scene.remove(o); o.material?.dispose?.(); if (o.userData.ownGeo) o.geometry.dispose(); });
        this.list.splice(i, 1);
      }
    }
  }

  clear() {
    this.list.forEach(fx => fx.objects.forEach(o => this.scene.remove(o)));
    this.list = [];
  }

  /** Play an ability's effect. actor/target are Units from 3d.html (target may be null). */
  play(spec, actor, target) {
    const to = spec.onSelf || !target ? actor : target;
    const s = actor.size || 1;   // bosses are big — their effects are too
    switch (spec.type) {
      case "projectile": return this.projectile(spec, actor, to, s);
      case "slash":      return this.slash(spec, actor, s);
      case "nova":       this.nova(spec.color, actor.root.position, spec.radius || 6); if (spec.pillar) this.pillar(spec.color, actor); return;
      case "heal":       return this.heal(spec, to);
      case "shield":     return this.shield(spec, to);
      case "pillar":     return this.pillar(spec.color, to);
      case "beam":       return this.beam(spec.color, actor, to);
      case "cone":       return this.cone(spec, actor, s);
      case "strike":     return this.strike(spec, to);
      case "meteor":     return this.meteor(spec.color, to);
      case "poof":       return this.poof(spec.color, to);
    }
  }

  // A quick flash that grows and fades (used when things hit)
  burst(color, pos, size = 0.8, life = 0.3) {
    this.onBurst?.(pos, color, size);   // 3d.html adds flying sparks here
    const m = new THREE.Mesh(SPHERE, glow(color, 0.8));
    m.position.copy(pos);
    this.add(life, [m], (k) => { m.scale.setScalar(size * (0.3 + k)); m.material.opacity = 0.8 * (1 - k); });
  }

  projectile(spec, from, to, s) {
    const size = (spec.size || 0.3) * Math.max(1, s * 0.6);
    const core = new THREE.Mesh(SPHERE, glow(0xffffff, 1));
    const halo = new THREE.Mesh(SPHERE, glow(spec.color, 0.55));
    core.scale.setScalar(size * 0.5);
    halo.scale.setScalar(size * 1.4);
    const start = chest(from);
    start.x += Math.cos(from.facing) * 0.6 * s;
    start.z += Math.sin(from.facing) * 0.6 * s;
    const end = new THREE.Vector3();
    const pos = start.clone();
    let trail = 0;
    const speed = spec.speed || 30;
    this.add(3, [core, halo], (k, dt) => {
      chest(to, end);   // follow the target if it moves
      const d = pos.distanceTo(end);
      if (d < 0.4) { this.burst(spec.color, end, size * 2.5); return false; }
      pos.addScaledVector(end.clone().sub(pos).normalize(), Math.min(d, speed * dt));
      core.position.copy(pos); halo.position.copy(pos);
      halo.scale.setScalar(size * (1.3 + Math.sin(k * 60) * 0.15));
      if ((trail += dt) > 0.03) { trail = 0; this.burst(spec.color, pos, size * 0.8, 0.25); }
    });
  }

  slash(spec, actor, s) {
    const r = (spec.big ? 1.6 : spec.small ? 0.9 : 1.2) * s;
    const geo = new THREE.TorusGeometry(r, 0.07 * s * (spec.big ? 1.6 : 1), 6, 24, Math.PI * 0.9);
    const m = new THREE.Mesh(geo, glow(spec.color, 0.9));
    m.userData.ownGeo = true;
    const p = actor.root.position;
    m.position.set(p.x + Math.cos(actor.facing) * 0.9 * s, p.y + actor.height * 0.55, p.z + Math.sin(actor.facing) * 0.9 * s);
    m.rotation.order = "YXZ";
    m.rotation.y = -actor.facing + Math.PI / 2;
    m.rotation.x = -0.3;
    this.add(0.28, [m], (k) => {
      m.rotation.z = -1.6 + k * 2.2;   // sweep
      m.material.opacity = 0.9 * (1 - k);
    });
  }

  nova(color, center, radius) {
    const ring = new THREE.Mesh(RING, glow(color, 0.9));
    const disc = new THREE.Mesh(DISC, glow(color, 0.25));
    [ring, disc].forEach(m => { m.rotation.x = -Math.PI / 2; m.position.set(center.x, 0.06, center.z); });
    const life = 0.35 + Math.min(1, radius / 40) * 0.6;
    this.add(life, [ring, disc], (k) => {
      const r = 0.5 + (radius - 0.5) * (1 - Math.pow(1 - k, 2));
      ring.scale.setScalar(r); disc.scale.setScalar(r);
      ring.material.opacity = 0.9 * (1 - k);
      disc.material.opacity = 0.25 * (1 - k);
    });
  }

  heal(spec, target) {
    const n = spec.big ? 14 : 8;
    const sparks = [];
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(SPHERE, glow(spec.color, 0.9));
      m.userData = { a: (i / n) * Math.PI * 2, r: 0.4 + Math.random() * 0.4, d: Math.random() * 0.3 };
      m.scale.setScalar(0.07);
      sparks.push(m);
    }
    const ring = new THREE.Mesh(RING, glow(spec.color, 0.8));
    ring.rotation.x = -Math.PI / 2;
    this.add(0.9, [...sparks, ring], (k) => {
      const p = target.root.position;
      ring.position.set(p.x, 0.05, p.z);
      ring.scale.setScalar(0.6 + k * 0.6);
      ring.material.opacity = 0.8 * (1 - k);
      for (const m of sparks) {
        const { a, r, d } = m.userData;
        const kk = Math.max(0, k - d);
        m.position.set(p.x + Math.cos(a + kk * 4) * r, kk * target.height * 1.4, p.z + Math.sin(a + kk * 4) * r);
        m.material.opacity = 0.9 * (1 - kk);
      }
    });
  }

  shield(spec, target) {
    const m = new THREE.Mesh(SPHERE, glow(spec.color, 0.3));
    this.add(1.2, [m], (k) => {
      chest(target, m.position);
      const r = target.height * (spec.big ? 0.95 : 0.75);
      m.scale.set(r * 0.8, r, r * 0.8);
      m.material.opacity = 0.35 * (1 - k) * (0.8 + Math.sin(k * 30) * 0.2);
    });
  }

  pillar(color, target) {
    const beam = new THREE.Mesh(TUBE, glow(color, 0.6));
    const core = new THREE.Mesh(TUBE, glow(0xffffff, 0.5));
    const ring = new THREE.Mesh(RING, glow(color, 0.9));
    ring.rotation.x = -Math.PI / 2;
    const h = 14;
    this.add(1.8, [beam, core, ring], (k) => {
      const p = target.root.position;
      const fade = k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85;
      beam.position.set(p.x, h / 2, p.z); core.position.copy(beam.position);
      beam.scale.set(0.9 * fade + 0.1, h, 0.9 * fade + 0.1);
      core.scale.set(0.3 * fade, h, 0.3 * fade);
      beam.material.opacity = 0.5 * fade; core.material.opacity = 0.6 * fade;
      ring.position.set(p.x, 0.06, p.z); ring.scale.setScalar(1 + k * 2); ring.material.opacity = 0.9 * (1 - k);
    });
  }

  beam(color, from, to) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1, 8, 1, true), glow(color, 0.9));
    m.userData.ownGeo = true;
    const a = new THREE.Vector3(), b = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    this.add(0.5, [m], (k) => {
      chest(from, a); chest(to, b);
      const len = a.distanceTo(b);
      m.position.copy(a).add(b).multiplyScalar(0.5);
      m.scale.set(1 + Math.sin(k * 40) * 0.5, len, 1 + Math.sin(k * 40) * 0.5);
      m.quaternion.setFromUnitVectors(up, b.clone().sub(a).normalize());
      m.material.opacity = 0.9 * (1 - k);
    });
  }

  cone(spec, actor, s) {
    const len = (spec.length || 8) * Math.max(1, s * 0.4);
    const geo = new THREE.CircleGeometry(len, 32, -(spec.angle || 1.2) / 2, spec.angle || 1.2);
    const m = new THREE.Mesh(geo, glow(spec.color, 0.7));
    m.userData.ownGeo = true;
    m.rotation.x = -Math.PI / 2;
    const p = actor.root.position;
    m.position.set(p.x, 0.08, p.z);
    m.rotation.z = actor.facing;
    this.add(0.7, [m], (k) => {
      m.scale.setScalar(0.3 + Math.min(1, k * 3) * 0.7);
      m.material.opacity = 0.75 * (1 - k) * (0.8 + Math.random() * 0.2);
    });
  }

  strike(spec, target) {
    const bolt = new THREE.Mesh(TUBE, glow(spec.color, 0.9));
    const h = 10;
    this.add(0.35, [bolt], (k) => {
      const p = target.root.position;
      bolt.position.set(p.x, h / 2 + target.height * 0.3, p.z);
      bolt.scale.set((spec.big ? 0.5 : 0.25) * (1 - k), h, (spec.big ? 0.5 : 0.25) * (1 - k));
      bolt.material.opacity = 0.9 * (1 - k);
    });
    this.burst(spec.color, chest(target), spec.big ? 2 : 1.1, 0.4);
  }

  meteor(color, target) {
    const rock = new THREE.Mesh(SPHERE, new THREE.MeshStandardMaterial({ color: 0x331a10, emissive: color, emissiveIntensity: 1.5 }));
    const halo = new THREE.Mesh(SPHERE, glow(color, 0.5));
    const end = target.root.position.clone();
    const start = end.clone().add(new THREE.Vector3(-5, 20, -4));
    let trail = 0;
    this.add(0.75, [rock, halo], (k, dt) => {
      rock.position.lerpVectors(start, end, k * k);
      halo.position.copy(rock.position);
      rock.scale.setScalar(0.7); halo.scale.setScalar(1.3);
      if ((trail += dt) > 0.03) { trail = 0; this.burst(color, rock.position, 0.8, 0.35); }
      if (k >= 1) { this.burst(color, end, 3.5, 0.5); this.nova(color, end, 5); }
    });
  }

  poof(color, target) {
    for (let i = 0; i < 7; i++) {
      const m = new THREE.Mesh(SPHERE, glow(color, 0.6));
      const dir = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.5).normalize();
      const start = chest(target);
      this.add(0.6, [m], (k) => {
        m.position.copy(start).addScaledVector(dir, k * 1.3 * (target.size || 1));
        m.scale.setScalar((0.25 + k * 0.4) * (target.size || 1));
        m.material.opacity = 0.6 * (1 - k);
      });
    }
  }
}