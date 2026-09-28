// hollowCrypt.js — regular enemies in the Hollow King's crypt.
// Each "pack" is fought before reaching the boss. Stats are for a level ~20 zone.

const MOBS = {
  skeletonWarrior: { name: "Crypt Skeleton", level: 20, hp: 900, damage: 22, attackSpeed: 2.2, armor: 50, type: "undead" },
  ghoul:           { name: "Crypt Ghoul",    level: 20, hp: 700, damage: 18, attackSpeed: 1.6, armor: 30, type: "undead" },
  boneArcher:      { name: "Bone Archer",    level: 20, hp: 600, damage: 20, attackSpeed: 2.5, armor: 20, type: "undead", attackRange: 25 },
  deathKnight:     { name: "Hollow Deathguard", level: 22, hp: 2200, damage: 35, attackSpeed: 2.6, armor: 90, type: "undead", elite: true },
};

// Packs you run into on the way to the boss
const TRASH_PACKS = [
  ["skeletonWarrior", "ghoul", "boneArcher"],
  ["ghoul", "ghoul", "skeletonWarrior"],
  ["deathKnight", "boneArcher"],
];

module.exports = { MOBS, TRASH_PACKS };