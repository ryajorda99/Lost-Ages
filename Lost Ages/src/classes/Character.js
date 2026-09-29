// Character.js — shared base class for every playable class (and enemies).
// Holds everything that works the same for all classes:
//   stats, HP, resource (mana / rage / energy / holy power), global cooldown,
//   ability cooldowns, cast times, auto-attack, buffs & debuffs (incl. DoTs/HoTs),
//   damage, healing, absorb shields, threat and death.
//
// Each class file (Knight.js, Mage.js...) only has to describe its own
// stats, resource and abilities.

const GCD = 1.5;         // global cooldown in seconds
const MELEE_RANGE = 5;   // meters

// Players and enemies are on opposite sides
function isHostile(a, b) {
  return !!a.isEnemy !== !!b.isEnemy;
}

function distance(a, b) {
  const dx = a.position.x - b.position.x;
  const dy = a.position.y - b.position.y;
  const dz = (a.position.z || 0) - (b.position.z || 0);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

class Character {
  /**
   * @param {string} name
   * @param {number} level
   * @param {{x:number,y:number,z?:number}} position
   * @param {object} config  — provided by the subclass (see Knight.js for an example)
   */
  constructor(name, level = 1, position = { x: 0, y: 0, z: 0 }, config) {
    this.name = name;
    this.level = level;
    this.position = { z: 0, ...position };
    this.className = config.className;
    this.role = config.role;              // "tank" | "dps" | "healer"
    this.armorType = config.armorType;    // used by the gear system
    this.abilities = config.abilities;

    // Stats = level 1 stats + growth per level (gear adds on top of these)
    this.baseStats = config.baseStats;
    this.statsPerLevel = config.statsPerLevel || {};
    Object.assign(this, {
      str: 0, sta: 0, agi: 0, int: 0, faith: 0,
      armor: 0, crit: 0, haste: 0, blockChance: 0,
    }, config.baseStats);
    for (const [k, v] of Object.entries(this.statsPerLevel)) this[k] += Math.round(v * (level - 1));
    this.canBlock = !!config.canBlock;    // shield users only

    // HP
    this.hpBase = config.hp.base;
    this.hpPerLevel = config.hp.perLevel;
    this.maxHp = this.hpBase + this.hpPerLevel * (level - 1);
    this.hp = this.maxHp;

    // Resource
    const r = config.resource;
    this.resource = {
      name: r.name,
      max: r.max,
      current: r.startsFull ? r.max : 0,
      regen: r.regen || 0,             // per second
      decayOutOfCombat: r.decayOutOfCombat || 0,
    };

    // Weapon / auto-attack
    this.weaponDamage = config.weapon.damage;
    this.weaponSpeed = config.weapon.speed;
    this.attackRange = config.weapon.range ?? MELEE_RANGE;
    this.swingTimer = 0;

    this.threatMultiplier = config.threatMultiplier ?? 1;

    // Runtime state
    this.target = null;
    this.inCombat = false;
    this.combatTimer = 0;       // leaves combat 5s after last hit
    this.gcdRemaining = 0;
    this.cooldowns = {};
    this.cast = null;           // { key, target, ctx, remaining, total }
    this.buffs = [];            // buffs AND debuffs
    this.absorb = 0;            // total absorb shield
    this.zones = [];            // ground effects this character placed
    this.stunned = 0;
    this.isDead = false;
  }

  // =====================================================================
  //  MAIN TICK — call every server tick. ctx = { allies, enemies, world }
  // =====================================================================
  update(dt, ctx = {}) {
    if (this.isDead) return;

    // Timers
    this.gcdRemaining = Math.max(0, this.gcdRemaining - dt);
    this.stunned = Math.max(0, this.stunned - dt);
    for (const k in this.cooldowns) this.cooldowns[k] = Math.max(0, this.cooldowns[k] - dt);

    // Combat state
    if (this.inCombat) {
      this.combatTimer -= dt;
      if (this.combatTimer <= 0) this.inCombat = false;
    }

    // Resource regen / decay (rage drains out of combat)
    const res = this.resource;
    if (!this.inCombat && res.decayOutOfCombat) {
      res.current = Math.max(0, res.current - res.decayOutOfCombat * dt);
    } else {
      res.current = Math.min(res.max, res.current + res.regen * dt);
    }

    this.tickBuffs(dt, ctx);
    this.tickZones(dt, ctx);
    this.tickCast(dt, ctx);
    this.tickAutoAttack(dt, ctx);
  }

  // =====================================================================
  //  ABILITIES
  // =====================================================================
  /**
   * Use an ability by key, e.g. knight.use("judgment") — bind this to your hotkeys.
   * Returns { ok: true } or { ok: false, reason } so the UI can show an error.
   */
  use(key, target = this.target, ctx = {}) {
    const a = this.abilities[key];
    if (!a) return { ok: false, reason: "unknown ability" };

    // Self abilities always hit you. Friendly abilities hit you if you're targeting an enemy (like WoW).
    if (a.target === "self") target = this;
    if (a.target === "ally" && (!target || isHostile(this, target))) target = this;

    const check = this.canUse(key, target, ctx);
    if (!check.ok) return check;

    // Using an instant off-GCD ability (interrupt, defensive) stops your own cast, like in WoW
    if (this.cast && a.onGcd === false && !(a.castTime > 0)) this.interrupt("cancelled");

    if (a.onGcd !== false) this.gcdRemaining = GCD / (1 + this.haste / 100);

    // Cast-time abilities: start casting, pay cost/cooldown when the cast finishes
    if (a.castTime > 0) {
      const time = a.castTime / (1 + this.haste / 100);
      this.cast = { key, target, ctx, remaining: time, total: time };
      return { ok: true, casting: true, castTime: time };
    }
    return this.finishAbility(key, target, ctx);
  }

  canUse(key, target, ctx) {
    const a = this.abilities[key];
    if (this.isDead) return { ok: false, reason: "dead" };
    if (this.stunned > 0) return { ok: false, reason: "stunned" };
    // You can't start a new cast while casting — but instant off-GCD abilities are allowed
    if (this.cast && !(a.onGcd === false && !(a.castTime > 0))) return { ok: false, reason: "already casting" };
    if (a.onGcd !== false && this.gcdRemaining > 0) return { ok: false, reason: "gcd" };
    if ((this.cooldowns[key] || 0) > 0) return { ok: false, reason: "cooldown" };
    if (this.resource.current < (a.cost || 0)) return { ok: false, reason: `not enough ${this.resource.name}` };

    if (a.target === "enemy") {
      if (!target || target.isDead) return { ok: false, reason: "no target" };
      if (!isHostile(this, target)) return { ok: false, reason: "invalid target" };
    }
    if (a.target === "ally" && target.isDead) return { ok: false, reason: "target is dead" };
    if (a.target === "deadAlly") {   // revives: only on a dead friend
      if (!target || target === this || isHostile(this, target)) return { ok: false, reason: "invalid target" };
      if (!target.isDead) return { ok: false, reason: "target is alive" };
    }
    if (a.range && target && target !== this && distance(this, target) > a.range) {
      return { ok: false, reason: "out of range" };
    }
    if (a.requires) {
      const why = a.requires(this, target, ctx); // returns an error string or null
      if (why) return { ok: false, reason: why };
    }
    return { ok: true };
  }

  finishAbility(key, target, ctx) {
    const a = this.abilities[key];
    // Target may have died or moved during the cast
    if (a.target === "enemy" && (!target || target.isDead)) return { ok: false, reason: "target died" };
    if (this.resource.current < (a.cost || 0)) return { ok: false, reason: `not enough ${this.resource.name}` };

    this.resource.current -= a.cost || 0;
    this.cooldowns[key] = a.cooldown || 0;
    const result = a.execute(this, target, ctx) || {};
    this.onAbilityUsed?.(key, target, result);   // lets the 3D viewer play the animation + effect
    return { ok: true, ...result };
  }

  tickCast(dt, ctx) {
    if (!this.cast) return;
    if (this.stunned > 0) return this.interrupt("stunned");
    this.cast.remaining -= dt;
    if (this.cast.remaining <= 0) {
      const { key, target, ctx: castCtx } = this.cast;
      this.cast = null;
      const res = this.finishAbility(key, target, { ...ctx, ...castCtx });
      this.onCastComplete?.(key, res);
    }
  }

  interrupt(reason = "interrupted", lockout = 0) {
    if (!this.cast) return false;
    const key = this.cast.key;
    this.cast = null;
    if (lockout) this.cooldowns[key] = Math.max(this.cooldowns[key] || 0, lockout);
    this.onInterrupted?.(key, reason);
    return true;
  }

  // Moving cancels casts, like WoW / FFXIV
  move(dx, dy, dz = 0) {
    if (this.isDead || this.stunned > 0 || this.hasBuff("rooted")) return false;
    const speed = this.getMod("moveSpeed");
    this.position.x += dx * speed;
    this.position.y += dy * speed;
    this.position.z += dz * speed;
    if (this.cast) this.interrupt("moved");
    return true;
  }

  // =====================================================================
  //  AUTO-ATTACK
  // =====================================================================
  setTarget(t) {
    this.target = t;
  }

  tickAutoAttack(dt, ctx) {
    const t = this.target;
    if (!this.inCombat || !t || t.isDead || !isHostile(this, t) || this.cast || this.stunned > 0) {
      this.swingTimer = Math.max(0, this.swingTimer - dt);
      return;
    }
    this.swingTimer -= dt;
    if (this.swingTimer <= 0 && distance(this, t) <= this.attackRange) {
      const dmg = this.weaponDamage + this.str * 0.3 + this.agi * 0.3;
      const dealt = this.dealDamage(t, dmg, "physical");
      this.onAutoAttackHit?.(t, dealt, ctx);
      this.onSwing?.(t);                          // lets the 3D viewer play a swing animation
      this.swingTimer = this.weaponSpeed / (1 + this.haste / 100);
    }
  }

  // =====================================================================
  //  DAMAGE, HEALING, THREAT
  // =====================================================================
  critChance() {
    return Math.min(0.75, 0.05 + this.crit / 400 + this.agi / 1000 + (this.getMod("critBonus") - 1));
  }

  dealDamage(target, amount, school = "physical") {
    if (target.isDead) return 0;
    let dmg = amount * this.getMod("damageDealt");
    const crit = Math.random() < this.critChance();
    if (crit) dmg *= 2;

    const dealt = target.takeDamage(dmg, this, school);
    target.addThreat?.(this, dealt * this.threatMultiplier);
    this.enterCombat();
    this.onDealDamage?.(target, dealt, crit);
    return dealt;
  }

  takeDamage(amount, source = null, school = "physical") {
    if (this.isDead) return 0;

    const dodge = Math.min(0.3, this.agi / 1000 + (this.getMod("dodgeBonus") - 1));
    if (school === "physical" && Math.random() < dodge) return 0;
    if (school === "physical" && this.canBlock && Math.random() < this.blockChance) amount *= 0.5;
    if (school === "physical") amount *= 100 / (100 + this.armor);
    amount *= this.getMod("damageTaken");
    amount *= this.getMod(`damageTaken_${school}`); // per-school resist, e.g. damageTaken_fire: 0.5

    if (this.absorb > 0) {
      const soaked = Math.min(this.absorb, amount);
      this.absorb -= soaked;
      amount -= soaked;
    }

    this.hp = Math.max(0, this.hp - amount);
    this.enterCombat();
    this.removeBuff("stealth"); // taking damage breaks stealth
    this.onTakeDamage?.(amount, source);
    if (this.hp <= 0) this.die(source);
    return amount;
  }

  heal(target, amount) {
    if (target.isDead) return 0;
    let value = amount * this.getMod("healingDone") * target.getMod("healingTaken");
    if (Math.random() < this.critChance()) value *= 1.5;
    const before = target.hp;
    target.hp = Math.min(target.maxHp, target.hp + value);
    return target.hp - before;
  }

  addAbsorb(amount) {
    this.absorb += amount;
  }

  enterCombat() {
    this.inCombat = true;
    this.combatTimer = 5;
  }

  die(killer) {
    this.isDead = true;
    this.cast = null;
    this.buffs = [];
    this.onDeath?.(killer);
  }

  revive(hpPct = 0.5) {
    this.isDead = false;
    this.hp = Math.round(this.maxHp * hpPct);
  }

  // =====================================================================
  //  BUFFS / DEBUFFS
  //  { id, duration, mods: { damageTaken: 0.6, moveSpeed: 0.5 ... },
  //    tickEvery, onTick(owner, ctx), onExpire(owner), source }
  // =====================================================================
  addBuff(buff) {
    this.removeBuff(buff.id); // re-applying refreshes it
    this.buffs.push({ tickTimer: buff.tickEvery || 0, ...buff, remaining: buff.duration });
  }

  removeBuff(id) {
    const i = this.buffs.findIndex(b => b.id === id);
    if (i === -1) return false;
    const [b] = this.buffs.splice(i, 1);
    b.onExpire?.(this);
    return true;
  }

  hasBuff(id) {
    return this.buffs.some(b => b.id === id);
  }

  // Multiplies every active buff's modifier for a stat (1 = no change)
  getMod(stat) {
    let m = 1;
    for (const b of this.buffs) if (b.mods && b.mods[stat] != null) m *= b.mods[stat];
    return m;
  }

  tickBuffs(dt, ctx) {
    for (const b of [...this.buffs]) {
      if (b.tickEvery) {
        b.tickTimer -= dt;
        if (b.tickTimer <= 0) {
          b.onTick?.(this, ctx);
          b.tickTimer += b.tickEvery;
        }
      }
      if (b.duration !== Infinity) {
        b.remaining -= dt;
        if (b.remaining <= 0) this.removeBuff(b.id);
      }
    }
  }

  // =====================================================================
  //  GROUND ZONES (Holy Grounds, Meteor fire, etc.)
  //  { position, radius, duration, tickEvery, onTick(caster, enemiesInside, ctx) }
  // =====================================================================
  placeZone(zone) {
    this.zones.push({ ...zone, remaining: zone.duration, tickTimer: 0 });
  }

  tickZones(dt, ctx) {
    const enemies = ctx.enemies || [];
    for (const z of this.zones) {
      z.remaining -= dt;
      z.tickTimer -= dt;
      if (z.tickTimer <= 0) {
        const inside = enemies.filter(e => !e.isDead && distance({ position: z.position }, e) <= z.radius);
        z.onTick(this, inside, ctx);
        z.tickTimer += z.tickEvery;
      }
    }
    this.zones = this.zones.filter(z => z.remaining > 0);
  }

  // =====================================================================
  //  HELPERS
  // =====================================================================
  enemiesInRange(ctx, range, from = this) {
    return (ctx.enemies || []).filter(e => !e.isDead && distance(from, e) <= range);
  }

  alliesInRange(ctx, range) {
    return [this, ...(ctx.allies || [])].filter(a => !a.isDead && distance(this, a) <= range);
  }

  levelUp() {
    this.level++;
    // Grow stats. Rounding is based on total level so fractional growth (e.g. 1.5/level) adds up correctly.
    for (const [k, v] of Object.entries(this.statsPerLevel)) {
      this[k] += Math.round(v * (this.level - 1)) - Math.round(v * (this.level - 2));
    }
    this.maxHp += this.hpPerLevel;
    this.hp = this.maxHp;
  }

  // What your client UI needs each frame
  getStatus() {
    return {
      name: this.name,
      className: this.className,
      level: this.level,
      hp: Math.round(this.hp),
      maxHp: this.maxHp,
      resource: { name: this.resource.name, current: Math.floor(this.resource.current), max: this.resource.max },
      casting: this.cast ? { ability: this.abilities[this.cast.key].name, progress: 1 - this.cast.remaining / this.cast.total } : null,
      gcd: +this.gcdRemaining.toFixed(2),
      cooldowns: Object.fromEntries(Object.entries(this.cooldowns).filter(([, v]) => v > 0).map(([k, v]) => [k, +v.toFixed(1)])),
      buffs: this.buffs.map(b => ({ id: b.id, remaining: +b.remaining.toFixed(1) })),
    };
  }

  // What you save to MongoDB (not the runtime combat state)
  toJSON() {
    return {
      name: this.name,
      className: this.className,
      level: this.level,
      position: this.position,
    };
  }
}

module.exports = { Character, distance, isHostile, GCD, MELEE_RANGE };