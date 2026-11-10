// 행성 착륙 시뮬레이션 — 물리 엔진 (브라우저/Node 공용)
(function (root) {
  'use strict';

  const G_STD = 9.80665;        // G 하중 환산 기준 (m/s²)
  const EARTH_R = 6371e3;       // 지구 반지름 (m)
  const EARTH_G = 9.81;
  const EARTH_RHO = 1.225;      // 지구 해수면 대기 밀도 (kg/m³)
  const SCALE_H = 7200;         // 대기 척도 높이 (m) — 모든 행성에 동일하게 가정
  const START_ALT = 100e3;      // 출발 고도 (m)
  const SIGMA = 5.670e-8, EMISS = 0.85, T_AMB = 250;
  const SG_K = 1.7415e-4;       // Sutton–Graves 정체점 가열 계수
  const V_SAFE = 4;             // 이 속도 이하로 닿으면 충격 피해 없음 (m/s)
  const HEAT_RATE = 10;         // 한계 초과분 1배당 초당 피해 (%)
  const G_RATE = 30;
  const CTRL_DT = 0.2;          // 자동 조종 판단 주기 (s)
  const CHUTE_CD = 1.4, CHUTE_OPEN_T = 3, CHUTE_V = 200, CHUTE_RHO = 0.02, CHUTE_ALT = 6000;

  const PLANETS = {
    earth: { name: '지구', g: 9.81, air: 1.0, radius: 6371e3 },
    moon: { name: '달', g: 1.62, air: 0, radius: 1737e3 },
  };

  // cd: 항력계수, area: 지름 원 대비 정면 면적 비율, ld: 양항비, nose: 크기 대비 앞부분 곡률 반지름
  // qLim: 내열 한계 (W/cm²), gLim: 하중 한계 (G), vCrit: 이 속도 이상으로 닿으면 파괴 (m/s)
  const SHAPES = {
    sphere: { name: '구형', cd: 0.5, area: 1.0, ld: 0, nose: 0.5, qLim: 130, gLim: 35, vCrit: 13,
      desc: '어느 방향으로도 튼튼하지만 양력이 없어 그대로 떨어집니다.' },
    fighter: { name: '전투기형', cd: 0.35, area: 0.3, ld: 1.0, nose: 0.1, qLim: 120, gLim: 10, vCrit: 10,
      desc: '날개의 양력으로 활공합니다. 뾰족한 기수는 열에 약하고, 얕게 들어가면 튕겨 나갈 수 있습니다.' },
    stream: { name: '유선형', cd: 0.12, area: 0.1, ld: 0.15, nose: 0.08, qLim: 170, gLim: 25, vCrit: 8,
      desc: '공기를 가르며 빠르게 내려갑니다. 잘 감속되지 않아 착지 속도가 높습니다.' },
    donut: { name: '도넛형', cd: 1.0, area: 0.75, ld: 0, nose: 0.15, qLim: 110, gLim: 12, vCrit: 16,
      desc: '넓은 고리가 공기를 많이 받고 착지가 안정적이지만, 열과 하중에 약합니다.' },
    cone: { name: '원뿔형', cd: 1.2, area: 1.0, ld: 0.25, nose: 0.6, qLim: 260, gLim: 20, vCrit: 12,
      desc: '넓은 바닥(방열판)을 앞으로 향한 캡슐. 공기저항이 크고 열에 가장 강합니다.' },
  };

  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

  function alienRadius(g) { return EARTH_R * g / EARTH_G; }   // 지구와 같은 밀도의 행성이라고 가정

  function tempC(q) {   // 열유속(W/m²) → 복사 평형 표면 온도(℃)
    return Math.pow(q / (EMISS * SIGMA) + Math.pow(T_AMB, 4), 0.25) - 273.15;
  }

  // p: { g, air(지구 대비 배수), radius, mass, size, shape, speed, angle(도), chute(지름 m), fuel(Δv m/s) }
  function makeConfig(p) {
    const sh = SHAPES[p.shape];
    const frontal = sh.area * Math.PI / 4 * p.size * p.size;
    return {
      g: p.g, rho0: p.air * EARTH_RHO, R: p.radius, H: SCALE_H,
      m: p.mass, size: p.size, shapeKey: p.shape, shape: sh,
      cdA: sh.cd * frontal, ld: sh.ld, rn: sh.nose * p.size,
      v0: p.speed, angle: p.angle,
      chuteD: p.chute, chuteCdA: CHUTE_CD * Math.PI / 4 * p.chute * p.chute,
      fuel0: p.fuel, aT: Math.max(25, 2.5 * p.g),
      vOrbit: Math.sqrt(p.g * p.radius * p.radius / (p.radius + START_ALT)),
      vEscape: Math.sqrt(2 * p.g * p.radius * p.radius / (p.radius + START_ALT)),
    };
  }

  function initState(c) {
    const a = c.angle * Math.PI / 180;
    return {
      x: 0, y: c.R + START_ALT, vx: c.v0 * Math.cos(a), vy: -c.v0 * Math.sin(a),
      t: 0, fuel: c.fuel0, chute: 0, chuteOut: false, ang: 0,
      h: START_ALT, v: c.v0, vr: -c.v0 * Math.sin(a), vt: c.v0 * Math.cos(a),
      rho: c.rho0 * Math.exp(-START_ALT / c.H), G: 0, q: 0, burn: 0,
    };
  }

  // 한 스텝 적분. 항력은 음함수(implicit)로 풀어 큰 낙하산에서도 발산하지 않게 한다.
  function step(s, c, dt, throttle) {
    const r = Math.hypot(s.x, s.y);
    const ux = s.x / r, uy = s.y / r;
    const g = c.g * (c.R / r) * (c.R / r);
    let vx = s.vx - g * ux * dt, vy = s.vy - g * uy * dt;
    const gx = vx, gy = vy;
    let v = Math.hypot(vx, vy);

    // 역추진: 속도 반대 방향
    let burn = 0;
    if (throttle > 0 && s.fuel > 0) {
      burn = Math.min(c.aT * throttle * dt, s.fuel);
      s.fuel -= burn;
      if (v > burn) { const k = 1 - burn / v; vx *= k; vy *= k; }
      else { const rest = burn - v; vx = ux * rest; vy = uy * rest; }
      v = Math.hypot(vx, vy);
    }

    const h = r - c.R;
    const rho = c.rho0 > 0 ? c.rho0 * Math.exp(-Math.max(h, 0) / c.H) : 0;
    const vr0 = vx * ux + vy * uy;

    if (c.chuteCdA > 0 && !s.chuteOut && rho > CHUTE_RHO && v < CHUTE_V && vr0 < 0 && h < CHUTE_ALT) s.chuteOut = true;
    if (s.chuteOut && s.chute < 1) s.chute = Math.min(1, s.chute + dt / CHUTE_OPEN_T);

    const kB = 0.5 * rho * c.cdA / c.m;
    const kC = 0.5 * rho * c.chuteCdA * s.chute * s.chute / c.m;
    const k = kB + kC;
    if (k > 0 && v > 0) {
      const f = 1 / (1 + k * v * dt);
      const dvDrag = v * (1 - f);
      vx *= f; vy *= f;
      const v2 = v * f;
      // 양력: 하강 중일 때만, 속도 벡터를 위쪽으로 회전
      if (c.ld > 0 && !s.chuteOut && vr0 < 0 && v2 > 1) {
        const vt0 = vx * uy - vy * ux;
        let th = Math.min(0.2, c.ld * dvDrag * (kB / k) / v2);
        if (vt0 < 0) th = -th;
        const cs = Math.cos(th), sn = Math.sin(th);
        const nx = vx * cs - vy * sn, ny = vx * sn + vy * cs;
        vx = nx; vy = ny;
      }
    }

    s.G = Math.hypot(vx - gx, vy - gy) / dt / G_STD;
    s.vx = vx; s.vy = vy;
    s.x += vx * dt; s.y += vy * dt;
    const r2 = Math.hypot(s.x, s.y);
    s.h = r2 - c.R;
    s.v = Math.hypot(vx, vy);
    s.vr = (vx * s.x + vy * s.y) / r2;
    s.vt = (vx * s.y - vy * s.x) / r2;
    s.ang += s.vt / r2 * dt;
    s.rho = rho;
    s.q = SG_K * Math.sqrt(rho / c.rn) * s.v * s.v * s.v;
    s.burn = burn / dt;
    s.t += dt;
  }

  // 지금 전력으로 역추진을 시작해도 멈추기 전에 땅에 닿는가? (닿는다면 지금이 점화 시점)
  function needBurn(s, c) {
    if (s.vr >= 0) return false;
    const stop = s.v * s.v / (2 * (c.aT - c.g));
    if (s.h > 1.1 * stop + 100) return false;
    const p = Object.assign({}, s);
    const dt = clamp(s.v / c.aT / 150, 0.05, 0.5);
    const margin = 0.04 * s.h + 3 + s.v * CTRL_DT * 1.2;   // 다음 판단 시점까지 더 내려갈 거리 포함
    for (let i = 0; i < 500; i++) {
      step(p, c, dt, 1);
      if (p.h <= margin) return true;
      if (p.fuel <= 0 || p.v < 2 || p.vr >= 0) return false;
    }
    return false;
  }

  function createSim(cfg) {
    return {
      cfg, s: initState(cfg), hull: 100,
      dmg: { heat: 0, g: 0, impact: 0 },
      max: { temp: tempC(0), q: 0, G: 0, v: cfg.v0, h: START_ALT },
      events: [], flags: {}, log: [], logEvery: 0.5, logNext: 0,
      landingBurn: false, ctrl: 0, throttle: 0, outcome: null, cause: null, vImpact: null,
      hMin: START_ALT,
    };
  }

  function emit(sim, type) {
    if (sim.flags[type]) return;
    sim.flags[type] = true;
    sim.events.push({ t: sim.s.t, type });
  }

  function sample(sim) {
    const s = sim.s;
    sim.log.push({ t: s.t, h: s.h, v: s.v, G: s.G, temp: tempC(s.q) });
    if (sim.log.length > 1600) {            // 긴 비행은 기록 간격을 넓힌다
      sim.log = sim.log.filter((_, i) => i % 2 === 0);
      sim.logEvery *= 2;
    }
  }

  function finish(sim, outcome, cause) {
    sim.outcome = outcome; sim.cause = cause || null;
    sim.throttle = 0;
    sample(sim);
  }

  function advance(sim, dt) {
    if (sim.outcome) return;
    const s = sim.s, c = sim.cfg, sh = c.shape;

    // 자동 착륙 조종
    let throttle = 0;
    if (s.fuel > 0) {
      if (!sim.landingBurn) {
        sim.ctrl -= dt;
        if (sim.ctrl <= 0) {
          sim.ctrl = CTRL_DT;
          if (needBurn(s, c)) { sim.landingBurn = true; emit(sim, 'burn'); }
        }
      }
      if (sim.landingBurn && s.vr < 0) {
        // 목표 속도 곡선을 따라 감속하다가 마지막 1.5 m는 초속 1 m로 내려앉는다
        const vTarget = Math.sqrt(2 * 0.6 * (c.aT - c.g) * Math.max(s.h - 1.5, 0)) + 1;
        throttle = clamp(c.g / c.aT + (s.v - vTarget) / 2, 0, 1);
      }
    } else if (sim.landingBurn) emit(sim, 'fuelOut');
    sim.throttle = throttle;

    const chuteBefore = s.chuteOut;
    step(s, c, dt, throttle);
    if (!chuteBefore && s.chuteOut) emit(sim, 'chute');

    // 피해 누적
    const qW = s.q / 1e4;
    if (qW > sh.qLim * 0.2) emit(sim, 'entry');
    if (qW > sh.qLim) { sim.dmg.heat += HEAT_RATE * (qW / sh.qLim - 1) * dt; emit(sim, 'heatWarn'); }
    if (s.G > sh.gLim) { sim.dmg.g += G_RATE * (s.G / sh.gLim - 1) * dt; emit(sim, 'gWarn'); }
    sim.hull = 100 - sim.dmg.heat - sim.dmg.g;

    if (s.q > sim.max.q) { sim.max.q = s.q; sim.max.temp = tempC(s.q); }
    if (s.G > sim.max.G) sim.max.G = s.G;
    if (s.v > sim.max.v) sim.max.v = s.v;
    if (s.h > sim.max.h) sim.max.h = s.h;

    if (s.h < sim.hMin) sim.hMin = s.h;
    if (s.vr > 0 && sim.hMin < START_ALT - 15e3 && s.h > sim.hMin + 5000) emit(sim, 'skip');

    if (s.t >= sim.logNext) { sample(sim); sim.logNext = s.t + sim.logEvery; }

    if (sim.hull <= 0) {
      sim.hull = 0;
      return finish(sim, sim.dmg.heat >= sim.dmg.g ? 'burn' : 'breakup');
    }

    if (s.h <= 0) {
      s.h = 0;
      sim.vImpact = s.v;
      const frac = (s.v - V_SAFE) / (sh.vCrit - V_SAFE);
      sim.dmg.impact = clamp(frac, 0, 1) * 100;
      if (frac >= 1 || sim.hull - sim.dmg.impact <= 0) {
        sim.dmg.impact = Math.min(sim.dmg.impact, sim.hull);
        sim.hull = 0;
        return finish(sim, 'crash');
      }
      sim.hull -= sim.dmg.impact;
      return finish(sim, sim.hull >= 90 ? 'perfect' : sim.hull >= 50 ? 'success' : 'hard');
    }

    // 우주로 탈출 / 궤도에 머무름
    const r = c.R + s.h;
    const energy = s.v * s.v / 2 - c.g * c.R * c.R / r;
    if (energy >= 0 && s.vr > 0 && s.h > START_ALT * 1.2) return finish(sim, 'escape');
    if (Math.abs(s.ang) >= 2 * Math.PI || s.t > 3 * 3600) return finish(sim, 'orbit');
  }

  function runToEnd(cfg, dt) {   // 화면 없이 끝까지 계산 (테스트용)
    const sim = createSim(cfg);
    while (!sim.outcome) advance(sim, dt || 0.01);
    return sim;
  }

  const api = {
    G_STD, EARTH_R, EARTH_G, EARTH_RHO, SCALE_H, START_ALT, V_SAFE,
    PLANETS, SHAPES, alienRadius, tempC, makeConfig, createSim, advance, runToEnd,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Physics = api;
})(typeof window !== 'undefined' ? window : globalThis);
