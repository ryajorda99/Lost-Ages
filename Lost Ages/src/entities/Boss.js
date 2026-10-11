// Boss.js — a generic boss engine. Every boss is an Enemy plus:
//   - statMultiplier: scales HP, damage, armor and ability damage (b.power)
//   - PHASES: switches move set and difficulty at HP thresholds
//   - ADAPTATION: periodically rolls a random counter-buff, weighted toward
//     whatever the players are doing most (magic vs physical damage, interrupts, top DPS)
//   - MINIONS: adds the boss summons
// The boss itself (abilities, phases, adaptations) is pure data in src/data/bosses/.

const { Enemy } = require("./Enemy");
const { distance } = require("../classes/Character");

const MAGIC_SCHOOLS = ["fire", "frost", "holy", "shadow", "arcane", "nature"];

// Checks a boss file for common typos BEFORE the fight, with a clear message.
function validateBossDef(def) {
  const problems = [];
  const name = def.name || "(boss has no name)";
  for (const key of ["baseHp", "baseDamage", "baseArmor", "attackSpeed", "level"]) {
    if (typeof def[key] !== "number" || !Number.isFinite(def[key])) {
      problems.push(`"${key}" must be a number (got ${JSON.stringify(def[key])})`);
    }
  }
  if (def.statMultiplier !== undefined && (typeof def.statMultiplier !== "number" || !Number.isFinite(def.statMultiplier))) {
    problems.push(`"statMultiplier" must be a number (got ${JSON.stringify(def.statMultiplier)})`);
  }
  if (!Array.isArray(def.phases) || def.phases.length === 0) {
    problems.push(`"phases" must be a list with at least one phase`);
  } else {
    if (def.phases[0].hpBelow !== 1 && def.phases[0].hpBelow !== 1.0) {
      problems.push(`the first phase needs  hpBelow: 1.0  (got ${JSON.stringify(def.phases[0].hpBelow)})`);
    }
    def.phases.forEach((p, i) => {
      if (typeof p.hpBelow !== "number") problems.push(`phase ${i + 1} ("${p.name}") is missing a number for "hpBelow"`);
      if (!Array.isArray(p.rotation)) problems.push(`phase ${i + 1} ("${p.name}") is missing its "rotation" list`);
      for (const key of p.rotation || []) {
        if (!def.abilities || !def.abilities[key]) problems.push(`phase ${i + 1} uses ability "${key}", but there's no ability with that name`);
      }
    });
  }
  // Find likely typos: keys that differ from a real key only by capital letters
  const expected = ["baseHp", "baseDamage", "baseArmor", "attackSpeed", "statMultiplier", "enrageTimer", "transitionTime"];
  for (const key of Object.keys(def)) {
    const match = expected.find(e => e.toLowerCase() === key.toLowerCase() && e !== key);
    if (match) problems.push(`found "${key}" — did you mean "${match}"? (capital letters matter)`);
  }
  if (problems.length) {
    throw new Error(`Problem in the boss file for ${name}:\n  - ${problems.join("\n  - ")}`);
  }
}

class Boss extends Enemy {
  constructor(def, position = { x: 0, y: 0 }) {
    validateBossDef(def);
    const m = def.statMultiplier ?? 1;
    super({
      name: def.name,
      level: def.level,
      position,
      hp: def.baseHp * m,
      damage: def.baseDamage * m,
      attackSpeed: def.attackSpeed,
      armor: def.baseArmor * m,
      type: def.type,
      elite: true,
      abilities: def.abilities,
    });
    this.str *= m;
    this.power = m;                 // ability formulas multiply by b.power
    this.def = def;
    this.isBoss = true;
    this.baseWeaponSpeed = this.weaponSpeed;

    this.phaseIndex = -1;
    this.phase = null;
    this.transitionTimer = 0;
    this.cooldownRate = 1;

    this.adaptTimer = def.adaptation.firstAfter;
    this.activeAdaptations = [];
    this.resetAdaptationLog();

    this.minions = [];
    this.events = [];               // announcements for the UI / chat log

    // Abilities can wait before their first use:  firstUseAfter: 6  (seconds into the fight)
    for (const [key, a] of Object.entries(this.abilities)) {
      if (a.firstUseAfter) this.cooldowns[key] = a.firstUseAfter;
    }

    // Hard enrage: after def.enrageTimer seconds the boss hits 5x harder (a DPS check)
    this.fightTime = 0;
    this.fallen = new Set();        // players whose deaths the boss has already reacted to
    this.enraged = false;
  }

  // ---------------- Messages ----------------
  announce(msg) {
    this.events.push(msg);
    this.onAnnounce?.(msg);
  }

  /**
   * "Move or die": a glowing warning circle appears under a player, then erupts.
   * Anyone still standing in it when it erupts dies (or takes `damage` if lethal is false).
   * @param target  the player to put it under
   * @param o       { name, radius, warn (seconds of warning), lethal, damage, duration }
   */
  eruptUnder(target, { name, radius = 4, warn = 1.5, lethal = true, damage = 0, duration = 4 } = {}) {
    const born = this.fightTime;
    this.placeZone({
      name, hostile: true, warn,
      position: { ...target.position }, radius, duration: warn + duration, tickEvery: 0.25,
      onTick: (caster, inside) => {
        if (caster.fightTime - born < warn) return;           // still just a warning
        for (const p of inside) {
          if (lethal) caster.lethal(p, `${name} (didn't move)`);
          else caster.dealDamage(p, damage * 0.25, "shadow"); // damage per second, ticking 4x/sec
        }
      },
    });
  }

  // Instantly kill a player who failed a mechanic. Ignores armor, shields and defensives.
  lethal(target, cause) {
    if (target.isDead) return;
    target._deathCause = cause;
    target.absorb = 0;
    target.hp = 0;
    target.die(this);
  }

  // ---------------- Main tick ----------------
  update(dt, ctx = {}) {
    if (this.isDead) return;
    const players = (ctx.enemies || []).filter(p => !p.isDead);

    // Player deaths: some bosses grow stronger when players die (def.onPlayerDeath)
    if (this.def.onPlayerDeath) {
      for (const p of ctx.enemies || []) {
        if (p.isDead && !this.fallen.has(p)) {
          this.fallen.add(p);
          if (!this.enraged) this.def.onPlayerDeath(this, p, ctx);
        }
      }
    }

    // Enrage timer
    this.fightTime += dt;
    if (this.def.enrageTimer && !this.enraged && this.fightTime >= this.def.enrageTimer) {
      this.enraged = true;
      this.addBuff({ id: "berserk", duration: Infinity, mods: { damageDealt: 5 } });
      this.haste += 50;
      this.announce(`${this.name} goes BERSERK! (enrage timer reached)`);
      this.def.onEnrage?.(this, ctx);   // some bosses do something deadly on enrage
    }

    // Phase check: phases are ordered by hpBelow (1.0, 0.75, 0.5, 0.25)
    const pct = this.hp / this.maxHp;
    // STAGGER CHECK (a DPS check): at set health the boss starts a raid-wiping attack (def.staggerCheck)
    if (this.updateStaggerCheck(dt, ctx, pct)) { super.update(dt, ctx); this.minions = this.minions.filter(mn => !mn.isDead); for (const mn of this.minions) mn.update(dt, ctx); return; }
    const next = this.def.phases.findLastIndex(p => pct <= p.hpBelow);
    if (next > this.phaseIndex) this.enterPhase(next, ctx);

    // Phase transition: boss is immune and busy for a few seconds
    if (this.transitionTimer > 0) {
      this.transitionTimer -= dt;
      this.stunned = Math.max(this.stunned, this.transitionTimer);
      if (this.transitionTimer <= 0) this.removeBuff("transition");
    } else if (this.hasBuff("adapt_unstoppable")) {
      this.stunned = 0; // can't be stunned
    }

    // Adaptation
    this.adaptTimer -= dt;
    if (this.adaptTimer <= 0 && this.transitionTimer <= 0) {
      this.adapt(ctx);
      this.adaptTimer = this.phase.adaptEvery;
    }
    this.activeAdaptations = this.activeAdaptations.filter(a => this.hasBuff(`adapt_${a.id}`));

    // Ability AI: go down the phase's priority list, use the first ready ability
    if (!this.cast && this.stunned <= 0 && players.length) this.chooseAbility(players, ctx);

    super.update(dt, ctx);

    // Later phases: cooldowns recover faster
    if (this.cooldownRate !== 1) {
      for (const k in this.cooldowns) this.cooldowns[k] = Math.max(0, this.cooldowns[k] - dt * (this.cooldownRate - 1));
    }

    // Minions
    this.minions = this.minions.filter(mn => !mn.isDead);
    for (const mn of this.minions) mn.update(dt, ctx);
  }

  // ---------------- Stagger check ----------------
  // def.staggerCheck = { name, at: [0.68, 0.32], window: 12, need: 0.1 (of max HP), stunTime, vulnerable,
  //                      damageTaken (while charging, e.g. 0.5), onStart, onTick(b, ctx, dt), onSuccess, onFail }
  // When the boss's health drops to one of the `at` marks it starts the attack: for `window` seconds it does
  // nothing else, and the raid must deal `need` × its max HP in damage. Enough → STAGGERED (stunned, takes
  // extra damage). Not enough → the attack goes off (onFail — usually it kills everyone).
  // Returns true while the attack is being charged (the boss is busy).
  updateStaggerCheck(dt, ctx, pct) {
    const sc = this.def.staggerCheck;
    if (!sc) return false;
    this.staggerNext ??= 0;
    if (!this.ascend) {
      const mark = sc.at[this.staggerNext];
      if (mark == null || pct > mark || this.enraged || this.transitionTimer > 0 || this.isDead) return false;
      // Begin: drop whatever it was doing and rise into the sky
      this.staggerNext++;
      this.cast = null;
      if (this.hasBuff("skyborne")) { const i = this.buffs.findIndex(b => b.id === "skyborne"); this.buffs.splice(i, 1); }
      this.flying = true;
      this.ascend = { t: 0, dur: sc.window, need: this.maxHp * sc.need, done: 0, lastHp: this.hp, name: sc.name, tick: 0 };
      if (sc.damageTaken != null) this.addBuff({ id: "ascending", duration: Infinity, mods: { damageTaken: sc.damageTaken } });   // wrapped in the storm
      sc.onStart?.(this, ctx);
    }
    const A = this.ascend;
    A.t += dt;
    A.done += Math.max(0, A.lastHp - this.hp);   // only damage counts (heals don't take progress away)
    A.lastHp = this.hp;
    this.stunned = Math.max(this.stunned, 0.2);    // too busy to attack or use anything else
    if (A.done >= A.need || A.t >= A.dur) this.removeBuff("ascending");
    if (A.done >= A.need) {
      // STAGGERED: it crashes to the ground, stunned and exposed
      this.ascend = null; this.flying = false;
      this.stunned = sc.stunTime ?? 8;
      this.addBuff({ id: "staggered", duration: sc.stunTime ?? 8, mods: { damageTaken: sc.vulnerable ?? 1.5 } });
      this.staggerResult = { state: 2, until: this.fightTime + 3, time: A.t };
      sc.onSuccess?.(this, ctx);
      return false;
    }
    if (A.t >= A.dur) {
      this.ascend = null; this.flying = false; this.stunned = 0;
      this.staggerResult = { state: 3, until: this.fightTime + 3, progress: A.done / A.need };
      sc.onFail?.(this, ctx);
      return false;
    }
    sc.onTick?.(this, ctx, dt);
    return true;
  }

  // ---------------- Phases ----------------
  enterPhase(index, ctx) {
    const first = this.phaseIndex === -1;
    this.phaseIndex = index;
    this.phase = this.def.phases[index];
    const ph = this.phase;

    // Difficulty scaling for this phase
    this.addBuff({ id: "phasePower", duration: Infinity, mods: { damageDealt: ph.damageMult } });
    this.weaponSpeed = this.baseWeaponSpeed / ph.attackSpeedMult;
    this.cooldownRate = ph.cooldownRate || 1;

    this.announce(`PHASE ${index + 1}: ${ph.name}${ph.description ? " — " + ph.description : ""}`);

    if (!first) {
      // Transition: cancel cast, become immune briefly, roar
      this.cast = null;
      this.transitionTimer = this.def.transitionTime ?? 3;
      this.addBuff({ id: "transition", duration: Infinity, mods: { damageTaken: 0 } });
      this.adaptTimer = Math.min(this.adaptTimer, 5);
    }
    ph.onEnter?.(this, ctx);
  }

  chooseAbility(players, ctx) {
    for (const key of this.phase.rotation) {
      const a = this.abilities[key];
      if ((this.cooldowns[key] || 0) > 0) continue;
      const target = this.pickAbilityTarget(a.targetMode, players);
      if (a.target === "enemy" && !target) continue;
      const res = this.use(key, a.target === "self" ? this : target, ctx);
      if (res.ok) {
        const who = a.target === "enemy" ? ` on ${target.name}` : "";
        if (res.casting) this.announce(`${this.name} begins casting ${a.name}${who}!`);
        else if (a.announce !== false) this.announce(`${this.name} uses ${a.name}${who}!`);
        return;
      }
    }
  }

  pickAbilityTarget(mode = "tank", players) {
    const tank = this.target && !this.target.isDead ? this.target : null;
    const random = (list) => list[Math.floor(Math.random() * list.length)] || null;
    switch (mode) {
      case "tank": return tank;
      case "random": return random(players);
      case "randomNonTank": return random(players.filter(p => p !== tank)) || tank;
      case "randomRanged": return random(players.filter(p => distance(this, p) > 10)) || random(players);
      case "lowestHp": return players.slice().sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
      default: return tank;
    }
  }

  // ---------------- Adaptation ----------------
  resetAdaptationLog() {
    this.log = { magic: 0, physical: 0, interrupts: 0, bySource: new Map() };
  }

  takeDamage(amount, source = null, school = "physical") {
    const dealt = super.takeDamage(amount, source, school);
    if (dealt > 0) {
      if (MAGIC_SCHOOLS.includes(school)) this.log.magic += dealt; else this.log.physical += dealt;
      if (source) this.log.bySource.set(source, (this.log.bySource.get(source) || 0) + dealt);

      // Reflect / thorns adaptations
      if (source && !source.isDead && source !== this) {
        if (this.hasBuff("adapt_mirror") && MAGIC_SCHOOLS.includes(school)) source.takeDamage(dealt * 0.3, this, "shadow");
        if (this.hasBuff("adapt_thorns") && school === "physical") source.takeDamage(dealt * 0.2, this, "physical");
      }
    }
    return dealt;
  }

  interrupt(reason, lockout) {
    if (!this.cast) return false;
    const a = this.abilities[this.cast.key];
    if (reason !== "moved" && (a.uninterruptible || this.hasBuff("adapt_unstoppable"))) {
      this.announce(`${a.name} cannot be interrupted!`);
      return false;
    }
    if (reason !== "moved") this.log.interrupts++;
    return super.interrupt(reason, lockout);
  }

  // What the players have been doing since the last adaptation
  adaptationStats() {
    const total = this.log.magic + this.log.physical || 1;
    let topSource = null, topDmg = 0;
    for (const [src, d] of this.log.bySource) if (!src.isDead && d > topDmg) { topSource = src; topDmg = d; }
    return {
      magicShare: this.log.magic / total,
      physicalShare: this.log.physical / total,
      interrupts: this.log.interrupts,
      topSource,
    };
  }

  adapt(ctx) {
    const stats = this.adaptationStats();
    const max = this.phase.maxAdaptations || 1;
    if (this.activeAdaptations.length >= max) {
      // Drop the oldest to make room
      const old = this.activeAdaptations.shift();
      this.removeBuff(`adapt_${old.id}`);
    }

    const activeIds = new Set(this.activeAdaptations.map(a => a.id));
    const options = this.def.adaptation.pool.filter(a => !activeIds.has(a.id));
    const weights = options.map(a => Math.max(0, a.weight(stats, this)));
    const total = weights.reduce((s, w) => s + w, 0);
    if (!total) return;

    // Weighted random pick — likely to counter the party, but never guaranteed
    let roll = Math.random() * total, chosen = options[0];
    for (let i = 0; i < options.length; i++) {
      if ((roll -= weights[i]) <= 0) { chosen = options[i]; break; }
    }

    const duration = chosen.duration ?? this.phase.adaptDuration ?? 20;
    this.addBuff({
      id: `adapt_${chosen.id}`,
      duration,
      mods: chosen.mods,
      tickEvery: chosen.tickEvery,
      onTick: chosen.onTick,
      onExpire: (b) => chosen.onExpire?.(b),
    });
    chosen.onApply?.(this, ctx, stats);
    this.activeAdaptations.push(chosen);
    this.announce(`${this.name} ADAPTS: ${chosen.name} — ${chosen.hint}`);
    this.resetAdaptationLog();
  }

  // ---------------- Minions ----------------
  summon(defs, players) {
    for (const d of defs) {
      const mn = new Enemy({ ...d, position: { x: this.position.x + (Math.random() * 6 - 3), y: this.position.y + (Math.random() * 6 - 3) } });
      const alive = players.filter(p => !p.isDead);
      const victim = alive[Math.floor(Math.random() * alive.length)];
      if (victim) mn.addThreat(victim, 1);
      this.minions.push(mn);
    }
  }

  getStatus() {
    return {
      ...super.getStatus(),
      phase: this.phaseIndex + 1,
      phaseName: this.phase?.name,
      adaptations: this.activeAdaptations.map(a => a.name),
      minions: this.minions.length,
    };
  }
}

module.exports = { Boss, MAGIC_SCHOOLS, validateBossDef };