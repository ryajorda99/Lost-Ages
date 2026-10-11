// convert-models.js — turns Mixamo (or any) .fbx files into the .glb files the game uses.
//
//   One time:   npm install fbx2gltf
//   Then:       node scripts/convert-models.js
//
// Put your downloads here, named the way the game looks for them:
//   viewer/models/fbx/knight.fbx                 → viewer/models/knight.glb       (a character, "with skin")
//   viewer/models/fbx/maddy.fbx                  → viewer/models/maddy.glb        (just that character)
//   viewer/models/fbx/healer-female.fbx          → viewer/models/healer-female.glb
//   viewer/models/fbx/Sword And Shield Idle.fbx  → viewer/models/animations/sword-and-shield-idle.glb  (an animation, "without skin" — sorted automatically)
//   viewer/models/fbx/Magic Spell Pack.zip       → unzipped, and every animation in it converted
//
// Mixamo names every animation "mixamo.com" — this script renames it after the file
// (so "attack.fbx" holds an animation called "attack" and the game knows when to play it).
// Files that are already converted (and haven't changed) are skipped. Refresh the game page after.

const fs = require("fs");
const path = require("path");

const MODELS = path.join(__dirname, "..", "viewer", "models");
const FBX = path.join(MODELS, "fbx");

let convert;
try { convert = require("fbx2gltf"); }
catch {
  console.log("The converter isn't installed yet. Run this once, then try again:\n\n   npm install fbx2gltf\n");
  process.exit(1);
}

// Rename the animations inside a .glb (it's a small JSON header followed by binary data)
function renameAnimations(file, name) {
  const buf = fs.readFileSync(file);
  if (buf.toString("ascii", 0, 4) !== "glTF") return 0;
  const jsonLen = buf.readUInt32LE(12);
  const json = JSON.parse(buf.slice(20, 20 + jsonLen).toString("utf8"));
  const anims = json.animations || [];
  let renamed = 0;
  anims.forEach((a, i) => {
    if (!a.name || /mixamo\.com|^take|^animation|^armature/i.test(a.name)) { a.name = anims.length > 1 ? `${name}-${i + 1}` : name; renamed++; }
  });
  if (!renamed) return 0;
  let text = Buffer.from(JSON.stringify(json), "utf8");
  const pad = (4 - (text.length % 4)) % 4;
  if (pad) text = Buffer.concat([text, Buffer.alloc(pad, 0x20)]);
  const rest = buf.slice(20 + jsonLen);   // the binary chunk, unchanged
  const header = Buffer.alloc(20);
  header.write("glTF", 0, "ascii"); header.writeUInt32LE(2, 4); header.writeUInt32LE(20 + text.length + rest.length, 8);
  header.writeUInt32LE(text.length, 12); header.write("JSON", 16, "ascii");
  fs.writeFileSync(file, Buffer.concat([header, text, rest]));
  return renamed;
}

// Is this .glb an animation (rather than a character)?
//  - Mixamo "Without Skin" downloads have no body at all, so that's easy
//  - "With Skin" downloads (Mixamo's default!) also carry the character, so we go by the name:
//    "Sword And Shield Idle", "Running", "...Slash", "Standing 1H Magic Attack 01", "Dying"... are animations
const ANIM_WORDS_IN_NAME = ["idle", "run", "walk", "jog", "sprint", "slash", "attack", "strike", "swing", "punch", "kick", "stab", "magic", "spell", "cast", "death", "dying", "die", "hit", "impact", "react", "jump", "block", "dodge", "roll", "taunt", "cheer", "dance", "emote"];
// a word in the file name that STARTS with one of these ("running", "slashing", "dying") — so "whitney" isn't a "hit"
const ANIM_NAME = { test: (name) => name.toLowerCase().split(/[^a-z0-9]+/).some(t => ANIM_WORDS_IN_NAME.some(w => t.startsWith(w))) };
function isAnimationOnly(file) {
  try {
    const buf = fs.readFileSync(file);
    const json = JSON.parse(buf.slice(20, 20 + buf.readUInt32LE(12)).toString("utf8"));
    if (!(json.animations || []).length) return false;
    const hasMesh = (json.nodes || []).some(n => n.mesh != null) && (json.meshes || []).length > 0;
    return !hasMesh || ANIM_NAME.test(path.basename(file, ".glb"));
  } catch { return false; }
}

// Unzip any .zip packs (Mixamo "packs" come as zips) into a folder next to them
function expandZips(dir) {
  const { execSync } = require("child_process");
  for (const f of fs.readdirSync(dir).filter(f => /\.zip$/i.test(f))) {
    const out = path.join(dir, f.replace(/\.zip$/i, ""));
    if (fs.existsSync(out)) continue;
    process.stdout.write(`   … unzipping ${f} `);
    try {
      if (process.platform === "win32") execSync(`powershell -NoProfile -Command "Expand-Archive -Force -LiteralPath '${path.join(dir, f).replace(/'/g, "''")}' -DestinationPath '${out.replace(/'/g, "''")}'"`, { stdio: "ignore" });
      else execSync(`unzip -o -q "${path.join(dir, f)}" -d "${out}"`, { stdio: "ignore" });
      console.log("✔");
    } catch { console.log("✖ (unzip it yourself: right-click → Extract All, into this folder)"); }
  }
}

// Every .fbx in the folder and its sub-folders
function findFbx(dir) {
  const out = [];
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, f.name);
    if (f.isDirectory()) out.push(...findFbx(full));
    else if (/\.fbx$/i.test(f.name)) out.push(full);
  }
  return out;
}

const tidyName = (file) => path.basename(file).replace(/\.fbx$/i, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

async function convertAll() {
  const ANIMS = path.join(MODELS, "animations");
  fs.mkdirSync(ANIMS, { recursive: true });
  const done = [];
  for (const src of findFbx(FBX)) {
    const base = tidyName(src);
    // already converted (as a character or an animation) and the .fbx hasn't changed? skip it
    const existing = [path.join(MODELS, base + ".glb"), path.join(ANIMS, base + ".glb")].find(f => fs.existsSync(f));
    if (existing && fs.statSync(existing).mtimeMs > fs.statSync(src).mtimeMs) { console.log(`   ✓ ${path.relative(MODELS, existing).replace(/\\/g, "/")} (already up to date)`); continue; }
    const tmp = path.join(MODELS, base + ".glb");
    process.stdout.write(`   … ${path.relative(FBX, src)} `);
    try {
      await convert(src, tmp, []);
      renameAnimations(tmp, base);
      if (isAnimationOnly(tmp)) {   // animations go in animations/
        const dest = path.join(ANIMS, base + ".glb");
        fs.renameSync(tmp, dest);
        console.log(`→ animations/${base}.glb ✔`);
        done.push(dest);
      } else {
        console.log(`→ ${base}.glb ✔  (character)`);
        done.push(tmp);
      }
    } catch (err) {
      console.log(`✖\n     ${String(err.message || err).split("\n").slice(0, 3).join("\n     ")}`);
    }
  }
  // Animation files left in the main models folder by an older version: move them
  for (const f of fs.readdirSync(MODELS).filter(f => /\.glb$/i.test(f))) {
    if (isAnimationOnly(path.join(MODELS, f))) { fs.renameSync(path.join(MODELS, f), path.join(ANIMS, f)); console.log(`   ↪ moved ${f} into animations/ (it's an animation, not a character)`); }
  }
  return done;
}

// Which file the game will use for each kind of animation (same rules as viewer/3d.html)
const ANIM_WORDS = { idle: ["idle"], run: ["run", "jog", "sprint"], attack: ["slash", "attack", "strike", "swing", "punch", "stab"], cast: ["magic", "spell", "cast"], death: ["death", "dying", "die"], hit: ["hit", "impact", "react"] };
function animationFor(state, files) {
  const words = ANIM_WORDS[state];
  const fits = (f) => words.some(w => f.includes(w)) && (state === "cast" || !/magic|spell/.test(f));   // a "magic attack" is a cast, not an attack
  return files.find(f => f === `${state}.glb`) || files.find(fits);
}

(async () => {
  if (!fs.existsSync(FBX)) {
    fs.mkdirSync(FBX, { recursive: true });
    console.log(`Made the folder viewer/models/fbx/ — put your .fbx files (or Mixamo .zip packs) there and run this again.`);
    return;
  }
  expandZips(FBX);
  for (const d of fs.readdirSync(FBX, { withFileTypes: true })) if (d.isDirectory()) expandZips(path.join(FBX, d.name));
  console.log("Converting everything in viewer/models/fbx/ (characters and animations are sorted automatically):");
  const done = await convertAll();
  const anims = fs.readdirSync(path.join(MODELS, "animations")).filter(f => /\.glb$/i.test(f)).map(f => f.toLowerCase());
  const chars = fs.readdirSync(MODELS).filter(f => /\.glb$/i.test(f));
  console.log(`\nCharacters: ${chars.join(", ") || "none yet"}`);
  console.log("Animations the game will use:");
  for (const st of ["idle", "run", "attack", "cast", "death"]) console.log(`   ${st.padEnd(7)} ${animationFor(st, anims) || "— none (the character's own, or none)"}`);
  console.log(`\nDone — ${done.length} file(s) converted. Restart the game (or refresh the page) to see them.`);
  console.log(`Tip: a character is used by its file name — ryan.glb (just Ryan), knight.glb (every Knight), female.glb... (see viewer/models/README.txt)`);
})();