Put your 3D models (.glb files) in this folder. The 3D viewer uses them instead of the built-in figures.

FILE NAMES
  Players:  knight.glb  warrior.glb  rogue.glb  mage.glb  healer.glb
  Bosses:   azgaroth-the-ashen-tyrant.glb   the-hollow-king.glb
  Mobs:     the mob's name in lowercase with dashes, numbers removed
            e.g. "Hollow Skeleton 2" -> hollow-skeleton.glb, "Crypt Ghoul" -> crypt-ghoul.glb
  Tip: press M in the 3D viewer to see every file name the current fight looks for.

ANIMATIONS
  Clips inside the .glb are matched by name (upper/lower case doesn't matter):
    Idle   -> a name containing "idle"
    Run    -> "run", "walk" or "jog"
    Attack -> "attack", "slash", "swing", "strike" or "punch"
    Cast   -> "cast", "spell", "magic" or "shoot"
    Death  -> "death", "die" or "dead"
  Missing clips are fine — the viewer falls back to another one.

The model should face forward along +Z (most .glb files already do). Its size is adjusted automatically.
Refresh the viewer page after adding a model.