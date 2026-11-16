---
title: "La dificultad en móvil es plana en las fases 1-6 y choca contra un muro en la fase 7, y los powerups llegan cuando no hacen falta"
author: Diego
date: 2026-11-15
branch: main
cost: { minutes: 2, tokens: 30314 }
id: l-148ed931
scope: repo
status: active
src: agent
touches:
  - CLAUDE.md
---

## Decided
Balance was judged from telemetry, not only from reading code, because the problems only show up over time: 3 mobile-emulated runs with a dodging/aiming bot (Playwright, viewport 844x390, hasTouch). All 3 died in phase 7, 99-130 s after it started (total 259-291 s).

## Watch out
- Phases 1-6 are almost free: the bot lost 0.4-4 HP in total. Enemies never leave, so the count climbs 5 → ~25, then phase 7 goes 18 → 78-87 alive within ~60 s. PHASE7_MAX_LIVE_MASS (400) is exceeded (up to 659) because death splits (heavy→2 basic, boss→4 heavy, spawner→3 heavy), spawner births and serpents are not gated by it.
- Enemy bullets from hitters were the main damage source in phase 7 (~14 hitters alive). Blackhole contact is an instant kill (ENEMY_DAMAGE 999); run 3 died at 12.5/14 HP that way.
- Powerups: 56 dropped, 42 picked, 11 expired. 9 of the 16 VIDA (H) pickups happened at full HP. A third of the phase 7 drops (7/21) expired because they were too dangerous to fetch. Levels decay every 20 s (POWERUP_LEVEL_DURATION_MS = 20000; CLAUDE.md says 10 s), so early buffs are gone before phase 7: the bot had any buff active only 16-46% of phase 7.
- A bot is not a human: it dodges with perfect information, so humans likely hit the wall earlier.

In the code:
- Drop rule: onEnemyDeath → killCount ≥ nextPowerupAt (5, 8, 12, 18, 27, then every 9 kills); type from POWERUP_SPAWN_WEIGHTS (H = 2/6) with no look at player state.
- Phase roster: PHASE_ADD_ENEMIES; phase 7: phase7Update and the PHASE7_* constants.
