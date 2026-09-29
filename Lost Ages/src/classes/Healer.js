// Healer.js — dedicated healer. Cloth, Mana, Faith.
// Role: keep the party alive. Fast small heals vs slow big heals, heal-over-time,
// shields, and a group heal. Can deal some holy damage when nobody needs healing.

const { Character } = require("./Character");
const { makeRevive } = require("./reviveAbility");

const HEALER_ABILITIES = {
  flashHeal: {
    name: "Flash Heal",
    cost: 30, cooldown: 0, castTime: 1.5, range: 40, target: "ally",
    execute(h, t) {
      return { healed: h.heal(t, 15 + h.faith * 2.5) };
    },
  },

  greaterHeal: {
    name: "Greater Heal",
    cost: 50, cooldown: 0, castTime: 3.0, range: 40, target: "ally",
    execute(h, t) {
      return { healed: h.heal(t, 30 + h.faith * 5) }; // more mana-efficient, but slow
    },
  },

  renew: {
    name: "Renew",
    cost: 20, cooldown: 0, range: 40, target: "ally",
    execute(h, t) {
      t.addBuff({
        id: `renew_${h.name}`, duration: 12, tickEvery: 3,
        onTick: (target) => h.heal(target, 5 + h.faith * 0.8),
      });
    },
  },

  holyWard: {
    name: "Holy Ward",
    cost: 35, cooldown: 6, range: 40, target: "ally",
    requires(h, t) {
      return (t || h).hasBuff("wardWeakened") ? "target was warded recently" : null;
    },
    execute(h, t) {
      const amount = 20 + h.faith * 3;
      t.addAbsorb(amount);
      t.addBuff({ id: "holyWard", duration: 15, onExpire: (o) => { o.absorb = Math.max(0, o.absorb - amount); } });
      t.addBuff({ id: "wardWeakened", duration: 15 });
    },
  },

  smite: {
    name: "Smite",
    cost: 20, cooldown: 0, castTime: 2.0, range: 30, target: "enemy",
    execute(h, t) {
      return { damage: h.dealDamage(t, 8 + h.faith * 1.1, "holy") };
    },
  },

  prayerOfMending: {
    name: "Prayer of Mending",
    cost: 70, cooldown: 12, castTime: 2.5, target: "self",
    execute(h, t, ctx) {
      // Heals everyone in the party within 30m
      const targets = h.alliesInRange(ctx, 30);
      let total = 0;
      for (const a of targets) total += h.heal(a, 10 + h.faith * 1.5);
      return { healed: total, targetsHit: targets.length };
    },
  },

  purify: {
    name: "Purify",
    cost: 15, cooldown: 8, range: 40, target: "ally",
    execute(h, t) {
      // Removes one harmful effect
      const bad = t.buffs.find(b => b.dispellable);
      if (bad) t.removeBuff(bad.id);
      return { removed: bad ? bad.id : null };
    },
  },

  divineHymn: {
    name: "Divine Hymn",
    cost: 100, cooldown: 180, onGcd: false, target: "self",
    execute(h, t, ctx) {
      // Ultimate: heals the whole party for 30% max HP and boosts healing they receive for 10s
      for (const a of h.alliesInRange(ctx, 40)) {
        h.heal(a, a.maxHp * 0.3);
        a.addBuff({ id: "divineHymn", duration: 10, mods: { healingTaken: 1.2 } });
      }
    },
  },

  // Brings a dead player back with 40% health and 40% of their resource.
  // In raids this uses one of the raid's 4 shared revives.
  resurrection: makeRevive({ name: "Resurrection", castTime: 3.0, hpPct: 0.4, resourcePct: 0.4 }),
};

class Healer extends Character {
  constructor(name, level = 1, position) {
    super(name, level, position, {
      className: "Healer",
      role: "healer",
      armorType: "cloth",
      baseStats: { faith: 18, sta: 11, int: 8, agi: 5, str: 4, armor: 10, haste: 5 },
      statsPerLevel: { faith: 2.5, sta: 1, int: 1, armor: 1 },
      hp: { base: 130, perLevel: 13 },
      resource: { name: "Mana", max: 250, regen: 6, startsFull: true },
      weapon: { damage: 6, speed: 2.6 },
      abilities: HEALER_ABILITIES,
    });
  }
}

module.exports = { Healer, HEALER_ABILITIES };