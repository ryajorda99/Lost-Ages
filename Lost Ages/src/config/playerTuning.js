// playerTuning.js — global balance knobs for PLAYER characters (bosses and mobs aren't affected).
// Change a number here and every class picks it up — no need to touch the class files.

module.exports = {
  // Every class gets this much extra in EVERY base stat (str, sta, agi, int, faith, armor, crit, haste)
  // and in health. 0.05 = +5%.
  ALL_STATS_BONUS: 0.05,

  // ---------------- Gear restores mana ("Surge") ----------------
  // Every equipped gear piece carries a hidden Surge bonus that refills your resource:
  //   - ON HIT: each time you damage an enemy OR heal someone, you get some back
  //   - REGEN:  a little extra every second, all the time
  // The bonus grows with item level and rarity, so better gear = better mana.
  // It's a % of your max resource, so it works for Mana, Rage, Energy, Valor and Holy Power alike.
  GEAR_SURGE: {
    onHitPctPerPiece: 0.0025,   // each piece: 0.25% of max resource per hit/heal (12 epic pieces ≈ 3% per hit)
    regenPctPerPiece: 0.0018,   // each piece: +0.18% of max resource per second (12 epic pieces ≈ +2.2%/sec)
    hitCooldown: 0.3,           // at most one on-hit refill every 0.3s (so fast damage-over-time ticks don't spam it)
    referenceItemLevel: 60,     // an epic piece at this item level gives exactly the numbers above
    rarityMult: { common: 0.5, uncommon: 0.65, rare: 0.8, epic: 1.0, legendary: 1.25 },
    // How much of the Surge each resource type gets (1 = full). Rage and Energy refill
    // quickly by themselves, so they get half. Anything not listed gets full.
    resourceMult: { Mana: 1, "Holy Power": 1, Valor: 1, Rage: 0.5, Energy: 0.5 },
  },
};