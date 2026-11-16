#!/usr/bin/env node
// =====================================================================
// VOIDRIFT — bot de balance (solo desarrollo; no forma parte del juego)
// =====================================================================
// Juega partidas completas en modo MÓVIL emulado (Chromium headless, táctil) con un
// bot que esquiva amenazas, apunta al enemigo más cercano y va a por los powerups, y
// registra telemetría: enemigos vivos, vida, cada powerup (cuándo cae, con cuánta vida
// se recoge, si caduca) y cada golpe recibido con su causa probable.
//
// Uso (desde la raíz del repo):
//   cd tools && npm install && npx playwright install chromium   # solo la primera vez
//   node tools/balance-bot.js [--runs 3] [--max-seconds 480] [--out tools/out]
//
// Al acabar imprime un resumen por partida y la comparación con los objetivos de
// balance (TARGETS abajo), y guarda la telemetría cruda en <out>/runN.json.
//
// Ojo: el bot esquiva con información perfecta; una persona con los pulgares suele
// aguantar menos. Úsalo para comparar builds entre sí, no como medida absoluta.
// El bot depende de nombres globales del juego (spawnPowerup, applyPowerup, startPhase,
// pool, player, keys, aimVector, mouse...): si se renombran, actualiza los hooks.
// =====================================================================
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const args = process.argv.slice(2);
const arg = (name, def) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : def; };
const RUNS = +arg('runs', 3);
const MAX_MS = +arg('max-seconds', 480) * 1000;
const OUT = path.resolve(arg('out', path.join(__dirname, 'out')));
const ROOT = path.resolve(__dirname, '..');

// Objetivos de balance: [descripción, función(resumen agregado) → valor, comparación]
const TARGETS = [
  ['Supervivencia media en fase 7 ≥ 240 s',      a => a.avgPhase7Secs,   v => v >= 240],
  // Fases 1-6: tope ENEMY_MAX_ALIVE (35); en fase 7 el tope crece a propósito hasta 50
  ['Pico de enemigos antes de fase 7 (serpiente = 1) ≤ 35', a => a.maxAlivePre7, v => v <= 35],
  ['Pico de enemigos total (serpiente = 1) ≤ 50',          a => a.maxAlive,     v => v <= 50],
  ['VIDA recogida con vida llena (sin efecto) ≤ 15 %', a => a.hWastedPct, v => v <= 15],
  ['Drops de fase 7 caducados ≤ 15 %',           a => a.p7ExpiredPct,    v => v <= 15],
  ['Tiempo de fase 7 con algún buff ≥ 60 %',     a => a.p7BuffPct,       v => v >= 60],
];

// --- Servidor estático mínimo sobre la raíz del repo ---
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css' };
function startServer() {
  return new Promise(resolve => {
    const srv = http.createServer((req, res) => {
      const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'voiddrift.html';
      const file = path.join(ROOT, rel);
      if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    });
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
}

// --- Código que corre dentro de la página: hooks de telemetría + bot ---
function installBot() {
  const T0 = performance.now();
  const t = () => +((performance.now() - T0) / 1000).toFixed(1);
  const log = window.__log = { samples: [], powerups: [], hits: [], death: null, phases: [] };
  const aliveEnemies = () => pool.filter(e => e.alive && e.type === TYPE.ENEMY).length;

  const _spawnPU = spawnPowerup;
  spawnPowerup = function (...a) {
    const before = powerups.length;
    const r = _spawnPU.apply(this, a);
    const pu = powerups[powerups.length - 1];
    if (powerups.length > before && pu) {
      pu.__id = log.powerups.length;
      log.powerups.push({ t: t(), type: pu.type, phase: currentPhase, hp: player.energy, maxHp: player.maxEnergy,
        dist: Math.round(Math.hypot(player.x - pu.x, player.y - pu.y)), kills: killCount,
        pressure: +(typeof gamePressure === 'number' ? gamePressure : 0).toFixed(2),
        picked: null, hpAtPick: null, maxAtPick: null, expired: false, enemiesAlive: aliveEnemies() });
    }
    return r;
  };
  const _apply = applyPowerup;
  applyPowerup = function (type) {
    let best = null, bd = 1e9;
    for (const pu of powerups) if (pu.type === type && pu.__id !== undefined) { const d = Math.hypot(pu.x - player.x, pu.y - player.y); if (d < bd) { bd = d; best = pu; } }
    if (best) { const r = log.powerups[best.__id]; r.picked = t(); r.hpAtPick = player.energy; r.maxAtPick = player.maxEnergy; r.levels = { S: shieldLevel, M: missileLevel, L: laserLevel, F: weaponSpread }; }
    return _apply.apply(this, arguments);
  };
  const _startPhase = startPhase;
  startPhase = function (n, now) { log.phases.push({ phase: n, t: t() }); return _startPhase.apply(this, arguments); };

  let lastHP = player.energy, lastMax = player.maxEnergy, lastShield = mobileShieldEnergy, lastSample = 0;
  const tracked = new Set();
  function step() {
    if (gameOver || !player || !player.alive) {
      if (!log.death) log.death = { t: t(), phase: currentPhase, kills: enemyKillCount, score, enemiesAlive: aliveEnemies(), hpBefore: lastHP };
      return;
    }
    const now = performance.now(), px = player.x, py = player.y;
    for (const pu of powerups) tracked.add(pu);
    for (const pu of [...tracked]) if (!powerups.includes(pu)) { tracked.delete(pu); const r = log.powerups[pu.__id]; if (r && r.picked === null) r.expired = true; }
    // Daño recibido (vida o escudo) → causa = enemigo o bala enemiga más cercana
    const dHP = lastHP - player.energy, dSh = lastShield - mobileShieldEnergy;
    if ((dHP > 0.01 && player.maxEnergy === lastMax) || dSh > 0.01) {
      let cause = '?', cd = 1e9;
      for (const e of pool) { if (!e.alive || (e.type !== TYPE.ENEMY && !(e.type === TYPE.BULLET && e.isEnemyBullet))) continue; const d = Math.hypot(e.x - px, e.y - py); if (d < cd) { cd = d; cause = e.variant; } }
      log.hits.push({ t: t(), phase: currentPhase, hpLoss: +Math.max(0, dHP).toFixed(2), shieldLoss: +Math.max(0, dSh).toFixed(2), hp: player.energy, cause, enemiesAlive: aliveEnemies() });
    }
    lastHP = player.energy; lastMax = player.maxEnergy; lastShield = mobileShieldEnergy;

    // Movimiento: repulsión de amenazas + esquiva de balas + atracción a powerups
    let fx = 0, fy = 0, nearest = null, nd = 1e9;
    for (const e of pool) {
      if (!e.alive) continue;
      if (e.type === TYPE.ENEMY) {
        const dx = px - e.x, dy = py - e.y, d = Math.hypot(dx, dy) || 1;
        if (d < nd && e.variant !== 'enemy_blackhole') { nd = d; nearest = e; }
        const R = e.variant === 'enemy_blackhole' ? 600 : 220;
        if (d < R) { const w = (e.variant === 'enemy_blackhole' ? 6 : 1) * (R - d) / R; fx += dx / d * w; fy += dy / d * w; }
      } else if (e.type === TYPE.BULLET && e.isEnemyBullet) {
        const dx = px - e.x, dy = py - e.y, d = Math.hypot(dx, dy) || 1;
        if (d < 140) {
          const sp = Math.hypot(e.vx, e.vy) || 1, nx = -e.vy / sp, ny = e.vx / sp;
          const side = (dx * nx + dy * ny) >= 0 ? 1 : -1, w = 1.5 * (140 - d) / 140;
          fx += nx * side * w; fy += ny * side * w;
        }
      }
    }
    const m = 120;
    if (px < m) fx += (m - px) / m; if (px > WW() - m) fx -= (px - (WW() - m)) / m;
    if (py < m) fy += (m - py) / m; if (py > WH() - m) fy -= (py - (WH() - m)) / m;
    let pu = null, pd = 1e9; for (const q of powerups) { const d = Math.hypot(q.x - px, q.y - py); if (d < pd) { pd = d; pu = q; } }
    if (pu && pd < 900) { fx += (pu.x - px) / pd * 0.9; fy += (pu.y - py) / pd * 0.9; }
    if (nearest && nd > 260) { fx += (nearest.x - px) / nd * 0.4; fy += (nearest.y - py) / nd * 0.4; }
    const dz = 0.15;
    keys.KeyA = fx < -dz; keys.KeyD = fx > dz; keys.KeyW = fy < -dz; keys.KeyS = fy > dz;
    // Apuntado con anticipación al enemigo más cercano
    if (nearest) {
      const tt = nd / (BULLET_SPEED.normal || 8);
      const ax = nearest.x + nearest.vx * tt - px, ay = nearest.y + nearest.vy * tt - py, al = Math.hypot(ax, ay) || 1;
      aimVector.x = ax / al; aimVector.y = ay / al; aimVector.active = true; mouse.down = true;
    } else { aimVector.active = false; mouse.down = false; }

    if (now - lastSample >= 1000) {
      lastSample = now;
      const counts = {}; let mass = 0;
      for (const e of pool) if (e.alive && e.type === TYPE.ENEMY) { counts[e.variant] = (counts[e.variant] || 0) + 1; const mm = ENERGY[e.variant]; mass += isFinite(mm) ? mm : 0; }
      log.samples.push({ t: t(), phase: currentPhase, hp: +player.energy.toFixed(1), maxHp: player.maxEnergy, shield: +mobileShieldEnergy.toFixed(1),
        lv: [shieldLevel, missileLevel, laserLevel, weaponSpread], kills: enemyKillCount, score,
        enemies: Object.values(counts).reduce((a, c) => a + c, 0),
        // "Criaturas": cada serpiente cuenta como 1 (no como sus segmentos)
        creatures: Object.entries(counts).reduce((a, [k, c]) => a + (k === 'enemy_serpent' ? 0 : c), 0) + serpents.filter(sp => sp.segs.length > 0).length,
        mass, counts, puField: powerups.length,
        pressure: +(typeof gamePressure === 'number' ? gamePressure : 0).toFixed(2) });
    }
  }
  setInterval(step, 50);
}

async function playRun(browser, baseUrl, id) {
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', e => errors.push(e.message));
  await p.goto(baseUrl + '/voiddrift.html');
  await p.waitForTimeout(1500);
  await p.evaluate(() => document.getElementById('overlay').click());
  await p.waitForTimeout(300);
  await p.evaluate(installBot);
  const t0 = Date.now();
  while (Date.now() - t0 < MAX_MS) {
    await p.waitForTimeout(5000);
    if (await p.evaluate(() => !!window.__log.death)) break;
  }
  const log = await p.evaluate(() => window.__log);
  log.errors = errors;
  fs.writeFileSync(path.join(OUT, `run${id}.json`), JSON.stringify(log));
  await ctx.close();
  return log;
}

function summarize(log) {
  const s7 = log.samples.filter(s => s.phase === 7);
  const pre = log.samples.filter(s => s.phase < 7);
  const pus = log.powerups;
  const hPicked = pus.filter(p => p.type === 'H' && p.picked);
  // "Sin efecto": vida (casi) llena Y vida máxima ya en el tope (si no, sube la vida máxima)
  const hWasted = hPicked.filter(p => p.hpAtPick >= p.maxAtPick * 0.95 && p.maxAtPick >= 20);
  const p7 = pus.filter(p => p.phase === 7);
  const causes = {};
  for (const h of log.hits) causes[h.cause] = +((causes[h.cause] || 0) + h.hpLoss + h.shieldLoss).toFixed(1);
  return {
    died: !!log.death, deathT: log.death ? log.death.t : null, deathPhase: log.death ? log.death.phase : null,
    phase7Secs: s7.length ? s7[s7.length - 1].t - s7[0].t : 0,
    maxAlive: Math.max(0, ...log.samples.map(s => s.creatures ?? s.enemies)),
    maxAlivePre7: Math.max(0, ...pre.map(s => s.creatures ?? s.enemies)),
    dmgPre7: pre.length ? +(pre[0].maxHp - Math.min(...pre.map(s => s.hp))).toFixed(1) : 0,
    kills: log.samples.length ? log.samples[log.samples.length - 1].kills : 0,
    powerups: pus.length, picked: pus.filter(p => p.picked).length, expired: pus.filter(p => p.expired).length,
    byType: pus.reduce((a, p) => (a[p.type] = (a[p.type] || 0) + 1, a), {}),
    hPicked: hPicked.length, hWasted: hWasted.length,
    hRaisedMax: hPicked.filter(p => p.hpAtPick >= p.maxAtPick * 0.95 && p.maxAtPick < 20).length,
    p7Drops: p7.length, p7Expired: p7.filter(p => p.expired).length,
    p7BuffPct: s7.length ? Math.round(100 * s7.filter(s => Math.max(...s.lv) > 0).length / s7.length) : 0,
    maxLevel: Math.max(0, ...log.samples.map(s => Math.max(...s.lv))),
    damageByCause: causes, errors: log.errors.length,
  };
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await startServer();
  const baseUrl = `http://127.0.0.1:${srv.address().port}`;
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  console.log(`Jugando ${RUNS} partida(s) en paralelo (máx. ${MAX_MS / 1000}s cada una)…`);
  const logs = await Promise.all(Array.from({ length: RUNS }, (_, i) => playRun(browser, baseUrl, i + 1)));
  await browser.close();
  srv.close();

  const sums = logs.map(summarize);
  sums.forEach((s, i) => {
    console.log(`\n— Partida ${i + 1}: ${s.died ? `muerte a los ${s.deathT}s (fase ${s.deathPhase})` : 'sobrevive al límite'} · ${s.kills} kills`);
    console.log(`  fase 7: ${s.phase7Secs.toFixed(0)}s · pico enemigos ${s.maxAlive} (antes de F7: ${s.maxAlivePre7}) · daño antes de F7 ${s.dmgPre7}`);
    console.log(`  powerups: ${s.powerups} caídos, ${s.picked} recogidos, ${s.expired} caducados · tipos ${JSON.stringify(s.byType)}`);
    console.log(`  VIDA: ${s.hPicked} recogidas, ${s.hRaisedMax} subieron la vida máx., ${s.hWasted} sin efecto · nivel máx. ${s.maxLevel} · buff en F7 ${s.p7BuffPct}%`);
    console.log(`  daño por causa: ${JSON.stringify(s.damageByCause)}${s.errors ? ` · ¡${s.errors} errores JS!` : ''}`);
  });
  const avg = k => sums.reduce((a, s) => a + s[k], 0) / sums.length;
  const tot = k => sums.reduce((a, s) => a + s[k], 0);
  const agg = {
    avgPhase7Secs: Math.round(avg('phase7Secs')),
    maxAlive: Math.max(...sums.map(s => s.maxAlive)),
    maxAlivePre7: Math.max(...sums.map(s => s.maxAlivePre7)),
    hWastedPct: tot('hPicked') ? Math.round(100 * tot('hWasted') / tot('hPicked')) : 0,
    p7ExpiredPct: tot('p7Drops') ? Math.round(100 * tot('p7Expired') / tot('p7Drops')) : 0,
    p7BuffPct: Math.round(avg('p7BuffPct')),
  };
  console.log('\n=== Objetivos ===');
  for (const [label, get, ok] of TARGETS) {
    const v = get(agg);
    console.log(`  ${ok(v) ? '✓' : '✗'} ${label}: ${v}`);
  }
  console.log(`\nTelemetría cruda en ${OUT}`);
})();
