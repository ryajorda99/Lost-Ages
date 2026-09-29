// reviveAbility.js — the revive spell shared by Healers and Knights.
//
// target: "deadAlly" means it can only be cast on a dead party member.
// In raids it uses the shared RevivePool (4 revives, then a 2-minute cooldown).

const REVIVE_KEYS = ["resurrection", "redemption"];

// How many revives other players are casting right now (they've "called dibs" on a charge)
function revivesBeingCast(ctx, exceptTarget = null) {
  return (ctx.allies || []).filter(a =>
    a.cast && REVIVE_KEYS.includes(a.cast.key) && !a.isDead && a.cast.target !== exceptTarget).length;
}

// Is somebody else already reviving this player?
function beingRevived(target, ctx) {
  return (ctx.allies || []).some(a => a.cast && REVIVE_KEYS.includes(a.cast.key) && a.cast.target === target && !a.isDead);
}

function makeRevive({ name, castTime, hpPct, resourcePct }) {
  return {
    name,
    cost: 0, cooldown: 0, castTime, range: 40, target: "deadAlly",
    requires(caster, target, ctx = {}) {
      if (beingRevived(target, ctx)) return "someone is already reviving them";
      const pool = ctx.revives;
      if (pool && pool.available(revivesBeingCast(ctx)) <= 0) return pool.describe();
      return null;
    },
    execute(caster, target, ctx = {}) {
      // The cast finished — check the pool again (another revive may have used the last charge)
      if (!target.isDead) return { revived: false, reason: "already alive" };
      const pool = ctx.revives;
      if (pool && pool.available() <= 0) return { revived: false, reason: pool.describe() };

      target.revive(hpPct);
      target.resource.current = Math.round(target.resource.max * resourcePct);
      target.absorb = 0;
      target._deathCause = null;
      target.enterCombat();
      for (const e of ctx.enemies || []) {
        e.fallen?.delete(target);                // dying again will empower the boss again
        if (e.threat?.has(target)) e.threat.set(target, 0);   // back at the bottom of the threat list
      }
      const left = pool ? pool.spend() : null;
      caster.onRevive?.(target, pool);
      return { revived: true, left };
    },
  };
}

module.exports = { makeRevive, REVIVE_KEYS, beingRevived, revivesBeingCast };