// Mage.js — ranged caster DPS. Cloth, Mana, Intellect.
// Role: big spell damage from range, crowd control, fragile. Most damage has a cast time,
// so moving interrupts it — positioning matters.

const { Character } = require("./Character");

const MAGE_ABILITIES = {
  fireball: {
    name: "Fireball",
    cost: 20, cooldown: 0, castTime: 2.0, range: 35, target: "enemy",
    execute(m, t) {
      const dealt = m.dealDamage(t, 12 + m.int * 1.6, "fire");
      // Leaves a burn: small damage every second for 6s
      t.addBuff({
        id: `burn_${m.name}`, duration: 6, tickEvery: 1,
        onTick: (target) => m.dealDamage(target, m.int * 0.15, "fire"),
      });
      return { damage: dealt };
    },
  },

  frostBolt: {
    name: "Frost Bolt",
    cost: 15, cooldown: 0, castTime: 1.5, range: 35, target: "enemy",
    execute(m, t) {
      const dealt = m.dealDamage(t, 8 + m.int * 1.2, "frost");
      t.addBuff({ id: "chilled", duration: 4, mods: { moveSpeed: 0.6 } });
      return { damage: dealt };
    },
  },

  fireBlast: {
    name: "Fire Blast",
    cost: 15, cooldown: 8, range: 25, target: "enemy", // instant — use while moving
    execute(m, t) {
      return { damage: m.dealDamage(t, 6 + m.int * 0.9, "fire") };
    },
  },

  frostNova: {
    name: "Frost Nova",
    cost: 25, cooldown: 20, target: "self",
    execute(m, t, ctx) {
      const hit = m.enemiesInRange(ctx, 8);
      for (const e of hit) {
        m.dealDamage(e, m.int * 0.4, "frost");
        e.addBuff({ id: "rooted", duration: 5 });
      }
      return { targetsHit: hit.length };
    },
  },

  blink: {
    name: "Blink",
    cost: 10, cooldown: 15, onGcd: false, target: "self",
    // ctx.direction = { x, y } unit vector the player is facing
    execute(m, t, ctx) {
      const dir = ctx.direction || { x: 1, y: 0 };
      m.position.x += dir.x * 15;
      m.position.y += dir.y * 15;
      m.removeBuff("rooted");
      m.removeBuff("chilled");
    },
  },

  counterspell: {
    name: "Counterspell",
    cost: 10, cooldown: 24, onGcd: false, range: 30, target: "enemy",
    execute(m, t) {
      // Interrupt and lock that spell for 4s
      return { interrupted: t.interrupt("counterspelled", 4) };
    },
  },

  manaShield: {
    name: "Mana Shield",
    cost: 40, cooldown: 30, target: "self",
    execute(m) {
      const amount = m.int * 6;
      m.addAbsorb(amount);
      m.addBuff({ id: "manaShield", duration: 10, onExpire: (o) => { o.absorb = Math.max(0, o.absorb - amount); } });
    },
  },

  meteor: {
    name: "Meteor",
    cost: 80, cooldown: 120, castTime: 3.0, range: 40, target: "enemy",
    execute(m, t, ctx) {
      // Lands on the target: big hit to everything in 8m, then burning ground
      const impact = { position: { ...t.position } };
      const hit = m.enemiesInRange(ctx, 8, impact);
      for (const e of hit) m.dealDamage(e, 40 + m.int * 3, "fire");
      m.placeZone({
        position: impact.position, radius: 8, duration: 6, tickEvery: 1,
        onTick: (caster, inside) => inside.forEach(e => caster.dealDamage(e, caster.int * 0.5, "fire")),
      });
      return { targetsHit: hit.length };
    },
  },
};

class Mage extends Character {
  constructor(name, level = 1, position) {
    super(name, level, position, {
      className: "Mage",
      role: "dps",
      armorType: "cloth",
      baseStats: { int: 18, sta: 9, agi: 6, str: 4, faith: 4, armor: 8, crit: 10 },
      statsPerLevel: { int: 2.5, sta: 1, agi: 0.3, armor: 1 },
      hp: { base: 120, perLevel: 12 },
      resource: { name: "Mana", max: 200, regen: 4, startsFull: true },
      weapon: { damage: 5, speed: 2.0, range: 25 }, // wand auto-attack
      abilities: MAGE_ABILITIES,
    });
  }
}

module.exports = { Mage, MAGE_ABILITIES };
