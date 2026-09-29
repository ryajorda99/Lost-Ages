// Knight.js — holy tank (paladin). Plate, shield, Holy Power.
// Role: hold aggro, survive, light self-healing and party support.

const { Character, MELEE_RANGE } = require("./Character");

// How long Guardian's Oath holds an enemy after the Knight's last hit (seconds)
const OATH_DURATION = 8;

const KNIGHT_ABILITIES = {
  righteousStrike: {
    name: "Righteous Strike",
    cost: 15, cooldown: 0, range: MELEE_RANGE, target: "enemy",
    execute(k, t) {
      const dmg = k.weaponDamage * 1.1 + k.str * 0.5 + k.faith * 0.2;
      const dealt = k.dealDamage(t, dmg, "physical");
      // Judgment mark: heal for 30% of the hit
      if (t.hasBuff(`judged_${k.name}`)) {
        k.heal(k, dealt * 0.3);
        t.removeBuff(`judged_${k.name}`);
      }
      return { damage: dealt };
    },
  },

  shieldOfValor: {
    name: "Shield of Valor",
    cost: 30, cooldown: 12, onGcd: false, target: "self",
    execute(k) {
      const amount = k.sta * 7.5;
      k.addAbsorb(amount);
      k.addBuff({ id: "shieldOfValor", duration: 6, onExpire: (o) => { o.absorb = Math.max(0, o.absorb - amount); } });
      return { absorb: amount };
    },
  },

  divineTaunt: {
    name: "Divine Taunt",
    cost: 0, cooldown: 8, onGcd: false, range: 25, target: "enemy",
    execute(k, t) {
      t.forceTarget?.(k, 4);
      t.addThreat?.(k, 0, { matchTop: true });
      t.bindOath?.(k, OATH_DURATION, { force: true });   // taunting takes the oath from the other tank
    },
  },

  // CHALLENGE — the Knight's big aggro button.
  // Every enemy within 12m is forced to attack the Knight for 6s and becomes oath-bound to them.
  challenge: {
    name: "Challenge",
    cost: 20, cooldown: 20, onGcd: false, target: "self",
    execute(k, t, ctx) {
      // Never steals an enemy the OTHER tank is holding — only a taunt does that (tank swaps)
      const grabbed = k.enemiesInRange(ctx, 12).filter(e => {
        const holder = e.oathHolder?.();
        return !holder || holder === k || holder.role !== "tank";
      });
      for (const e of grabbed) {
        e.forceTarget?.(k, 6);
        e.addThreat?.(k, 0, { matchTop: true });
        e.bindOath?.(k, OATH_DURATION, { force: true });
      }
      return { grabbed: grabbed.length };
    },
  },

  holyTouch: {
    name: "Holy Touch",
    cost: 60, cooldown: 90, onGcd: false, range: 30, target: "ally",
    requires(k, t) {
      return (t || k).hasBuff("holyTouchImmune") ? "target recently received Holy Touch" : null;
    },
    execute(k, t) {
      t = t || k;
      const healed = k.heal(t, t.maxHp * 0.4);
      t.addBuff({ id: "holyTouchImmune", duration: 180 }); // can't get it again for 3 min
      return { healed };
    },
  },

  holyGrounds: {
    name: "Holy Grounds",
    cost: 40, cooldown: 15, target: "self",
    execute(k) {
      k.placeZone({
        position: { ...k.position }, radius: 5, duration: 10, tickEvery: 1,
        onTick(caster, inside) {
          for (const e of inside) {
            caster.dealDamage(e, caster.faith * 0.4, "holy");
            if (e.type === "undead" || e.type === "demon") {
              e.addBuff({ id: "holyGroundsSlow", duration: 1.5, mods: { moveSpeed: 0.7 } });
            }
          }
        },
      });
    },
  },

  judgment: {
    name: "Judgment",
    cost: 25, cooldown: 10, range: 20, target: "enemy",
    execute(k, t) {
      const dealt = k.dealDamage(t, k.faith * 1.2 + 8, "holy");
      t.addBuff({ id: `judged_${k.name}`, duration: 10 });
      return { damage: dealt };
    },
  },

  sonOfLight: {
    name: "Son of Light",
    cost: 100, cooldown: 180, onGcd: false, target: "self",
    execute(k) {
      k.addBuff({ id: "sonOfLight", duration: 12, mods: { damageTaken: 0.6 } });
    },
  },
};

class Knight extends Character {
  constructor(name, level = 1, position) {
    super(name, level, position, {
      className: "Knight",
      role: "tank",
      armorType: "plate",
      canBlock: true,
      baseStats: { str: 14, sta: 16, faith: 12, agi: 6, armor: 25, blockChance: 0.15 },
      statsPerLevel: { str: 1.5, sta: 2, faith: 1.5, agi: 0.5, armor: 4 },
      hp: { base: 180, perLevel: 18 },
      resource: { name: "Holy Power", max: 100, regen: 5, startsFull: true },
      weapon: { damage: 10, speed: 2.4 },
      threatMultiplier: 3,
      abilities: KNIGHT_ABILITIES,
    });
  }

  // Auto-attacks build Holy Power so the Knight isn't starved
  onAutoAttackHit() {
    this.resource.current = Math.min(this.resource.max, this.resource.current + 8);
  }

  // GUARDIAN'S OATH (passive): every hit the Knight lands locks that enemy onto the Knight.
  // While the oath holds, the enemy ignores everyone else — damage dealers can't pull it off.
  // It won't steal an enemy another tank holds (only a taunt or Challenge does that).
  // Son of Light: every hit the Knight lands also heals the most injured nearby ally.
  onDealDamage(target, dealt) {
    target.bindOath?.(this, OATH_DURATION);
    if (!this.hasBuff("sonOfLight") || !this._lastCtx) return;
    const hurt = this.alliesInRange(this._lastCtx, 30).filter(a => a.hp < a.maxHp);
    hurt.sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp);
    if (hurt[0]) this.heal(hurt[0], dealt * 0.5);
  }

  update(dt, ctx = {}) {
    this._lastCtx = ctx;
    super.update(dt, ctx);
  }
}

module.exports = { Knight, KNIGHT_ABILITIES };