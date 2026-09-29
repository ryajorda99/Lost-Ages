// ashenTyrant.js — MYTHIC RAID BOSS: Azgaroth, the Ashen Tyrant.
// 25x the Hollow King's base stats. Built for a 20-player raid at level 60.
// Designed so that ONLY the best players can win: every mechanic is lethal if you get it wrong.
//
// Deadly mechanics (fail = you die, no matter your gear):
//   - Molten Brand: stacks on the tank. 5 stacks = IMMOLATION (death). Tanks must taunt-swap.
//   - Flame Breath: anyone except the tank standing in FRONT of him dies. Stand behind him.
//   - Inferno Rift: the ground glows for 1.2s, then erupts. Still standing in it = death.
//   - Rain of Fire: the same, under EVERY player at once. The whole raid has to move.
//   - Pyroclasm: cast on a random player. If nobody INTERRUPTS it, that player dies.
//   - Rekindle: if not interrupted he heals 5% of his health.
//   - Soul Harvest: every death makes him permanently stronger (more damage, faster,
//     harder to kill) — mistakes snowball.
//   - Enrage at 80 seconds: WORLDFIRE kills everyone. Every death costs damage,
//     so a raid that makes more than a few mistakes runs out of time.
// Logic lives in src/entities/Boss.js.

const { distance } = require("../../classes/Character");

const brandStacks = (u) => u.buffs.find(b => b.id === "moltenBrand")?.stacks || 0;
const randomPlayers = (list, n) => list.filter(p => !p.isDead).sort(() => Math.random() - 0.5).slice(0, n);

const ashenTyrant = {
  name: "Azgaroth, the Ashen Tyrant",
  level: 62,
  type: "demon",           // Knight's Holy Grounds slows demons
  statMultiplier: 25,      // 25x the Hollow King's base

  // Same base as the Hollow King, then x25:
  baseHp: 9000,            // x25 = 225,000 HP
  baseDamage: 60,          // x25 = 1,500 per melee swing
  baseArmor: 12,           // x25 = 300. (Armor x25 would make it immune to Warriors/Rogues)
  attackSpeed: 2.0,
  transitionTime: 4,
  enrageTimer: 80,         // 80 seconds — then WORLDFIRE kills everyone (see onEnrage below)

  // On enrage he burns down the whole raid. Only a raid with almost no deaths
  // does enough damage to kill him in time.
  onEnrage(b, ctx) {
    b.announce(`WORLDFIRE — ${b.name} engulfs the entire raid in flames!`);
    for (const p of ctx.enemies || []) b.lethal(p, "Worldfire (enrage — not enough damage)");
  },

  // SOUL HARVEST: every player that dies makes him permanently stronger for the rest of the fight.
  // Each soul: +5% damage, +3% attack speed, takes 2% less damage, and heals him 0.5% HP.
  // Mistakes snowball — one death makes the next one more likely.
  onPlayerDeath(b, player) {
    const souls = (b.buffs.find(x => x.id === "soulHarvest")?.stacks || 0) + 1;
    b.addBuff({
      id: "soulHarvest", duration: Infinity, stacks: souls,
      mods: {
        damageDealt: 1 + 0.05 * souls,
        damageTaken: Math.max(0.6, 1 - 0.02 * souls),
      },
    });
    b.haste += 3; // each soul: +3% attack speed
    b.hp = Math.min(b.maxHp, b.hp + b.maxHp * 0.005);
    b.announce(`${b.name} consumes ${player.name}'s soul! (${souls} soul${souls > 1 ? "s" : ""}: +${souls * 5}% damage, +${souls * 3}% attack speed, ${Math.min(40, souls * 2)}% less damage taken)`);
  },

  // Raid bosses don't scale with your gear — getting better gear is how you beat them.
  // (With scaling on, the boss grows 2.5x and becomes unbeatable.)
  gearScaling: false,

  // What the simulator uses by default for this boss
  recommended: { level: 60, raidSize: 20 },
  trash: "ashenForge",     // trash mobs file in src/data/mobs/

  // ============================ ABILITIES ============================
  // Damage numbers are multiplied by b.power (25), so they look small here.
  abilities: {
    moltenBrand: {
      name: "Molten Brand", cost: 0, cooldown: 6, range: 8,
      target: "enemy", targetMode: "tank", announce: false,
      // Each stack: +20% damage taken for 10s. At 5 stacks the tank is IMMOLATED (dies).
      execute(b, t) {
        const stacks = brandStacks(t) + 1;
        if (stacks >= 5) {
          b.announce(`${t.name} is IMMOLATED by 5 stacks of Molten Brand! (tanks didn't swap)`);
          return b.lethal(t, "Immolation (no tank swap)");
        }
        t.addBuff({ id: "moltenBrand", duration: 10, stacks, mods: { damageTaken: 1 + 0.2 * stacks } });
        return { damage: b.dealDamage(t, 10 * b.power, "fire"), stacks };
      },
    },

    flameBreath: {
      name: "Flame Breath", cost: 0, cooldown: 8, castTime: 2.0, range: 10,
      target: "enemy", targetMode: "tank", uninterruptible: true, frontal: true,
      // 2s wind-up, then a cone in FRONT of the boss (toward the tank).
      // Tanks take a big hit; anyone else in front DIES. Get behind him!
      execute(b, t, ctx) {
        const fx = t.position.x - b.position.x, fy = t.position.y - b.position.y;
        const inFront = (p) => {
          const px = p.position.x - b.position.x, py = p.position.y - b.position.y;
          return px * fx + py * fy > 0 && Math.hypot(px, py) <= 12;
        };
        let killed = 0;
        for (const p of (ctx.enemies || []).filter(p => !p.isDead && inFront(p))) {
          if (p.role === "tank") b.dealDamage(p, 16 * b.power, "fire");
          else { b.lethal(p, "Flame Breath (stood in front)"); killed++; }
        }
        return { killed };
      },
    },

    infernoRift: {
      name: "Inferno Rift", cost: 0, cooldown: 8, firstUseAfter: 4, range: 60,
      target: "enemy", targetMode: "randomNonTank",
      // The ground glows for 1.2s (move!), then erupts: anyone still inside DIES.
      // Targets damage dealers and healers (the tanks are busy holding the boss).
      // 1.2s is tight: fast players make it out, slow ones don't.
      // More rifts open at once as the fight goes on: 1 → 2 → 3 → 4.
      execute(b, t, ctx) {
        const nonTanks = (ctx.enemies || []).filter(p => p.role !== "tank");
        const targets = randomPlayers(nonTanks, b.phaseIndex + 1);
        for (const victim of targets) {
          const born = b.fightTime;
          b.placeZone({
            name: "Inferno Rift", hostile: true, warn: 1.2,
            position: { ...victim.position }, radius: 5, duration: 10, tickEvery: 0.25,
            onTick(caster, inside) {
              if (caster.fightTime - born < 1.2) return; // warning time
              for (const p of inside) caster.lethal(p, "Inferno Rift (didn't move)");
            },
          });
        }
      },
    },

    rainOfFire: {
      name: "Rain of Fire", cost: 0, cooldown: 18, firstUseAfter: 6, target: "self",
      // Fire erupts under EVERY player at once. 1.5s to move, or die.
      // This tests the whole raid every time — one slow player is one dead player.
      execute(b, t, ctx) {
        const born = b.fightTime;
        for (const p of (ctx.enemies || []).filter(p => !p.isDead)) {
          b.placeZone({
            name: "Rain of Fire", hostile: true, warn: 1.5,
            position: { ...p.position }, radius: 3, duration: 6, tickEvery: 0.25,
            onTick(caster, inside) {
              if (caster.fightTime - born < 1.5) return;
              for (const q of inside) caster.lethal(q, "Rain of Fire (didn't move)");
            },
          });
        }
      },
    },

    pyroclasm: {
      name: "Pyroclasm", cost: 0, cooldown: 9, castTime: 2.5, range: 80,
      target: "enemy", targetMode: "randomNonTank",
      // INTERRUPT IT or the target dies
      execute(b, t) {
        b.announce(`Pyroclasm was not interrupted — ${t.name} is incinerated!`);
        b.lethal(t, "Pyroclasm (not interrupted)");
      },
    },

    meteorSwarm: {
      name: "Meteor Swarm", cost: 0, cooldown: 20, target: "self",
      // Three random players get hit hard
      execute(b, t, ctx) {
        const hit = randomPlayers(ctx.enemies || [], 3);
        for (const p of hit) b.dealDamage(p, 24 * b.power, "fire");
        return { targetsHit: hit.length };
      },
    },

    cataclysm: {
      name: "Cataclysm", cost: 0, cooldown: 35, castTime: 4, target: "self", uninterruptible: true,
      // Whole raid takes heavy damage
      execute(b, t, ctx) {
        const hit = b.enemiesInRange(ctx, 80);
        for (const p of hit) b.dealDamage(p, 20 * b.power, "fire");
        return { targetsHit: hit.length };
      },
    },

    summonElementals: {
      name: "Summon Ash Elementals", cost: 0, cooldown: 45, target: "self",
      execute(b, t, ctx) {
        const count = b.phaseIndex >= 3 ? 5 : 3;
        b.summon(Array.from({ length: count }, (_, i) => ({
          name: `Ash Elemental ${i + 1}`, level: 60, hp: 150 * b.power, damage: 3 * b.power,
          attackSpeed: 2.0, type: "demon", armor: 100,
        })), ctx.enemies || []);
      },
    },

    rekindle: {
      name: "Rekindle", cost: 0, cooldown: 20, castTime: 3, target: "self",
      // Heals the boss for 5% max HP — INTERRUPT IT
      execute(b) {
        const amount = b.maxHp * 0.05;
        b.hp = Math.min(b.maxHp, b.hp + amount);
        b.announce(`${b.name} rekindles, healing ${Math.round(amount).toLocaleString()} HP!`);
      },
    },

    heatWave: {
      name: "Heat Wave", cost: 0, cooldown: 30, target: "self",
      // Burns everyone for 8 seconds
      execute(b, t, ctx) {
        for (const p of b.enemiesInRange(ctx, 80)) {
          p.addBuff({
            id: "heatWave", duration: 8, tickEvery: 1,
            onTick: (o) => b.dealDamage(o, 2 * b.power, "fire"),
          });
        }
      },
    },
  },

  // ============================ PHASES ============================
  phases: [
    {
      name: "Throne of Cinders", hpBelow: 1.0,
      description: "Molten Brand, Flame Breath, Inferno Rifts, Rain of Fire and Pyroclasm from the very start.",
      rotation: ["moltenBrand", "rainOfFire", "pyroclasm", "flameBreath", "infernoRift", "meteorSwarm"],
      damageMult: 1.0, attackSpeedMult: 1.0,
      adaptEvery: 35, adaptDuration: 25, maxAdaptations: 1,
    },
    {
      name: "The Forge Awakens", hpBelow: 0.75,
      description: "Ash Elementals, Cataclysm, and Pyroclasm — interrupt it or someone dies.",
      rotation: ["moltenBrand", "rainOfFire", "pyroclasm", "cataclysm", "summonElementals", "flameBreath", "infernoRift", "meteorSwarm"],
      damageMult: 1.1, attackSpeedMult: 1.1,
      adaptEvery: 30, adaptDuration: 25, maxAdaptations: 1,
      onEnter: (b) => { b.cooldowns.summonElementals = 0; },
    },
    {
      name: "Ashen Tyranny", hpBelow: 0.45,
      description: "He starts healing himself with Rekindle. Interrupt it! Heat Wave burns the raid.",
      rotation: ["moltenBrand", "rainOfFire", "pyroclasm", "rekindle", "cataclysm", "heatWave", "summonElementals", "flameBreath", "infernoRift", "meteorSwarm"],
      damageMult: 1.25, attackSpeedMult: 1.2,
      adaptEvery: 25, adaptDuration: 20, maxAdaptations: 2,
      onEnter(b, ctx) {
        for (const p of b.enemiesInRange(ctx, 80)) b.dealDamage(p, 12 * b.power, "fire");
      },
    },
    {
      name: "Worldbreaker", hpBelow: 0.2,
      description: "FINAL PHASE. Four Inferno Rifts at once, everything faster and harder.",
      rotation: ["moltenBrand", "rainOfFire", "pyroclasm", "rekindle", "cataclysm", "heatWave", "summonElementals", "flameBreath", "infernoRift", "meteorSwarm"],
      damageMult: 1.5, attackSpeedMult: 1.35, cooldownRate: 1.4,
      adaptEvery: 18, adaptDuration: 15, maxAdaptations: 2,
      onEnter(b, ctx) {
        for (const p of b.enemiesInRange(ctx, 80)) b.dealDamage(p, 16 * b.power, "fire");
        b.cooldowns.summonElementals = 0;
      },
    },
  ],

  // ============================ ADAPTATION ============================
  // Same kinds of counters as the Hollow King, fire-themed. (ids like "mirror" and
  // "thorns" have special behavior in Boss.js — keep those ids.)
  // No "Unstoppable" here: it would make Pyroclasm impossible to interrupt, and every
  // death in this fight should be the raid's own mistake.
  adaptation: {
    firstAfter: 25,
    pool: [
      {
        id: "arcaneWard", name: "Obsidian Ward", hint: "takes 50% less spell damage",
        weight: (s) => 1 + s.magicShare * 6,
        mods: { damageTaken_fire: 0.5, damageTaken_frost: 0.5, damageTaken_holy: 0.5, damageTaken_shadow: 0.5, damageTaken_arcane: 0.5 },
      },
      {
        id: "ironHide", name: "Molten Carapace", hint: "takes 50% less physical damage",
        weight: (s) => 1 + s.physicalShare * 6,
        mods: { damageTaken_physical: 0.5 },
      },
      {
        id: "mirror", name: "Flame Mirror", hint: "reflects 30% of spell damage",
        weight: (s) => 0.5 + s.magicShare * 3,
      },
      {
        id: "thorns", name: "Searing Scales", hint: "burns melee attackers for 20% of their damage",
        weight: (s) => 0.5 + s.physicalShare * 3,
      },
      {
        id: "fixate", name: "Tyrant's Gaze", hint: "the ground erupts under the top damage dealer",
        weight: (s) => (s.topSource ? 2 : 0), duration: 8,
        // The tank keeps the boss — but the top damage dealer gets hunted by eruptions
        // every 1.5 seconds for 8 seconds. Stop moving and you die.
        onApply(b, ctx, s) {
          let victim = s.topSource;
          if (!victim || victim.isDead || victim.role === "tank") {
            const options = (ctx.enemies || []).filter(p => !p.isDead && p.role !== "tank");
            victim = options[Math.floor(Math.random() * options.length)];
          }
          if (!victim) return;
          b.announce(`${b.name} glares at ${victim.name}!`);
          victim.addBuff({
            id: "tyrantsGaze", duration: 8, tickEvery: 1.5,
            onTick: (p) => { if (!p.isDead) b.eruptUnder(p, { name: "Tyrant's Gaze", radius: 3.5, warn: 1.3, duration: 1.5 }); },
          });
          b.eruptUnder(victim, { name: "Tyrant's Gaze", radius: 3.5, warn: 1.3, duration: 1.5 });
        },
      },
      {
        id: "regeneration", name: "Everburning", hint: "regenerates 0.5% HP every 2 seconds",
        weight: () => 1.5, tickEvery: 2,
        onTick: (b) => { b.hp = Math.min(b.maxHp, b.hp + b.maxHp * 0.005); },
      },
      {
        id: "frenzy", name: "Blazing Fury", hint: "attacks 40% faster",
        weight: () => 1.5,
        onApply: (b) => { b.haste += 40; },
        onExpire: (b) => { b.haste -= 40; },
      },
      {
        id: "witherAura", name: "Choking Smoke", hint: "players receive 40% less healing",
        weight: () => 1,
        onApply(b, ctx) {
          for (const p of b.enemiesInRange(ctx, 80)) {
            p.addBuff({ id: "withered", duration: 15, dispellable: true, mods: { healingTaken: 0.6 } });
          }
        },
      },
    ],
  },

  // ============================ LOOT ============================
  // Boss-only. Much stronger than the Hollow King's loot (item level 70 vs 30).
  loot: {
    itemLevel: 70,
    lockoutHours: 168,
    randomRolls: 2,
    rarityWeights: { epic: 100 },
    uniqueDrops: [
      {
        chance: 0.2,
        item: {
          name: "Crown of the Ashen Tyrant", slotType: "head", rarity: "epic", armorType: "plate",
          allowedClasses: ["Knight", "Warrior"], stats: { str: 45, sta: 55, faith: 20, armor: 170, blockChance: 0.03 },
        },
      },
      {
        chance: 0.2,
        item: {
          name: "Cinderweave Robes", slotType: "chest", rarity: "epic", armorType: "cloth",
          allowedClasses: ["Mage", "Healer"], stats: { int: 40, faith: 40, sta: 45, haste: 25, armor: 45 },
        },
      },
      {
        chance: 0.2,
        item: {
          name: "Emberfang", slotType: "mainHand", rarity: "epic", weaponType: "dagger",
          allowedClasses: ["Rogue"], weaponDamage: 95, weaponSpeed: 1.6, stats: { agi: 50, sta: 30, crit: 25 },
        },
      },
      {
        chance: 0.15,
        item: {
          name: "Heart of the Worldforge", slotType: "trinket", rarity: "epic",
          stats: { sta: 35, crit: 20, haste: 20 },
        },
      },
      // Legendaries — very rare, one per role
      {
        chance: 0.02,
        item: {
          name: "Tyrantsbane, Greatblade of Cinders", slotType: "mainHand", rarity: "legendary",
          weaponType: "sword", allowedClasses: ["Warrior", "Knight"], weaponDamage: 150, weaponSpeed: 2.4,
          stats: { str: 70, sta: 60, crit: 30 },
          effect: "Attacks have a chance to engulf the target in flames.",
        },
      },
      {
        chance: 0.02,
        item: {
          name: "Staff of the Last Ember", slotType: "mainHand", rarity: "legendary",
          weaponType: "staff", allowedClasses: ["Mage", "Healer"], weaponDamage: 60, weaponSpeed: 3.0,
          stats: { int: 70, faith: 70, sta: 55, haste: 35 },
          effect: "Spells have a chance to cost no mana.",
        },
      },
    ],
  },
};

module.exports = ashenTyrant;