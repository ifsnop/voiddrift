---
title: "El brillo de disparos e impactos se hace con capas de mezcla aditiva, no con un filtro bloom"
author: Diego
date: 2026-11-15
branch: main
cost: { minutes: 1, tokens: 1597 }
id: l-09f0aacd
scope: repo
status: active
src: agent
touches:
  - sw.js
  - voiddrift.html
---

## Decided
El brillo (glow) de balas, estelas, fogonazos e impactos es falso: formas en capas con blend mode ADD sobre el fondo oscuro, because it needs no new dependency, is cheap on mobile, and leaves the service worker cache untouched.

## Tried and ruled out
- Filtro bloom real (pixi-filters, AdvancedBloomFilter, desde CDN): ruled out because sw.js would have to cache one more CDN dependency, and a full-screen filter costs a lot of GPU on mobile, which is the main play mode. The user picked the additive approach over it.

## Watch out
- Los efectos de alta frecuencia dibujan en UN Graphics compartido por tipo (clear + redibujar cada frame), because one PIXI.Graphics per particle (the old spawnFragments/spawnExhaust pattern) does not scale with the laser in spread mode 8 (up to 8 bullets every 80 ms).
- Es solo visual: el sprite de la bala es más grande que su hitbox a propósito; otherwise physics would change.

In the code:
- voiddrift.html: sección "EFECTOS DE DISPARO" (bulletTrailGfx, muzzleGfx, impactGfx con PIXI.BLEND_MODES.ADD), buildBulletGfx (geometría cacheada por variante), constantes en el bloque "EFECTOS VISUALES DE DISPARO" de CONSTANTS; SHAKE_INTENSITY = 0 desactiva el temblor.
