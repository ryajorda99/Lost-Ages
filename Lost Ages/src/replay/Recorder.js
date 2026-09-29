// Recorder.js — records a fight so it can be watched later in the viewer (viewer/index.html).
//
// Every 1/10th of a second it saves a "frame": where everyone is, their health, the boss's
// cast bar and any fire on the ground. Chat/combat messages are saved as events.
// The replay is a JSON file in the replays/ folder.
// If a live viewer is attached, every frame is also sent to the browser as it happens.

const fs = require("fs");
const path = require("path");

const r1 = (n) => Math.round(n * 10) / 10;   // round to 1 decimal to keep files small
const r2 = (n) => Math.round(n * 100) / 100;

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
      version: 1,
      title,
      fps,
      recordedAt: new Date().toISOString(),
      players: party.map(p => ({ name: p.name, className: p.className, role: p.role })),
      enemies: [],               // filled as enemies appear: { name, maxHp, boss, elite }
      frames: [],
      events: [],
      result: null,
      zoneNames: this.zoneNames,
    };
    this.live?.startFight(this.data);
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

    const players = this.party.map(p => [
      r1(p.position.x), r1(p.position.y), r2(Math.max(0, p.hp / p.maxHp)), p.isDead ? 1 : 0, p.cast ? 1 : 0,
    ]);

    const list = [];
    for (const e of enemies) {
      list.push(e);
      for (const m of e.minions || []) list.push(m);
    }
    const foes = list.map(e => [
      this.enemyId(e), r1(e.position.x), r1(e.position.y), r2(Math.max(0, e.hp / e.maxHp)), e.isDead ? 1 : 0,
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

    const frame = { t: r2(time), p: players, e: foes, z: zones };
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