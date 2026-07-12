/* ===== CLEWA — the intelligent inventory grid =====
   A spreadsheet that feels like Excel (inline edit, sort, fill-down,
   keyboard nav, formula bar) but every cell is connected: edit a white
   cell and every number that depends on it recomputes live. */
(function () {
  'use strict';
  var root = document.getElementById('ig-root');
  if (!root) return;

  var nf = function (n, unit) {
    if (n === Infinity) return '∞';
    var s = Math.round(n).toLocaleString('en-US');
    if (Math.abs(n) < 100 && !Number.isInteger(n)) s = (Math.round(n * 10) / 10).toLocaleString('en-US');
    return unit ? s + ' ' + unit : s;
  };
  var clone = function (a) { return a.map(function (o) { var c = {}; for (var k in o) c[k] = o[k]; return c; }); };

  /* ---------- data (one coherent brand: Maison Ardent, FW26) ---------- */
  var DATA = {
    finished: clone([
      { name: 'Organic Tee — Black',   sku: 'TEE-BLK',  onhand: 180,  wk: 42, incoming: 0,   lead: 6,  order: 380, cost: 14 },
      { name: 'Organic Tee — Ecru',    sku: 'TEE-ECR',  onhand: 1240, wk: 48, incoming: 0,   lead: 6,  order: 0,   cost: 14 },
      { name: 'Canvas Tote — Natural', sku: 'TOTE-NAT', onhand: 95,   wk: 19, incoming: 0,   lead: 5,  order: 240, cost: 9 },
      { name: 'Wool Overcoat — Camel', sku: 'COAT-CML', onhand: 0,    wk: 11, incoming: 320, lead: 14, order: 0,   cost: 138 },
      { name: 'Merino Crew — Navy',    sku: 'KNIT-NVY', onhand: 62,   wk: 14, incoming: 0,   lead: 8,  order: 200, cost: 48 }
    ]),
    components: clone([
      { name: 'Horn buttons · 22mm',     loc: 'Atelier Norte',     onhand: 1500, alloc: 1280, peru: 4,   lead: 3, order: 200, unit: '' },
      { name: '340gsm boiled wool · 7A', loc: 'Atelier Norte',     onhand: 820,  alloc: 610,  peru: 1.9, lead: 5, order: 300, unit: 'm' },
      { name: 'YKK zipper · brass',      loc: 'Atelier Norte',     onhand: 324,  alloc: 120,  peru: 1,   lead: 4, order: 0,   unit: '' },
      { name: 'Organic jersey · GOTS',   loc: 'Lotus Knit',        onhand: 3000, alloc: 2850, peru: 0.6, lead: 6, order: 800, unit: 'm' },
      { name: 'Woven size labels',       loc: 'Warehouse · Lisbon', onhand: 2400, alloc: 960,  peru: 1,   lead: 2, order: 0,   unit: '' }
    ])
  };
  var ORIG = { finished: clone(DATA.finished), components: clone(DATA.components) };

  /* ---------- column schemas ----------
     type: text | num (editable) | link (from orders) | calc (computed) | status */
  var SCHEMA = {
    finished: [
      { key: 'name', label: 'Product', type: 'text', cls: 'g-prod' },
      { key: 'onhand', label: 'On hand', type: 'num' },
      { key: 'wk', label: '/ wk', type: 'num', tip: 'Units sold per week — pulled from Shopify' },
      { key: 'incoming', label: 'Incoming', type: 'link', tip: 'Units in production, landing as stock' },
      { key: 'lead', label: 'Lead wks', type: 'num', tip: 'Weeks to make a reorder' },
      { key: 'cover', label: 'Cover', type: 'calc',
        calc: function (r) { return r.wk > 0 ? (r.onhand + r.incoming) / r.wk : Infinity; },
        fmt: function (v) { return v === Infinity ? '∞' : nf(v) + ' wk'; },
        pre: ['onhand', 'incoming', 'wk'], formula: '( On hand + Incoming ) ÷ / wk',
        plain: 'Weeks of stock left at the current sell-through rate.' },
      { key: 'reorderAt', label: 'Reorder at', type: 'calc',
        calc: function (r) { return r.wk * r.lead; }, fmt: function (v) { return nf(v); },
        pre: ['wk', 'lead'], formula: '/ wk × Lead wks',
        plain: 'The on-hand level where you must reorder to avoid a stockout — your sell-through across one lead time.' },
      { key: 'order', label: 'Order qty', type: 'num', tip: 'Suggested reorder — editable' },
      { key: 'status', label: 'Status', type: 'status', stat: fgStatus }
    ],
    components: [
      { key: 'name', label: 'Item', type: 'text', cls: 'g-prod' },
      { key: 'onhand', label: 'On hand', type: 'num' },
      { key: 'alloc', label: 'Allocated', type: 'link', tip: 'Reserved by signed production orders' },
      { key: 'free', label: 'Free', type: 'calc',
        calc: function (r) { return r.onhand - r.alloc; }, fmt: function (v, r) { return nf(v, r.unit); },
        pre: ['onhand', 'alloc'], formula: 'On hand − Allocated',
        plain: 'What is actually available to plan new orders with.' },
      { key: 'peru', label: 'Per unit', type: 'num', tip: 'How much each garment consumes' },
      { key: 'covers', label: 'Covers', type: 'calc',
        calc: function (r) { return r.peru > 0 ? Math.floor((r.onhand - r.alloc) / r.peru) : Infinity; },
        fmt: function (v) { return v === Infinity ? '∞' : nf(v) + ' u'; },
        pre: ['onhand', 'alloc', 'peru'], formula: '( On hand − Allocated ) ÷ Per unit',
        plain: 'How many more garments the free stock can build.' },
      { key: 'lead', label: 'Lead wks', type: 'num' },
      { key: 'order', label: 'Order qty', type: 'num' },
      { key: 'status', label: 'Status', type: 'status', stat: cmpStatus }
    ]
  };

  function fgStatus(r) {
    var cover = r.wk > 0 ? (r.onhand + r.incoming) / r.wk : 99;
    var reorderAt = r.wk * r.lead;
    if (r.onhand <= 0 && r.incoming > 0) return { t: 'Incoming', c: 'incoming' };
    if (r.onhand <= reorderAt && r.incoming <= 0) return { t: 'Reorder now', c: 'reorder' };
    if (cover < r.lead * 1.6 && r.incoming <= 0) return { t: 'Reorder soon', c: 'soon' };
    return { t: 'Healthy', c: 'ok' };
  }
  function cmpStatus(r) {
    var free = r.onhand - r.alloc;
    if (free <= 0) return { t: 'Fully committed', c: 'reorder' };
    if (free < r.alloc * 0.15) return { t: 'Below reorder', c: 'soon' };
    return { t: 'Healthy', c: 'ok' };
  }

  /* ---------- state ---------- */
  var ds = 'finished';
  var sel = { r: 0, c: 1 };
  var sort = { col: null, dir: 1 };
  var editing = false;

  var thead = document.getElementById('ig-thead');
  var tbody = document.getElementById('ig-tbody');
  var tfoot = document.getElementById('ig-tfoot');
  var fref = root.querySelector('.igf-ref');
  var fval = root.querySelector('.igf-val');
  var feq = root.querySelector('.igf-eq');

  function cols() { return SCHEMA[ds]; }
  function rows() { return DATA[ds]; }

  /* ---------- render ---------- */
  function render() {
    var C = cols(), R = rows();
    // header
    var hh = '<tr>';
    C.forEach(function (col, ci) {
      var sortable = col.type !== 'status' && col.type !== 'text' ? '' : '';
      var arrow = sort.col === ci ? (sort.dir > 0 ? '<span class="igh-ar">▲</span>' : '<span class="igh-ar">▼</span>') : '';
      var typecls = col.type === 'num' ? 'h-edit' : col.type === 'calc' ? 'h-calc' : col.type === 'link' ? 'h-link' : '';
      hh += '<th data-c="' + ci + '" class="' + typecls + (col.cls ? ' ' + col.cls : '') + '">' +
        '<span class="igh-lab">' + col.label + arrow + '</span></th>';
    });
    hh += '</tr>';
    thead.innerHTML = hh;

    // body
    var bh = '';
    R.forEach(function (r, ri) {
      bh += '<tr data-r="' + ri + '">';
      C.forEach(function (col, ci) {
        var cls = 'g-cell', content = '';
        if (col.type === 'text') {
          cls += ' g-text';
          content = '<span class="gc-name">' + r.name + '</span><span class="gc-sub">' + (r.sku || r.loc || '') + '</span>';
        } else if (col.type === 'num') {
          cls += ' g-edit g-num';
          content = nf(r[col.key], col.key === 'peru' ? '' : '');
        } else if (col.type === 'link') {
          cls += ' g-link g-num';
          var lv = r[col.key];
          content = '<span class="gc-link">' + (lv > 0 ? nf(lv, r.unit) : '—') + (lv > 0 ? '<svg viewBox="0 0 24 24" class="gc-li"><path d="M9 15l6-6M8.5 8.5h-1a3.5 3.5 0 100 7h2M15.5 15.5h1a3.5 3.5 0 100-7h-2" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>' : '') + '</span>';
        } else if (col.type === 'calc') {
          cls += ' g-calc g-num';
          content = col.fmt(col.calc(r), r);
        } else if (col.type === 'status') {
          cls += ' g-status';
          var s = col.stat(r);
          content = '<span class="ig-pill ' + s.c + '">' + s.t + '</span>';
        }
        bh += '<td class="' + cls + '" data-r="' + ri + '" data-c="' + ci + '">' + content + '</td>';
      });
      bh += '</tr>';
    });
    tbody.innerHTML = bh;

    // footer / totals
    tfoot.innerHTML = footRow();

    paintSel();
    updateFormulaBar();
    updateInsight();
  }

  function footRow() {
    var R = rows();
    if (ds === 'finished') {
      var oh = R.reduce(function (a, r) { return a + r.onhand; }, 0);
      var inc = R.reduce(function (a, r) { return a + r.incoming; }, 0);
      var ord = R.reduce(function (a, r) { return a + r.order; }, 0);
      var spend = R.reduce(function (a, r) { return a + r.order * r.cost; }, 0);
      return '<tr><td class="g-foot lab">Totals</td>' +
        '<td class="g-foot g-num">' + nf(oh) + '</td><td class="g-foot"></td>' +
        '<td class="g-foot g-num">' + nf(inc) + '</td><td class="g-foot"></td>' +
        '<td class="g-foot"></td><td class="g-foot"></td>' +
        '<td class="g-foot g-num strong">' + nf(ord) + '</td>' +
        '<td class="g-foot g-num">$' + nf(spend) + '</td></tr>';
    }
    var oh2 = R.reduce(function (a, r) { return a + r.onhand; }, 0);
    var al = R.reduce(function (a, r) { return a + r.alloc; }, 0);
    var ord2 = R.reduce(function (a, r) { return a + r.order; }, 0);
    return '<tr><td class="g-foot lab">Totals</td>' +
      '<td class="g-foot g-num">' + nf(oh2) + '</td>' +
      '<td class="g-foot g-num">' + nf(al) + '</td>' +
      '<td class="g-foot"></td><td class="g-foot"></td><td class="g-foot"></td>' +
      '<td class="g-foot"></td>' +
      '<td class="g-foot g-num strong">' + nf(ord2) + '</td><td class="g-foot"></td></tr>';
  }

  /* ---------- selection + formula bar ---------- */
  function cellEl(r, c) { return tbody.querySelector('[data-r="' + r + '"][data-c="' + c + '"]'); }

  function paintSel() {
    tbody.querySelectorAll('.sel,.trace').forEach(function (e) { e.classList.remove('sel', 'trace'); });
    thead.querySelectorAll('.col-sel').forEach(function (e) { e.classList.remove('col-sel'); });
    var el = cellEl(sel.r, sel.c);
    if (!el) return;
    el.classList.add('sel');
    var th = thead.querySelector('[data-c="' + sel.c + '"]');
    if (th) th.classList.add('col-sel');
    // trace precedents for computed cells
    var col = cols()[sel.c];
    if (col && col.type === 'calc' && col.pre) {
      col.pre.forEach(function (k) {
        var ci = colIndex(k);
        var pe = cellEl(sel.r, ci);
        if (pe) pe.classList.add('trace');
      });
    }
  }
  function colIndex(key) { var C = cols(); for (var i = 0; i < C.length; i++) if (C[i].key === key) return i; return -1; }

  function updateFormulaBar() {
    var col = cols()[sel.c], r = rows()[sel.r];
    if (!col || !r) return;
    fref.textContent = (r.sku || (r.name || '').slice(0, 10)) + ' · ' + col.label;
    if (col.type === 'calc') {
      feq.classList.add('on');
      fval.innerHTML = '<span class="igf-formula">' + col.formula + '</span> <span class="igf-arrow">=</span> <b>' + col.fmt(col.calc(r), r) + '</b><span class="igf-plain">' + col.plain + '</span>';
    } else if (col.type === 'num') {
      feq.classList.remove('on');
      fval.innerHTML = '<b>' + nf(r[col.key]) + '</b><span class="igf-plain">' + (col.tip || 'Editable — type to change it; everything downstream updates.') + '</span>';
    } else if (col.type === 'link') {
      feq.classList.remove('on');
      fval.innerHTML = '<b>' + (r[col.key] > 0 ? nf(r[col.key], r.unit) : '—') + '</b><span class="igf-plain">' + (col.tip || 'Linked from your orders — not edited here.') + '</span>';
    } else if (col.type === 'status') {
      feq.classList.remove('on');
      var s = col.stat(r);
      fval.innerHTML = '<b>' + s.t + '</b><span class="igf-plain">Computed from cover, lead time and what is already on the way.</span>';
    } else {
      feq.classList.remove('on');
      fval.innerHTML = '<b>' + r.name + '</b><span class="igf-plain">' + (r.sku || r.loc || '') + '</span>';
    }
  }

  function select(r, c) {
    var R = rows().length, C = cols().length;
    sel.r = Math.max(0, Math.min(R - 1, r));
    sel.c = Math.max(0, Math.min(C - 1, c));
    paintSel();
    updateFormulaBar();
  }

  /* ---------- editing ---------- */
  function startEdit(initial) {
    var col = cols()[sel.c];
    if (!col || col.type !== 'num') return;
    var el = cellEl(sel.r, sel.c);
    if (!el) return;
    editing = true;
    el.classList.add('editing');
    el.setAttribute('contenteditable', 'true');
    var raw = rows()[sel.r][col.key];
    el.textContent = initial != null ? initial : String(raw);
    el.focus();
    var range = document.createRange();
    range.selectNodeContents(el);
    if (initial != null) range.collapse(false);
    var s = window.getSelection(); s.removeAllRanges(); s.addRange(range);
  }
  function commitEdit(move) {
    if (!editing) return;
    var col = cols()[sel.c];
    var el = cellEl(sel.r, sel.c);
    var v = parseFloat((el.textContent || '').replace(/[^0-9.\-]/g, ''));
    if (isNaN(v) || v < 0) v = 0;
    if (col.key === 'peru') v = Math.round(v * 10) / 10; else v = Math.round(v);
    rows()[sel.r][col.key] = v;
    editing = false;
    flash = { r: sel.r };
    render();
    if (move) select(sel.r + 1, sel.c);
  }
  function cancelEdit() { editing = false; render(); }
  var flash = null;

  /* ---------- actions ---------- */
  function fillDown() {
    var col = cols()[sel.c];
    if (col.type !== 'num') { toast('Pick an editable (white) cell to fill down from.'); return; }
    var v = rows()[sel.r][col.key];
    for (var i = sel.r + 1; i < rows().length; i++) rows()[i][col.key] = v;
    render();
    toast('Filled ' + col.label + ' down · ' + (rows().length - sel.r - 1) + ' cells');
  }
  function sortBy(ci) {
    var col = cols()[ci];
    if (col.type === 'text' || col.type === 'status') return;
    if (sort.col === ci) sort.dir = -sort.dir; else { sort.col = ci; sort.dir = 1; }
    var val = function (r) {
      if (col.type === 'calc') return col.calc(r);
      return r[col.key];
    };
    DATA[ds].sort(function (a, b) { return (val(a) - val(b)) * sort.dir; });
    render();
  }
  function reset() {
    DATA[ds] = clone(ORIG[ds]);
    sort = { col: null, dir: 1 };
    render();
    toast('Grid reset to last sync');
  }

  function updateInsight() {
    var box = document.getElementById('ig-insight'), btn = document.getElementById('ig-applybtn');
    if (!box) return;
    if (ds === 'finished') {
      var now = rows().filter(function (r) { return fgStatus(r).c === 'reorder'; });
      var spend = rows().reduce(function (a, r) { return a + r.order * r.cost; }, 0);
      var units = rows().reduce(function (a, r) { return a + r.order; }, 0);
      if (now.length) {
        box.innerHTML = '<b>' + now.length + ' style' + (now.length > 1 ? 's are' : ' is') + ' at or below the reorder point.</b> Your suggested orders total <b>' + nf(units) + ' units · $' + nf(spend) + '</b> — already checked against component cover. Edit any cell and this recalculates.';
      } else {
        box.innerHTML = '<b>Nothing is below its reorder point right now.</b> Cover clears lead time on every style. Your draft orders total <b>' + nf(units) + ' units · $' + nf(spend) + '</b>.';
      }
      if (btn) btn.textContent = 'Draft ' + (now.length || '') + ' reorder' + (now.length === 1 ? '' : 's');
    } else {
      var blocked = rows().filter(function (r) { return cmpStatus(r).c !== 'ok'; });
      box.innerHTML = '<b>' + blocked.length + ' component' + (blocked.length === 1 ? '' : 's') + ' won\u2019t cover committed production.</b> Free stock is what is left after every signed order reserves its share — raise On hand to see a line clear instantly.';
      if (btn) btn.textContent = 'Draft component POs';
    }
  }

  function toast(msg) {
    if (window.clewaToast) { window.clewaToast(msg); return; }
    var t = document.getElementById('toast');
    if (!t) return;
    var m = t.querySelector('.t-msg'); if (m) m.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove('show'); }, 2600);
  }

  /* ---------- events ---------- */
  thead.addEventListener('click', function (e) {
    var th = e.target.closest('th'); if (!th) return;
    sortBy(+th.getAttribute('data-c'));
  });
  tbody.addEventListener('mousedown', function (e) {
    var td = e.target.closest('td'); if (!td) return;
    if (editing) commitEdit(false);
    select(+td.getAttribute('data-r'), +td.getAttribute('data-c'));
  });
  tbody.addEventListener('dblclick', function (e) {
    var td = e.target.closest('td'); if (!td) return;
    select(+td.getAttribute('data-r'), +td.getAttribute('data-c'));
    startEdit();
  });

  var grid = document.getElementById('ig-grid');
  grid.setAttribute('tabindex', '0');
  grid.addEventListener('keydown', function (e) {
    if (editing) {
      if (e.key === 'Enter') { e.preventDefault(); commitEdit(true); grid.focus(); }
      else if (e.key === 'Escape') { e.preventDefault(); cancelEdit(); grid.focus(); }
      else if (e.key === 'Tab') { e.preventDefault(); commitEdit(false); select(sel.r, sel.c + (e.shiftKey ? -1 : 1)); }
      return;
    }
    var k = e.key;
    if (k === 'ArrowDown') { e.preventDefault(); select(sel.r + 1, sel.c); }
    else if (k === 'ArrowUp') { e.preventDefault(); select(sel.r - 1, sel.c); }
    else if (k === 'ArrowLeft') { e.preventDefault(); select(sel.r, sel.c - 1); }
    else if (k === 'ArrowRight') { e.preventDefault(); select(sel.r, sel.c + 1); }
    else if (k === 'Tab') { e.preventDefault(); select(sel.r, sel.c + (e.shiftKey ? -1 : 1)); }
    else if (k === 'Enter' || k === 'F2') { e.preventDefault(); startEdit(); }
    else if ((e.metaKey || e.ctrlKey) && (k === 'd' || k === 'D')) { e.preventDefault(); fillDown(); }
    else if (/^[0-9.]$/.test(k)) { e.preventDefault(); startEdit(k); }
    else if (k === 'Backspace' || k === 'Delete') { e.preventDefault(); startEdit('0'); }
  });

  // dataset tabs
  root.querySelectorAll('.ig-tab').forEach(function (tab) {
    tab.addEventListener('click', function () {
      root.querySelectorAll('.ig-tab').forEach(function (t) { t.classList.toggle('on', t === tab); });
      ds = tab.getAttribute('data-ds');
      sort = { col: null, dir: 1 };
      sel = { r: 0, c: 1 };
      render();
    });
  });

  // toolbar
  root.addEventListener('click', function (e) {
    var b = e.target.closest('[data-act]'); if (!b) return;
    var act = b.getAttribute('data-act');
    if (act === 'filldown') { fillDown(); grid.focus(); }
    else if (act === 'reset') reset();
    else if (act === 'export') toast('Exported inventory.xlsx — live formulas preserved · ' + (ds === 'finished' ? 'finished goods' : 'components') + ' sheet');
    else if (act === 'apply') toast(ds === 'finished' ? 'Reorders drafted — pre-checked against component cover' : 'Component POs drafted — suppliers pre-filled');
  });

  render();

  /* hook for the MVP loop — mutate data (and originals) then re-render */
  window.clewaGridSet = function (fn) { fn(DATA, ORIG); render(); };
})();
