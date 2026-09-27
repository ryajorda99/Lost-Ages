// Rogue.js — melee DPS. Leather, Energy + Combo Points, Agility.
// Builders (Sinister Strike, Ambush) add combo points; finishers (Eviscerate) spend them.
// Energy refills fast, so the Rogue presses buttons constantly. Stealth opens fights.

const { Character, MELEE_RANGE } = require("./Character");

const MAX_COMBO = 5;

const ROGUE_ABILITIES = {
  stealth: {
    name: "Stealth",
    cost: 0, cooldown: 6, onGcd: false, target: "self",
    requires(r) {
      return r.inCombat ? "can't stealth in combat" : null;
    },
    execute(r) {
      r.addBuff({ id: "stealth", duration: Infinity, mods: { moveSpeed: 0.8 } });
    },
  },

  ambush: {
    name: "Ambush",
    cost: 50, cooldown: 0, range: MELEE_RANGE, target: "enemy",
    requires(r) {
      return r.hasBuff("stealth") ? null : "must be in stealth";
    },
    execute(r, t) {
      r.removeBuff("stealth");
      const dealt = r.dealDamage(t, r.weaponDamage * 2.5 + r.agi * 1.2, "physical");
      r.addCombo(2);
      return { damage: dealt };
    },
  },

  sinisterStrike: {
    name: "Sinister Strike",
    cost: 40, cooldown: 0, range: MELEE_RANGE, target: "enemy",
    execute(r, t) {
      const dealt = r.dealDamage(t, r.weaponDamage * 1.2 + r.agi * 0.6, "physical");
      r.addCombo(1);
      return { damage: dealt };
    },
  },

  eviscerate: {
    name: "Eviscerate",
    cost: 35, cooldown: 0, range: MELEE_RANGE, target: "enemy",
    requires(r) {
      return r.comboPoints > 0 ? null : "no combo points";
    },
    execute(r, t) {
      const cp = r.comboPoints;
      r.comboPoints = 0;
      return { damage: r.dealDamage(t, cp * (8 + r.agi * 0.7), "physical"), comboPointsUsed: cp };
    },
  },

  kick: {
    name: "Kick",
    cost: 25, cooldown: 15, onGcd: false, range: MELEE_RANGE, target: "enemy",
    execute(r, t) {
      return { interrupted: t.interrupt("kicked", 4) };
    },
  },

  evasion: {
    name: "Evasion",
    cost: 0, cooldown: 120, onGcd: false, target: "self",
    execute(r) {
      r.addBuff({ id: "evasion", duration: 10, mods: { dodgeBonus: 1.5 } }); // +50% dodge
    },
  },

  vanish: {
    name: "Vanish",
    cost: 0, cooldown: 120, onGcd: false, target: "self",
    execute(r, t, ctx) {
      // Drop all threat and re-enter stealth mid-fight
      for (const e of ctx.enemies || []) e.threat?.delete(r);
      r.inCombat = false;
      r.addBuff({ id: "stealth", duration: Infinity, mods: { moveSpeed: 0.8 } });
    },
  },

  deathMark: {
    name: "Death Mark",
    cost: 30, cooldown: 90, range: MELEE_RANGE, target: "enemy",
    execute(r, t) {
      // Ultimate: target takes 25% more damage from everyone for 10s, +5 combo points
      t.addBuff({ id: "deathMark", duration: 10, mods: { damageTaken: 1.25 } });
      r.addCombo(MAX_COMBO);
    },
  },
};

class Rogue extends Character {
  constructor(name, level = 1, position) {
    super(name, level, position, {
      className: "Rogue",
      role: "dps",
      armorType: "leather",
      baseStats: { agi: 18, sta: 12, str: 8, faith: 0, armor: 14, crit: 20 },
      statsPerLevel: { agi: 2.5, sta: 1.2, str: 0.5, armor: 2 },
      hp: { base: 140, perLevel: 14 },
      resource: { name: "Energy", max: 100, regen: 10, startsFull: true },
      weapon: { damage: 9, speed: 1.6 }, // fast daggers
      abilities: ROGUE_ABILITIES,
    });
    this.comboPoints = 0;
  }

  addCombo(n) {
    this.comboPoints = Math.min(MAX_COMBO, this.comboPoints + n);
  }

  onDealDamage() {
    this.removeBuff("stealth"); // any attack breaks stealth
  }

  getStatus() {
    return { ...super.getStatus(), comboPoints: this.comboPoints };
  }
}

module.exports = { Rogue, ROGUE_ABILITIES };
