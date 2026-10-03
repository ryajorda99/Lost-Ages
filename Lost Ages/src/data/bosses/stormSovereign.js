// stormSovereign.js — TIER 3 RAID BOSS: Vorathyx, the Storm Sovereign (a storm dragon).
// x30 — the next step after Azgaroth (x25). Tougher base stats AND faster, nastier mechanics.
// Built for a 20-player raid at level 60 wearing Azgaroth's gear (item level 70) — and it drops
// item level 80 gear, the best in the game.
//
// Deadly mechanics (fail = you die, no matter your gear):
//   - Thunderclaw: Static Charge stacks on the tank. 5 stacks = OVERLOAD (death). Tanks must swap.
//   - Lightning Breath: anyone except the tank in FRONT of the dragon dies. Faster wind-up than Flame Breath.
//   - Cyclone: the ground swirls for 1.2s, then a tornado touches down — still in it = death.
//   - Thunderstorm: lightning strikes under EVERY player. 1.5s to move — and it comes more often than Rain of Fire.
//   - Storm Call: INTERRUPT IT or the target is struck down.
//   - Ion Surge: a player is charged with lightning — a healer/druid must CLEANSE it within 6s or they die.
//   - Recharge: if not interrupted he heals 6% of his health.
//   - Skyborne: in phase 3 he takes to the sky — 85% less damage taken while Sky Strikes hunt 2 players every 3s.
//   - Conduit: every death charges the storm (more damage, faster attacks).
//   - Enrage at 100s: EYE OF THE HURRICANE kills everyone.
// Logic lives in src/entities/Boss.js.

const chargeStacks = (u) => u.buffs.find(b => b.id === "staticCharge")?.stacks || 0;
const randomPlayers = (list, n) => list.filter(p => !p.isDead).sort(() => Math.random() - 0.5).slice(0, n);

// Tornadoes: a swirling warning circle, then anyone inside dies
function cyclone(b, victim, warn = 1.2, radius = 5) {
  const born = b.fightTime;
  b.placeZone({
    name: "Cyclone", hostile: true, warn,
    position: { ...victim.position }, radius, duration: warn + 7, tickEvery: 0.25,
    onTick(caster, inside) {
      if (caster.fightTime - born < warn) return;
      for (const p of inside) caster.lethal(p, "Cyclone (didn't move)");
    },
  });
}

// Lightning strikes under every player
function thunderstorm(b, ctx, warn = 1.5) {
  const born = b.fightTime;
  for (const p of (ctx.enemies || []).filter(p => !p.isDead)) {
    b.placeZone({
      name: "Thunderstorm", hostile: true, warn,
      position: { ...p.position }, radius: 3, duration: warn + 3, tickEvery: 0.25,
      onTick(caster, inside) {
        if (caster.fightTime - born < warn) return;
        for (const q of inside) caster.lethal(q, "Thunderstorm (didn't move)");
      },
    });
  }
}

const stormSovereign = {
  name: "Vorathyx, the Storm Sovereign",
  level: 64,
  type: "dragon",
  statMultiplier: 30,

  baseHp: 11000,           // x30 = 330,000 HP (Azgaroth: 225,000)
  baseDamage: 66,          // x30 = 1,980 per claw swipe (Azgaroth: 1,500)
  baseArmor: 11,           // x30 = 330
  attackSpeed: 2.0,
  transitionTime: 4,
  enrageTimer: 100,        // then EYE OF THE HURRICANE

  onEnrage(b, ctx) {
    b.announce(`EYE OF THE HURRICANE — ${b.name} tears the raid apart with the full fury of the storm!`);
    for (const p of ctx.enemies || []) b.lethal(p, "Eye of the Hurricane (enrage — not enough damage)");
  },

  // CONDUIT: every death charges the storm. +6% damage, +3% attack speed, heals 0.5%.
  onPlayerDeath(b, player) {
    const charge = (b.buffs.find(x => x.id === "conduit")?.stacks || 0) + 1;
    b.addBuff({ id: "conduit", duration: Infinity, stacks: charge, mods: { damageDealt: 1 + 0.06 * charge } });
    b.haste += 3;
    b.hp = Math.min(b.maxHp, b.hp + b.maxHp * 0.005);
    b.announce(`${b.name} absorbs ${player.name}'s life as lightning! (${charge} charge${charge > 1 ? "s" : ""}: +${charge * 6}% damage, +${charge * 3}% attack speed)`);
  },

  gearScaling: false,
  recommended: { level: 60, raidSize: 20 },
  trash: "stormSpire",

  // ============================ ABILITIES ============================
  // Damage numbers are multiplied by b.power (30).
  abilities: {
    thunderclaw: {
      name: "Thunderclaw", cost: 0, cooldown: 6, range: 8,
      target: "enemy", targetMode: "tank", announce: false,
      // Each Static Charge: +20% damage taken for 10s. 5 charges = OVERLOAD (death). Swap tanks!
      execute(b, t) {
        const stacks = chargeStacks(t) + 1;
        if (stacks >= 5) {
          b.announce(`${t.name} is OVERLOADED by 5 Static Charges! (tanks didn't swap)`);
          return b.lethal(t, "Overload (no tank swap)");
        }
        t.addBuff({
          id: "staticCharge", duration: 10, stacks, mods: { damageTaken: 1 + 0.2 * stacks },
          swapStacks: true, swapMechanic: "Overload",   // tells the Knights this is a tank-swap mechanic
        });
        return { damage: b.dealDamage(t, 11 * b.power, "nature"), stacks };
      },
    },

    lightningBreath: {
      name: "Lightning Breath", cost: 0, cooldown: 8, castTime: 1.8, range: 10,
      target: "enemy", targetMode: "tank", uninterruptible: true, frontal: true,
      // 1.8s wind-up (faster than Flame Breath), then a cone in front of the dragon.
      execute(b, t, ctx) {
        const fx = t.position.x - b.position.x, fy = t.position.y - b.position.y;
        const inFront = (p) => {
          const px = p.position.x - b.position.x, py = p.position.y - b.position.y;
          return px * fx + py * fy > 0 && Math.hypot(px, py) <= 14;
        };
        let killed = 0;
        for (const p of (ctx.enemies || []).filter(p => !p.isDead && inFront(p))) {
          if (p.role === "tank") b.dealDamage(p, 17 * b.power, "nature");
          else { b.lethal(p, "Lightning Breath (stood in front)"); killed++; }
        }
        return { killed };
      },
    },

    cyclone: {
      name: "Cyclone", cost: 0, cooldown: 8, firstUseAfter: 4, range: 60,
      target: "enemy", targetMode: "randomNonTank",
      // Tornadoes touch down under damage dealers/healers: 1 → 2 → 3 → 4 at once as the fight goes on
      execute(b, t, ctx) {
        const nonTanks = (ctx.enemies || []).filter(p => p.role !== "tank");
        for (const victim of randomPlayers(nonTanks, b.phaseIndex + 1)) cyclone(b, victim);
      },
    },

    thunderstorm: {
      name: "Thunderstorm", cost: 0, cooldown: 17, firstUseAfter: 6, target: "self",
      requires: (b) => (b.flying ? "busy flying" : null),   // never stacks with Skyborne's lightning
      execute(b, t, ctx) { thunderstorm(b, ctx); },
    },

    stormCall: {
      name: "Storm Call", cost: 0, cooldown: 9, castTime: 2.2, range: 80,
      target: "enemy", targetMode: "randomNonTank",
      // INTERRUPT IT or the target is struck down
      execute(b, t) {
        b.announce(`Storm Call was not interrupted — ${t.name} is struck down by lightning!`);
        b.lethal(t, "Storm Call (not interrupted)");
      },
    },

    chainLightning: {
      name: "Chain Lightning", cost: 0, cooldown: 12, target: "self",
      // Hits one player, then jumps to up to 4 more within 10m — each jump hits HARDER.
      // Spread out so it has nowhere to jump!
      execute(b, t, ctx) {
        const alive = (ctx.enemies || []).filter(p => !p.isDead);
        let current = randomPlayers(alive.filter(p => p.role !== "tank"), 1)[0] || alive[0];
        const hit = [];
        let dmg = 12 * b.power;
        while (current && hit.length < 5) {
          hit.push(current);
          b.dealDamage(current, dmg, "nature");
          dmg *= 1.15;
          const from = current;
          current = alive.filter(p => !hit.includes(p) && Math.hypot(p.position.x - from.position.x, p.position.y - from.position.y) <= 10)
            .sort((a, c) => Math.hypot(a.position.x - from.position.x, a.position.y - from.position.y) - Math.hypot(c.position.x - from.position.x, c.position.y - from.position.y))[0];
        }
        return { targetsHit: hit.length };
      },
    },

    ionSurge: {
      name: "Ion Surge", cost: 0, cooldown: 18, range: 60,
      target: "enemy", targetMode: "randomNonTank",
      // Charged with lightning: must be CLEANSED (Purify / Remove Corruption) within 6s or they die
      execute(b, t) {
        t.addBuff({
          id: "ionSurge", duration: 6.05, tickEvery: 6, dispellable: true,
          mustDispel: true, mechanic: "Ion Surge",   // healers and druids treat this like Doom
          onTick: (o) => b.lethal(o, "Ion Surge (not cleansed)"),
        });
      },
    },

    recharge: {
      name: "Recharge", cost: 0, cooldown: 20, castTime: 3, target: "self",
      // Heals 6% max HP — INTERRUPT IT
      execute(b) {
        const amount = b.maxHp * 0.06;
        b.hp = Math.min(b.maxHp, b.hp + amount);
        b.announce(`${b.name} recharges, healing ${Math.round(amount).toLocaleString()} HP!`);
      },
    },

    tempest: {
      name: "Tempest", cost: 0, cooldown: 32, castTime: 4, target: "self", uninterruptible: true,
      // The whole raid takes heavy damage
      execute(b, t, ctx) {
        const hit = b.enemiesInRange(ctx, 80);
        for (const p of hit) b.dealDamage(p, 20 * b.power, "nature");
        return { targetsHit: hit.length };
      },
    },

    staticField: {
      name: "Static Field", cost: 0, cooldown: 28, target: "self",
      // Everyone is shocked for 8 seconds
      execute(b, t, ctx) {
        for (const p of b.enemiesInRange(ctx, 80)) {
          p.addBuff({ id: "staticField", duration: 8, tickEvery: 1, onTick: (o) => b.dealDamage(o, 2.2 * b.power, "nature") });
        }
      },
    },

    summonStormlings: {
      name: "Summon Stormlings", cost: 0, cooldown: 40, target: "self",
      execute(b, t, ctx) {
        const count = b.phaseIndex >= 3 ? 5 : 3;
        b.summon(Array.from({ length: count }, (_, i) => ({
          name: `Stormling ${i + 1}`, level: 62, hp: 160 * b.power, damage: 3.2 * b.power,
          attackSpeed: 1.8, type: "elemental", armor: 100,
        })), ctx.enemies || []);
      },
    },

    skyborne: {
      name: "Skyborne", cost: 0, cooldown: 40, target: "self",
      // He takes to the sky for 8 seconds and takes 85% less damage. Every 3 seconds lightning
      // strikes under 2 damage dealers/healers — keep moving until he lands. (Tanks are left alone.)
      execute(b, t, ctx) {
        b.announce(`${b.name} takes to the skies! Lightning strikes hunt the raid — survive until he lands!`);
        b.flying = true;
        const strike = () => {
          const nonTanks = (ctx.enemies || []).filter(p => p.role !== "tank");
          for (const p of randomPlayers(nonTanks, 2)) {
            b.eruptUnder(p, { name: "Sky Strike", radius: 3.5, warn: 1.5, duration: 1.5 });
          }
        };
        strike();
        b.addBuff({
          id: "skyborne", duration: 8, tickEvery: 3, mods: { damageTaken: 0.15 },
          onTick: strike,
          onExpire: (o) => { o.flying = false; o.announce?.(`${o.name} lands!`); },
        });
      },
    },
  },

  // ============================ PHASES ============================
  phases: [
    {
      name: "The Gathering Storm", hpBelow: 1.0,
      description: "Thunderclaw, Lightning Breath, Cyclones, Thunderstorm, Storm Call and Chain Lightning from the start.",
      rotation: ["thunderclaw", "thunderstorm", "stormCall", "lightningBreath", "cyclone", "chainLightning"],
      damageMult: 1.0, attackSpeedMult: 1.0,
      adaptEvery: 30, adaptDuration: 25, maxAdaptations: 1,
    },
    {
      name: "Eye of the Tempest", hpBelow: 0.75,
      description: "Stormlings join the fight, Ion Surge must be cleansed, and Tempest batters the raid.",
      rotation: ["thunderclaw", "thunderstorm", "stormCall", "ionSurge", "tempest", "summonStormlings", "lightningBreath", "cyclone", "chainLightning"],
      damageMult: 1.1, attackSpeedMult: 1.1,
      adaptEvery: 28, adaptDuration: 22, maxAdaptations: 1,
      onEnter: (b) => { b.cooldowns.summonStormlings = 0; },
    },
    {
      name: "Skyborne", hpBelow: 0.45,
      description: "He takes to the sky, starts Recharging (interrupt it!) and Static Field shocks everyone.",
      rotation: ["thunderclaw", "skyborne", "thunderstorm", "stormCall", "recharge", "ionSurge", "tempest", "staticField", "summonStormlings", "lightningBreath", "cyclone", "chainLightning"],
      damageMult: 1.25, attackSpeedMult: 1.2,
      adaptEvery: 22, adaptDuration: 18, maxAdaptations: 2,
      onEnter(b, ctx) {
        for (const p of b.enemiesInRange(ctx, 80)) b.dealDamage(p, 12 * b.power, "nature");
        b.cooldowns.skyborne = 0;
      },
    },
    {
      name: "Storm Sovereign", hpBelow: 0.2,
      description: "FINAL PHASE. Four Cyclones at once, and everything comes faster.",
      rotation: ["thunderclaw", "skyborne", "thunderstorm", "stormCall", "recharge", "ionSurge", "tempest", "staticField", "summonStormlings", "lightningBreath", "cyclone", "chainLightning"],
      damageMult: 1.5, attackSpeedMult: 1.35, cooldownRate: 1.5,
      adaptEvery: 16, adaptDuration: 14, maxAdaptations: 2,
      onEnter(b, ctx) {
        for (const p of b.enemiesInRange(ctx, 80)) b.dealDamage(p, 16 * b.power, "nature");
        b.cooldowns.summonStormlings = 0;
      },
    },
  ],

  // ============================ ADAPTATION ============================
  adaptation: {
    firstAfter: 22,
    pool: [
      {
        id: "arcaneWard", name: "Stormshield", hint: "takes 50% less spell damage",
        weight: (s) => 1 + s.magicShare * 6,
        mods: { damageTaken_fire: 0.5, damageTaken_frost: 0.5, damageTaken_holy: 0.5, damageTaken_shadow: 0.5, damageTaken_arcane: 0.5, damageTaken_nature: 0.5 },
      },
      {
        id: "ironHide", name: "Thunderscale", hint: "takes 50% less physical damage",
        weight: (s) => 1 + s.physicalShare * 6,
        mods: { damageTaken_physical: 0.5 },
      },
      { id: "mirror", name: "Lightning Mirror", hint: "reflects 30% of spell damage", weight: (s) => 0.5 + s.magicShare * 3 },
      { id: "thorns", name: "Crackling Scales", hint: "shocks melee attackers for 20% of their damage", weight: (s) => 0.5 + s.physicalShare * 3 },
      {
        id: "fixate", name: "Lightning Rod", hint: "tornadoes hunt the top damage dealer",
        weight: (s) => (s.topSource ? 2 : 0), duration: 8,
        onApply(b, ctx, s) {
          let victim = s.topSource;
          if (!victim || victim.isDead || victim.role === "tank") {
            const options = (ctx.enemies || []).filter(p => !p.isDead && p.role !== "tank");
            victim = options[Math.floor(Math.random() * options.length)];
          }
          if (!victim) return;
          b.announce(`${b.name} fixates on ${victim.name} — Lightning Rod!`);
          victim.addBuff({
            id: "lightningRod", duration: 8, tickEvery: 1.5,
            onTick: (p) => { if (!p.isDead) b.eruptUnder(p, { name: "Lightning Rod", radius: 3.5, warn: 1.2, duration: 1.5 }); },
          });
          b.eruptUnder(victim, { name: "Lightning Rod", radius: 3.5, warn: 1.2, duration: 1.5 });
        },
      },
      {
        id: "regeneration", name: "Storm Renewal", hint: "regenerates 0.5% HP every 2 seconds",
        weight: () => 1.5, tickEvery: 2,
        onTick: (b) => { b.hp = Math.min(b.maxHp, b.hp + b.maxHp * 0.005); },
      },
      {
        id: "frenzy", name: "Hurricane Fury", hint: "attacks 40% faster",
        weight: () => 1.5,
        onApply: (b) => { b.haste += 40; },
        onExpire: (b) => { b.haste -= 40; },
      },
      {
        id: "witherAura", name: "Ozone Haze", hint: "players receive 40% less healing",
        weight: () => 1,
        onApply(b, ctx) {
          for (const p of b.enemiesInRange(ctx, 80)) p.addBuff({ id: "withered", duration: 15, dispellable: true, mods: { healingTaken: 0.6 } });
        },
      },
    ],
  },

  // ============================ LOOT ============================
  // The best gear in the game: item level 80 (Azgaroth drops 70).
  loot: {
    itemLevel: 80,
    lockoutHours: 168,
    randomRolls: 2,
    rarityWeights: { epic: 100 },
    uniqueDrops: [
      { chance: 0.2, item: { name: "Crown of the Storm Sovereign", slotType: "head", rarity: "epic", armorType: "plate",
          allowedClasses: ["Knight", "Warrior", "Valkyrie"], stats: { str: 56, sta: 68, faith: 24, armor: 210, blockChance: 0.03 } } },
      { chance: 0.2, item: { name: "Stormweave Mantle", slotType: "shoulders", rarity: "epic", armorType: "cloth",
          allowedClasses: ["Mage", "Healer", "Necromancer"], stats: { int: 46, faith: 46, sta: 50, haste: 30, armor: 50 } } },
      { chance: 0.2, item: { name: "Galehide Raiment", slotType: "chest", rarity: "epic", armorType: "leather",
          allowedClasses: ["Druid"], stats: { int: 48, faith: 40, sta: 56, haste: 28, armor: 110 } } },
      { chance: 0.2, item: { name: "Thunderfang", slotType: "mainHand", rarity: "epic", weaponType: "dagger",
          allowedClasses: ["Rogue"], weaponDamage: 120, weaponSpeed: 1.6, stats: { agi: 62, sta: 38, crit: 30 } } },
      { chance: 0.2, item: { name: "Skyrender Lance", slotType: "mainHand", rarity: "epic", weaponType: "spear",
          allowedClasses: ["Valkyrie"], weaponDamage: 130, weaponSpeed: 2.6, stats: { str: 52, sta: 60, crit: 24 } } },
      { chance: 0.2, item: { name: "Stormbreaker", slotType: "mainHand", rarity: "epic", weaponType: "axe",
          allowedClasses: ["Warrior"], weaponDamage: 150, weaponSpeed: 2.8, stats: { str: 60, sta: 40, crit: 30 } } },
      { chance: 0.15, item: { name: "Heart of the Hurricane", slotType: "trinket", rarity: "epic",
          stats: { sta: 44, crit: 26, haste: 26 } } },
      // Legendaries — very rare
      { chance: 0.02, item: { name: "Vorathyx's Last Breath", slotType: "mainHand", rarity: "legendary",
          weaponType: "staff", allowedClasses: ["Mage", "Healer", "Druid", "Necromancer"], weaponDamage: 75, weaponSpeed: 3.0,
          stats: { int: 88, faith: 88, sta: 70, haste: 44 }, effect: "Spells have a chance to chain to a second target." } },
      { chance: 0.02, item: { name: "Fulgur, Spear of the Sovereign", slotType: "mainHand", rarity: "legendary",
          weaponType: "spear", allowedClasses: ["Valkyrie"], weaponDamage: 185, weaponSpeed: 2.6,
          stats: { str: 88, sta: 76, crit: 38 }, effect: "Attacks have a chance to call down lightning." } },
      { chance: 0.02, item: { name: "Stormcaller's Oath", slotType: "mainHand", rarity: "legendary",
          weaponType: "sword", allowedClasses: ["Knight", "Warrior"], weaponDamage: 185, weaponSpeed: 2.4,
          stats: { str: 88, sta: 76, faith: 40 }, effect: "Righteous attacks crackle with lightning." } },
    ],
  },
};

module.exports = stormSovereign;