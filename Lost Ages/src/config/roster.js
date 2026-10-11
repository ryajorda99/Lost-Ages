// roster.js — the named characters that are always in your raid.
// Used by scripts/simulate.js (building a new raid) and scripts/play.js (the main menu).

// These players are always in the raid, even in a brand new (--fresh) group.
// Change the class next to a name to move them to a different class.
const CORE_MEMBERS = { Ryan: "Knight", Valk: "Valkyrie", Maddy: "Necromancer", Courtney: "Druid" };

// Old names that were renamed (an older save with these names gets the new ones)
const RENAMED = { Jax: "Maddy", Vex: "Ryan" };

// Body type for each character ("male" or "female"). You can also change it in the menu
// (character select) — that choice is saved with the character and wins over this list.
const BODY_TYPES = {
  Ryan: "male", Valk: "male", Maddy: "female", Courtney: "female",
  // the rest of the raid
  Sera: "female", Mira: "female", Lyra: "female", Isolde: "female", Elara: "female", Tamsin: "female",
  Selene: "female", Ember: "female", Nadia: "female", Freya: "female", Vera: "female", Luna: "female",
  Kira: "female", Zara: "female", Nyx: "female", Ilya: "female", Quinn: "female", Wren: "female",
  Aldric: "male", Brakka: "male", Vex: "male", Ryn: "male", Thorne: "male", Kael: "male", Dusk: "male",
  Grom: "male", Bram: "male", Fenn: "male", Corvin: "male", Hask: "male", Orin: "male", Doran: "male",
  Rook: "male", Garrick: "male", Talos: "male", Jax: "male", Silas: "male", Magnus: "male", Otto: "male", Brom: "male",
};
const bodyTypeFor = (name, saved) => (saved === "female" || saved === "male") ? saved : BODY_TYPES[name] || "male";

module.exports = { CORE_MEMBERS, RENAMED, BODY_TYPES, bodyTypeFor };