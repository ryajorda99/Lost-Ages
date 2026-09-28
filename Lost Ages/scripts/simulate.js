// simulate.js — human-like bots clear a trash pack (mobs drop loot), then fight a boss.
// Works for 5-player dungeons AND big raids. The group and their gear are SAVED,
// so every run they come back a little better geared — just like real players.
//
//   node scripts/simulate.js                                -> Hollow King, 5 players, level 20
//   node scripts/simulate.js 1 22 5                         -> x1 Hollow King, level 22, up to 5 attempts
//   node scripts/simulate.js --boss ashenTyrant             -> raid boss with its recommended raid (20 players, level 60)
//   node scripts/simulate.js 25 60 3 --boss ashenTyrant --raid 25   -> choose everything yourself
//
// Positional numbers:  [boss multiplier] [player level] [attempts]
// Options:
//   --boss <name>   which boss (hollowKing, ashenTyrant — see src/data/bosses/index.js)
//   --raid <size>   number of players (default: the boss's recommended size, or 5)
//   --fresh         start over with a brand new group (no gear)
//   --quiet         hide the combat log
//   --noscale       turn off gear scaling
//   --skill <tier>  TESTING: make everyone casual / average / skilled / pro
//   --testgear <ilvl>  TESTING: dress everyone in a full set of Epic gear at that item level
//                      (great for checking if a raid is beatable with the right gear)

const fs = require("fs");
const path = require("path");

const { Knight, Mage, Warrior, Rogue, Healer } = require("../src/classes");
const { Enemy } = require("../src/entities/Enemy");
const { Boss } = require("../src/entities/Boss");
const BOSSES = require("../src/data/bosses");
const { PlayerBot } = require("../src/ai/PlayerBot");
const { PLAYBOOKS } = require("../src/ai/playbooks");
const { SKILL_PROFILES, randomSkill, randomPersonality } = require("../src/ai/skillProfiles");
const { Gear } = require("../src/items/Gear");
const { rollMobLoot, rollBossLoot } = require("../src/items/lootRoller");
const { formatItem, generateItem } = require("../src/items/itemGenerator");
const SCALING = require("../src/config/scalingConfig");
const { gearPower, partyGearPower, applyScaling } = require("../src/utils/enemyScaling");
const { distance } = require("../src/classes/Character");

// ================= COMMAND LINE =================
const argv = process.argv.slice(2);
function option(name) {
  const i = argv.indexOf(`--${name}`);
  return i !== -1 ? argv[i + 1] : undefined;
}
const positional = argv.filter((a, i) => !a.startsWith("--") && !(i > 0 && ["--boss", "--raid", "--testgear", "--skill"].includes(argv[i - 1])));

const BOSS_KEY = option("boss") || "hollowKing";
const BOSS_DEF = BOSSES[BOSS_KEY];
if (!BOSS_DEF) {
  console.log(`Unknown boss "${BOSS_KEY}". Choose one of: ${Object.keys(BOSSES).join(", ")}`);
  process.exit(1);
}
const multiplier = Number(positional[0] || BOSS_DEF.statMultiplier);
const partyLevel = Number(positional[1] || BOSS_DEF.recommended?.level || 20);
const maxAttempts = Number(positional[2] || 1);
const RAID_SIZE = Number(option("raid") || BOSS_DEF.recommended?.raidSize || 5);
const QUIET = argv.includes("--quiet");
const FRESH = argv.includes("--fresh");
if (argv.includes("--noscale")) SCALING.enabled = false;

const { MOBS, TRASH_PACKS } = require(`../src/data/mobs/${BOSS_DEF.trash || "hollowCrypt"}`);

// 5-player groups keep using party.json; raids get their own save per size
const SAVE_FILE = path.join(__dirname, "..", "saves", RAID_SIZE === 5 ? "party.json" : `raid-${RAID_SIZE}.json`);
const IS_RAID = RAID_SIZE > 5;

const CLASSES = { Knight, Warrior, Rogue, Mage, Healer };

let time = 0;
const log = (msg) => { if (!QUIET) console.log(`[${time.toFixed(1).padStart(5)}s] ${msg}`); };
const say = (msg) => console.log(msg);

// ================= GROUP MAKEUP =================
// 5 players: one of each class. Raids: 2 tanks, ~1 healer per 5 players, the rest DPS.
function raidComposition(size) {
  if (size <= 5) return ["Knight", "Warrior", "Rogue", "Mage", "Healer"].slice(0, size);
  const tanks = size >= 10 ? 2 : 1;
  const healers = Math.max(1, Math.round(size / 5));
  const dpsClasses = ["Warrior", "Mage", "Rogue"];
  const list = [...Array(tanks).fill("Knight"), ...Array(healers).fill("Healer")];
  for (let i = 0; list.length < size; i++) list.push(dpsClasses[i % dpsClasses.length]);
  return list;
}

const NAMES = ["Aldric", "Brakka", "Vex", "Ryn", "Sera", "Thorne", "Kael", "Mira", "Dusk", "Lyra",
  "Grom", "Nyx", "Bram", "Isolde", "Fenn", "Zara", "Corvin", "Elara", "Hask", "Tamsin",
  "Orin", "Kira", "Doran", "Selene", "Rook", "Ilya", "Garrick", "Wren", "Talos", "Ember",
  "Jax", "Nadia", "Silas", "Freya", "Magnus", "Quinn", "Vera", "Otto", "Luna", "Brom"];

// ================= LOAD OR CREATE THE GROUP =================
function makeBot(name, className, skill, personality) {
  const bot = new PlayerBot(name, skill, personality, PLAYBOOKS[className]);
  bot.className = className;
  bot.gear = new Gear(className);
  return bot;
}

function loadGroup() {
  if (!FRESH && fs.existsSync(SAVE_FILE)) {
    const saved = JSON.parse(fs.readFileSync(SAVE_FILE, "utf8"));
    return saved.map(s => {
      const bot = makeBot(s.name, s.className, s.skill, s.personality);
      bot.p = { ...SKILL_PROFILES[s.skill], ...s.profile }; // keeps what they learned
      bot.gear = Gear.fromJSON(s.gear);
      bot.lootState = s.lootState;
      bot.kills = s.kills || 0;
      bot.attempts = s.attempts || 0;
      return bot;
    });
  }
  const names = NAMES.slice().sort(() => Math.random() - 0.5);
  const forcedSkill = option("skill");
  if (forcedSkill && !SKILL_PROFILES[forcedSkill]) {
    console.log(`Unknown skill "${forcedSkill}". Use: ${Object.keys(SKILL_PROFILES).join(", ")}`);
    process.exit(1);
  }
  return raidComposition(RAID_SIZE).map((cls, i) =>
    makeBot(names[i] || `Player${i + 1}`, cls, forcedSkill || randomSkill(), randomPersonality()));
}

function saveGroup(bots) {
  fs.mkdirSync(path.dirname(SAVE_FILE), { recursive: true });
  fs.writeFileSync(SAVE_FILE, JSON.stringify(bots.map(b => ({
    name: b.name, className: b.className, skill: b.skillKey, personality: b.personalityKey,
    profile: b.p, gear: b.gear.toJSON(), lootState: b.lootState, kills: b.kills || 0, attempts: b.attempts || 0,
  })), null, 2));
}

const bots = loadGroup();

// --testgear: give everyone a full Epic set (for balance testing)
const TEST_GEAR = Number(option("testgear") || 0);
if (TEST_GEAR) {
  for (const b of bots) {
    b.gear = new Gear(b.className);
    for (const slotType of ["head", "shoulders", "chest", "hands", "legs", "feet", "neck", "ring", "ring", "trinket", "mainHand", "offHand"]) {
      const item = generateItem({ itemLevel: TEST_GEAR, rarity: "epic", forClass: b.className, sourceType: "boss", slotType, source: "test gear" });
      item.requiredLevel = 1;
      b.gear.bag.push(item);
    }
    b.gear.equipUpgrades(partyLevel);
  }
}
bots.find(b => b.className === "Knight").mainTank = true; // first Knight pulls the boss
for (const bot of bots) bot.onSay = (b, msg) => log(`💬 [${IS_RAID ? "Raid" : "Party"}] ${b.name}: ${msg}`);

say(`${BOSS_DEF.name} x${multiplier} — ${bots.length} players, level ${partyLevel}${FRESH ? " (fresh group)" : ""}`);
say("Name     Class    Skill    Personality  Gear");
for (const b of bots) {
  say(`  ${b.name.padEnd(7)} ${b.className.padEnd(8)} ${b.p.label.padEnd(8)} ${b.personality.label.padEnd(11)}  ` +
      `ilvl ${b.gear.itemLevel()} (${b.gear.slotsFilled()}/12 slots)${b.kills ? `, ${b.kills} boss kill(s)` : ""}` +
      (b.mainTank ? "  [main tank]" : ""));
}

// ================= GEAR SCALING =================
function partyPower() {
  const powers = bots.map(b => gearPower(new CLASSES[b.className](b.name, partyLevel), b.gear));
  return partyGearPower(powers);
}

function describeScaling(power, mult, label) {
  const gear = `Party gear power +${Math.round((power - 1) * 100)}%`;
  if (mult.hp === 1 && mult.damage === 1) return `${gear} | ${label} scaling off`;
  return `${gear} → ${label} scaled: HP +${Math.round((mult.hp - 1) * 100)}%, damage +${Math.round((mult.damage - 1) * 100)}%`;
}

// ================= POSITIONS =================
// Tanks next to the boss, melee around it, ranged spread out behind
function startSpot(bot, index) {
  const sameClassBefore = bots.slice(0, index).filter(b => b.className === bot.className).length;
  const n = sameClassBefore;
  switch (bot.className) {
    case "Knight":  return { x: 0, y: 2 - n * 4 };
    case "Warrior": return { x: 6, y: -3 + n * 1.5 };
    case "Rogue":   return { x: 5, y: 3 + n * 1.5 };
    case "Mage":    return { x: -20, y: -8 + n * 3 };
    case "Healer":  return { x: -18, y: 6 - n * 3 };
  }
}

// Fresh characters each fight (full HP/mana), with each bot's gear applied
function spawnParty() {
  return bots.map((b, i) => {
    const c = new CLASSES[b.className](b.name, partyLevel, startSpot(b, i));
    b.gear.applyTo(c);
    b.attach(c);
    return c;
  });
}

// ================= ONE FIGHT =================
function runFight(enemies, { boss = null } = {}) {
  time = 0;
  const party = spawnParty();
  const tank = bots.find(b => b.mainTank)?.character || party[0];
  const stats = Object.fromEntries(party.map(p => [p.name, { damage: 0, healing: 0, diedAt: null, diedTo: null }]));

  // What is the boss doing right now? (for "died to X" messages)
  let executing = null;
  if (boss) {
    const orig = boss.finishAbility.bind(boss);
    boss.finishAbility = (key, t, ctx) => { executing = boss.abilities[key].name; const r = orig(key, t, ctx); executing = null; return r; };
    boss.onAnnounce = (msg) => {
      if (/^PHASE|ADAPTS|fixates|glares|BERSERK|WORLDFIRE|rekindles|IMMOLATED|incinerated|consumes/.test(msg)) log(`>>> ${msg}`);
      if (msg.startsWith("PHASE") && boss.phaseIndex > 0) bots.find(b => !b.character.isDead)?.say("phase", time, 5);
    };
  }

  for (const p of party) {
    const bot = bots.find(b => b.character === p);
    const dd = p.dealDamage.bind(p);
    p.dealDamage = (t, a, s) => { const d = dd(t, a, s); stats[p.name].damage += d; return d; };
    const hh = p.heal.bind(p);
    p.heal = (t, a) => { const h = hh(t, a); stats[p.name].healing += h; return h; };
    const td = p.takeDamage.bind(p);
    p.takeDamage = (amount, source, school) => {
      let cause = executing;
      if (!cause && source && source !== boss) cause = source.name;
      if (!cause && boss) cause = boss.zones.find(z => z.hostile && distance({ position: z.position }, p) <= z.radius)?.name;
      if (!cause && p.hasBuff("doom") && p.buffs.find(x => x.id === "doom").remaining < 0.2) cause = "Doom";
      if (!cause && p.hasBuff("soulDrain")) cause = "Soul Drain";
      if (!cause && p.hasBuff("heatWave")) cause = "Heat Wave";
      p._lastHitBy = cause || "melee hit";
      return td(amount, source, school);
    };
    p.onDeath = () => {
      if (p._deathCause) p._lastHitBy = p._deathCause;   // killed by a failed mechanic
      stats[p.name].diedAt = time;
      stats[p.name].diedTo = p._lastHitBy;
      log(`💀 ${p.name} (${p.className}) died to ${p._lastHitBy}`);
      bot.say("died", time, 0);
    };
  }

  // Everything notices the tank when combat starts
  for (const e of enemies) e.addThreat(tank, 1);

  const alive = () => enemies.filter(e => !e.isDead);
  const allEnemies = () => boss ? [boss, ...boss.minions.filter(m => !m.isDead)] : alive();

  const world = {
    party, tank,
    get boss() { return boss || alive()[0] || enemies[0]; },
    get adds() { return boss ? boss.minions : alive().slice(1); },
    ctxFor: (c) => ({ allies: party.filter(a => a !== c), enemies: allEnemies() }),
  };

  const dt = 0.05;
  party.forEach(p => p.enterCombat());
  let lastReport = 0;
  const killed = new Set();

  while (alive().length && party.some(p => !p.isDead) && time < 900) {
    for (const bot of bots) {
      bot.think(time, dt, world);
      bot.character.update(dt, world.ctxFor(bot.character));
    }
    for (const e of alive()) e.update(dt, { allies: [], enemies: party });
    for (const e of enemies) if (e.isDead && !killed.has(e)) { killed.add(e); if (!boss) log(`☠ ${e.name} defeated`); }

    if (boss && time - lastReport >= 20) {
      lastReport = time;
      const aliveCount = party.filter(p => !p.isDead).length;
      log(`Boss ${Math.round(boss.hp / boss.maxHp * 100)}% (phase ${boss.phaseIndex + 1}) | ` +
        (IS_RAID ? `alive ${aliveCount}/${party.length} | tanking: ${boss.pickTarget()?.name}`
                 : party.map(p => `${p.name} ${p.isDead ? "DEAD" : Math.round(p.hp / p.maxHp * 100) + "%"}`).join(" | ")));
    }
    time += dt;
  }
  return { won: !alive().length, time, stats, killed: [...killed] };
}

// ================= LOOT =================
function giveLoot(bot, items, from) {
  if (!items.length) return;
  const res = bot.handleLoot(items, partyLevel, time);
  for (const item of items) {
    const up = res.equipped.find(e => e.item === item);
    const forgot = res.forgot.includes(item);
    const can = bot.gear.canEquip(item, partyLevel);
    // In raids, only list the interesting drops so the log stays readable
    if (IS_RAID && !up && !forgot && !item.bossOnly && item.rarity !== "legendary") { lootSkipped++; continue; }
    const tag = up ? "  ⬆ EQUIPPED"
      : forgot ? "  (upgrade — but forgot to equip it!)"
      : !can.ok ? `  (${can.reason})`
      : "";
    say(`  🎁 ${bot.name} looted ${formatItem(item)} from ${from}${tag}`);
  }
}
let lootSkipped = 0;

// ================= ATTEMPTS =================
const history = [];
for (let attempt = 1; attempt <= maxAttempts; attempt++) {
  say(`\n================ ATTEMPT ${attempt} ================`);

  // --- 1. Trash pack ---
  const packKeys = TRASH_PACKS[Math.floor(Math.random() * TRASH_PACKS.length)];
  const pack = packKeys.map((k, i) => new Enemy({ ...MOBS[k], position: { x: 4 + i * 1.5, y: i - 1 } }));
  const trashPower = partyPower();
  let mobMult;
  pack.forEach(m => { mobMult = applyScaling(m, trashPower); });
  say(`\n-- Trash: ${pack.map(m => m.name + (m.elite ? " (elite)" : "")).join(", ")} --`);
  say(`   ${describeScaling(trashPower, mobMult, "mobs")}`);
  const trash = runFight(pack);
  if (!trash.won) {
    say(`WIPE on trash at ${trash.time.toFixed(0)}s`);
    history.push("wiped on trash");
    for (const bot of bots) bot.learn(trash.stats[bot.name].diedTo);
    continue;
  }
  say(`Cleared in ${trash.time.toFixed(0)}s`);
  lootSkipped = 0;
  for (const mob of trash.killed) for (const bot of bots) giveLoot(bot, rollMobLoot(bot, mob), mob.name);
  if (lootSkipped) say(`  (+${lootSkipped} other drops that weren't upgrades)`);

  // --- 2. Boss ---
  say(`\n-- ${BOSS_DEF.name} --`);
  const boss = new Boss({ ...BOSS_DEF, statMultiplier: multiplier }, { x: 3, y: 0 });
  const bossPower = partyPower();
  const bossMult = applyScaling(boss, bossPower);
  say(`   ${describeScaling(bossPower, bossMult, "boss")} (boss HP ${boss.maxHp.toLocaleString()})`);
  const fight = runFight([boss], { boss });

  if (fight.won) say(`\n🏆 VICTORY in ${fight.time.toFixed(1)}s!`);
  else say(`\nWIPE at ${fight.time.toFixed(1)}s — boss at ${Math.round(boss.hp / boss.maxHp * 100)}% (phase ${boss.phaseIndex + 1})${boss.enraged ? " — hit the enrage timer" : ""}`);

  say("Name     Class     Damage   DPS  Healing  Died");
  for (const bot of bots) {
    const s = fight.stats[bot.name];
    say(`  ${bot.name.padEnd(7)} ${bot.className.padEnd(8)} ${String(Math.round(s.damage)).padStart(7)} ${String(Math.round(s.damage / fight.time)).padStart(5)} ${String(Math.round(s.healing)).padStart(8)}  ${s.diedAt == null ? "-" : `${s.diedAt.toFixed(0)}s (${s.diedTo})`}`);
  }
  if (IS_RAID) {
    const deaths = {};
    for (const s of Object.values(fight.stats)) if (s.diedTo) deaths[s.diedTo] = (deaths[s.diedTo] || 0) + 1;
    const total = Object.values(fight.stats).reduce((a, s) => a + s.damage, 0);
    say(`Raid DPS: ${Math.round(total / fight.time).toLocaleString()} | Deaths: ${Object.entries(deaths).map(([k, v]) => `${k} x${v}`).join(", ") || "none"}`);
    const souls = boss.buffs.find(b => b.id === "soulHarvest")?.stacks;
    if (souls) say(`Souls consumed by the boss: ${souls}`);
  }

  if (fight.won) {
    say(`\n-- Boss loot --`);
    lootSkipped = 0;
    for (const bot of bots) {
      bot.kills = (bot.kills || 0) + 1;
      bot.lootState = bot.lootState || { lockouts: {}, pity: {} };
      const res = rollBossLoot(bot, BOSS_DEF, { ignoreLockout: true });
      giveLoot(bot, res.items, BOSS_DEF.name);
    }
    if (lootSkipped) say(`  (+${lootSkipped} other drops that weren't upgrades)`);
    history.push("KILL");
    bots[Math.floor(Math.random() * bots.length)].say("win", 9999, 0);
    break;
  }
  history.push(`wipe at ${Math.round(boss.hp / boss.maxHp * 100)}%${boss.enraged ? " (enrage)" : ""}`);
  bots[Math.floor(Math.random() * bots.length)].say("wipe", 9999, 0);
  for (const bot of bots) bot.learn(fight.stats[bot.name].diedTo);
}

// ================= SUMMARY + SAVE =================
say("\n================ SUMMARY ================");
say(history.map((h, i) => `Attempt ${i + 1}: ${h}`).join("\n"));
const avgIlvl = Math.round(bots.reduce((s, b) => s + b.gear.itemLevel(), 0) / bots.length);
say(`\nAverage item level: ${avgIlvl}`);
if (!IS_RAID) for (const b of bots) say(`  ${b.name.padEnd(7)} ${b.className.padEnd(8)} ilvl ${b.gear.itemLevel()} (${b.gear.slotsFilled()}/12 slots)`);
saveGroup(bots);
say(`\nSaved to saves/${path.basename(SAVE_FILE)} — run again to continue with the same group.`);