# TODO — VOIDRIFT

Roadmap vivo para próximas sesiones. Recoge las conclusiones del análisis de jugabilidad/dificultad y las propuestas de enemigos nuevos. Todo lo marcado como **Hecho** ya está en `voiddrift.html`; el resto son propuestas a valorar/priorizar, no compromisos.

**Sonido: aplazado explícitamente.** No es que se haya olvidado — se decidió no tocarlo por ahora. No lo prioricéis en próximas sesiones salvo que se pida explícitamente.

---

## Hecho (contexto para no repetir trabajo)

- Escudo reescrito: en desktop sigue siendo el mecanismo original de carga por tiempo (Space); en móvil el powerup `S` ahora da un escudo tipo "vida extra" (`mobileShieldEnergy`/`mobileShieldMaxEnergy`) que solo baja al absorber impactos, nunca por tiempo, y cada powerup adicional lo rellena y amplía su capacidad (×1.5, ×2, ×2.5…).
- Ritmo de powerups: `POWERUP_MAX_GAP` limita el hueco entre powerups a un máximo de 20 kills, en vez de crecer sin límite.
- Ajustes de dificultad: vida base del jugador 10→14, velocidad de embestida del `enemy_follower` 9→6, tope de masa viva en fase 7 (`PHASE7_MAX_LIVE_MASS = 150`, vía `getTotalEnemyMass()`) para que el spawneo periódico se pause si el campo está demasiado lleno.
- `CLAUDE.md` documenta ahora la diferencia entre modo desktop (debug, sin powerups) y modo móvil (juego completo).

---

## Enemigos nuevos propuestos

Todos pensados para encajar en el patrón existente: se despachan por `e.variant` dentro de funciones compartidas (`buildEnemyGfx`, `enemyAI`, `onEnemyDeath`, `emitEnemyFx`), no por herencia de clases. Ver `CLAUDE.md` → "Conventions to preserve when editing".

1. **Warden (proyector de escudo enemigo)** — Prioridad alta. Enemigo lento/semi-estático que protege a otros enemigos cercanos con un campo que repele/intercepta balas del jugador, igual que hace el escudo del jugador en `physicsStep` (líneas ~2377-2409) pero en sentido contrario. Obliga a priorizar objetivos en vez de disparar sin más al primero que se vea — hoy no existe ningún incentivo táctico de ese tipo.

2. **Mina (hazard estático)** — Prioridad alta, coste de implementación bajo. No se mueve; detona con daño de área al detectar cercanía del jugador o al recibir un impacto. Reutiliza directamente `applyExplosionDamage()`, que ya se usa para el splash de las muertes — no hace falta IA de movimiento nueva.

3. **Enjambre (activar `enemy_basic` como spawn primario)** — Prioridad alta, coste muy bajo. `enemy_basic` ya tiene toda su infraestructura completa (`ENERGY`, `ENEMY_DAMAGE`, `ENEMY_SIZE`, `ENEMY_COLOR`, gráfico por defecto, FX, e incluso aparece hoy como subproducto de la muerte de `enemy_heavy`, línea ~2210) pero nunca se spawnea directamente desde una fase — solo por el debug key `Z` y como parte de la cadena de muertes. Añadirlo como oleada propia (muchos, rápidos, débiles, en grupo) en `PHASE_ADD_ENEMIES` o en `phase7Update` es casi gratis y aporta variedad de amenaza (presión numérica vs. amenaza puntual).

4. **Ladrón (roba powerups, solo tiene sentido en móvil)** — Prioridad media. Al tocar al jugador resta un nivel a un powerup activo aleatorio (`shieldLevel`/`laserLevel`/`missileLevel`/`weaponSpread`) y huye; si se le mata antes de escapar, suelta ese nivel robado como pickup en el suelo (reutilizando `spawnPowerup`). Genera tensión añadida justo en el sistema de progresión de powerups que se acaba de retocar.

5. **Sniper (telegrafiado, rango largo)** — Prioridad media. Se mantiene a la distancia máxima posible (lo opuesto al `hitter`, que dispara a rango medio), telegrafía con una línea de aviso antes de un disparo de alto daño. Introduce una mecánica de lectura-y-esquiva que hoy no existe — todo el daño a distancia actual es reactivo, no telegrafiado.

**Ideas adicionales, menor prioridad:**
- **Simbionte / Splitter genérico** — generalizar el patrón que ya existe hardcodeado (`enemy_heavy` muere → 2×`enemy_basic`; `enemy_boss` muere → 4×`enemy_heavy`, línea ~2205-2216) en un enemigo dedicado a la mitosis, con tope de generaciones para no chocar con `PHASE7_MAX_LIVE_MASS`.
- **Sifón** — orbita agujeros negros (reutilizando la física de órbita mutua entre blackholes ya implementada) y dispara proyectiles teledirigidos; coherente temáticamente con el set-piece del blackhole.

---

## Otras mejoras de jugabilidad (de la sesión de análisis)

- **Progresión entre partidas** — Prioridad alta. Hoy no existe ninguna: `clearPowerups()` resetea todo en cada run y lo único persistente es el leaderboard en `localStorage`. Añadir una moneda ganada por partida (proporcional a `score`) gastable en mejoras permanentes pequeñas (vida base, cadencia de disparo, nivel inicial de un arma) sería el cambio de mayor impacto en retención a medio plazo.
- **Logros/hitos** — Prioridad media. Barato: solo trackear eventos puntuales (sobrevivir X min en fase 7, matar 3 serpientes en una partida) y mostrar un toast. Gancho de recompensa variable clásico.
- **Leaderboard global** — Prioridad media/alta pero requiere backend (salto de alcance). Hoy el leaderboard es 100% local por navegador (`loadLB`/`saveLB`), así que nadie compite realmente contra otros jugadores.
- **Compartir resultado** — Prioridad baja, alternativa barata al leaderboard global sin backend (generar imagen/texto compartible del score).
- **Onboarding** — Prioridad media. No hay tutorial; en móvil (el modo "completo") el primer minuto puede ser confuso. Hints contextuales la primera vez.
- **Micro-recompensas dentro de la partida** — Prioridad baja. Con el tope de masa de fase 7 ya puesto, las runs largas aguantan mejor; se podría añadir un bonus de puntos o buff temporal corto cada X kills, no solo en los powerups, para mantener sensación de progreso constante.
- **Asimetría desktop/móvil** — Nota, no acción por ahora. Desktop nunca recibe powerups (es modo debug por diseño). Si desktop llega a ser una plataforma real de juego y no solo de pruebas, esta asimetría habrá que revisarla.
