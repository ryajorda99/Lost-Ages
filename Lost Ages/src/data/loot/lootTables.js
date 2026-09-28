// lootTables.js — drop chances for mobs and dungeon chests. Boss loot lives in each boss file.
// Rarities a source isn't allowed to drop (see src/data/rarities) are ignored automatically.

// Regular mobs: Common → Rare only, armor and weapons only (see DROP_SLOTS in itemConfig.js)
const MOB_LOOT = {
  normal: { dropChance: 0.15, rarityWeights: { common: 70, uncommon: 25, rare: 5 } },
  elite:  { dropChance: 0.5,  rarityWeights: { uncommon: 60, rare: 40 } },
};

// Dungeon completion chest (no boss): at most Rare — Epics come from bosses only
const DUNGEON_DIFFICULTY = {
  normal: { ilvlBonus: 0,  items: 1, rarityWeights: { uncommon: 60, rare: 40 } },
  heroic: { ilvlBonus: 5,  items: 2, rarityWeights: { uncommon: 30, rare: 70 } },
  mythic: { ilvlBonus: 10, items: 2, rarityWeights: { rare: 100 } },
};

module.exports = { MOB_LOOT, DUNGEON_DIFFICULTY };