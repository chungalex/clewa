/* ===== CLEWA app shell — routing, order detail, PO generator ===== */
(function () {
  'use strict';

  var titles = {
    home: ['Home', 'Maison Ardent · FW26'],
    orders: ['Orders', '3 active · 1 closing'],
    order: ['Wool Overcoat', 'Order #2491 · Atelier Norte'],
    calendar: ['Calendar', 'August 2026'],
    finances: ['Finances', 'This season'],
    inventory: ['Inventory', 'Synced with Shopify'],
    inbox: ['Inbox', 'Factory messages · translated'],
    messages: ['Messages', 'Live chat · auto-translated'],
    techpack: ['Tech pack builder', 'Wool Overcoat · v4 draft'],
    ask: ['Ask Clewa', 'Your production copilot'],
    seasonclose: ['Season close', 'FW26 · auto-compiled'],
    team: ['Team & roles', 'Maison Ardent workspace'],
    quality: ['Quality control', 'Shared inspection · AQL 2.5'],
    sharedview: ['Shared workspace', 'Order #2491 · with Atelier Norte'],
    planning: ['Planning', 'FW26 → SS27 · the season ahead'],
    documents: ['Documents', '48 files'],
    intel: ['Intelligence', 'Morning briefing · Aug 13'],
    contacts: ['Contacts', '6 factories · 14 people'],
    po: ['New purchase order', 'Order #2491']
  };

  // guided-mode per-page coaching
  var coach = {
    home: '<b>This is your home base.</b> In Guided mode I surface the one thing that needs you and walk you through your first order, step by step.',
    orders: '<b>Every order you\u2019re making lives here.</b> Each row shows what stage it\u2019s at and what\u2019s next. <span class="cb-do">Click an order</span> to see its full story.',
    samples: '<b>Samples are how you buy certainty before buying bulk.</b> Each round proves one thing \u2014 design, fit, then the exact garment. Measure against the spec, pin comments to photos, and every decision lands on the record.',
    techpack: '<b>A tech pack is the recipe for your garment.</b> Fill it in and I\u2019ll flag anything a factory would otherwise have to guess — so nothing comes back wrong.',
    inbox: '<b>Factory emails land here, translated.</b> You don\u2019t have to connect anything — forward a message or paste it, and I file the quote and dates onto the order.',
    messages: '<b>Chat with your factory in plain English.</b> They read it in their language and reply in theirs — I translate both ways and keep it on the order.',
    calendar: '<b>This plans backward from your launch date.</b> <span class="cb-do">Set a launch</span> and I\u2019ll tell you the date you must place your order to make it.',
    finances: '<b>Where your money is going.</b> What you\u2019ve committed, what\u2019s due, and your margin — with the exchange rate locked at order so your cost can\u2019t drift.',
    intel: '<b>Your morning briefing.</b> I sweep every order overnight and tell you what\u2019s urgent, what can wait, and what\u2019s running fine — in plain language.',
    ask: '<b>Stuck? Just ask.</b> I know your orders, costs and factories, and I answer with the source — like having a production manager on call.',
    inventory: '<b>Everything you have, in one count.</b> Finished stock, plus the trims and fabric an order uses — so you never run short mid-production.',
    quality: '<b>The quality check before you pay the balance.</b> You and the factory inspect the same list — it has to pass before money moves.',
    sharedview: '<b>The same order, open on both screens.</b> You and your factory see identical status, dates and messages — but your costs and margins stay private to you.',
    planning: '<b>Decide what next season should be.</b> Set a budget, shape the collection, and move ideas from concept to ready-to-make.',
    seasonclose: '<b>Your season, summed up.</b> What sold, what it earned and which factory delivered — the report you\u2019d send your team or an investor.',
    team: '<b>Bring people in with the right view.</b> Your designer, your ops lead — and factories see only their own order, never your costs.',
    documents: '<b>Every file an order creates, filed for you.</b> Tech packs, POs, invoices, inspection reports — versioned and searchable.',
    contacts: '<b>Your factories and the people at them.</b> With a track record built in, so you know who actually delivers.',
    po: '<b>This makes your purchase order.</b> Fill the form and I build a clean PO you can export and send — the document that places your order.'
  };
  // guided-mode glossary — jargon explained per page
  var terms = {
    samples: [['Fit sample', 'Made in the right fabric to test measurements on a body \u2014 where most fixes happen.'], ['PP sample', 'Pre-production: the exact garment \u2014 fabric, trims, labels \u2014 made once. Approving it unlocks bulk.'], ['TOP', 'Top of production \u2014 pulled from the first bulk units to prove the line matches what you approved.'], ['Gold seal', 'The approved sample QC measures bulk against \u2014 the physical standard.'], ['POM', 'Point of measure \u2014 a named spot (chest, sleeve) with a spec number and tolerance.']],
    techpack: [['Tech pack', 'The spec sheet a factory builds from — fabric, measurements, trims, labels.'], ['BOM', 'Bill of materials: every component a garment needs, listed and counted.'], ['GSM', 'Grams per square metre — how heavy/thick a fabric is. Lock it or quality drifts.'], ['POM', 'Points of measure — the exact dimensions (e.g. body length) the factory sews to.']],
    orders: [['MOQ', 'Minimum order quantity — the fewest units a factory will make.'], ['Lead time', 'How long from placing the order to it being ready to ship.'], ['PP sample', 'Pre-production sample — the final approval before bulk cutting starts.']],
    calendar: [['Backward planning', 'Start from your launch date and count back so you know when to order.'], ['Critical path', 'The chain of steps that decides your timeline — slip one and the drop slips.'], ['Tet', 'Vietnam\u2019s New Year — factories close for weeks. Plan around it.']],
    finances: [['Landed cost', 'True cost per unit once freight and duties are included — not just the quote.'], ['Margin', 'The share of the retail price that\u2019s profit after landed cost.'], ['FX lock', 'Fixing the exchange rate at order, so a currency swing can\u2019t raise your bill.'], ['Deposit', 'The upfront payment (often 30%) that books your production slot.']],
    quality: [['AQL', 'Acceptable Quality Limit — the defect rate an inspection allows before it fails.'], ['Inspection', 'Checking a sample of the run against the spec before you pay the balance.'], ['Major / minor', 'How serious a defect is — majors are capped tighter than minors.']],
    inventory: [['SKU', 'A single sellable variant — e.g. the black tee in size M.'], ['Sell-through', 'How fast stock is selling — tells you when to reorder.'], ['Deadstock', 'Material or units sitting unused, tying up cash.'], ['Wastage', 'Components lost in cutting/sewing — plan a little extra or you fall short.']],
    po: [['PO', 'Purchase order — the document that formally places and prices your order.'], ['Incoterm', 'Who pays/handles shipping at each leg (e.g. FOB = you take over at the port).'], ['FOB', 'Free On Board — factory loads it on the ship; freight from there is yours.']],
    inbox: [['Incoterm', 'Shipping responsibility split between you and the factory.'], ['Quote', 'The factory\u2019s price and terms offer — Clewa reads it onto the order.']],
    sharedview: [['Shared record', 'The single agreed version of the order both sides see and sign.'], ['Guest access', 'A factory login that shows only their order — never your costs.']],
    planning: [['Open-to-buy', 'The budget you have left to commit this season.'], ['Carryover', 'A proven style you repeat, vs. \u201cnewness\u201d you design fresh.'], ['Line plan', 'The shape of the collection — how many styles, at what prices.']]
  };

  function setCoach(name) {
    var tx = document.getElementById('coachTx');
    var bar = document.getElementById('coachBar');
    var termBox = document.getElementById('coachTerms');
    if (termBox) {
      var ts = terms[name];
      if (ts && ts.length) {
        termBox.innerHTML = ts.map(function (t) { return '<div class="ct-item"><b>' + t[0] + '</b>' + t[1] + '</div>'; }).join('');
      } else { termBox.innerHTML = ''; }
    }
    if (!tx || !bar) return;
    if (coach[name]) { tx.innerHTML = coach[name]; bar.style.display = ''; }
    else { bar.style.display = 'none'; }
  }

  function setPage(name) {
    document.querySelectorAll('.page').forEach(function (p) {
      p.classList.toggle('on', p.getAttribute('data-page') === name);
    });
    document.querySelectorAll('.nav-i').forEach(function (n) {
      n.classList.toggle('on', n.getAttribute('data-go') === name);
    });
    setCoach(name);
    var t = titles[name] || ['', ''];
    var tt = document.getElementById('tb-title');
    var tc = document.getElementById('tb-crumb');
    if (tt) tt.textContent = t[0];
    if (tc) tc.textContent = t[1];
    var scroll = document.querySelector('.page-scroll');
    if (scroll) scroll.scrollTop = 0;
  }

  // delegated navigation: any element with data-go
  document.addEventListener('click', function (e) {
    var go = e.target.closest('[data-go]');
    if (go) { setPage(go.getAttribute('data-go')); return; }
  });

  // order-detail sub-tabs
  document.addEventListener('click', function (e) {
    var tab = e.target.closest('.od-tab');
    if (!tab) return;
    var view = tab.getAttribute('data-od');
    tab.parentElement.querySelectorAll('.od-tab').forEach(function (t) { t.classList.toggle('on', t === tab); });
    document.querySelectorAll('.od-view').forEach(function (v) {
      v.classList.toggle('on', v.getAttribute('data-od') === view);
    });
  });

  // generic sub-toggle groups (calendar timeline/month, etc.)
  document.querySelectorAll('[data-toggle-group]').forEach(function (group) {
    var name = group.getAttribute('data-toggle-group');
    group.addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-view]');
      if (!btn) return;
      var view = btn.getAttribute('data-view');
      group.querySelectorAll('button[data-view]').forEach(function (b) { b.classList.toggle('on', b === btn); });
      document.querySelectorAll('[data-view-panel="' + name + '"]').forEach(function (p) {
        p.classList.toggle('active', p.getAttribute('data-view') === view);
      });
    });
  });

  /* ---------- toast ---------- */
  var toastEl = document.getElementById('toast');
  var toastTimer;
  function toast(msg) {
    if (!toastEl) return;
    toastEl.querySelector('.t-msg').textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, 2600);
  }
  window.clewaToast = toast;
  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-toast]');
    if (t) toast(t.getAttribute('data-toast'));
  });

  /* ---------- PO generator: live preview ---------- */
  function money(n) { return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function moneyk(n) { return '$' + n.toLocaleString('en-US'); }

  function bindPO() {
    var qty = document.getElementById('po-qty');
    var price = document.getElementById('po-price');
    var deposit = document.getElementById('po-deposit');
    if (!qty || !price) return;

    function upd() {
      var q = parseFloat(qty.value) || 0;
      var p = parseFloat(price.value) || 0;
      var dep = parseFloat(deposit.value) || 0;
      var sub = q * p;
      var depAmt = sub * (dep / 100);
      var bal = sub - depAmt;

      setText('pod-qty', q.toLocaleString('en-US'));
      setText('pod-price', money(p));
      setText('pod-line', money(sub));
      setText('pod-sub', money(sub));
      setText('pod-grand', moneyk(Math.round(sub)));
      setText('pod-dep', money(depAmt) + ' (' + dep + '%)');
      setText('pod-bal', money(bal));
      setText('pod-depterm', dep + '% deposit · ' + (100 - dep) + '% on QC pass');
    }
    function setText(id, v) { var el = document.getElementById(id); if (el) el.textContent = v; }

    // text fields mirror into the document
    var mirrors = [
      ['po-product', 'pod-product'],
      ['po-factory', 'pod-factory'],
      ['po-incoterm', 'pod-incoterm'],
      ['po-ship', 'pod-ship'],
      ['po-num', 'pod-num']
    ];
    mirrors.forEach(function (m) {
      var src = document.getElementById(m[0]);
      if (!src) return;
      src.addEventListener('input', function () { setText(m[1], src.value); });
    });

    [qty, price, deposit].forEach(function (el) { el.addEventListener('input', upd); });
    upd();
  }
  bindPO();

  // start on home
  setPage('home');

  /* ---------- tech-pack builder: guided gap fixing ---------- */
  (function () {
    var LS_KEY = 'clewa-tp-fixed';
    var gapMeta = {
      lining:  { sec: 'materials', flOk: '<b>Lining specified.</b> The factory cuts without guessing \u2014 no extra sampling round.' },
      care:    { sec: 'labels',    flOk: '<b>Care label drafted from your fabric.</b> Compliant content for EU + US \u2014 nothing for customs to hold.' }
    };
    function fixedMap() {
      try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}'); } catch (e) { return {}; }
    }
    function saveFixed(m) { try { localStorage.setItem(LS_KEY, JSON.stringify(m)); } catch (e) {} }

    function applyFix(gap, fillText, silent) {
      var field = document.querySelector('.tpv[data-gap="' + gap + '"]');
      var helper = document.querySelector('.tp-helper[data-helper="' + gap + '"]');
      if (!field) return;
      field.classList.remove('miss');
      field.removeAttribute('role'); field.removeAttribute('tabindex');
      field.textContent = fillText;
      if (!silent) { field.classList.add('fixed-now'); setTimeout(function () { field.classList.remove('fixed-now'); }, 600); }
      if (helper) helper.hidden = true;
      var meta = gapMeta[gap];
      if (meta) {
        var c = document.getElementById('tpc-' + meta.sec);
        if (c) { c.classList.remove('warn'); c.classList.add('done'); c.innerHTML = '<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5L20 7"/></svg>'; }
        var n = document.getElementById('tpn-' + meta.sec);
        if (n) n.textContent = meta.sec === 'materials' ? '4 of 4' : '4 of 4';
        var fl = document.getElementById('tpfl-' + gap);
        if (fl) { fl.querySelector('.fl-d').className = 'fl-d ok'; fl.querySelector('div').innerHTML = meta.flOk; }
      }
      updateMeter(silent);
    }

    function updateMeter(silent) {
      var left = document.querySelectorAll('.tpv.miss').length;
      var pct = left === 2 ? 82 : left === 1 ? 91 : 100;
      var ring = document.getElementById('tpRing');
      var val = document.getElementById('tpRingVal');
      var lab = document.getElementById('tpMeterLab');
      var gc = document.getElementById('tpGapCount');
      var send = document.getElementById('tpSend');
      if (val) val.textContent = pct + '%';
      if (ring) {
        var col = pct === 100 ? '#4A6B52' : 'var(--thread)';
        ring.style.background = 'conic-gradient(' + col + ' ' + pct + '%, var(--hair) 0)';
        ring.classList.toggle('complete', pct === 100);
      }
      if (gc) gc.textContent = left === 0 ? 'no gaps' : left + (left === 1 ? ' gap' : ' gaps');
      if (lab) {
        lab.innerHTML = pct === 100
          ? '<b>Factory-safe.</b> Every field a coat factory needs is answered \u2014 send it with nothing left to guess.'
          : '<b>Almost ready.</b> ' + left + (left === 1 ? ' gap' : ' gaps') + ' to close before this is factory-safe \u2014 click a highlighted field to fix it.';
      }
      if (send) {
        send.classList.toggle('tp-go', pct === 100);
        send.classList.toggle('ghost', pct !== 100);
      }
      var hooks = [
        ['tpHomeNext', pct === 100 ? 'Tech pack <b>factory-safe</b> \u2014 ready to send for quotes' : 'Tech pack <b>' + pct + '%</b> \u2014 ' + left + (left === 1 ? ' gap' : ' gaps') + ' to fix, then it\u2019s ready for quotes'],
        ['tpFeedSub', pct === 100 ? 'factory-safe \u2014 ready to send' : left + (left === 1 ? ' gap' : ' gaps') + ' to close before it can go out'],
        ['tpPipeSub', pct === 100 ? '100% \u00b7 factory-safe \u2014 ready for quotes' : pct + '% \u00b7 ' + left + (left === 1 ? ' gap' : ' gaps') + ' \u2014 open the builder']
      ];
      hooks.forEach(function (hk) { var el = document.getElementById(hk[0]); if (el) el.innerHTML = hk[1]; });
      if (pct === 100 && !silent) toast('Tech pack complete \u2014 factory-safe. v1 saved.');
    }

    // open/close helpers
    document.addEventListener('click', function (e) {
      var miss = e.target.closest('.tpv.miss[data-gap]');
      if (miss) {
        var gap = miss.getAttribute('data-gap');
        document.querySelectorAll('.tp-helper').forEach(function (h) {
          h.hidden = h.getAttribute('data-helper') !== gap ? true : !h.hidden;
        });
        return;
      }
      var opt = e.target.closest('.tph-opt[data-gap]');
      if (opt) {
        var g = opt.getAttribute('data-gap');
        var fill = opt.getAttribute('data-fill');
        applyFix(g, fill, false);
        var m = fixedMap(); m[g] = fill; saveFixed(m);
        toast('Added to the spec \u2014 the factory sees it in their language');
      }
    });
    document.addEventListener('keydown', function (e) {
      if ((e.key === 'Enter' || e.key === ' ') && e.target.classList && e.target.classList.contains('miss')) {
        e.preventDefault(); e.target.click();
      }
    });

    // restore prior fixes
    var saved = fixedMap();
    Object.keys(saved).forEach(function (g) { applyFix(g, saved[g], true); });
  })();

})();
