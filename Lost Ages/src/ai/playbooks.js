// playbooks.js — what each class *wants* to do, as scored options.
// The PlayerBot decides how well it actually does it (reaction time, noise, mistakes).
//
// options(bot, world, now) returns [{ key, target, score }]; higher score = higher priority.
// world = { boss, party, adds, tank, ctxFor(character) }
// Use bot.sees(id, condition, now, mechanicName) for anything a human has to notice first.
// Passing the mechanic's name lets the bot's memory of that mechanic affect how well they handle it.

const { beingRevived, REVIVE_KEYS } = require("../classes/reviveAbility");

const pct = (u) => u.hp / u.maxHp;

// Which enemy a DPS goes after: most players swap to adds, some tunnel the boss
function dpsTarget(bot, world) {
  const adds = world.adds.filter(a => !a.isDead);
  if (adds.length && bot.style.swapsToAdds) return adds.sort((a, b) => a.hp - b.hp)[0];
  return world.boss;
}

// Anyone within reach of an interruptible boss cast
function bossCastIs(boss, key) {
  return boss.cast && boss.cast.key === key;
}

// Name of what the boss is casting (the mechanic players learn), e.g. "Pyroclasm"
function castName(boss) {
  return boss.cast ? boss.abilities[boss.cast.key]?.name : null;
}

// Is the boss casting something that CAN be interrupted? Returns an id for bot.sees(), or null.
function kickableCast(boss) {
  if (!boss.cast) return null;
  const a = boss.abilities[boss.cast.key];
  if (!a || a.uninterruptible || boss.hasBuff?.("adapt_unstoppable")) return null;
  return `bossCast:${boss.cast.key}`;
}

// Is this player standing in front of the boss (the side the boss is facing)?
function inFrontOf(boss, p) {
  const t = boss.pickTarget?.();
  if (!t || t === p) return false;
  const fx = t.position.x - boss.position.x, fy = t.position.y - boss.position.y;
  const px = p.position.x - boss.position.x, py = p.position.y - boss.position.y;
  return px * fx + py * fy > 0 && Math.hypot(px, py) <= 13;
}

// Boss is winding up a frontal attack and I'm in front of it — run behind him
function dodgeFrontal(bot, world, dt, now) {
  const b = world.boss, c = bot.character;
  const danger = b.cast && b.abilities[b.cast.key]?.frontal && c.role !== "tank" && inFrontOf(b, c);
  if (!bot.sees("frontal", !!danger, now, b.cast ? b.abilities[b.cast.key]?.name : null)) return false;
  bot.moveToward(bot.safeMeleeSpot(b, b.pickTarget()), dt, 0.3);
  return true;
}

function meleeMove(bot, world, dt, now) {
  const c = bot.character;
  if (dodgeFrontal(bot, world, dt, now)) return;
  const target = c.target || world.boss;
  if (target.isDead) return;
  // Smart players stand behind the boss — relative to whoever he's FACING right now.
  // When the tanks swap, the boss turns, so they have to notice and move (reaction time!).
  if (target === world.boss && bot.knowsPositioning) {
    const facing = world.boss.pickTarget?.();
    const tank = facing && facing.role === "tank" ? facing : world.tank;
    if (bot.facingTank !== tank && bot.sees(`bossTurned:${tank.name}`, true, now)) bot.facingTank = tank;
    bot.moveToward(bot.safeMeleeSpot(world.boss, bot.facingTank || tank), dt, 0.8);
  } else if (bot.distanceTo(target) > 4.5) {
    bot.moveToward(target.position, dt, 3.5);
  }
}

function rangedMove(bot, world, dt, now) {
  const c = bot.character;
  if (dodgeFrontal(bot, world, dt, now)) return;
  // Death Gripped / knocked out of position: run back (after noticing)
  const offSpot = Math.hypot(c.position.x - bot.home.x, c.position.y - bot.home.y) > 2;
  if (bot.sees("outOfPosition", offSpot, now)) {
    bot.moveToward(bot.home, dt, 0.5);
    return;
  }
  bot.fidget(now, dt);
}

// ---------------- Revives ----------------
// Who should I bring back? Tanks first, then healers, then DPS.
// Skips anyone already being revived, and only counts bodies the bot has actually noticed.
// SMART PART: a body still lying in fire (or under a warning circle) would just die again
// and waste one of the raid's 4 revives — so players who check skip it and revive someone
// else, or wait for the fire to go away. Players who don't check revive them anyway.
const REVIVE_ORDER = { tank: 0, healer: 1, dps: 2 };
function reviveTarget(bot, w, now) {
  const pool = w.revives;
  if (pool && pool.available() <= 0) return null;          // raid is out of revives (or on the 2-min cooldown)
  const others = { allies: w.party.filter(a => a !== bot.character) };
  const dead = w.party
    .filter(p => p.isDead && p !== bot.character && !beingRevived(p, others))
    .filter(p => bot.distanceTo(p) <= 40)
    .sort((a, b) => (REVIVE_ORDER[a.role] ?? 2) - (REVIVE_ORDER[b.role] ?? 2));
  let waiting = false;
  for (const t of dead) {
    if (!bot.sees(`dead:${t.name}`, true, now)) continue;                       // haven't noticed this body yet
    if (bot.checksBody(`bodyInFire:${t.name}`, !!bot.zoneAt(t.position), now)) { waiting = true; continue; }
    return t;
  }
  if (waiting) bot.say("waitRez", now, 25);
  return null;
}

// Mid-cast: fire landed on the body I'm reviving — cancel before I waste the revive
function cancelUnsafeRevive(bot, now) {
  const c = bot.character;
  if (!c.cast || !REVIVE_KEYS.includes(c.cast.key)) return;
  const t = c.cast.target;
  if (bot.sees(`rezCancel:${t.name}`, !!bot.zoneAt(t.position), now)) {
    c.interrupt("cancelled");
    bot.noticed.set(`bodyInFire:${t.name}`, { willNotice: true, reactAt: 0 });   // they know it's in the fire now
    bot.say("rezCancel", now, 10);
  }
}

const PLAYBOOKS = {
  // ======================= KNIGHT (tank) =======================
  Knight: {
    options(bot, w, now) {
      const k = bot.character, b = w.boss;
      cancelUnsafeRevive(bot, now);
      const bossTarget = b.pickTarget();
      const iAmTanking = bossTarget === k;
      const stacks = (u) => u?.buffs.find(x => x.id === "moltenBrand")?.stacks || 0;

      // Pull: the main tank grabs the boss at the start
      const pull = bot.mainTank && now < 0.3;
      // A non-tank has aggro: any tank should take it back
      const dpsHasAggro = bossTarget && bossTarget.role !== "tank";
      // Tank swap: the other tank has 3+ Molten Brand stacks and mine have worn off
      const swap = bossTarget && !iAmTanking && bossTarget.role === "tank" && stacks(bossTarget) >= 3 && stacks(k) === 0;
      // Tank swaps are a learned skill (Immolation is what happens when you get it wrong)
      const tauntBoss = bot.sees("tauntBoss", !!(pull || dpsHasAggro || swap), now, swap ? "Immolation" : null);

      // Off-tank: pick up adds that are chewing on non-tanks
      const looseAdd = !iAmTanking && (w.adds || []).find(a => !a.isDead && a.pickTarget?.() && a.pickTarget().role !== "tank");
      const grabAdd = looseAdd && bot.sees(`looseAdd:${looseAdd.name}`, true, now);

      const target = !iAmTanking && looseAdd ? looseAdd : b;
      k.setTarget(target);

      // Challenge (AoE aggro): pick up enemies that are hitting healers/DPS, or open the pull
      const looseCount = [b, ...(w.adds || [])].filter(e => !e.isDead && e.pickTarget?.() && e.pickTarget().role !== "tank" && bot.distanceTo(e) < 12).length;
      const wantChallenge = (bot.mainTank && now < 0.5) || (looseCount > 0 && bot.sees(`loose:${looseCount}`, true, now));

      const busterIncoming = iAmTanking && bot.sees("bossCast:crushingBlow", bossCastIs(b, "crushingBlow"), now, "Crushing Blow");
      const panic = pct(k) < bot.personality.panicHp;
      // Off-tank with nothing to pick up can stop and revive someone (never while tanking)
      const rez = !iAmTanking && !tauntBoss && !grabAdd && !panic ? reviveTarget(bot, w, now) : null;
      return [
        { key: "redemption", target: rez, score: rez ? (rez.role === "tank" ? 92 : 60) : 0, onUse: () => bot.say("reviving", now, 8) },
        { key: "divineTaunt", target: b, score: tauntBoss ? 100 : 0, onUse: () => swap && bot.say("taunt", now, 10) },
        { key: "divineTaunt", target: looseAdd, score: grabAdd ? 75 : 0 },
        { key: "challenge", target: k, score: wantChallenge ? (looseCount >= 2 ? 85 : 70) : 0 },
        { key: "shieldOfValor", target: k, score: busterIncoming ? 95 : panic || (iAmTanking && stacks(k) >= 3) ? 80 : 0 },
        { key: "sonOfLight", target: k, score: busterIncoming && pct(k) < 0.7 ? 90 : pct(k) < 0.25 ? 85 : 0 },
        { key: "holyTouch", target: k, score: pct(k) < 0.25 ? 88 : 0 },
        { key: "judgment", target, score: 50 },
        { key: "holyGrounds", target: k, score: bot.distanceTo(target) < 5 ? 45 : 0 },
        { key: "righteousStrike", target, score: 40 },
      ];
    },
    move(bot, w, dt) {
      if (bot.character.cast?.key === "redemption") return;   // stand still while reviving
      const t = bot.character.target || w.boss;
      if (bot.distanceTo(t) > 4) bot.moveToward(t.position, dt, 3);
    },
  },

  // ======================= WARRIOR (melee dps) =======================
  Warrior: {
    pickStyle: (bot) => ({ swapsToAdds: Math.random() < 0.3 + bot.p.awareness * 0.6 }),
    options(bot, w, now) {
      const wr = bot.character, b = w.boss;
      const t = dpsTarget(bot, w);
      wr.setTarget(t);
      const addsNear = w.adds.filter(a => !a.isDead && bot.distanceTo(a) < 8).length;
      const kickIt = bot.sees(kickableCast(b) || "noCast", !!kickableCast(b), now, castName(b)) && bot.distanceTo(b) < 5;
      const burst = bot.personality.cooldownsEarly || b.phaseIndex >= 2;
      return [
        { key: "pummel", target: b, score: kickIt ? 90 : 0, onUse: (r) => r.interrupted && bot.say("gotInterrupt", now) },
        // Don't Charge into fire!
        { key: "charge", target: t, score: bot.distanceTo(t) > 8 && !bot.zoneAt(t.position) ? 70 : 0 },
        { key: "recklessness", target: wr, score: burst ? 65 : 0 },
        { key: "battleShout", target: wr, score: wr.hasBuff("battleShout") ? 0 : 55 },
        { key: "execute", target: t, score: pct(t) < 0.2 ? 62 : 0 },
        { key: "whirlwind", target: wr, score: addsNear >= 2 ? 60 : 0 },
        { key: "mortalStrike", target: t, score: 50 },
        { key: "heroicStrike", target: t, score: wr.resource.current > 50 ? 35 : 15 },
      ];
    },
    move: meleeMove,
  },

  // ======================= ROGUE (melee dps) =======================
  Rogue: {
    pickStyle: (bot) => ({
      swapsToAdds: Math.random() < 0.3 + bot.p.awareness * 0.6,
      // Good rogues always finish at 5 combo points; sloppier ones finish early
      finishAt: bot.p.decisionNoise > 0.25 ? 3 + Math.floor(Math.random() * 3) : 5,
    }),
    options(bot, w, now) {
      const r = bot.character, b = w.boss;
      const t = dpsTarget(bot, w);
      r.setTarget(t);
      const kickIt = bot.sees(kickableCast(b) || "noCast", !!kickableCast(b), now, castName(b)) && bot.distanceTo(b) < 5;
      const targeted = bot.sees("targeted", b.pickTarget() === r, now);
      return [
        { key: "stealth", target: r, score: now < 0.5 ? 100 : 0 },
        { key: "kick", target: b, score: kickIt ? 90 : 0, onUse: (res) => res.interrupted && bot.say("gotInterrupt", now) },
        { key: "evasion", target: r, score: targeted ? 85 : 0 },
        { key: "vanish", target: r, score: targeted && pct(r) < 0.4 ? 88 : 0 },
        { key: "ambush", target: t, score: 80 },
        { key: "deathMark", target: b, score: t === b ? 60 : 0 },
        { key: "eviscerate", target: t, score: r.comboPoints >= bot.style.finishAt ? 55 : 0 },
        { key: "sinisterStrike", target: t, score: 40 },
      ];
    },
    move: meleeMove,
  },

  // ======================= MAGE (ranged dps) =======================
  Mage: {
    // Some mages love fire, some love frost — variety between players
    pickStyle: (bot) => ({ school: Math.random() < 0.6 ? "fire" : "frost", swapsToAdds: Math.random() < 0.3 + bot.p.awareness * 0.6 }),
    options(bot, w, now) {
      const m = bot.character, b = w.boss;
      const t = dpsTarget(bot, w);
      m.setTarget(t);
      // Skilled mages wait to counterspell late in the cast; casual ones fire it immediately
      const waitForIt = bot.p.decisionNoise < 0.2 ? (b.cast?.remaining ?? 0) < 1.2 : true;
      const counter = bot.sees(kickableCast(b) || "noCast", !!kickableCast(b), now, castName(b)) && waitForIt;
      const threatened = bot.sees("targeted", b.pickTarget() === m, now) || pct(m) < bot.personality.panicHp;
      const addsClose = w.adds.filter(a => !a.isDead && bot.distanceTo(a) < 8).length;
      const moving = !!bot.movePlan;
      const fire = bot.style.school === "fire";
      return [
        { key: "counterspell", target: b, score: counter ? 90 : 0, onUse: (r) => r.interrupted && bot.say("gotInterrupt", now) },
        { key: "manaShield", target: m, score: threatened ? 85 : 0 },
        { key: "blink", target: m, score: addsClose && pct(m) < 0.5 ? 75 : 0 },
        { key: "frostNova", target: m, score: addsClose >= 1 ? 60 : 0 },
        { key: "meteor", target: t, score: moving ? 0 : 70 },
        { key: "fireBlast", target: t, score: moving ? 65 : 42 },
        { key: "fireball", target: t, score: moving ? 0 : fire ? 45 : 30 },
        { key: "frostBolt", target: t, score: moving ? 0 : fire ? 30 : 45 },
      ];
    },
    move: rangedMove,
  },

  // ======================= HEALER =======================
  Healer: {
    options(bot, w, now) {
      const h = bot.character, b = w.boss;
      cancelUnsafeRevive(bot, now);
      const alive = w.party.filter(p => !p.isDead);
      const sorted = alive.slice().sort((a, c) => pct(a) - pct(c));

      // Humans don't always pick the lowest target — sometimes the 2nd or 3rd
      const roll = Math.random();
      const low = roll < bot.p.healAccuracy ? sorted[0] : sorted[Math.min(sorted.length - 1, roll < 0.9 ? 1 : 2)];
      const lp = pct(low);

      const doomed = alive.find(a => a.hasBuff("doom"));
      const seesDoom = doomed && bot.sees(`doom:${doomed.name}`, true, now, "Doom");
      const novaComing = bot.sees("bossCast:shadowNova", bossCastIs(b, "shadowNova"), now);
      const dispel = alive.find(a => a.buffs.some(x => x.dispellable && x.id !== "doom"));
      const manaPct = h.resource.current / h.resource.max;
      const hurtCount = sorted.filter(a => pct(a) < 0.5).length;
      const bored = sorted[0] && pct(sorted[0]) > 0.95 && manaPct > 0.7;
      // Revive when nobody is about to die (a dead tank is worth it almost always)
      const rez = reviveTarget(bot, w, now);
      const rezScore = !rez ? 0 : rez.role === "tank" ? 95 : lp < 0.35 ? 0 : rez.role === "healer" ? 78 : 65;

      return [
        { key: "resurrection", target: rez, score: rezScore, onUse: () => bot.say("reviving", now, 8) },
        { key: "purify", target: doomed, score: seesDoom ? 100 : 0 },
        { key: "divineHymn", target: h, score: hurtCount >= 3 ? 92 : 0 },
        { key: "prayerOfMending", target: h, score: novaComing ? 85 : hurtCount >= 3 ? 60 : 0 },
        { key: "flashHeal", target: low, score: lp < 0.35 ? 80 : 0 },
        { key: "holyWard", target: low, score: lp < 0.6 ? 70 : 0 },
        { key: "renew", target: low, score: lp < 0.9 && !low.hasBuff(`renew_${h.name}`) ? 55 : 0 },
        { key: "purify", target: dispel, score: dispel ? 50 : 0 },
        { key: "greaterHeal", target: low, score: lp < 0.75 ? 45 : 0 },
        { key: "smite", target: b, score: bored ? 10 : 0 }, // nothing to heal? do a little damage
      ];
    },
    move: rangedMove,
  },

  // ======================= DRUID (damage + support) =======================
  // Deals damage most of the time, but watches the raid: heals people in trouble,
  // throws Tranquility when lots of people are hurt, gives healers mana back (Innervate)
  // and cleanses Doom. Some Druids love to support, others would rather just do damage.
  Druid: {
    pickStyle: (bot) => ({
      swapsToAdds: Math.random() < 0.3 + bot.p.awareness * 0.6,
      supportBias: 0.6 + Math.random() * 0.6,   // how much this player cares about helping (0.6–1.2)
    }),
    options(bot, w, now) {
      const d = bot.character, b = w.boss;
      const t = dpsTarget(bot, w);
      d.setTarget(t);
      const alive = w.party.filter(p => !p.isDead);
      const low = alive.slice().sort((a, c) => pct(a) - pct(c))[0];
      const lp = low ? pct(low) : 1;
      const hurt = alive.filter(a => pct(a) < 0.5).length;
      const tank = b.pickTarget?.();
      const oomHealer = alive.filter(a => a.role === "healer" && a.resource.current / a.resource.max < 0.35)
        .sort((a, c) => a.resource.current - c.resource.current)[0];
      const doomed = alive.find(a => a.hasBuff("doom"));
      const moving = !!bot.movePlan;
      const sup = bot.style.supportBias;

      // Support needs a human to notice first
      const saveLow = low && lp < 0.35 && bot.sees(`low:${low.name}`, true, now);
      const raidHurt = bot.sees("raidHurt", hurt >= 4, now);
      const giveMana = oomHealer && bot.sees(`oom:${oomHealer.name}`, true, now);
      const cleanseDoom = doomed && bot.sees(`doom:${doomed.name}`, true, now, "Doom");
      const threatened = bot.sees("targeted", b.pickTarget() === d, now) || pct(d) < bot.personality.panicHp;

      return [
        { key: "markOfTheWild", target: d, score: d.hasBuff("markOfTheWild") ? 0 : now < 2 ? 99 : 40 },
        { key: "removeCorruption", target: doomed, score: cleanseDoom ? 96 : 0 },
        { key: "barkskin", target: d, score: threatened ? 85 : 0 },
        { key: "tranquility", target: d, score: raidHurt ? 90 * sup : 0 },
        { key: "innervate", target: oomHealer, score: giveMana ? 80 * sup : 0 },
        { key: "regrowth", target: low, score: saveLow && !moving ? 78 * sup : 0 },
        { key: "rejuvenation", target: low, score: saveLow && !low.hasBuff(`rejuvenation_${d.name}`) ? 76 * sup : 0 },
        // Keep a heal-over-time rolling on the tank and on anyone who's hurt
        { key: "rejuvenation", target: tank, score: tank?.role === "tank" && !tank.hasBuff(`rejuvenation_${d.name}`) ? 58 * sup : 0 },
        { key: "rejuvenation", target: low, score: low && lp < 0.6 && !low.hasBuff(`rejuvenation_${d.name}`) ? 57 * sup : 0 },
        { key: "moonfire", target: t, score: !t.hasBuff(`moonfire_${d.name}`) ? 56 : moving ? 40 : 0 },
        { key: "starsurge", target: t, score: moving ? 0 : 54 },
        { key: "wrath", target: t, score: moving ? 0 : 45 },
      ];
    },
    move: rangedMove,
  },

  // ======================= NECROMANCER (ranged OR melee dps) =======================
  // Likes to fight up close in Reaper stance (more damage) but backs off to Deathcaller
  // stance when it gets dangerous: low health, the boss is hitting them, fire under the
  // boss, or the boss is winding up a frontal attack. Keeps Corrupted Servants up.
  Necromancer: {
    pickStyle: (bot) => ({
      swapsToAdds: Math.random() < 0.3 + bot.p.awareness * 0.6,
      likesMelee: Math.random() < 0.65,   // some necromancers just prefer staying at range
    }),
    options(bot, w, now) {
      const n = bot.character, b = w.boss;
      const t = dpsTarget(bot, w);
      n.setTarget(t);
      const moving = !!bot.movePlan;

      // Is it too dangerous to be in melee right now?
      const bossFrontal = b.cast && b.abilities[b.cast.key]?.frontal;
      const fireAtTarget = !!bot.zoneAt(t.position);
      const targeted = b.pickTarget() === n;
      const danger = pct(n) < 0.4 || targeted || bossFrontal || fireAtTarget;
      if (danger) bot.stayRangedUntil = now + 8;          // once spooked, stay back for a bit
      const wantMelee = bot.style.likesMelee && !danger && now >= (bot.stayRangedUntil || 0);
      const goMelee = n.stance === "ranged" && bot.sees("goMelee", wantMelee, now);
      const goRanged = n.stance === "melee" && bot.sees("goRanged", !wantMelee, now, bossFrontal ? castName(b) : null);

      const addsNear = w.adds.filter(a => !a.isDead && bot.distanceTo(a) < 8).length;
      const melee = n.stance === "melee";
      return [
        { key: "deathcallerForm", target: n, score: goRanged ? 95 : 0, onUse: () => bot.say("goRanged", now, 15) },
        { key: "reaperForm", target: n, score: goMelee ? 88 : 0, onUse: () => bot.say("goMelee", now, 15) },
        { key: "boneShield", target: n, score: targeted || pct(n) < bot.personality.panicHp ? 85 : 0 },
        { key: "raiseCorrupted", target: n, score: !t.isDead && !moving ? 72 : 0, onUse: () => bot.say("servants", now, 60) },
        // Reaper stance
        { key: "soulCleave", target: n, score: melee && addsNear >= 2 ? 60 : 0 },
        { key: "reap", target: t, score: melee ? 50 : 0 },
        // Deathcaller stance
        { key: "plague", target: t, score: !melee && !t.hasBuff(`plague_${n.name}`) ? 55 : 0 },
        { key: "deathBolt", target: t, score: !melee && !moving ? 45 : 0 },
      ];
    },
    move(bot, w, dt, now) {
      if (bot.character.stance === "melee") meleeMove(bot, w, dt, now);
      else rangedMove(bot, w, dt, now);
    },
  },
};

module.exports = { PLAYBOOKS };