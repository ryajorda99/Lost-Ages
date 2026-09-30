// itemConfig.js — all the numbers behind items. No logic here.

const SLOTS = [
  "head", "shoulders", "chest", "hands", "legs", "feet",
  "neck", "ring1", "ring2", "trinket", "mainHand", "offHand",
];

// Which equipment slots an item's slotType can go into
const SLOT_GROUPS = {
  head: ["head"], shoulders: ["shoulders"], chest: ["chest"], hands: ["hands"],
  legs: ["legs"], feet: ["feet"], neck: ["neck"], ring: ["ring1", "ring2"],
  trinket: ["trinket"], mainHand: ["mainHand"], offHand: ["offHand"],
};

const ARMOR_SLOTS = ["head", "shoulders", "chest", "hands", "legs", "feet"];

// Share of the stat budget per slot — chest, legs and weapons are the big upgrades
const SLOT_WEIGHT = {
  head: 1.0, shoulders: 0.75, chest: 1.0, hands: 0.75, legs: 1.0, feet: 0.75,
  neck: 0.55, ring: 0.55, trinket: 0.7, mainHand: 1.2, offHand: 0.8,
};

// Rarities live in their own folder: src/data/rarities/
const { RARITY, RARITY_ORDER } = require("../rarities");

// Which item slots each source can drop.
// Mobs only drop armor and weapons — rings, necks and trinkets are BOSS ONLY.
const DROP_SLOTS = {
  mob:     ["head", "shoulders", "chest", "hands", "legs", "feet", "mainHand", "offHand"],
  dungeon: ["head", "shoulders", "chest", "hands", "legs", "feet", "mainHand", "offHand"],
  boss:    ["head", "shoulders", "chest", "hands", "legs", "feet", "mainHand", "offHand", "neck", "ring", "trinket"],
};

// Overall stat power of items. Raise to make gear matter more.
const BUDGET_SCALE = 0.8;

// HP gained per point of Stamina on gear
const HP_PER_GEAR_STAMINA = 5;

const CLASS_ARMOR = {
  Knight: "plate", Warrior: "plate", Rogue: "leather", Mage: "cloth", Healer: "cloth",
  Druid: "leather", Necromancer: "cloth",
};
const ARMOR_VALUE = { cloth: 1, leather: 2, mail: 3, plate: 4 };

// Which stats drop for each class (loot is always useful to whoever it drops for)
const CLASS_STATS = {
  Knight:  { primary: ["str", "sta", "faith"], secondary: ["blockChance", "armor", "crit"] },
  Warrior: { primary: ["str", "sta"],          secondary: ["crit", "haste", "agi"] },
  Rogue:   { primary: ["agi", "sta"],          secondary: ["crit", "haste"] },
  Mage:    { primary: ["int", "sta"],          secondary: ["crit", "haste"] },
  Healer:  { primary: ["faith", "sta"],        secondary: ["haste", "crit", "int"] },
  Druid:       { primary: ["int", "faith", "sta"], secondary: ["haste", "crit"] },   // damage (int) + healing (faith)
  Necromancer: { primary: ["int", "sta"],          secondary: ["crit", "haste"] },
};

// How much each stat is "worth" to each class — used to decide if an item is an upgrade
const STAT_WEIGHTS = {
  Knight:  { sta: 1.2, str: 1, faith: 0.8, armor: 0.15, blockChance: 150, crit: 0.4, weaponDamage: 1.5 },
  Warrior: { str: 1.2, sta: 0.6, crit: 0.8, haste: 0.7, agi: 0.5, armor: 0.05, weaponDamage: 2.5 },
  Rogue:   { agi: 1.2, sta: 0.6, crit: 0.9, haste: 0.8, armor: 0.05, weaponDamage: 2.5 },
  Mage:    { int: 1.3, sta: 0.6, crit: 0.8, haste: 0.9, armor: 0.02, weaponDamage: 0.2 },
  Healer:  { faith: 1.3, sta: 0.6, haste: 0.9, crit: 0.6, int: 0.4, armor: 0.02, weaponDamage: 0.1 },
  Druid:       { int: 1.1, faith: 0.8, sta: 0.6, haste: 0.9, crit: 0.7, armor: 0.03, weaponDamage: 0.1 },
  Necromancer: { int: 1.3, sta: 0.7, crit: 0.8, haste: 0.8, armor: 0.03, weaponDamage: 0.6 },   // weapon matters in Reaper stance
};

const CLASS_WEAPONS = {
  Knight:  { mainHand: ["sword", "mace"], offHand: ["shield"] },
  Warrior: { mainHand: ["axe", "sword", "mace"], offHand: ["shield", "axe"] },
  Rogue:   { mainHand: ["dagger", "sword"], offHand: ["dagger"] },
  Mage:    { mainHand: ["staff", "wand"], offHand: ["orb"] },
  Healer:  { mainHand: ["mace", "staff"], offHand: ["relic"] },
  Druid:       { mainHand: ["staff", "mace"], offHand: ["relic"] },
  Necromancer: { mainHand: ["scythe", "staff"], offHand: ["orb"] },
};

// Seconds per swing for each weapon type
const WEAPON_SPEED = { dagger: 1.6, sword: 2.4, axe: 2.8, mace: 2.8, staff: 3.0, wand: 2.0, scythe: 3.2 };

const NAME_PARTS = {
  prefix: {
    common: ["Worn", "Simple", "Plain"],
    uncommon: ["Sturdy", "Polished", "Reinforced"],
    rare: ["Valiant", "Blessed", "Runed"],
    epic: ["Radiant", "Sanctified", "Dreadforged"],
    legendary: ["Eternal", "Godforged"],
  },
  base: {
    head: "Helm", shoulders: "Pauldrons", chest: "Chestguard", hands: "Gauntlets", legs: "Greaves",
    feet: "Boots", neck: "Amulet", ring: "Ring", trinket: "Charm",
    sword: "Longsword", mace: "Warhammer", shield: "Bulwark", axe: "Axe", dagger: "Dagger",
    staff: "Staff", wand: "Wand", orb: "Orb", relic: "Relic", scythe: "Scythe",
  },
};

module.exports = {
  SLOTS, SLOT_GROUPS, ARMOR_SLOTS, SLOT_WEIGHT, RARITY, RARITY_ORDER, DROP_SLOTS, BUDGET_SCALE, HP_PER_GEAR_STAMINA,
  CLASS_ARMOR, ARMOR_VALUE, CLASS_STATS, STAT_WEIGHTS, CLASS_WEAPONS, WEAPON_SPEED, NAME_PARTS,
};