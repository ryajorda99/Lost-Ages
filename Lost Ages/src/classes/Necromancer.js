// Necromancer.js — shadow DPS that can switch fighting style mid-fight. Cloth, Mana, Intellect.
//
// Two stances (swap any time, off the global cooldown):
//   Deathcaller (RANGED) — safe at the back: Death Bolt and the Plague damage-over-time.
//   Reaper      (MELEE)  — up close with a scythe: Reap and Soul Cleave. About 20% more
//                          damage and 15% damage reduction, but you're in range of the boss's
//                          cleaves, breath attacks and fire. Good players swap back out when it gets dangerous.
//
// Raise Corrupted (both stances): summons 2 Corrupted Servants for 20 seconds. They run at
// the Necromancer's target and every hit stacks Corrupted Poison on it (up to 5 stacks).
// Servants can't be attacked, and crumble when they expire or the Necromancer dies.

const { Character, MELEE_RANGE, isHostile, distance } = require("./Character");

const RANGED_ATTACK_RANGE = 25;
const SERVANT_COUNT = 2;
const SERVANT_LIFETIME = 20;
const POISON_MAX_STACKS = 5;

// Stack Corrupted Poison on a target (each Necromancer has their own poison)
function applyCorruptedPoison(necro, target) {
  if (!target || target.isDead) return;
  const id = `corruptedPoison_${necro.name}`;
  const existing = target.buffs.find(b => b.id === id);
  if (existing) {
    existing.stacks = Math.min(POISON_MAX_STACKS, existing.stacks + 1);
    existing.remaining = existing.duration;   // refresh
    return;
  }
  target.addBuff({
    id, duration: 8, tickEvery: 1, stacks: 1, poison: true,
    onTick: (victim) => {
      const stacks = victim.buffs.find(b => b.id === id)?.stacks || 1;
      necro.dealDamage(victim, necro.int * 0.06 * stacks, "nature");
    },
  });
}

// ---------------------------------------------------------------------
//  Corrupted Servant — the Necromancer's summoned ally
// ---------------------------------------------------------------------
class CorruptedServant extends Character {
  constructor(owner, n) {
    const angle = (n / SERVANT_COUNT) * Math.PI * 2;
    super("Corrupted Servant", owner.level, {
      x: owner.position.x + Math.cos(angle) * 1.5, y: owner.position.y + Math.sin(angle) * 1.5,
    }, {
      className: "CorruptedServant",
      role: "pet",
      baseStats: { armor: 30 },
      hp: { base: Math.round(owner.maxHp * 0.5), perLevel: 0 },
      resource: { name: "Energy", max: 100, regen: 10, startsFull: true },
      weapon: { damage: 2 + owner.int * 0.12, speed: 1.8 },
      abilities: {},
    });
    this.owner = owner;
    this.isPet = true;
    this.lifetime = SERVANT_LIFETIME;
  }

  // Servants hit THROUGH their master, so the damage counts as the Necromancer's
  // (and uses the Necromancer's crit chance and damage buffs)
  dealDamage(target, amount, school) {
    return this.owner.dealDamage(target, amount, school);
  }

  // Every claw hit stacks the poison
  onAutoAttackHit(target) {
    applyCorruptedPoison(this.owner, target);
  }

  update(dt, ctx) {
    if (this.isDead) return;
    this.lifetime -= dt;
    if (this.lifetime <= 0 || this.owner.isDead) { this.isDead = true; return; }

    // Attack whatever the Necromancer is attacking
    const t = this.owner.target;
    this.target = t && !t.isDead && isHostile(this.owner, t) ? t : null;
    if (this.target) {
      const d = distance(this, this.target);
      if (d > MELEE_RANGE - 1) {
        const step = Math.min(d - (MELEE_RANGE - 1.5), 7 * dt);   // they run fast (7 m/s)
        this.position.x += ((this.target.position.x - this.position.x) / d) * step;
        this.position.y += ((this.target.position.y - this.position.y) / d) * step;
      }
      this.enterCombat();
    }
    super.update(dt, ctx);
  }
}

// ---------------------------------------------------------------------
//  Abilities
// ---------------------------------------------------------------------
const inStance = (stance) => (n) => (n.stance === stance ? null : `only in ${stance === "melee" ? "Reaper" : "Deathcaller"} stance`);

const NECROMANCER_ABILITIES = {
  // ---------- Stances ----------
  reaperForm: {
    name: "Reaper Stance",
    cost: 0, cooldown: 2, onGcd: false, target: "self",
    requires: (n) => (n.stance === "melee" ? "already in Reaper stance" : null),
    execute: (n) => n.setStance("melee"),
  },

  deathcallerForm: {
    name: "Deathcaller Stance",
    cost: 0, cooldown: 2, onGcd: false, target: "self",
    requires: (n) => (n.stance === "ranged" ? "already in Deathcaller stance" : null),
    execute: (n) => n.setStance("ranged"),
  },

  // ---------- Ranged (Deathcaller) ----------
  deathBolt: {
    name: "Death Bolt",
    cost: 20, cooldown: 0, castTime: 1.8, range: 35, target: "enemy",
    requires: inStance("ranged"),
    execute(n, t) {
      return { damage: n.dealDamage(t, 12 + n.int * 1.35, "shadow") };
    },
  },

  plague: {
    name: "Plague",
    cost: 15, cooldown: 0, range: 35, target: "enemy",   // instant
    requires: inStance("ranged"),
    execute(n, t) {
      t.addBuff({
        id: `plague_${n.name}`, duration: 15, tickEvery: 3, poison: true,
        onTick: (victim) => n.dealDamage(victim, n.int * 0.3, "nature"),
      });
    },
  },

  // ---------- Melee (Reaper) ----------
  reap: {
    name: "Reap",
    cost: 15, cooldown: 0, range: MELEE_RANGE, target: "enemy",
    requires: inStance("melee"),
    execute(n, t) {
      return { damage: n.dealDamage(t, n.weaponDamage * 0.5 + n.int * 1.15, "shadow") };
    },
  },

  soulCleave: {
    name: "Soul Cleave",
    cost: 30, cooldown: 8, target: "self",
    requires: inStance("melee"),
    execute(n, t, ctx) {
      const hit = n.enemiesInRange(ctx, 8);
      for (const e of hit) n.dealDamage(e, n.int * 0.8, "shadow");
      return { targetsHit: hit.length };
    },
  },

  // ---------- Both stances ----------
  raiseCorrupted: {
    name: "Raise Corrupted",
    cost: 45, cooldown: 40, castTime: 1.5, target: "self",
    execute(n) {
      n.servants.forEach(s => { s.isDead = true; });   // old ones crumble
      n.servants = Array.from({ length: SERVANT_COUNT }, (_, i) => new CorruptedServant(n, i));
      return { summoned: n.servants.length };
    },
  },

  boneShield: {
    name: "Bone Shield",
    cost: 30, cooldown: 40, onGcd: false, target: "self",
    execute(n) {
      const amount = n.int * 5;
      n.addAbsorb(amount);
      n.addBuff({ id: "boneShield", duration: 12, onExpire: (o) => { o.absorb = Math.max(0, o.absorb - amount); } });
    },
  },
};

class Necromancer extends Character {
  constructor(name, level = 1, position) {
    super(name, level, position, {
      className: "Necromancer",
      role: "dps",
      armorType: "cloth",
      baseStats: { int: 17, sta: 11, str: 6, agi: 5, faith: 3, armor: 10, crit: 8 },
      statsPerLevel: { int: 2.4, sta: 1.2, agi: 0.3, armor: 1.1 },
      hp: { base: 130, perLevel: 13 },
      resource: { name: "Mana", max: 220, regen: 5, startsFull: true },
      weapon: { damage: 6, speed: 2.4, range: RANGED_ATTACK_RANGE },
      abilities: NECROMANCER_ABILITIES,
    });
    this.stance = "ranged";
    this.servants = [];
  }

  setStance(stance) {
    this.stance = stance;
    if (stance === "melee") {
      this.attackRange = MELEE_RANGE;
      this.addBuff({ id: "reaperForm", duration: Infinity, mods: { damageTaken: 0.85 } });
    } else {
      this.attackRange = RANGED_ATTACK_RANGE;
      this.removeBuff("reaperForm");
    }
  }

  // Scythe swings in Reaper stance add shadow damage on top of the weapon hit
  onAutoAttackHit(target) {
    if (this.stance === "melee") this.dealDamage(target, this.int * 0.3, "shadow");
  }

  update(dt, ctx = {}) {
    super.update(dt, ctx);
    for (const s of this.servants) s.update(dt, ctx);
    this.servants = this.servants.filter(s => !s.isDead);
  }

  die(killer) {
    super.die(killer);
    this.servants.forEach(s => { s.isDead = true; });
    this.servants = [];
  }

  revive(hpPct) {
    super.revive(hpPct);
    this.setStance("ranged");   // death knocks you out of Reaper stance
  }
}

module.exports = { Necromancer, NECROMANCER_ABILITIES, CorruptedServant, applyCorruptedPoison };