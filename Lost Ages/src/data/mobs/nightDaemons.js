// nightDaemons.js — DAEMONS: they only come out at night, in the wilds and the regions (never in town).
// They claw up out of the ground near your party and hunt you, and they burn away at dawn.
// Tougher than the camps around them — the safe thing to do after dark is to make camp.
// (See src/world/World.js — NIGHT for how often they come and how strong they are.)

const MOBS = {
  gloomHound:    { name: "Gloom Hound",       level: 60, hp: 6500,  damage: 95,  attackSpeed: 1.5, armor: 80,  type: "demon" },
  daemonGhoul:   { name: "Daemon Ghoul",      level: 60, hp: 8000,  damage: 115, attackSpeed: 1.8, armor: 90,  type: "demon" },
  ironclad:      { name: "Ironclad Daemon",   level: 62, hp: 32000, damage: 240, attackSpeed: 3.0, armor: 220, type: "demon", elite: true },
};

// The packs that come for you at night
const TRASH_PACKS = [
  ["gloomHound", "gloomHound", "gloomHound", "gloomHound"],
  ["daemonGhoul", "daemonGhoul", "gloomHound", "gloomHound"],
  ["daemonGhoul", "daemonGhoul", "daemonGhoul", "gloomHound", "gloomHound"],
  ["ironclad", "gloomHound", "gloomHound", "daemonGhoul"],   // deep in the night only
];

module.exports = { MOBS, TRASH_PACKS };