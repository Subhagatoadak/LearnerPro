// techniques.js — KV Cache, Distillation, Quantization, LoRA simulations

// ─── SHARED UTILS (mirror subset from main.js) ────────────────
function techLerpColor(a, b, t) {
  t = Math.max(0, Math.min(1, t));
  return a.map((v, i) => Math.round(v + (b[i] - v) * t));
}

function techDivergeColor(v, mn, mx) {
  const t = (v - mn) / (mx - mn + 1e-9);
  const c = t < 0.5
    ? techLerpColor([14, 52, 99], [255, 255, 255], t * 2)
    : techLerpColor([255, 255, 255], [255, 90, 30], (t - 0.5) * 2);
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

function techErrorColor(v, maxAbs) {
  // White at 0, red for positive, blue for negative
  const t = Math.abs(v) / (maxAbs + 1e-9);
  if (v >= 0) {
    const c = techLerpColor([20, 20, 30], [255, 60, 60], t);
    return `rgb(${c[0]},${c[1]},${c[2]})`;
  }
  const c = techLerpColor([20, 20, 30], [60, 120, 255], t);
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

function drawTechMatrix(canvasId, matrix, rowLabels, colLabels, colorFn) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || !matrix || !matrix.length) return;
  const rows = matrix.length, cols = matrix[0].length;
  const avW = (canvas.parentElement?.clientWidth || 360) - 36;
  const cellW = Math.max(16, Math.min(52, Math.floor(avW / cols)));
  const cellH = Math.max(16, Math.min(44, Math.floor(240 / rows)));
  const padL = rowLabels ? 50 : 6, padT = colLabels ? 24 : 6;
  const W = padL + cols * cellW + 4, H = padT + rows * cellH + 4;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = W * dpr; canvas.height = H * dpr;
  canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, W, H);

  const flat = matrix.flat();
  const mn = Math.min(...flat), mx = Math.max(...flat);
  const maxAbs = Math.max(Math.abs(mn), Math.abs(mx));

  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      ctx.fillStyle = colorFn
        ? colorFn(matrix[i][j], mn, mx, maxAbs)
        : techDivergeColor(matrix[i][j], mn, mx);
      ctx.beginPath();
      ctx.roundRect(padL + j * cellW + 1, padT + i * cellH + 1, cellW - 2, cellH - 2, 3);
      ctx.fill();
    }
  }

  if (rowLabels) {
    ctx.font = `${Math.min(10, cellH - 4)}px IBM Plex Mono, monospace`;
    ctx.fillStyle = '#97afbb'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    rowLabels.forEach((l, i) => ctx.fillText(String(l).slice(0, 5), padL - 4, padT + i * cellH + cellH / 2));
  }
  if (colLabels) {
    ctx.font = `${Math.min(9, cellW - 3)}px IBM Plex Mono, monospace`;
    ctx.fillStyle = '#97afbb'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    colLabels.forEach((l, j) => ctx.fillText(l, padL + j * cellW + cellW / 2, padT - 4));
  }
  if (cellW >= 26 && cellH >= 13) {
    ctx.font = '9px IBM Plex Mono, monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        const t = (matrix[i][j] - mn) / (mx - mn + 1e-9);
        ctx.fillStyle = t < 0.45 ? 'rgba(220,240,255,0.8)' : 'rgba(5,15,25,0.8)';
        ctx.fillText(matrix[i][j].toFixed(2), padL + j * cellW + cellW / 2, padT + i * cellH + cellH / 2);
      }
    }
  }

  const dimEl = canvas.parentElement?.querySelector('.mat-dim');
  if (dimEl) dimEl.textContent = `${rows} × ${cols}`;
}

function techInsight(blocks) {
  return '<div class="calc-stack">' +
    blocks.map(b => `<div class="calc-block"><h4>${b.title}</h4>${b.body}</div>`).join('') +
    '</div>';
}
function techMetric(lbl, val) {
  return `<div class="metric"><span class="metric-label">${lbl}</span><span class="metric-value">${val}</span></div>`;
}

// softmax with temperature
function softmaxT(logits, T) {
  const scaled = logits.map(v => v / T);
  const mx = Math.max(...scaled);
  const ex = scaled.map(v => Math.exp(v - mx));
  const s = ex.reduce((a, b) => a + b, 0);
  return ex.map(e => e / s);
}

// KL divergence  sum p * log(p/q)
function klDiv(p, q) {
  return p.reduce((s, pi, i) => {
    if (pi < 1e-10) return s;
    return s + pi * Math.log(pi / (q[i] + 1e-10));
  }, 0);
}

// ─── TAB SWITCHING ────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Wire tabs
  document.querySelectorAll('.tech-tab').forEach(btn => {
    btn.addEventListener('click', () => switchTech(btn.dataset.tech));
  });

  // Wire select dropdown (mobile)
  const sel = document.getElementById('tech-select');
  if (sel) sel.addEventListener('change', e => switchTech(e.target.value));

  initKVCache();
  initDistillation();
  initQuantization();
  initLoRA();
});

function switchTech(tech) {
  document.querySelectorAll('.tech-tab').forEach(b =>
    b.classList.toggle('active', b.dataset.tech === tech)
  );
  document.querySelectorAll('.tech-panel').forEach(p =>
    p.classList.toggle('active', p.id === `tech-${tech}`)
  );
  const sel = document.getElementById('tech-select');
  if (sel) sel.value = tech;
}

// ══════════════════════════════════════════════════════════════
// 1. KV CACHE
// ══════════════════════════════════════════════════════════════
let kvState = { step: 0, maxLen: 6, delay: 900, timer: null, playing: false };

const KV_VOCAB = ['the', 'cat', 'sat', 'on', 'mat', 'big', 'dog', 'ran'];

function initKVCache() {
  const maxlenSlider = document.getElementById('kv-maxlen');
  const speedSlider  = document.getElementById('kv-speed');

  maxlenSlider.addEventListener('input', () => {
    kvState.maxLen = +maxlenSlider.value;
    document.getElementById('kv-maxlen-val').textContent = kvState.maxLen;
    kvReset();
  });
  speedSlider.addEventListener('input', () => {
    kvState.delay = +speedSlider.value;
    document.getElementById('kv-speed-val').textContent = kvState.delay + 'ms';
  });

  document.getElementById('kv-play').addEventListener('click', kvTogglePlay);
  document.getElementById('kv-reset').addEventListener('click', kvReset);

  kvReset();
}

function kvReset() {
  if (kvState.timer) clearTimeout(kvState.timer);
  kvState.step = 0;
  kvState.playing = false;
  document.getElementById('kv-play').textContent = '▶ Generate tokens';
  document.getElementById('kv-play').classList.remove('playing');
  kvRender();
}

function kvTogglePlay() {
  if (kvState.playing) {
    kvState.playing = false;
    if (kvState.timer) clearTimeout(kvState.timer);
    document.getElementById('kv-play').textContent = '▶ Generate tokens';
    document.getElementById('kv-play').classList.remove('playing');
  } else {
    if (kvState.step >= kvState.maxLen) kvState.step = 0;
    kvState.playing = true;
    document.getElementById('kv-play').textContent = '⏸ Pause';
    document.getElementById('kv-play').classList.add('playing');
    kvStep();
  }
}

function kvStep() {
  if (!kvState.playing) return;
  kvState.step++;
  kvRender();
  if (kvState.step < kvState.maxLen) {
    kvState.timer = setTimeout(kvStep, kvState.delay);
  } else {
    kvState.playing = false;
    document.getElementById('kv-play').textContent = '▶ Generate tokens';
    document.getElementById('kv-play').classList.remove('playing');
  }
}

function kvRender() {
  const n = kvState.step;
  const maxLen = kvState.maxLen;
  document.getElementById('kv-step-label').textContent = `Step ${n} / ${maxLen}`;

  // Cache visualization
  const vis = document.getElementById('kv-cache-vis');
  vis.innerHTML = '';

  const tokens = KV_VOCAB.slice(0, maxLen);

  // Token row
  const tokenRow = document.createElement('div');
  tokenRow.className = 'kv-token-row';
  tokens.forEach((tok, i) => {
    const cell = document.createElement('div');
    cell.className = 'kv-token-cell' + (i < n ? ' generated' : '') + (i === n - 1 ? ' current' : '');
    cell.innerHTML = `<span class="kv-pos">${i}</span><span class="kv-word">${tok}</span>`;
    tokenRow.appendChild(cell);
  });
  vis.appendChild(tokenRow);

  // Cache table
  const cacheWrap = document.createElement('div');
  cacheWrap.className = 'kv-cache-table';

  // Header
  const hdr = document.createElement('div');
  hdr.className = 'kv-cache-hdr';
  hdr.innerHTML = '<span class="kv-hdr-cell">pos</span><span class="kv-hdr-cell">token</span>' +
    '<span class="kv-hdr-cell kv-key">K (d_head=4)</span>' +
    '<span class="kv-hdr-cell kv-val">V (d_head=4)</span>' +
    '<span class="kv-hdr-cell">status</span>';
  cacheWrap.appendChild(hdr);

  // Use deterministic fake K,V vectors
  const rng = mulberry32kv(42);
  for (let i = 0; i < maxLen; i++) {
    const kVec = Array.from({ length: 4 }, () => (rng() * 2 - 1).toFixed(3));
    const vVec = Array.from({ length: 4 }, () => (rng() * 2 - 1).toFixed(3));

    const row = document.createElement('div');
    row.className = 'kv-cache-row' +
      (i < n ? ' cached' : '') +
      (i === n - 1 ? ' new-entry' : '');

    const status = i < n
      ? (i === n - 1 ? '<span class="kv-badge new">✦ just computed</span>' : '<span class="kv-badge reuse">✓ reused</span>')
      : '<span class="kv-badge pending">— pending</span>';

    row.innerHTML =
      `<span class="kv-cell">${i}</span>` +
      `<span class="kv-cell tok">${tokens[i]}</span>` +
      `<span class="kv-cell kv-vec">[${kVec.join(', ')}]</span>` +
      `<span class="kv-cell kv-vec">[${vVec.join(', ')}]</span>` +
      `<span class="kv-cell">${status}</span>`;
    cacheWrap.appendChild(row);
  }
  vis.appendChild(cacheWrap);

  // Attention indicator for current step
  if (n > 0) {
    const attnDiv = document.createElement('div');
    attnDiv.className = 'kv-attn-row';
    attnDiv.innerHTML = `<span class="kv-attn-label">Token ${n-1} ("${tokens[n-1]}") attends to:</span>`;
    const dots = document.createElement('div');
    dots.className = 'kv-attn-dots';
    for (let i = 0; i < n; i++) {
      const dot = document.createElement('span');
      dot.className = 'kv-attn-dot' + (i === n - 1 ? ' self' : '');
      dot.title = `attending to "${tokens[i]}" (position ${i})`;
      dot.textContent = tokens[i];
      dots.appendChild(dot);
    }
    attnDiv.appendChild(dots);
    vis.appendChild(attnDiv);
  }

  // FLOPs chart
  renderKvFlops(n, maxLen);

  // Insight
  const saved = n > 1 ? ((n - 1) * 2 * 4) : 0; // K+V recomputation saved
  const naive = n > 0 ? n * n * 4 * 2 : 0;      // naive: every step re-computes all K,V
  const cached = n > 0 ? n * 4 * 2 + (n - 1) * 2 * 4 : 0; // only new K,V computed each step
  document.getElementById('kv-insight').innerHTML = techInsight([
    {
      title: `Step ${n}: "${n > 0 ? tokens[n - 1] : '—'}" generated`,
      body: `<div class="metric-grid">
        ${techMetric('Tokens in cache', n)}
        ${techMetric('New K,V computed', n > 0 ? 1 : 0)}
        ${techMetric('K,V reused', Math.max(0, n - 1))}
        ${techMetric('Attention ops', `${n} dot products`)}
      </div>`
    },
    {
      title: 'Cumulative compute comparison',
      body: `<div class="metric-grid">
        ${techMetric('Naive (no cache)', `${n * (n + 1) / 2} × 2·d matmuls`)}
        ${techMetric('With KV cache', `${n} × 2·d matmuls`)}
        ${techMetric('FLOPs saved', n > 1 ? `${(((n * (n + 1) / 2 - n) / (n * (n + 1) / 2)) * 100).toFixed(0)}%` : '0%')}
      </div>`
    },
    {
      title: 'Memory cost',
      body: `<p>Cache stores <strong>${n} × 2 × d_head × n_heads</strong> = <strong>${n * 2 * 4 * 2} floats</strong> per layer.
             For real models (e.g. GPT-3: 96 layers, d_head=128, n_heads=96) the KV cache
             can exceed <strong>several GB</strong> for long contexts — the main bottleneck for
             large-batch inference.</p>`
    },
  ]);
}

function mulberry32kv(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function renderKvFlops(current, total) {
  const container = document.getElementById('kv-flops-chart');
  if (!container) return;
  container.innerHTML = '';

  const steps = Array.from({ length: total }, (_, i) => i + 1);
  const naive  = steps.map(n => n);           // recompute all K,V: cost ∝ n
  const cached = steps.map(() => 1);          // always 1 new K,V

  const W = Math.max(260, container.clientWidth || 320);
  const H = 160;
  const padL = 42, padR = 20, padT = 14, padB = 32;
  const svg = d3.select(container).append('svg').attr('width', W).attr('height', H);

  const xS = d3.scaleLinear().domain([1, total]).range([padL, W - padR]);
  const yS = d3.scaleLinear().domain([0, total + 0.5]).range([H - padB, padT]);

  // grid
  [0, Math.floor(total / 2), total].forEach(v => {
    svg.append('line').attr('x1', padL).attr('x2', W - padR)
      .attr('y1', yS(v)).attr('y2', yS(v))
      .attr('stroke', 'rgba(255,255,255,0.06)').attr('stroke-width', 1);
    svg.append('text').attr('x', padL - 4).attr('y', yS(v))
      .attr('text-anchor', 'end').attr('dominant-baseline', 'middle')
      .attr('fill', '#6a8a9a').attr('font-size', 9).attr('font-family', 'IBM Plex Mono').text(v);
  });

  // naive line (red-orange)
  const naiveLine = d3.line().x((d, i) => xS(i + 1)).y(d => yS(d)).curve(d3.curveMonotoneX);
  svg.append('path').datum(naive)
    .attr('fill', 'none').attr('stroke', '#ff8f4d').attr('stroke-width', 2)
    .attr('d', naiveLine).attr('opacity', 0.75);

  // cached line (cyan)
  const cacheLine = d3.line().x((d, i) => xS(i + 1)).y(d => yS(d)).curve(d3.curveMonotoneX);
  svg.append('path').datum(cached)
    .attr('fill', 'none').attr('stroke', '#60d7ff').attr('stroke-width', 2)
    .attr('d', cacheLine).attr('opacity', 0.75);

  // current position marker
  if (current > 0) {
    svg.append('circle').attr('cx', xS(current)).attr('cy', yS(naive[current - 1]))
      .attr('r', 5).attr('fill', '#ff8f4d');
    svg.append('circle').attr('cx', xS(current)).attr('cy', yS(1))
      .attr('r', 5).attr('fill', '#60d7ff');
  }

  // axis labels
  svg.append('text').attr('x', W - padR).attr('y', yS(naive[total - 1]) - 8)
    .attr('fill', '#ff8f4d').attr('font-size', 10).attr('text-anchor', 'end').text('Naive');
  svg.append('text').attr('x', W - padR).attr('y', yS(1) - 8)
    .attr('fill', '#60d7ff').attr('font-size', 10).attr('text-anchor', 'end').text('Cached');

  svg.append('text').attr('x', (padL + W - padR) / 2).attr('y', H - 4)
    .attr('text-anchor', 'middle').attr('fill', '#6a8a9a').attr('font-size', 10).text('Token step →');
  svg.append('text')
    .attr('transform', `translate(10,${(padT + H - padB) / 2}) rotate(-90)`)
    .attr('text-anchor', 'middle').attr('fill', '#6a8a9a').attr('font-size', 10).text('K,V compute cost');
}

// ══════════════════════════════════════════════════════════════
// 2. KNOWLEDGE DISTILLATION
// ══════════════════════════════════════════════════════════════
const DIST_CLASSES = ['the', 'cat', 'dog', 'sat', 'ran', 'big', 'fast', 'on'];
const DIST_SEED_TEACHER = 7331;
const DIST_SEED_STUDENT_BASE = 1234;

let distState = { T: 1, alpha: 0.5, capacity: 0.5 };

function initDistillation() {
  const tempSlider  = document.getElementById('dist-temp');
  const alphaSlider = document.getElementById('dist-alpha');

  tempSlider.addEventListener('input', () => {
    distState.T = +tempSlider.value;
    document.getElementById('dist-temp-val').textContent = distState.T.toFixed(1);
    renderDistillation();
  });
  alphaSlider.addEventListener('input', () => {
    distState.alpha = +alphaSlider.value;
    document.getElementById('dist-alpha-val').textContent = distState.alpha.toFixed(2);
    renderDistillation();
  });

  document.querySelectorAll('#dist-capacity .head-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#dist-capacity .head-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      distState.capacity = +btn.dataset.cap;
      renderDistillation();
    });
  });

  renderDistillation();
}

function makeLogits(seed, n, scale) {
  const r = mulberry32kv(seed);
  return Array.from({ length: n }, () => (r() * 2 - 1) * scale);
}

function renderDistillation() {
  const { T, alpha, capacity } = distState;
  const n = DIST_CLASSES.length;

  // Teacher logits (fixed)
  const teacherLogits  = makeLogits(DIST_SEED_TEACHER, n, 3.5);
  const teacherSoft    = softmaxT(teacherLogits, T);
  const teacherHard    = softmaxT(teacherLogits, 1);

  // Student logits — capacity controls how close to teacher
  const studentLogits  = teacherLogits.map((v, i) => {
    const noise = (mulberry32kv(DIST_SEED_STUDENT_BASE + i)() * 2 - 1) * 4;
    return v * capacity + noise * (1 - capacity);
  });
  const studentSoft    = softmaxT(studentLogits, T);
  const studentHard    = softmaxT(studentLogits, 1);

  const kl = klDiv(teacherSoft, studentSoft);
  const klHard = klDiv(teacherHard, studentHard);

  // correct class = argmax teacher
  const correct = teacherLogits.indexOf(Math.max(...teacherLogits));

  renderDistBar('dist-teacher-chart', teacherSoft, DIST_CLASSES, '#60d7ff', correct);
  renderDistBar('dist-student-chart', studentSoft, DIST_CLASSES, '#8ef2ca', correct);
  renderDistKL('dist-kl-chart', teacherSoft, studentSoft, DIST_CLASSES);

  const totalLoss = alpha * (-Math.log(studentHard[correct] + 1e-10)) +
                    (1 - alpha) * kl * T * T;

  document.getElementById('dist-insight').innerHTML = techInsight([
    {
      title: `Temperature T = ${T} effect`,
      body: `<p>At T=1 the teacher concentrates probability on the top class.
             At higher T the distribution <em>softens</em>, revealing which classes
             are semantically similar to the correct one.</p>
             <div class="metric-grid">
               ${techMetric('Teacher entropy (T=1)', bits(teacherHard))}
               ${techMetric(`Teacher entropy (T=${T})`, bits(teacherSoft))}
               ${techMetric('Student entropy', bits(studentSoft))}
             </div>`
    },
    {
      title: 'Loss breakdown',
      body: `<div class="metric-grid">
        ${techMetric('Hard CE loss (α)', (alpha * (-Math.log(studentHard[correct] + 1e-10))).toFixed(4))}
        ${techMetric('Soft KL loss (1-α)', ((1 - alpha) * kl * T * T).toFixed(4))}
        ${techMetric('α', alpha.toFixed(2))}
        ${techMetric('Total loss', totalLoss.toFixed(4))}
      </div>`
    },
    {
      title: 'KL divergence teacher ‖ student',
      body: `<div class="metric-grid">
        ${techMetric('KL (soft, T scaled)', kl.toFixed(4))}
        ${techMetric('KL (hard, T=1)', klHard.toFixed(4))}
        ${techMetric('Student capacity', `${(capacity * 100).toFixed(0)}%`)}
        ${techMetric('Correct class', `"${DIST_CLASSES[correct]}"`)}
      </div>`
    },
    {
      title: '💡 Why temperature matters',
      body: `<p>At T=1 the soft label for "${DIST_CLASSES[correct]}" is
             <strong>${(teacherHard[correct] * 100).toFixed(1)}%</strong>.
             At T=${T} it becomes <strong>${(teacherSoft[correct] * 100).toFixed(1)}%</strong>,
             giving the student more signal about the relative likelihood of other classes.
             This "dark knowledge" is what makes distillation work better than training on
             hard labels alone.</p>`
    },
  ]);
}

function bits(p) {
  const H = -p.reduce((s, v) => s + (v > 1e-10 ? v * Math.log2(v) : 0), 0);
  return H.toFixed(3) + ' bits';
}

function renderDistBar(containerId, probs, labels, color, highlight) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';

  const W = Math.max(240, container.clientWidth || 300);
  const barH = 22, gap = 4, padL = 46, padR = 52, padT = 4;
  const H = padT + probs.length * (barH + gap);

  const svg = d3.select(container).append('svg').attr('width', W).attr('height', H);
  const xS = d3.scaleLinear().domain([0, 1]).range([padL, W - padR]);

  probs.forEach((p, i) => {
    const y = padT + i * (barH + gap);
    const isHL = i === highlight;

    svg.append('rect').attr('x', padL).attr('y', y)
      .attr('width', W - padL - padR).attr('height', barH)
      .attr('fill', 'rgba(255,255,255,0.04)').attr('rx', 5);

    svg.append('rect').attr('x', padL).attr('y', y)
      .attr('width', 0).attr('height', barH)
      .attr('fill', isHL ? '#f4d8ab' : color).attr('rx', 5).attr('opacity', isHL ? 1 : 0.75)
      .transition().duration(400).attr('width', xS(p) - padL);

    svg.append('text').attr('x', padL - 4).attr('y', y + barH / 2)
      .attr('text-anchor', 'end').attr('dominant-baseline', 'middle')
      .attr('fill', isHL ? '#f4d8ab' : '#97afbb').attr('font-size', 10)
      .attr('font-weight', isHL ? 700 : 400)
      .attr('font-family', 'Space Grotesk, sans-serif').text(labels[i]);

    svg.append('text').attr('x', xS(p) + 4).attr('y', y + barH / 2)
      .attr('dominant-baseline', 'middle').attr('fill', '#f4d8ab')
      .attr('font-size', 9).attr('font-family', 'IBM Plex Mono, monospace')
      .text((p * 100).toFixed(1) + '%');
  });
}

function renderDistKL(containerId, teacher, student, labels) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';

  const perClass = teacher.map((p, i) =>
    p > 1e-10 ? p * Math.log(p / (student[i] + 1e-10)) : 0
  );
  const maxKL = Math.max(...perClass, 1e-6);

  const W = Math.max(240, container.clientWidth || 300);
  const barH = 22, gap = 4, padL = 46, padR = 52, padT = 4;
  const H = padT + perClass.length * (barH + gap);
  const svg = d3.select(container).append('svg').attr('width', W).attr('height', H);
  const xS = d3.scaleLinear().domain([0, maxKL]).range([padL, W - padR]);

  perClass.forEach((v, i) => {
    const y = padT + i * (barH + gap);
    const hue = 20 + (v / maxKL) * 30;
    svg.append('rect').attr('x', padL).attr('y', y)
      .attr('width', W - padL - padR).attr('height', barH)
      .attr('fill', 'rgba(255,255,255,0.04)').attr('rx', 5);
    svg.append('rect').attr('x', padL).attr('y', y)
      .attr('width', 0).attr('height', barH)
      .attr('fill', `hsl(${hue},80%,60%)`).attr('rx', 5).attr('opacity', 0.8)
      .transition().duration(400).attr('width', xS(v) - padL);
    svg.append('text').attr('x', padL - 4).attr('y', y + barH / 2)
      .attr('text-anchor', 'end').attr('dominant-baseline', 'middle')
      .attr('fill', '#97afbb').attr('font-size', 10)
      .attr('font-family', 'Space Grotesk, sans-serif').text(labels[i]);
    svg.append('text').attr('x', xS(v) + 4).attr('y', y + barH / 2)
      .attr('dominant-baseline', 'middle').attr('fill', '#f4d8ab')
      .attr('font-size', 9).attr('font-family', 'IBM Plex Mono, monospace')
      .text(v.toFixed(4));
  });
}

// ══════════════════════════════════════════════════════════════
// 3. QUANTIZATION
// ══════════════════════════════════════════════════════════════
let quantState = { bits: 8, mat: 'WQ', scheme: 'absmax' };

function initQuantization() {
  document.querySelectorAll('#quant-bits-ctrl .head-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#quant-bits-ctrl .head-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      quantState.bits = +btn.dataset.bits;
      document.getElementById('quant-bits-lbl').textContent = quantState.bits;
      renderQuantization();
    });
  });
  document.querySelectorAll('#quant-target .head-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#quant-target .head-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      quantState.mat = btn.dataset.mat;
      renderQuantization();
    });
  });
  document.querySelectorAll('#quant-scheme .head-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#quant-scheme .head-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      quantState.scheme = btn.dataset.scheme;
      renderQuantization();
    });
  });

  // Wait for model to load
  const waitForModel = setInterval(() => {
    if (window.TransformerModel) {
      clearInterval(waitForModel);
      renderQuantization();
    }
  }, 100);
}

function getQuantMatrix() {
  if (!window.model) return null;
  const m = window.model;
  switch (quantState.mat) {
    case 'WQ': return m.WQ[0];
    case 'WO': return m.WO;
    case 'W1': return m.W1;
    default:   return m.WQ[0];
  }
}

function quantizeMatrix(W, bits, scheme) {
  const flat = W.flat();
  const mn = Math.min(...flat), mx = Math.max(...flat);
  const levels = Math.pow(2, bits) - 1;

  let scale, zp;
  if (scheme === 'absmax') {
    const absmax = Math.max(Math.abs(mn), Math.abs(mx));
    scale = absmax / (levels / 2);
    zp = 0;
  } else {
    scale = (mx - mn) / levels;
    zp = Math.round(-mn / scale);
  }

  const quant = W.map(row =>
    row.map(v => Math.max(-(levels / 2), Math.min(levels / 2, Math.round(v / scale) + zp)))
  );
  const dequant = quant.map(row => row.map(q => (q - zp) * scale));
  const error   = W.map((row, i) => row.map((v, j) => v - dequant[i][j]));

  return { quant, dequant, error, scale, zp, levels, mn, mx };
}

function renderQuantization() {
  const W = getQuantMatrix();
  if (!W) return;

  const { bits, scheme } = quantState;
  const { quant, dequant, error, scale, zp, levels, mn, mx } = quantizeMatrix(W, bits, scheme);

  const rows = W.length, cols = W[0].length;
  const rowLbls = Array.from({ length: rows }, (_, i) => `r${i}`);
  const colLbls = Array.from({ length: cols }, (_, i) => `c${i}`);

  drawTechMatrix('canvas-quant-orig', W, rowLbls, colLbls);
  drawTechMatrix('canvas-quant-q', quant, rowLbls, colLbls,
    (v, mn, mx) => {
      // int values: map to blue-white-orange
      const t = (v - mn) / (mx - mn + 1e-9);
      const c = t < 0.5
        ? techLerpColor([14, 52, 99], [255, 255, 255], t * 2)
        : techLerpColor([255, 255, 255], [255, 90, 30], (t - 0.5) * 2);
      return `rgb(${c[0]},${c[1]},${c[2]})`;
    }
  );
  drawTechMatrix('canvas-quant-err', error, rowLbls, colLbls,
    (v, mn, mx, maxAbs) => techErrorColor(v, maxAbs)
  );

  const errFlat  = error.flat();
  const mse      = errFlat.reduce((s, v) => s + v * v, 0) / errFlat.length;
  const maxErr   = Math.max(...errFlat.map(Math.abs));
  const snr      = errFlat.reduce((s, v, i) => s + W.flat()[i] * W.flat()[i], 0) /
                   (mse * errFlat.length + 1e-10);
  const origBytes = rows * cols * 4;
  const quantBytes = bits <= 8 ? rows * cols : rows * cols * 2;
  const compression = origBytes / quantBytes;

  const dimEl = document.getElementById('quant-orig-dim');
  if (dimEl) dimEl.textContent = `${rows} × ${cols}`;

  document.getElementById('quant-insight').innerHTML = techInsight([
    {
      title: `INT${bits} quantization — ${scheme === 'absmax' ? 'AbsMax' : 'Zero-point'} scheme`,
      body: `<div class="metric-grid">
        ${techMetric('Levels', levels)}
        ${techMetric('Scale', scale.toFixed(5))}
        ${techMetric('Zero-point', zp.toFixed(3))}
        ${techMetric('Weight range', `[${mn.toFixed(3)}, ${mx.toFixed(3)}]`)}
      </div>`
    },
    {
      title: 'Error statistics',
      body: `<div class="metric-grid">
        ${techMetric('MSE', mse.toFixed(6))}
        ${techMetric('Max |error|', maxErr.toFixed(5))}
        ${techMetric('SNR (dB)', (10 * Math.log10(snr + 1e-9)).toFixed(1))}
        ${techMetric('RMSE', Math.sqrt(mse).toFixed(5))}
      </div>`
    },
    {
      title: 'Compression',
      body: `<div class="metric-grid">
        ${techMetric('FP32 size', `${origBytes} bytes`)}
        ${techMetric(`INT${bits} size`, `${quantBytes} bytes`)}
        ${techMetric('Compression', `${compression.toFixed(1)}×`)}
        ${techMetric('Memory saving', `${((1 - 1 / compression) * 100).toFixed(0)}%`)}
      </div>`
    },
    {
      title: '💡 Quantization intuition',
      body: `<p>INT${bits} maps each float to one of <strong>${levels + 1} levels</strong>.
             The <em>scale</em> is the step size between levels.
             Rounding to the nearest integer introduces error bounded by ±scale/2 = ±${(scale / 2).toFixed(4)}.
             ${bits <= 4
               ? `At ${bits}-bit, rounding noise is significant — techniques like GPTQ or
                  AWQ reorder weights or use per-channel scales to mitigate this.`
               : `INT8 is generally safe for most weight matrices with minimal accuracy loss.`}
             </p>`
    },
  ]);
}

// ══════════════════════════════════════════════════════════════
// 4. LoRA
// ══════════════════════════════════════════════════════════════
let loraState = { rank: 2, alpha: 1.0, mat: 'WQ' };
let loraA = null, loraB = null;

function initLoRA() {
  document.querySelectorAll('#lora-rank-ctrl .head-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#lora-rank-ctrl .head-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      loraState.rank = +btn.dataset.rank;
      loraRandomize();
    });
  });

  document.getElementById('lora-alpha').addEventListener('input', e => {
    loraState.alpha = +e.target.value;
    document.getElementById('lora-alpha-val').textContent = loraState.alpha.toFixed(1);
    renderLoRA();
  });

  document.querySelectorAll('#lora-target .head-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#lora-target .head-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      loraState.mat = btn.dataset.mat;
      loraRandomize();
    });
  });

  document.getElementById('lora-randomize').addEventListener('click', loraRandomize);

  const waitForModel = setInterval(() => {
    if (window.model) {
      clearInterval(waitForModel);
      loraRandomize();
    }
  }, 100);
}

function getLoRABaseMatrix() {
  if (!window.model) return null;
  const m = window.model;
  switch (loraState.mat) {
    case 'WQ': return m.WQ[0];
    case 'WK': return m.WK[0];
    case 'WV': return m.WV[0];
    default:   return m.WQ[0];
  }
}

function loraRandomize() {
  const W0 = getLoRABaseMatrix();
  if (!W0) return;
  const d = W0.length;
  const r = loraState.rank;

  // A ~ N(0, 1/sqrt(r)) — standard LoRA init
  const rng = mulberry32kv(Date.now() & 0xFFFFFF);
  const randn = () => {
    const u = rng() + 1e-10, v = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  loraA = Array.from({ length: d }, () => Array.from({ length: r }, () => randn() * (1 / Math.sqrt(r))));
  loraB = Array.from({ length: r }, () => Array.from({ length: d }, () => randn() * 0.01)); // B init near zero

  renderLoRA();
}

function matMul(A, B) {
  // A: m×k, B: k×n → m×n
  const m = A.length, k = A[0].length, n = B[0].length;
  return Array.from({ length: m }, (_, i) =>
    Array.from({ length: n }, (_, j) =>
      A[i].reduce((s, v, l) => s + v * B[l][j], 0)
    )
  );
}

function matAdd(A, B, scale = 1) {
  return A.map((row, i) => row.map((v, j) => v + scale * B[i][j]));
}

function renderLoRA() {
  const W0 = getLoRABaseMatrix();
  if (!W0 || !loraA || !loraB) return;

  const { rank: r, alpha } = loraState;
  const d = W0.length;

  const delta = matMul(loraA, loraB); // d×r  ×  r×d  =  d×d
  const scaling = alpha / r;
  const Wprime = matAdd(W0, delta, scaling);

  const rowLbls = Array.from({ length: d }, (_, i) => `d${i}`);
  const colLbls = Array.from({ length: d }, (_, i) => `d${i}`);
  const rLbls   = Array.from({ length: r }, (_, i) => `r${i}`);

  drawTechMatrix('canvas-lora-w0',     W0,     rowLbls, colLbls);
  drawTechMatrix('canvas-lora-A',      loraA,  rowLbls, rLbls);
  drawTechMatrix('canvas-lora-B',      loraB,  rLbls,   colLbls);
  drawTechMatrix('canvas-lora-delta',  delta,  rowLbls, colLbls);
  drawTechMatrix('canvas-lora-result', Wprime, rowLbls, colLbls);

  // Update dimension labels
  const w0Dim = document.getElementById('lora-w0-dim');
  const aDim  = document.getElementById('lora-a-dim');
  const bDim  = document.getElementById('lora-b-dim');
  if (w0Dim) w0Dim.textContent = `${d} × ${d}`;
  if (aDim)  aDim.textContent  = `${d} × ${r}`;
  if (bDim)  bDim.textContent  = `${r} × ${d}`;

  // Stats
  const fullParams  = d * d;
  const loraParams  = d * r + r * d;
  const saving      = (1 - loraParams / fullParams) * 100;

  const deltaFlat   = delta.flat();
  const deltaNorm   = Math.sqrt(deltaFlat.reduce((s, v) => s + v * v, 0));
  const w0Norm      = Math.sqrt(W0.flat().reduce((s, v) => s + v * v, 0));
  const relChange   = deltaNorm / w0Norm * scaling;

  const w0Flat      = W0.flat();
  const wpFlat      = Wprime.flat();
  const cosW        = w0Flat.reduce((s, v, i) => s + v * wpFlat[i], 0) /
                      (w0Norm * Math.sqrt(wpFlat.reduce((s, v) => s + v * v, 0)) + 1e-9);

  document.getElementById('lora-insight').innerHTML = techInsight([
    {
      title: `LoRA rank=${r}, α=${alpha} — matrix ${loraState.mat}`,
      body: `<div class="metric-grid">
        ${techMetric('Full W params',   `${d}×${d} = ${fullParams}`)}
        ${techMetric('LoRA A params',   `${d}×${r} = ${d * r}`)}
        ${techMetric('LoRA B params',   `${r}×${d} = ${r * d}`)}
        ${techMetric('Total LoRA params', loraParams)}
      </div>`
    },
    {
      title: 'Parameter savings',
      body: `<div class="metric-grid">
        ${techMetric('Saved params', `${fullParams - loraParams} (${saving.toFixed(1)}%)`)}
        ${techMetric('α/r scaling', scaling.toFixed(3))}
        ${techMetric('‖ΔW‖ (Frobenius)', (deltaNorm * scaling).toFixed(4))}
        ${techMetric('Relative change', `${(relChange * 100).toFixed(2)}%`)}
      </div>`
    },
    {
      title: 'W₀ vs W\' similarity',
      body: `<div class="metric-grid">
        ${techMetric('cos(W₀, W\')',    cosW.toFixed(4))}
        ${techMetric('‖W₀‖',           w0Norm.toFixed(4))}
        ${techMetric('‖W\'‖',          Math.sqrt(wpFlat.reduce((s, v) => s + v * v, 0)).toFixed(4))}
        ${techMetric('Max |ΔW| entry',  Math.max(...deltaFlat.map(Math.abs)).toFixed(4))}
      </div>`
    },
    {
      title: '💡 Why low-rank works',
      body: `<p>Most weight updates during fine-tuning live in a low-dimensional subspace —
             empirically rank r = 4–16 captures most of the useful gradient signal.
             B·A can only express rank-r updates (at most ${r} independent directions
             in d=${d} space), but that's usually enough to adapt to a new task.
             In GPT-3 with d=12288 and r=4: <strong>${((1 - (2 * 12288 * 4) / (12288 * 12288)) * 100).toFixed(2)}%</strong> param saving.</p>`
    },
  ]);
}

// expose model reference from main.js
document.addEventListener('DOMContentLoaded', () => {
  const checkModel = setInterval(() => {
    if (window.model) {
      clearInterval(checkModel);
      renderQuantization();
      loraRandomize();
    }
  }, 150);
});
