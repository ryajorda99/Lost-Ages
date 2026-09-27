// Warrior.js — melee DPS. Plate, Rage, Strength.
// Rage starts at 0, builds from hitting and getting hit, and drains out of combat.
// Role: highest sustained melee damage, gap closer, strong execute phase.

const { Character, MELEE_RANGE, distance } = require("./Character");

const WARRIOR_ABILITIES = {
  charge: {
    name: "Charge",
    cost: 0, cooldown: 15, onGcd: false, range: 25, target: "enemy",
    requires(w, t) {
      return t && distance(w, t) < 8 ? "too close to charge" : null;
    },
    execute(w, t) {
      // Rush to the target, stun it for 1s, gain rage
      const d = distance(w, t);
      w.position.x += ((t.position.x - w.position.x) / d) * (d - 2);
      w.position.y += ((t.position.y - w.position.y) / d) * (d - 2);
      t.stunned = Math.max(t.stunned, 1);
      w.gainRage(20);
      w.enterCombat();
    },
  },

  heroicStrike: {
    name: "Heroic Strike",
    cost: 15, cooldown: 0, range: MELEE_RANGE, target: "enemy",
    execute(w, t) {
      return { damage: w.dealDamage(t, w.weaponDamage * 1.4 + w.str * 0.6, "physical") };
    },
  },

  mortalStrike: {
    name: "Mortal Strike",
    cost: 30, cooldown: 6, range: MELEE_RANGE, target: "enemy",
    execute(w, t) {
      const dealt = w.dealDamage(t, w.weaponDamage * 2 + w.str * 0.9, "physical");
      t.addBuff({ id: "mortalWound", duration: 8, mods: { healingTaken: 0.5 } }); // halves healing
      return { damage: dealt };
    },
  },

  whirlwind: {
    name: "Whirlwind",
    cost: 25, cooldown: 8, target: "self",
    execute(w, t, ctx) {
      const hit = w.enemiesInRange(ctx, 8);
      for (const e of hit) w.dealDamage(e, w.weaponDamage + w.str * 0.5, "physical");
      return { targetsHit: hit.length };
    },
  },

  execute: {
    name: "Execute",
    cost: 15, cooldown: 0, range: MELEE_RANGE, target: "enemy",
    requires(w, t) {
      return t && t.hp / t.maxHp > 0.2 ? "target must be below 20% health" : null;
    },
    execute(w, t) {
      // Spends up to 30 extra rage for more damage
      const extra = Math.min(30, w.resource.current);
      w.resource.current -= extra;
      return { damage: w.dealDamage(t, w.weaponDamage * 2 + w.str + extra * 2, "physical") };
    },
  },

  pummel: {
    name: "Pummel",
    cost: 10, cooldown: 15, onGcd: false, range: MELEE_RANGE, target: "enemy",
    execute(w, t) {
      return { interrupted: t.interrupt("pummeled", 4) };
    },
  },

  battleShout: {
    name: "Battle Shout",
    cost: 0, cooldown: 30, target: "self",
    execute(w, t, ctx) {
      for (const a of w.alliesInRange(ctx, 30)) {
        a.addBuff({ id: "battleShout", duration: 60, mods: { damageDealt: 1.05 } });
      }
      w.gainRage(10);
    },
  },

  recklessness: {
    name: "Recklessness",
    cost: 0, cooldown: 180, onGcd: false, target: "self",
    execute(w) {
      // Ultimate: +30% damage and +25% crit for 12s, but take 10% more damage
      w.addBuff({ id: "recklessness", duration: 12, mods: { damageDealt: 1.3, critBonus: 1.25, damageTaken: 1.1 } });
    },
  },
};

class Warrior extends Character {
  constructor(name, level = 1, position) {
    super(name, level, position, {
      className: "Warrior",
      role: "dps",
      armorType: "plate",
      baseStats: { str: 18, sta: 14, agi: 8, faith: 0, armor: 22, crit: 12 },
      statsPerLevel: { str: 2.5, sta: 1.5, agi: 0.5, armor: 3 },
      hp: { base: 170, perLevel: 17 },
      resource: { name: "Rage", max: 100, regen: 0, startsFull: false, decayOutOfCombat: 3 },
      weapon: { damage: 24, speed: 3.0 }, // slow, heavy weapon — big hits
      abilities: WARRIOR_ABILITIES,
    });
  }

  gainRage(n) {
    this.resource.current = Math.min(this.resource.max, this.resource.current + n);
  }

  onAutoAttackHit(t, dealt) {
    this.gainRage(12 + dealt * 0.15);
  }

  onTakeDamage(amount) {
    this.gainRage(amount * 0.15);
  }
}

module.exports = { Warrior, WARRIOR_ABILITIES };
