// legendary.js — BOSS ONLY, and only as hand-made named items (never random).
module.exports = {
  key: "legendary",
  name: "Legendary",
  color: "#ff8000",       // orange
  order: 4,
  budgetMult: 2.6,
  bonusStats: 4,
  sources: ["boss"],
  uniqueOnly: true,       // can't be randomly generated — only from a boss's uniqueDrops list
};