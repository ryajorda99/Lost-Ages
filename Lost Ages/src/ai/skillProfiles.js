// skillProfiles.js — how "human" a bot plays.
//
// reaction      : seconds it takes to react to something new (random between min/max)
// awareness     : chance to notice a mechanic at all (boss cast, Doom, losing aggro...)
// mistakeRate   : chance a button press is a "wrong" (random usable) ability instead of the best one
// inputDelay    : seconds between button presses (humans don't press perfectly on cooldown)
// lapsePerSec   : chance per second to zone out for 0.5–2s (looking at chat, lag, distracted)
// positioning   : chance the player knows to stand in a safe spot (e.g. behind the boss)
// decisionNoise : how much they deviate from the "optimal" priority (0 = perfect rotation)
// healAccuracy  : healers only — chance to pick the most injured target instead of the 2nd/3rd

const SKILL_PROFILES = {
  casual: {
    label: "Casual",
    reaction: [0.6, 1.2], awareness: 0.55, mistakeRate: 0.08, inputDelay: [0.35, 0.8],
    lapsePerSec: 0.04, positioning: 0.3, decisionNoise: 0.45, healAccuracy: 0.55,
  },
  average: {
    label: "Average",
    reaction: [0.4, 0.8], awareness: 0.75, mistakeRate: 0.04, inputDelay: [0.2, 0.5],
    lapsePerSec: 0.02, positioning: 0.6, decisionNoise: 0.3, healAccuracy: 0.7,
  },
  skilled: {
    label: "Skilled",
    reaction: [0.25, 0.5], awareness: 0.9, mistakeRate: 0.015, inputDelay: [0.1, 0.3],
    lapsePerSec: 0.008, positioning: 0.85, decisionNoise: 0.15, healAccuracy: 0.85,
  },
  pro: {
    label: "Pro",
    reaction: [0.15, 0.3], awareness: 0.97, mistakeRate: 0.005, inputDelay: [0.05, 0.15],
    lapsePerSec: 0.002, positioning: 0.97, decisionNoise: 0.05, healAccuracy: 0.95,
  },
};

// Personalities change *style*, not raw skill
const PERSONALITIES = {
  aggressive: { label: "Aggressive", panicHp: 0.2, cooldownsEarly: true, chatty: 0.6 },
  cautious:   { label: "Cautious",   panicHp: 0.5, cooldownsEarly: false, chatty: 0.4 },
  greedy:     { label: "Greedy",     panicHp: 0.25, cooldownsEarly: true, chatty: 0.3, keepsCasting: true },
  steady:     { label: "Steady",     panicHp: 0.35, cooldownsEarly: false, chatty: 0.2 },
};

function randomSkill() {
  // Most players are average — like a real pickup group
  const r = Math.random();
  if (r < 0.25) return "casual";
  if (r < 0.65) return "average";
  if (r < 0.9) return "skilled";
  return "pro";
}

function randomPersonality() {
  const keys = Object.keys(PERSONALITIES);
  return keys[Math.floor(Math.random() * keys.length)];
}

module.exports = { SKILL_PROFILES, PERSONALITIES, randomSkill, randomPersonality };