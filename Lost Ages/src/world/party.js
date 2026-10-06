// party.js — loads your saved raid (the same save file the raids use) and picks
// who travels with you in the open world: you + 4 companions.

const fs = require("fs");
const { PlayerBot } = require("../ai/PlayerBot");
const { PLAYBOOKS } = require("../ai/playbooks");
const { SKILL_PROFILES } = require("../ai/skillProfiles");
const { Gear } = require("../items/Gear");
const { CORE_MEMBERS, RENAMED } = require("../config/roster");

function loadBots(file) {
  if (!fs.existsSync(file)) return null;
  const saved = JSON.parse(fs.readFileSync(file, "utf8"));
  const names = new Set(saved.map(s => s.name));
  return saved.map(s => {
    const name = RENAMED[s.name] && !names.has(RENAMED[s.name]) ? RENAMED[s.name] : s.name;
    const bot = new PlayerBot(name, s.skill, s.personality, PLAYBOOKS[s.className]);
    bot.className = s.className;
    bot.p = { ...SKILL_PROFILES[s.skill], ...s.profile };
    bot.mastery = s.mastery || {};
    bot.potential = s.potential || s.skill;
    bot.experience = s.experience || 0;
    bot.gear = Gear.fromJSON(s.gear);
    bot.lootState = s.lootState;
    bot.kills = s.kills || 0;
    bot.attempts = s.attempts || 0;
    bot._saved = s;   // keep anything we don't touch exactly as it was
    return bot;
  });
}

// Same format as scripts/simulate.js saveGroup()
function saveBots(file, bots) {
  fs.writeFileSync(file, JSON.stringify(bots.map(b => ({
    ...(b._saved || {}),
    name: b.name, className: b.className, skill: b.skillKey, personality: b.personalityKey,
    profile: b.p, mastery: b.mastery, potential: b.potential, experience: b.experience,
    gear: b.gear.toJSON(), lootState: b.lootState, kills: b.kills || 0, attempts: b.attempts || 0,
  })), null, 2));
}

// You + 4: the other heroes first (Ryan, Valk, Maddy, Courtney), then a healer if there's room
function pickParty(bots, playerName) {
  const me = bots.find(b => b.name === playerName) || bots[0];
  const party = [me];
  for (const name of Object.keys(CORE_MEMBERS)) {
    const b = bots.find(x => x.name === name);
    if (b && !party.includes(b) && party.length < 5) party.push(b);
  }
  const fill = (cls) => { const b = bots.find(x => x.className === cls && !party.includes(x)); if (b && party.length < 5) party.push(b); };
  if (!party.some(b => b.className === "Healer")) fill("Healer");
  if (!party.some(b => b.className === "Knight" || b.className === "Valkyrie")) fill("Knight");
  while (party.length < 5) { const b = bots.find(x => !party.includes(x)); if (!b) break; party.push(b); }
  return party;
}

module.exports = { loadBots, saveBots, pickParty };