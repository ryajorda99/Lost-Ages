// simulate.js — 5-player party vs. The Hollow King (4 phases + random adaptation).
// Run from the Lost Ages folder:
//   node scripts/simulate.js            -> x5 boss, level 20 party
//   node scripts/simulate.js 1          -> x1 boss (to watch all 4 phases)
//   node scripts/simulate.js 5 60       -> x5 boss, level 60 party

const { Knight, Mage, Warrior, Rogue, Healer } = require("../src/classes");
const { Boss } = require("../src/entities/Boss");
const BOSSES = require("../src/data/bosses");

const multiplier = Number(process.argv[2] || 5);
const partyLevel = Number(process.argv[3] || 20);
const QUIET = process.argv.includes("--quiet");

// ---------- Party (ranged players have a "home" spot they return to) ----------
const knight  = new Knight("Aldric", partyLevel, { x: 0, y: 2 });
const warrior = new Warrior("Brakka", partyLevel, { x: 20, y: -3 });
const rogue   = new Rogue("Vex", partyLevel, { x: 1, y: -2 });
const mage    = new Mage("Ryn", partyLevel, { x: -20, y: 0 });
const healer  = new Healer("Sera", partyLevel, { x: -18, y: 5 });
const party = [knight, warrior, rogue, mage, healer];
mage.home = { x: -20, y: 0 };
healer.home = { x: -18, y: 5 };

// ---------- Boss ----------
const boss = new Boss({ ...BOSSES.hollowKing, statMultiplier: multiplier }, { x: 3, y: 0 });

let time = 0;
const log = (msg) => { if (!QUIET) console.log(`[${time.toFixed(1).padStart(5)}s] ${msg}`); };
boss.onAnnounce = (msg) => {
  if (msg.startsWith("PHASE") || msg.includes("ADAPTS") || msg.includes("fixates") || msg.includes("cannot be")) log(`>>> ${msg}`);
};

const stats = Object.fromEntries(party.map(p => [p.name, { damage: 0, healing: 0, diedAt: null }]));
const phaseTimes = [];
let interrupts = 0;
for (const p of party) {
  const dd = p.dealDamage.bind(p);
  p.dealDamage = (t, a, s) => { const d = dd(t, a, s); stats[p.name].damage += d; return d; };
  const hh = p.heal.bind(p);
  p.heal = (t, a) => { const h = hh(t, a); stats[p.name].healing += h; return h; };
  p.onDeath = () => { stats[p.name].diedAt = time; log(`💀 ${p.name} (${p.className}) has died`); };
}
const origInterrupt = boss.interrupt.bind(boss);
boss.interrupt = (reason, lockout) => {
  const key = boss.cast?.key;
  const ok = origInterrupt(reason, lockout);
  if (ok && reason !== "moved") { interrupts++; log(`${boss.abilities[key].name} interrupted (${reason})`); }
  return ok;
};

// ---------- Simple player AI ----------
const alive = () => party.filter(p => !p.isDead);

function pickTarget(p) {
  // DPS kill adds first, the tank stays on the boss
  if (p.role === "dps") {
    const adds = boss.minions.filter(m => !m.isDead);
    if (adds.length) return adds.sort((a, b) => a.hp - b.hp)[0];
  }
  return boss;
}

function returnHome(p, dt) {
  if (!p.home) return false;
  const dx = p.home.x - p.position.x, dy = p.home.y - p.position.y;
  const d = Math.hypot(dx, dy);
  if (d < 1) return false;
  const step = Math.min(d, 7 * dt);
  p.move((dx / d) * step, (dy / d) * step);
  return true;
}

function tryInOrder(p, list, ctx) {
  for (const [key, target] of list) if (p.use(key, target, ctx).ok) return key;
  return null;
}

function playerTurn(p, ctx, dt) {
  if (p.isDead) return;
  const t = pickTarget(p);
  p.setTarget(t);
  const bossCasting = boss.cast ? boss.cast.key : null;

  switch (p.className) {
    case "Knight":
      if (time < 0.1 || boss.pickTarget() !== p) p.use("divineTaunt", boss, ctx);
      if (bossCasting === "crushingBlow") { p.use("shieldOfValor", p, ctx); p.use("sonOfLight", p, ctx); }
      if (p.hp / p.maxHp < 0.4) p.use("shieldOfValor", p, ctx);
      if (p.hp / p.maxHp < 0.25) p.use("holyTouch", p, ctx);
      tryInOrder(p, [["judgment", boss], ["holyGrounds", p], ["righteousStrike", boss]], ctx);
      break;

    case "Warrior":
      p.use("charge", t, ctx);
      if (bossCasting && t === boss) p.use("pummel", boss, ctx);
      if (boss.phaseIndex >= 2) p.use("recklessness", p, ctx);
      tryInOrder(p, [["battleShout", p], ["whirlwind", p], ["execute", t], ["mortalStrike", t], ["heroicStrike", t]], ctx);
      break;

    case "Rogue":
      if (time < 0.1) p.use("stealth", p, ctx);
      if (bossCasting && t === boss) p.use("kick", boss, ctx);
      if (boss.pickTarget() === p) p.use("evasion", p, ctx);
      tryInOrder(p, [["ambush", t], ["deathMark", boss], [p.comboPoints >= 5 ? "eviscerate" : "sinisterStrike", t]], ctx);
      break;

    case "Mage":
      if (returnHome(p, dt)) { p.use("fireBlast", t, ctx); break; }
      if (bossCasting && boss.cast.remaining < 1.5) p.use("counterspell", boss, ctx);
      if (boss.pickTarget() === p || p.hp / p.maxHp < 0.4) p.use("manaShield", p, ctx);
      tryInOrder(p, [["meteor", t], ["fireBlast", t], ["fireball", t]], ctx);
      break;

    case "Healer": {
      if (returnHome(p, dt)) break;
      const living = alive();
      const sorted = living.slice().sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp);
      const low = sorted[0];
      const lowPct = low.hp / low.maxHp;
      // Doom first — it kills if not cleansed
      const doomed = living.find(a => a.hasBuff("doom"));
      if (doomed && p.use("purify", doomed, ctx).ok) break;
      if (sorted.filter(a => a.hp / a.maxHp < 0.5).length >= 3) p.use("divineHymn", p, ctx);
      if (bossCasting === "shadowNova" && p.use("prayerOfMending", p, ctx).ok) break;
      if (lowPct < 0.35 && p.use("flashHeal", low, ctx).ok) break;
      if (lowPct < 0.6 && p.use("holyWard", low, ctx).ok) break;
      if (lowPct < 0.9 && !low.hasBuff(`renew_${p.name}`) && p.use("renew", low, ctx).ok) break;
      const dispel = living.find(a => a.buffs.some(b => b.dispellable));
      if (dispel && p.use("purify", dispel, ctx).ok) break;
      if (lowPct < 0.75) p.use("greaterHeal", low, ctx);
      break;
    }
  }
}

// ---------- Fight loop: 20 ticks per second ----------
const dt = 0.05;
party.forEach(p => { p.setTarget(boss); p.enterCombat(); });
console.log(`The Hollow King x${multiplier} (${boss.maxHp.toLocaleString()} HP, ${Math.round(boss.weaponDamage)} per swing) vs level ${partyLevel} party\n`);

let lastReport = 0, lastPhase = -1;
while (!boss.isDead && alive().length && time < 600) {
  const enemies = [boss, ...boss.minions.filter(m => !m.isDead)];
  for (const p of party) {
    const ctx = { allies: party.filter(a => a !== p), enemies };
    playerTurn(p, ctx, dt);
    p.update(dt, ctx);
  }
  boss.update(dt, { allies: [], enemies: party });

  if (boss.phaseIndex !== lastPhase) { phaseTimes.push(time); lastPhase = boss.phaseIndex; }
  if (time - lastReport >= 20) {
    lastReport = time;
    log(`Boss ${Math.round(boss.hp / boss.maxHp * 100)}% (phase ${boss.phaseIndex + 1}) | adds: ${boss.minions.length} | ` +
        party.map(p => `${p.name} ${p.isDead ? "DEAD" : Math.round(p.hp / p.maxHp * 100) + "%"}`).join(" | "));
  }
  time += dt;
}

// ---------- Results ----------
console.log("\n==== RESULT ====");
console.log(boss.isDead ? `VICTORY — The Hollow King defeated in ${time.toFixed(1)}s`
  : `WIPE at ${time.toFixed(1)}s — boss at ${Math.round(boss.hp / boss.maxHp * 100)}% HP, phase ${boss.phaseIndex + 1}`);
console.log(`Phases reached: ${phaseTimes.map((t, i) => `P${i + 1} @ ${t.toFixed(0)}s`).join(", ")}`);
console.log(`Interrupts landed: ${interrupts}`);
console.log("\nName     Class    Damage    DPS   Healing  Died");
for (const p of party) {
  const s = stats[p.name];
  console.log(`${p.name.padEnd(8)} ${p.className.padEnd(8)} ${String(Math.round(s.damage)).padStart(7)} ${String(Math.round(s.damage / time)).padStart(5)}  ` +
    `${String(Math.round(s.healing)).padStart(7)}   ${s.diedAt == null ? "-" : s.diedAt.toFixed(0) + "s"}`);
}