// PlayerBot.js — a "brain" that plays a character like a human would.
//
// Instead of pressing abilities in a fixed order, each think():
//   1. The bot may be zoned out (attention lapse) and do nothing.
//   2. It only "sees" events after a human reaction delay — and might miss them entirely.
//   3. The class playbook suggests options with scores; the bot adds noise to the scores,
//      and sometimes just presses the wrong thing.
//   4. It waits a human-like input delay before the next press.
//   5. It moves around, talks in party chat, and learns between attempts.

const { SKILL_PROFILES, PERSONALITIES } = require("./skillProfiles");
const { distance } = require("../classes/Character");

const rand = (min, max) => min + Math.random() * (max - min);

// ---- Learning settings (tune these) ----
const LEARN = {
  ownDeath: 0.35,   // died to a mechanic: learn 35% of what's left to learn about it
  watched: 0.12,    // saw it kill a raid-mate: learn 12%
  practice: 0.03,   // handled it correctly: learn 3%
  general: 0.10,    // each attempt, overall skill moves 10% closer to their potential
};
// Healers/Knights: checking that a body isn't still lying in the fire before reviving it
const SAFE_REVIVE = "Safe Revive";
const HUMAN_ERROR = 0.02; // even a master still fails a mechanic at least 2% of the time
const TIRED_CHANCE = 0.1; // 10% of attempts a player is "off" (tired, distracted, lag)

// Deaths that can't be avoided by knowing the fight — nothing to learn from them
const UNLEARNABLE = ["melee hit", "Worldfire", "Heat Wave", "Cataclysm", "Meteor Swarm", "Molten Brand", "Shadow Nova", "Soul Drain"];

// "Inferno Rift (didn't move)" -> "Inferno Rift"
function mechanicName(cause) {
  if (!cause) return null;
  const name = cause.split(" (")[0];
  if (UNLEARNABLE.includes(name) || /^Hollow Skeleton|^Ash Elemental|^Crypt|^Bone|^Forge|^Cinder|^Magma|^Flameweaver|^Molten Giant/.test(name)) return null;
  return name;
}

// Which skill tier a (learning) profile is closest to, by awareness
function closestTier(p) {
  let best = "casual", bestDiff = Infinity;
  for (const [key, t] of Object.entries(SKILL_PROFILES)) {
    const d = Math.abs(t.awareness - p.awareness);
    if (d < bestDiff) { best = key; bestDiff = d; }
  }
  return SKILL_PROFILES[best].label;
}
const pickRandom = (arr) => arr[Math.floor(Math.random() * arr.length)];

const CHAT = {
  lowHp: ["heal pls", "HEAL", "im dying!!", "help", "heals??"],
  oom: ["oom", "out of mana", "need a sec, oom"],
  died: ["rip", "my bad", "lag...", "wtf was that", "sorry"],
  gotInterrupt: ["kicked", "got the interrupt", "interrupted!"],
  wipe: ["gg go again", "run it back", "we got this next one", "one more"],
  upgrade: ["ty!", "nice upgrade", "finally!!", "ooo shiny", "LETS GOOO"],
  noUpgrade: ["nothing for me again...", "no loot :(", "rng hates me", "vendor trash lol"],
  legendary: ["NO WAY", "LEGENDARY!!!", "omg omg omg", "I'M SHAKING"],
  win: ["GG!!", "LETS GO", "ez", "gg wp", "finally!!"],
  tired: ["kinda tired tonight ngl", "my ping is awful rn", "sorry, distracted", "long day at work lol"],
  learned: ["ok I get it now", "won't happen again", "my bad, I see it now", "got it, move out of the fire", "noted"],
  phase: ["phase change!", "here we go", "watch out", "adds!"],
  taunt: ["taunted, swap!", "I got it", "swapping", "taunt swap"],
  reviving: ["rezzing", "got the rez", "reviving, cover me", "on it, rezzing"],
  revived: ["ty for the rez!", "back up", "ty!!", "I'm back"],
  waitRez: ["waiting for the fire to clear before I rez", "can't rez yet, they're in the fire", "rez once the fire's gone"],
  rezCancel: ["cancelling rez, fire's on the body", "stopped the rez — fire", "fire on them, cancelling"],
  goMelee: ["going in with the scythe", "Reaper stance, moving in", "melee time 💀"],
  goRanged: ["backing off", "too hot, going ranged", "Deathcaller stance, back to range"],
  servants: ["servants up", "rise, my minions", "pets out 🧟"],
  badRez: ["my bad, rezzed you in the fire", "oops, that was in the fire", "sorry!! didn't see the fire", "wasted that rez, my bad"],
  diedAgain: ["rezzed me in the fire lol", "bro I was still in the fire", "why'd you rez me in that 😭"],
};

class PlayerBot {
  /**
   * @param {string} name
   * @param {string} skill        key from SKILL_PROFILES
   * @param {string} personality  key from PERSONALITIES
   * @param {object} playbook     from playbooks.js (class-specific decisions)
   */
  constructor(name, skill, personality, playbook) {
    this.name = name;
    this.skillKey = skill;
    this.personalityKey = personality;
    this.p = { ...SKILL_PROFILES[skill] };   // copied so learning can change it
    this.personality = PERSONALITIES[personality];
    this.playbook = playbook;
    this.character = null;
    this.attempts = 0;

    // MECHANIC MEMORY: how well this player knows each boss mechanic, 0 (never seen) to 1 (mastered).
    // e.g. { "Inferno Rift": 0.6, "Pyroclasm": 0.2 }. Goes up when they die to it, watch it
    // kill someone, or handle it correctly. Saved between runs.
    this.mastery = {};
    // POTENTIAL: the best this player can ever get (most people never become pros)
    this.potential = skill;
    this.experience = 0;       // boss attempts played
    this.onSay = null;                        // hook: (bot, message) => {}
    this.onNote = null;                       // hook for notable plays / mistakes
  }

  // Called at the start of every attempt with a fresh character
  attach(character) {
    this.character = character;
    this.nextActionAt = 0;
    this.lapseUntil = 0;
    this.noticed = new Map();
    this.chatCooldowns = {};
    // Some nights you're just off: tired, distracted, laggy. Mechanics go worse.
    this.tired = Math.random() < TIRED_CHANCE;
    // Standing behind the boss is a lesson learned from frontal attacks
    const frontal = Math.max(this.masteryOf("Flame Breath"), this.masteryOf("Cleave"));
    this.knowsPositioning = Math.random() < this.p.positioning * (0.4 + 0.6 * frontal);
    this.movePlan = null;      // { until, dx, dy } for random fidgeting
    this.fireEpisode = null;   // are they reacting to fire right now? (see dodgeZones)
    this.style = this.playbook.pickStyle?.(this) || {};
    this.home = { ...character.position };
  }

  // ------------------------------------------------------------
  //  PERCEPTION — the heart of "human" behavior
  // ------------------------------------------------------------
  /**
   * Returns true only after the bot has had time to react to `condition` being true,
   * and only if it actually noticed it. Each new occurrence is rolled separately.
   * Example: bot.sees("bossCast:shadowBolt", boss.cast?.key === "shadowBolt", now)
   */
  sees(id, condition, now, mechanic = null) {
    if (!condition) {
      this.noticed.delete(id);
      return false;
    }
    let n = this.noticed.get(id);
    if (!n) {
      // For a named boss mechanic, how well they KNOW it changes the odds and the speed
      const chance = mechanic ? this.handleChance(mechanic) : this.p.awareness;
      const speed = mechanic ? this.reactionFor(mechanic) : rand(...this.p.reaction);
      n = { reactAt: now + speed, willNotice: Math.random() < chance, mechanic };
      this.noticed.set(id, n);
    }
    const ok = n.willNotice && now >= n.reactAt;
    if (ok && n.mechanic && !n.practiced) { n.practiced = true; this.practice(n.mechanic); }
    return ok;
  }

  /**
   * Before starting a revive: does this player check whether the body is still lying
   * in fire (or under a warning circle that's about to go off)?
   * Rolled ONCE per body per fire — a player who didn't look won't suddenly notice a tick later.
   * It's mostly common sense, so everyone starts decent at it, and it gets better with
   * "Safe Revive" mastery (learned by reviving someone into the fire and watching them die again).
   */
  checksBody(id, inDanger, now) {
    if (!inDanger) { this.noticed.delete(id); return false; }
    let n = this.noticed.get(id);
    if (!n) {
      let m = this.masteryOf(SAFE_REVIVE);
      if (this.tired) m = Math.max(0, m - 0.25);
      const chance = Math.min(1 - HUMAN_ERROR, this.p.awareness * (0.75 + 0.25 * m));
      n = { willNotice: Math.random() < chance, reactAt: now };
      this.noticed.set(id, n);
      if (n.willNotice) this.practice(SAFE_REVIVE);
    }
    return n.willNotice;
  }

  // "I did that wrong and it cost us" — learn from your own mistake (like dying to a mechanic)
  learnFromMistake(mechanic) {
    const m = this.masteryOf(mechanic);
    this.mastery[mechanic] = m + (1 - m) * LEARN.ownDeath;
  }

  // ------------------------------------------------------------
  //  MECHANIC MEMORY
  // ------------------------------------------------------------
  masteryOf(mechanic) {
    return this.mastery[mechanic] || 0;
  }

  /**
   * Chance to handle a mechanic correctly this time.
   * Never seen it: ~40% of their normal awareness. Mastered: their full awareness.
   * Always capped below 100% — even the best players slip up sometimes.
   */
  handleChance(mechanic) {
    let m = this.masteryOf(mechanic);
    if (this.tired) m = Math.max(0, m - 0.25);
    const chance = this.p.awareness * (0.4 + 0.6 * m);
    return Math.min(1 - HUMAN_ERROR, chance);
  }

  // Unfamiliar mechanics take longer to react to (up to 50% slower)
  reactionFor(mechanic) {
    const m = this.masteryOf(mechanic);
    return rand(...this.p.reaction) * (1.5 - 0.5 * m) * (this.tired ? 1.2 : 1);
  }

  // Handled it correctly: a little more confident next time
  practice(mechanic) {
    const m = this.masteryOf(mechanic);
    this.mastery[mechanic] = m + (1 - m) * LEARN.practice;
  }

  // ------------------------------------------------------------
  //  MAIN LOOP — call every tick before character.update()
  // ------------------------------------------------------------
  think(now, dt, world) {
    const c = this.character;
    if (!c || c.isDead) return;

    this.chatter(now, world);

    // Zoning out
    if (now < this.lapseUntil) return;
    if (Math.random() < this.p.lapsePerSec * dt) {
      this.lapseUntil = now + rand(0.5, 2);
      return;
    }

    // Get out of fire first (if they notice it), otherwise normal movement
    this._zones = (world.boss?.zones || []).filter(z => z.hostile);
    if (!this.dodgeZones(dt, now)) this.playbook.move?.(this, world, dt, now);

    if (now < this.nextActionAt) return;

    const options = (this.playbook.options(this, world, now) || []).filter(o => o && o.score > 0);
    if (!options.length) return;

    // Humans don't follow a perfect priority: add noise to every score
    for (const o of options) o.noisy = o.score * (1 + (Math.random() * 2 - 1) * this.p.decisionNoise);
    options.sort((a, b) => b.noisy - a.noisy);

    // Occasionally press something random (fat-finger / wrong keybind)
    if (Math.random() < this.p.mistakeRate) options.unshift(pickRandom(options));

    for (const o of options) {
      const res = c.use(o.key, o.target, world.ctxFor(c));
      if (res.ok) {
        this.nextActionAt = now + rand(...this.p.inputDelay);
        o.onUse?.(res);
        return;
      }
    }
    // Nothing worked (GCD, cooldowns...) — check again very soon
    this.nextActionAt = now + 0.05;
  }

  // ------------------------------------------------------------
  //  MOVEMENT HELPERS (used by playbooks)
  // ------------------------------------------------------------
  // Is this spot inside a hostile ground effect (fire, poison...)?
  zoneAt(point) {
    return (this._zones || []).find(z =>
      Math.hypot(point.x - z.position.x, point.y - z.position.y) <= z.radius + 0.5);
  }

  // If a spot is inside fire, find the NEAREST spot that's clear of ALL fire.
  // (Several fire circles can overlap into one big area — stepping out of one
  // circle into the next doesn't help, so we search outward in rings.)
  safePoint(point) {
    if (!this.zoneAt(point)) return point;
    for (let r = 1; r <= 30; r += 1) {
      let best = null;
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        const p = { x: point.x + Math.cos(a) * r, y: point.y + Math.sin(a) * r };
        if (!this.zoneAt(p)) { best = p; break; }
      }
      if (best) {
        // step a little further past the edge so they don't stop right on it
        const dx = best.x - point.x, dy = best.y - point.y, d = Math.hypot(dx, dy) || 1;
        return { x: best.x + (dx / d) * 1, y: best.y + (dy / d) * 1 };
      }
    }
    return point;
  }

  /**
   * Standing in fire? Move out — but only once they NOTICE it (reaction time + awareness).
   * Once noticed, they keep running until they're out. If they didn't notice,
   * they get another chance every 1.5s... which may be too late.
   */
  dodgeZones(dt, now) {
    const c = this.character;
    const zone = this.zoneAt(c.position);
    if (!zone) { this.escapeTo = null; this.fireEpisode = null; return false; }

    // One reaction per trip into fire. Once they're running, they keep running —
    // even if they pass through several overlapping fire circles.
    let n = this.fireEpisode;
    if (!n || (!n.willNotice && now >= n.retryAt)) {
      const mechanic = zone.name || "fire";
      n = { reactAt: now + this.reactionFor(mechanic), willNotice: Math.random() < this.handleChance(mechanic), retryAt: now + 1.5, mechanic };
      this.fireEpisode = n;
    }
    if (!n.willNotice || now < n.reactAt) return false;
    if (!n.practiced) { n.practiced = true; this.practice(n.mechanic); }

    if (!this.escapeTo || this.zoneAt(this.escapeTo)) this.escapeTo = this.safePoint(c.position);
    this.moveToward(this.escapeTo, dt, 0.1, 7, true);
    return true;
  }

  moveToward(point, dt, stopWithin = 1, speed = 7, escaping = false) {
    const safe = this.safePoint(point); // never walk into fire on purpose
    if (safe !== point) stopWithin = Math.min(stopWithin, 0.3);
    point = safe;
    const c = this.character;
    const dx = point.x - c.position.x, dy = point.y - c.position.y;
    const d = Math.hypot(dx, dy);
    if (d <= stopWithin) return false;
    const step = Math.min(d - stopWithin + 0.05, speed * dt);
    const next = { x: c.position.x + (dx / d) * step, y: c.position.y + (dy / d) * step };
    // Don't step INTO fire on the way somewhere (wait at the edge instead)
    if (!escaping && this.zoneAt(next) && !this.zoneAt(c.position)) return false;
    return c.move((dx / d) * step, (dy / d) * step);
  }

  // Random small movements — casual players fidget and clip their own casts
  fidget(now, dt) {
    const c = this.character;
    if (this.movePlan && now < this.movePlan.until) {
      const next = { x: c.position.x + this.movePlan.dx * dt, y: c.position.y + this.movePlan.dy * dt };
      if (!this.zoneAt(next)) c.move(this.movePlan.dx * dt, this.movePlan.dy * dt);
      return true;
    }
    this.movePlan = null;
    const fidgetChance = (1 - this.p.awareness) * 0.15; // casual ≈ 7%/s, pro ≈ 0.5%/s
    if (!this.personality.keepsCasting && Math.random() < fidgetChance * dt) {
      const angle = Math.random() * Math.PI * 2;
      this.movePlan = { until: now + rand(0.3, 1.0), dx: Math.cos(angle) * 5, dy: Math.sin(angle) * 5 };
    }
    return false;
  }

  // Spot behind the boss (away from the tank) — safe from Cleave
  safeMeleeSpot(boss, tank) {
    if (!tank || tank === this.character) return boss.position;
    const dx = boss.position.x - tank.position.x, dy = boss.position.y - tank.position.y;
    const d = Math.hypot(dx, dy) || 1;
    return { x: boss.position.x + (dx / d) * 3.5, y: boss.position.y + (dy / d) * 3.5 };
  }

  distanceTo(target) {
    return distance(this.character, target);
  }

  // ------------------------------------------------------------
  //  CHAT
  // ------------------------------------------------------------
  say(kind, now, cooldown = 20) {
    if (Math.random() > this.personality.chatty) return;
    if ((this.chatCooldowns[kind] || -Infinity) > now) return;
    this.chatCooldowns[kind] = now + cooldown;
    this.onSay?.(this, pickRandom(CHAT[kind]));
  }

  chatter(now, world) {
    const c = this.character;
    if (c.hp / c.maxHp < 0.25 && c.role !== "healer") this.say("lowHp", now);
    if (c.role === "healer" && c.resource.current / c.resource.max < 0.1) this.say("oom", now, 30);
  }

  note(msg) {
    this.onNote?.(this, msg);
  }

  // ------------------------------------------------------------
  //  LEARNING — after every boss attempt (win or wipe)
  // ------------------------------------------------------------
  /**
   * @param diedTo      what killed THIS player (or null)
   * @param raidDeaths  everything that killed anyone in the raid, e.g. ["Inferno Rift (didn't move)", ...]
   * Returns the mechanic this player learned the most about (for the chat log).
   */
  learn(diedTo, raidDeaths = []) {
    this.attempts++;
    this.experience++;
    const bump = (mech, rate) => {
      if (!mech) return;
      const m = this.masteryOf(mech);
      this.mastery[mech] = m + (1 - m) * rate;
    };

    // "That killed ME" — the biggest lesson
    const own = mechanicName(diedTo);
    bump(own, LEARN.ownDeath);

    // "I watched it kill someone" — the raid talks about it after the wipe
    for (const mech of new Set(raidDeaths.map(mechanicName).filter(Boolean))) {
      if (mech !== own) bump(mech, LEARN.watched);
    }

    // General skill slowly grows toward this player's potential
    this.growTowardPotential();
    return own;
  }

  growTowardPotential() {
    const target = SKILL_PROFILES[this.potential];
    if (!target) return;
    const r = LEARN.general;
    for (const [k, v] of Object.entries(target)) {
      if (typeof v === "number") this.p[k] += (v - this.p[k]) * r;
      else if (Array.isArray(v)) this.p[k] = this.p[k].map((x, i) => x + (v[i] - x) * r);
    }
    // Label follows whichever tier they're closest to now
    this.p.label = closestTier(this.p);
  }

  // ------------------------------------------------------------
  //  LOOT — humans don't always equip their upgrades right away
  // ------------------------------------------------------------
  /**
   * Called when items drop. Returns { equipped: [...], forgot: [...] }.
   * Less aware players sometimes leave upgrades sitting in their bags.
   */
  handleLoot(items, level, now = 0) {
    if (!this.gear || !items.length) return { equipped: [], forgot: [] };
    this.gear.addToBag(items);
    const forgot = [];
    if (Math.random() > this.p.awareness) {
      // Didn't open their bags — upgrades stay unequipped until next time
      forgot.push(...items.filter(i => this.gear.upgradeValue(i) > 0 && this.gear.canEquip(i, level).ok));
      return { equipped: [], forgot };
    }
    const equipped = this.gear.equipUpgrades(level);
    this.gear.junkOldItems();
    if (items.some(i => i.rarity === "legendary")) this.say("legendary", now, 0);
    else if (equipped.length) this.say("upgrade", now, 0);
    return { equipped, forgot };
  }

  describe() {
    return `${this.name} — ${this.p.label} ${this.personality.label} ${this.character?.className || ""}`.trim();
  }
}

module.exports = { PlayerBot, rand, mechanicName, LEARN, HUMAN_ERROR, SAFE_REVIVE };