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
  phase: ["phase change!", "here we go", "watch out", "adds!"],
  taunt: ["taunted, swap!", "I got it", "swapping", "taunt swap"],
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
    this.knowsPositioning = Math.random() < this.p.positioning;
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
  sees(id, condition, now) {
    if (!condition) {
      this.noticed.delete(id);
      return false;
    }
    let n = this.noticed.get(id);
    if (!n) {
      n = { reactAt: now + rand(...this.p.reaction), willNotice: Math.random() < this.p.awareness };
      this.noticed.set(id, n);
    }
    return n.willNotice && now >= n.reactAt;
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
      n = { reactAt: now + rand(...this.p.reaction), willNotice: Math.random() < this.p.awareness, retryAt: now + 1.5 };
      this.fireEpisode = n;
    }
    if (!n.willNotice || now < n.reactAt) return false;

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
  //  LEARNING — after a wipe, the group gets better at the fight
  // ------------------------------------------------------------
  learn(diedTo) {
    this.attempts++;
    const p = this.p;
    p.awareness = Math.min(0.99, p.awareness + (1 - p.awareness) * 0.25);
    p.mistakeRate *= 0.8;
    p.positioning = Math.min(0.99, p.positioning + (1 - p.positioning) * 0.3);
    p.reaction = p.reaction.map(r => Math.max(0.12, r * 0.93));
    if (diedTo) this.lessons = [...(this.lessons || []), diedTo];
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

module.exports = { PlayerBot, rand };