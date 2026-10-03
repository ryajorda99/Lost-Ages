// Valkyrie.js — tank / damage hybrid with TWO LIVES. Plate, Valor, Strength.
//
// LIFE 1 — MOUNTED on her Pegasus:
//   She fights from the air with a long lance (8m reach). Flying means ground effects
//   (fire, eruptions, poison pools) can't touch her — but targeted attacks, frontal
//   breaths and cleaves still can.
// When the Pegasus's health runs out it is SLAIN — she does NOT die (the boss gets no soul):
// LIFE 2 — WINGED, on foot:
//   She drops to the ground with 60% health, her own wings unfold, and she fights on as a
//   melee tank/damage dealer with new abilities and +10% damage. Now she must dodge fire like everyone else.
//   If she falls again, she's really dead (a revive brings her back on foot).
//
// Valor (resource): starts at 0, builds from hitting and from taking hits, drains out of combat.
// Tank tools in both lives: Valkyrie's Call (taunt) and Aegis of Valhalla (big defensive).

const { Character, MELEE_RANGE } = require("./Character");

const LANCE_RANGE = 8;          // mounted reach
const SECOND_LIFE_HP = 0.6;     // health when the Pegasus falls
const mounted = (v) => (v.mounted ? null : "your Pegasus has fallen");
const winged = (v) => (v.mounted ? "only once your wings are out (after the Pegasus falls)" : null);

const VALKYRIE_ABILITIES = {
  // ================= Both lives =================
  valkyriesCall: {
    name: "Valkyrie's Call",
    cost: 0, cooldown: 10, onGcd: false, range: 30, target: "enemy",
    execute(v, t) {
      // Taunt: the enemy attacks her for 4 seconds and she jumps to the top of its threat
      t.forceTarget?.(v, 4);
      t.addThreat?.(v, 0, { matchTop: true });
    },
  },

  aegisOfValhalla: {
    name: "Aegis of Valhalla",
    cost: 0, cooldown: 60, onGcd: false, target: "self",
    execute(v) {
      v.addBuff({ id: "aegisOfValhalla", duration: 8, mods: { damageTaken: 0.5 } });
    },
  },

  // ================= Life 1: on the Pegasus =================
  skyLance: {
    name: "Sky Lance",
    cost: 0, cooldown: 0, range: LANCE_RANGE, target: "enemy",
    requires: mounted,
    execute(v, t) {
      v.gainValor(8);
      return { damage: v.dealDamage(t, v.weaponDamage * 1.0 + v.str * 0.6, "physical") };
    },
  },

  divingStrike: {
    name: "Diving Strike",
    cost: 0, cooldown: 12, range: 30, target: "enemy",
    requires: mounted,
    execute(v, t) {
      // The Pegasus swoops down onto the target
      const dx = t.position.x - v.position.x, dy = t.position.y - v.position.y, d = Math.hypot(dx, dy) || 1;
      const stop = Math.max(0, d - 4);
      v.position.x += (dx / d) * stop;
      v.position.y += (dy / d) * stop;
      v.gainValor(15);
      return { damage: v.dealDamage(t, v.weaponDamage * 1.5 + v.str * 1.0, "physical") };
    },
  },

  stormGallop: {
    name: "Storm Gallop",
    cost: 20, cooldown: 15, target: "self",
    requires: mounted,
    execute(v, t, ctx) {
      // Beating wings hit everything around her
      const hit = v.enemiesInRange(ctx, 8);
      for (const e of hit) { v.dealDamage(e, v.weaponDamage * 0.8 + v.str * 0.4, "physical"); e.addThreat?.(v, 30); }
      return { targetsHit: hit.length };
    },
  },

  thunderLance: {
    name: "Thunder Lance",
    cost: 40, cooldown: 0, range: LANCE_RANGE, target: "enemy",
    requires: mounted,
    execute(v, t) {
      return { damage: v.dealDamage(t, v.weaponDamage * 1.6 + v.str * 1.0, "physical") };
    },
  },

  // ================= Life 2: winged, on foot =================
  wingedSlash: {
    name: "Winged Slash",
    cost: 0, cooldown: 0, range: MELEE_RANGE, target: "enemy",
    requires: winged,
    execute(v, t) {
      v.gainValor(10);
      return { damage: v.dealDamage(t, v.weaponDamage * 1.2 + v.str * 0.7, "physical") };
    },
  },

  heavensFall: {
    name: "Heaven's Fall",
    cost: 0, cooldown: 10, range: MELEE_RANGE + 1, target: "enemy",
    requires: winged,
    execute(v, t, ctx) {
      // Leaps up on her wings and crashes down: big hit on the target, smaller hit around it
      const dealt = v.dealDamage(t, v.weaponDamage * 1.8 + v.str * 1.2, "physical");
      for (const e of v.enemiesInRange(ctx, 6, t)) if (e !== t) v.dealDamage(e, v.str * 0.5, "physical");
      v.gainValor(15);
      return { damage: dealt };
    },
  },

  soulspear: {
    name: "Soulspear",
    cost: 40, cooldown: 0, range: MELEE_RANGE, target: "enemy",
    requires: winged,
    execute(v, t) {
      return { damage: v.dealDamage(t, v.weaponDamage * 1.8 + v.str * 1.0, "physical") };
    },
  },

  wingGuard: {
    name: "Wing Guard",
    cost: 0, cooldown: 25, onGcd: false, target: "self",
    requires: winged,
    execute(v) {
      // Wraps herself in her wings: a shield that soaks damage
      const amount = v.str * 4 + v.sta * 2;
      v.addAbsorb(amount);
      v.addBuff({ id: "wingGuard", duration: 10, onExpire: (o) => { o.absorb = Math.max(0, o.absorb - amount); } });
    },
  },
};

class Valkyrie extends Character {
  constructor(name, level = 1, position) {
    super(name, level, position, {
      className: "Valkyrie",
      role: "tank",                       // a tank (taunts, mitigation) that also deals real damage
      armorType: "plate",
      canBlock: false,
      baseStats: { str: 17, sta: 16, agi: 8, armor: 24, crit: 10 },
      statsPerLevel: { str: 2.4, sta: 1.7, agi: 0.5, armor: 3 },
      hp: { base: 180, perLevel: 18 },
      resource: { name: "Valor", max: 100, regen: 0, startsFull: false, decayOutOfCombat: 3 },
      weapon: { damage: 20, speed: 2.6, range: LANCE_RANGE - 1 },   // a long lance while mounted
      threatMultiplier: 1.5,
      abilities: VALKYRIE_ABILITIES,
    });
    this.resource.current = 40;   // rides in with some Valor already built up
    this.mounted = true;
    this.airborne = true;     // flying: ground effects can't hit her (see Character.tickZones)
  }

  gainValor(n) {
    this.resource.current = Math.min(this.resource.max, this.resource.current + n);
  }

  onAutoAttackHit(t, dealt) {
    this.gainValor(14 + dealt * 0.1);
  }

  onTakeDamage(amount) {
    this.gainValor(amount * 0.16);
  }

  // Two lives: the first "death" kills the Pegasus instead of her
  die(killer) {
    if (this.mounted) {
      this.mounted = false;
      this.airborne = false;
      this.cast = null;
      this.absorb = 0;
      this.hp = Math.round(this.maxHp * SECOND_LIFE_HP);
      this.attackRange = MELEE_RANGE;
      this._deathCause = null;
      this.addBuff({ id: "valkyrieWings", duration: Infinity, mods: { damageDealt: 1.1, moveSpeed: 1.1 } });
      this.onDismount?.(killer);
      return;
    }
    super.die(killer);
  }

  // Revived after her second life: back on her feet with wings (the Pegasus stays fallen)
  revive(hpPct) {
    super.revive(hpPct);
    this.addBuff({ id: "valkyrieWings", duration: Infinity, mods: { damageDealt: 1.1, moveSpeed: 1.1 } });
  }
}

module.exports = { Valkyrie, VALKYRIE_ABILITIES };