// hollowKing.js — boss definition (data only; the logic lives in src/entities/Boss.js).
// All ability damage is multiplied by b.power (= statMultiplier), so changing
// statMultiplier rescales the whole fight.

const { distance } = require("../../classes/Character");

const hollowKing = {
  name: "The Hollow King",
  level: 22,
  type: "undead",
  statMultiplier: 5,       // x5 base stats

  baseHp: 9000,            // x5 = 45,000
  baseDamage: 60,          // x5 = 300 per swing
  baseArmor: 66,           // x5 = 330
  attackSpeed: 2.0,
  transitionTime: 3,       // seconds of immunity between phases

  // ============================ LOOT ============================
  // Each player rolls their own loot (personal loot). Everything here is BOSS ONLY:
  // random rolls are always Epic, and the named items below can't drop anywhere else.
  loot: {
    itemLevel: 30,
    lockoutHours: 168,     // once per week per player (the simulator ignores this)
    randomRolls: 1,        // random Epic items on top of the unique drops
    rarityWeights: { epic: 100 },
    uniqueDrops: [
      {
        chance: 0.25,
        item: {
          name: "Crown of the Hollow King", slotType: "head", rarity: "epic", armorType: "plate",
          allowedClasses: ["Knight", "Warrior"], stats: { str: 18, sta: 22, faith: 10, armor: 75, blockChance: 0.02 },
        },
      },
      {
        chance: 0.25,
        item: {
          name: "Shroud of the Hollow King", slotType: "chest", rarity: "epic", armorType: "cloth",
          allowedClasses: ["Mage", "Healer"], stats: { int: 16, faith: 16, sta: 18, haste: 10, armor: 20 },
        },
      },
      {
        chance: 0.25,
        item: {
          name: "Bonecarver", slotType: "mainHand", rarity: "epic", weaponType: "dagger",
          allowedClasses: ["Rogue"], weaponDamage: 44, weaponSpeed: 1.6, stats: { agi: 20, sta: 12, crit: 10 },
        },
      },
      {
        chance: 0.03,
        item: {
          name: "Dawnbreaker, Blade of the Oathsworn", slotType: "mainHand", rarity: "legendary",
          weaponType: "sword", allowedClasses: ["Knight"], weaponDamage: 70, weaponSpeed: 2.4,
          stats: { str: 30, sta: 28, faith: 22 },
          effect: "Righteous Strike has a 10% chance to reset Judgment's cooldown.",
        },
      },
    ],
  },

  // ============================ ABILITIES ============================
  // targetMode: "tank" | "random" | "randomNonTank" | "randomRanged" | "lowestHp"
  abilities: {
    shadowBolt: {
      name: "Shadow Bolt", cost: 0, cooldown: 8, castTime: 2.5, range: 40,
      target: "enemy", targetMode: "randomNonTank",
      execute: (b, t) => ({ damage: b.dealDamage(t, 90 * b.power, "shadow") }),
    },

    cleave: {
      name: "Cleave", cost: 0, cooldown: 10, range: 6,
      target: "enemy", targetMode: "tank",
      // Hits the tank and anyone standing within 6m of the tank
      execute(b, t, ctx) {
        const hit = (ctx.enemies || []).filter(p => !p.isDead && distance(p, t) <= 6);
        for (const p of hit) b.dealDamage(p, 70 * b.power, "physical");
        return { targetsHit: hit.length };
      },
    },

    raiseDead: {
      name: "Raise Dead", cost: 0, cooldown: 30, target: "self",
      execute(b, t, ctx) {
        const count = b.phaseIndex >= 3 ? 3 : 2;
        b.summon(Array.from({ length: count }, (_, i) => ({
          name: `Hollow Skeleton ${i + 1}`, level: 20, hp: 250 * b.power, damage: 12 * b.power,
          attackSpeed: 2.2, type: "undead", armor: 40,
        })), ctx.enemies || []);
      },
    },

    soulDrain: {
      name: "Soul Drain", cost: 0, cooldown: 15, range: 40,
      target: "enemy", targetMode: "random",
      // Damage over time. The Healer can Purify it.
      execute(b, t) {
        t.addBuff({
          id: "soulDrain", duration: 8, tickEvery: 1, dispellable: true,
          onTick: (o) => b.dealDamage(o, 10 * b.power, "shadow"),
        });
      },
    },

    crushingBlow: {
      name: "Crushing Blow", cost: 0, cooldown: 16, castTime: 1.5, range: 6,
      target: "enemy", targetMode: "tank", uninterruptible: true,
      // Tank buster: tanks must use a defensive during the cast
      execute: (b, t) => ({ damage: b.dealDamage(t, 200 * b.power, "physical") }),
    },

    shadowNova: {
      name: "Shadow Nova", cost: 0, cooldown: 22, castTime: 3, target: "self", uninterruptible: true,
      // Hits the whole raid — healers must be ready
      execute(b, t, ctx) {
        const hit = b.enemiesInRange(ctx, 40);
        for (const p of hit) b.dealDamage(p, 55 * b.power, "shadow");
        return { targetsHit: hit.length };
      },
    },

    deathGrip: {
      name: "Death Grip", cost: 0, cooldown: 18, range: 40,
      target: "enemy", targetMode: "randomRanged",
      // Yanks a ranged player into melee (and into Cleave range)
      execute(b, t) {
        t.position.x = b.position.x - 2;
        t.position.y = b.position.y + 1;
        t.interrupt("death gripped");
        t.stunned = Math.max(t.stunned, 1);
      },
    },

    doom: {
      name: "Doom", cost: 0, cooldown: 20, range: 40,
      target: "enemy", targetMode: "randomNonTank",
      // Explodes after 8s unless Purified
      execute(b, t) {
        t.addBuff({
          id: "doom", duration: 8.05, tickEvery: 8, dispellable: true,
          onTick: (o) => b.dealDamage(o, 150 * b.power, "shadow"),
        });
      },
    },
  },

  // ============================ PHASES ============================
  // rotation = priority list. Higher phases: more abilities, more damage, faster.
  phases: [
    {
      name: "The Hollow Throne", hpBelow: 1.0,
      description: "Shadow Bolts and Cleave.",
      rotation: ["shadowBolt", "cleave"],
      damageMult: 1.0, attackSpeedMult: 1.0,
      adaptEvery: 30, adaptDuration: 20, maxAdaptations: 1,
    },
    {
      name: "Rise of the Dead", hpBelow: 0.75,
      description: "Skeletons rise and Soul Drain begins.",
      rotation: ["raiseDead", "soulDrain", "shadowBolt", "cleave"],
      damageMult: 1.15, attackSpeedMult: 1.1,
      adaptEvery: 25, adaptDuration: 20, maxAdaptations: 1,
      onEnter: (b, ctx) => { b.cooldowns.raiseDead = 0; },
    },
    {
      name: "Crown of Shadows", hpBelow: 0.5,
      description: "Crushing Blow, Shadow Nova and Death Grip. Two adaptations at once.",
      rotation: ["crushingBlow", "shadowNova", "deathGrip", "soulDrain", "shadowBolt", "cleave"],
      damageMult: 1.3, attackSpeedMult: 1.2,
      adaptEvery: 20, adaptDuration: 20, maxAdaptations: 2,
      onEnter(b, ctx) {
        for (const p of b.enemiesInRange(ctx, 40)) b.dealDamage(p, 30 * b.power, "shadow"); // transition roar
      },
    },
    {
      name: "Hollow Fury", hpBelow: 0.25,
      description: "ENRAGED. Doom, faster cooldowns, everything hits harder.",
      rotation: ["doom", "crushingBlow", "shadowNova", "raiseDead", "deathGrip", "soulDrain", "shadowBolt", "cleave"],
      damageMult: 1.6, attackSpeedMult: 1.4, cooldownRate: 1.5,
      adaptEvery: 15, adaptDuration: 15, maxAdaptations: 2,
      onEnter(b, ctx) {
        for (const p of b.enemiesInRange(ctx, 40)) b.dealDamage(p, 40 * b.power, "shadow");
        b.cooldowns.raiseDead = 0;
      },
    },
  ],

  // ============================ ADAPTATION ============================
  // weight(stats) decides how likely each one is. stats = { magicShare, physicalShare,
  // interrupts, topSource }. Higher weight = more likely, but it's still a random roll.
  adaptation: {
    firstAfter: 20,
    pool: [
      {
        id: "arcaneWard", name: "Warded Against Magic", hint: "takes 50% less spell damage",
        weight: (s) => 1 + s.magicShare * 6,
        mods: { damageTaken_fire: 0.5, damageTaken_frost: 0.5, damageTaken_holy: 0.5, damageTaken_shadow: 0.5, damageTaken_arcane: 0.5 },
      },
      {
        id: "ironHide", name: "Iron Hide", hint: "takes 50% less physical damage",
        weight: (s) => 1 + s.physicalShare * 6,
        mods: { damageTaken_physical: 0.5 },
      },
      {
        id: "mirror", name: "Mirror of Souls", hint: "reflects 30% of spell damage back at the caster",
        weight: (s) => 0.5 + s.magicShare * 3,
      },
      {
        id: "thorns", name: "Bone Spikes", hint: "reflects 20% of physical damage back at attackers",
        weight: (s) => 0.5 + s.physicalShare * 3,
      },
      {
        id: "unstoppable", name: "Unstoppable", hint: "can't be interrupted or stunned",
        weight: (s) => 0.5 + s.interrupts * 1.5,
      },
      {
        id: "fixate", name: "Hunter's Grudge", hint: "fixates on the top damage dealer",
        weight: (s) => (s.topSource ? 2 : 0),
        duration: 8,
        onApply(b, ctx, s) {
          if (s.topSource) { b.forceTarget(s.topSource, 8); b.announce(`${b.name} fixates on ${s.topSource.name}!`); }
        },
      },
      {
        id: "regeneration", name: "Undying Will", hint: "regenerates 1% HP every 2 seconds",
        weight: () => 1.5,
        tickEvery: 2,
        onTick: (b) => { b.hp = Math.min(b.maxHp, b.hp + b.maxHp * 0.01); },
      },
      {
        id: "frenzy", name: "Frenzy", hint: "attacks 40% faster",
        weight: () => 1.5,
        onApply: (b) => { b.haste += 40; },
        onExpire: (b) => { b.haste -= 40; },
      },
      {
        id: "witherAura", name: "Withering Aura", hint: "players receive 40% less healing",
        weight: () => 1,
        onApply(b, ctx) {
          for (const p of b.enemiesInRange(ctx, 60)) {
            p.addBuff({ id: "withered", duration: 15, dispellable: true, mods: { healingTaken: 0.6 } });
          }
        },
      },
    ],
  },
};

module.exports = hollowKing;