# VOIDRIFT

> Survive the gravitational chaos as waves of alien enemies collapse space around you.

A browser-based top-down shooter built with vanilla JavaScript and PixiJS. Seven escalating phases pit you against increasingly dangerous enemy types, culminating in an endless final wave where a living black hole warps the battlefield itself.

---

## Gameplay

Use your ship to destroy enemies before they overwhelm you. Each phase introduces new threats that stay on screen as the game progresses — the battlefield gets harder, never easier.

| Control | Action |
|---|---|
| `Mouse` | Aim |
| `Left click` / `Space` | Shoot |
| `WASD` / Arrow keys | Move |
| `Shift` | Boost |
| `E` | Shield |
| `P` | Pause |
| `,` | Spawn Serpent (debug) |

---

## Enemy Types

| Enemy | Behaviour |
|---|---|
| **Heavy** | Slow, high HP, charges the player |
| **Boss** | Large, tough, fires back |
| **Spawner** | Continuously produces basic enemies |
| **Follower** | Fast, orbits and flanks the player |
| **Hitter** | Ranged — fires aimed projectiles |
| **Blackhole** | Warps gravity, pulls bullets and enemies into its core |
| **Serpent** | 7-segment spring chain; head hunts the player, body follows; fires hitter bullets; immune to blackhole gravity |

---

## Phases

| Phase | What gets added |
|---|---|
| 1 | Heavy enemies |
| 2 | + Boss |
| 3 | + Spawner |
| 4 | + Spawners, Followers |
| 5 | + Hitters |
| 6 | + Blackhole |
| 7 | **Endless** — alternating Spawner and Hitter waves, periodic Blackhole (30 s timeout), Serpents every 10 s (max 5) |

Phases 1–6 end automatically when all enemies are cleared. Phase 7 runs until the player dies.

---

## Features

- **Elastic Serpent enemy** — spring-physics segment chain with head-driven movement and per-segment health
- **Blackhole gravity** — bullets curve in the outer field; damage zone sits at the inner radius before absorption
- **Explosion chain damage** — enemy deaths deal area damage scaled to the enemy's mass
- **Animated score counter** — points increment one-by-one to the target value with floating popups
- **Death explosion** — 5-second particle burst before the game-over screen
- **Live mass counter** — total enemy mass on screen displayed in real time
- **Idle background animation** — enemies drift across the screen before the first click

---

## Tech Stack

- **PixiJS v7** — rendering
- **Vanilla JS** — all game logic (no framework)
- **Single HTML file** — no build step, no dependencies to install

---

## Running Locally

```bash
git clone https://github.com/youruser/voidrift.git
cd voidrift
# Open in browser — no server needed for most browsers
open index.html

# Or serve locally to avoid any CORS issues
npx serve .
```

---

## Project Structure

```
voidrift/
├── index.html   # Entire game — engine, logic, assets, UI
└── README.md
```

---

## License

MIT
