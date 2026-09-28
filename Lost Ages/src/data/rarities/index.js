// index.js — loads every rarity file in this folder.
// To add a new rarity (e.g. "mythic"), create mythic.js here and add it to the list below.

const list = [
  require("./common"),
  require("./uncommon"),
  require("./rare"),
  require("./epic"),
  require("./legendary"),
].sort((a, b) => a.order - b.order);

// { common: {...}, uncommon: {...}, ... }
const RARITY = Object.fromEntries(list.map(r => [r.key, r]));

// ["common", "uncommon", "rare", "epic", "legendary"] — worst to best
const RARITY_ORDER = list.map(r => r.key);

// Can this rarity drop from this kind of source ("mob" | "dungeon" | "boss")?
function canDropFrom(rarityKey, sourceType) {
  const r = RARITY[rarityKey];
  return !!r && r.sources.includes(sourceType);
}

module.exports = { RARITY, RARITY_ORDER, canDropFrom };