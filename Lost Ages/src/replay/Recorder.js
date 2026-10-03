// Recorder.js — records a fight so it can be watched later in the viewer (viewer/index.html).
//
// Every 1/10th of a second it saves a "frame": where everyone is, their health, the boss's
// cast bar and any fire on the ground. Chat/combat messages are saved as events.
// The replay is a JSON file in the replays/ folder.
// If a live viewer is attached, every frame is also sent to the browser as it happens.
//
// Version 2 (for the 3D viewer, viewer/3d.html) also saves:
//   - pets (the Necromancer's Corrupted Servants) in frame.pt
//   - which way everyone is facing and WHICH ability they're casting
//   - "actions": every ability used and every auto-attack swing, so the 3D viewer
//     can play the right animation and spell effect (Fireball flying, Resurrection pillar...)
// The 2D viewer (viewer/index.html) still works with these files — it ignores the new fields.

const fs = require("fs");
const path = require("path");

const r1 = (n) => Math.round(n * 10) / 10;   // round to 1 decimal to keep files small
const r2 = (n) => Math.round(n * 100) / 100;

// Angle (radians) a character is facing: toward their target if they have one
function facing(c, target) {
  if (target && target !== c && target.position) {
    c._facing = Math.atan2(target.position.y - c.position.y, target.position.x - c.position.x);
  }
  return r2(c._facing || 0);
}

const castProgress = (c) => (c.cast ? r2(1 - c.cast.remaining / c.cast.total) : 0);

class Recorder {
  /**
   * @param {object} o { title, party: [Character], fps, live }
   *   live: the viewer server (optional) — frames stream to the browser in real time
   */
  constructor({ title, party, fps = 10, live = null }) {
    this.live = live;
    this.fps = fps;
    this.nextFrameAt = 0;
    this.party = party;
    this.enemyIds = new Map();   // enemy object -> id (adds get summoned mid-fight)
    this.zoneNames = [];         // string table for zone names
    this.data = {
      version: 2,
      title,
      fps,
      recordedAt: new Date().toISOString(),
      // abilities: [key, name, cooldown, cast time] — the 3D viewer's action bar shows these with cooldowns
      players: party.map(p => ({
        name: p.name, className: p.className, role: p.role, resource: p.resource.name,
        abilities: Object.entries(p.abilities).map(([k, a]) => [k, a.name, a.cooldown || 0, a.castTime || 0]),
      })),
      enemies: [],               // filled as enemies appear: { name, maxHp, boss, elite }
      frames: [],
      events: [],
      result: null,
      zoneNames: this.zoneNames,
    };
    this.actions = [];           // abilities used since the last frame (see watch())
    this.petIds = new Map();     // summoned pets (Necromancer's Corrupted Servants) -> id
    party.forEach(p => this.watch(p));
    this.live?.startFight(this.data);
  }

  // Listen for abilities and auto-attack swings on a player or enemy
  watch(c) {
    if (c._recorded === this) return;
    c._recorded = this;
    c.onAbilityUsed = (key, target) => this.action(c, key, target);
    c.onSwing = (target) => this.action(c, "_swing", target);
  }

  // Who is this? ["p", index] for players, ["e", id] for enemies, null for nobody
  ref(u) {
    if (!u) return null;
    const i = this.party.indexOf(u);
    if (i !== -1) return ["p", i];
    if (u.isEnemy) return ["e", this.enemyId(u)];
    if (u.isPet) return ["m", this.petId(u)];
    return null;
  }

  petId(pet) {
    if (!this.petIds.has(pet)) this.petIds.set(pet, this.petIds.size);
    return this.petIds.get(pet);
  }

  // One action = [actor kind ("p" player, "e" enemy, "m" pet), actor index, ability key, target kind, target index]
  action(actor, key, target) {
    const a = this.ref(actor);
    if (!a) return;
    const t = this.ref(target === actor ? null : target) || ["", -1];
    this.actions.push([a[0], a[1], key, t[0], t[1]]);
  }

  enemyId(e) {
    if (!this.enemyIds.has(e)) {
      this.enemyIds.set(e, this.data.enemies.length);
      this.data.enemies.push({ name: e.name, maxHp: e.maxHp, boss: !!e.isBoss, elite: !!e.elite });
    }
    return this.enemyIds.get(e);
  }

  zoneNameId(name) {
    let i = this.zoneNames.indexOf(name);
    if (i === -1) { i = this.zoneNames.length; this.zoneNames.push(name); }
    return i;
  }

  // Call every tick; only saves a frame 10 times per second
  capture(time, enemies) {
    if (time < this.nextFrameAt) return;
    this.nextFrameAt = time + 1 / this.fps;

    // Players: [x, y, hp%, dead, casting, facing angle, cast ability key, cast progress 0-1, resource % (mana/rage...),
    //           mounted (1 = Valkyrie still on her Pegasus), Knight aura up, blessed by an aura]
    const players = this.party.map(p => [
      r1(p.position.x), r1(p.position.y), r2(Math.max(0, p.hp / p.maxHp)), p.isDead ? 1 : 0, p.cast ? 1 : 0,
      facing(p, p.cast?.target || p.target), p.cast ? p.cast.key : 0, castProgress(p),
      r2(p.resource.max ? p.resource.current / p.resource.max : 0),
      p.mounted ? 1 : 0,
      p.hasBuff?.("sanctifiedAura") ? 1 : 0,        // Knight's aura is up
      p.hasBuff?.("sanctifiedBlessing") ? 1 : 0,    // standing in a Knight's aura
    ]);

    const list = [];
    for (const e of enemies) {
      list.push(e);
      for (const m of e.minions || []) list.push(m);
    }
    list.forEach(e => this.watch(e));
    // Enemies: [id, x, y, hp%, dead, facing angle, cast ability key, cast progress 0-1, flying (1 = in the air)]
    const foes = list.map(e => [
      this.enemyId(e), r1(e.position.x), r1(e.position.y), r2(Math.max(0, e.hp / e.maxHp)), e.isDead ? 1 : 0,
      facing(e, e.cast?.target && e.cast.target !== e ? e.cast.target : e.pickTarget?.()), e.cast ? e.cast.key : 0, castProgress(e),
      e.flying ? 1 : 0,
    ]);

    // Ground effects: [x, y, radius, age in seconds, hostile (1) or friendly (0), name id, warning seconds]
    const zones = [];
    for (const e of list) {
      for (const z of e.zones || []) {
        zones.push([r1(z.position.x), r1(z.position.y), z.radius, r1(z.duration - z.remaining), 1, this.zoneNameId(z.name || "Fire"), z.warn ?? 1.5]);
      }
    }
    for (const p of this.party) {
      for (const z of p.zones || []) {
        zones.push([r1(z.position.x), r1(z.position.y), z.radius, r1(z.duration - z.remaining), 0, this.zoneNameId(z.name || "Holy Grounds")]);
      }
    }

    // Boss cast bar and phase
    const boss = enemies.find(e => e.isBoss);
    let cast = null;
    if (boss?.cast) cast = [boss.abilities[boss.cast.key]?.name || boss.cast.key, r2(1 - boss.cast.remaining / boss.cast.total)];

    // Pets: [pet id, owner index, x, y, facing angle]
    const pets = [];
    this.party.forEach((p, i) => {
      for (const pet of p.servants || []) {
        if (pet.isDead) continue;
        this.watch(pet);
        pets.push([this.petId(pet), i, r1(pet.position.x), r1(pet.position.y), facing(pet, pet.target)]);
      }
    });

    const frame = { t: r2(time), p: players, e: foes, z: zones };
    if (pets.length) frame.pt = pets;
    if (this.actions.length) { frame.a = this.actions; this.actions = []; }
    if (cast) frame.c = cast;
    if (boss) frame.ph = boss.phaseIndex + 1;
    // who the boss is attacking (index into players), for drawing a target line
    if (boss) {
      const target = boss.pickTarget?.();
      const ti = this.party.indexOf(target);
      if (ti !== -1) frame.tg = ti;
    }
    this.data.frames.push(frame);

    if (this.live) {
      const msg = { type: "frame", frame };
      if (this.data.enemies.length !== this.sentEnemies) {   // new adds appeared
        msg.enemies = this.data.enemies;
        this.sentEnemies = this.data.enemies.length;
      }
      if (this.zoneNames.length !== this.sentZoneNames) {    // new kinds of ground effect appeared
        msg.zoneNames = this.zoneNames;
        this.sentZoneNames = this.zoneNames.length;
      }
      this.live.broadcast(msg);
    }
  }

  event(time, text) {
    const e = [r1(time), text];
    this.data.events.push(e);
    this.live?.broadcast({ type: "event", e });
  }

  finish(result) {
    this.data.result = result;
    this.live?.broadcast({ type: "end", result });
  }

  /** Saves to replays/<name>.json and also replays/latest.json. Returns the file path. */
  save(name) {
    const dir = path.join(__dirname, "..", "..", "replays");
    fs.mkdirSync(dir, { recursive: true });
    const json = JSON.stringify(this.data);
    const file = path.join(dir, `${name}.json`);
    fs.writeFileSync(file, json);
    fs.writeFileSync(path.join(dir, "latest.json"), json);
    return file;
  }
}

module.exports = { Recorder };