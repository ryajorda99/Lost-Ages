// Druid.js — hybrid: damage AND support. Leather, Mana, Intellect (damage) + Faith (healing).
// Role: deals nature/arcane spell damage most of the time, but can jump in to heal,
// shield the raid, cleanse curses/poisons and give a healer their mana back.
// Weaker than a Mage at pure damage and weaker than a Healer at pure healing —
// the strength is doing both, and covering whatever the raid needs right now.

const { Character } = require("./Character");

const DRUID_ABILITIES = {
  // ---------------- Damage ----------------
  wrath: {
    name: "Wrath",
    cost: 18, cooldown: 0, castTime: 1.5, range: 35, target: "enemy",
    execute(d, t) {
      return { damage: d.dealDamage(t, 12 + d.int * 1.5, "nature") };
    },
  },

  moonfire: {
    name: "Moonfire",
    cost: 15, cooldown: 0, range: 35, target: "enemy",   // instant — great while moving
    execute(d, t) {
      const dealt = d.dealDamage(t, 4 + d.int * 0.4, "arcane");
      t.addBuff({
        id: `moonfire_${d.name}`, duration: 12, tickEvery: 2,
        onTick: (target) => d.dealDamage(target, d.int * 0.3, "arcane"),
      });
      return { damage: dealt };
    },
  },

  starsurge: {
    name: "Starsurge",
    cost: 30, cooldown: 10, castTime: 2.0, range: 35, target: "enemy",
    execute(d, t) {
      return { damage: d.dealDamage(t, 22 + d.int * 2.7, "arcane") };
    },
  },

  // ---------------- Support ----------------
  rejuvenation: {
    name: "Rejuvenation",
    cost: 20, cooldown: 0, range: 40, target: "ally",
    execute(d, t) {
      t.addBuff({
        id: `rejuvenation_${d.name}`, duration: 12, tickEvery: 3,
        onTick: (target) => d.heal(target, 4 + d.faith * 0.8),
      });
    },
  },

  regrowth: {
    name: "Regrowth",
    cost: 35, cooldown: 0, castTime: 1.5, range: 40, target: "ally",
    execute(d, t) {
      const healed = d.heal(t, 12 + d.faith * 2.0);
      t.addBuff({
        id: `regrowth_${d.name}`, duration: 6, tickEvery: 2,
        onTick: (target) => d.heal(target, d.faith * 0.4),
      });
      return { healed };
    },
  },

  tranquility: {
    name: "Tranquility",
    cost: 90, cooldown: 120, castTime: 3.0, target: "self",
    execute(d, t, ctx) {
      // Big raid heal: everyone within 40m
      let total = 0;
      for (const a of d.alliesInRange(ctx, 40)) total += d.heal(a, 12 + d.faith * 2 + a.maxHp * 0.1);
      return { healed: total };
    },
  },

  removeCorruption: {
    name: "Remove Corruption",
    cost: 15, cooldown: 8, range: 40, target: "ally",
    execute(d, t) {
      // Cleanses one curse / poison / magic effect (Doom counts!)
      const bad = t.buffs.find(b => b.dispellable && (b.mustDispel || b.id === "doom")) || t.buffs.find(b => b.dispellable);
      if (bad) t.removeBuff(bad.id);
      return { removed: bad ? bad.id : null };
    },
  },

  innervate: {
    name: "Innervate",
    cost: 0, cooldown: 90, onGcd: false, range: 40, target: "ally",
    requires(d, t) {
      return t.resource.name !== "Mana" ? "target doesn't use mana" : null;
    },
    execute(d, t) {
      // Gives a healer (or any caster) 40% of their mana back
      t.resource.current = Math.min(t.resource.max, t.resource.current + t.resource.max * 0.4);
      t.addBuff({ id: "innervate", duration: 8 });
    },
  },

  markOfTheWild: {
    name: "Mark of the Wild",
    cost: 40, cooldown: 0, target: "self",
    execute(d, t, ctx) {
      // Raid buff: everyone nearby takes 3% less damage and receives 3% more healing
      for (const a of d.alliesInRange(ctx, 40)) {
        a.addBuff({ id: "markOfTheWild", duration: 600, mods: { damageTaken: 0.97, healingTaken: 1.03 } });
      }
    },
  },

  barkskin: {
    name: "Barkskin",
    cost: 0, cooldown: 45, onGcd: false, target: "self",
    execute(d) {
      d.addBuff({ id: "barkskin", duration: 8, mods: { damageTaken: 0.7 } });
    },
  },
};

class Druid extends Character {
  constructor(name, level = 1, position) {
    super(name, level, position, {
      className: "Druid",
      role: "dps",                 // counted as damage, but with a healer's toolkit
      armorType: "leather",
      baseStats: { int: 14, faith: 12, sta: 11, agi: 8, str: 5, armor: 14, crit: 6, haste: 4 },
      statsPerLevel: { int: 2.0, faith: 1.5, sta: 1.1, agi: 0.4, armor: 1.3 },
      hp: { base: 135, perLevel: 13 },
      resource: { name: "Mana", max: 230, regen: 5, startsFull: true },
      weapon: { damage: 6, speed: 2.6, range: 25 },   // casts from range, like a Mage
      abilities: DRUID_ABILITIES,
    });
  }
}

module.exports = { Druid, DRUID_ABILITIES };