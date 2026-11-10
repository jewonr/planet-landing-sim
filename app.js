// 행성 착륙 시뮬레이션 — 화면과 조작
(() => {
  'use strict';
  const P = window.Physics;
  const $ = (id) => document.getElementById(id);
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const num = (v, d = 0) => v.toLocaleString('ko-KR', { minimumFractionDigits: d, maximumFractionDigits: d });
  const TAU = Math.PI * 2;
  const DT = 0.01;

  // ───────── 설정 값 ─────────
  const st = { planet: 'earth', g: 9.81, air: 1, shape: 'cone', mass: 3000, size: 4, speed: 7800, angle: 6, chute: 30, fuel: 0 };
  const SHAPE_ORDER = ['sphere', 'fighter', 'stream', 'donut', 'cone'];
  const REST_ROT = { sphere: Math.PI / 2, fighter: 0, stream: -Math.PI / 2, donut: Math.PI / 2, cone: Math.PI / 2 };
  const REST_OFF = { sphere: 0.5, fighter: 0.17, stream: 0.5, donut: 0.24, cone: 0.47 };

  const radius = () => (st.planet === 'alien' ? P.alienRadius(st.g) : P.PLANETS[st.planet].radius);
  const config = () => P.makeConfig(Object.assign({}, st, { radius: radius() }));

  const SLIDERS = {
    g: { out: (v) => v.toFixed(1) + ' m/s²', hint: (v) => `지구의 ${(v / 9.81).toFixed(2)}배` },
    air: {
      out: (v) => v.toFixed(2) + '배',
      hint: (v) => (v === 0 ? '공기 없음 — 공기저항도 마찰열도 없습니다' : `지구 대기 기준 · 밀도 ${(v * P.EARTH_RHO).toFixed(2)} kg/m³`),
    },
    mass: { out: (v) => num(v) + ' kg', hint: (v) => `${(v / 1000).toFixed(1)} t` },
    size: {
      out: (v) => v.toFixed(1) + ' m',
      hint: (v) => `공기를 받는 면적 약 ${num(P.SHAPES[st.shape].area * Math.PI / 4 * v * v, 1)} m²`,
    },
    speed: {
      out: (v) => num(v) + ' m/s',
      hint: (v) => {
        const c = config();
        const tag = v >= c.vEscape ? ' · 탈출 속도 이상' : v >= c.vOrbit * 0.97 ? ' · 궤도 속도 수준' : '';
        return `시속 ${num(v * 3.6)} km${tag}`;
      },
    },
    angle: {
      out: (v) => v + '°',
      hint: (v) => (v === 0 ? '수평으로 진입' : v < 10 ? '얕게 스치듯 진입' : v < 45 ? '비스듬히 진입' : v < 90 ? '가파르게 진입' : '수직 낙하'),
    },
    chute: {
      out: (v) => (v ? v + ' m' : '없음'),
      hint: (v) => (!v ? '낙하산 없이 내려갑니다' : st.air === 0 ? '공기가 없으면 펴지지 않습니다' : '고도 6 km 아래에서 자동으로 펴집니다'),
    },
    fuel: {
      out: (v) => (v ? num(v) + ' m/s' : '없음'),
      hint: (v) => (v ? `초속 ${num(v)} m만큼 감속할 수 있는 양` : '역추진 엔진 없이 내려갑니다'),
    },
  };

  // ───────── 색 ─────────
  const C = (c, a = 1, dl = 0) => `hsla(${c[0]},${c[1]}%,${clamp(c[2] + dl, 0, 100)}%,${a})`;
  function palette() {
    if (st.planet === 'earth') return { kind: 'earth', sky: [218, 85, 52], horizon: [190, 95, 76], base: [150, 46, 36], patch: [212, 74, 46], mount: [165, 40, 20] };
    if (st.planet === 'moon') return { kind: 'moon', sky: null, horizon: [250, 20, 80], base: [250, 9, 60], patch: [250, 12, 44], mount: [250, 14, 30] };
    const hue = (300 + st.g * 11 + st.air * 47) % 360;
    return { kind: 'alien', sky: [hue + 160, 72, 48], horizon: [hue + 205, 92, 72], base: [hue, 58, 46], patch: [hue + 38, 66, 30], mount: [hue + 18, 48, 20] };
  }
  let pal = palette();

  // ───────── 조작부 ─────────
  function refreshControls() {
    for (const key of Object.keys(SLIDERS)) {
      const el = $('s-' + key), v = st[key];
      el.value = v;
      el.style.setProperty('--fill', ((v - el.min) / (el.max - el.min)) * 100 + '%');
      $('o-' + key).textContent = SLIDERS[key].out(v);
      $('h-' + key).textContent = SLIDERS[key].hint(v);
    }
    document.querySelectorAll('[data-planet]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.planet === st.planet));
    document.querySelectorAll('.shape').forEach((b) => b.setAttribute('aria-pressed', b.dataset.shape === st.shape));
    pal = palette();
    const c = config();
    $('planetFacts').innerHTML = `반지름 <b>${num(c.R / 1000)} km</b> · 궤도 속도 <b>${(c.vOrbit / 1000).toFixed(1)} km/s</b> · 탈출 속도 <b>${(c.vEscape / 1000).toFixed(1)} km/s</b>`;
    const orb = $('orb');
    orb.style.background = `radial-gradient(circle at 32% 30%, ${C(pal.base, 1, 26)}, ${C(pal.base)} 45%, ${C(pal.patch, 1, -8)} 100%)`;
    orb.style.boxShadow = `0 0 0 3px rgba(255,255,255,.06), 0 0 ${6 + Math.min(st.air, 3) * 10}px ${Math.min(st.air, 3) * 3}px ${C(pal.horizon, st.air > 0 ? 0.6 : 0)}`;
    const sh = P.SHAPES[st.shape];
    $('shapeDesc').textContent = sh.desc;
    const rows = [['공기저항', sh.cd * sh.area / 1.2], ['내열성', sh.qLim / 260], ['튼튼함', sh.gLim / 35], ['착지 안정', sh.vCrit / 16], ['양력', sh.ld]];
    $('shapeStats').innerHTML = rows.map(([n, v]) => `<dt>${n}</dt><dd><i style="width:${clamp(v, 0.03, 1) * 100}%"></i></dd>`).join('');
  }

  function onChange() {
    if (sim && sim.outcome) resetIdle();
    refreshControls();
  }

  function matchPreset() {
    for (const [key, p] of Object.entries(P.PLANETS)) if (Math.abs(st.g - p.g) < 0.051 && Math.abs(st.air - p.air) < 0.001) return key;
    return 'alien';
  }

  for (const key of Object.keys(SLIDERS)) {
    $('s-' + key).addEventListener('input', (e) => {
      st[key] = parseFloat(e.target.value);
      if (key === 'g' || key === 'air') st.planet = matchPreset();
      onChange();
    });
  }
  document.querySelectorAll('[data-planet]').forEach((b) => b.addEventListener('click', () => {
    st.planet = b.dataset.planet;
    const p = P.PLANETS[st.planet];
    if (p) { st.g = p.g; st.air = p.air; }
    onChange();
  }));
  $('randomPlanet').addEventListener('click', () => {
    st.planet = 'alien';
    st.g = Math.round((1 + Math.pow(Math.random(), 1.4) * 29) * 10) / 10;
    st.air = Math.random() < 0.15 ? 0 : Math.round(Math.pow(Math.random(), 1.6) * 100) / 20;
    onChange();
  });

  // ───────── 우주선 그리기 (앞쪽이 +x, 길이 1) ─────────
  function drawShip(g, key) {
    g.lineJoin = 'round';
    g.lineWidth = 0.025;
    g.strokeStyle = '#1a0b2e';
    let gr;
    if (key === 'sphere') {
      gr = g.createRadialGradient(-0.15, -0.18, 0.02, 0, 0, 0.5);
      gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.5, '#d4d7ea'); gr.addColorStop(1, '#6f7296');
      g.beginPath(); g.arc(0, 0, 0.48, 0, TAU); g.fillStyle = gr; g.fill();
      g.save(); g.clip();
      g.fillStyle = '#ff7a1a'; g.fillRect(-0.5, -0.07, 1, 0.16);
      g.fillStyle = '#2b4bd6'; g.fillRect(-0.5, 0.09, 1, 0.05);
      g.restore(); g.stroke();
      g.beginPath(); g.arc(0.14, -0.22, 0.1, 0, TAU); g.fillStyle = '#19e6c8'; g.fill(); g.stroke();
    } else if (key === 'cone') {
      g.beginPath(); g.moveTo(-0.5, 0); g.lineTo(0.3, -0.48); g.quadraticCurveTo(0.52, 0, 0.3, 0.48); g.closePath();
      gr = g.createLinearGradient(0, -0.5, 0, 0.5);
      gr.addColorStop(0, '#fff6e0'); gr.addColorStop(0.55, '#d9d2c4'); gr.addColorStop(1, '#8d8598');
      g.fillStyle = gr; g.fill();
      g.save(); g.clip();
      g.fillStyle = '#ff7a1a'; g.fillRect(-0.02, -0.5, 0.11, 1);
      g.fillStyle = '#2b4bd6'; g.fillRect(0.11, -0.5, 0.04, 1);
      g.restore(); g.stroke();
      g.beginPath(); g.moveTo(0.3, -0.48); g.quadraticCurveTo(0.52, 0, 0.3, 0.48); g.quadraticCurveTo(0.38, 0, 0.3, -0.48);
      g.fillStyle = '#5a2a12'; g.fill(); g.stroke();
      g.beginPath(); g.arc(-0.2, 0, 0.07, 0, TAU); g.fillStyle = '#19e6c8'; g.fill(); g.stroke();
    } else if (key === 'stream') {
      g.fillStyle = '#2b4bd6';
      for (const s of [-1, 1]) {
        g.beginPath(); g.moveTo(-0.2, 0.11 * s); g.lineTo(-0.5, 0.3 * s); g.lineTo(-0.44, 0.08 * s); g.closePath(); g.fill(); g.stroke();
      }
      g.fillStyle = '#241038'; g.fillRect(-0.5, -0.07, 0.1, 0.14);
      g.beginPath(); g.moveTo(0.5, 0); g.bezierCurveTo(0.3, -0.17, -0.1, -0.17, -0.42, -0.11); g.lineTo(-0.42, 0.11);
      g.bezierCurveTo(-0.1, 0.17, 0.3, 0.17, 0.5, 0); g.closePath();
      gr = g.createLinearGradient(0, -0.17, 0, 0.17);
      gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.5, '#d4d7ea'); gr.addColorStop(1, '#6f7296');
      g.fillStyle = gr; g.fill();
      g.save(); g.clip();
      g.fillStyle = '#ff7a1a'; g.fillRect(0.3, -0.2, 0.3, 0.4);
      g.fillStyle = '#ff2a7f'; g.fillRect(-0.3, -0.2, 0.05, 0.4);
      g.restore(); g.stroke();
      g.beginPath(); g.arc(0.12, 0, 0.055, 0, TAU); g.fillStyle = '#19e6c8'; g.fill(); g.stroke();
    } else if (key === 'fighter') {
      g.fillStyle = '#241038'; g.fillRect(-0.55, -0.05, 0.08, 0.1);
      g.beginPath(); g.moveTo(-0.26, -0.08); g.lineTo(-0.47, -0.33); g.lineTo(-0.52, -0.3); g.lineTo(-0.42, -0.06); g.closePath();
      g.fillStyle = '#2b4bd6'; g.fill(); g.stroke();
      g.beginPath(); g.moveTo(0.5, 0.02); g.lineTo(0.2, -0.07); g.lineTo(-0.1, -0.1); g.lineTo(-0.44, -0.07); g.lineTo(-0.5, 0);
      g.lineTo(-0.42, 0.09); g.lineTo(0.12, 0.1); g.closePath();
      gr = g.createLinearGradient(0, -0.1, 0, 0.1);
      gr.addColorStop(0, '#ffb057'); gr.addColorStop(0.5, '#ff7a1a'); gr.addColorStop(1, '#b3410a');
      g.fillStyle = gr; g.fill(); g.stroke();
      g.beginPath(); g.moveTo(0.22, -0.065); g.quadraticCurveTo(0.08, -0.21, -0.06, -0.1); g.closePath();
      g.fillStyle = '#19e6c8'; g.fill(); g.stroke();
      g.beginPath(); g.moveTo(0.08, 0.02); g.lineTo(-0.3, 0.08); g.lineTo(-0.4, 0.17); g.lineTo(-0.1, 0.09); g.closePath();
      g.fillStyle = '#2b4bd6'; g.fill(); g.stroke();
      g.beginPath(); g.moveTo(0.3, -0.005); g.lineTo(-0.4, -0.02); g.strokeStyle = '#ffe9c7'; g.stroke(); g.strokeStyle = '#1a0b2e';
    } else if (key === 'donut') {
      g.beginPath(); g.ellipse(0, 0, 0.24, 0.49, 0, 0, TAU); g.ellipse(0.02, 0, 0.09, 0.24, 0, 0, TAU);
      gr = g.createLinearGradient(-0.24, 0, 0.24, 0);
      gr.addColorStop(0, '#8a1f5a'); gr.addColorStop(0.45, '#ff2a7f'); gr.addColorStop(1, '#ffb057');
      g.fillStyle = gr; g.fill('evenodd');
      g.beginPath(); g.ellipse(0, 0, 0.24, 0.49, 0, 0, TAU); g.stroke();
      g.beginPath(); g.ellipse(0.02, 0, 0.09, 0.24, 0, 0, TAU); g.stroke();
      g.fillStyle = '#19e6c8';
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU + 0.4;
        g.beginPath(); g.arc(0.03 + Math.cos(a) * 0.16, Math.sin(a) * 0.36, 0.025, 0, TAU); g.fill();
      }
    }
  }

  // 형태 선택 버튼
  const shapesEl = $('shapes');
  for (const key of SHAPE_ORDER) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'shape'; b.dataset.shape = key;
    const cv = document.createElement('canvas');
    cv.width = 104; cv.height = 88;
    const g = cv.getContext('2d');
    g.translate(52, 44); g.rotate(key === 'fighter' ? -0.15 : REST_ROT[key]); g.scale(72, 72);
    drawShip(g, key);
    b.append(cv, document.createTextNode(P.SHAPES[key].name));
    b.addEventListener('click', () => { st.shape = key; onChange(); });
    shapesEl.append(b);
  }

  // ───────── 시뮬레이션 상태 ─────────
  let sim = null, cfg = null, running = false, paused = false;
  let warpMode = 'auto', warp = 1, acc = 0, endAt = 0, resultTimer = 0;

  const MESSAGES = {
    entry: ['대기권 진입 — 선체가 달아오릅니다', false],
    heatWarn: ['경고! 내열 한계 초과', true],
    gWarn: ['경고! 하중 한계 초과', true],
    chute: ['낙하산 전개!', false],
    burn: ['역추진 엔진 점화!', false],
    fuelOut: ['연료가 바닥났습니다', true],
    skip: ['대기에 튕겨 다시 올라갑니다', true],
  };
  function say(type) {
    const m = MESSAGES[type];
    if (!m) return;
    const p = document.createElement('p');
    p.textContent = m[0];
    if (m[1]) p.className = 'bad';
    const t = $('ticker');
    t.append(p);
    while (t.children.length > 2) t.firstChild.remove();
    p.addEventListener('animationend', () => p.remove());
  }

  function setButtons() {
    const live = running && sim && !sim.outcome;
    $('launch').disabled = live;
    $('launch').textContent = sim && sim.outcome ? '다시 착륙' : '착륙 시작';
    $('pause').disabled = !live;
    $('pause').textContent = paused ? '계속' : '일시정지';
    $('abort').disabled = !sim;
    $('controls').classList.toggle('locked', live);
    $('cassette').classList.toggle('playing', live && !paused);
    document.querySelectorAll('[data-warp]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.warp === warpMode));
  }

  function start() {
    clearTimeout(resultTimer);
    cfg = config();
    sim = P.createSim(cfg);
    running = true; paused = false; warp = 1; acc = 0; endAt = 0;
    parts.length = 0; fx.flash = 0; fx.lb = 0; fx.hideShip = false; fx.landed = false;
    $('result').hidden = true;
    $('ticker').textContent = '';
    setButtons();
    if (window.innerWidth < 1020) $('stage').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function resetIdle() {
    clearTimeout(resultTimer);
    sim = null; cfg = null; running = false; paused = false;
    parts.length = 0; fx.flash = 0; fx.lb = 0; fx.hideShip = false; fx.landed = false;
    $('result').hidden = true;
    $('ticker').textContent = '';
    setButtons();
  }

  $('launch').addEventListener('click', start);
  $('pause').addEventListener('click', () => { paused = !paused; setButtons(); });
  $('abort').addEventListener('click', resetIdle);
  $('again').addEventListener('click', () => {
    resetIdle();
    if (window.innerWidth < 1020) $('controls').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  document.querySelectorAll('[data-warp]').forEach((b) => b.addEventListener('click', () => { warpMode = b.dataset.warp; setButtons(); }));

  function updateWarp(dtR) {
    if (warpMode !== 'auto') { warp = parseFloat(warpMode); return; }
    const s = sim.s;
    let target = s.vr < -0.5 ? clamp(s.h / -s.vr / 4, 1, 300) : 300;
    if (s.q / 1e4 / cfg.shape.qLim > 0.15 || s.G > 2) target = Math.min(target, 25);
    if (s.chuteOut && s.chute < 1) target = Math.min(target, 3);
    warp += (target - warp) * Math.min(1, dtR * 3);
  }

  // ───────── 결과 ─────────
  const VERDICT = {
    perfect: ['MISSION COMPLETE', '완벽한 착륙!', '선체에 거의 흠집 없이 사뿐히 내려앉았습니다.'],
    success: ['MISSION COMPLETE', '착륙 성공', '피해를 입었지만 무사히 착륙했습니다.'],
    hard: ['BARELY MADE IT', '간신히 착륙', '선체가 크게 부서졌지만 가까스로 버텼습니다.'],
    crash: ['MISSION FAILED', '추락', ''],
    burn: ['MISSION FAILED', '불타 버렸습니다', '표면 온도가 내열 한계를 넘어 선체가 녹아내렸습니다.'],
    breakup: ['MISSION FAILED', '공중 분해', '급격한 감속 하중을 견디지 못하고 부서졌습니다.'],
    escape: ['LOST IN SPACE', '우주로 날아갔습니다', '행성의 중력이 붙잡기엔 너무 빨랐습니다.'],
    orbit: ['STUCK IN ORBIT', '궤도에 갇혔습니다', '행성 주위를 돌기만 하고 내려오지 못했습니다.'],
  };

  function tipFor() {
    const o = sim.outcome, f = sim.flags, d = sim.dmg;
    const vE = (cfg.vEscape / 1000).toFixed(1), vO = (cfg.vOrbit / 1000).toFixed(1);
    if (o === 'perfect') return '다른 행성이나 다른 형태로도 완벽한 착륙에 도전해 보세요.';
    if (o === 'burn') return '진입 각도를 얕게, 초기 속도를 낮게 하거나 열에 강한 원뿔형을 써 보세요. 크기를 키우면 앞부분이 뭉툭해져 덜 뜨거워집니다.';
    if (o === 'breakup') return '진입 각도가 가파를수록 짧은 시간에 급하게 감속합니다. 각도를 얕게 하거나 속도를 줄여 보세요.';
    if (o === 'escape') return `초기 속도를 탈출 속도(${vE} km/s)보다 낮추거나, 진입 각도를 더 크게 해 보세요.`;
    if (o === 'orbit') return `진입 각도를 더 크게 하거나 초기 속도를 궤도 속도(${vO} km/s)보다 낮춰 보세요.`;
    if (o === 'crash') {
      if (f.fuelOut) return '역추진 연료가 모자랐습니다. 연료를 늘리거나 초기 속도를 줄여 보세요.';
      if (cfg.rho0 === 0) return '공기가 없는 곳에서는 낙하산이 펴지지 않습니다. 역추진 연료를 실어 보세요.';
      if (cfg.chuteD > 0 && !f.chute) return '낙하산이 펴질 만큼 느려지지 못했습니다(초속 200 m 아래 필요). 더 넓적한 형태나 큰 크기로 공기저항을 키워 보세요.';
      return '착지 속도가 너무 빠릅니다. 낙하산을 키우거나, 역추진 연료를 싣거나, 우주선을 가볍게 해 보세요.';
    }
    if (d.impact >= d.heat && d.impact >= d.g) return '착지 속도를 초속 4 m 아래로 줄이면 충돌 피해가 없습니다. 낙하산을 키우거나 역추진 연료를 조금 실어 보세요.';
    if (d.heat >= d.g) return '열 피해가 가장 컸습니다. 진입 각도를 얕게 하거나 속도를 낮춰 보세요.';
    return '하중 피해가 가장 컸습니다. 진입 각도를 얕게 하면 천천히 감속합니다.';
  }

  const clock = (t) => {
    const s = Math.floor(t), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
    const mm = String(m).padStart(2, '0'), ss = String(s % 60).padStart(2, '0');
    return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
  };

  function showResult() {
    const o = sim.outcome, v = VERDICT[o], ok = o === 'perfect' || o === 'success' || o === 'hard';
    const el = $('result');
    el.classList.toggle('fail', !ok);
    $('resKicker').textContent = v[0];
    $('resTitle').textContent = v[1];
    let text = v[2];
    if (o === 'crash') {
      text = sim.vImpact >= cfg.shape.vCrit
        ? `초속 ${num(sim.vImpact, sim.vImpact < 100 ? 1 : 0)} m로 지면에 충돌했습니다. (${cfg.shape.name}의 한계: 초속 ${cfg.shape.vCrit} m)`
        : '이미 약해진 선체가 착지 충격을 버티지 못했습니다.';
    }
    if (o === 'escape' && sim.flags.skip) text = '대기에 튕겨 우주로 날아가 버렸습니다.';
    $('resText').textContent = text;
    const cells = [
      ['착지 속도', sim.vImpact == null ? '—' : num(sim.vImpact, sim.vImpact < 100 ? 1 : 0) + ' m/s'],
      ['최고 표면 온도', num(sim.max.temp) + ' ℃'],
      ['최대 하중', sim.max.G.toFixed(1) + ' G'],
      ['비행 시간', clock(sim.s.t)],
      ['이동 거리', num(Math.abs(sim.s.ang) * cfg.R / 1000) + ' km'],
      ['남은 내구도', Math.round(sim.hull) + ' %'],
    ];
    $('resGrid').innerHTML = cells.map(([k, x]) => `<div><dt>${k}</dt><dd>${x}</dd></div>`).join('');
    const rows = [['열 피해', sim.dmg.heat, 'var(--magenta)'], ['하중 피해', sim.dmg.g, 'var(--yellow)'], ['충돌 피해', sim.dmg.impact, 'var(--orange)']];
    $('resDmg').innerHTML = rows.map(([k, x, col]) =>
      `<div class="rowd"><span>${k}</span><span class="track"><i style="width:${clamp(x, 0, 100)}%;background:${col}"></i></span><b>${Math.round(clamp(x, 0, 100))}%</b></div>`).join('');
    $('resTip').textContent = tipFor();
    el.hidden = false;
  }

  function onEnd(now) {
    running = false; endAt = now;
    const o = sim.outcome;
    const W = cw, H = ch, sx = W / 2, sy = H * 0.42, px = shipPx();
    if (o === 'crash') { fx.hideShip = true; explode(sx, sy + px * 0.3, 90, true); }
    else if (o === 'burn' || o === 'breakup') { fx.hideShip = true; explode(sx, sy, 70, false); }
    else if (o !== 'escape' && o !== 'orbit') {
      fx.landed = true;
      for (let i = 0; i < 34; i++) {
        const dir = Math.random() < 0.5 ? -1 : 1;
        spawn(sx + dir * px * 0.3, sy + px * REST_OFF[st.shape], dir * (40 + Math.random() * 160), -Math.random() * 30, 0.8 + Math.random() * 0.9, 6 + Math.random() * 12, C(pal.base, 0.5, 20), { grow: 1.6 });
      }
    }
    setButtons();
    resultTimer = setTimeout(showResult, o === 'escape' || o === 'orbit' ? 900 : 1900);
  }

  // ───────── 입자 효과 ─────────
  const parts = [];
  const fx = { flash: 0, lb: 0, rot: 0, va: 0, hideShip: false, landed: false };
  function spawn(x, y, vx, vy, life, size, color, o) {
    if (parts.length > 500) return;
    parts.push(Object.assign({ x, y, vx, vy, life, max: life, size, color, grow: 0, grav: 0, glow: false, line: 0 }, o));
  }
  function explode(x, y, n, onGround) {
    fx.flash = 1;
    const cols = ['#fff3b0', '#ffc93c', '#ff7a1a', '#ff2a7f'];
    for (let i = 0; i < n; i++) {
      const a = onGround ? -Math.random() * Math.PI : Math.random() * TAU, sp = 60 + Math.random() * 420;
      spawn(x, y, Math.cos(a) * sp, Math.sin(a) * sp, 0.5 + Math.random() * 1.1, 5 + Math.random() * 14, cols[i % 4], { glow: true, grav: 120 });
    }
    for (let i = 0; i < 26; i++) {
      const a = onGround ? -Math.random() * Math.PI : Math.random() * TAU, sp = 80 + Math.random() * 300;
      spawn(x, y, Math.cos(a) * sp, Math.sin(a) * sp, 1.2 + Math.random() * 1.6, 3 + Math.random() * 5, '#2b1a3f', { grav: 420 });
    }
    for (let i = 0; i < 18; i++) {
      spawn(x + (Math.random() - 0.5) * 40, y, (Math.random() - 0.5) * 60, -20 - Math.random() * 60, 1.6 + Math.random() * 1.8, 14 + Math.random() * 20, 'rgba(60,40,80,.5)', { grow: 1.2 });
    }
  }

  // ───────── 캔버스 ─────────
  const scene = $('scene'), ctx = scene.getContext('2d');
  const chart = $('chart'), cctx = chart.getContext('2d');
  let cw = 800, ch = 500, dpr = 1, space = null;
  const twinkles = [];

  function rng(seed) { let a = seed; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  const noise = (x) => { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return hash(i) * (1 - u) + hash(i + 1) * u; };

  function buildSpace() {
    space = document.createElement('canvas');
    space.width = Math.round(cw * dpr); space.height = Math.round(ch * dpr);
    const g = space.getContext('2d');
    g.scale(dpr, dpr);
    const W = cw, H = ch, r = rng(7);
    let gr = g.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, '#0a031c'); gr.addColorStop(0.55, '#1d0b3a'); gr.addColorStop(1, '#3a1466');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = 'lighter';
    const blobs = [[0.76, 0.24, 0.5, '255,42,127', 0.3], [0.18, 0.3, 0.42, '25,230,200', 0.17], [0.52, 0.78, 0.55, '255,122,26', 0.18], [0.95, 0.85, 0.36, '79,125,255', 0.2], [0.35, 0.05, 0.3, '160,60,255', 0.2]];
    for (const [x, y, rad, col, a] of blobs) {
      gr = g.createRadialGradient(x * W, y * H, 0, x * W, y * H, rad * W);
      gr.addColorStop(0, `rgba(${col},${a})`); gr.addColorStop(1, `rgba(${col},0)`);
      g.fillStyle = gr; g.fillRect(0, 0, W, H);
    }
    for (let i = 0; i < 260; i++) {
      const s = 0.3 + r() * r() * 1.5;
      g.fillStyle = `rgba(255,${220 + Math.floor(r() * 35)},${200 + Math.floor(r() * 55)},${0.3 + r() * 0.6})`;
      g.beginPath(); g.arc(r() * W, r() * H, s, 0, TAU); g.fill();
    }
    g.globalCompositeOperation = 'source-over';
    // 고리 행성과 작은 위성
    const px = W * 0.85, py = H * 0.2, pr = W * 0.05;
    const ring = (front) => {
      g.save(); g.translate(px, py); g.rotate(-0.38); g.scale(1, 0.3);
      g.lineWidth = pr * 0.26; g.strokeStyle = 'rgba(255,233,199,.75)';
      g.beginPath(); g.arc(0, 0, pr * 1.75, front ? 0 : Math.PI, front ? Math.PI : TAU); g.stroke();
      g.lineWidth = pr * 0.1; g.strokeStyle = 'rgba(255,122,26,.8)';
      g.beginPath(); g.arc(0, 0, pr * 2.1, front ? 0 : Math.PI, front ? Math.PI : TAU); g.stroke();
      g.restore();
    };
    ring(false);
    gr = g.createRadialGradient(px - pr * 0.4, py - pr * 0.4, pr * 0.1, px, py, pr);
    gr.addColorStop(0, '#ffd79a'); gr.addColorStop(0.5, '#ff7a1a'); gr.addColorStop(1, '#8a1f5a');
    g.fillStyle = gr; g.beginPath(); g.arc(px, py, pr, 0, TAU); g.fill();
    ring(true);
    gr = g.createRadialGradient(W * 0.115, H * 0.15, 1, W * 0.12, H * 0.16, W * 0.018);
    gr.addColorStop(0, '#c9fff5'); gr.addColorStop(1, '#0c7f86');
    g.fillStyle = gr; g.beginPath(); g.arc(W * 0.12, H * 0.16, W * 0.018, 0, TAU); g.fill();
    twinkles.length = 0;
    for (let i = 0; i < 34; i++) twinkles.push({ x: r() * W, y: r() * H * 0.8, p: r() * TAU, s: 0.8 + r() * 1.4 });
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const r = scene.getBoundingClientRect();
    cw = Math.max(200, r.width); ch = Math.max(150, r.height);
    scene.width = Math.round(cw * dpr); scene.height = Math.round(ch * dpr);
    const c = chart.getBoundingClientRect();
    chart.width = Math.round(Math.max(100, c.width) * dpr); chart.height = Math.round(Math.max(60, c.height) * dpr);
    buildSpace();
  }
  new ResizeObserver(resize).observe($('screen'));

  const shipPx = () => (36 + (cfg ? cfg.size : st.size) * 2.6) * clamp(cw / 720, 0.75, 1.2);

  function view() {
    if (sim) {
      const s = sim.s;
      return { h: s.h, v: s.v, vr: s.vr, vt: s.vt, down: s.ang * cfg.R, temp: P.tempC(s.q), qRatio: s.q / 1e4 / cfg.shape.qLim,
        G: s.G, chute: s.chute, throttle: sim.throttle, hull: sim.hull, dens: s.rho / P.EARTH_RHO, R: cfg.R, shape: cfg.shapeKey };
    }
    const a = st.angle * Math.PI / 180;
    return { h: P.START_ALT, v: st.speed, vr: -st.speed * Math.sin(a), vt: st.speed * Math.cos(a), down: 0, temp: P.tempC(0), qRatio: 0,
      G: 0, chute: 0, throttle: 0, hull: 100, dens: st.air * Math.exp(-P.START_ALT / P.SCALE_H), R: radius(), shape: st.shape };
  }

  const aLerp = (a, b, t) => a + ((((b - a + Math.PI) % TAU) + TAU) % TAU - Math.PI) * t;

  function drawNearObject(g, kind, i, x, y, z) {
    const r1 = hash(i * 3.1 + 5), r2 = hash(i * 7.7 + 11);
    if (r1 > 0.62) return;
    const s = (5 + r2 * 11) * z;
    if (kind === 'earth') {
      if (r2 < 0.7) {
        g.fillStyle = '#3b2412'; g.fillRect(x - s * 0.06, y - s * 0.3, s * 0.12, s * 0.3);
        g.fillStyle = r1 < 0.3 ? '#0f6b4a' : '#12855a';
        for (let k = 0; k < 3; k++) { g.beginPath(); g.moveTo(x - s * (0.42 - k * 0.09), y - s * (0.25 + k * 0.28)); g.lineTo(x, y - s * (0.75 + k * 0.28)); g.lineTo(x + s * (0.42 - k * 0.09), y - s * (0.25 + k * 0.28)); g.fill(); }
      } else { g.fillStyle = '#56606e'; g.beginPath(); g.ellipse(x, y, s * 0.4, s * 0.22, 0, Math.PI, TAU); g.fill(); }
    } else if (kind === 'moon') {
      if (r2 < 0.5) { g.fillStyle = '#4a4860'; g.beginPath(); g.moveTo(x - s * 0.35, y); g.lineTo(x - s * 0.2, y - s * 0.3); g.lineTo(x + s * 0.15, y - s * 0.36); g.lineTo(x + s * 0.38, y); g.fill(); }
      else { g.strokeStyle = 'rgba(40,38,60,.7)'; g.lineWidth = Math.max(1, z * 1.2); g.beginPath(); g.ellipse(x, y + 5 * z, s * 0.8, s * 0.16, 0, 0, TAU); g.stroke(); }
    } else {
      if (r2 < 0.55) {
        g.fillStyle = C(pal.horizon, 0.9, -8); g.beginPath(); g.moveTo(x - s * 0.18, y); g.lineTo(x + s * 0.05, y - s * 1.3); g.lineTo(x + s * 0.24, y); g.fill();
        g.fillStyle = C(pal.horizon, 0.9, 12); g.beginPath(); g.moveTo(x - s * 0.18, y); g.lineTo(x + s * 0.05, y - s * 1.3); g.lineTo(x, y); g.fill();
      } else {
        g.strokeStyle = C(pal.mount, 1, 10); g.lineWidth = Math.max(1, s * 0.07); g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + s * 0.2, y - s * 0.4, x, y - s * 0.7); g.stroke();
        g.fillStyle = '#ffc93c'; g.beginPath(); g.arc(x, y - s * 0.75, s * 0.2, 0, TAU); g.fill();
      }
    }
  }

  function render(now, dtR) {
    const V = view(), W = cw, H = ch, g = ctx;
    const live = running && !paused && sim && !sim.outcome;
    const px = shipPx(), sx = W / 2, sy = H * 0.42;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);

    const shake = live ? clamp(V.G / 14, 0, 1) * 3 + clamp(V.qRatio, 0, 1.5) * 1.6 : fx.flash * 7;
    g.save();
    if (shake > 0.2) g.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);

    // 우주
    if (space) g.drawImage(space, 0, 0, W, H);
    g.fillStyle = '#fff6d8';
    for (const t of twinkles) {
      g.globalAlpha = 0.35 + 0.65 * Math.abs(Math.sin(now / 700 + t.p));
      g.beginPath(); g.arc(t.x, t.y, t.s, 0, TAU); g.fill();
    }
    g.globalAlpha = 1;

    // 하늘
    const skyA = pal.sky ? clamp(1 + Math.log10(Math.max(V.dens, 1e-9)) / 5, 0, 0.94) : 0;
    if (skyA > 0.01) {
      const gr = g.createLinearGradient(0, 0, 0, H);
      gr.addColorStop(0, C(pal.sky, skyA * 0.92, -16)); gr.addColorStop(1, C(pal.horizon, skyA));
      g.fillStyle = gr; g.fillRect(0, 0, W, H);
    }

    // 행성 표면
    const rest = px * REST_OFF[V.shape];
    const hh = Math.max(V.h, 0);
    const gy = sy + Math.min(H * 0.8, rest + (H * 0.46 - rest) * Math.log(1 + hh / 40) / Math.log(1 + P.START_ALT / 40));
    const c = hh / P.START_ALT;
    const Rc = c <= 1 ? W * (0.75 + 60 * Math.pow(1 - c, 3)) : W * 0.75 / (1 + (c - 1) * 1.5);
    const cx = W / 2, cy = gy + Rc;
    const zN = Math.min(1.2, 120 / (hh + 100));
    if (pal.sky && st.air > 0) {
      for (let i = 6; i >= 1; i--) {
        g.fillStyle = C(pal.horizon, 0.055 * Math.min(1, st.air + 0.2));
        g.beginPath(); g.arc(cx, cy, Rc + i * 3.5 * (0.6 + Math.min(c, 1)), 0, TAU); g.fill();
      }
    }
    // 먼 산
    const ridgeLayer = (z, amp, col, seed, sharp) => {
      if (amp * z < 1.2) return;
      g.fillStyle = col; g.beginPath(); g.moveTo(0, gy + 4);
      for (let x = 0; x <= W + 8; x += 8) {
        const wx = V.down + (x - W / 2) / z;
        let n = 0.55 * noise(wx / 5200 + seed) + 0.3 * noise(wx / 1300 + seed * 3) + 0.15 * noise(wx / 310 + seed * 7);
        if (sharp) n = Math.pow(n, 1.8) * 1.5;
        g.lineTo(x, gy - n * amp * z + 2);
      }
      g.lineTo(W + 8, gy + 4); g.closePath(); g.fill();
    };
    const amp = pal.kind === 'moon' ? 500 : pal.kind === 'alien' ? 1300 : 900;
    ridgeLayer(zN * 0.15, amp, C(pal.mount, 1, skyA * 16), 3, pal.kind === 'alien');
    ridgeLayer(zN * 0.45, amp * 0.16, C(pal.mount, 1, -4), 19, false);

    g.save();
    g.beginPath(); g.arc(cx, cy, Rc, 0, TAU);
    let gr = g.createLinearGradient(0, gy, 0, gy + H * 0.55);
    gr.addColorStop(0, C(pal.base, 1, 8)); gr.addColorStop(1, C(pal.base, 1, -16));
    g.fillStyle = gr; g.fill(); g.clip();
    const zf = zN * 0.5;
    for (const [li, cell] of [[0, V.R * 0.06], [1, 9000], [2, 400]]) {
      const cpx = cell * zf;
      const a = clamp((cpx - 16) / 40, 0, 1) * clamp((W * 2.6 - cpx) / (W * 1.2), 0, 1);
      if (a <= 0.01) continue;
      g.fillStyle = C(pal.patch, 0.6 * a);
      const i0 = Math.floor((V.down - W / 2 / zf) / cell) - 1, i1 = Math.ceil((V.down + W / 2 / zf) / cell) + 1;
      for (let i = i0; i <= i1; i++) {
        const k = i * 13 + li * 101, d = hash(k + 2);
        const x = W / 2 + ((i + hash(k)) * cell - V.down) * zf, rx = cpx * (0.25 + 0.4 * hash(k + 1));
        g.beginPath(); g.ellipse(x, gy + 10 + d * (H - gy) * 0.85 + rx * 0.12, rx, rx * (0.16 + d * 0.16), 0, 0, TAU); g.fill();
      }
    }
    g.restore();
    g.strokeStyle = C(pal.horizon, 0.55, 6); g.lineWidth = 1.5;
    g.beginPath(); g.arc(cx, cy, Rc, Math.PI * 1.02, Math.PI * 1.98); g.stroke();

    if (zN > 0.12) {
      const cell = 26, i0 = Math.floor((V.down - W / 2 / zN) / cell) - 1, i1 = Math.ceil((V.down + W / 2 / zN) / cell) + 1;
      g.globalAlpha = clamp((zN - 0.12) / 0.12, 0, 1);
      for (let i = i0; i <= i1; i++) drawNearObject(g, pal.kind, i, W / 2 + ((i + hash(i * 1.7)) * cell - V.down) * zN, gy + 2, zN);
      g.globalAlpha = 1;
    }

    // 추락 흔적
    if (sim && sim.outcome === 'crash') {
      g.fillStyle = 'rgba(20,10,30,.75)'; g.beginPath(); g.ellipse(sx, gy + 4, px * 0.9, px * 0.16, 0, 0, TAU); g.fill();
      g.fillStyle = '#2b1a3f';
      for (let i = 0; i < 6; i++) { const ox = (hash(i + 40) - 0.5) * px * 1.3; g.beginPath(); g.moveTo(sx + ox - 6, gy + 3); g.lineTo(sx + ox + hash(i) * 6, gy - 5 - hash(i + 9) * px * 0.2); g.lineTo(sx + ox + 8, gy + 3); g.fill(); }
    }

    // 속도 방향과 자세
    if (V.v > 0.5) fx.va = Math.atan2(-V.vr, V.vt);
    else if (!sim) fx.va = st.angle * Math.PI / 180;
    const va = fx.va, dx = Math.cos(va), dy = Math.sin(va);
    const landing = sim && (sim.s.chuteOut || sim.landingBurn || (V.h < 300 && V.v < 80));
    fx.lb = fx.landed ? 1 : fx.lb + ((landing ? 1 : 0) - fx.lb) * Math.min(1, dtR * 2.5);
    fx.rot = aLerp(va, REST_ROT[V.shape], fx.lb);

    // 바람 줄기와 입자 생성
    if (live) {
      if (V.v > 40 && V.dens > 1e-6 && Math.random() < Math.min(1, V.v / 400)) {
        const sp = 260 + Math.min(V.v, 4000) * 0.35, t = Math.random();
        const ox = (Math.random() - 0.5) * W * 1.4, oy = (Math.random() - 0.5) * H * 1.4;
        spawn(sx + ox + dx * W * 0.6 * t, sy + oy + dy * H * 0.6 * t, -dx * sp, -dy * sp, 0.5, 1, `rgba(255,255,255,${0.08 + skyA * 0.22})`, { line: sp * 0.07 });
      }
      const p = clamp(V.qRatio, 0, 1.6);
      if (p > 0.12) for (let i = 0; i < 2; i++) {
        const sp = 200 + Math.random() * 260, a = va + Math.PI + (Math.random() - 0.5) * 0.5;
        spawn(sx + (Math.random() - 0.5) * px * 0.5, sy + (Math.random() - 0.5) * px * 0.5, Math.cos(a) * sp, Math.sin(a) * sp, 0.3 + Math.random() * 0.5, 2 + Math.random() * 4 * p,
          p > 1 ? '#ffd0e2' : Math.random() < 0.5 ? '#ffc93c' : '#ff7a1a', { glow: true });
      }
      if (V.hull < 70 && Math.random() < (75 - V.hull) / 90) {
        spawn(sx, sy, -dx * 90 + (Math.random() - 0.5) * 30, -dy * 90 + (Math.random() - 0.5) * 30, 0.9 + Math.random() * 0.6, 5 + Math.random() * 6, 'rgba(40,25,60,.55)', { grow: 1.4 });
      }
      if (V.throttle > 0.05 && V.h < 40) {
        const dir = Math.random() < 0.5 ? -1 : 1;
        spawn(sx + dir * 10, gy, dir * (60 + Math.random() * 200), -Math.random() * 40, 0.5 + Math.random() * 0.5, 5 + Math.random() * 9, C(pal.base, 0.45, 22), { grow: 1.5 });
      }
    }

    // 진입 방향 안내 (대기 중)
    if (!sim) {
      g.save(); g.translate(sx, sy);
      g.setLineDash([6, 6]); g.lineWidth = 1.5; g.strokeStyle = 'rgba(255,233,199,.45)';
      g.beginPath(); g.moveTo(px * 0.7, 0); g.lineTo(px * 0.7 + 150, 0); g.stroke();
      g.strokeStyle = '#ffc93c'; g.lineWidth = 2.5;
      g.beginPath(); g.moveTo(dx * px * 0.7, dy * px * 0.7); g.lineTo(dx * (px * 0.7 + 150), dy * (px * 0.7 + 150)); g.stroke();
      g.setLineDash([]);
      const ex = dx * (px * 0.7 + 158), ey = dy * (px * 0.7 + 158);
      g.fillStyle = '#ffc93c'; g.beginPath(); g.moveTo(ex, ey); g.lineTo(ex - dx * 14 - dy * 7, ey - dy * 14 + dx * 7); g.lineTo(ex - dx * 14 + dy * 7, ey - dy * 14 - dx * 7); g.fill();
      g.beginPath(); g.arc(0, 0, px * 0.7 + 60, 0, va); g.strokeStyle = 'rgba(255,201,60,.7)'; g.lineWidth = 1.5; g.stroke();
      g.font = `700 ${Math.round(13 * clamp(W / 800, 0.85, 1.1))}px Orbitron, sans-serif`; g.fillStyle = '#ffe9c7'; g.textAlign = 'left';
      g.fillText(`진입 ${st.angle}° · ${num(st.speed)} m/s`, px * 0.7 + 66, -8);
      g.restore();
    }

    if (!fx.hideShip) {
      // 낙하산
      if (V.chute > 0 && !fx.landed) {
        const ca = V.v > 2 ? va + Math.PI : -Math.PI / 2;
        const D = cfg.chuteD, cp = clamp(26 + D * 1.5, 30, 150) * (0.25 + 0.75 * V.chute) * clamp(W / 900, 0.6, 1.1);
        const L = px * 0.55 + (46 + D * 0.5) * (0.5 + 0.5 * V.chute);
        g.save(); g.translate(sx, sy); g.rotate(ca);
        g.strokeStyle = 'rgba(255,233,199,.8)'; g.lineWidth = 1;
        for (const k of [-1, -0.5, 0, 0.5, 1]) { g.beginPath(); g.moveTo(0, 0); g.lineTo(L, k * cp / 2); g.stroke(); }
        g.beginPath(); g.moveTo(L, -cp / 2); g.bezierCurveTo(L + cp * 0.75, -cp * 0.5, L + cp * 0.75, cp * 0.5, L, cp / 2);
        g.quadraticCurveTo(L + cp * 0.12, 0, L, -cp / 2); g.closePath();
        g.save(); g.clip();
        for (let k = 0; k < 6; k++) { g.fillStyle = k % 2 ? '#ffe9c7' : '#ff7a1a'; g.fillRect(L - 2, -cp / 2 + (k * cp) / 6, cp, cp / 6 + 1); }
        g.restore();
        g.strokeStyle = '#1a0b2e'; g.lineWidth = 1.5; g.stroke();
        g.restore();
      }

      // 마찰열 꼬리
      const p = live || paused ? clamp(V.qRatio, 0, 1.6) : 0;
      if (p > 0.06) {
        g.save(); g.translate(sx, sy); g.rotate(va); g.globalCompositeOperation = 'lighter';
        const L = px * (1.6 + 3.2 * p), w = px * 0.62;
        gr = g.createLinearGradient(px * 0.5, 0, -L, 0);
        gr.addColorStop(0, `rgba(255,${p > 1 ? 235 : 215},${p > 1 ? 230 : 130},${Math.min(0.9, 0.5 + p * 0.4)})`);
        gr.addColorStop(0.35, `rgba(255,122,26,${0.5 * Math.min(1, p)})`);
        gr.addColorStop(0.7, `rgba(255,42,127,${0.3 * Math.min(1, p)})`);
        gr.addColorStop(1, 'rgba(255,42,127,0)');
        g.fillStyle = gr;
        g.beginPath(); g.moveTo(px * 0.62, 0); g.quadraticCurveTo(px * 0.5, -w, -px * 0.2, -w * 0.95);
        g.lineTo(-L * (0.9 + Math.random() * 0.1), 0); g.lineTo(-px * 0.2, w * 0.95); g.quadraticCurveTo(px * 0.5, w, px * 0.62, 0); g.fill();
        g.restore();
      }

      // 역추진 불꽃
      if (V.throttle > 0.03 && live) {
        g.save(); g.translate(sx, sy); g.rotate(va); g.globalCompositeOperation = 'lighter';
        let L = px * (0.5 + 1.5 * V.throttle) * (0.85 + Math.random() * 0.3);
        if (dy > 0.2) L = Math.min(L, Math.max(6, (gy - sy) / dy - px * 0.4));   // 불꽃이 땅을 뚫지 않게
        const w = px * 0.2;
        gr = g.createLinearGradient(px * 0.4, 0, px * 0.4 + L, 0);
        gr.addColorStop(0, 'rgba(255,255,255,.95)'); gr.addColorStop(0.3, 'rgba(25,230,200,.8)'); gr.addColorStop(1, 'rgba(79,125,255,0)');
        g.fillStyle = gr;
        g.beginPath(); g.moveTo(px * 0.38, -w); g.quadraticCurveTo(px * 0.4 + L * 0.6, -w * 0.7, px * 0.4 + L, 0); g.quadraticCurveTo(px * 0.4 + L * 0.6, w * 0.7, px * 0.38, w); g.fill();
        g.restore();
      }

      // 우주선
      g.save(); g.translate(sx, sy); g.rotate(fx.rot); g.scale(px, px);
      drawShip(g, V.shape);
      g.restore();

      if (p > 0.06) {
        g.save(); g.globalCompositeOperation = 'lighter';
        const bx = sx + dx * px * 0.4, by = sy + dy * px * 0.4, r = px * (0.55 + 0.45 * p);
        gr = g.createRadialGradient(bx, by, 0, bx, by, r);
        gr.addColorStop(0, `rgba(255,250,220,${Math.min(0.95, p)})`); gr.addColorStop(0.4, `rgba(255,150,40,${0.55 * Math.min(1, p)})`); gr.addColorStop(1, 'rgba(255,42,127,0)');
        g.fillStyle = gr; g.beginPath(); g.arc(bx, by, r, 0, TAU); g.fill();
        g.restore();
      }

      // 착륙 깃발
      if (fx.landed && now - endAt > 500) {
        const fxp = sx + px * 0.75 + 14, k = clamp((now - endAt - 500) / 400, 0, 1);
        g.strokeStyle = '#ffe9c7'; g.lineWidth = 2; g.beginPath(); g.moveTo(fxp, gy); g.lineTo(fxp, gy - 46 * k); g.stroke();
        g.fillStyle = '#ffc93c'; g.beginPath(); g.moveTo(fxp, gy - 46 * k); g.lineTo(fxp + 24 * k, gy - 39 * k); g.lineTo(fxp, gy - 32 * k); g.fill();
      }
    }

    // 입자
    for (let i = parts.length - 1; i >= 0; i--) {
      const q = parts[i];
      q.life -= dtR;
      if (q.life <= 0) { parts.splice(i, 1); continue; }
      q.vy += q.grav * dtR; q.x += q.vx * dtR; q.y += q.vy * dtR;
      const a = q.life / q.max;
      g.globalAlpha = a;
      g.globalCompositeOperation = q.glow ? 'lighter' : 'source-over';
      if (q.line) {
        const sp = Math.hypot(q.vx, q.vy) || 1;
        g.strokeStyle = q.color; g.lineWidth = 1; g.beginPath(); g.moveTo(q.x, q.y); g.lineTo(q.x - (q.vx / sp) * q.line, q.y - (q.vy / sp) * q.line); g.stroke();
      } else {
        g.fillStyle = q.color; g.beginPath(); g.arc(q.x, q.y, q.size * (1 + q.grow * (1 - a)), 0, TAU); g.fill();
      }
    }
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';

    if (fx.flash > 0.01) {
      g.fillStyle = `rgba(255,240,200,${fx.flash * 0.8})`; g.fillRect(-10, -10, W + 20, H + 20);
      fx.flash *= Math.pow(0.02, dtR);
    }
    g.restore();
  }

  // ───────── 계기판 ─────────
  function updateHud() {
    const V = view();
    const km = V.h >= 1000;
    $('hudAlt').textContent = km ? (V.h / 1000).toFixed(1) : Math.max(0, V.h).toFixed(0);
    $('hudAltU').textContent = km ? 'km' : 'm';
    $('hudSpd').textContent = V.v < 100 ? V.v.toFixed(1) : num(V.v);
    $('hudG').textContent = V.G.toFixed(1);
    $('hudTemp').textContent = num(V.temp);
    const sh = P.SHAPES[V.shape];
    const gG = $('hudG').parentElement, gT = $('hudTemp').parentElement;
    gG.className = 'gauge' + (V.G > sh.gLim ? ' danger' : V.G > sh.gLim * 0.7 ? ' warn' : '');
    gT.className = 'gauge' + (V.qRatio > 1 ? ' danger' : V.qRatio > 0.7 ? ' warn' : '');
    const hull = sim ? sim.hull : 100, d = sim ? sim.dmg : { heat: 0, g: 0, impact: 0 };
    $('hullPct').textContent = Math.round(hull) + '%';
    const fill = $('hullFill');
    fill.style.width = clamp(hull, 0, 100) + '%';
    fill.className = hull < 35 ? 'low' : hull < 70 ? 'mid' : '';
    $('dmgHeat').textContent = Math.round(Math.min(d.heat, 100)) + '%';
    $('dmgG').textContent = Math.round(Math.min(d.g, 100)) + '%';
    $('dmgImpact').textContent = Math.round(d.impact) + '%';
    const fuel0 = sim ? cfg.fuel0 : st.fuel;
    $('fuelWrap').hidden = !fuel0;
    $('hudFuel').textContent = num(sim ? sim.s.fuel : st.fuel) + ' m/s';
    $('clock').textContent = 'T+' + clock(sim ? sim.s.t : 0);
    $('warpNow').textContent = running && sim && !sim.outcome ? '×' + (warp < 10 ? warp.toFixed(1) : Math.round(warp)) : '';
  }

  function drawChart() {
    const g = cctx, W = chart.width / dpr, H = chart.height / dpr;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    g.strokeStyle = 'rgba(185,166,214,.18)'; g.lineWidth = 1;
    for (let i = 0; i <= 4; i++) { const y = 22 + ((H - 40) * i) / 4; g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
    g.font = '12px "Noto Sans KR", sans-serif'; g.fillStyle = '#b9a6d6'; g.textBaseline = 'alphabetic';
    if (!sim || sim.log.length < 2) {
      g.textAlign = 'center'; g.fillText('착륙을 시작하면 고도·속도·온도 변화가 그려집니다', W / 2, H / 2 + 4);
      return;
    }
    const log = sim.log, tMax = Math.max(log[log.length - 1].t, 10);
    const tempMax = Math.max(sim.max.temp, 300);
    const series = [['h', sim.max.h, '#19e6c8'], ['v', Math.max(sim.max.v, 10), '#ffc93c'], ['temp', tempMax, '#ff2a7f']];
    const y0 = 22, yh = H - 40;
    for (const [key, mx, col] of series) {
      g.strokeStyle = col; g.lineWidth = 2; g.beginPath();
      for (let i = 0; i < log.length; i++) {
        const x = (log[i].t / tMax) * W, y = y0 + yh * (1 - clamp(log[i][key] / mx, 0, 1));
        if (i) g.lineTo(x, y); else g.moveTo(x, y);
      }
      g.stroke();
    }
    g.textAlign = 'left'; g.fillText('0:00', 2, H - 4);
    g.textAlign = 'right'; g.fillText(clock(tMax), W - 2, H - 4);
    g.textAlign = 'left';
    g.fillText(`최고 — 고도 ${num(sim.max.h / 1000)} km · 속도 ${num(sim.max.v)} m/s · 온도 ${num(sim.max.temp)} ℃`, 2, 13, W - 4);
  }

  // ───────── 메인 루프 ─────────
  let last = performance.now();
  function frame(now) {
    const dtR = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    if (sim && running && !paused) {
      if (!sim.outcome) updateWarp(dtR);
      acc += dtR * warp;
      let n = 0;
      while (acc >= DT && !sim.outcome && n++ < 40000) { P.advance(sim, DT); acc -= DT; }
      while (sim.events.length) say(sim.events.shift().type);
      if (sim.outcome) onEnd(now);
    }
    render(now, dtR);
    updateHud();
    drawChart();
    requestAnimationFrame(frame);
  }

  refreshControls();
  setButtons();
  resize();
  requestAnimationFrame(frame);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => {});

  window.__sim = { get sim() { return sim; }, st, start, resetIdle, refreshControls };   // 점검용
})();
