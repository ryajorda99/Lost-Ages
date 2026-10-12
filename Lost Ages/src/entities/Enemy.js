// Enemy.js — mobs and bosses. Built on the same Character base as players,
// so buffs, debuffs, stuns, roots, casts and interrupts all work on them automatically.

const { Character, distance } = require("../classes/Character");

class Enemy extends Character {
  /**
   * @param {object} o  { name, level, position, hp, damage, attackSpeed, armor, type, elite, abilities }
   */
  constructor(o) {
    super(o.name, o.level || 1, o.position, {
      className: "Enemy",
      role: "enemy",
      baseStats: { str: o.level * 2 || 2, sta: 0, armor: o.armor ?? o.level * 3 },
      hp: { base: o.hp, perLevel: 0 },
      resource: { name: "Energy", max: 100, regen: 10, startsFull: true },
      weapon: { damage: o.damage, speed: o.attackSpeed || 2.0, range: o.attackRange },
      abilities: o.abilities || {},
    });
    this.isEnemy = true;
    this.type = o.type || "beast";   // "undead" / "demon" matter for Holy Grounds
    this.elite = !!o.elite;
    this.threat = new Map();         // player -> threat amount
    this.forcedTarget = null;
    this.forcedTimer = 0;
    // OATH: a tank has locked this enemy onto themselves (see Knight's Guardian's Oath).
    // While the oath holds, this enemy ONLY attacks that tank — damage dealers can't pull it off.
    this.oath = null;                // { holder, remaining }
  }

  /**
   * Lock this enemy onto a tank for `seconds`.
   * force = true (a taunt) steals the oath from another tank — that's how tank swaps work.
   * Without force, a tank can only refresh their own oath (or claim an enemy nobody holds).
   */
  bindOath(tank, seconds, { force = false } = {}) {
    const current = this.oath && this.oath.remaining > 0 && !this.oath.holder.isDead ? this.oath.holder : null;
    if (!force && current && current !== tank) return false;
    this.oath = { holder: tank, remaining: seconds };
    return true;
  }

  oathHolder() {
    return this.oath && this.oath.remaining > 0 && !this.oath.holder.isDead ? this.oath.holder : null;
  }

  addThreat(source, amount, opts = {}) {
    const cur = this.threat.get(source) || 0;
    if (opts.matchTop) {
      const top = Math.max(0, ...this.threat.values());
      this.threat.set(source, Math.max(cur, top) + amount);
    } else {
      this.threat.set(source, cur + amount);
    }
    this.enterCombat();
  }

  forceTarget(source, seconds) {
    this.forcedTarget = source;
    this.forcedTimer = seconds;
  }

  // Who the enemy attacks: taunter first, then the tank holding its oath, otherwise highest threat.
  // Summoned servants (a Necromancer's skeletons) aren't bound by a tank's oath: one that has made
  // the enemy angrier than the oath-holder (10% more threat) pulls it off until it dies.
  pickTarget() {
    if (this.forcedTimer > 0 && this.forcedTarget?.isDead && this.forcedTarget.isPet) {
      // provoked by a summoned pack (Necromancer's servants): when one falls, go for the next nearest
      const owner = this.forcedTarget.owner;
      let next = null, best = Infinity;
      for (const p of this.threat.keys()) if (p.isPet && !p.isDead && p.owner === owner) { const d = distance(this, p); if (d < best) { best = d; next = p; } }
      if (next) this.forcedTarget = next;
    }
    if (this.forcedTimer > 0 && !this.forcedTarget.isDead) return this.forcedTarget;
    const oath = this.oathHolder();
    if (oath) {
      let pet = null, petThreat = (this.threat.get(oath) || 0) * 1.1;
      for (const [p, t] of this.threat) if (p.isPet && !p.isDead && t > petThreat) { pet = p; petThreat = t; }
      return pet || oath;
    }
    let best = null, bestThreat = -1;
    for (const [p, t] of this.threat) {
      if (!p.isDead && t > bestThreat) { best = p; bestThreat = t; }
    }
    return best;
  }

  update(dt, ctx = {}) {
    if (this.isDead) return;
    this.forcedTimer = Math.max(0, this.forcedTimer - dt);
    if (this.oath) this.oath.remaining -= dt;
    this.target = this.pickTarget();

    // Very simple AI: walk toward the target, then auto-attack (Character handles the swing)
    if (this.target && !this.cast && !this.stunned && !this.hasBuff("rooted")) {
      const d = distance(this, this.target);
      if (d > this.attackRange) {
        const step = Math.min(d - this.attackRange + 0.1, 6 * dt); // 6 m/s
        this.move(((this.target.position.x - this.position.x) / d) * step,
                  ((this.target.position.y - this.position.y) / d) * step);
      }
    }
    super.update(dt, ctx);
  }
}

module.exports = { Enemy };