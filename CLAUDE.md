# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

VOIDRIFT is a browser-based top-down space shooter. The entire game — engine, game logic, UI, and styling — lives in **one file**: `voiddrift.html`, plus a small `sw.js` service worker for offline play and update detection (see "Service worker" below). There is no build step, no package manager, and no test suite. PixiJS v7 is pulled from a CDN (`<script src="https://cdn.jsdelivr.net/npm/pixi.js@7/dist/pixi.min.js">`); everything else is vanilla JS in a single inline `<script>` block.

## Running / testing changes

There is no build or test command. To verify a change works:

```bash
npx serve .
# then open the served URL in a browser
```

Opening `voiddrift.html` directly (`file://`) also works in most browsers. Since there's no test suite, verification means launching the game in a browser and playing through the relevant phase/mechanic — use the `run` skill or manually check the golden path plus the debug keys below.

Debug keys (see in-game, also documented in README.md):
- `Z` through `,` — spawn specific enemy types without waiting for a phase
- `6` / `7` — jump straight to phase 6 or 7

## Build version — bump on every change

`voiddrift.html` defines `const BUILD_VERSION` as the very first statement in the main `<script>` block (right before the CONSTANTS section), formatted `YYMMDD-HHMM`. It's rendered in the bottom-left corner of the HUD (`#hBuild`) so a build can always be identified at a glance, including on a device where you can't easily check file timestamps. `sw.js` has its own matching `CACHE_VERSION` constant — see "Service worker" below for why both must move together.

**Whenever you make ANY change to `voiddrift.html` — gameplay, bugfix, UI, anything — update `BUILD_VERSION` to the current date/time in that format, as part of the same change, AND update `sw.js`'s `CACHE_VERSION` to the identical string.** This is not optional and not tied to a specific kind of edit; treat it the same as you'd treat "the code must still parse." If you're not certain of the exact current time, use the date you do know and a plausible time rather than skipping the bump — a slightly-off timestamp is far less harmful than a stale one that makes two different builds look identical (and if `CACHE_VERSION` doesn't change, the update-detection flow described below silently never fires — players stay stuck on the old cached build).

## Service worker — offline play + update flow

`sw.js` caches `voiddrift.html` plus its two CDN dependencies (PixiJS, nipplejs) under a cache named `voidrift-${CACHE_VERSION}`, served cache-first with a background revalidation fetch (stale-while-revalidate) so the game launches instantly and works offline once loaded once. Update detection relies entirely on the browser's native service worker lifecycle — it does its own byte-diff of `sw.js` against the installed one, so **the only thing that makes an update detectable is `CACHE_VERSION` actually changing**; nothing in this repo re-implements that comparison.

The page (bottom of `voiddrift.html`) registers `sw.js` and listens for `updatefound`. When a new worker reaches `installed` while an old one is still controlling the page (i.e., a genuine update, not the first-ever install), it's stored in `pendingSwUpdate` and the overlay's click-hint text changes to say a new version is available — **but nothing is applied yet**. The overlay's click handler checks `pendingSwUpdate` first: if set, the tap sends `skipWaiting` to the new worker instead of starting a game; the resulting `controllerchange` event reloads the page. This means an update downloads and installs silently in the background at any point (including mid-run), but only ever takes effect at the moment the player would otherwise have started a new game — an active run is never interrupted. If there's no network, `sw.js`'s fetch handler falls back to whatever is cached and never throws, so offline play on a stale-but-working build is the default failure mode, not a broken page.

If you touch this flow, preserve that "never interrupt an in-progress run" property — it was a deliberate, explicit requirement, not an accident of implementation.

## Code organization inside `voiddrift.html`

The file is one big script but is internally organized into clearly delimited sections marked by `// ====...` banners (searchable). Reading top to bottom:

1. **CONSTANTS** (~line 141) — every tunable game parameter (phase durations, enemy energy/damage, bullet speeds, blackhole physics, powerup levels, wall generation ranges, etc.) lives here in one place. Comments are in Spanish. **This is the first place to look when asked to rebalance the game** — most gameplay tuning is a constant edit, not a logic change.
2. **PIXI SETUP / MOBILE DETECTION, WORLD SCALING, CAMERA** — sets up the `PIXI.Application`, detects touch devices, and defines `WORLD_W`/`WORLD_H` and the `cam` (camera) object. `worldContainer` is the PIXI container that all game objects live in; the camera moves this container rather than moving the world.
3. **ENTITY / POOL** — `makeEntity()` builds a plain-object entity (enemy, player, bullet, or wall); `pool` is the flat array holding every live entity. There's no ECS framework — entities are dynamically-shaped objects updated in place each frame, and `purge()` sweeps out dead ones. `purge()` deliberately skips the player entity — its cleanup (gfx removal, etc.) is owned exclusively by the game-over block in the game loop, so a dead player stays in `pool` (inert, `gameOver` already halts all per-frame updates) until the next `startGame()` wipes `pool` entirely.
4. **SPAWN HELPERS / SISTEMA DE FASES (phase system)** — `startPhase()` / `phaseUpdate()` drive the 7-phase progression; `PHASE_ADD_ENEMIES` (in CONSTANTS) declares what gets added at each phase start. Phase 7 has its own dedicated sub-loop (`phase7Update`, `phase7StartWave`, `phase7RepeatCheck`) since it's an endless alternating-wave phase rather than a fixed roster.
5. **SERPENT ENEMY** — a spring-physics segmented chain enemy (head-driven, body follows via spring forces); it's the most complex single enemy type and is self-contained in its own section (`spawnSerpent`, `updateSerpents`).
6. **IA DE ENEMIGOS ESPECIALES (enemy AI)** — per-variant behavior (heavy charges, follower orbits/flanks, hitter fires aimed shots, blackhole drifts and pulls via gravity).
7. **Visual effects sections** (particles, birth effects, lock-on/missiles, energy bars, exhaust) — each effect type has its own spawn/update function pair, called every frame from the game loop.
8. **SCORE SYSTEM / POWERUP SYSTEM** — `addScore()` drives the animated counter + floating popups; `applyPowerup()` / `updatePowerups()` handle the progressive powerup levels (see `PROGRESSIVE` comment near line 1964 — each powerup type has 0–7 stacking levels). Powerups only ever spawn on mobile (`onEnemyDeath()` gates `spawnPowerup()` behind `isMobileControlsActive`) — see "Desktop vs Mobile play modes" below. The shield (`S`) powerup and the manual Space-held shield are two different resource models sharing the same `shieldActive` flag — also covered below. Every stacking level (S/M/L/F) decays on its own — `updatePowerupLevelDecay()` drops one level every `POWERUP_LEVEL_DURATION_MS` (10s) of no matching pickup, so buffs require continued hunting rather than accumulating forever; the top-left `#powerupLevels` HUD (`updatePowerupLevelsHud()`) shows each type's current level and blinks it in the last `POWERUP_LEVEL_BLINK_MS` before a level drops.
9. **PHYSICS STEP** (`physicsStep`) — the collision/impulse/movement integrator, called once per frame with a clamped `dt`.
10. **INPUT / HUD / GRÁFICOS (graphics)** — keyboard/mouse/touch input handling, HUD text updates, and drawing helpers (aim line, shield, player bars).
11. **AUTO-BEAM / WARPED GRID** — weapon 4 (auto-targeting beam) and the cosmetic background grid that visually warps near blackholes (a fake perspective "fabric" projection driven by `FABRIC_*` constants).
12. **LEADERBOARD** — `localStorage`-backed, no backend. `loadLB`/`saveLB` read/write JSON arrays under `lb_scores` and `lb_times`; `recordRun()` is called on player death. The enemy-kill counter (`#hKills`, bottom-right HUD, `enemyKillCount`) lives right next to this in the file but is deliberately **not** persisted — it's reset to 0 in `startGame()` and incremented in `onEnemyDeath()` whenever `playerKill` is true (same condition that awards score), same as `score` itself.
13. **INTRO ANIMATION** — idle background enemy drift shown before the player clicks to start.
14. **GAME LOOP** (~line 3147) — `app.ticker.add(...)` is the single source of truth for frame order. If you add a new subsystem's per-frame update function, it must be wired in here in the right place (most gameplay updates happen inside the `if (!gameOver && !paused)` block; HUD updates happen outside it so the HUD still reflects state when paused/game over).
15. **MOBILE TOUCH CONTROLS** (end of file) — nipplejs is loaded dynamically (not bundled) only when a touch device is detected, and drives virtual joysticks (`zone-left`/`zone-right`) that feed into the same `aimVector`/movement input the desktop controls use.

## Desktop vs Mobile play modes

This is one codebase with two genuinely different runtime modes, both gated by a single detection check in the MOBILE DETECTION section (`_isTouchDevice`, ~line 370, which sets `isMobileControlsActive = true`). The phase system itself (1–7) runs identically on both — the difference is everything around it:

- **Desktop — debug/dev mode.** World size equals the viewport (`WORLD_W`/`WORLD_H` stay `0`, `WW()`/`WH()` fall back to `app.screen`), so there's no camera scroll (`updateCamera()` no-ops when `!_isTouchDevice`). Controls are mouse + keyboard. The `Z` through `,` debug enemy-spawn keys and the `6`/`7` phase-jump keys live in the global `keydown` handler with no explicit device gate, but are only reachable here in practice since mobile has no physical keyboard. **Powerups never spawn** — `onEnemyDeath()` only calls `spawnPowerup()` when `isMobileControlsActive` is true, so desktop is purely for iterating on enemy behavior/phase pacing without the powerup layer in the way.
- **Mobile — the intended full game.** A fixed 2500×2500 world with dead-zone edge-push camera scrolling; `MS=0.5` and `SPD=0.8` scale down entity/bullet sizes and speeds, and wall count/margins are retuned for the larger map (all set together in the MOBILE DETECTION block). Controls are two nipplejs virtual joysticks (left = movement, right = aim/fire), lazy-loaded from a CDN only when needed. This is the only mode where powerups drop.
- **Shield powerup vs manual shield are different resource models sharing one `shieldActive` flag.** On desktop, holding Space raises a shield that drains a time-charge (`shieldUsedMs`/`SHIELD_MAX_MS`) while held and recharges when released (`SHIELD_COOLDOWN`) — untouched by how many hits it absorbs. On mobile there is no Space key, so the `S` powerup itself raises the shield instantly and it behaves as extra HP (`mobileShieldEnergy`/`mobileShieldMaxEnergy`): it never drains by time, only by absorbing hit damage in `onCollision`, and disappears when that pool hits zero. Stacking `S` pickups both refill and raise the mobile shield's capacity (`SHIELD_BASE_ENERGY * (1 + 0.5 * shieldLevel)` — ×1.5, ×2, ×2.5… per additional pickup, up to 8 levels). Both modes still drive the same visual ring (`drawShield`) and enemy-repelling force field (`physicsStep`), which don't need to know which mode is active.

## Conventions to preserve when editing

- **Comments are in Spanish** throughout the gameplay/physics code; match the existing convention when adding comments in those sections rather than switching to English.
- Tunable numbers belong in the CONSTANTS section, not hardcoded inline further down — this is what lets `1 2 3` (weapon keys) and rebalance passes stay a one-line diff.
- Entities are plain objects pushed into the flat `pool` array; there's no class hierarchy per enemy type — behavior differences are dispatched by `e.variant` (a string like `enemy_heavy`, `enemy_blackhole`) inside shared functions (`buildEnemyGfx`, `enemyAI`, etc.), not via subclassing. Follow this pattern for new enemy types rather than introducing a class-based structure.
- Graphics objects (`e.gfx`, and effect-specific fields like `_ringGfx`) must be explicitly removed from `worldContainer` and `.destroy()`ed when an entity dies (see `purge()`, `startGame()`) — PIXI does not garbage-collect displayed graphics automatically.
- The world is larger than the viewport on mobile (`WORLD_W`/`WORLD_H` vs `app.screen`); `cam` tracks the camera offset and `worldContainer.x/y` is set from it each frame in `updateCamera()`. Don't confuse world coordinates (entity `x`/`y`) with screen coordinates — HUD/DOM overlay elements (lock reticles, death explosion canvas) need `- cam.x` / `- cam.y` conversion.
