// revivePool.js — the raid's shared supply of revives.
//
// Raid rule: the whole raid can revive 4 players. Once all 4 are used,
// a 2-minute cooldown starts; when it finishes the raid gets 4 revives again.
// Every Healer and Knight draws from the SAME pool.
//
// Outside raids (5-player dungeons) the fight gets no pool, so revives are unlimited.

const RAID_REVIVE_RULES = { charges: 4, cooldown: 120 };

class RevivePool {
  constructor({ charges = RAID_REVIVE_RULES.charges, cooldown = RAID_REVIVE_RULES.cooldown } = {}) {
    this.max = charges;
    this.charges = charges;
    this.cooldownTime = cooldown;
    this.cooldownRemaining = 0;
    this.onRefresh = null;   // optional callback when the revives come back
  }

  get onCooldown() {
    return this.cooldownRemaining > 0;
  }

  // Revives that can still be started. Revives other players are already casting count as taken,
  // so two healers can't both start the last revive at the same time.
  available(castingNow = 0) {
    if (this.onCooldown) return 0;
    return Math.max(0, this.charges - castingNow);
  }

  // Called when a revive lands. Returns how many are left.
  spend() {
    this.charges = Math.max(0, this.charges - 1);
    if (this.charges === 0) this.cooldownRemaining = this.cooldownTime;
    return this.charges;
  }

  tick(dt) {
    if (!this.onCooldown) return;
    this.cooldownRemaining = Math.max(0, this.cooldownRemaining - dt);
    if (this.cooldownRemaining === 0) {
      this.charges = this.max;
      this.onRefresh?.(this);
    }
  }

  describe() {
    if (this.onCooldown) return `no raid revives left (back in ${Math.ceil(this.cooldownRemaining)}s)`;
    return `${this.charges} raid revive${this.charges === 1 ? "" : "s"} left`;
  }
}

module.exports = { RevivePool, RAID_REVIVE_RULES };