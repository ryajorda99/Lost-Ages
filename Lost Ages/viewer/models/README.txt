REALISTIC MODE — free textures and sky lighting for the 3D viewer

Put files in these folders, then refresh the viewer (or press R to switch realistic mode on/off).
You DON'T need to rename anything — the viewer recognises Poly Haven's file names.

  viewer/assets/                 one .hdr file  → the sky and the lighting (metal armour reflects it)
  viewer/assets/floor/           the arena floor textures
  viewer/assets/pillars/         the pillar textures

WHERE TO GET THEM (free, CC0 — no credit needed): https://polyhaven.com

1) SKY (HDRI)
   - Go to polyhaven.com/hdris. Dark, moody skies suit raids best: try the "Night", "Overcast"
     or "Sunrise-Sunset" categories (a stormy/overcast sky looks great for the dragon).
   - Pick one, set the size to 2K, format HDR, and download.
   - Put the .hdr file in viewer/assets/

2) FLOOR
   - Go to polyhaven.com/textures. Search "castle brick", "medieval blocks", "rock floor" or "cobblestone".
   - Pick one, choose 2K and JPG. Download these maps (Poly Haven names them like this):
        ..._diff_2k.jpg      (colour)
        ..._nor_gl_2k.jpg    (normal — the GL one, not DX)
        ..._rough_2k.jpg     (roughness)
        ..._ao_2k.jpg        (ambient occlusion — optional)
   - Put them in viewer/assets/floor/

3) PILLARS
   - Same as the floor, with a different stone (search "rock wall", "stone wall", "marble").
   - Put them in viewer/assets/pillars/

Also works with textures from ambientCG.com (names containing Color / NormalGL / Roughness / AmbientOcclusion).
Big files (4K, 8K) look sharper but load slower — 2K is the sweet spot.