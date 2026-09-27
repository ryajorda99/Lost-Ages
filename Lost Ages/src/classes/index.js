// index.js — one place to import every class from.
//   const { Knight, createCharacter } = require("./Classes");

const { Character, distance, GCD, MELEE_RANGE } = require("./Character");
const { Knight } = require("./Knight");
const { Mage } = require("./Mage");
const { Warrior } = require("./Warrior");
const { Rogue } = require("./Rogue");
const { Healer } = require("./Healer");

const CLASSES = { Knight, Mage, Warrior, Rogue, Healer };

// Use this at character creation / when loading a save from the database:
//   createCharacter("Mage", "Ryn", 5)
function createCharacter(className, name, level = 1, position) {
  const Cls = CLASSES[className];
  if (!Cls) throw new Error(`Unknown class: ${className}`);
  return new Cls(name, level, position);
}

function loadCharacter(saved) {
  return createCharacter(saved.className, saved.name, saved.level, saved.position);
}

module.exports = {
  Character, Knight, Mage, Warrior, Rogue, Healer,
  CLASSES, createCharacter, loadCharacter,
  distance, GCD, MELEE_RANGE,
};
