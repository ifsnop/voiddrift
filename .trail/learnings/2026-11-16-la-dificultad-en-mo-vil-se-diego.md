---
title: La dificultad en móvil se controla con un tope de enemigos y un director de powerups guiado por la presión
author: Diego
date: 2026-11-16
branch: main
cost: { minutes: 21, tokens: 120049 }
id: l-9f89bcdf
scope: repo
status: active
replaces: l-148ed931
src: agent
touches:
  - tools/balance-bot.js
  - voiddrift.html
---

## Decided
Every spawn goes through an enemy cap (35, growing to 50 in phase 7), and powerups are chosen by a pressure-driven director, because measured runs died at a phase 7 wall (80+ enemies) while VIDA dropped at full HP.

## Tried and ruled out
- Freezing level decay with a pressure metric made only of local threats + HP: the bot kept distance with a full shield, pressure stayed ~0.13, levels never decayed and drops snowballed (66 per run, level 7 always). Fixed by adding a crowd term and spacing drops by accumulated levels.
- Constant enemy cap in phase 7: it got easier over time (fewer enemies late than early), because a powered-up player kills faster than waves arrive. The enemy and hitter caps now grow with time in phase 7.

## Watch out
- The blackhole also killed the player instantly through core absorption in physicsStep, separate from ENEMY_DAMAGE; both paths now deal damage instead.
- The bot now survives 10 min; humans won't, so tune on a phone.

In the code:
- voiddrift.html: enemyCap, spawnEnemy(..., overflow), updatePressure, pickPowerupType, powerupInterval, updatePowerupDirector.
- Measure: node tools/balance-bot.js --runs 3 --max-seconds 600
