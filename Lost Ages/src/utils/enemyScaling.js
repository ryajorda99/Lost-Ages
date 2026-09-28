// enemyScaling.js — the CODE that makes mobs and bosses scale with the party's gear.
// (The settings are in src/config/scalingConfig.js)
//
// 1. gearPower(nakedCharacter, gear)         -> how much stronger gear makes ONE player (1.0 = no gear)
// 2. partyGearPower([...])                   -> average for the whole party
// 3. enemyMultipliers(partyPower, "mobs")    -> { hp, damage } for mobs   (or "bosses")
// 4. applyScaling(enemy, partyPower)         -> scales an enemy, picking mob or boss settings itself

const SCALING = require("../config/scalingConfig");
const { STAT_WEIGHTS } = require("../data/items/itemConfig");
const { itemScore } = require("../items/itemGenerator");

// How "strong" a character is with no gear, using the same stat values as loot decisions
function nakedScore(c) {
  const w = STAT_WEIGHTS[c.className];
  let score = 0;
  for (const [stat, weight] of Object.entries(w)) {
    score += weight * (stat === "weaponDamage" ? c.weaponDamage : (c[stat] || 0));
  }
  return score;
}

/**
 * How much stronger gear makes a player. 1.0 = no gear, 1.4 = gear adds 40% power.
 * @param nakedCharacter  a character WITHOUT gear applied (fresh from its class)
 * @param gear            that player's Gear
 */
function gearPower(nakedCharacter, gear) {
  const cls = nakedCharacter.className;
  let bonus = 0;
  for (const item of Object.values(gear.equipped)) {
    if (!item) continue;
    bonus += itemScore(item, cls);
    // A weapon REPLACES the starting weapon, so only count the difference
    if (item.slotType === "mainHand" && item.weaponDamage) {
      bonus -= (STAT_WEIGHTS[cls].weaponDamage || 0) * nakedCharacter.weaponDamage;
    }
  }
  return 1 + Math.max(0, bonus) / nakedScore(nakedCharacter);
}

function partyGearPower(powers) {
  if (!powers.length) return 1;
  return powers.reduce((a, b) => a + b, 0) / powers.length;
}

/**
 * Turn party power into enemy multipliers.
 * @param type "mobs" or "bosses" — each has its own settings in scalingConfig.js
 */
function enemyMultipliers(partyPower, type) {
  const s = SCALING[type];
  if (!SCALING.enabled || !s.enabled) return { hp: 1, damage: 1 };
  const extra = Math.max(0, partyPower - 1);
  const clamp = (m) => Math.min(s.maxMultiplier, Math.max(1, m));
  return {
    hp: clamp(1 + extra * s.hpStrength),
    damage: clamp(1 + extra * s.damageStrength),
  };
}

/**
 * Scale an Enemy or Boss. Call once, right after creating it.
 * Uses boss settings for bosses and mob settings for everything else.
 * Bosses also scale their ability damage and the adds they summon (through b.power).
 * Returns the multipliers that were used.
 */
function applyScaling(enemy, partyPower) {
  // A boss can opt out with  gearScaling: false  in its data file (raid bosses are a gear check)
  if (enemy.def && enemy.def.gearScaling === false) return { hp: 1, damage: 1 };

  const mult = enemyMultipliers(partyPower, enemy.isBoss ? "bosses" : "mobs");
  enemy.maxHp = Math.round(enemy.maxHp * mult.hp);
  enemy.hp = enemy.maxHp;
  enemy.weaponDamage *= mult.damage;
  enemy.str *= mult.damage;
  if (enemy.power) enemy.power *= mult.damage;
  enemy.scaling = mult;
  return mult;
}

module.exports = { gearPower, partyGearPower, enemyMultipliers, applyScaling, nakedScore };