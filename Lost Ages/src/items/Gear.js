// Gear.js — a player's bags and equipped items.
// Gear belongs to the PLAYER, not the combat character, so it survives between fights.
// Call gear.applyTo(character) to add the equipped stats onto a character.

const { SLOTS, SLOT_GROUPS, CLASS_ARMOR, HP_PER_GEAR_STAMINA } = require("../data/items/itemConfig");
const { itemScore } = require("./itemGenerator");

const STAT_KEYS = ["str", "sta", "agi", "int", "faith", "armor", "crit", "haste", "blockChance"];

class Gear {
  constructor(className, bagSize = 30) {
    this.className = className;
    this.bagSize = bagSize;
    this.bag = [];
    this.equipped = Object.fromEntries(SLOTS.map(s => [s, null]));
  }

  // ---------- Bags ----------
  addToBag(items) {
    const added = [], overflow = [];
    for (const it of items) {
      if (this.bag.length < this.bagSize) { this.bag.push(it); added.push(it); }
      else overflow.push(it); // send by mail in a real game
    }
    return { added, overflow };
  }

  // ---------- Equip rules ----------
  canEquip(item, level) {
    if (level < (item.requiredLevel || 1)) return { ok: false, reason: `requires level ${item.requiredLevel}` };
    if (item.allowedClasses && !item.allowedClasses.includes(this.className)) return { ok: false, reason: `${this.className} can't use this` };
    if (item.armorType && item.armorType !== CLASS_ARMOR[this.className]) return { ok: false, reason: `can't wear ${item.armorType}` };
    return { ok: true };
  }

  // Which slot an item would go in (for rings: the empty one, or the weaker one)
  slotFor(item) {
    const slots = SLOT_GROUPS[item.slotType];
    const empty = slots.find(s => !this.equipped[s]);
    if (empty) return empty;
    return slots.slice().sort((a, b) => itemScore(this.equipped[a], this.className) - itemScore(this.equipped[b], this.className))[0];
  }

  equip(itemId, level) {
    const idx = this.bag.findIndex(i => i.id === itemId);
    if (idx === -1) return { ok: false, reason: "item not in bag" };
    const item = this.bag[idx];
    const check = this.canEquip(item, level);
    if (!check.ok) return check;

    const slot = this.slotFor(item);
    this.bag.splice(idx, 1);
    const old = this.equipped[slot];
    if (old) this.bag.push(old);
    this.equipped[slot] = item;
    return { ok: true, slot, replaced: old };
  }

  unequip(slot) {
    const item = this.equipped[slot];
    if (!item) return { ok: false, reason: "slot empty" };
    if (this.bag.length >= this.bagSize) return { ok: false, reason: "bags full" };
    this.equipped[slot] = null;
    this.bag.push(item);
    return { ok: true, item };
  }

  // How much better an item is than what's currently in its slot (negative = worse)
  upgradeValue(item) {
    const current = this.equipped[this.slotFor(item)];
    return itemScore(item, this.className) - itemScore(current, this.className);
  }

  // Equip every bag item that's an upgrade. Returns what was equipped.
  equipUpgrades(level) {
    const equipped = [];
    const sorted = this.bag.slice().sort((a, b) => this.upgradeValue(b) - this.upgradeValue(a));
    for (const item of sorted) {
      if (this.canEquip(item, level).ok && this.upgradeValue(item) > 0) {
        const r = this.equip(item.id, level);
        if (r.ok) equipped.push({ item, replaced: r.replaced });
      }
    }
    return equipped;
  }

  // Sell/destroy items that are worse than what you're wearing
  junkOldItems() {
    const before = this.bag.length;
    this.bag = this.bag.filter(i => this.upgradeValue(i) > 0);
    return before - this.bag.length;
  }

  // ---------- Stats ----------
  totalStats() {
    const total = Object.fromEntries(STAT_KEYS.map(k => [k, 0]));
    for (const item of Object.values(this.equipped)) {
      if (!item) continue;
      for (const [k, v] of Object.entries(item.stats || {})) total[k] = (total[k] || 0) + v;
    }
    return total;
  }

  /**
   * Put this gear's stats onto a character. Safe to call again after changing gear:
   * it removes the previously applied bonus first.
   */
  applyTo(c) {
    const prev = c._gearBonus;
    if (prev) {
      for (const k of STAT_KEYS) c[k] -= prev.stats[k] || 0;
      c.maxHp -= prev.hp;
      if (prev.weapon) { c.weaponDamage = prev.weapon.damage; c.weaponSpeed = prev.weapon.speed; }
    }

    const stats = this.totalStats();
    for (const k of STAT_KEYS) c[k] = +((c[k] || 0) + stats[k]).toFixed(2);
    const hp = stats.sta * HP_PER_GEAR_STAMINA;
    const hpPct = c.hp / c.maxHp;
    c.maxHp += hp;
    c.hp = Math.round(c.maxHp * hpPct);

    let weapon = null;
    const mh = this.equipped.mainHand;
    if (mh?.weaponDamage) {
      weapon = { damage: c.weaponDamage, speed: c.weaponSpeed }; // remember the original
      c.weaponDamage = mh.weaponDamage;
      c.weaponSpeed = mh.weaponSpeed;
    }
    c._gearBonus = { stats, hp, weapon };
  }

  // Average item level of equipped gear (for dungeon requirements / matchmaking)
  itemLevel() {
    const items = Object.values(this.equipped).filter(Boolean);
    if (!items.length) return 0;
    return Math.round(items.reduce((s, i) => s + i.itemLevel, 0) / items.length);
  }

  slotsFilled() {
    return Object.values(this.equipped).filter(Boolean).length;
  }

  // ---------- Save / load (MongoDB-friendly) ----------
  toJSON() {
    return { className: this.className, bagSize: this.bagSize, bag: this.bag, equipped: this.equipped };
  }

  static fromJSON(data) {
    const g = new Gear(data.className, data.bagSize);
    g.bag = data.bag || [];
    g.equipped = { ...g.equipped, ...data.equipped };
    return g;
  }
}

module.exports = { Gear };