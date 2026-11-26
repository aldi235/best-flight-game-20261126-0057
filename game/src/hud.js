// The HUD: DOM readouts plus two small canvases (compass strip and artificial
// horizon) and a six-dial gauge cluster that lights up in cockpit view.
// Everything here is text and canvas drawing — no images.
import { clamp, radToDeg } from './config.js';
import { hudNumbers } from './flight.js';

function pad3(n) {
  const s = String(Math.abs(Math.round(n)));
  return s.length >= 3 ? s : '0'.repeat(3 - s.length) + s;
}

export function createHud() {
  const hud = document.getElementById('hud');
  const altEl = document.getElementById('hud-alt');
  const spdEl = document.getElementById('hud-spd');
  const hdgEl = document.getElementById('hud-hdg');
  const vsEl = document.getElementById('hud-vs');
  const fuelBar = document.getElementById('hud-fuel-fill');
  const fuelText = document.getElementById('hud-fuel-text');
  const thrBar = document.getElementById('hud-thr-fill');
  const objectiveEl = document.getElementById('hud-objective');
  const timerEl = document.getElementById('hud-timer');
  const scoreEl = document.getElementById('hud-score');
  const msgEl = document.getElementById('hud-message');
  const warnEl = document.getElementById('hud-warning');
  const compass = document.getElementById('hud-compass');
  const horizon = document.getElementById('hud-horizon');
  const gauges = document.getElementById('hud-gauges');
  const compassCtx = compass.getContext('2d');
  const horizonCtx = horizon.getContext('2d');
  const gaugeCtx = gauges.getContext('2d');

  function drawCompass(headingDeg) {
    const w = compass.width;
    const h = compass.height;
    compassCtx.clearRect(0, 0, w, h);
    compassCtx.fillStyle = 'rgba(8, 14, 24, 0.72)';
    compassCtx.fillRect(0, 0, w, h);
    compassCtx.font = 'bold 13px system-ui, sans-serif';
    compassCtx.textAlign = 'center';
    compassCtx.textBaseline = 'middle';
    const labels = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };
    for (let deg = 0; deg < 360; deg += 15) {
      let diff = deg - headingDeg;
      while (diff > 180) diff -= 360;
      while (diff < -180) diff += 360;
      const x = w / 2 + diff * 2.4;
      if (x < -20 || x > w + 20) continue;
      compassCtx.strokeStyle = 'rgba(255,255,255,0.55)';
      compassCtx.beginPath();
      compassCtx.moveTo(x, deg % 45 === 0 ? 8 : 16);
      compassCtx.lineTo(x, 26);
      compassCtx.stroke();
      if (labels[deg]) {
        compassCtx.fillStyle = deg % 90 === 0 ? '#ffc21c' : '#eef1f5';
        compassCtx.fillText(labels[deg], x, 38);
      }
    }
    compassCtx.fillStyle = '#ffc21c';
    compassCtx.beginPath();
    compassCtx.moveTo(w / 2 - 7, 0);
    compassCtx.lineTo(w / 2 + 7, 0);
    compassCtx.lineTo(w / 2, 8);
    compassCtx.closePath();
    compassCtx.fill();
  }

  function drawHorizon(pitch, roll) {
    const w = horizon.width;
    const h = horizon.height;
    const ctx = horizonCtx;
    ctx.save();
    ctx.clearRect(0, 0, w, h);
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, w / 2 - 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.translate(w / 2, h / 2);
    ctx.rotate(roll);
    const pitchPx = clamp(pitch, -0.6, 0.6) * 70;
    ctx.fillStyle = '#2f7fc1';
    ctx.fillRect(-w, -h + pitchPx, w * 2, h);
    ctx.fillStyle = '#7a5a34';
    ctx.fillRect(-w, pitchPx, w * 2, h);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-w, pitchPx);
    ctx.lineTo(w, pitchPx);
    ctx.stroke();
    ctx.restore();
    // Fixed wings marker.
    ctx.strokeStyle = '#ffc21c';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(w / 2 - 34, h / 2);
    ctx.lineTo(w / 2 - 12, h / 2);
    ctx.moveTo(w / 2 + 12, h / 2);
    ctx.lineTo(w / 2 + 34, h / 2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, w / 2 - 2, 0, Math.PI * 2);
    ctx.stroke();
  }

  function dial(cx, cy, r, label, value, max, unit, color, danger) {
    const ctx = gaugeCtx;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = '#10161f';
    ctx.fill();
    ctx.strokeStyle = danger ? '#ff534b' : 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 2;
    ctx.stroke();
    const frac = clamp(value / max, 0, 1);
    const a0 = Math.PI * 0.75;
    const a1 = Math.PI * 2.25;
    ctx.beginPath();
    ctx.arc(cx, cy, r - 5, a0, a0 + (a1 - a0) * frac);
    ctx.strokeStyle = color;
    ctx.lineWidth = 4;
    ctx.stroke();
    const na = a0 + (a1 - a0) * frac;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(na) * (r - 8), cy + Math.sin(na) * (r - 8));
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#eef1f5';
    ctx.font = 'bold 15px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(Math.round(value)), cx, cy + 2);
    ctx.fillStyle = '#8b93a3';
    ctx.font = '10px system-ui, sans-serif';
    ctx.fillText(label, cx, cy + r - 11);
    ctx.fillText(unit, cx, cy - r + 11);
  }

  function drawGauges(numbers, state) {
    const ctx = gaugeCtx;
    ctx.clearRect(0, 0, gauges.width, gauges.height);
    const r = 34;
    const y = 46;
    dial(52, y, r, 'AIRSPEED', numbers.speedKnots, 180, 'KT', '#4fc3f7', false);
    dial(136, y, r, 'ALTITUDE', numbers.altitude, 3000, 'FT', '#37d67a', false);
    dial(220, y, r, 'HEADING', numbers.headingDeg, 360, 'DEG', '#ffc21c', false);
    dial(304, y, r, 'FUEL', numbers.fuel, 100, '%', '#ff7a1a', numbers.fuel < 20);
    dial(388, y, r, 'THROTTLE', numbers.throttle, 100, '%', '#e86a1c', false);
    dial(472, y, r, 'DAMAGE', numbers.damage, 100, '%', '#ff534b', numbers.damage > 50);
    void state;
  }

  let lastMessage = '';
  return {
    show(inGame) {
      hud.style.display = inGame ? 'block' : 'none';
    },
    setCameraMode(mode) {
      gauges.style.display = mode === 'cockpit' ? 'block' : 'none';
      horizon.style.display = mode === 'cockpit' ? 'block' : 'block';
    },
    update(state, run, screen) {
      const n = hudNumbers(state);
      altEl.textContent = `${n.altitude.toLocaleString('en-US')} FT`;
      spdEl.textContent = `${n.speedKnots} KT`;
      hdgEl.textContent = `${pad3(n.headingDeg)}°`;
      vsEl.textContent = `${n.verticalFpm >= 0 ? '+' : ''}${n.verticalFpm} FPM`;
      fuelBar.style.width = `${n.fuel}%`;
      fuelBar.style.background = n.fuel < 20 ? '#ff534b' : n.fuel < 45 ? '#ffc21c' : '#37d67a';
      fuelText.textContent = `FUEL ${n.fuel}%`;
      thrBar.style.width = `${n.throttle}%`;
      const remain = run.mission.timeLimit - run.elapsed;
      const mm = Math.max(0, Math.floor(remain / 60));
      const ss = Math.max(0, Math.floor(remain % 60));
      timerEl.textContent = `${mm}:${String(ss).padStart(2, '0')}`;
      timerEl.style.color = remain < 60 ? '#ff534b' : '#eef1f5';
      scoreEl.textContent = `SCORE ${run.score}`;
      objectiveEl.textContent = run.objectiveLabel || '';
      drawCompass(n.headingDeg);
      drawHorizon(state.pitch, state.roll);
      drawGauges(n, state);
      const warning = state.stalled
        ? '⚠ STALL — NOSE DOWN, THROTTLE UP'
        : !state.engineOn
          ? '⚠ FUEL EMPTY — GLIDE TO A RUNWAY'
          : n.fuel < 20
            ? '⚠ LOW FUEL'
            : state.damage > 50
              ? '⚠ AIRFRAME DAMAGE'
              : '';
      warnEl.textContent = warning;
      warnEl.style.display = warning ? 'block' : 'none';
      if (run.message !== lastMessage) {
        lastMessage = run.message;
        msgEl.textContent = run.message;
        msgEl.style.opacity = run.message ? '1' : '0';
      }
      void screen;
      void radToDeg;
    },
  };
}
