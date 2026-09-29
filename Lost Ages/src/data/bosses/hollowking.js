// hollowKing.js — RAID TIER 1: The Hollow King (20 players, level 60).
// The first raid boss: same kind of fight as Azgaroth, but easier and more forgiving.
// Beat him to gear up (item level 60 epics) for Azgaroth, the Ashen Tyrant (item level 70).
//
// Mechanics (the "training wheels" version of Azgaroth's):
//   - Soul Eruption: glowing circle under a DPS/healer — 2 seconds to move, or die
//   - Hunter's Grudge: eruptions chase the top damage dealer — keep moving
//   - Doom: a player explodes after 8s unless a healer Purifies them
//   - Shadow Bolt: interrupt it (or someone takes a big hit)
//   - Crushing Blow: tank buster — tanks use a defensive
//   - Soul Harvest (weak): each death makes him 3% stronger
//   - Enrage at 2.5 minutes (he hits much harder — no instant wipe like Azgaroth)
// All ability damage is multiplied by b.power (= statMultiplier).

const { distance } = require("../../classes/Character");

const hollowKing = {
  name: "The Hollow King",
  level: 58,
  type: "undead",
  statMultiplier: 12,      // 12x the base stats (Azgaroth is 25x)

  baseHp: 9000,            // x12 = 108,000 HP  (Azgaroth: 225,000)
  baseDamage: 60,          // x12 = 720 per swing  (Azgaroth: 1,500)
  baseArmor: 25,           // x12 = 300
  attackSpeed: 2.0,
  transitionTime: 3,       // seconds of immunity between phases
  enrageTimer: 150,        // 2.5 minutes — then he hits 3x harder (see onEnrage)

  // What the simulator uses by default for this boss (same raid team as Azgaroth!)
  recommended: { level: 60, raidSize: 20 },
  trash: "hollowCrypt",    // trash mobs file in src/data/mobs/

  // Raid bosses don't scale with your gear — gearing up is how you get stronger
  gearScaling: false,

  // Enrage: much harder hits instead of Azgaroth's instant raid wipe
  onEnrage(b) {
    b.buffs.find(x => x.id === "berserk").mods.damageDealt = 3;
    b.announce(`${b.name} is ENRAGED — every hit is deadly now!`);
  },

  // SOUL HARVEST (weak version): each death makes him 3% stronger. Azgaroth's is 5% + more.
  onPlayerDeath(b, player) {
    const souls = (b.buffs.find(x => x.id === "soulHarvest")?.stacks || 0) + 1;
    b.addBuff({ id: "soulHarvest", duration: Infinity, stacks: souls, mods: { damageDealt: 1 + 0.03 * souls } });
    b.announce(`${b.name} consumes ${player.name}'s soul! (${souls} soul${souls > 1 ? "s" : ""}: +${souls * 3}% damage)`);
  },

  // ============================ LOOT ============================
  // Each player rolls their own loot (personal loot). Everything here is BOSS ONLY:
  // random rolls are always Epic, and the named items below can't drop anywhere else.
  // Item level 60 — a big step up from normal gear, but weaker than Azgaroth's item level 70.
  loot: {
    itemLevel: 60,
    lockoutHours: 168,     // once per week per player (the simulator ignores this)
    randomRolls: 1,        // random Epic items on top of the unique drops
    rarityWeights: { epic: 100 },
    uniqueDrops: [
      {
        chance: 0.25,
        item: {
          name: "Crown of the Hollow King", slotType: "head", rarity: "epic", armorType: "plate",
          allowedClasses: ["Knight", "Warrior"], stats: { str: 34, sta: 42, faith: 16, armor: 130, blockChance: 0.02 },
        },
      },
      {
        chance: 0.25,
        item: {
          name: "Shroud of the Hollow King", slotType: "chest", rarity: "epic", armorType: "cloth",
          allowedClasses: ["Mage", "Healer"], stats: { int: 30, faith: 30, sta: 34, haste: 18, armor: 35 },
        },
      },
      {
        chance: 0.25,
        item: {
          name: "Bonecarver", slotType: "mainHand", rarity: "epic", weaponType: "dagger",
          allowedClasses: ["Rogue"], weaponDamage: 72, weaponSpeed: 1.6, stats: { agi: 38, sta: 22, crit: 18 },
        },
      },
      {
        chance: 0.03,
        item: {
          name: "Dawnbreaker, Blade of the Oathsworn", slotType: "mainHand", rarity: "legendary",
          weaponType: "sword", allowedClasses: ["Knight"], weaponDamage: 110, weaponSpeed: 2.4,
          stats: { str: 55, sta: 48, faith: 38 },
          effect: "Righteous Strike has a 10% chance to reset Judgment's cooldown.",
        },
      },
    ],
  },

  // ============================ ABILITIES ============================
  // targetMode: "tank" | "random" | "randomNonTank" | "randomRanged" | "lowestHp"
  // The boss's melee always goes to the tank (Guardian's Oath) — abilities hunt everyone else.
  abilities: {
    soulEruption: {
      name: "Soul Eruption", cost: 0, cooldown: 12, firstUseAfter: 6, range: 60,
      target: "enemy", targetMode: "randomNonTank",
      // Shadow erupts under a damage dealer or healer. 2 seconds to move — or die.
      execute(b, t) {
        b.eruptUnder(t, { name: "Soul Eruption", radius: 4, warn: 2.0 });
      },
    },

    shadowBolt: {
      name: "Shadow Bolt", cost: 0, cooldown: 8, castTime: 2.5, range: 40,
      target: "enemy", targetMode: "randomNonTank",
      execute: (b, t) => ({ damage: b.dealDamage(t, 30 * b.power, "shadow") }),   // 360 — interrupt it!
    },

    cleave: {
      name: "Cleave", cost: 0, cooldown: 10, range: 6,
      target: "enemy", targetMode: "tank",
      // Hits the tank and anyone standing within 6m of the tank
      execute(b, t, ctx) {
        const hit = (ctx.enemies || []).filter(p => !p.isDead && distance(p, t) <= 6);
        for (const p of hit) b.dealDamage(p, 30 * b.power, "physical");
        return { targetsHit: hit.length };
      },
    },

    raiseDead: {
      name: "Raise Dead", cost: 0, cooldown: 30, target: "self",
      execute(b, t, ctx) {
        const count = b.phaseIndex >= 3 ? 3 : 2;
        b.summon(Array.from({ length: count }, (_, i) => ({
          name: `Hollow Skeleton ${i + 1}`, level: 58, hp: 300 * b.power, damage: 6 * b.power,
          attackSpeed: 2.2, type: "undead", armor: 80,
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
          onTick: (o) => b.dealDamage(o, 4 * b.power, "shadow"),
        });
      },
    },

    crushingBlow: {
      name: "Crushing Blow", cost: 0, cooldown: 16, castTime: 1.5, range: 6,
      target: "enemy", targetMode: "tank", uninterruptible: true,
      // Tank buster: tanks must use a defensive during the cast
      execute: (b, t) => ({ damage: b.dealDamage(t, 80 * b.power, "physical") }),
    },

    shadowNova: {
      name: "Shadow Nova", cost: 0, cooldown: 22, castTime: 3, target: "self", uninterruptible: true,
      // Hits the whole raid — healers must be ready
      execute(b, t, ctx) {
        const hit = b.enemiesInRange(ctx, 60);
        for (const p of hit) b.dealDamage(p, 18 * b.power, "shadow");
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
      // Explodes after 8s unless a healer Purifies it — that player DIES
      execute(b, t) {
        t.addBuff({
          id: "doom", duration: 8.05, tickEvery: 8, dispellable: true,
          onTick: (o) => b.lethal(o, "Doom (not purified)"),
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
      rotation: ["soulEruption", "shadowBolt", "cleave"],
      damageMult: 1.0, attackSpeedMult: 1.0,
      adaptEvery: 30, adaptDuration: 20, maxAdaptations: 1,
    },
    {
      name: "Rise of the Dead", hpBelow: 0.75,
      description: "Skeletons rise and Soul Drain begins.",
      rotation: ["soulEruption", "raiseDead", "soulDrain", "shadowBolt", "cleave"],
      damageMult: 1.15, attackSpeedMult: 1.1,
      adaptEvery: 25, adaptDuration: 20, maxAdaptations: 1,
      onEnter: (b, ctx) => { b.cooldowns.raiseDead = 0; },
    },
    {
      name: "Crown of Shadows", hpBelow: 0.5,
      description: "Crushing Blow, Shadow Nova and Death Grip. Two adaptations at once.",
      rotation: ["soulEruption", "crushingBlow", "shadowNova", "deathGrip", "soulDrain", "shadowBolt", "cleave"],
      damageMult: 1.3, attackSpeedMult: 1.2,
      adaptEvery: 20, adaptDuration: 20, maxAdaptations: 2,
      onEnter(b, ctx) {
        for (const p of b.enemiesInRange(ctx, 60)) b.dealDamage(p, 12 * b.power, "shadow"); // transition roar
      },
    },
    {
      name: "Hollow Fury", hpBelow: 0.25,
      description: "Doom, faster cooldowns, everything hits harder.",
      rotation: ["soulEruption", "doom", "crushingBlow", "shadowNova", "raiseDead", "deathGrip", "soulDrain", "shadowBolt", "cleave"],
      damageMult: 1.6, attackSpeedMult: 1.4, cooldownRate: 1.5,
      adaptEvery: 15, adaptDuration: 15, maxAdaptations: 2,
      onEnter(b, ctx) {
        for (const p of b.enemiesInRange(ctx, 60)) b.dealDamage(p, 16 * b.power, "shadow");
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
        id: "fixate", name: "Hunter's Grudge", hint: "marks the top damage dealer — the ground erupts under them",
        weight: (s) => (s.topSource ? 2 : 0),
        duration: 8,
        // The boss still attacks the tank — but the top damage dealer gets hunted by eruptions
        // every 2 seconds for 8 seconds. Keep moving!
        onApply(b, ctx, s) {
          let victim = s.topSource;
          if (!victim || victim.isDead || victim.role === "tank") {
            const options = (ctx.enemies || []).filter(p => !p.isDead && p.role !== "tank");
            victim = options[Math.floor(Math.random() * options.length)];
          }
          if (!victim) return;
          b.announce(`${b.name} marks ${victim.name} with Hunter's Grudge!`);
          victim.addBuff({
            id: "huntersGrudge", duration: 8, tickEvery: 2,
            onTick: (p) => { if (!p.isDead) b.eruptUnder(p, { name: "Hunter's Grudge", radius: 3.5, warn: 2.0, duration: 2 }); },
          });
          b.eruptUnder(victim, { name: "Hunter's Grudge", radius: 3.5, warn: 2.0, duration: 2 });
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