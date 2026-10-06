// World.js — the open world. You and 4 companions explore; mob camps attack when you get close,
// drop loot when they die and come back after a while. Boss doors lead into the raids.
//
// It runs in real time inside scripts/play.js and streams to the 3D viewer exactly like a live
// fight does (same Recorder format), so the viewer draws it with the same characters and effects.
//
//   Pulling     walk within aggro range of a camp (or hit a mob) — the whole camp comes at you
//   Leashing    drag a mob too far from its camp and it gives up, runs home and heals
//   Companions  follow you around; in a fight they play their class like in the raids
//   Death       out of combat, the party picks fallen members back up. If everyone dies,
//               you all wake up back in town.
//   Loot        every kill rolls mob loot for each of you (same loot tables as raid trash),
//               upgrades are put on straight away, and everything is saved.

const CLASSES = require("../classes");
const { Enemy } = require("../entities/Enemy");
const { distance } = require("../classes/Character");
const { Recorder } = require("../replay/Recorder");
const { rollMobLoot } = require("../items/lootRoller");
const { formatItem } = require("../items/itemGenerator");
const { buildWorld, regionAt } = require("./worldMap");
const BOSSES = require("../data/bosses");
const { gearPower, partyGearPower, applyScaling } = require("../utils/enemyScaling");

// ---- Tuning (open-world mobs are raid trash scaled for a 5-person group) ----
const TUNING = {
  mobHp: 0.42,          // x the mob's raid HP
  mobDamage: 0.75,      // x the mob's raid damage
  eliteHp: 0.4,
  eliteDamage: 0.7,     // (on top of this, mobs scale up a little as your party's gear improves — see scalingConfig.js)
  aggroRange: 11,       // metres — walk this close and the camp attacks
  eliteAggroRange: 14,
  leashRange: 55,       // pulled this far from its camp, a mob gives up and runs home
  respawnTime: 75,      // seconds until a killed camp comes back
  corpseTime: 20,       // seconds a body stays on the ground
  regenPerSec: 0.06,    // out of combat: health and mana come back 6% a second
  reviveAfter: 4,       // seconds out of combat before fallen companions get back up
  wipeRespawn: 6,       // seconds after a wipe before you wake up in town
  followDist: 3.2,      // how close companions stay
  level: 60,
};

const r1 = (n) => Math.round(n * 10) / 10;

class World {
  /**
   * @param {object} o
   *   bots      the 5 PlayerBots in your party (bots[0] is you)
   *   human     HumanController (your keyboard/mouse input)
   *   live      the viewer server (frames stream to the browser)
   *   onLoot    (bot, item, equipped) => void      onSave () => void
   */
  constructor({ bots, human, live, onSave, log = console.log }) {
    this.bots = bots;
    this.human = human;
    this.live = live;
    this.onSave = onSave;
    this.log = log;
    this.map = buildWorld();
    for (const d of this.map.doors) d.name = BOSSES[d.boss]?.name || d.boss;
    this.time = 0;
    this.lastFight = -99;
    this.wipedAt = null;
    this.paused = false;
    this.dirty = false;
    this.region = null;

    // Mobs, one Enemy per mob in every camp (a bit tougher when your party is well geared)
    this.power = partyGearPower(bots.map(b => gearPower(new CLASSES[b.className](b.name, TUNING.level), b.gear)));
    this.mobs = [];
    for (const camp of this.map.camps) {
      const { MOBS } = require(`../data/mobs/${camp.mobFile}`);
      camp.members = [];
      camp.mobs.forEach((key, i) => {
        const a = (i / camp.mobs.length) * Math.PI * 2;
        const spawn = { x: camp.x + Math.cos(a) * 3, y: camp.y + Math.sin(a) * 3 };
        const m = this.makeMob(MOBS[key], spawn);
        m.camp = camp;
        camp.members.push(m);
        this.mobs.push(m);
      });
    }
    this.spawnParty(this.map.spawn);
  }

  makeMob(def, spawn) {
    const elite = !!def.elite;
    const m = new Enemy({
      ...def, position: { ...spawn },
      hp: Math.round(def.hp * (elite ? TUNING.eliteHp : TUNING.mobHp)),
      damage: def.damage * (elite ? TUNING.eliteDamage : TUNING.mobDamage),
    });
    applyScaling(m, this.power);
    m.def = def;
    m.spawn = { ...spawn };
    m.aggroRange = elite ? TUNING.eliteAggroRange : TUNING.aggroRange;
    m.wanderAt = Math.random() * 6;
    return m;
  }

  // ---------------- Party ----------------
  spawnParty(at) {
    const offsets = [[0, 0], [-2.5, 2], [2.5, 2], [-2.5, -2], [2.5, -2]];
    this.party = this.bots.map((b, i) => {
      const c = new CLASSES[b.className](b.name, TUNING.level, { x: at.x + offsets[i][0], y: at.y + offsets[i][1], z: 0 });
      b.gear.applyTo(c);
      b.attach(c);
      b.onSay = (bot, msg) => { if (!this.human.isControlling(bot)) this.event(`💬 [Party] ${bot.name}: ${msg}`); };
      c.onDeath = () => this.event(`💀 ${c.name} has fallen`);
      c.onDismount = () => this.event(`🪽 ${c.name}'s Pegasus falls — she fights on with her own wings`);
      return c;
    });
    this.me = this.bots[0];
    this.tank = this.party.find(c => c.role === "tank") || this.party[0];
    this.recorder = new Recorder({
      title: "Open World", party: this.party, live: this.live, keepFrames: false,
      extra: { world: this.map, mode: "world" },
    });
    this.recorder.capture(this.time, []);
  }

  // Re-make a character with new gear (loot equipped) without losing where they are
  refreshCharacter(bot) {
    const i = this.bots.indexOf(bot), old = this.party[i];
    const c = new CLASSES[bot.className](bot.name, TUNING.level, { ...old.position });
    bot.gear.applyTo(c);
    if (old.isDead) c.isDead = true; else c.hp = Math.max(1, Math.round(c.maxHp * (old.hp / old.maxHp)));
    c.onDeath = old.onDeath; c.onDismount = old.onDismount;
    if (old.mounted === false) c.mounted = false;
    this.party[i] = c;          // same array the recorder uses
    bot.attach(c);
    this.recorder.watch(c);
    if (this.tank === old) this.tank = c;
  }

  event(text) { this.recorder?.event(this.time, text); }

  // ---------------- Helpers ----------------
  engaged() {
    return this.mobs.filter(m => !m.isDead && !m.evading && m.threat.size && [...m.threat.keys()].some(p => !p.isDead && this.party.includes(p)));
  }
  pull(mob, who) {
    for (const m of mob.camp.members) {
      if (m.isDead || m.evading) continue;
      if (!m.threat.size) m.addThreat(who, 1);
    }
  }
  evade(m) {
    m.evading = true;
    m.threat.clear();
    m.oath = null; m.forcedTimer = 0; m.cast = null; m.buffs = [];
    m.target = null;
  }
  nearbyMobs(c, range) {
    return this.mobs.filter(m => !m.isDead && !m.evading && distance(c, m) <= range);
  }

  // ---------------- Doors ----------------
  doorNear(c, range = 9) {
    return this.map.doors.find(d => Math.hypot(c.position.x - d.x, c.position.y - d.y) <= range) || null;
  }

  // ---------------- The main tick ----------------
  tick(dt) {
    if (this.paused) return;
    this.time += dt;
    const now = this.time;
    const party = this.party;

    // Aggro: a living party member walks into a camp's range
    for (const m of this.mobs) {
      if (m.isDead || m.evading || m.threat.size) continue;
      const close = party.find(p => !p.isDead && distance(p, m) <= m.aggroRange);
      if (close) { this.pull(m, close); if (m.camp.announcedAt !== now) this.announcePull(m.camp, now); }
    }
    // A mob that's being hit pulls its friends too (camps fight together)
    for (const m of this.mobs) if (!m.isDead && !m.evading && m.threat.size && m.camp.members.some(o => !o.isDead && !o.threat.size && !o.evading)) {
      const who = m.pickTarget() || [...m.threat.keys()][0];
      if (who) this.pull(m, who);
    }

    // Leash: dragged too far from home, or everyone it hated is dead → give up and go home
    for (const m of this.mobs) {
      if (m.isDead || m.evading || !m.threat.size) continue;
      const far = Math.hypot(m.position.x - m.spawn.x, m.position.y - m.spawn.y) > TUNING.leashRange;
      const noOne = ![...m.threat.keys()].some(p => !p.isDead && party.includes(p));
      if (far || noOne) this.evade(m);
    }

    const engaged = this.engaged();
    const inCombat = engaged.length > 0;
    if (inCombat) this.lastFight = now;

    // Who's the "boss" for the companions: whatever the tank is fighting, else what's hitting you
    const tankTarget = this.tank.target && engaged.includes(this.tank.target) ? this.tank.target : null;
    const meTarget = engaged.find(m => m.pickTarget() === this.me.character);
    const nearest = engaged.slice().sort((a, b) => distance(a, this.me.character) - distance(b, this.me.character))[0];
    const focus = tankTarget || meTarget || nearest || null;
    const world = {
      party, tank: this.tank, revives: null,
      boss: focus, adds: engaged.filter(m => m !== focus),
      ctxFor: (c) => ({ allies: party.filter(a => a !== c), enemies: c === this.me.character ? this.nearbyMobs(c, 40).concat(engaged.filter(m => distance(c, m) > 40)) : engaged }),
    };

    // A new fight: ranged companions pick a spot ~18 m from the enemy
    if (inCombat && !this.wasInCombat) {
      for (const b of this.bots) {
        const c = b.character;
        if (c.isDead || !focus) continue;
        const d = distance(c, focus) || 1;
        const keep = Math.min(d, 18);
        b.home = { x: focus.position.x + (c.position.x - focus.position.x) / d * keep, y: focus.position.y + (c.position.y - focus.position.y) / d * keep };
        c.enterCombat();
      }
    }
    this.wasInCombat = inCombat;

    // Party
    for (const b of this.bots) {
      const c = b.character;
      if (this.human.isControlling(b)) this.human.act(b, world, dt, now, this.recorder);
      else if (inCombat && focus) b.think(now, dt, world);
      else this.follow(b, dt);
      c.update(dt, world.ctxFor(c));
      this.keepInside(c);
    }

    // Mobs
    for (const m of this.mobs) {
      if (m.isDead) {
        if (!m.diedAt) this.onMobDeath(m, now);
        if (now >= m.respawnAt && !party.some(p => !p.isDead && Math.hypot(p.position.x - m.spawn.x, p.position.y - m.spawn.y) < 40)) this.respawn(m);
        continue;
      }
      if (m.evading) { this.walkHome(m, dt); continue; }
      if (m.threat.size) m.update(dt, { allies: [], enemies: party });
      else this.wander(m, dt, now);
    }

    // After the fight: patch everyone up
    if (!inCombat && now - this.lastFight > 1.5) this.restAndRecover(dt, now);
    this.checkWipe(now);
    if (!inCombat && this.pendingRefresh?.size) { for (const b of this.pendingRefresh) this.refreshCharacter(b); this.pendingRefresh.clear(); }

    // Where are you? (region banner)
    // (sent again every few seconds too, for a browser that just connected)
    const reg = regionAt(this.map, this.me.character.position.x, this.me.character.position.y);
    const resend = now - (this.sentStateAt || -99) > 3;
    if (reg.key !== this.region || resend) {
      this.live?.broadcast({ type: "region", name: reg.name, key: reg.key, theme: reg.theme, quiet: reg.key === this.region });
      this.region = reg.key;
    }
    const door = this.doorNear(this.me.character);
    const doorKey = door?.boss || null;
    if (doorKey !== this.doorShown || (resend && doorKey)) { this.doorShown = doorKey; this.live?.broadcast({ type: "door", boss: doorKey, name: doorKey ? BOSSES[doorKey].name : null }); }
    if (resend) this.sentStateAt = now;

    // Stream: everything within 160 m of you (and bodies for a while)
    const me = this.me.character;
    const shown = this.mobs.filter(m => (!m.isDead || now - m.diedAt < TUNING.corpseTime) && Math.hypot(m.position.x - me.position.x, m.position.y - me.position.y) < 160);
    this.recorder.capture(now, shown);
    if (this.dirty && now - (this.savedAt || 0) > 5) { this.savedAt = now; this.dirty = false; this.onSave?.(); }
  }

  announcePull(camp, now) {
    camp.announcedAt = now;
    const names = camp.members.filter(m => !m.isDead).map(m => m.name);
    if (names.length) this.event(`⚔ ${names.join(", ")} attack${names.length === 1 ? "s" : ""}!`);
  }

  follow(b, dt) {
    const c = b.character, leader = this.me.character;
    if (c.isDead || b === this.me) return;
    const i = this.bots.indexOf(b);
    // Spread out in a loose arc behind you
    const behind = leader._facingDir || { x: 0, y: 1 };
    const side = [0, -1, 1, -2, 2][i] * 1.8;
    const spot = { x: leader.position.x - behind.x * TUNING.followDist * (1 + (i > 2 ? 0.6 : 0)) - behind.y * side, y: leader.position.y - behind.y * TUNING.followDist * (1 + (i > 2 ? 0.6 : 0)) + behind.x * side };
    const d = Math.hypot(spot.x - c.position.x, spot.y - c.position.y);
    if (d > 25) { c.position.x = spot.x; c.position.y = spot.y; return; }   // fell way behind: catch up
    if (d > 1.2) b.moveToward(spot, dt, 0.8, d > 8 ? 9 : 7);
  }

  keepInside(c) {
    const R = this.map.radius, d = Math.hypot(c.position.x, c.position.y);
    if (d > R) { c.position.x *= R / d; c.position.y *= R / d; }
    // which way the leader is walking (companions line up behind)
    if (c === this.me.character) {
      const last = this._lastMe || { ...c.position };
      const dx = c.position.x - last.x, dy = c.position.y - last.y, m = Math.hypot(dx, dy);
      if (m > 0.05) c._facingDir = { x: dx / m, y: dy / m };
      this._lastMe = { ...c.position };
    }
  }

  wander(m, dt, now) {
    if (now < m.wanderAt) return;
    if (!m.wanderTo) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * 3.5;
      m.wanderTo = { x: m.spawn.x + Math.cos(a) * r, y: m.spawn.y + Math.sin(a) * r };
    }
    const dx = m.wanderTo.x - m.position.x, dy = m.wanderTo.y - m.position.y, d = Math.hypot(dx, dy);
    if (d < 0.2) { m.wanderTo = null; m.wanderAt = now + 4 + Math.random() * 8; return; }
    const step = Math.min(d, 1.6 * dt);
    m.move(dx / d * step, dy / d * step);
    m._facing = Math.atan2(dy, dx);
  }

  walkHome(m, dt) {
    const dx = m.spawn.x - m.position.x, dy = m.spawn.y - m.position.y, d = Math.hypot(dx, dy);
    m.hp = Math.min(m.maxHp, m.hp + m.maxHp * 0.25 * dt);
    if (d < 0.5) { m.evading = false; m.hp = m.maxHp; m.threat.clear(); return; }
    const step = Math.min(d, 10 * dt);
    m.position.x += dx / d * step; m.position.y += dy / d * step;
    m._facing = Math.atan2(dy, dx);
  }

  onMobDeath(m, now) {
    m.diedAt = now;
    m.respawnAt = now + TUNING.respawnTime;
    this.event(`☠ ${m.name} defeated`);
    // Everyone in the party rolls for loot (if they were close enough to help)
    for (const b of this.bots) {
      const c = b.character;
      if (c.isDead && distance(c, m) > 60) continue;
      const items = rollMobLoot(b, m);
      if (!items.length) continue;
      const res = b.handleLoot(items, TUNING.level, now);
      for (const item of items) {
        const up = res.equipped.find(e => e.item === item);
        if (b === this.me || up || item.rarity === "epic" || item.rarity === "legendary")
          this.event(`🎁 ${b === this.me ? "You" : b.name} looted ${formatItem(item)}${up ? "  ⬆ EQUIPPED" : ""}`);
        if (up) (this.pendingRefresh ||= new Set()).add(b);
      }
      this.dirty = true;
    }
  }

  respawn(m) {
    m.isDead = false; m.diedAt = null; m.evading = false;
    m.hp = m.maxHp; m.threat.clear(); m.buffs = []; m.cast = null; m.oath = null; m.target = null;
    m.position.x = m.spawn.x; m.position.y = m.spawn.y;
  }

  restAndRecover(dt, now) {
    for (const c of this.party) {
      if (c.isDead) {
        if (now - this.lastFight > TUNING.reviveAfter && !this.wipedAt) {
          c.revive(0.4);
          const helper = this.party.find(p => !p.isDead && p !== c && (p.className === "Healer" || p.className === "Druid" || p.className === "Knight")) || this.party.find(p => !p.isDead && p !== c);
          this.event(`✨ ${helper ? helper.name + " helps " + c.name + " back up" : c.name + " gets back up"}`);
        }
        continue;
      }
      c.hp = Math.min(c.maxHp, c.hp + c.maxHp * TUNING.regenPerSec * dt);
      const res = c.resource;
      if (!res.decayOutOfCombat) res.current = Math.min(res.max, res.current + res.max * TUNING.regenPerSec * dt);
    }
  }

  checkWipe(now) {
    if (this.wipedAt == null && this.party.every(c => c.isDead)) {
      this.wipedAt = now;
      this.event("💀 Your party has fallen… you'll wake up in town.");
    }
    if (this.wipedAt != null && now - this.wipedAt > TUNING.wipeRespawn) {
      this.wipedAt = null;
      for (const m of this.mobs) if (!m.isDead && m.threat.size) this.evade(m);
      const s = this.map.spawn;
      this.party.forEach((c, i) => { c.revive(1); c.position.x = s.x + (i - 2) * 2; c.position.y = s.y; c.resource.current = c.resource.max; });
      this.lastFight = now;
      this.event(`🏠 You wake up in ${this.map.town.name}.`);
    }
  }

  // Back from a raid: new gear, standing outside the door you went through
  placeAt(point) {
    this.party.forEach((c, i) => { c.position.x = point.x + (i - 2) * 2; c.position.y = point.y + 2; });
  }
}

module.exports = { World, TUNING };