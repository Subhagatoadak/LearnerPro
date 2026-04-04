// main.js — Animated transformer visualizer for GitHub Pages

const PRESETS = [
  { label: 'Classic sentence', tokens: ['the', 'cat', 'sat', 'on', 'the', 'mat'] },
  { label: 'Adjective pair',   tokens: ['big', 'small', 'fast', 'red'] },
  { label: 'Action sequence',  tokens: ['the', 'dog', 'ran', 'fast'] },
  { label: 'Minimal pair',     tokens: ['cat', 'dog'] },
  { label: 'Connective',       tokens: ['the', 'cat', 'and', 'dog', 'plays'] },
];

const STEP_IDS = [
  'step-embed', 'step-pe', 'step-attn', 'step-addnorm1', 'step-ffn', 'step-output',
];

// ─── STATE ────────────────────────────────────────────────────
let sequence    = [];
let focusQuery  = 0;
let focusKey    = 1;
let activeHead  = 0;
let blockCount  = 1;
let viewBlock   = 0;
let model       = null;
let lastResult  = null;

// animation state
let animPlaying  = false;
let animStep     = 0;
let animTimerId  = null;
let animSpeed    = 1;        // multiplier

// matmul step state
let mmRow       = 0;
let mmAutoTimer = null;

// multi-block stage state
let stagePlaying   = false;
let stageProgress  = 0;
let stageRafId     = null;
let stageLastTs    = 0;
let resizeTimerId  = null;
let stagePhase     = -1;

const numberTweens = new WeakMap();

// ─── TOOLTIP ──────────────────────────────────────────────────
let ttEl;

function initTooltip() {
  ttEl = document.createElement('div');
  ttEl.className = 'tt';
  document.body.appendChild(ttEl);
  document.addEventListener('mousemove', e => {
    ttEl.style.left = (e.clientX + 14) + 'px';
    ttEl.style.top  = (e.clientY + 14) + 'px';
  });
}

function showTip(html) {
  ttEl.innerHTML = html;
  ttEl.classList.add('visible');
}

function hideTip() {
  ttEl.classList.remove('visible');
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function getActiveBlock(r = lastResult) {
  if (!r?.blocks?.length) return null;
  return r.blocks[clamp(viewBlock, 0, r.blocks.length - 1)];
}

function tweenNumber(el, target, {
  duration = 450,
  decimals = 0,
  prefix = '',
  suffix = '',
} = {}) {
  if (!el) return;
  const previous = parseFloat(el.dataset.currentValue ?? target) || 0;
  const next = Number(target);
  const priorFrame = numberTweens.get(el);
  if (priorFrame) cancelAnimationFrame(priorFrame);

  const start = performance.now();
  const tick = now => {
    const t = clamp((now - start) / duration, 0, 1);
    const eased = 1 - Math.pow(1 - t, 3);
    const value = previous + (next - previous) * eased;
    el.textContent = `${prefix}${value.toFixed(decimals)}${suffix}`;
    if (t < 1) {
      numberTweens.set(el, requestAnimationFrame(tick));
    } else {
      el.dataset.currentValue = String(next);
      numberTweens.delete(el);
    }
  };
  numberTweens.set(el, requestAnimationFrame(tick));
}

function smoothScrollToElement(el, offset = 84) {
  if (!el) return;
  const top = window.scrollY + el.getBoundingClientRect().top - offset;
  window.scrollTo({ top, behavior: 'smooth' });
}

// ─── BOOT ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  model = new TransformerModel();
  window.model = model;   // expose for techniques.js
  initTooltip();
  buildPalette();
  buildPresets();
  wireControls();
  wireAnimPanel();
  wireMatMulButtons();
  wireStackStageControls();
  wireExplainers();
  wireResizeHandler();
  loadPreset(PRESETS[0]);
});

// ─── PALETTE & PRESETS ────────────────────────────────────────
function buildPalette() {
  const palette = document.getElementById('word-palette');
  for (const word of CONFIG.VOCAB) {
    const btn = document.createElement('button');
    btn.className = 'word-chip';
    btn.textContent = word;
    btn.type = 'button';
    btn.title = `Add "${word}" to sequence`;
    btn.addEventListener('click', () => addToken(word));
    palette.appendChild(btn);
  }
}

function buildPresets() {
  const list = document.getElementById('preset-list');
  PRESETS.forEach((p, i) => {
    const btn = document.createElement('button');
    btn.className = 'preset-btn' + (i === 0 ? ' active' : '');
    btn.textContent = p.label;
    btn.type = 'button';
    btn.addEventListener('click', () => {
      document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      loadPreset(p);
    });
    list.appendChild(btn);
  });
}

function loadPreset(p) {
  sequence = [...p.tokens].slice(0, 6);
  run();
}

function addToken(word) {
  if (sequence.length >= 6) return;
  sequence.push(word);
  run();
}

function removeToken(i) {
  sequence.splice(i, 1);
  run();
}

// ─── CONTROLS ─────────────────────────────────────────────────
function wireControls() {
  document.getElementById('btn-clear').onclick = () => {
    sequence = [];
    run();
  };

  document.getElementById('btn-random').onclick = () => {
    const n = 3 + Math.floor(Math.random() * 3);
    const vocab = [...CONFIG.VOCAB];
    sequence = [];
    for (let i = 0; i < n; i++) {
      const idx = Math.floor(Math.random() * vocab.length);
      sequence.push(vocab.splice(idx, 1)[0]);
    }
    run();
  };

  document.getElementById('focus-query').addEventListener('change', e => {
    focusQuery = +e.target.value;
    updateHeroCode();
    if (lastResult) renderAll(lastResult);
  });

  document.getElementById('focus-key').addEventListener('change', e => {
    focusKey = +e.target.value;
    if (lastResult) renderAll(lastResult);
  });

  document.querySelectorAll('.head-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.head-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeHead = +btn.dataset.head;
      document.querySelectorAll('.head-card').forEach((c, i) =>
        c.classList.toggle('active', i === activeHead)
      );
      if (lastResult) renderAll(lastResult);
    });
  });

  document.querySelectorAll('.arch-node').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = document.getElementById(btn.dataset.target);
      if (target) smoothScrollToElement(target, 96);
    });
  });
}

// ─── EXPLAINER ACCORDIONS ─────────────────────────────────────
function wireExplainers() {
  document.querySelectorAll('.explainer-header').forEach(hdr => {
    hdr.addEventListener('click', () => {
      hdr.parentElement.classList.toggle('open');
    });
    hdr.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        hdr.parentElement.classList.toggle('open');
      }
    });
  });
}

// ─── ANIMATION PANEL ──────────────────────────────────────────
function wireAnimPanel() {
  // Build step dots
  const progress = document.getElementById('step-progress');
  STEP_IDS.forEach((_, i) => {
    const dot = document.createElement('div');
    dot.className = 'step-dot';
    dot.id = `sdot-${i}`;
    dot.title = ['Embeddings','PE','Attention','Add+Norm','FFN','Output'][i];
    dot.addEventListener('click', () => goToAnimStep(i));
    progress.appendChild(dot);
  });

  document.getElementById('anim-play').addEventListener('click', togglePlay);
  document.getElementById('anim-prev').addEventListener('click', () => goToAnimStep(animStep - 1));
  document.getElementById('anim-next').addEventListener('click', () => goToAnimStep(animStep + 1));
  document.getElementById('anim-reset').addEventListener('click', () => {
    stopPlay();
    goToAnimStep(0);
  });

  const slider = document.getElementById('anim-speed-slider');
  slider.addEventListener('input', () => {
    animSpeed = +slider.value;
    document.getElementById('anim-speed-val').textContent = `${animSpeed}×`;
  });
}

function showAnimPanel() {
  const panel = document.getElementById('anim-panel');
  panel.style.display = 'flex';
}

function updateStepDots(active) {
  STEP_IDS.forEach((_, i) => {
    const dot = document.getElementById(`sdot-${i}`);
    if (!dot) return;
    dot.classList.remove('active', 'done');
    if (i < active) dot.classList.add('done');
    else if (i === active) dot.classList.add('active');
  });
}

function goToAnimStep(idx) {
  if (idx < 0 || idx >= STEP_IDS.length) return;
  animStep = idx;
  updateStepDots(animStep);

  // scroll to card
  const card = document.getElementById(STEP_IDS[animStep]);
  if (card) {
    smoothScrollToElement(card, Math.max(56, window.innerHeight * 0.12));
    // flash glow
    STEP_IDS.forEach(id => document.getElementById(id)?.classList.remove('anim-active', 'flash'));
    card.classList.add('anim-active', 'flash');
    setTimeout(() => card.classList.remove('flash'), 900);
  }

  // update rail
  document.querySelectorAll('.arch-node').forEach(n =>
    n.classList.toggle('active', n.dataset.target === STEP_IDS[animStep])
  );
}

function togglePlay() {
  animPlaying ? stopPlay() : startPlay();
}

function startPlay() {
  animPlaying = true;
  document.getElementById('anim-play').textContent = '⏸ Pause';
  document.getElementById('anim-play').classList.add('playing');
  scheduleNextStep();
}

function stopPlay() {
  animPlaying = false;
  document.getElementById('anim-play').textContent = '▶ Play tour';
  document.getElementById('anim-play').classList.remove('playing');
  if (animTimerId) clearTimeout(animTimerId);
}

function scheduleNextStep() {
  if (!animPlaying) return;
  const delay = 2200 / animSpeed;
  animTimerId = setTimeout(() => {
    if (animStep < STEP_IDS.length - 1) {
      goToAnimStep(animStep + 1);
      scheduleNextStep();
    } else {
      stopPlay();
    }
  }, delay);
}

// ─── MATMUL VISUALIZER ────────────────────────────────────────
let mmData = null;   // { X, W, result, tokenLabels, dimLabels }

function buildMatMulDisplay() {
  const block = getActiveBlock();
  if (!lastResult || !block) return;
  const h = block.heads[activeHead];
  const params = model.blocks[clamp(viewBlock, 0, model.blocks.length - 1)];
  const X = block.input;                 // seq × d_model
  const W = params.WQ[activeHead];       // d_model × d_head
  const result = h.Q;                    // seq × d_head

  mmData = {
    X, W, result,
    tokenLabels: lastResult.tokens,
    rowDims:  X[0].map((_, i) => `d${i}`),
    colDims:  result[0].map((_, i) => `h${i}`),
    blockIndex: viewBlock,
  };
  renderMatMul();
}

function renderMatMul() {
  if (!mmData) return;
  const container = document.getElementById('matmul-display');
  if (!container) return;
  container.innerHTML = '';

  const { X, W, result, tokenLabels, rowDims, colDims } = mmData;
  const seq = X.length;
  const dModel = X[0].length;
  const dHead = result[0].length;
  const curRow = Math.min(mmRow, seq - 1);

  // Show: x_row · W = q_row
  const xVec = X[curRow];
  const qVec = result[curRow];

  const wrap = document.createElement('div');
  wrap.className = 'matmul-equation';

  // x[token] row vector
  const xDiv = matrixHTML(
    [xVec.map(v => v.toFixed(2))],
    null, rowDims,
    () => 'matmul-cell-hi',
    `Block ${mmData.blockIndex + 1} input row`
  );

  // W matrix — highlight the relevant column
  const wDiv = matrixHTML(
    W.map(row => row.map(v => v.toFixed(2))),
    rowDims, colDims,
    (_ri, ci) => ci === 0 ? 'matmul-cell-hi' : '',
    'W_Q'
  );

  // = result
  const qDiv = matrixHTML(
    [qVec.map(v => v.toFixed(2))],
    null, colDims,
    (_ri, ci) => ci === 0 ? 'matmul-cell-dot' : '',
    `Q row for "${tokenLabels[curRow]}"`
  );

  const eq1 = document.createElement('span');
  eq1.className = 'matmul-op';
  eq1.textContent = '×';

  const eq2 = document.createElement('span');
  eq2.className = 'matmul-op';
  eq2.textContent = '=';

  wrap.appendChild(xDiv);
  wrap.appendChild(eq1);
  wrap.appendChild(wDiv);
  wrap.appendChild(eq2);
  wrap.appendChild(qDiv);
  container.appendChild(wrap);

  // Compute dot product for first output dim as example
  const contributions = xVec.map((v, i) => ({
    dim: rowDims[i],
    x: v,
    w: W[i][0],
    out: v * W[i][0],
  }));
  const dotEx = contributions.reduce((sum, item) => sum + item.out, 0);

  const detail = document.createElement('div');
  detail.className = 'matmul-detail';
  detail.innerHTML =
    `<p>Q[${curRow}][0] accumulates animated contributions for
      <span class="token-chip-inline">${tokenLabels[curRow]}</span> inside block ${mmData.blockIndex + 1}.</p>`;
  container.appendChild(detail);

  const trace = document.createElement('div');
  trace.className = 'matmul-trace';
  contributions.forEach((item, idx) => {
    const chip = document.createElement('div');
    chip.className = 'matmul-trace-chip';
    chip.style.animationDelay = `${idx * 70}ms`;
    chip.innerHTML =
      `<strong>${item.dim}</strong>` +
      `<span>${item.x.toFixed(2)} × ${item.w.toFixed(2)}</span>` +
      `<em>= ${item.out.toFixed(3)}</em>`;
    trace.appendChild(chip);
  });
  container.appendChild(trace);

  const sumLine = document.createElement('div');
  sumLine.className = 'matmul-sum';
  sumLine.innerHTML =
    `<span>Animated dot-product total</span>` +
    `<strong class="matmul-result" id="matmul-dot-result">0.0000</strong>`;
  container.appendChild(sumLine);
  tweenNumber(document.getElementById('matmul-dot-result'), dotEx, { decimals: 4, duration: 700 });

  // update nav buttons
  const prev = document.getElementById('mm-prev');
  const next = document.getElementById('mm-next');
  if (prev) prev.disabled = curRow <= 0;
  if (next) next.disabled = curRow >= seq - 1;
}

function matrixHTML(rows, rowLabels, colLabels, cellClass, title) {
  const div = document.createElement('div');
  div.className = 'matmul-matrix';

  if (title) {
    const h = document.createElement('p');
    h.style.cssText = 'margin:0 0 6px;font-size:0.8rem;color:#8ef2ca';
    h.textContent = title;
    div.appendChild(h);
  }

  const table = document.createElement('table');

  // col header
  if (colLabels) {
    const tr = document.createElement('tr');
    if (rowLabels) tr.appendChild(document.createElement('td'));
    colLabels.forEach(lbl => {
      const th = document.createElement('td');
      th.style.cssText = 'color:#97afbb;font-size:0.75rem;text-align:center;padding:2px 5px';
      th.textContent = lbl;
      tr.appendChild(th);
    });
    table.appendChild(tr);
  }

  rows.forEach((row, ri) => {
    const tr = document.createElement('tr');
    if (rowLabels) {
      const th = document.createElement('td');
      th.style.cssText = 'color:#97afbb;font-size:0.75rem;padding-right:6px';
      th.textContent = rowLabels[ri];
      tr.appendChild(th);
    }
    row.forEach((val, ci) => {
      const td = document.createElement('td');
      const cls = cellClass ? cellClass(ri, ci) : '';
      if (cls) td.className = cls;
      td.textContent = val;
      tr.appendChild(td);
    });
    table.appendChild(tr);
  });

  div.appendChild(table);
  return div;
}

function wireMatMulButtons() {
  const prev = document.getElementById('mm-prev');
  const next = document.getElementById('mm-next');
  const auto = document.getElementById('mm-auto');
  if (!prev) return;

  prev.onclick = () => {
    mmRow = Math.max(0, mmRow - 1);
    renderMatMul();
  };
  next.onclick = () => {
    if (lastResult) mmRow = Math.min(lastResult.tokens.length - 1, mmRow + 1);
    renderMatMul();
  };
  auto.onclick = () => {
    if (mmAutoTimer) { clearInterval(mmAutoTimer); mmAutoTimer = null; auto.textContent = '▶ Auto-play'; return; }
    auto.textContent = '⏸ Stop';
    mmAutoTimer = setInterval(() => {
      if (!lastResult) return;
      mmRow = (mmRow + 1) % lastResult.tokens.length;
      renderMatMul();
      if (mmRow === 0) { clearInterval(mmAutoTimer); mmAutoTimer = null; auto.textContent = '▶ Auto-play'; }
    }, 1200);
  };
}

// ─── FOCUS SELECTS ────────────────────────────────────────────
function updateFocusSelects() {
  const selQ = document.getElementById('focus-query');
  const selK = document.getElementById('focus-key');
  const prevQ = +selQ.value;
  const prevK = +selK.value;

  [selQ, selK].forEach(sel => {
    sel.innerHTML = '';
    sequence.forEach((tok, i) => {
      const opt = document.createElement('option');
      opt.value = i;
      opt.textContent = `[${i}] ${tok}`;
      sel.appendChild(opt);
    });
  });

  focusQuery = Math.min(Math.max(prevQ, 0), sequence.length - 1);
  focusKey   = Math.min(Math.max(prevK, 0), sequence.length - 1);
  if (focusKey === focusQuery && sequence.length > 1) {
    focusKey = (focusQuery + 1) % sequence.length;
  }
  selQ.value = focusQuery;
  selK.value = focusKey;
}

// ─── MAIN RUN ─────────────────────────────────────────────────
function run() {
  renderSequenceTokens();
  updateStats();

  const pipeline = document.querySelector('.pipeline');
  pipeline.classList.remove('ready');

  if (sequence.length < 2) {
    lastResult = null;
    pipeline.classList.add('is-empty');
    document.getElementById('live-status').textContent = 'Pick at least 2 tokens';
    document.getElementById('sequence-shape').textContent =
      `${sequence.length} token${sequence.length !== 1 ? 's' : ''}`;
    document.getElementById('anim-panel').style.display = 'none';
    document.getElementById('stack-stage').innerHTML = '';
    document.getElementById('stack-active-label').textContent = `Viewing block 1 of ${blockCount}`;
    document.getElementById('stack-stage-status').textContent = 'Input + PE';
    document.getElementById('stack-focus-shift').textContent = 'Focus token shift: 0.000';
    stopStagePlay();
    updateHeroCode();
    return;
  }

  pipeline.classList.remove('is-empty');
  document.getElementById('live-status').textContent = 'Live — all calculations updated';
  document.getElementById('sequence-shape').textContent =
    `${sequence.length} × ${CONFIG.D_MODEL}`;

  updateFocusSelects();
  lastResult = model.forward(sequence, blockCount);
  viewBlock = clamp(viewBlock, 0, lastResult.blocks.length - 1);
  stageProgress = clamp(stageProgress || 0, 0, lastResult.numBlocks + 1);
  mmRow = 0;
  updateHeroCode();

  requestAnimationFrame(() => {
    renderAll(lastResult);
    buildMatMulDisplay();
    showAnimPanel();
    requestAnimationFrame(() => pipeline.classList.add('ready'));
  });
}

function redrawCurrentView() {
  if (!lastResult) {
    updateHeroCode();
    return;
  }
  updateStats();
  updateHeroCode();
  renderAll(lastResult);
  buildMatMulDisplay();
}

function wireResizeHandler() {
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimerId);
    resizeTimerId = setTimeout(() => {
      redrawCurrentView();
    }, 120);
  });
}

function wireStackStageControls() {
  const blockSlider = document.getElementById('block-count');
  const scrub = document.getElementById('stack-scrub');

  blockSlider.addEventListener('input', () => {
    const nextCount = +blockSlider.value;
    if (nextCount === blockCount) return;
    blockCount = nextCount;
    viewBlock = clamp(viewBlock, 0, blockCount - 1);
    stageProgress = clamp(stageProgress, 0, blockCount + 1);
    stopStagePlay();
    updateStats();
    syncStageScrubber();
    run();
  });

  scrub.addEventListener('input', () => {
    stageProgress = +scrub.value;
    stopStagePlay();
    syncStageState();
    renderStackStage(lastResult);
  });

  document.getElementById('stack-play').onclick = () => {
    stagePlaying ? stopStagePlay() : startStagePlay();
  };
  document.getElementById('stack-prev').onclick = () => {
    stopStagePlay();
    if (!lastResult) return;
    setViewBlock(viewBlock - 1, { syncStage: true });
  };
  document.getElementById('stack-next').onclick = () => {
    stopStagePlay();
    if (!lastResult) return;
    setViewBlock(viewBlock + 1, { syncStage: true });
  };

  updateStats();
  syncStageScrubber();
}

function syncStageScrubber() {
  const scrub = document.getElementById('stack-scrub');
  if (!scrub) return;
  scrub.max = String(blockCount + 1);
  scrub.value = String(stageProgress);
  document.getElementById('block-count').value = String(blockCount);
  document.getElementById('block-count-label').textContent =
    `${blockCount} block${blockCount !== 1 ? 's' : ''}`;
}

function getStageStatusLabel(progress = stageProgress, total = blockCount) {
  if (!total) return 'Input + PE';
  if (progress < 0.5) return 'Input + PE';
  if (progress >= total + 0.5) return 'Final output';
  const blockIdx = clamp(Math.round(progress) - 1, 0, total - 1);
  return `Block ${blockIdx + 1} focus`;
}

function syncStageState() {
  if (!lastResult) return;
  const total = lastResult.numBlocks;
  const nextPhase = stageProgress < 0.5
    ? -1
    : stageProgress >= total + 0.5
      ? total
      : clamp(Math.round(stageProgress) - 1, 0, total - 1);

  if (nextPhase !== stagePhase && nextPhase >= 0 && nextPhase < total) {
    stagePhase = nextPhase;
    setViewBlock(nextPhase, { syncStage: false });
  } else if (nextPhase !== stagePhase) {
    stagePhase = nextPhase;
  }

  document.getElementById('stack-stage-status').textContent = getStageStatusLabel(stageProgress, total);
  syncStageScrubber();
}

function startStagePlay() {
  if (!lastResult) return;
  stagePlaying = true;
  stageLastTs = 0;
  document.getElementById('stack-play').textContent = '⏸ Pause stack';
  document.getElementById('stack-play').classList.add('playing');
  const duration = 3600 + lastResult.numBlocks * 700;

  const tick = ts => {
    if (!stagePlaying) return;
    if (!stageLastTs) stageLastTs = ts;
    const delta = ts - stageLastTs;
    stageLastTs = ts;
    const advance = (delta / duration) * (lastResult.numBlocks + 1);
    stageProgress = clamp(stageProgress + advance, 0, lastResult.numBlocks + 1);
    syncStageState();
    renderStackStage(lastResult);
    if (stageProgress >= lastResult.numBlocks + 1) {
      stopStagePlay();
      return;
    }
    stageRafId = requestAnimationFrame(tick);
  };

  stageRafId = requestAnimationFrame(tick);
}

function stopStagePlay() {
  stagePlaying = false;
  stageLastTs = 0;
  if (stageRafId) cancelAnimationFrame(stageRafId);
  stageRafId = null;
  const btn = document.getElementById('stack-play');
  if (btn) {
    btn.textContent = '▶ Play stack';
    btn.classList.remove('playing');
  }
}

function setViewBlock(idx, { syncStage = false } = {}) {
  if (!lastResult?.blocks?.length) return;
  const next = clamp(idx, 0, lastResult.blocks.length - 1);
  if (viewBlock === next && !syncStage) return;
  viewBlock = next;
  if (syncStage) {
    stageProgress = next + 1;
    stagePhase = next;
    syncStageScrubber();
    document.getElementById('stack-stage-status').textContent = getStageStatusLabel(stageProgress, lastResult.numBlocks);
  }
  redrawCurrentView();
}

function renderStackStage(r) {
  const container = document.getElementById('stack-stage');
  if (!container) return;
  container.innerHTML = '';
  if (!r?.blocks?.length) return;

  const fq = clamp(focusQuery, 0, r.tokens.length - 1);
  const finalVec = r.finalOutput[fq];
  const baseVec = r.withPE[fq];
  const focusShift = Math.sqrt(finalVec.reduce((sum, value, idx) => sum + (value - baseVec[idx]) ** 2, 0));
  document.getElementById('stack-active-label').textContent =
    `Viewing block ${viewBlock + 1} of ${r.numBlocks}`;
  document.getElementById('stack-focus-shift').textContent =
    `Focus token shift: ${focusShift.toFixed(3)}`;

  const frame = document.createElement('div');
  frame.className = 'stack-stage-frame';
  frame.style.setProperty('--stage-stops', String(r.numBlocks + 2));
  frame.style.setProperty('--stage-progress', String(stageProgress));
  container.appendChild(frame);

  const grid = document.createElement('div');
  grid.className = 'stack-stage-grid';
  frame.appendChild(grid);

  const inputCard = document.createElement('div');
  inputCard.className = 'stack-node input';
  inputCard.innerHTML =
    `<span class="stack-node-eyebrow">Input</span>` +
    `<strong>Embedding + position</strong>` +
    `<small>${r.tokens.length} tokens enter the stack</small>`;
  grid.appendChild(inputCard);

  r.blocks.forEach((block, idx) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'stack-node stack-block' + (idx === viewBlock ? ' active' : '');
    const delta = Math.sqrt(block.output[fq].reduce((sum, value, dim) =>
      sum + (value - block.input[fq][dim]) ** 2, 0
    ));
    button.innerHTML =
      `<span class="stack-node-eyebrow">Block ${idx + 1}</span>` +
      `<strong>Attention → FFN</strong>` +
      `<small>focus Δ ${delta.toFixed(3)}</small>` +
      `<div class="stack-block-bars"><span></span><span></span></div>`;
    button.onclick = () => {
      stopStagePlay();
      setViewBlock(idx, { syncStage: true });
    };
    grid.appendChild(button);
  });

  const outputCard = document.createElement('div');
  outputCard.className = 'stack-node output';
  outputCard.innerHTML =
    `<span class="stack-node-eyebrow">Output</span>` +
    `<strong>Contextual vectors</strong>` +
    `<small>${r.numBlocks} stacked block${r.numBlocks !== 1 ? 's' : ''}</small>`;
  grid.appendChild(outputCard);

  const beam = document.createElement('div');
  beam.className = 'stack-beam';
  beam.style.left = `calc(${(stageProgress / (r.numBlocks + 1)) * 100}% - 48px)`;
  frame.appendChild(beam);

  const packetLayer = document.createElement('div');
  packetLayer.className = 'stack-packets';
  frame.appendChild(packetLayer);

  r.tokens.forEach((token, idx) => {
    const packet = document.createElement('button');
    packet.type = 'button';
    packet.className = 'stack-packet' + (idx === fq ? ' focus' : '');
    const baseHue = 190 + idx * 16;
    const xPct = (stageProgress / (r.numBlocks + 1)) * 100;
    const y = 66 + (idx % 3) * 64 + Math.floor(idx / 3) * 8;
    packet.style.left = `${xPct}%`;
    packet.style.top = `${y}px`;
    packet.style.setProperty('--packet-color', `hsl(${baseHue} 78% 64%)`);
    packet.style.setProperty('--packet-delay', `${idx * 70}ms`);
    packet.innerHTML = `<span class="stack-packet-word">${token}</span><span class="stack-packet-pos">t${idx}</span>`;
    packet.onclick = () => {
      focusQuery = idx;
      if (focusKey === idx && r.tokens.length > 1) focusKey = (idx + 1) % r.tokens.length;
      updateFocusSelects();
      redrawCurrentView();
    };
    packetLayer.appendChild(packet);
  });

  syncStageState();
}

function renderSequenceTokens() {
  const container = document.getElementById('sequence-tokens');
  container.innerHTML = '';
  if (sequence.length === 0) {
    const p = document.createElement('p');
    p.className = 'seq-placeholder';
    p.textContent = 'Click words from the palette to build your sequence…';
    container.appendChild(p);
    return;
  }
  sequence.forEach((tok, i) => {
    const chip = document.createElement('span');
    chip.className = 'seq-token';
    chip.innerHTML =
      `<span class="seq-pos">${i}</span>${tok}` +
      `<button class="seq-remove" type="button" title="Remove">×</button>`;
    chip.querySelector('.seq-remove').addEventListener('click', () => removeToken(i));
    container.appendChild(chip);
  });
}

function updateStats() {
  tweenNumber(document.getElementById('stat-token-count'), sequence.length, { duration: 400 });
  tweenNumber(document.getElementById('stat-block-count'), blockCount, { duration: 400 });
  document.getElementById('stat-shape').textContent = `${sequence.length} x ${CONFIG.D_MODEL}`;
  document.getElementById('hero-stack-badge').textContent =
    blockCount === 1 ? 'Single Transformer Block' : `${blockCount} Transformer Blocks`;
  document.getElementById('block-count-label').textContent =
    `${blockCount} block${blockCount !== 1 ? 's' : ''}`;
}

function updateHeroCode() {
  document.getElementById('hero-sequence-code').textContent = JSON.stringify(sequence);
  const out = document.getElementById('hero-output-code');
  if (!lastResult || sequence.length < 2) {
    out.textContent = '[]';
    return;
  }
  const fq = clamp(focusQuery, 0, lastResult.tokens.length - 1);
  const vec = lastResult.finalOutput[fq];
  out.textContent = `${lastResult.tokens[fq]} → [${vec.slice(0, 4).map(v => v.toFixed(2)).join(', ')}, …]`;
}

// ─── RENDER ALL ───────────────────────────────────────────────
function renderAll(r) {
  renderStackStage(r);
  renderEmbedStep(r);
  renderPEStep(r);
  renderAttnStep(r);
  renderAddNorm1Step(r);
  renderFFNStep(r);
  renderOutputStep(r);
  startArchRailObserver();
  updateStepDots(animStep);
  updateHeroCode();
}

// ─── COLOR UTILS ──────────────────────────────────────────────
function lerpColor(a, b, t) {
  t = Math.max(0, Math.min(1, t));
  return a.map((v, i) => Math.round(v + (b[i] - v) * t));
}

function divergeColor(v, mn, mx) {
  const t = (v - mn) / (mx - mn + 1e-9);
  const c = t < 0.5
    ? lerpColor([14, 52, 99], [255, 255, 255], t * 2)
    : lerpColor([255, 255, 255], [255, 90, 30], (t - 0.5) * 2);
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

function plasmaColor(t) {
  const stops = [
    [13, 8, 135], [84, 2, 163], [139, 10, 165],
    [185, 50, 137], [219, 92, 104], [244, 136, 73],
    [254, 188, 43], [252, 253, 191],
  ];
  const idx = t * (stops.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.min(lo + 1, stops.length - 1);
  return lerpColor(stops[lo], stops[hi], idx - lo);
}

// ─── CANVAS HEATMAP ───────────────────────────────────────────
function drawMatrix(canvasId, matrix, rowLabels, colLabels) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || !matrix || matrix.length === 0) return;

  const rows = matrix.length;
  const cols = matrix[0].length;
  const parentWidth = canvas.parentElement?.clientWidth || 480;
  const avW  = Math.max(180, parentWidth - 20);
  const maxRowLabel = rowLabels?.reduce((max, lbl) => Math.max(max, String(lbl).length), 0) || 0;
  const padL  = rowLabels ? clamp(30 + maxRowLabel * 4, 34, 62) : 8;
  const padT  = colLabels ? 26 : 6;
  const maxCellW = Math.floor((avW - padL - 4) / cols);
  const cellW = clamp(maxCellW, 12, 52);
  const cellH = clamp(Math.floor(260 / rows), 16, 44);
  const W = padL + cols * cellW + 4;
  const H = padT + rows * cellH + 4;
  const dpr = window.devicePixelRatio || 1;

  canvas.width  = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width  = W + 'px';
  canvas.style.height = H + 'px';

  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, W, H);

  const flat = matrix.flat();
  const mn = Math.min(...flat);
  const mx = Math.max(...flat);

  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      ctx.fillStyle = divergeColor(matrix[i][j], mn, mx);
      ctx.beginPath();
      ctx.roundRect(padL + j * cellW + 1, padT + i * cellH + 1, cellW - 2, cellH - 2, 4);
      ctx.fill();
    }
  }

  if (rowLabels) {
    ctx.font = `${Math.min(10, cellH - 5)}px IBM Plex Mono, monospace`;
    ctx.fillStyle = '#97afbb';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    rowLabels.forEach((lbl, i) => {
      const s = String(lbl);
      ctx.fillText(s.length > 6 ? s.slice(0, 5) + '…' : s, padL - 5, padT + i * cellH + cellH / 2);
    });
  }

  if (colLabels) {
    ctx.font = `${Math.min(9, cellW - 4)}px IBM Plex Mono, monospace`;
    ctx.fillStyle = '#97afbb';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    colLabels.forEach((lbl, j) => {
      ctx.fillText(lbl, padL + j * cellW + cellW / 2, padT - 5);
    });
  }

  if (cellW >= 28 && cellH >= 13) {
    ctx.font = `9px IBM Plex Mono, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        const v = matrix[i][j];
        const t = (v - mn) / (mx - mn + 1e-9);
        ctx.fillStyle = t < 0.45 ? 'rgba(220,240,255,0.75)' : 'rgba(10,20,30,0.75)';
        ctx.fillText(v.toFixed(1), padL + j * cellW + cellW / 2, padT + i * cellH + cellH / 2);
      }
    }
  }

  // Update dimension badge
  const dimEl = canvas.parentElement?.querySelector('.mat-dim');
  if (dimEl) dimEl.textContent = `${rows} × ${cols}`;

  // Canvas hover tooltip
  addCanvasTip(canvas, matrix, rowLabels, colLabels, padL, padT, cellW, cellH);
}

function addCanvasTip(canvas, matrix, rowLabels, colLabels, padL, padT, cellW, cellH) {
  canvas.onmousemove = e => {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const j = Math.floor((mx - padL) / cellW);
    const i = Math.floor((my - padT) / cellH);
    if (i >= 0 && i < matrix.length && j >= 0 && j < matrix[0].length) {
      const rLbl = rowLabels ? rowLabels[i] : `row ${i}`;
      const cLbl = colLabels ? colLabels[j] : `col ${j}`;
      showTip(`<strong>${rLbl}</strong> × <strong>${cLbl}</strong><br>${matrix[i][j].toFixed(5)}`);
    } else {
      hideTip();
    }
  };
  canvas.onmouseleave = hideTip;
}

// ─── D3 ANIMATED BAR CHART ────────────────────────────────────
function drawBarChart(containerId, values, dimLabels) {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = '';
  const W = Math.max(240, container.clientWidth || 320);
  const barH = 20, gap = 5;
  const padL = 40, padR = 62, padT = 4, padB = 4;
  const H = padT + values.length * (barH + gap) + padB;
  const maxAbs = Math.max(...values.map(Math.abs), 1e-6);
  const xS = d3.scaleLinear().domain([-maxAbs, maxAbs]).range([padL, W - padR]);
  const svg = d3.select(container).append('svg').attr('width', W).attr('height', H);

  svg.append('line')
    .attr('x1', xS(0)).attr('y1', padT).attr('x2', xS(0)).attr('y2', H - padB)
    .attr('stroke', 'rgba(255,255,255,0.12)').attr('stroke-width', 1);

  values.forEach((v, i) => {
    const y = padT + i * (barH + gap);
    const x0 = Math.min(xS(0), xS(v));
    const width = Math.abs(xS(v) - xS(0));
    const tx = clamp(xS(v) + (v >= 0 ? 5 : -5), padL + 8, W - 34);

    svg.append('rect')
      .attr('x', padL).attr('y', y).attr('width', W - padL - padR).attr('height', barH)
      .attr('fill', 'rgba(255,255,255,0.04)').attr('rx', 5);

    svg.append('rect')
      .attr('x', x0).attr('y', y)
      .attr('width', 0).attr('height', barH)
      .attr('fill', v >= 0 ? '#60d7ff' : '#ff8f4d').attr('rx', 4).attr('opacity', 0.82)
      .transition().duration(420).delay(i * 30)
      .attr('width', width);

    svg.append('text')
      .attr('x', padL - 5).attr('y', y + barH / 2)
      .attr('text-anchor', 'end').attr('dominant-baseline', 'middle')
      .attr('fill', '#97afbb').attr('font-size', 10)
      .attr('font-family', 'IBM Plex Mono, monospace')
      .text(dimLabels ? dimLabels[i] : `d${i}`);

    svg.append('text')
      .attr('x', tx).attr('y', y + barH / 2)
      .attr('text-anchor', v >= 0 ? 'start' : 'end').attr('dominant-baseline', 'middle')
      .attr('fill', '#f4d8ab').attr('font-size', 9)
      .attr('font-family', 'IBM Plex Mono, monospace').text(v.toFixed(3));
  });
}

// ─── MINI STACKED BAR ─────────────────────────────────────────
function appendMiniBar(container, vec, label, color) {
  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'margin-bottom:12px';
  const p = document.createElement('p');
  p.style.cssText = 'margin:0 0 5px;color:#97afbb;font-size:0.8rem';
  p.textContent = label;
  wrapper.appendChild(p);
  const inner = document.createElement('div');
  wrapper.appendChild(inner);
  container.appendChild(wrapper);

  const W = Math.max(240, container.clientWidth || 340);
  const barH = 12, gap = 3, padL = 32, padR = 52;
  const maxAbs = Math.max(...vec.map(Math.abs), 1e-6);
  const H = vec.length * (barH + gap) + 6;
  const svg = d3.select(inner).append('svg').attr('width', W).attr('height', H);
  const xS = d3.scaleLinear().domain([-maxAbs, maxAbs]).range([padL, W - padR]);

  svg.append('line')
    .attr('x1', xS(0)).attr('y1', 0).attr('x2', xS(0)).attr('y2', H)
    .attr('stroke', 'rgba(255,255,255,0.1)').attr('stroke-width', 1);

  vec.forEach((v, i) => {
    const y = 3 + i * (barH + gap);
    const x0 = xS(0), x1 = xS(v);
    svg.append('rect').attr('x', padL).attr('y', y)
      .attr('width', W - padL - padR).attr('height', barH)
      .attr('fill', 'rgba(255,255,255,0.04)').attr('rx', 3);
    svg.append('rect').attr('class', `mbar-${i}`)
      .attr('x', Math.min(x0, x1)).attr('y', y)
      .attr('width', Math.abs(x1 - x0)).attr('height', barH)
      .attr('fill', color).attr('rx', 3).attr('opacity', 0)
      .transition().duration(400).delay(i * 25).attr('opacity', 0.78);
    svg.append('text')
      .attr('x', padL - 3).attr('y', y + barH / 2)
      .attr('text-anchor', 'end').attr('dominant-baseline', 'middle')
      .attr('fill', '#7a9baa').attr('font-size', 8)
      .attr('font-family', 'IBM Plex Mono, monospace').text(`d${i}`);
    svg.append('text')
      .attr('x', clamp(x1 + (v >= 0 ? 3 : -3), padL + 6, W - 26)).attr('y', y + barH / 2)
      .attr('text-anchor', v >= 0 ? 'start' : 'end').attr('dominant-baseline', 'middle')
      .attr('fill', '#f4d8ab').attr('font-size', 8)
      .attr('font-family', 'IBM Plex Mono, monospace').text(v.toFixed(2));
  });
}

// ─── D3 ATTENTION HEATMAP ─────────────────────────────────────
function drawAttnHeatmap(containerId, weights, tokens) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';

  const n = tokens.length;
  const avail = Math.max(220, container.clientWidth || 320);
  const cellSize = Math.min(52, Math.floor((avail - 80) / n));
  const padL = 70, padT = 50;
  const W = padL + n * cellSize + 10;
  const H = padT + n * cellSize + 28;

  const svg = d3.select(container).append('svg').attr('width', W).attr('height', H);

  tokens.forEach((tok, j) => {
    svg.append('text')
      .attr('x', padL + j * cellSize + cellSize / 2).attr('y', padT - 10)
      .attr('text-anchor', 'middle').attr('fill', '#97afbb')
      .attr('font-size', 11).attr('font-family', 'Space Grotesk, sans-serif').text(tok);
  });

  tokens.forEach((tok, i) => {
    svg.append('text')
      .attr('x', padL - 8).attr('y', padT + i * cellSize + cellSize / 2)
      .attr('text-anchor', 'end').attr('dominant-baseline', 'middle')
      .attr('fill', '#97afbb').attr('font-size', 11)
      .attr('font-family', 'Space Grotesk, sans-serif').text(tok);
  });

  weights.forEach((row, i) => {
    row.forEach((w, j) => {
      const pc = plasmaColor(w);
      const cell = svg.append('rect')
        .attr('x', padL + j * cellSize).attr('y', padT + i * cellSize)
        .attr('width', cellSize - 2).attr('height', cellSize - 2).attr('rx', 7)
        .attr('fill', `rgb(${pc[0]},${pc[1]},${pc[2]})`)
        .attr('opacity', 0);

      // staggered fade-in
      cell.transition().duration(350).delay((i * n + j) * 18).attr('opacity', 1);

      // hover tooltip
      cell.on('mouseover', (event) => {
        showTip(`Q: <strong>${tokens[i]}</strong> → K: <strong>${tokens[j]}</strong><br>attn weight: <strong>${w.toFixed(4)}</strong>`);
      }).on('mouseout', hideTip);

      if (cellSize >= 28) {
        svg.append('text')
          .attr('x', padL + j * cellSize + cellSize / 2)
          .attr('y', padT + i * cellSize + cellSize / 2)
          .attr('text-anchor', 'middle').attr('dominant-baseline', 'middle')
          .attr('fill', w > 0.45 ? '#000' : '#fff')
          .attr('font-size', 10).attr('font-family', 'IBM Plex Mono, monospace')
          .attr('pointer-events', 'none')
          .text(w.toFixed(2));
      }
    });
  });

  svg.append('text').attr('x', padL + (n * cellSize) / 2).attr('y', H - 4)
    .attr('text-anchor', 'middle').attr('fill', '#6a8a9a').attr('font-size', 10).text('Key →');
  svg.append('text')
    .attr('transform', `translate(10,${padT + (n * cellSize) / 2}) rotate(-90)`)
    .attr('text-anchor', 'middle').attr('fill', '#6a8a9a').attr('font-size', 10).text('Query →');
}

// ─── D3 ATTENTION FLOW ────────────────────────────────────────
function drawAttnFlow(containerId, weights, tokens, queryIdx) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';

  const n = tokens.length;
  const W = Math.max(280, container.clientWidth || 600);
  const H = 220;
  const padX = 55;
  const step = n <= 1 ? 0 : (W - 2 * padX) / (n - 1);

  const svg = d3.select(container).append('svg').attr('width', W).attr('height', H);

  svg.append('rect').attr('width', W).attr('height', H)
    .attr('fill', 'rgba(255,255,255,0.01)').attr('rx', 14);

  svg.append('text').attr('x', 14).attr('y', 50).attr('dominant-baseline', 'middle')
    .attr('fill', '#6a8a9a').attr('font-size', 11).text('Q');
  svg.append('text').attr('x', 14).attr('y', 170).attr('dominant-baseline', 'middle')
    .attr('fill', '#6a8a9a').attr('font-size', 11).text('K/V');

  const qWeights = weights[queryIdx] || [];

  tokens.forEach((tok, i) => {
    const cx = padX + i * step;
    const w  = qWeights[i] || 0;
    const qx = padX + queryIdx * step;
    const lineW  = Math.max(0.8, w * 8);
    const alpha  = Math.max(0.05, w * 0.95);

    // animated arcs
    if (i !== queryIdx) {
      const midY = 110;
      const path = `M ${qx} 68 C ${qx} ${midY} ${cx} ${midY} ${cx} 152`;
      svg.append('path')
        .attr('d', path).attr('fill', 'none')
        .attr('stroke', `rgba(96,215,255,${alpha})`).attr('stroke-width', lineW)
        .attr('stroke-dasharray', function() { return this.getTotalLength(); })
        .attr('stroke-dashoffset', function() { return this.getTotalLength(); })
        .transition().duration(600).delay(i * 80)
        .attr('stroke-dashoffset', 0);
    } else {
      svg.append('line')
        .attr('x1', cx).attr('y1', 68).attr('x2', cx).attr('y2', 152)
        .attr('stroke', `rgba(96,215,255,${Math.max(0.18, w * 0.9)})`).attr('stroke-width', lineW)
        .attr('opacity', 0).transition().duration(400).attr('opacity', 1);
    }

    // query node
    svg.append('circle').attr('cx', cx).attr('cy', 50).attr('r', 21)
      .attr('fill', i === queryIdx ? 'rgba(96,215,255,0.22)' : 'rgba(255,255,255,0.05)')
      .attr('stroke', i === queryIdx ? '#60d7ff' : 'rgba(127,167,184,0.25)')
      .attr('stroke-width', i === queryIdx ? 2 : 1);

    svg.append('text').attr('x', cx).attr('y', 50)
      .attr('text-anchor', 'middle').attr('dominant-baseline', 'middle')
      .attr('fill', i === queryIdx ? '#60d7ff' : '#c4d4dc')
      .attr('font-size', 11).attr('font-family', 'Space Grotesk, sans-serif').text(tok);

    // key node — pulsing size + tooltip
    const r = 14 + w * 20;
    const keyCirc = svg.append('circle').attr('cx', cx).attr('cy', 170).attr('r', 8)
      .attr('fill', `rgba(142,242,202,${0.08 + w * 0.5})`)
      .attr('stroke', `rgba(142,242,202,${0.2 + w * 0.55})`).attr('stroke-width', 1.5);

    keyCirc.transition().duration(500).delay(i * 80).attr('r', r);

    keyCirc.on('mouseover', () =>
      showTip(`"${tok}" receives <strong>${(w * 100).toFixed(1)}%</strong> attention from "${tokens[queryIdx]}"`)
    ).on('mouseout', hideTip);

    svg.append('text').attr('x', cx).attr('y', 170)
      .attr('text-anchor', 'middle').attr('dominant-baseline', 'middle')
      .attr('fill', '#8ef2ca').attr('font-size', 10)
      .attr('font-family', 'IBM Plex Mono, monospace').attr('pointer-events', 'none')
      .text(w.toFixed(2));
  });
}

// ─── D3 COSINE SIMILARITY ─────────────────────────────────────
function drawSimilarity(containerId, matrix, tokens) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';

  const n = tokens.length;
  const avail = Math.max(220, container.clientWidth || 500);
  const cellSize = Math.min(68, Math.floor((avail - 90) / n));
  const padL = 74, padT = 54;
  const W = padL + n * cellSize + 10;
  const H = padT + n * cellSize + 24;

  function simColor(v) {
    if (v >= 0) {
      const c = lerpColor([40, 40, 40], [60, 200, 100], v);
      return `rgb(${c[0]},${c[1]},${c[2]})`;
    }
    const c = lerpColor([40, 40, 40], [220, 50, 50], -v);
    return `rgb(${c[0]},${c[1]},${c[2]})`;
  }

  const svg = d3.select(container).append('svg').attr('width', W).attr('height', H);

  tokens.forEach((tok, i) => {
    svg.append('text').attr('x', padL + i * cellSize + cellSize / 2).attr('y', padT - 12)
      .attr('text-anchor', 'middle').attr('fill', '#97afbb')
      .attr('font-size', 11).attr('font-family', 'Space Grotesk, sans-serif').text(tok);
    svg.append('text').attr('x', padL - 8).attr('y', padT + i * cellSize + cellSize / 2)
      .attr('text-anchor', 'end').attr('dominant-baseline', 'middle')
      .attr('fill', '#97afbb').attr('font-size', 11)
      .attr('font-family', 'Space Grotesk, sans-serif').text(tok);
  });

  matrix.forEach((row, i) => {
    row.forEach((v, j) => {
      const cell = svg.append('rect')
        .attr('x', padL + j * cellSize).attr('y', padT + i * cellSize)
        .attr('width', cellSize - 2).attr('height', cellSize - 2)
        .attr('rx', 9).attr('fill', simColor(v)).attr('opacity', 0);

      cell.transition().duration(400).delay((i * n + j) * 20).attr('opacity', 1);

      cell.on('mouseover', () =>
        showTip(`cos("<strong>${tokens[i]}</strong>", "<strong>${tokens[j]}</strong>") = <strong>${v.toFixed(4)}</strong>`)
      ).on('mouseout', hideTip);

      svg.append('text')
        .attr('x', padL + j * cellSize + cellSize / 2)
        .attr('y', padT + i * cellSize + cellSize / 2)
        .attr('text-anchor', 'middle').attr('dominant-baseline', 'middle')
        .attr('fill', Math.abs(v) > 0.35 ? '#000' : '#fff')
        .attr('font-size', 10).attr('font-family', 'IBM Plex Mono, monospace')
        .attr('pointer-events', 'none').text(v.toFixed(2));
    });
  });
}

// ─── MATH UTILS ───────────────────────────────────────────────
function cosineSim(a, b) {
  const dot = a.reduce((s, v, i) => s + v * b[i], 0);
  const na  = Math.sqrt(a.reduce((s, v) => s + v * v, 0));
  const nb  = Math.sqrt(b.reduce((s, v) => s + v * v, 0));
  return dot / (na * nb + 1e-9);
}

function cosineMatrix(vecs) {
  return vecs.map(a => vecs.map(b => cosineSim(a, b)));
}

function fmt(v)    { return v.toFixed(4); }
function fmtVec(v) { return '[' + v.map(x => x.toFixed(2)).join(', ') + ']'; }

function insightHTML(blocks) {
  return '<div class="calc-stack">' +
    blocks.map(b =>
      `<div class="calc-block"><h4>${b.title}</h4>${b.body}</div>`
    ).join('') + '</div>';
}

function metricPair(label, value) {
  return `<div class="metric"><span class="metric-label">${label}</span>` +
         `<span class="metric-value">${value}</span></div>`;
}

// ─── STEP 1: TOKEN EMBEDDINGS ─────────────────────────────────
function renderEmbedStep(r) {
  const dims = r.embeddings[0].map((_, i) => `d${i}`);
  drawMatrix('canvas-embed', r.embeddings, r.tokens, dims);

  const fq = Math.min(focusQuery, r.tokens.length - 1);
  document.getElementById('embed-focus-label').textContent = `"${r.tokens[fq]}"`;
  drawBarChart('embed-focus-bars', r.embeddings[fq], dims);

  const vec = r.embeddings[fq];
  const mag = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));

  document.getElementById('calc-embed').innerHTML = insightHTML([
    {
      title: `Token: "${r.tokens[fq]}"`,
      body: `<p>Learned 8-dim embedding:</p>
             <p class="inline-code" style="word-break:break-all">${fmtVec(vec)}</p>`
    },
    {
      title: 'Vector statistics',
      body: `<div class="metric-grid">
        ${metricPair('‖e‖ (L2 norm)', fmt(mag))}
        ${metricPair('min', fmt(Math.min(...vec)))}
        ${metricPair('max', fmt(Math.max(...vec)))}
        ${metricPair('mean', fmt(vec.reduce((a, b) => a + b, 0) / vec.length))}
      </div>`
    },
    {
      title: '💡 What this means',
      body: `<p>Before any context is applied, each word occupies a fixed point in
             ℝ<sup>8</sup>. After passing through the full block, that point will
             shift based on the words around it.</p>`
    },
  ]);
}

// ─── STEP 2: POSITIONAL ENCODING ──────────────────────────────
function renderPEStep(r) {
  const dims = r.pe[0].map((_, i) => `d${i}`);
  drawMatrix('canvas-pe', r.pe, r.tokens, dims);
  drawMatrix('canvas-withpe', r.withPE, r.tokens, dims);

  const fq = Math.min(focusQuery, r.tokens.length - 1);
  const pe  = r.pe[fq];
  const emb = r.embeddings[fq];
  const sum = r.withPE[fq];

  document.getElementById('calc-pe').innerHTML = insightHTML([
    {
      title: `PE for position ${fq}`,
      body: `<p class="inline-code" style="word-break:break-all">${fmtVec(pe)}</p>`
    },
    {
      title: 'emb + PE → x',
      body: `<p>emb: <span class="inline-code">${fmtVec(emb.slice(0, 4))}…</span></p>
             <p>+PE: <span class="inline-code">${fmtVec(pe.slice(0, 4))}…</span></p>
             <p>= x: <span class="inline-code">${fmtVec(sum.slice(0, 4))}…</span></p>`
    },
    {
      title: 'Frequencies used',
      body: `<div class="metric-grid">
        ${pe.map((_, i) => {
          const k = Math.floor(i / 2);
          const freq = 1 / Math.pow(10000, 2 * k / CONFIG.D_MODEL);
          return metricPair(`d${i} (${i % 2 === 0 ? 'sin' : 'cos'})`, freq.toFixed(4));
        }).join('')}
      </div>`
    },
  ]);
}

// ─── STEP 3: MULTI-HEAD SELF-ATTENTION ────────────────────────
function renderAttnStep(r) {
  const h  = r.heads[activeHead];
  const d4 = h.Q[0].map((_, i) => `d${i}`);
  const fq = Math.min(focusQuery, r.tokens.length - 1);
  const fk = Math.min(focusKey,   r.tokens.length - 1);

  drawMatrix('canvas-Q',        h.Q,         r.tokens, d4);
  drawMatrix('canvas-K',        M.T(h.K),    d4,       r.tokens);
  drawMatrix('canvas-scores',   h.attnWeights, r.tokens, r.tokens);
  drawMatrix('canvas-V',        h.V,         r.tokens, d4);
  drawMatrix('canvas-head-out', h.headOut,   r.tokens, d4);

  drawAttnHeatmap('attn-heatmap-h0', r.heads[0].attnWeights, r.tokens);
  drawAttnHeatmap('attn-heatmap-h1', r.heads[1].attnWeights, r.tokens);

  document.getElementById('attn-flow-label').textContent =
    `Query: "${r.tokens[fq]}" → all keys  (head ${activeHead + 1})`;
  drawAttnFlow('attention-flow', h.attnWeights, r.tokens, fq);

  const scale   = 1 / Math.sqrt(CONFIG.D_HEAD);
  const qvec    = h.Q[fq];
  const kvec    = h.K[fk];
  const rawDot  = qvec.reduce((s, v, i) => s + v * kvec[i], 0);
  const scaledDot = rawDot * scale;
  const attnW   = h.attnWeights[fq][fk];

  document.getElementById('calc-attn').innerHTML = insightHTML([
    {
      title: `Q[${fq}] query for "${r.tokens[fq]}" (head ${activeHead + 1})`,
      body: `<p class="inline-code">${fmtVec(qvec)}</p>`
    },
    {
      title: `K[${fk}] key for "${r.tokens[fk]}"`,
      body: `<p class="inline-code">${fmtVec(kvec)}</p>`
    },
    {
      title: 'Q·Kᵀ dot product',
      body: `<p>= <strong>${fmt(rawDot)}</strong></p>`
    },
    {
      title: `Scale ÷ √${CONFIG.D_HEAD} = ${scale.toFixed(4)}`,
      body: `<p>${fmt(rawDot)} × ${fmt(scale)} = <strong>${fmt(scaledDot)}</strong></p>
             <p>All scaled scores for query "${r.tokens[fq]}":</p>
             <div class="metric-grid">
               ${h.rawScores[fq].map((v, i) =>
                 metricPair(`→ "${r.tokens[i]}"`, fmt(v * scale))
               ).join('')}
             </div>`
    },
    {
      title: 'After softmax',
      body: `<p>Attention from <span class="token-chip-inline">${r.tokens[fq]}</span> to
             <span class="token-chip-inline">${r.tokens[fk]}</span>:
             <strong>${fmt(attnW)}</strong></p>
             <p>${h.attnWeights[fq].map((w, i) =>
               `<span class="token-chip-inline">${r.tokens[i]}: ${w.toFixed(2)}</span>`
             ).join(' ')}</p>`
    },
  ]);

  // update matmul panel for current head
  buildMatMulDisplay();
}

// ─── STEP 4: RESIDUAL ADD + LAYER NORM ────────────────────────
function renderAddNorm1Step(r) {
  const dims = r.withPE[0].map((_, i) => `d${i}`);
  const fq   = Math.min(focusQuery, r.tokens.length - 1);

  drawMatrix('canvas-residual-base', r.withPE,     r.tokens, dims);
  drawMatrix('canvas-residual-attn', r.attnOutput, r.tokens, dims);
  drawMatrix('canvas-addnorm1',      r.addNorm1,   r.tokens, dims);

  document.getElementById('residual-focus-label').textContent = `"${r.tokens[fq]}"`;
  const container = document.getElementById('residual-focus-bars');
  container.innerHTML = '';
  appendMiniBar(container, r.withPE[fq],     'x (input + PE)',        '#f4d8ab');
  appendMiniBar(container, r.attnOutput[fq], 'Attention output',      '#ff8f4d');
  appendMiniBar(container, r.addNorm1[fq],   'After Add + LayerNorm', '#60d7ff');

  const x    = r.withPE[fq];
  const a    = r.attnOutput[fq];
  const sumV = x.map((v, i) => v + a[i]);
  const mean = sumV.reduce((s, v) => s + v, 0) / sumV.length;
  const variance = sumV.reduce((s, v) => s + (v - mean) ** 2, 0) / sumV.length;
  const std  = Math.sqrt(variance);

  document.getElementById('calc-residual').innerHTML = insightHTML([
    {
      title: `x + Attn(x) for "${r.tokens[fq]}"`,
      body: `<p class="inline-code" style="word-break:break-all">${fmtVec(sumV)}</p>`
    },
    {
      title: 'LayerNorm statistics',
      body: `<div class="metric-grid">
        ${metricPair('μ (mean)',    fmt(mean))}
        ${metricPair('σ² (var)',    fmt(variance))}
        ${metricPair('σ (std)',     fmt(std))}
        ${metricPair('ε',          '1e-5')}
      </div>`
    },
    {
      title: 'After normalization — mean≈0, std≈1',
      body: `<p class="inline-code" style="word-break:break-all">${fmtVec(r.addNorm1[fq])}</p>`
    },
    {
      title: '💡 Why it matters',
      body: `<p>Without normalization, activations drift and gradients explode or vanish.
             LayerNorm keeps every token in a consistent numerical range regardless of
             sequence length or batch size.</p>`
    },
  ]);
}

// ─── STEP 5: FEED-FORWARD NETWORK ─────────────────────────────
function renderFFNStep(r) {
  const d8  = r.addNorm1[0].map((_, i) => `d${i}`);
  const d16 = r.ffn1[0].map((_, i) => `h${i}`);
  const fq  = Math.min(focusQuery, r.tokens.length - 1);

  drawMatrix('canvas-ffn-in',  r.addNorm1, r.tokens, d8);
  drawMatrix('canvas-ffn-h1',  r.ffn1,     r.tokens, d16);
  drawMatrix('canvas-ffn-h2',  r.ffnRelu,  r.tokens, d16);
  drawMatrix('canvas-ffn-out', r.ffn2,     r.tokens, d8);

  const acts   = r.ffnRelu[fq];
  const sorted = acts.map((v, i) => ({ v, i })).sort((a, b) => b.v - a.v).slice(0, 8);
  document.getElementById('ffn-focus-label').textContent = `token: "${r.tokens[fq]}"`;

  const nContainer = document.getElementById('ffn-neurons');
  nContainer.innerHTML = '';
  const maxAct = Math.max(...sorted.map(s => s.v), 1e-6);
  const NW = Math.max(240, nContainer.clientWidth || 340);
  const barH = 22, gap = 6, padL = 44, padR = 62;
  const svgN = d3.select(nContainer).append('svg')
    .attr('width', NW).attr('height', sorted.length * (barH + gap) + 8);
  const xSN = d3.scaleLinear().domain([0, maxAct]).range([padL, NW - padR]);

  sorted.forEach(({ v, i }, si) => {
    const y   = 4 + si * (barH + gap);
    const hue = 160 + si * 11;
    svgN.append('rect').attr('x', padL).attr('y', y)
      .attr('width', NW - padL - padR).attr('height', barH)
      .attr('fill', 'rgba(255,255,255,0.04)').attr('rx', 6);

    const bar = svgN.append('rect').attr('x', padL).attr('y', y)
      .attr('width', 0).attr('height', barH)
      .attr('fill', `hsl(${hue},70%,62%)`).attr('rx', 6).attr('opacity', 0.82);

    bar.transition().duration(500).delay(si * 55).attr('width', xSN(v) - padL);

    bar.on('mouseover', () =>
      showTip(`Neuron h${i}: activation = <strong>${v.toFixed(4)}</strong><br>Rank ${si + 1} of ${CONFIG.D_FF}`)
    ).on('mouseout', hideTip);

    svgN.append('text').attr('x', padL - 4).attr('y', y + barH / 2)
      .attr('text-anchor', 'end').attr('dominant-baseline', 'middle')
      .attr('fill', '#97afbb').attr('font-size', 10).attr('font-family', 'IBM Plex Mono, monospace')
      .text(`h${i}`);
    svgN.append('text').attr('x', xSN(v) + 5).attr('y', y + barH / 2)
      .attr('dominant-baseline', 'middle').attr('fill', '#f4d8ab')
      .attr('font-size', 10).attr('font-family', 'IBM Plex Mono, monospace').text(v.toFixed(3));
  });

  const preAct = r.ffn1[fq];
  const reluAct = r.ffnRelu[fq];
  const active  = reluAct.filter(v => v > 0).length;

  document.getElementById('calc-ffn').innerHTML = insightHTML([
    {
      title: `FFN pass for "${r.tokens[fq]}"`,
      body: `<p>8 → <strong style="color:#60d7ff">16</strong> → ReLU → <strong style="color:#8ef2ca">8</strong></p>`
    },
    {
      title: 'Pre-activation W₁x + b₁ (first 8 shown)',
      body: `<p class="inline-code" style="word-break:break-all">${fmtVec(preAct.slice(0, 8))}…</p>`
    },
    {
      title: 'ReLU sparsity',
      body: `<div class="metric-grid">
        ${metricPair('active',   `${active} / ${CONFIG.D_FF}`)}
        ${metricPair('sparsity', `${((1 - active / CONFIG.D_FF) * 100).toFixed(0)}%`)}
        ${metricPair('max act',  fmt(Math.max(...reluAct)))}
        ${metricPair('mean act', fmt(reluAct.reduce((a, b) => a + b, 0) / reluAct.length))}
      </div>`
    },
    {
      title: '💡 Sparse computation',
      body: `<p>ReLU zeroing ${((1 - active / CONFIG.D_FF) * 100).toFixed(0)}% of neurons is intentional —
             sparsity acts as implicit regularisation and makes specific neurons
             responsible for specific pattern types.</p>`
    },
  ]);
}

// ─── STEP 6: FINAL OUTPUT ─────────────────────────────────────
function renderOutputStep(r) {
  const dims = r.embeddings[0].map((_, i) => `d${i}`);
  const fq   = Math.min(focusQuery, r.tokens.length - 1);

  drawMatrix('canvas-orig',  r.embeddings, r.tokens, dims);
  drawMatrix('canvas-final', r.output,     r.tokens, dims);

  const simMat = cosineMatrix(r.output);
  drawSimilarity('similarity-section', simMat, r.tokens);

  document.getElementById('output-focus-label').textContent = `"${r.tokens[fq]}"`;
  const container = document.getElementById('output-focus-bars');
  container.innerHTML = '';
  appendMiniBar(container, r.embeddings[fq], 'original embedding', '#ff8f4d');
  appendMiniBar(container, r.output[fq],     'contextual output',  '#60d7ff');

  const emb  = r.embeddings[fq];
  const out  = r.output[fq];
  const sim  = cosineSim(emb, out);
  const delta    = out.map((v, i) => v - emb[i]);
  const deltaMag = Math.sqrt(delta.reduce((s, v) => s + v * v, 0));

  let bestSim = -Infinity, worstSim = Infinity;
  let bestPair = '', worstPair = '';
  for (let i = 0; i < r.tokens.length; i++) {
    for (let j = i + 1; j < r.tokens.length; j++) {
      const s = simMat[i][j];
      if (s > bestSim) { bestSim = s; bestPair = `"${r.tokens[i]}" & "${r.tokens[j]}"`; }
      if (s < worstSim) { worstSim = s; worstPair = `"${r.tokens[i]}" & "${r.tokens[j]}"`; }
    }
  }

  document.getElementById('calc-output').innerHTML = insightHTML([
    {
      title: `Context shift for "${r.tokens[fq]}"`,
      body: `<div class="metric-grid">
        ${metricPair('cos(orig, final)',   fmt(sim))}
        ${metricPair('Δ magnitude',        fmt(deltaMag))}
        ${metricPair('Δ mean',             fmt(delta.reduce((a, b) => a + b, 0) / delta.length))}
      </div>`
    },
    {
      title: 'Token pair similarities (final)',
      body: r.tokens.length >= 2
        ? `<p>Most similar: <strong>${bestPair}</strong> (${bestSim.toFixed(3)})</p>
           <p>Most distant: <strong>${worstPair}</strong> (${worstSim.toFixed(3)})</p>`
        : '<p>Add more tokens to compare pairs.</p>'
    },
    {
      title: 'All pairwise cosines',
      body: `<div class="metric-grid">
        ${r.tokens.map((a, i) =>
          r.tokens.slice(i + 1).map((b, jj) => {
            const j = i + 1 + jj;
            return metricPair(`"${a}" ↔ "${b}"`, simMat[i][j].toFixed(3));
          }).join('')
        ).join('')}
      </div>`
    },
    {
      title: '💡 Context in action',
      body: `<p>The same word in different positions will have different final vectors —
             because attention sees different neighbours. This is what makes contextual
             embeddings (like BERT/GPT) fundamentally more powerful than static embeddings
             (like Word2Vec).</p>`
    },
  ]);
}

// ─── ARCH RAIL SCROLL OBSERVER ────────────────────────────────
function startArchRailObserver() {
  if (window._archObs) window._archObs.disconnect();

  const obs = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        document.querySelectorAll('.arch-node').forEach(n =>
          n.classList.toggle('active', n.dataset.target === e.target.id)
        );
        const idx = STEP_IDS.indexOf(e.target.id);
        if (idx >= 0 && !animPlaying) updateStepDots(idx);
      }
    });
  }, { threshold: 0.4 });

  STEP_IDS.forEach(id => {
    const el = document.getElementById(id);
    if (el) obs.observe(el);
  });
  window._archObs = obs;
}
