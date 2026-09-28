// itemGenerator.js — creates random items and scores them.

const {
  SLOT_GROUPS, ARMOR_SLOTS, SLOT_WEIGHT, RARITY, RARITY_ORDER, DROP_SLOTS, BUDGET_SCALE,
  CLASS_ARMOR, ARMOR_VALUE, CLASS_STATS, STAT_WEIGHTS, CLASS_WEAPONS, WEAPON_SPEED, NAME_PARTS,
} = require("../data/items/itemConfig");

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

let idCounter = 0;
const newItemId = () => `itm_${Date.now().toString(36)}_${(idCounter++).toString(36)}`;

/**
 * Pick a rarity from weights like { common: 70, uncommon: 25, rare: 5 }.
 * Rarities that aren't allowed from this source (see src/data/rarities) are skipped,
 * so a mob can never roll an Epic even if someone puts it in the mob weights by mistake.
 */
function rollRarity(weights, sourceType) {
  const allowed = RARITY_ORDER.filter(r =>
    weights[r] > 0 &&
    RARITY[r].sources.includes(sourceType) &&
    !RARITY[r].uniqueOnly);
  if (!allowed.length) throw new Error(`No rarity in ${JSON.stringify(weights)} can drop from "${sourceType}"`);

  const total = allowed.reduce((sum, r) => sum + weights[r], 0);
  let roll = Math.random() * total;
  for (const r of allowed) {
    if ((roll -= weights[r]) <= 0) return r;
  }
  return allowed[allowed.length - 1];
}

/**
 * Make a random item for a class.
 * @param {object} o
 *   itemLevel, rarity, forClass
 *   sourceType - "mob" | "dungeon" | "boss"  (decides which rarities and slots are allowed)
 *   source     - name shown on the item, e.g. "Crypt Ghoul"
 *   slotType   - optional; random from the slots this source is allowed to drop
 */
function generateItem({ itemLevel, rarity, forClass, sourceType, source, slotType }) {
  const r = RARITY[rarity];
  if (!r) throw new Error(`Unknown rarity "${rarity}"`);
  if (!r.sources.includes(sourceType)) throw new Error(`${r.name} items can't drop from "${sourceType}"`);
  if (r.uniqueOnly) throw new Error(`${r.name} items are hand-made only (add them to a boss's uniqueDrops)`);

  const allowedSlots = DROP_SLOTS[sourceType];
  slotType = slotType || pick(allowedSlots);
  if (!allowedSlots.includes(slotType)) throw new Error(`"${slotType}" items can't drop from "${sourceType}"`);
  const classStats = CLASS_STATS[forClass];
  const budget = Math.max(2, Math.round(itemLevel * SLOT_WEIGHT[slotType] * r.budgetMult * BUDGET_SCALE));

  const item = {
    id: newItemId(),
    slotType,
    rarity,
    itemLevel,
    requiredLevel: Math.max(1, itemLevel - 3),
    sourceType,
    source: source || sourceType,
    stats: {},
  };

  // Weapon / shield / armor type
  if (slotType === "mainHand" || slotType === "offHand") {
    item.weaponType = pick(CLASS_WEAPONS[forClass][slotType]);
    item.allowedClasses = Object.keys(CLASS_WEAPONS).filter(c => CLASS_WEAPONS[c][slotType].includes(item.weaponType));
    if (slotType === "mainHand") {
      item.weaponSpeed = WEAPON_SPEED[item.weaponType];
      item.weaponDamage = Math.round(itemLevel * 0.9 * r.budgetMult * (item.weaponSpeed / 2.4));
    }
    if (item.weaponType === "shield") {
      item.stats.armor = Math.round(itemLevel * 1.5 * r.budgetMult);
      item.stats.blockChance = +(0.01 + 0.01 * RARITY_ORDER.indexOf(rarity)).toFixed(2);
    }
  } else if (ARMOR_SLOTS.includes(slotType)) {
    item.armorType = CLASS_ARMOR[forClass];
    item.stats.armor = Math.round(itemLevel * ARMOR_VALUE[item.armorType] * SLOT_WEIGHT[slotType] * 0.4);
  }

  // ~70% of the budget goes into the class's main stats
  let remaining = budget;
  const each = Math.max(1, Math.round((budget * 0.7) / classStats.primary.length));
  for (const stat of classStats.primary) {
    item.stats[stat] = (item.stats[stat] || 0) + each;
    remaining -= each;
  }

  // Bonus stats: better rarity = more lines
  for (let i = 0; i < r.bonusStats && remaining > 0; i++) {
    const stat = pick(classStats.secondary);
    if (stat === "blockChance") {
      item.stats.blockChance = +((item.stats.blockChance || 0) + 0.01).toFixed(2);
      remaining -= 3;
    } else {
      const val = Math.max(1, Math.round(remaining / (r.bonusStats - i)));
      item.stats[stat] = (item.stats[stat] || 0) + val;
      remaining -= val;
    }
  }

  item.name = `${pick(NAME_PARTS.prefix[rarity])} ${NAME_PARTS.base[item.weaponType || slotType]}`;
  return item;
}

// A single number for "how good is this item for this class"
function itemScore(item, className) {
  if (!item) return 0;
  const w = STAT_WEIGHTS[className];
  let score = 0;
  for (const [stat, val] of Object.entries(item.stats || {})) score += (w[stat] || 0) * val;
  if (item.weaponDamage) score += (w.weaponDamage || 0) * item.weaponDamage;
  return score;
}

function formatItem(item) {
  const stats = Object.entries(item.stats).map(([k, v]) => `+${v} ${k}`).join(", ");
  const weapon = item.weaponDamage ? ` ${item.weaponDamage} dmg/${item.weaponSpeed}s,` : "";
  const bossTag = item.sourceType === "boss" ? " ★BOSS" : "";
  return `[${RARITY[item.rarity].name} ${item.name}]${bossTag} ilvl ${item.itemLevel} ${item.slotType}:${weapon} ${stats}` +
    (item.effect ? ` — "${item.effect}"` : "");
}

module.exports = { generateItem, rollRarity, itemScore, formatItem, newItemId };