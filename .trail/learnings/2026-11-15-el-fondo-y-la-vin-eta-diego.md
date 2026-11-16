---
title: El fondo y la viñeta evitan capas WebGL a pantalla completa por su coste de relleno
author: Diego
date: 2026-11-15
branch: main
cost: { minutes: 9, tokens: 233770 }
id: l-a6e34733
scope: repo
status: active
src: agent
touches:
  - voiddrift.html
---

## Decided
Starfield = small star sprites wrapped with modulo (only their pixels get filled); vignette = a CSS radial-gradient div above the canvas and below the HUD, because full-screen WebGL layers cost a lot of fill rate, which hurts mobile GPUs at DPR 2-3.

## Tried and ruled out
- 3 full-screen PIXI.TilingSprite star layers + a full-screen vignette sprite: dropped the headless (swiftshader) test from ~54 to ~9 FPS; each full-screen layer cost about as much as all the gameplay drawing. Ruled out because of that overdraw.
- Big nebula blobs (4 sprites, radius 160-360): alone cost ~17 FPS in the same test, so they were cut to NEBULA_COUNT = 3 with radius 90-180.

## Watch out
- Newly spawned entities are appended on top of worldContainer, so the flash/muzzle/impact layers would end up underneath them; raiseTopFx() re-raises them every frame. Keep that if you add more "above everything" layers.
- Enemy motion trails use e._mtrail, not e._trail: purge() turns any e._trail into a bullet ghost trail.

In the code:
- voiddrift.html: section "PROFUNDIDAD Y BRILLO" (buildStarfield, vignetteEl, updateBackdrop, updateEntityFx, raiseTopFx); constants STAR_LAYERS, NEBULA_COUNT, VIGNETTE_ALPHA, ENEMY_GLOW_*, SHADOW_*.
- FPS measured with Playwright + swiftshader by toggling .visible per layer.
