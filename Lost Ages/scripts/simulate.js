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
//   --skill <tier>  make everyone this skill level (and that's as good as they'll get)
//                   Without it, a NEW group starts as beginners and learns the fight over time.
//   --farm          keep doing attempts even after a kill (watch them learn over many runs)
//
// WATCHING: by default your browser opens and shows each fight LIVE as it happens.
// Every boss fight is also saved to the replays/ folder (rewatch with: node scripts/viewer.js).
//   --fast          don't show fights — just simulate as fast as possible (good for --farm)
//   --speed <n>     watch faster, e.g. --speed 2 (default 1 = real time)
//   --2d            watch in the old top-down 2D viewer instead of 3D (3D is the default)
//   --play <name>   PLAY one of the raid members yourself (e.g. --play Courtney). You can also
//                   click "Take control" in the 3D viewer. WASD move, 1-0 abilities, Tab target.
//   --record        with --fast: still save boss fights as replays
//   --port <n>      port for the live viewer (default 3000)    --noopen  don't open the browser
//   (The main menu, scripts/play.js, starts fights with these options for you.)
//   --potential <tier>  TESTING: new players start as beginners but can all grow to this tier
//   --testgear <ilvl>  TESTING: dress everyone in a full set of Epic gear at that item level
//                      (great for checking if a raid is beatable with the right gear)

const fs = require("fs");
const path = require("path");

const { Knight, Mage, Warrior, Rogue, Healer, Druid, Necromancer, Valkyrie } = require("../src/classes");
const { Enemy } = require("../src/entities/Enemy");
const { Boss } = require("../src/entities/Boss");
const BOSSES = require("../src/data/bosses");
const { PlayerBot, SAFE_REVIVE } = require("../src/ai/PlayerBot");
const { PLAYBOOKS } = require("../src/ai/playbooks");
const { SKILL_PROFILES, randomSkill, randomPersonality } = require("../src/ai/skillProfiles");
const { Gear } = require("../src/items/Gear");
const { rollMobLoot, rollBossLoot } = require("../src/items/lootRoller");
const { formatItem, generateItem } = require("../src/items/itemGenerator");
const SCALING = require("../src/config/scalingConfig");
const { gearPower, partyGearPower, applyScaling } = require("../src/utils/enemyScaling");
const { distance } = require("../src/classes/Character");
const { Recorder } = require("../src/replay/Recorder");
const { startViewerServer, openBrowser } = require("../src/replay/viewerServer");
const { RevivePool } = require("../src/utils/revivePool");
const { HumanController } = require("../src/ai/HumanController");

// ================= COMMAND LINE =================
const argv = process.argv.slice(2);
function option(name) {
  const i = argv.indexOf(`--${name}`);
  return i !== -1 ? argv[i + 1] : undefined;
}
const positional = argv.filter((a, i) => !a.startsWith("--") && !(i > 0 && ["--boss", "--raid", "--testgear", "--skill", "--potential", "--speed", "--play", "--port", "--menu"].includes(argv[i - 1])));

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
// Catch typos in the command (e.g. a word where a number should be)
for (const [label, value] of [["boss multiplier", multiplier], ["player level", partyLevel], ["attempts", maxAttempts], ["raid size", RAID_SIZE]]) {
  if (!Number.isFinite(value) || value < 0) {
    console.log(`The ${label} must be a number, but got "${[positional[0], positional[1], positional[2], option("raid")][["boss multiplier", "player level", "attempts", "raid size"].indexOf(label)]}".`);
    console.log(`Check your command. Example:  node scripts/simulate.js --boss ashenTyrant`);
    const unknown = argv.filter(a => a.startsWith("--") && !["--boss", "--raid", "--fresh", "--quiet", "--noscale", "--testgear", "--skill", "--farm", "--potential", "--record", "--fast", "--speed", "--3d", "--2d", "--play", "--port", "--noopen", "--menu"].includes(a));
    if (unknown.length) console.log(`Unknown option(s): ${unknown.join(", ")}`);
    process.exit(1);
  }
}
const QUIET = argv.includes("--quiet");
const FRESH = argv.includes("--fresh");
const FARM = argv.includes("--farm");
const WATCH = !argv.includes("--fast");               // show fights live in the browser
const USE_3D = !argv.includes("--2d");                 // 3D viewer by default; --2d for the old top-down view
const RECORD = WATCH || argv.includes("--record");     // save boss fights as replays
let viewer = null;                                     // the live viewer server (when watching)
if (argv.includes("--noscale")) SCALING.enabled = false;

const { MOBS, TRASH_PACKS } = require(`../src/data/mobs/${BOSS_DEF.trash || "hollowCrypt"}`);

// 5-player groups keep using party.json; raids get their own save per size
const SAVE_FILE = path.join(__dirname, "..", "saves", RAID_SIZE === 5 ? "party.json" : `raid-${RAID_SIZE}.json`);
const IS_RAID = RAID_SIZE > 5;

const CLASSES = { Knight, Warrior, Rogue, Mage, Healer, Druid, Necromancer, Valkyrie };

let time = 0;
let currentRecorder = null;   // set while a fight is being recorded
const log = (msg) => {
  currentRecorder?.event(time, msg);
  if (!QUIET) console.log(`[${time.toFixed(1).padStart(5)}s] ${msg}`);
};
const say = (msg) => {
  console.log(msg);
  viewer?.broadcast({ type: "info", text: msg });   // show loot/results in the browser too
};
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const PLAY_AS = option("play");                         // --play <name>: you control that raid member
if (PLAY_AS && argv.includes("--fast")) { console.log("--play needs the live viewer — remove --fast."); process.exit(1); }
const WATCH_SPEED = PLAY_AS ? 1 : Number(option("speed") || 1);   // playing is always real time
const human = new HumanController();

// ================= GROUP MAKEUP =================
// 5 players: one of each class. Raids: 2 tanks, ~1 healer per 5 players, the rest DPS.
function raidComposition(size) {
  if (size <= 5) return ["Knight", "Warrior", "Rogue", "Mage", "Healer"].slice(0, size);
  const tanks = size >= 10 ? 2 : 1;
  const healers = Math.max(1, Math.round(size / 5));
  const dpsClasses = ["Warrior", "Mage", "Rogue"];
  // Two tanks: a Knight and a Valkyrie (Ryan and Valk). One tank: just the Knight.
  const list = [...(tanks === 2 ? ["Knight", "Valkyrie"] : ["Knight"]), ...Array(healers).fill("Healer")];
  for (let i = 0; list.length < size; i++) list.push(dpsClasses[i % dpsClasses.length]);
  // Raids bring one Druid (in place of a Rogue) and one Necromancer (in place of a Mage)
  const swap = (from, to) => { const i = list.lastIndexOf(from); if (i !== -1) list[i] = to; };
  swap("Rogue", "Druid");
  swap("Mage", "Necromancer");
  if (!list.includes("Valkyrie")) swap("Warrior", "Valkyrie");   // small raids: she comes as damage
  return list;
}

const NAMES = ["Aldric", "Brakka", "Vex", "Ryn", "Sera", "Thorne", "Kael", "Mira", "Dusk", "Lyra",
  "Grom", "Nyx", "Bram", "Isolde", "Fenn", "Zara", "Corvin", "Elara", "Hask", "Tamsin",
  "Orin", "Kira", "Doran", "Selene", "Rook", "Ilya", "Garrick", "Wren", "Talos", "Ember",
  "Jax", "Nadia", "Silas", "Freya", "Magnus", "Quinn", "Vera", "Otto", "Luna", "Brom"];

// Ryan, Valk, Maddy and Courtney are always in the raid — see src/config/roster.js
const { CORE_MEMBERS, RENAMED } = require("../src/config/roster");

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
      bot.mastery = s.mastery || {};                        // what they know about each mechanic
      bot.potential = s.potential || s.skill;
      bot.experience = s.experience || 0;
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
  // New players start as beginners ("casual") and each has a hidden POTENTIAL — how good
  // they can become with practice. Most people top out at average or skilled; few become pros.
  // Core members take the first slot of their class; everyone else gets a random name
  const comp = raidComposition(RAID_SIZE);
  const slotNames = new Array(comp.length).fill(null);
  for (const [name, cls] of Object.entries(CORE_MEMBERS)) {
    const i = comp.findIndex((c, j) => c === cls && !slotNames[j]);
    if (i !== -1) slotNames[i] = name;
  }
  const pool = names.filter(n => !(n in CORE_MEMBERS) && !(n in RENAMED) && n !== "Wren" && n !== "Bram");
  return comp.map((cls, i) => {
    const bot = makeBot(slotNames[i] || pool.shift() || `Player${i + 1}`, cls, forcedSkill || "casual", randomPersonality());
    bot.potential = forcedSkill || option("potential") || randomPotential();
    return bot;
  });
}

// ================= ROSTER CHANGES =================
// One-time change for an existing raid: Wren (a Rogue or Mage) becomes Courtney the Druid,
// and one player of the other class becomes a Necromancer. They keep their skill and what
// they've learned about the fights. Their gear is re-made for the new class at the same
// item level and rarity (a Rogue's daggers are no use to a Druid).
//
// Second change: Bram becomes Valk the Valkyrie (or a Warrior does, if there's no Bram).
function migrateRoster(list) {
  if (list.length <= 5) return list;
  const lastOf = (cls, not) => list.filter(b => b.className === cls && b !== not).pop();
  const changes = [];
  const convert = (old, newClass, newName) => {
    const bot = makeBot(newName, newClass, old.skillKey, old.personalityKey);
    Object.assign(bot, {
      p: old.p, mastery: old.mastery, potential: old.potential, experience: old.experience,
      lootState: old.lootState, kills: old.kills, attempts: old.attempts,
    });
    // Same item level and rarity in every slot they had filled, made for the new class
    for (const [slot, item] of Object.entries(old.gear.equipped)) {
      if (!item) continue;
      const slotType = slot.startsWith("ring") ? "ring" : slot;
      const rarity = item.rarity === "legendary" ? "epic" : item.rarity;   // legendaries are one-of-a-kind
      let made = null;
      for (const sourceType of [item.sourceType, "boss", "dungeon", "mob"]) {   // a source that can drop this rarity + slot
        try { made = generateItem({ itemLevel: item.itemLevel, rarity, forClass: newClass, sourceType, slotType, source: "class change" }); break; }
        catch { /* try the next source */ }
      }
      if (!made) continue;
      made.requiredLevel = Math.min(made.requiredLevel, partyLevel);
      bot.gear.bag.push(made);
    }
    bot.gear.equipUpgrades(partyLevel);
    list[list.indexOf(old)] = bot;
    changes.push(`${old.name} (${old.className}) → ${newName} the ${newClass}`);
  };
  // 1) Druid + Necromancer
  if (!list.some(b => b.className === "Druid" || b.className === "Necromancer")) {
    const druidFrom = list.find(b => b.name === "Wren" && b.className !== "Knight" && b.className !== "Healer") || lastOf("Rogue");
    const necroClass = druidFrom?.className === "Mage" ? "Rogue" : "Mage";
    const necroFrom = lastOf(necroClass, druidFrom) || lastOf(necroClass === "Mage" ? "Rogue" : "Mage", druidFrom);
    if (druidFrom) convert(druidFrom, "Druid", "Courtney");
    if (necroFrom) convert(necroFrom, "Necromancer", necroFrom.name);
  }
  // 2) Valkyrie
  if (!list.some(b => b.className === "Valkyrie")) {
    const valkFrom = list.find(b => b.name === "Bram") || lastOf("Warrior");
    if (valkFrom) convert(valkFrom, "Valkyrie", "Valk");
  }
  // 3) Valk is the second tank: if there are still two Knights, the one that isn't Ryan
  //    (or the second one) becomes a Warrior and goes to damage
  const knights = list.filter(b => b.className === "Knight");
  if (knights.length >= 2 && list.some(b => b.className === "Valkyrie")) {
    const keep = knights.find(b => b.name === "Ryan" || b.name === "Vex") || knights[0];
    for (const k of knights) if (k !== keep) convert(k, "Warrior", k.name);
  }
  // 4) Renamed players (Jax → Maddy, Vex → Ryan)
  for (const b of list) if (RENAMED[b.name] && !list.some(o => o.name === RENAMED[b.name])) {
    changes.push(`${b.name} is now ${RENAMED[b.name]}`);
    b.name = RENAMED[b.name];
  }
  if (changes.length) {
    console.log(`\n🔁 Roster change: ${changes.join(", ")}`);
    console.log(`   They keep their skill and fight knowledge. Their gear was re-made for the new class (same item level).`);
    list.migrated = true;
  }
  return list;
}

function saveGroup(bots) {
  fs.mkdirSync(path.dirname(SAVE_FILE), { recursive: true });
  fs.writeFileSync(SAVE_FILE, JSON.stringify(bots.map(b => ({
    name: b.name, className: b.className, skill: b.skillKey, personality: b.personalityKey,
    profile: b.p, mastery: b.mastery, potential: b.potential, experience: b.experience,
    gear: b.gear.toJSON(), lootState: b.lootState, kills: b.kills || 0, attempts: b.attempts || 0,
  })), null, 2));
}

// Hidden potential for new players: most become average or skilled, few become pros
function randomPotential() {
  const r = Math.random();
  if (r < 0.10) return "casual";
  if (r < 0.45) return "average";
  if (r < 0.88) return "skilled";
  return "pro";
}

// Mechanics the raid has run into so far (anything someone has learned something about)
function discoveredMechanics() {
  const set = new Set();
  for (const b of bots) for (const m of Object.keys(b.mastery)) set.add(m);
  return [...set];
}
// How well a player knows the mechanics the raid has discovered (0–100%).
// Role mechanics (Immolation = tank swaps, Safe Revive = healers/knights) only count for those classes.
// Safe Revive (not reviving people into fire) only counts for Healers and Knights.
const ROLE_MECHANICS = { Immolation: ["Knight", "Valkyrie"], Overload: ["Knight", "Valkyrie"], [SAFE_REVIVE]: ["Knight", "Healer"] };
const appliesTo = (m, bot) => !ROLE_MECHANICS[m] || ROLE_MECHANICS[m].includes(bot.className);
function knowledge(bot) {
  const mechs = discoveredMechanics().filter(m => appliesTo(m, bot));
  if (!mechs.length) return 0;
  return Math.round(mechs.reduce((a, m) => a + (bot.mastery[m] || 0), 0) / mechs.length * 100);
}
function avgKnowledge() {
  return Math.round(bots.reduce((s, b) => s + knowledge(b), 0) / bots.length);
}
function reportKnowledge(raidDeaths) {
  const counts = {};
  const { mechanicName } = require("../src/ai/PlayerBot");
  for (const d of raidDeaths) { const m = mechanicName(d); if (m) counts[m] = (counts[m] || 0) + 1; }
  const lines = discoveredMechanics()
    .map(m => {
      const who = bots.filter(b => appliesTo(m, b));
      const avg = Math.round(who.reduce((s, b) => s + (b.mastery[m] || 0), 0) / who.length * 100);
      return `${m} ${avg}%${counts[m] ? ` (killed ${counts[m]} this time)` : ""}`;
    });
  if (lines.length) say(`What the raid knows now: ${lines.join(" | ")}`);
}
const attemptLog = [];

const bots = migrateRoster(loadGroup());
if (bots.migrated) saveGroup(bots);   // save the new roster right away

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

// ================= GEAR CHECK =================
// Before the pull, every player looks through their bags and puts on anything stronger
// than what they're wearing — so they go in at their strongest.
function gearCheck(label) {
  const lines = [];
  let upgrades = 0, players = 0;
  for (const b of bots) {
    const equipped = b.gear.equipUpgrades(partyLevel);
    if (!equipped.length) continue;
    players++;
    upgrades += equipped.length;
    for (const { item, replaced } of equipped) {
      lines.push(`   ${b.name.padEnd(7)} put on ${formatItem(item)}${replaced ? `  (replacing ${replaced.name})` : "  (empty slot)"}`);
    }
  }
  if (!upgrades) { say(`🎒 ${label}: everyone is already wearing their best gear.`); return; }
  say(`🎒 ${label}: ${players} player${players > 1 ? "s" : ""} equipped ${upgrades} upgrade${upgrades > 1 ? "s" : ""} from their bags`);
  const show = IS_RAID ? 8 : lines.length;              // raids: keep the list short
  lines.slice(0, show).forEach(l => say(l));
  if (lines.length > show) say(`   ...and ${lines.length - show} more`);
}
for (const bot of bots) bot.onSay = (b, msg) => {
  if (human.isControlling(b)) return;   // the bot doesn't talk for you while you're playing
  log(`💬 [${IS_RAID ? "Raid" : "Party"}] ${b.name}: ${msg}`);
};

say(`${BOSS_DEF.name} x${multiplier} — ${bots.length} players, level ${partyLevel}${FRESH ? " (fresh group)" : ""}`);
say("Name      Class       Skill    Personality  Knows fight  Gear");
for (const b of bots) {
  say(`  ${b.name.padEnd(8)} ${b.className.padEnd(11)} ${b.p.label.padEnd(8)} ${b.personality.label.padEnd(11)}  ${(knowledge(b) + "%").padStart(4)}         ` +
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
    case "Druid":   return { x: -22, y: 12 + n * 3 };
    case "Necromancer": return { x: -22, y: -14 - n * 3 };   // starts at range; walks in for Reaper stance
    case "Valkyrie": return { x: 3, y: -7 - n * 3 };          // on her Pegasus near the tanks
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
async function runFight(enemies, { boss = null, record = false } = {}) {
  time = 0;
  const party = spawnParty();
  // When watching, every fight (trash too) streams to the browser
  const title = boss ? boss.name : `Trash: ${enemies.map(e => e.name).join(", ")}`;
  const recorder = (record || WATCH) ? new Recorder({ title, party, live: viewer }) : null;
  currentRecorder = recorder;
  const tank = bots.find(b => b.mainTank)?.character || party[0];
  const stats = Object.fromEntries(party.map(p => [p.name, { damage: 0, healing: 0, diedAt: null, diedTo: null, revived: 0 }]));

  // What is the boss doing right now? (for "died to X" messages)
  let executing = null;
  if (boss) {
    const orig = boss.finishAbility.bind(boss);
    boss.finishAbility = (key, t, ctx) => { executing = boss.abilities[key].name; const r = orig(key, t, ctx); executing = null; return r; };
    boss.onAnnounce = (msg) => {
      if (/^PHASE|ADAPTS|fixates|glares|BERSERK|WORLDFIRE|HURRICANE|rekindles|recharges|IMMOLATED|OVERLOADED|incinerated|struck down|consumes|absorbs|takes to the skies|lands!/.test(msg)) log(`>>> ${msg}`);
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
    // Valkyrie: the first "death" only kills her Pegasus
    p.onDismount = () => {
      log(`🪽 ${p.name}'s Pegasus has been slain! ${p.name} lands, wings unfurled, and fights on (second life)`);
      bot.say("pegasusDown", time, 0);
    };
    p.onDeath = () => {
      if (p._deathCause) p._lastHitBy = p._deathCause;   // killed by a failed mechanic
      stats[p.name].diedAt = time;
      stats[p.name].diedTo = p._lastHitBy;
      log(`💀 ${p.name} (${p.className}) died to ${p._lastHitBy}`);
      // Revived straight into the fire and died again? That revive was wasted — the reviver learns from it
      const rez = p._revive;
      p._revive = null;
      if (rez && rez.zone && time - rez.at <= 8) {
        revivesWasted++;
        log(`⚠ Wasted revive — ${rez.by.name} revived ${p.name} while they were still in ${rez.zone}`);
        rez.by.learnFromMistake(SAFE_REVIVE);
        rez.by.noticed.set(`bodyInFire:${p.name}`, { willNotice: true, reactAt: 0 });   // they won't make the same mistake twice in a row
        bot.say("diedAgain", time, 0);
        rez.by.say("badRez", time, 0);
      } else bot.say("died", time, 0);
    };
  }

  // Everything notices the tank when combat starts
  for (const e of enemies) e.addThreat(tank, 1);

  const alive = () => enemies.filter(e => !e.isDead);
  const allEnemies = () => boss ? [boss, ...boss.minions.filter(m => !m.isDead)] : alive();

  // Raids share 4 revives, then a 2-minute cooldown. 5-player runs have no limit.
  const revives = IS_RAID ? new RevivePool() : null;
  let revivesUsed = 0, revivesWasted = 0;
  if (revives) revives.onRefresh = () => log(`✨ Raid revives are back (${revives.charges} available)`);
  for (const p of party) {
    p.onRevive = (target, pool) => {
      stats[target.name].revived++;
      revivesUsed++;
      // Is the body still lying in fire / under a warning circle?
      const zone = boss?.zones.find(z => z.hostile && distance({ position: z.position }, target) <= z.radius);
      target._revive = { by: bots.find(b => b.character === p), at: time, zone: zone?.name || null };
      log(`✨ ${p.name} revives ${target.name}${pool ? ` — ${pool.describe()}` : ""}${zone ? `  ⚠ still in ${zone.name}!` : ""}`);
      if (!zone) bots.find(b => b.character === target)?.say("revived", time, 0);
    };
  }

  const world = {
    party, tank, revives,
    get boss() { return boss || alive()[0] || enemies[0]; },
    get adds() { return boss ? boss.minions : alive().slice(1); },
    ctxFor: (c) => ({ allies: party.filter(a => a !== c), enemies: allEnemies(), revives }),
  };

  const dt = 0.05;
  party.forEach(p => p.enterCombat());
  let lastReport = 0;
  const killed = new Set();

  while (alive().length && party.some(p => !p.isDead) && time < 900) {
    for (const bot of bots) {
      if (human.isControlling(bot)) human.act(bot, world, dt, time, recorder);   // YOU
      else bot.think(time, dt, world);
      bot.character.update(dt, world.ctxFor(bot.character));
    }
    for (const e of alive()) e.update(dt, { allies: [], enemies: party });
    revives?.tick(dt);
    for (const e of enemies) if (e.isDead && !killed.has(e)) { killed.add(e); if (!boss) log(`☠ ${e.name} defeated`); }
    recorder?.capture(time, enemies);

    if (boss && time - lastReport >= 20) {
      lastReport = time;
      const aliveCount = party.filter(p => !p.isDead).length;
      log(`Boss ${Math.round(boss.hp / boss.maxHp * 100)}% (phase ${boss.phaseIndex + 1}) | ` +
        (IS_RAID ? `alive ${aliveCount}/${party.length} | tanking: ${boss.pickTarget()?.name}`
                 : party.map(p => `${p.name} ${p.isDead ? "DEAD" : Math.round(p.hp / p.maxHp * 100) + "%"}`).join(" | ")));
    }
    time += dt;
    // Watching: slow the simulation down to real time (so you can follow it)
    if (WATCH && Math.round(time / dt) % 2 === 0) await sleep((dt * 2 * 1000) / WATCH_SPEED);
  }
  const won = !alive().length;
  if (recorder) {
    recorder.capture(time + 1, enemies);           // final frame
    recorder.event(time, won ? "🏆 VICTORY!" : "💀 WIPE");
    recorder.finish({ won, time: Math.round(time * 10) / 10 });
    currentRecorder = null;
  }
  return { won, time, stats, killed: [...killed], recorder, revivesUsed, revivesWasted };
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
async function main() {
if (WATCH) {
  viewer = await startViewerServer({ port: Number(option("port") || 3000) });
  const menuUrl = option("menu");   // started from the main menu (scripts/play.js): show a "Menu" button
  const page = (USE_3D ? "/?live=1" : "/2d?live=1") + (menuUrl ? `&menu=${encodeURIComponent(menuUrl)}` : "");
  say(`\n📺 Opening the ${USE_3D ? "3D " : ""}fight viewer: ${viewer.url()}${page}  (if it doesn't open, paste that into your browser)`);
  if (USE_3D) say(`   (Prefer the old top-down view? Add --2d, or open ${viewer.url()}/2d?live=1)`);
  if (!argv.includes("--noopen")) openBrowser(viewer.url() + page);
  // Playing a character yourself (from the viewer's "Take control" button or --play)
  viewer.onControl = (name) => {
    if (name && !bots.some(b => b.name === name)) return { ok: false, reason: `No raid member called ${name}` };
    const before = human.name;
    human.take(name);
    if (name) log(`🎮 You are now playing ${name} (${bots.find(b => b.name === name).className})`);
    else if (before) log(`🤖 ${before} is back on autopilot`);
    return { ok: true };
  };
  viewer.onInput = (msg) => human.input(msg);
  human.onResult = (r) => viewer.broadcast({ type: "castResult", ...r });
  if (PLAY_AS) {
    const who = bots.find(b => b.name.toLowerCase() === PLAY_AS.toLowerCase());
    if (!who) { say(`No raid member called "${PLAY_AS}". Your raid: ${bots.map(b => b.name).join(", ")}`); process.exit(1); }
    viewer.onControl(who.name);
    viewer.controlled = who.name;
    say(`🎮 You're playing ${who.name} the ${who.className}. WASD to move, 1-0 for abilities, Tab to target.`);
  }
  const connected = await viewer.waitForViewer(PLAY_AS ? 60000 : 10000);
  if (!connected) say("   (No browser connected yet — starting anyway. Open the link above to watch.)");
  if (PLAY_AS) viewer.broadcast({ type: "control", name: human.name, playable: true });
  await sleep(PLAY_AS ? 3000 : 1000);   // a moment to get your bearings
}
const history = [];
for (let attempt = 1; attempt <= maxAttempts; attempt++) {
  say(`\n================ ATTEMPT ${attempt} ================`);
  human.played = new Set(human.name ? [human.name] : []);
  gearCheck("Gear check before the pull");

  // --- 1. Trash pack ---
  const packKeys = TRASH_PACKS[Math.floor(Math.random() * TRASH_PACKS.length)];
  const pack = packKeys.map((k, i) => new Enemy({ ...MOBS[k], position: { x: 4 + i * 1.5, y: i - 1 } }));
  const trashPower = partyPower();
  let mobMult;
  pack.forEach(m => { mobMult = applyScaling(m, trashPower); });
  say(`\n-- Trash: ${pack.map(m => m.name + (m.elite ? " (elite)" : "")).join(", ")} --`);
  say(`   ${describeScaling(trashPower, mobMult, "mobs")}`);
  const trash = await runFight(pack);
  if (!trash.won) {
    say(`WIPE on trash at ${trash.time.toFixed(0)}s`);
    history.push("wiped on trash");
    const trashDeaths = Object.values(trash.stats).map(s => s.diedTo).filter(Boolean);
    for (const bot of bots) if (!human.played.has(bot.name)) bot.learn(trash.stats[bot.name].diedTo, trashDeaths);
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
  for (const b of bots) if (b.tired && Math.random() < 0.5) say(`   💬 ${b.name}: ${["kinda tired tonight ngl", "my ping is awful rn", "sorry, distracted", "long day at work lol"][Math.floor(Math.random() * 4)]}`);
  const fight = await runFight([boss], { boss, record: RECORD });
  if (fight.recorder) {
    const stamp = new Date().toISOString().slice(0, 19).replace("T", "_").replace(/:/g, "-");
    const file = fight.recorder.save(`${BOSS_KEY}-${stamp}-attempt${attempt}-${fight.won ? "kill" : "wipe"}`);
    say(`🎬 Replay saved: replays/${path.basename(file)}  (watch it: node scripts/viewer.js)`);
  }

  if (fight.won) say(`\n🏆 VICTORY in ${fight.time.toFixed(1)}s!`);
  else say(`\nWIPE at ${fight.time.toFixed(1)}s — boss at ${Math.round(boss.hp / boss.maxHp * 100)}% (phase ${boss.phaseIndex + 1})${boss.enraged ? " — hit the enrage timer" : ""}`);

  say("Name      Class        Damage   DPS  Healing  Died");
  for (const bot of bots) {
    const s = fight.stats[bot.name];
    say(`  ${bot.name.padEnd(8)} ${bot.className.padEnd(11)} ${String(Math.round(s.damage)).padStart(7)} ${String(Math.round(s.damage / fight.time)).padStart(5)} ${String(Math.round(s.healing)).padStart(8)}  ${s.diedAt == null ? "-" : `${s.diedAt.toFixed(0)}s (${s.diedTo})`}${s.revived ? `  ✨ revived${s.revived > 1 ? ` x${s.revived}` : ""}` : ""}`);
  }
  if (IS_RAID) {
    const deaths = {};
    for (const s of Object.values(fight.stats)) if (s.diedTo) deaths[s.diedTo] = (deaths[s.diedTo] || 0) + 1;
    const total = Object.values(fight.stats).reduce((a, s) => a + s.damage, 0);
    say(`Raid DPS: ${Math.round(total / fight.time).toLocaleString()} | Deaths: ${Object.entries(deaths).map(([k, v]) => `${k} x${v}`).join(", ") || "none"}`);
    if (fight.revivesUsed) say(`Revives: ${fight.revivesUsed} used${fight.revivesWasted ? `, ${fight.revivesWasted} wasted (revived into the fire)` : ", none wasted"}`);
    const souls = boss.buffs.find(b => b.id === "soulHarvest")?.stacks;
    if (souls) say(`Souls consumed by the boss: ${souls}`);
  }

  // ---- Everyone learns from what happened (win OR wipe) ----
  const raidDeaths = Object.values(fight.stats).map(s => s.diedTo).filter(Boolean);
  for (const bot of bots) {
    if (human.played.has(bot.name)) continue;   // you played this one — the learning is yours!
    const lesson = bot.learn(fight.stats[bot.name].diedTo, raidDeaths);
    if (lesson && Math.random() < 0.5) bot.say("learned", 9999, 0);
  }
  reportKnowledge(raidDeaths);
  attemptLog.push({ won: fight.won, bossPct: Math.round(boss.hp / boss.maxHp * 100), deaths: raidDeaths.length, knowledge: avgKnowledge() });

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
    if (!FARM) break;
    continue;
  }
  history.push(`wipe at ${Math.round(boss.hp / boss.maxHp * 100)}%${boss.enraged ? " (enrage)" : ""}`);
  bots[Math.floor(Math.random() * bots.length)].say("wipe", 9999, 0);
}

// ================= SUMMARY + SAVE =================
say("\n================ SUMMARY ================");
say("Attempt  Result          Deaths  Raid knows the fight");
attemptLog.forEach((a, i) => say(`  ${String(i + 1).padStart(3)}    ${(a.won ? "KILL" : `wipe at ${a.bossPct}%`).padEnd(14)}  ${String(a.deaths).padStart(5)}    ${a.knowledge}%`));
history.forEach((h, i) => { if (h === "wiped on trash") say(`  (attempt ${i + 1}: wiped on trash)`); });
const avgIlvl = Math.round(bots.reduce((s, b) => s + b.gear.itemLevel(), 0) / bots.length);
say(`\nAverage item level: ${avgIlvl}`);
if (!IS_RAID) for (const b of bots) say(`  ${b.name.padEnd(7)} ${b.className.padEnd(8)} ilvl ${b.gear.itemLevel()} (${b.gear.slotsFilled()}/12 slots)`);
saveGroup(bots);
say(`\nSaved to saves/${path.basename(SAVE_FILE)} — run again to continue with the same group.`);
if (WATCH) {
  say(`\n📺 Done! The viewer stays open so you can rewatch — press Ctrl+C here when you're finished.`);
  viewer.broadcast({ type: "done" });
}
}

main().catch(err => { console.error(err); process.exit(1); });