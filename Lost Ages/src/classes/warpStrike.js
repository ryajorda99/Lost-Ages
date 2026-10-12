// warpStrike.js — WARP STRIKE (Q): throw your weapon at an enemy and appear where it lands,
// striking as you arrive. Only the KNIGHT has it (see Character.js), and only when YOU play one (the bots don't use it).
//
//   - Range 6–35 m: too close and there's nothing to warp to.
//   - The farther you warp, the harder you hit (up to double at 35 m) — like Final Fantasy XV.
//   - Lands you in melee range of the target, on the side you came from.
//   - Off the global cooldown, 8 second cooldown, costs nothing.

const WARP = {
  minRange: 6,
  range: 35,
  cooldown: 8,
  landGap: 2.2,          // how far from the target's centre you land (metres)
  distanceBonus: 1.0,    // +100% damage at full range
};

const dist2d = (a, b) => Math.hypot(a.position.x - b.position.x, a.position.y - b.position.y);

const WARP_STRIKE = {
  name: "Warp Strike",
  hotkey: "Q",           // not on the 1–= bar: it has its own key
  cost: 0, cooldown: WARP.cooldown, range: WARP.range, target: "enemy", onGcd: false,
  playerOnly: true,      // the AI never picks it
  requires(caster, target) {
    if (target && dist2d(caster, target) < WARP.minRange) return "too close to warp";
    if (caster.hasBuff?.("rooted")) return "you can't warp while rooted";
    return null;
  },
  execute(caster, target) {
    const d = dist2d(caster, target);
    const dx = (caster.position.x - target.position.x) / (d || 1), dy = (caster.position.y - target.position.y) / (d || 1);
    caster.position.x = target.position.x + dx * WARP.landGap;
    caster.position.y = target.position.y + dy * WARP.landGap;
    caster.interrupt?.("warped");
    // Damage: your weapon plus your main stat, more the farther you threw it
    const main = Math.max(caster.str || 0, caster.agi || 0, caster.int || 0, caster.faith || 0);
    const far = 1 + WARP.distanceBonus * Math.min(1, d / WARP.range);
    const dealt = caster.dealDamage(target, (caster.weaponDamage * 1.4 + main * 1.1) * far, "physical");
    caster.setTarget?.(target);
    caster.enterCombat?.();
    return { damage: dealt, distance: Math.round(d) };
  },
};

module.exports = { WARP_STRIKE, WARP };