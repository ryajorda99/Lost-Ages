// worldMap.js — the layout of the open world: the town in the middle, three regions around it,
// the mob camps in each region and the boss doors at the far end of each road.
//
// Coordinates are in metres. x goes east (right), y goes south (down on the minimap).
// The 3D viewer draws the scenery from this same data, so moving a camp or a door here moves it
// in the game too.

const WORLD_RADIUS = 285;          // the mountains around the edge — you can't walk past them
const TOWN = { name: "Emberhold", x: 0, y: 0, radius: 32 };

// The three regions, each leading to a raid boss
const REGIONS = [
  { key: "crypt",   name: "The Hollow Barrows", theme: "shadow", angle: Math.PI,          boss: "hollowKing",     mobs: "hollowCrypt" },
  { key: "volcano", name: "Ashen Wastes",       theme: "fire",   angle: -Math.PI / 3,     boss: "ashenTyrant",    mobs: "ashenForge" },
  { key: "storm",   name: "Stormreach Peaks",   theme: "storm",  angle: Math.PI / 3,      boss: "stormSovereign", mobs: "stormSpire" },
];

// Mob camps along each road: [distance from town, sideways offset, mobs in the camp]
// Mob keys are from src/data/mobs/<region>.js
const CAMPS = {
  crypt: [
    [70, 14, ["ghoul", "ghoul"]],
    [92, -22, ["skeletonWarrior", "boneArcher"]],
    [118, 18, ["ghoul", "skeletonWarrior", "ghoul"]],
    [142, -16, ["boneArcher", "boneArcher", "skeletonWarrior"]],
    [168, 24, ["skeletonWarrior", "skeletonWarrior", "ghoul"]],
    [186, -8, ["deathKnight", "boneArcher"]],
  ],
  volcano: [
    [70, -14, ["cinderImp", "cinderImp"]],
    [94, 20, ["magmaHound", "magmaHound"]],
    [120, -20, ["forgeGuard", "cinderImp", "flameweaver"]],
    [146, 16, ["magmaHound", "magmaHound", "cinderImp"]],
    [172, -22, ["forgeGuard", "flameweaver", "flameweaver"]],
    [186, 8, ["moltenGiant", "cinderImp"]],
  ],
  storm: [
    [70, 14, ["galeWisp", "galeWisp"]],
    [94, -20, ["thunderhawk", "thunderhawk"]],
    [120, 20, ["stormguard", "galeWisp", "tempestCaller"]],
    [146, -16, ["thunderhawk", "thunderhawk", "galeWisp"]],
    [172, 22, ["stormguard", "tempestCaller", "tempestCaller"]],
    [186, -8, ["stormDrake", "galeWisp"]],
  ],
};

const REGION_CENTER_DIST = 150;    // how far each region's middle is from town
const REGION_RADIUS = 105;
const DOOR_DIST = 236;             // the boss door at the end of each road

// Point along a region's road: `dist` metres out from town, `side` metres to the side
function along(region, dist, side = 0) {
  const a = region.angle, px = -Math.sin(a), py = Math.cos(a);
  return { x: Math.round((Math.cos(a) * dist + px * side) * 10) / 10, y: Math.round((Math.sin(a) * dist + py * side) * 10) / 10 };
}

// Everything the server and the 3D viewer need, as plain data
function buildWorld() {
  const regions = REGIONS.map(r => ({ ...r, center: along(r, REGION_CENTER_DIST), radius: REGION_RADIUS }));
  const doors = regions.map(r => ({ boss: r.boss, region: r.key, theme: r.theme, ...along(r, DOOR_DIST), angle: r.angle }));
  const camps = [];
  for (const r of regions) {
    CAMPS[r.key].forEach(([dist, side, mobs], i) => {
      camps.push({ id: `${r.key}-${i}`, region: r.key, mobFile: r.mobs, mobs, ...along(r, dist, side) });
    });
  }
  return { radius: WORLD_RADIUS, town: TOWN, regions, doors, camps, spawn: { x: 0, y: 6 } };
}

// Which region a point is in (or "town" / "wilds")
function regionAt(world, x, y) {
  if (Math.hypot(x - world.town.x, y - world.town.y) <= world.town.radius + 8) return { key: "town", name: world.town.name, theme: "town" };
  let best = null, bestD = Infinity;
  for (const r of world.regions) {
    const d = Math.hypot(x - r.center.x, y - r.center.y);
    if (d < bestD) { best = r; bestD = d; }
  }
  return bestD <= best.radius + 20 ? best : { key: "wilds", name: "The Wilds", theme: "town" };
}

module.exports = { buildWorld, regionAt, WORLD_RADIUS };