// Knight.js — holy tank (paladin). Plate, shield, Holy Power.
// Role: hold aggro, survive, light self-healing and party support.

const { Character, MELEE_RANGE } = require("./Character");
const { makeRevive } = require("./reviveAbility");

// How long Guardian's Oath holds an enemy after the Knight's last hit (seconds)
const OATH_DURATION = 8;

// SANCTIFIED AURA (passive): the Knight's hits can make a golden aura flare up around him.
// Everyone standing in it (the Knight too) deals more damage and takes less.
const AURA = {
  procChance: 0.3,      // each time the Knight deals damage: 30% chance to flare up...
  cooldown: 14,         // ...but at most once every 14 seconds
  duration: 8,          // lasts 8 seconds
  radius: 10,           // covers everyone within 10 metres of the Knight
  damageBonus: 0.08,    // allies inside deal +8% damage
  mitigation: 0.08,     // and take 8% less damage
};

// THREAT: every Knight ability that hits something builds EXTRA aggro on top of the Knight's normal
// 3x threat — this much more per point of damage (so ability damage counts 3 + 2 = 5x)
const ABILITY_THREAT = 2;
// Hit an enemy with an ability: damage + the bonus aggro. Returns the damage dealt.
function smite(k, e, amount, school = "holy") {
  const dealt = k.dealDamage(e, amount, school);
  if (dealt > 0) e.addThreat?.(k, dealt * ABILITY_THREAT);
  return dealt;
}

const KNIGHT_ABILITIES = {
  righteousStrike: {
    name: "Righteous Strike",
    cost: 15, cooldown: 0, range: MELEE_RANGE, target: "enemy",
    execute(k, t) {
      const dmg = k.weaponDamage * 1.1 + k.str * 0.5 + k.faith * 0.2;
      const dealt = smite(k, t, dmg, "physical");
      // Judgment mark: heal for 30% of the hit
      if (t.hasBuff(`judged_${k.name}`)) {
        k.heal(k, dealt * 0.3);
        t.removeBuff(`judged_${k.name}`);
      }
      return { damage: dealt };
    },
  },

  // SHIELD OF VALOR — an absorb shield for the Knight, and the shield slams out in a ring of
  // holy force: damages every enemy within 8 m (and pulls their attention)
  shieldOfValor: {
    name: "Shield of Valor",
    cost: 30, cooldown: 8, onGcd: false, target: "self",
    execute(k, t, ctx) {
      const amount = k.sta * 7.5;
      k.addAbsorb(amount);
      k.addBuff({ id: "shieldOfValor", duration: 6, onExpire: (o) => { o.absorb = Math.max(0, o.absorb - amount); } });
      const hit = k.enemiesInRange(ctx, 8);
      let damage = 0;
      for (const e of hit) damage += smite(k, e, k.str * 0.6 + k.sta * 0.5 + k.faith * 0.3, "holy");
      return { absorb: amount, targetsHit: hit.length, damage };
    },
  },

  // Divine Taunt is the one Knight ability that does no damage — it just forces the enemy onto you
  divineTaunt: {
    name: "Divine Taunt",
    cost: 0, cooldown: 5, onGcd: false, range: 25, target: "enemy",
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
    cost: 20, cooldown: 12, onGcd: false, target: "self",
    execute(k, t, ctx) {
      // Never steals an enemy the OTHER tank is holding — only a taunt does that (tank swaps)
      const grabbed = k.enemiesInRange(ctx, 12).filter(e => {
        const holder = e.oathHolder?.();
        return !holder || holder === k || holder.role !== "tank";
      });
      let damage = 0;
      for (const e of grabbed) {
        e.forceTarget?.(k, 6);
        e.addThreat?.(k, 0, { matchTop: true });
        e.bindOath?.(k, OATH_DURATION, { force: true });
        damage += smite(k, e, k.faith * 0.5 + k.str * 0.3, "holy");   // a shockwave of holy light
      }
      return { grabbed: grabbed.length, damage };
    },
  },

  // HOLY TOUCH — a big heal, and the light bursts out of whoever you healed: damages every enemy
  // within 8 m of them
  holyTouch: {
    name: "Holy Touch",
    cost: 60, cooldown: 45, onGcd: false, range: 30, target: "ally",
    requires(k, t) {
      return (t || k).hasBuff("holyTouchImmune") ? "target recently received Holy Touch" : null;
    },
    execute(k, t, ctx = {}) {
      t = t || k;
      const healed = k.heal(t, t.maxHp * 0.4);
      t.addBuff({ id: "holyTouchImmune", duration: 90 }); // can't get it again for 90 s
      let damage = 0;
      for (const e of (ctx.enemies || []).filter(e => !e.isDead && Math.hypot(e.position.x - t.position.x, e.position.y - t.position.y) <= 8)) {
        damage += smite(k, e, k.faith * 0.9 + 10, "holy");
      }
      return { healed, damage };
    },
  },

  holyGrounds: {
    name: "Holy Grounds",
    cost: 40, cooldown: 9, target: "self",
    execute(k) {
      k.placeZone({
        name: "Holy Grounds", position: { ...k.position }, radius: 5, duration: 10, tickEvery: 1,
        onTick(caster, inside) {
          for (const e of inside) {
            smite(caster, e, caster.faith * 0.4, "holy");
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
    cost: 25, cooldown: 6, range: 20, target: "enemy",
    execute(k, t) {
      const dealt = smite(k, t, k.faith * 1.2 + 8, "holy");
      t.addBuff({ id: `judged_${k.name}`, duration: 10 });
      return { damage: dealt };
    },
  },

  // SON OF LIGHT — 40% less damage taken for 12 s (and your hits heal allies), and you blaze up in a
  // burst of radiance that damages every enemy within 10 m
  sonOfLight: {
    name: "Son of Light",
    cost: 100, cooldown: 90, onGcd: false, target: "self",
    execute(k, t, ctx) {
      k.addBuff({ id: "sonOfLight", duration: 12, mods: { damageTaken: 0.6 } });
      const hit = k.enemiesInRange(ctx, 10);
      let damage = 0;
      for (const e of hit) damage += smite(k, e, k.faith * 1.4 + k.str * 0.4, "holy");
      return { targetsHit: hit.length, damage };
    },
  },

  // Redemption: slower than the Healer's Resurrection and brings them back weaker (30% health).
  // In raids this uses one of the raid's 4 shared revives. (A revive — the only other one with no damage.)
  redemption: makeRevive({ name: "Redemption", castTime: 4.0, hpPct: 0.3, resourcePct: 0.3 }),
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
      resource: { name: "Holy Power", max: 100, regen: 7, startsFull: true },
      weapon: { damage: 10, speed: 2.4 },
      threatMultiplier: 3,
      abilities: KNIGHT_ABILITIES,
    });
  }

  // Holy Power comes from fighting: auto-attacks build it, and so does getting hit (tanks get hit a lot)
  onTakeDamage(amount) {
    this.resource.current = Math.min(this.resource.max, this.resource.current + amount * 0.08);
  }

  // Auto-attacks build Holy Power so the Knight isn't starved
  onAutoAttackHit() {
    this.resource.current = Math.min(this.resource.max, this.resource.current + 12);
  }

  // GUARDIAN'S OATH (passive): every hit the Knight lands locks that enemy onto the Knight.
  // While the oath holds, the enemy ignores everyone else — damage dealers can't pull it off.
  // It won't steal an enemy another tank holds (only a taunt or Challenge does that).
  // Son of Light: every hit the Knight lands also heals the most injured nearby ally.
  onDealDamage(target, dealt) {
    target.bindOath?.(this, OATH_DURATION);
    this.tryAura();
    if (!this.hasBuff("sonOfLight") || !this._lastCtx) return;
    const hurt = this.alliesInRange(this._lastCtx, 30).filter(a => a.hp < a.maxHp);
    hurt.sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp);
    if (hurt[0]) this.heal(hurt[0], dealt * 0.5);
  }

  // Sanctified Aura flaring up
  tryAura() {
    if (this.isDead || (this.auraCooldown || 0) > 0 || Math.random() >= AURA.procChance) return;
    this.auraCooldown = AURA.cooldown;
    this.addBuff({
      id: "sanctifiedAura", duration: AURA.duration, tickEvery: 0.5,
      // Every half second, bless everyone inside (the blessing fades quickly once you step out)
      onTick: (k, ctx) => {
        for (const a of k.alliesInRange(ctx || k._lastCtx || {}, AURA.radius)) {
          a.addBuff({
            id: "sanctifiedBlessing", duration: 0.75,
            mods: { damageDealt: 1 + AURA.damageBonus, damageTaken: 1 - AURA.mitigation },
          });
        }
      },
    });
    this.buffs.find(b => b.id === "sanctifiedAura").tickTimer = 0;   // bless right away
    this.onAbilityUsed?.("sanctifiedAura", this);                    // lets the 3D viewer play the flare
  }

  update(dt, ctx = {}) {
    this._lastCtx = ctx;
    this.auraCooldown = Math.max(0, (this.auraCooldown || 0) - dt);
    super.update(dt, ctx);
  }
}

module.exports = { Knight, KNIGHT_ABILITIES, AURA, ABILITY_THREAT };