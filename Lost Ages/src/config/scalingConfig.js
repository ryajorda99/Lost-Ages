// scalingConfig.js — SETTINGS for how enemies scale with the party's gear.
// (The code that uses these settings is in src/utils/enemyScaling.js)
//
// How it works: the game measures how much stronger the party's gear makes them
// (e.g. +40% power), then gives enemies a SHARE of that as extra HP and damage.
//
// Strength 0   = enemies never change (gear makes fights easier and easier)
// Strength 1.0 = enemies grow exactly as fast as players (gear feels pointless — avoid!)

module.exports = {
  enabled: true,

  // Regular mobs (trash packs)
  mobs: {
    enabled: true,
    hpStrength: 0.4,       // mobs get 40% of the party's gear power as extra HP
    damageStrength: 0.25,  // and 25% as extra damage
    maxMultiplier: 1.8,    // never more than 1.8x — trash should get easier as you gear up
  },

  // Bosses (also scales their abilities and the adds they summon)
  bosses: {
    enabled: true,
    hpStrength: 0.6,       // bosses get 60% of the party's gear power as extra HP
    damageStrength: 0.4,   // and 40% as extra damage
    maxMultiplier: 2.5,    // never more than 2.5x
  },
};