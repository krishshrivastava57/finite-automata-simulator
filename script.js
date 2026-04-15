/* ============================================
   FiniteViz — Automata Simulator
   ============================================ */

'use strict';

// ============ STATE ============
const FA = {
  mode: 'dfa',           // 'dfa' | 'nfa'
  alphabet: ['0','1'],
  states: {},            // { id: { name, x, y, isStart, isAccept } }
  transitions: [],       // { from, symbol, to }  (NFA allows multiple per from+sym)
  nextStateId: 0,

  // Simulation
  sim: {
    running: false,
    input: [],
    pos: 0,
    current: null,       // DFA: state id; NFA: Set of state ids
    history: [],
    autoTimer: null,
  },

  // Canvas
  canvas: {
    offsetX: 0,
    offsetY: 0,
    scale: 1,
    draggingNode: null,
    draggingCanvas: false,
    lastMX: 0, lastMY: 0,
    tool: 'select',
  },

  contextTarget: null,
};

// ============ DOM REFS ============
const $ = id => document.getElementById(id);
const svg = $('main-svg');
const viewport = $('svg-viewport');
const edgesLayer = $('edges-layer');
const nodesLayer = $('nodes-layer');

// ============ INIT ============
document.addEventListener('DOMContentLoaded', () => {
  updateAlphabetChips();
  bindEvents();
  updateStats();
  renderAll();
});

// ============ EVENT BINDINGS ============
function bindEvents() {
  // Mode tabs
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      FA.mode = btn.dataset.tab;
      $('mode-label').textContent = FA.mode.toUpperCase() + ' Mode';
      $('nfa-paths-section').style.display = FA.mode === 'nfa' ? 'block' : 'none';
      resetSimulation();
      addLog('Switched to ' + FA.mode.toUpperCase() + ' mode', 'info');
    });
  });

  // Alphabet
  $('set-alphabet').addEventListener('click', setAlphabet);
  $('alphabet-input').addEventListener('keydown', e => { if(e.key === 'Enter') setAlphabet(); });

  // States
  $('add-state-btn').addEventListener('click', addStateFromInput);
  $('state-name').addEventListener('keydown', e => { if(e.key === 'Enter') addStateFromInput(); });

  // Transitions
  $('add-trans-btn').addEventListener('click', addTransitionFromUI);

  // Example loader
  document.querySelectorAll('.example-btn').forEach(btn => {
    btn.addEventListener('click', () => loadExample(btn.dataset.example));
  });

  // Clear
  $('clear-all').addEventListener('click', clearAll);

  // Canvas events
  const wrap = $('canvas-wrap');
  wrap.addEventListener('mousedown', onCanvasMouseDown);
  wrap.addEventListener('mousemove', onCanvasMouseMove);
  wrap.addEventListener('mouseup', onCanvasMouseUp);
  wrap.addEventListener('contextmenu', e => e.preventDefault());
  wrap.addEventListener('wheel', onCanvasWheel, { passive: false });

  // Tools
  $('tool-select').addEventListener('click', () => setTool('select'));
  $('tool-pan').addEventListener('click', () => setTool('pan'));
  $('zoom-in').addEventListener('click', () => zoom(1.2));
  $('zoom-out').addEventListener('click', () => zoom(0.8));
  $('zoom-fit').addEventListener('click', fitView);

  // Simulation
  $('sim-run').addEventListener('click', startSimulation);
  $('sim-step').addEventListener('click', stepSimulation);
  $('sim-prev').addEventListener('click', prevStep);
  $('sim-reset').addEventListener('click', resetSimulation);
  $('sim-auto').addEventListener('click', autoPlay);
  $('sim-input').addEventListener('keydown', e => { if(e.key === 'Enter') startSimulation(); });

  // Batch
  $('batch-run').addEventListener('click', runBatch);

  // Table
  $('show-table').addEventListener('click', () => {
    const tw = $('table-wrap');
    tw.classList.toggle('open');
    if(tw.classList.contains('open')) renderTable();
  });
  $('close-table').addEventListener('click', () => $('table-wrap').classList.remove('open'));

  // Context menu
  $('ctx-start').addEventListener('click', () => {
    if(FA.contextTarget) { setStartState(FA.contextTarget); hideContextMenu(); }
  });
  $('ctx-accept').addEventListener('click', () => {
    if(FA.contextTarget) { toggleAcceptState(FA.contextTarget); hideContextMenu(); }
  });
  $('ctx-delete').addEventListener('click', () => {
    if(FA.contextTarget) { deleteState(FA.contextTarget); hideContextMenu(); }
  });
  document.addEventListener('click', hideContextMenu);
  document.addEventListener('keydown', e => {
    if(e.key === 'Escape') { hideContextMenu(); closeResult(); }
  });

  // Result overlay
  $('close-result').addEventListener('click', closeResult);
  $('result-overlay').addEventListener('click', e => {
    if(e.target === $('result-overlay')) closeResult();
  });
}

// ============ ALPHABET ============
function setAlphabet() {
  const raw = $('alphabet-input').value.trim();
  if(!raw) return;
  FA.alphabet = [...new Set(raw.split(/[\s,]+/).filter(s => s.length > 0))];
  updateAlphabetChips();
  populateTransitionSelects();
  updateStats();
  addLog('Alphabet set: {' + FA.alphabet.join(', ') + '}', 'info');
}

function updateAlphabetChips() {
  const container = $('symbol-chips');
  container.innerHTML = '';
  FA.alphabet.forEach(sym => {
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.textContent = sym;
    container.appendChild(chip);
  });
  $('stat-alpha').textContent = FA.alphabet.length;
}

// ============ STATES ============
function addStateFromInput() {
  const nameInput = $('state-name');
  let name = nameInput.value.trim() || ('q' + FA.nextStateId);
  if(!name) return;
  // Check duplicate
  if(Object.values(FA.states).some(s => s.name === name)) {
    flashField(nameInput); return;
  }
  const id = 'state_' + FA.nextStateId++;
  const canvas = $('canvas-wrap').getBoundingClientRect();
  const cx = (canvas.width / 2 - FA.canvas.offsetX) / FA.canvas.scale + (Math.random()*80 - 40);
  const cy = (canvas.height / 2 - FA.canvas.offsetY) / FA.canvas.scale + (Math.random()*60 - 30);
  FA.states[id] = { name, x: cx, y: cy, isStart: FA.nextStateId === 1, isAccept: false };
  // First state auto-start
  if(Object.keys(FA.states).length === 1) FA.states[id].isStart = true;
  nameInput.value = '';
  renderAll();
  updateStateList();
  populateTransitionSelects();
  updateStats();
  addLog('Added state: ' + name, 'step');
}

function addStateAt(x, y) {
  const name = 'q' + FA.nextStateId;
  const id = 'state_' + FA.nextStateId++;
  FA.states[id] = { name, x, y, isStart: Object.keys(FA.states).length === 0, isAccept: false };
  renderAll();
  updateStateList();
  populateTransitionSelects();
  updateStats();
  addLog('Added state: ' + name, 'step');
  $('canvas-empty').classList.add('hidden');
}

function setStartState(id) {
  Object.values(FA.states).forEach(s => s.isStart = false);
  FA.states[id].isStart = true;
  renderAll(); updateStateList();
  addLog('Start state: ' + FA.states[id].name, 'info');
}

function toggleAcceptState(id) {
  FA.states[id].isAccept = !FA.states[id].isAccept;
  renderAll(); updateStateList();
  addLog((FA.states[id].isAccept ? 'Set accept: ' : 'Removed accept: ') + FA.states[id].name, 'info');
}

function deleteState(id) {
  const name = FA.states[id]?.name;
  delete FA.states[id];
  FA.transitions = FA.transitions.filter(t => t.from !== id && t.to !== id);
  renderAll(); updateStateList(); updateTransList();
  populateTransitionSelects(); updateStats();
  addLog('Deleted state: ' + name, 'reject');
}

function updateStateList() {
  const container = $('state-list');
  container.innerHTML = '';
  Object.entries(FA.states).forEach(([id, s]) => {
    const item = document.createElement('div');
    item.className = 'state-item' + (s.isStart ? ' is-start' : '') + (s.isAccept ? ' is-accept' : '');
    item.innerHTML = `
      <span class="s-name">${s.name}</span>
      ${s.isStart ? '<span class="state-badge badge-start">START</span>' : ''}
      ${s.isAccept ? '<span class="state-badge badge-accept">ACCEPT</span>' : ''}
      <button class="state-del" data-id="${id}" title="Delete">✕</button>`;
    item.querySelector('.state-del').addEventListener('click', e => {
      e.stopPropagation(); deleteState(id);
    });
    item.addEventListener('contextmenu', e => { e.preventDefault(); showContextMenu(e, id); });
    container.appendChild(item);
  });
  $('stat-states').textContent = Object.keys(FA.states).length;
}

// ============ TRANSITIONS ============
function populateTransitionSelects() {
  const selects = ['trans-from','trans-to'];
  selects.forEach(sid => {
    const sel = $(sid);
    const current = sel.value;
    sel.innerHTML = '';
    Object.entries(FA.states).forEach(([id, s]) => {
      const opt = document.createElement('option');
      opt.value = id; opt.textContent = s.name;
      sel.appendChild(opt);
    });
    if(current && FA.states[current]) sel.value = current;
  });
  const symSel = $('trans-sym');
  const currSym = symSel.value;
  symSel.innerHTML = '';
  FA.alphabet.forEach(sym => {
    const opt = document.createElement('option');
    opt.value = sym; opt.textContent = sym;
    symSel.appendChild(opt);
  });
  // NFA: epsilon
  if(FA.mode === 'nfa') {
    const eps = document.createElement('option');
    eps.value = 'ε'; eps.textContent = 'ε (epsilon)';
    symSel.appendChild(eps);
  }
  if(currSym) symSel.value = currSym;
}

function addTransitionFromUI() {
  const from = $('trans-from').value;
  const to = $('trans-to').value;
  const sym = $('trans-sym').value;
  if(!from || !to || !sym) return;
  // DFA: ensure unique (from, sym)
  if(FA.mode === 'dfa') {
    const exists = FA.transitions.find(t => t.from === from && t.symbol === sym);
    if(exists) {
      exists.to = to;
      updateTransList(); renderAll(); renderTable();
      addLog(`Updated δ(${FA.states[from].name}, ${sym}) = ${FA.states[to].name}`, 'step');
      return;
    }
  }
  FA.transitions.push({ from, symbol: sym, to });
  updateTransList(); renderAll(); updateStats();
  if($('table-wrap').classList.contains('open')) renderTable();
  addLog(`Added δ(${FA.states[from]?.name}, ${sym}) → ${FA.states[to]?.name}`, 'step');
}

function updateTransList() {
  const container = $('trans-list');
  container.innerHTML = '';
  FA.transitions.forEach((t, idx) => {
    const item = document.createElement('div');
    item.className = 'trans-item';
    const fn = FA.states[t.from]?.name || '?';
    const tn = FA.states[t.to]?.name || '?';
    item.innerHTML = `<span class="t-formula">δ(<span class="state">${fn}</span>, <span class="sym">${t.symbol}</span>) = <span class="state">${tn}</span></span>
      <button class="trans-del" data-idx="${idx}" title="Remove">✕</button>`;
    item.querySelector('.trans-del').addEventListener('click', () => {
      FA.transitions.splice(idx, 1);
      updateTransList(); renderAll(); updateStats();
      if($('table-wrap').classList.contains('open')) renderTable();
    });
    container.appendChild(item);
  });
  $('stat-trans').textContent = FA.transitions.length;
}

// ============ CANVAS RENDERING ============
const R = 26; // state radius

function renderAll() {
  renderEdges();
  renderNodes();
  const empty = $('canvas-empty');
  if(Object.keys(FA.states).length > 0) empty.classList.add('hidden');
  else empty.classList.remove('hidden');
}

function applyViewTransform() {
  viewport.setAttribute('transform',
    `translate(${FA.canvas.offsetX},${FA.canvas.offsetY}) scale(${FA.canvas.scale})`);
}

function renderNodes() {
  nodesLayer.innerHTML = '';
  Object.entries(FA.states).forEach(([id, s]) => {
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('class', 'svg-state-group');
    g.setAttribute('data-id', id);

    // Determine circle classes
    let classes = 'state-circle';
    if(s.isStart) classes += ' start-state';
    if(s.isAccept) classes += ' accept-state';
    if(FA.sim.running) {
      const cur = FA.sim.current;
      if(FA.mode === 'dfa' && cur === id) classes += ' active-state';
      if(FA.mode === 'nfa' && cur instanceof Set && cur.has(id)) classes += ' active-state';
    }

    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', s.x); circle.setAttribute('cy', s.y); circle.setAttribute('r', R);
    circle.setAttribute('class', classes);
    g.appendChild(circle);

    // Accept ring
    if(s.isAccept) {
      const ring = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      ring.setAttribute('cx', s.x); ring.setAttribute('cy', s.y); ring.setAttribute('r', R - 5);
      ring.setAttribute('class', 'accept-ring');
      ring.setAttribute('stroke', s.isStart ? 'var(--green)' : 'var(--green)');
      g.appendChild(ring);
    }

    // Start arrow
    if(s.isStart) {
      const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      arrow.setAttribute('x1', s.x - R - 22); arrow.setAttribute('y1', s.y);
      arrow.setAttribute('x2', s.x - R - 2);  arrow.setAttribute('y2', s.y);
      arrow.setAttribute('class', 'start-arrow');
      arrow.setAttribute('stroke', 'var(--yellow)');
      arrow.setAttribute('marker-end', 'url(#arrowhead)');
      g.appendChild(arrow);
    }

    // Label
    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    label.setAttribute('x', s.x); label.setAttribute('y', s.y);
    label.setAttribute('class', 'state-label');
    label.textContent = s.name;
    g.appendChild(label);

    // Events
    g.addEventListener('mousedown', e => onNodeMouseDown(e, id));
    g.addEventListener('contextmenu', e => { e.preventDefault(); e.stopPropagation(); showContextMenu(e, id); });
    nodesLayer.appendChild(g);
  });
  applyViewTransform();
}

function renderEdges() {
  edgesLayer.innerHTML = '';
  // Group transitions by from+to for multi-label
  const edgeMap = {};
  FA.transitions.forEach(t => {
    const key = t.from + '→' + t.to;
    if(!edgeMap[key]) edgeMap[key] = { from: t.from, to: t.to, symbols: [] };
    edgeMap[key].symbols.push(t.symbol);
  });

  Object.values(edgeMap).forEach(edge => {
    const { from, to, symbols } = edge;
    const sf = FA.states[from]; const st = FA.states[to];
    if(!sf || !st) return;
    const label = symbols.join(',');

    // Determine if this edge is currently active
    let edgeActive = false;
    if(FA.sim.running && FA.sim.pos > 0) {
      const h = FA.sim.history[FA.sim.pos - 1];
      if(h && h.from === from && h.to === to && symbols.includes(h.symbol)) edgeActive = true;
    }
    const arrowId = edgeActive ? 'arrowhead-active' : 'arrowhead';
    const edgeClass = 'edge-path' + (edgeActive ? ' active-edge' : '');

    if(from === to) {
      // Self-loop
      const path = selfLoopPath(sf.x, sf.y);
      const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      p.setAttribute('d', path); p.setAttribute('class', 'self-loop');
      p.setAttribute('stroke', edgeActive ? 'var(--green)' : 'var(--border2)');
      p.setAttribute('marker-end', `url(#${arrowId})`);
      if(edgeActive) p.setAttribute('filter', 'url(#glow)');
      edgesLayer.appendChild(p);
      // Label
      drawEdgeLabel(edgesLayer, sf.x + R + 12, sf.y - R - 22, label, edgeActive);
    } else {
      // Check reverse edge exists (for curve)
      const reverseExists = FA.transitions.some(t => t.from === to && t.to === from);
      const { path, lx, ly } = edgePath(sf.x, sf.y, st.x, st.y, reverseExists);
      const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      p.setAttribute('d', path); p.setAttribute('class', edgeClass);
      p.setAttribute('marker-end', `url(#${arrowId})`);
      edgesLayer.appendChild(p);
      drawEdgeLabel(edgesLayer, lx, ly, label, edgeActive);
    }
  });
  applyViewTransform();
}

function selfLoopPath(cx, cy) {
  const r = R;
  return `M${cx - r*0.5},${cy - r}
    C${cx - r*1.4},${cy - r*2.5} ${cx + r*1.4},${cy - r*2.5} ${cx + r*0.5},${cy - r}`;
}

function edgePath(x1, y1, x2, y2, curved) {
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.sqrt(dx*dx + dy*dy) || 1;
  const ux = dx/len, uy = dy/len;
  // Start and end points on circle edges
  const sx = x1 + ux*R, sy = y1 + uy*R;
  const ex = x2 - ux*R, ey = y2 - uy*R;

  if(!curved) {
    return { path: `M${sx},${sy} L${ex},${ey}`, lx: (sx+ex)/2, ly: (sy+ey)/2 - 10 };
  }
  // Curved: offset perpendicular
  const off = 30;
  const perpX = -uy * off, perpY = ux * off;
  const mx = (sx+ex)/2 + perpX, my = (sy+ey)/2 + perpY;
  return {
    path: `M${sx},${sy} Q${mx},${my} ${ex},${ey}`,
    lx: mx, ly: my
  };
}

function drawEdgeLabel(parent, x, y, text, active) {
  const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  const tw = text.length * 7 + 8;
  bg.setAttribute('x', x - tw/2); bg.setAttribute('y', y - 9);
  bg.setAttribute('width', tw); bg.setAttribute('height', 16);
  bg.setAttribute('rx', 3); bg.setAttribute('class', 'edge-label-bg');
  parent.appendChild(bg);

  const lbl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  lbl.setAttribute('x', x); lbl.setAttribute('y', y + 1);
  lbl.setAttribute('class', 'edge-label');
  lbl.setAttribute('fill', active ? 'var(--green)' : 'var(--text2)');
  lbl.textContent = text;
  parent.appendChild(lbl);
}

// ============ CANVAS INTERACTION ============
function svgPoint(e) {
  const rect = svg.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left - FA.canvas.offsetX) / FA.canvas.scale,
    y: (e.clientY - rect.top - FA.canvas.offsetY) / FA.canvas.scale,
  };
}

function onNodeMouseDown(e, id) {
  e.stopPropagation();
  if(e.button === 2) return;
  FA.canvas.draggingNode = id;
  FA.canvas.lastMX = e.clientX; FA.canvas.lastMY = e.clientY;
}

function onCanvasMouseDown(e) {
  if(e.button === 2) return;
  const target = e.target.closest('.svg-state-group');
  if(target) return;

  if(FA.canvas.tool === 'pan') {
    FA.canvas.draggingCanvas = true;
    FA.canvas.lastMX = e.clientX; FA.canvas.lastMY = e.clientY;
  } else if(FA.canvas.tool === 'select') {
    // Click empty canvas = add state
    const { x, y } = svgPoint(e);
    // Only add if not near any existing state
    const near = Object.values(FA.states).some(s => {
      const dx = s.x - x, dy = s.y - y;
      return Math.sqrt(dx*dx + dy*dy) < R * 2 + 10;
    });
    if(!near) addStateAt(x, y);
  }
}

function onCanvasMouseMove(e) {
  if(FA.canvas.draggingNode) {
    const id = FA.canvas.draggingNode;
    const dx = (e.clientX - FA.canvas.lastMX) / FA.canvas.scale;
    const dy = (e.clientY - FA.canvas.lastMY) / FA.canvas.scale;
    FA.states[id].x += dx; FA.states[id].y += dy;
    FA.canvas.lastMX = e.clientX; FA.canvas.lastMY = e.clientY;
    renderAll();
  } else if(FA.canvas.draggingCanvas) {
    FA.canvas.offsetX += (e.clientX - FA.canvas.lastMX);
    FA.canvas.offsetY += (e.clientY - FA.canvas.lastMY);
    FA.canvas.lastMX = e.clientX; FA.canvas.lastMY = e.clientY;
    applyViewTransform();
  }
}

function onCanvasMouseUp() {
  FA.canvas.draggingNode = null;
  FA.canvas.draggingCanvas = false;
}

function onCanvasWheel(e) {
  e.preventDefault();
  const delta = e.deltaY > 0 ? 0.85 : 1.15;
  zoom(delta, e.clientX, e.clientY);
}

function zoom(factor, cx, cy) {
  const wrap = $('canvas-wrap').getBoundingClientRect();
  const pivotX = (cx ?? wrap.left + wrap.width/2) - wrap.left;
  const pivotY = (cy ?? wrap.top + wrap.height/2) - wrap.top;
  const newScale = Math.max(0.2, Math.min(3, FA.canvas.scale * factor));
  const ratio = newScale / FA.canvas.scale;
  FA.canvas.offsetX = pivotX - ratio * (pivotX - FA.canvas.offsetX);
  FA.canvas.offsetY = pivotY - ratio * (pivotY - FA.canvas.offsetY);
  FA.canvas.scale = newScale;
  applyViewTransform();
}

function fitView() {
  const states = Object.values(FA.states);
  if(!states.length) return;
  const wrap = $('canvas-wrap').getBoundingClientRect();
  const xs = states.map(s => s.x), ys = states.map(s => s.y);
  const minX = Math.min(...xs)-R-40, maxX = Math.max(...xs)+R+40;
  const minY = Math.min(...ys)-R-40, maxY = Math.max(...ys)+R+40;
  const scaleX = wrap.width / (maxX - minX);
  const scaleY = wrap.height / (maxY - minY);
  FA.canvas.scale = Math.min(scaleX, scaleY, 2);
  FA.canvas.offsetX = -minX * FA.canvas.scale + (wrap.width - (maxX-minX)*FA.canvas.scale)/2;
  FA.canvas.offsetY = -minY * FA.canvas.scale + (wrap.height - (maxY-minY)*FA.canvas.scale)/2;
  applyViewTransform();
}

function setTool(t) {
  FA.canvas.tool = t;
  document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
  $('tool-' + t).classList.add('active');
  const wrap = $('canvas-wrap');
  wrap.className = 'canvas-wrap ' + t + '-mode';
  $('canvas-hint').textContent = t === 'pan' ? 'Drag to pan canvas' : 'Click canvas to add a state';
}

// ============ CONTEXT MENU ============
function showContextMenu(e, id) {
  FA.contextTarget = id;
  const menu = $('context-menu');
  menu.style.left = e.clientX + 'px';
  menu.style.top = e.clientY + 'px';
  menu.classList.add('open');
  $('ctx-accept').textContent = FA.states[id]?.isAccept ? 'Remove Accept State' : 'Set as Accept State';
  e.stopPropagation();
}

function hideContextMenu() {
  $('context-menu').classList.remove('open');
}

// ============ SIMULATION ============
function getStartState() {
  return Object.entries(FA.states).find(([,s]) => s.isStart)?.[0] || null;
}

function dfaTransition(stateId, sym) {
  const t = FA.transitions.find(t => t.from === stateId && t.symbol === sym);
  return t ? t.to : null;
}

function nfaTransition(stateSet, sym) {
  // Returns new Set of states after consuming sym (with epsilon closure)
  let next = new Set();
  stateSet.forEach(sid => {
    FA.transitions.filter(t => t.from === sid && t.symbol === sym)
      .forEach(t => next.add(t.to));
  });
  return epsilonClosure(next);
}

function epsilonClosure(stateSet) {
  const closure = new Set(stateSet);
  let changed = true;
  while(changed) {
    changed = false;
    closure.forEach(sid => {
      FA.transitions.filter(t => t.from === sid && t.symbol === 'ε')
        .forEach(t => { if(!closure.has(t.to)) { closure.add(t.to); changed = true; } });
    });
  }
  return closure;
}

function isAccepting(stateOrSet) {
  if(typeof stateOrSet === 'string') return FA.states[stateOrSet]?.isAccept || false;
  if(stateOrSet instanceof Set) return [...stateOrSet].some(id => FA.states[id]?.isAccept);
  return false;
}

function startSimulation() {
  const input = $('sim-input').value.trim();
  // Validate
  if(Object.keys(FA.states).length === 0) {
    addLog('No states defined!', 'reject'); return;
  }
  const start = getStartState();
  if(!start) { addLog('No start state defined!', 'reject'); return; }

  resetSimulation(false);
  FA.sim.running = true;
  FA.sim.input = input === '' ? [] : input.split('');
  FA.sim.pos = 0;
  FA.sim.current = FA.mode === 'nfa' ? epsilonClosure(new Set([start])) : start;
  FA.sim.history = [];

  // Validate input symbols for DFA
  if(FA.mode === 'dfa') {
    const invalid = FA.sim.input.filter(c => !FA.alphabet.includes(c));
    if(invalid.length > 0) {
      addLog('Invalid symbols in input: ' + invalid.join(', '), 'reject');
      FA.sim.running = false; return;
    }
  }

  renderTape();
  updateSimStatus(`Reading: "${input || 'ε'}" | Start: ${FA.states[start].name}`, 'running');
  addLog(`--- Simulation start: "${input || 'ε'}" ---`, 'info');
  if(FA.mode === 'nfa') logNFAState();
  renderAll();
  $('stat-steps').textContent = '0';
}

function stepSimulation() {
  if(!FA.sim.running) return;
  if(FA.sim.pos >= FA.sim.input.length) {
    finishSimulation(); return;
  }

  const sym = FA.sim.input[FA.sim.pos];
  const prevState = FA.sim.current;

  if(FA.mode === 'dfa') {
    const next = dfaTransition(FA.sim.current, sym);
    FA.sim.history.push({ from: FA.sim.current, to: next, symbol: sym, pos: FA.sim.pos });
    FA.sim.current = next;
    const fname = FA.states[prevState]?.name || 'dead';
    const tname = next ? FA.states[next]?.name : 'DEAD';
    addLog(`δ(${fname}, ${sym}) = ${tname}`, next ? 'step' : 'reject');
    if(!next) {
      FA.sim.pos++;
      updateTapePos(FA.sim.pos - 1, 'error');
      renderAll();
      $('stat-steps').textContent = FA.sim.pos;
      finishSimulation(); return;
    }
  } else {
    // NFA
    const next = nfaTransition(FA.sim.current, sym);
    FA.sim.history.push({ from: FA.sim.current, to: next, symbol: sym, pos: FA.sim.pos });
    FA.sim.current = next;
    logNFAState();
  }

  FA.sim.pos++;
  updateTapePos(FA.sim.pos - 1, 'done');
  if(FA.sim.pos < FA.sim.input.length) updateTapePos(FA.sim.pos, 'current');
  $('stat-steps').textContent = FA.sim.pos;
  renderAll();

  if(FA.sim.pos >= FA.sim.input.length) finishSimulation();
}

function prevStep() {
  if(!FA.sim.running || FA.sim.pos === 0 || FA.sim.history.length === 0) return;
  const last = FA.sim.history.pop();
  FA.sim.pos--;
  FA.sim.current = last.from;
  renderAll();
  updateTapePos(FA.sim.pos, 'current');
  $('stat-steps').textContent = FA.sim.pos;
  addLog(`⟵ Back to step ${FA.sim.pos}`, 'info');
}

function finishSimulation() {
  const accepted = isAccepting(FA.sim.current);
  const inputStr = FA.sim.input.join('') || 'ε';
  if(accepted) {
    updateSimStatus(`✓ ACCEPTED — "${inputStr}"`, 'accept');
    addLog(`✓ String "${inputStr}" is ACCEPTED`, 'accept');
    showResult(true, inputStr, FA.sim.pos);
  } else {
    let reason = '';
    if(FA.mode === 'dfa' && FA.sim.current === null) reason = ' (no transition)';
    updateSimStatus(`✗ REJECTED — "${inputStr}"${reason}`, 'reject');
    addLog(`✗ String "${inputStr}" is REJECTED`, 'reject');
    showResult(false, inputStr, FA.sim.pos);
  }
  FA.sim.running = false;
  if(FA.sim.autoTimer) { clearInterval(FA.sim.autoTimer); FA.sim.autoTimer = null; }
  renderAll();
}

function autoPlay() {
  if(FA.sim.autoTimer) {
    clearInterval(FA.sim.autoTimer); FA.sim.autoTimer = null;
    $('sim-auto').textContent = '⏵';
    return;
  }
  if(!FA.sim.running) startSimulation();
  $('sim-auto').textContent = '⏸';
  FA.sim.autoTimer = setInterval(() => {
    if(!FA.sim.running || FA.sim.pos >= FA.sim.input.length) {
      clearInterval(FA.sim.autoTimer); FA.sim.autoTimer = null;
      $('sim-auto').textContent = '⏵';
      if(FA.sim.pos >= FA.sim.input.length && FA.sim.running) finishSimulation();
      return;
    }
    stepSimulation();
  }, 700);
}

function resetSimulation(clearLog = true) {
  FA.sim = { running: false, input: [], pos: 0, current: null, history: [], autoTimer: null };
  $('sim-tape').innerHTML = '';
  updateSimStatus('Enter a string and press ▶ to simulate', 'idle');
  $('stat-steps').textContent = '—';
  $('sim-auto').textContent = '⏵';
  if(clearLog) $('log-box').innerHTML = '<div class="log-empty">No simulation running…</div>';
  renderAll();
}

function renderTape() {
  const tape = $('sim-tape');
  tape.innerHTML = '';
  const cells = FA.sim.input.length ? FA.sim.input : ['ε'];
  cells.forEach((sym, i) => {
    const cell = document.createElement('div');
    cell.className = 'tape-cell' + (i === 0 ? ' current' : '');
    cell.id = 'tape-cell-' + i;
    cell.textContent = sym;
    tape.appendChild(cell);
  });
}

function updateTapePos(idx, cls) {
  document.querySelectorAll('.tape-cell').forEach(c => {
    if(parseInt(c.id.split('-')[2]) <= idx) c.classList.add('done');
    c.classList.remove('current', 'error');
  });
  const cell = $('tape-cell-' + idx);
  if(cell) { cell.classList.remove('done'); cell.classList.add(cls); }
}

function updateSimStatus(msg, type) {
  const el = $('sim-status');
  el.innerHTML = `<div class="status-${type}">${msg}</div>`;
}

function logNFAState() {
  if(FA.sim.current instanceof Set) {
    const names = [...FA.sim.current].map(id => FA.states[id]?.name).filter(Boolean);
    addLog(`NFA states: {${names.join(', ')}}`, 'step');
    const paths = $('nfa-paths');
    paths.innerHTML = '';
    [...FA.sim.current].forEach(id => {
      const s = FA.states[id]; if(!s) return;
      const item = document.createElement('div');
      item.className = 'nfa-path-item active';
      item.textContent = s.name + (s.isAccept ? ' ★' : '');
      paths.appendChild(item);
    });
  }
}

// ============ RESULT OVERLAY ============
function showResult(accepted, str, steps) {
  const overlay = $('result-overlay');
  const box = $('result-box');
  box.className = 'result-box result-' + (accepted ? 'accept' : 'reject');
  $('result-icon').textContent = accepted ? '✓' : '✗';
  $('result-title').textContent = accepted ? 'ACCEPTED' : 'REJECTED';
  $('result-detail').textContent = `"${str}" — ${steps} step${steps!==1?'s':''}`;
  overlay.classList.add('open');
  setTimeout(() => { if(overlay.classList.contains('open')) closeResult(); }, 4000);
}

function closeResult() {
  $('result-overlay').classList.remove('open');
}

// ============ BATCH TEST ============
function runBatch() {
  const lines = $('batch-input').value.trim().split('\n').filter(l => l.length > 0);
  const results = $('batch-results');
  results.innerHTML = '';
  if(!lines.length) return;

  const startId = getStartState();
  if(!startId) { addLog('No start state!', 'reject'); return; }

  lines.forEach(line => {
    const str = line.trim();
    const accepted = FA.mode === 'dfa' ? runDFAQuick(str, startId) : runNFAQuick(str, startId);
    const item = document.createElement('div');
    item.className = 'batch-item';
    item.innerHTML = `<span class="b-str">"${str || 'ε'}"</span>
      <span class="b-res ${accepted ? 'accept' : 'reject'}">${accepted ? '✓ ACCEPT' : '✗ REJECT'}</span>`;
    results.appendChild(item);
  });
}

function runDFAQuick(str, startId) {
  let cur = startId;
  for(const sym of (str || '').split('')) {
    cur = dfaTransition(cur, sym);
    if(!cur) return false;
  }
  return FA.states[cur]?.isAccept || false;
}

function runNFAQuick(str, startId) {
  let cur = epsilonClosure(new Set([startId]));
  for(const sym of (str || '').split('')) {
    cur = nfaTransition(cur, sym);
    if(cur.size === 0) return false;
  }
  return [...cur].some(id => FA.states[id]?.isAccept);
}

// ============ TRANSITION TABLE ============
function renderTable() {
  const content = $('table-content');
  const states = Object.values(FA.states);
  if(!states.length) { content.innerHTML = '<p style="color:var(--text3);font-family:var(--font-mono);font-size:11px;padding:8px">No states defined.</p>'; return; }

  let html = '<table class="delta-table"><thead><tr><th>State</th>';
  FA.alphabet.forEach(sym => { html += `<th>${sym}</th>`; });
  if(FA.mode === 'nfa') html += '<th>ε</th>';
  html += '</tr></thead><tbody>';

  states.forEach(s => {
    const id = Object.entries(FA.states).find(([,v]) => v === s)?.[0];
    const prefix = (s.isStart ? '→' : '') + (s.isAccept ? '*' : '');
    html += `<tr><td>${prefix}${s.name}</td>`;
    const syms = FA.mode === 'nfa' ? [...FA.alphabet, 'ε'] : FA.alphabet;
    syms.forEach(sym => {
      const targets = FA.transitions.filter(t => t.from === id && t.symbol === sym).map(t => FA.states[t.to]?.name);
      if(targets.length === 0) html += `<td class="cell-empty">—</td>`;
      else html += `<td class="cell-active">{${targets.join(',')}}</td>`;
    });
    html += '</tr>';
  });
  html += '</tbody></table>';
  content.innerHTML = html;
}

// ============ LOG ============
function addLog(msg, type) {
  const box = $('log-box');
  const empty = box.querySelector('.log-empty');
  if(empty) empty.remove();
  const entry = document.createElement('div');
  entry.className = 'log-entry ' + type;
  entry.textContent = msg;
  box.appendChild(entry);
  box.scrollTop = box.scrollHeight;
}

// ============ STATS ============
function updateStats() {
  $('stat-states').textContent = Object.keys(FA.states).length;
  $('stat-trans').textContent = FA.transitions.length;
  $('stat-alpha').textContent = FA.alphabet.length;
}

// ============ HELPERS ============
function flashField(el) {
  el.style.borderColor = 'var(--red)';
  setTimeout(() => el.style.borderColor = '', 600);
}

function clearAll() {
  FA.states = {}; FA.transitions = []; FA.nextStateId = 0;
  FA.canvas = { offsetX: 0, offsetY: 0, scale: 1, draggingNode: null, draggingCanvas: false, lastMX: 0, lastMY: 0, tool: FA.canvas.tool };
  resetSimulation(true);
  renderAll(); updateStateList(); updateTransList();
  populateTransitionSelects(); updateStats();
  $('canvas-empty').classList.remove('hidden');
  addLog('Canvas cleared', 'info');
}

// ============ EXAMPLE LOADERS ============
function loadExample(name) {
  clearAll();
  switch(name) {
    case 'even-zeros': loadEvenZeros(); break;
    case 'ends-with-1': loadEndsWith1(); break;
    case 'divisible-3': loadDivisibleBy3(); break;
    case 'nfa-example': loadNFAExample(); break;
  }
  setTimeout(fitView, 80);
}

function makeState(name, x, y, isStart, isAccept) {
  const id = 'state_' + FA.nextStateId++;
  FA.states[id] = { name, x, y, isStart: !!isStart, isAccept: !!isAccept };
  return id;
}
function makeTrans(from, sym, to) {
  FA.transitions.push({ from, symbol: sym, to });
}

function loadEvenZeros() {
  FA.alphabet = ['0','1'];
  $('alphabet-input').value = '0,1';
  updateAlphabetChips();
  const q0 = makeState('q0', 200, 180, true, true);
  const q1 = makeState('q1', 420, 180, false, false);
  makeTrans(q0,'0',q1); makeTrans(q1,'0',q0);
  makeTrans(q0,'1',q0); makeTrans(q1,'1',q1);
  finishLoad('DFA: Strings with even number of 0s');
}

function loadEndsWith1() {
  FA.alphabet = ['0','1'];
  $('alphabet-input').value = '0,1';
  updateAlphabetChips();
  const q0 = makeState('q0', 200, 180, true, false);
  const q1 = makeState('q1', 420, 180, false, true);
  makeTrans(q0,'0',q0); makeTrans(q0,'1',q1);
  makeTrans(q1,'0',q0); makeTrans(q1,'1',q1);
  finishLoad('DFA: Strings ending with 1');
}

function loadDivisibleBy3() {
  FA.alphabet = ['0','1'];
  $('alphabet-input').value = '0,1';
  updateAlphabetChips();
  const q0 = makeState('q0', 300, 120, true, true);
  const q1 = makeState('q1', 480, 260, false, false);
  const q2 = makeState('q2', 120, 260, false, false);
  // Remainder 0,1,2 on reading binary
  makeTrans(q0,'0',q0); makeTrans(q0,'1',q1);
  makeTrans(q1,'0',q2); makeTrans(q1,'1',q0);
  makeTrans(q2,'0',q1); makeTrans(q2,'1',q2);
  finishLoad('DFA: Binary strings divisible by 3');
}

function loadNFAExample() {
  FA.mode = 'nfa';
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.querySelector('[data-tab="nfa"]').classList.add('active');
  $('mode-label').textContent = 'NFA Mode';
  $('nfa-paths-section').style.display = 'block';
  FA.alphabet = ['a','b'];
  $('alphabet-input').value = 'a,b';
  updateAlphabetChips();
  const q0 = makeState('q0', 180, 200, true, false);
  const q1 = makeState('q1', 360, 200, false, false);
  const q2 = makeState('q2', 540, 200, false, true);
  makeTrans(q0,'a',q0); makeTrans(q0,'b',q0);
  makeTrans(q0,'a',q1);
  makeTrans(q1,'b',q2);
  finishLoad('NFA: Strings containing "ab"');
}

function finishLoad(desc) {
  renderAll(); updateStateList(); updateTransList();
  populateTransitionSelects(); updateStats();
  addLog('Loaded example: ' + desc, 'info');
  $('canvas-empty').classList.add('hidden');
}