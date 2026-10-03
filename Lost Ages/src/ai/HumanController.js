// HumanController.js — lets YOU play one of the raid members from the 3D viewer.
//
// The browser sends your input to the simulation (see viewerServer.js /api/control and /api/input):
//   move     which way you're walking (WASD, relative to the camera)
//   cast     an ability key from your action bar (1–0, -, =)
//   target   the enemy (Tab / click) or ally (click a raid frame) you've selected
// Every tick, the simulation calls controller.act() for your character instead of the bot's brain.
// The other 19 players are still bots.

const { isHostile, distance } = require("../classes/Character");

const MOVE_SPEED = 7;        // metres per second — same as the bots
const QUEUE_WINDOW = 0.4;    // press an ability up to 0.4s before the global cooldown ends and it fires when ready (like WoW)

// Turn the game's short error codes into what a player would see on screen
function friendlyReason(reason = "") {
  if (reason === "cooldown") return "That ability isn't ready yet";
  if (reason === "out of range") return "Out of range";
  if (reason === "no target" || reason === "target died") return "You have no target";
  if (reason === "already casting") return "You're already casting";
  if (reason === "dead") return "You are dead";
  if (reason === "stunned") return "You are stunned";
  if (reason === "invalid target") return "Invalid target";
  if (reason.startsWith("not enough")) return `Not enough ${reason.slice(11)}`;
  return reason.charAt(0).toUpperCase() + reason.slice(1);
}

class HumanController {
  constructor() {
    this.name = null;          // the player you're controlling (null = everyone is a bot)
    this.move = { x: 0, y: 0 };
    this.queue = [];           // abilities pressed but not cast yet: { key, until }
    this.enemyTarget = null;   // { kind: "e", id }
    this.allyTarget = null;    // { kind: "p", index }
    this.played = new Set();   // who you controlled this attempt (they don't "learn" — you do!)
    this.onResult = null;      // (result) => void — tells the browser if a cast failed and why
  }

  take(name) {
    this.name = name || null;
    this.move = { x: 0, y: 0 };
    this.queue = [];
    if (this.name) this.played.add(this.name);
  }

  input(msg = {}) {
    if (!this.name) return;
    if (msg.move) {
      const len = Math.hypot(msg.move.x, msg.move.y);
      this.move = len > 0.01 ? { x: msg.move.x / len, y: msg.move.y / len } : { x: 0, y: 0 };
    }
    if (msg.cast) this.queue.push({ key: msg.cast, pressedAt: null });
    if ("enemyTarget" in msg) this.enemyTarget = msg.enemyTarget;
    if ("allyTarget" in msg) this.allyTarget = msg.allyTarget;
  }

  isControlling(bot) {
    return !!this.name && bot.name === this.name;
  }

  // Find the enemy / ally the browser selected. recorder knows which id is which enemy.
  resolveEnemy(world, recorder) {
    const t = this.enemyTarget;
    if (t && t.kind === "e" && recorder) {
      for (const [enemy, id] of recorder.enemyIds) if (id === t.id && !enemy.isDead) return enemy;
    }
    return null;
  }
  resolveAlly(world) {
    const t = this.allyTarget;
    return t && t.kind === "p" ? world.party[t.index] || null : null;
  }

  /** Called every tick instead of bot.think() for the character you control. */
  act(bot, world, dt, now, recorder) {
    const c = bot.character;
    if (!c || c.isDead) {
      if (this.queue.length) this.onResult?.({ key: this.queue[0].key, ok: false, reason: "You are dead — wait for a revive" });
      this.queue = [];
      return;
    }

    // ----- Walking -----
    if (this.move.x || this.move.y) {
      c.move(this.move.x * MOVE_SPEED * dt, this.move.y * MOVE_SPEED * dt);   // moving cancels a cast, like in WoW
      this.facing = { ...this.move };
    }

    // ----- Targets -----
    let enemy = this.resolveEnemy(world, recorder);
    if (!enemy) {
      // No (living) target picked: default to the boss, or the nearest enemy
      const foes = world.ctxFor(c).enemies.filter(e => !e.isDead);
      enemy = foes.find(e => e.isBoss) || foes.sort((a, b) => distance(c, a) - distance(c, b))[0] || null;
    }
    if (enemy && c.target !== enemy) c.setTarget(enemy);   // your auto-attack follows your target
    const ally = this.resolveAlly(world);

    // ----- Abilities -----
    while (this.queue.length) {
      const q = this.queue[0];
      const a = c.abilities[q.key];
      if (!a) { this.queue.shift(); continue; }
      const target = a.target === "enemy" ? enemy
        : a.target === "ally" ? (ally && !ally.isDead ? ally : c)
        : a.target === "deadAlly" ? ally
        : c;
      if (a.target === "deadAlly" && (!ally || !ally.isDead)) {
        this.report(q.key, a, false, "Click a dead raid member to revive them");
        this.queue.shift();
        continue;
      }
      if (a.target === "enemy" && target && !isHostile(c, target)) {
        this.report(q.key, a, false, "Invalid target");
        this.queue.shift();
        continue;
      }
      const dir = this.facing || (enemy ? norm(enemy.position.x - c.position.x, enemy.position.y - c.position.y) : { x: 1, y: 0 });
      const res = c.use(q.key, target, { ...world.ctxFor(c), direction: dir });
      if (res.ok) { this.queue.shift(); this.report(q.key, a, true); continue; }
      // Pressed during the global cooldown: hold it for a moment and fire it the instant it's ready
      if (res.reason === "gcd") {
        if (q.pressedAt == null) q.pressedAt = now;
        if (c.gcdRemaining <= QUEUE_WINDOW && now - q.pressedAt < 1.5) break;
      }
      this.report(q.key, a, false, res.reason === "gcd" ? null : res.reason);
      this.queue.shift();
    }
  }

  report(key, ability, ok, reason) {
    this.onResult?.({ key, name: ability.name, ok, reason: ok || !reason ? null : friendlyReason(reason) });
  }
}

const norm = (x, y) => { const d = Math.hypot(x, y) || 1; return { x: x / d, y: y / d }; };

module.exports = { HumanController, friendlyReason };