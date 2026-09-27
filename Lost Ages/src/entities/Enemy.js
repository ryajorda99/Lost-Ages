// Enemy.js — mobs and bosses. Built on the same Character base as players,
// so buffs, debuffs, stuns, roots, casts and interrupts all work on them automatically.

const { Character, distance } = require("../classes/Character")

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

  // Who the enemy attacks: taunter first, otherwise highest threat
  pickTarget() {
    if (this.forcedTimer > 0 && !this.forcedTarget.isDead) return this.forcedTarget;
    let best = null, bestThreat = -1;
    for (const [p, t] of this.threat) {
      if (!p.isDead && t > bestThreat) { best = p; bestThreat = t; }
    }
    return best;
  }

  update(dt, ctx = {}) {
    if (this.isDead) return;
    this.forcedTimer = Math.max(0, this.forcedTimer - dt);
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
