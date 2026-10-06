// roster.js — the named characters that are always in your raid.
// Used by scripts/simulate.js (building a new raid) and scripts/play.js (the main menu).

// These players are always in the raid, even in a brand new (--fresh) group.
// Change the class next to a name to move them to a different class.
const CORE_MEMBERS = { Ryan: "Knight", Valk: "Valkyrie", Maddy: "Necromancer", Courtney: "Druid" };

// Old names that were renamed (an older save with these names gets the new ones)
const RENAMED = { Jax: "Maddy", Vex: "Ryan" };

module.exports = { CORE_MEMBERS, RENAMED };