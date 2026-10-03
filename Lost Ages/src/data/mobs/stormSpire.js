// stormSpire.js — trash mobs guarding Vorathyx, the Storm Sovereign (tier 3 raid).
// Tougher than the Ashen Forge's trash.

const MOBS = {
  stormguard:    { name: "Spire Stormguard",  level: 62, hp: 11000, damage: 140, attackSpeed: 2.4, armor: 170, type: "elemental" },
  galeWisp:      { name: "Gale Wisp",         level: 62, hp: 6000,  damage: 95,  attackSpeed: 1.4, armor: 50,  type: "elemental" },
  thunderhawk:   { name: "Thunderhawk",       level: 62, hp: 8000,  damage: 115, attackSpeed: 1.8, armor: 90,  type: "beast" },
  tempestCaller: { name: "Tempest Caller",    level: 62, hp: 7000,  damage: 110, attackSpeed: 2.5, armor: 50,  type: "humanoid", attackRange: 25 },
  stormDrake:    { name: "Storm Drake",       level: 64, hp: 36000, damage: 260, attackSpeed: 3.0, armor: 220, type: "dragon", elite: true },
};

const TRASH_PACKS = [
  ["stormguard", "stormguard", "galeWisp", "galeWisp", "tempestCaller"],
  ["thunderhawk", "thunderhawk", "thunderhawk", "tempestCaller", "tempestCaller"],
  ["stormDrake", "galeWisp", "galeWisp", "galeWisp"],
];

module.exports = { MOBS, TRASH_PACKS };