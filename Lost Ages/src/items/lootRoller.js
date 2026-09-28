// lootRoller.js — decides what drops. Personal loot: roll once per player.

const { generateItem, rollRarity, newItemId } = require("./itemGenerator");
const { MOB_LOOT, DUNGEON_DIFFICULTY } = require("../data/loot/lootTables");

/** A mob died. player = { className, lootState? }, mob = Enemy or mob data */
function rollMobLoot(player, mob) {
  const table = mob.elite ? MOB_LOOT.elite : MOB_LOOT.normal;
  if (Math.random() > table.dropChance) return [];
  return [generateItem({
    itemLevel: mob.level + (mob.elite ? 3 : 0),
    rarity: rollRarity(table.rarityWeights, "mob"),
    forClass: player.className,
    sourceType: "mob",
    source: mob.name,
  })];
}

/** Finished a dungeon: guaranteed chest */
function rollDungeonLoot(player, dungeon, difficulty = "normal") {
  const d = DUNGEON_DIFFICULTY[difficulty];
  return Array.from({ length: d.items }, () => generateItem({
    itemLevel: dungeon.itemLevel + d.ilvlBonus,
    rarity: rollRarity(d.rarityWeights, "dungeon"),
    forClass: player.className,
    sourceType: "dungeon",
    source: dungeon.name,
  }));
}

/**
 * Killed a boss. Uses bossDef.loot:
 *   { itemLevel, lockoutHours, randomRolls, rarityWeights, uniqueDrops: [{ chance, item }] }
 * - Weekly lockout (skip with opts.ignoreLockout)
 * - Bad-luck protection: every miss on a unique drop raises its chance next time
 */
function rollBossLoot(player, bossDef, opts = {}) {
  const loot = bossDef.loot;
  const now = opts.now ?? Date.now();
  player.lootState ??= { lockouts: {}, pity: {} };
  const state = player.lootState;
  const bossId = bossDef.name;

  if (!opts.ignoreLockout && loot.lockoutHours > 0 && state.lockouts[bossId] > now) {
    return { locked: true, unlocksAt: new Date(state.lockouts[bossId]), items: [] };
  }
  if (loot.lockoutHours > 0) state.lockouts[bossId] = now + loot.lockoutHours * 3600 * 1000;

  const items = [];
  for (const drop of loot.uniqueDrops || []) {
    if (drop.item.allowedClasses && !drop.item.allowedClasses.includes(player.className)) continue;
    const pityKey = `${bossId}:${drop.item.name}`;
    const misses = state.pity[pityKey] || 0;
    if (Math.random() < drop.chance * (1 + misses * 0.25)) {
      items.push({
        ...structuredClone(drop.item),
        id: newItemId(), itemLevel: loot.itemLevel, requiredLevel: bossDef.level - 2,
        sourceType: "boss", source: bossDef.name, bossOnly: true,
      });
      state.pity[pityKey] = 0;
    } else {
      state.pity[pityKey] = misses + 1;
    }
  }
  for (let i = 0; i < loot.randomRolls; i++) {
    const item = generateItem({
      itemLevel: loot.itemLevel,
      rarity: rollRarity(loot.rarityWeights, "boss"),
      forClass: player.className,
      sourceType: "boss",
      source: bossDef.name,
    });
    item.requiredLevel = bossDef.level - 2; // anyone who can fight the boss can wear its loot
    items.push(item);
  }
  return { locked: false, items };
}

module.exports = { rollMobLoot, rollDungeonLoot, rollBossLoot };