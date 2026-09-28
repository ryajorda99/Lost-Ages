// ashenForge.js — trash mobs guarding the Ashen Tyrant (level 60 raid).

const MOBS = {
  forgeGuard:   { name: "Forge Guardian",  level: 60, hp: 9000,  damage: 120, attackSpeed: 2.4, armor: 150, type: "demon" },
  cinderImp:    { name: "Cinder Imp",      level: 60, hp: 5000,  damage: 80,  attackSpeed: 1.5, armor: 60,  type: "demon" },
  magmaHound:   { name: "Magma Hound",     level: 60, hp: 7000,  damage: 100, attackSpeed: 1.8, armor: 90,  type: "beast" },
  flameweaver:  { name: "Flameweaver",     level: 60, hp: 6000,  damage: 90,  attackSpeed: 2.5, armor: 40,  type: "demon", attackRange: 25 },
  moltenGiant:  { name: "Molten Giant",    level: 62, hp: 30000, damage: 220, attackSpeed: 3.0, armor: 200, type: "demon", elite: true },
};

// Bigger packs — this is a raid
const TRASH_PACKS = [
  ["forgeGuard", "forgeGuard", "cinderImp", "cinderImp", "flameweaver"],
  ["magmaHound", "magmaHound", "magmaHound", "flameweaver", "flameweaver"],
  ["moltenGiant", "cinderImp", "cinderImp", "cinderImp"],
];

module.exports = { MOBS, TRASH_PACKS };