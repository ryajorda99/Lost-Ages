// hollowCrypt.js — trash mobs guarding The Hollow King (level 60 raid, tier 1).
// Weaker than Azgaroth's Ashen Forge trash.

const MOBS = {
  skeletonWarrior: { name: "Crypt Skeleton",    level: 58, hp: 6000,  damage: 80,  attackSpeed: 2.2, armor: 100, type: "undead" },
  ghoul:           { name: "Crypt Ghoul",       level: 58, hp: 4500,  damage: 60,  attackSpeed: 1.6, armor: 60,  type: "undead" },
  boneArcher:      { name: "Bone Archer",       level: 58, hp: 4000,  damage: 70,  attackSpeed: 2.5, armor: 40,  type: "undead", attackRange: 25 },
  deathKnight:     { name: "Hollow Deathguard", level: 60, hp: 20000, damage: 150, attackSpeed: 2.6, armor: 150, type: "undead", elite: true },
};

// Packs you run into on the way to the boss
const TRASH_PACKS = [
  ["skeletonWarrior", "skeletonWarrior", "ghoul", "ghoul", "boneArcher"],
  ["ghoul", "ghoul", "ghoul", "skeletonWarrior", "boneArcher"],
  ["deathKnight", "boneArcher", "boneArcher"],
];

module.exports = { MOBS, TRASH_PACKS };