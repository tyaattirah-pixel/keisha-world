// Keisha's World — game app
(function () {
  "use strict";

  /* ======================= CONTENT ======================= */
  var STAGES = [];
  WORLDS.forEach(function (w) {
    w.islands.forEach(function (isl) {
      STAGES.push({ world: w.id, zh: isl.zh, en: isl.en, words: parseWords(isl.w).map(function (x) { x.stage = STAGES.length; return x; }) });
    });
  });
  var ALL = [].concat.apply([], STAGES.map(function (s) { return s.words; }));
  var BY_ZH = {}; ALL.forEach(function (w) { BY_ZH[w.zh] = w; });
  var POWER_ITEMS = {}; Object.keys(POWER).forEach(function (y) { POWER_ITEMS[y] = parseWords(POWER[y]); });

  var RULES = {
    perStage: 15, zh2en: 10, en2zh: 5,
    coinZh2En: 5, coinEn2Zh: 3, hintCostZh2En: 3, hintCostEn2Zh: 1,
    passScore: 12, passMaxHints: 4,
    speedFromStage: 7, speedMs: 5000,
    missDaysPerPenalty: 3, penaltyCoins: 5,
    coinsPerRM: 100, testEveryDays: 28, testReward: 20
  };

  var SHOP = {
    hair: [["black", "Black", 0], ["brown", "Brown", 80], ["lilac", "Lilac", 120], ["pink", "Pink", 150], ["blonde", "Blonde", 150]],
    style: [["long", "Long", 0], ["bob", "Bob", 100], ["buns", "Space buns", 150]],
    top: [["purple", "Purple", 0], ["black", "Black", 60], ["mint", "Mint", 80], ["yellow", "Sunny", 80], ["red", "Red", 100]],
    skirt: [["pink", "Pink", 0], ["black", "Black", 60], ["blue", "Blue", 80], ["white", "White", 80]],
    phones: [["white", "White", 0], ["pink", "Pink", 60], ["black", "Black", 60], ["gold", "Gold", 200]],
    pet: [["cat", "Cat", 150, 0], ["bunny", "Bunny", 180, 0], ["puppy", "Puppy", 200, 0], ["panda", "Panda", 250, 10]],
    petacc: [["bow", "Pet bow", 40], ["glasses", "Cool glasses", 60], ["crown", "Pet crown", 90]]
  };
  var SHOP_TABS = [["hair", "Hair colour"], ["style", "Hair style"], ["top", "Tops"], ["skirt", "Skirts"], ["phones", "Headphones"], ["pet", "Pets"], ["petacc", "Pet stuff"]];

  /* ======================= STATE ======================= */
  function blank() {
    return {
      v: 1, coins: 0, created: Date.now(),
      look: { hair: "black", style: "long", top: "purple", skirt: "pink", phones: "white" },
      owned: ["hair:black", "style:long", "top:purple", "skirt:pink", "phones:white"],
      pet: null, petsOwned: [], petAcc: [],
      unlocked: 0, stageBest: {},
      checkin: { last: null, streak: 0, days: [], charged: 0 },
      lastTestAt: 0, refunded: [], welcomed: false
    };
  }
  var S = blank(), FLAGS = {}, HIST = [], CASH = [], ONLINE = false, PIN_SET = false;
  var LS = { state: "kw_state", events: "kw_events", cash: "kw_cash", pin: "kw_pin" };
  function lsGet(k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

  function apiGet(path, pin) {
    return fetch(path, { headers: pin ? { "x-pin": pin } : {} }).then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || r.status); return j; }); });
  }
  function apiPost(path, body, pin) {
    var h = { "content-type": "application/json" }; if (pin) h["x-pin"] = pin;
    return fetch(path, { method: "POST", headers: h, body: JSON.stringify(body) }).then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || r.status); return j; }); });
  }

  var saveTimer = null;
  function save() {
    lsSet(LS.state, S);
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () { if (ONLINE) apiPost("/api/state", { state: S }).catch(function () {}); }, 400);
  }
  var queue = [];
  function log(type, item, data) {
    var e = Object.assign({ ts: Date.now(), type: type, item: item == null ? null : item }, data || {});
    queue.push(e);
    var local = lsGet(LS.events, []); local.push(e); if (local.length > 20000) local = local.slice(-20000); lsSet(LS.events, local);
    if (type === "answer" || type === "stage_end" || type === "test_end") HIST.push(e);
    flush();
  }
  var flushing = false;
  function flush() {
    if (!ONLINE || flushing || !queue.length) return;
    flushing = true;
    var batch = queue.splice(0, 100);
    apiPost("/api/events", { events: batch }).then(function () { flushing = false; if (queue.length) flush(); })
      .catch(function () { queue = batch.concat(queue); flushing = false; setTimeout(flush, 5000); });
  }

  function boot() {
    apiGet("/api/state").then(function (r) {
      ONLINE = true; PIN_SET = r.pinSet; FLAGS = r.flags || {};
      if (r.state) S = Object.assign(blank(), r.state); else { S = blank(); try { localStorage.removeItem(LS.state); localStorage.removeItem(LS.events); localStorage.removeItem(LS.cash); } catch (e) {} } // online with no saved game = fresh start
      HIST = (r.events || []).slice().reverse();
      CASH = r.cash || [];
      afterLoad();
    }).catch(function () {
      ONLINE = false;
      var l = lsGet(LS.state, null); if (l) S = Object.assign(blank(), l);
      HIST = lsGet(LS.events, []).filter(function (e) { return e.type === "answer" || e.type === "stage_end" || e.type === "test_end"; });
      CASH = lsGet(LS.cash, []);
      PIN_SET = !!lsGet(LS.pin, null);
      afterLoad();
    });
  }
  function afterLoad() {
    // give back coins for declined cash-out requests
    CASH.forEach(function (c) {
      if (c.status === "declined" && S.refunded.indexOf(c.id) < 0) { S.coins += c.coins; S.refunded.push(c.id); toast("Mommy said not now: " + c.coins + " coins are back in your wallet."); }
    });
    applyMissedDays();
    save();
    if (!S.welcomed) welcome(); else lobby();
  }

  /* ======================= HELPERS ======================= */
  var app = document.getElementById("app"), layer = document.getElementById("layer");
  function $(s) { return app.querySelector(s); }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function shuffle(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function dstr(d) { d = d || new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  function daysBetween(a, b) { return Math.round((new Date(b + "T00:00:00") - new Date(a + "T00:00:00")) / 86400000); }
  function fmtTime(ms) { var s = Math.round(ms / 1000), m = Math.floor(s / 60); return (m ? m + "m " : "") + (s % 60) + "s"; }
  function fmtDate(ts) { return new Date(ts).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }); }
  function coin() { return '<i class="coin"></i>'; }
  var toastT;
  function toast(msg) { var t = document.querySelector(".toast"); if (!t) { t = document.createElement("div"); t.className = "toast"; document.body.appendChild(t); } t.textContent = msg; t.classList.remove("hidden"); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.add("hidden"); }, 3200); }
  var zhVoice = null;
  function pickVoice() { try { var v = speechSynthesis.getVoices(); zhVoice = v.find(function (x) { return /zh[-_]CN/i.test(x.lang); }) || v.find(function (x) { return /^zh/i.test(x.lang); }) || null; } catch (e) {} }
  try { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; } catch (e) {}
  function speak(t) { try { speechSynthesis.cancel(); var u = new SpeechSynthesisUtterance(t); u.lang = "zh-CN"; if (zhVoice) u.voice = zhVoice; u.rate = 0.75; speechSynthesis.speak(u); } catch (e) { toast("Sound is not available on this device"); } }
  var avatarHandle = null;
  function mountAvatar(sel, opts) { if (avatarHandle) avatarHandle.destroy(); var el = $(sel); if (el) avatarHandle = Avatar3D.mount(el, opts); }
  function stats(zh) {
    var s = { right: 0, wrong: 0, clean: 0, hints: 0, last: [] };
    HIST.forEach(function (e) { if (e.type === "answer" && e.item === zh) { if (e.correct) s.right++; else s.wrong++; if (e.correct && !(e.hints || 0)) s.clean++; s.hints += e.hints || 0; s.last.push(e.correct && !(e.hints || 0) ? 1 : 0); } });
    s.last = s.last.slice(-3);
    s.mastered = s.last.length === 3 && s.last.every(Boolean);
    s.weak = s.wrong * 2 + s.hints - s.clean;
    return s;
  }
  function todayCount() { var t = dstr(); return HIST.filter(function (e) { return e.type === "answer" && dstr(new Date(e.ts)) === t; }).length; }

  /* ======================= CHECK-IN ======================= */
  function applyMissedDays() {
    var c = S.checkin; if (!c.last) return;
    var gap = daysBetween(c.last, dstr()) - 1; // full days missed since last check-in
    var blocks = Math.floor(Math.max(0, gap) / RULES.missDaysPerPenalty);
    var add = blocks - (c.charged || 0);
    if (add > 0) {
      var lose = Math.min(S.coins, add * RULES.penaltyCoins);
      S.coins -= lose; c.charged = blocks; c.streak = 0;
      log("penalty", null, { coins: lose, missed: gap });
      setTimeout(function () { toast("You missed " + gap + " days. " + lose + " coins flew away! Play today to start a new streak."); }, 600);
    }
  }
  function doCheckin() {
    var c = S.checkin, t = dstr();
    if (c.last === t) return false;
    c.streak = c.last && daysBetween(c.last, t) === 1 ? c.streak + 1 : 1;
    c.last = t; c.charged = 0;
    c.days.push(t); c.days = c.days.slice(-60);
    log("checkin", null, { streak: c.streak });
    return true;
  }

  /* ======================= WELCOME ======================= */
  function welcome() {
    app.className = "";
    app.innerHTML = '<div class="col" style="align-items:center;text-align:center;padding-top:30px">' +
      '<div class="title">KEISHA’S WORLD</div><div class="zh" style="font-size:20px">琦莎的世界</div>' +
      '<div id="av" class="av-stage" style="width:260px;height:300px"></div><div class="platform"></div>' +
      '<div class="card" style="margin-top:26px;text-align:left"><b>Hi Keisha!</b><br>Learn Chinese words, earn coins, unlock islands, and dress up your avatar. 🌟<br><br>First, let’s do a quick <b>Power Check</b> to find your level. It’s not a school test: just tap <b>“I don’t know”</b> when you’re not sure. You get <b>' + RULES.testReward + ' coins</b> for finishing!</div>' +
      '<button class="btn big green" id="go">START</button><button class="btn" id="later">Later</button></div>';
    mountAvatar("#av", { look: S.look, size: 1.1 });
    $("#go").onclick = function () { S.welcomed = true; save(); powerCheck(); };
    $("#later").onclick = function () { S.welcomed = true; save(); lobby(); };
  }

  /* ======================= LOBBY ======================= */
  function testDue() {
    if (!S.lastTestAt) return true;
    if (FLAGS.testRequestedAt && FLAGS.testRequestedAt > S.lastTestAt) return true;
    return Date.now() - S.lastTestAt > RULES.testEveryDays * 86400000;
  }
  function lobby() {
    app.className = "";
    var c = S.checkin, today = dstr(), done = todayCount();
    var now = new Date(), dow = (now.getDay() + 6) % 7, days = "";
    ["M", "T", "W", "T", "F", "S", "S"].forEach(function (l, i) {
      var d = new Date(now); d.setDate(now.getDate() - dow + i); var ds = dstr(d);
      var cls = c.days.indexOf(ds) >= 0 ? "ok" : ds === today ? "today" : ds < today ? "miss" : "";
      days += '<div class="day ' + cls + '"><b>' + (cls === "ok" ? "✓" : "") + "</b>" + l + "</div>";
    });
    var lvl = Math.min(S.unlocked + 1, STAGES.length);
    var map = "";
    STAGES.forEach(function (s, i) {
      var cls = i < S.unlocked ? "done" : i === S.unlocked ? "cur" : "lock";
      if (i) map += '<div class="link ' + (i <= S.unlocked ? "on" : "") + '"></div>';
      map += '<button class="node ' + cls + '" data-s="' + i + '" aria-label="Stage ' + (i + 1) + '">' + (cls === "lock" ? "🔒" : i + 1) + "</button>";
    });
    var cur = STAGES[Math.min(S.unlocked, STAGES.length - 1)];
    app.innerHTML =
      '<div class="cloud" style="top:150px;left:10px;width:64px;height:20px"></div><div class="cloud" style="top:330px;right:12px;width:80px;height:22px"></div>' +
      '<div class="top"><div class="chip"><span class="lvl">Lv' + lvl + '</span>Keisha <span class="zh" style="font-size:15px">琦莎</span></div><div class="chip" style="font-size:19px">' + coin() + S.coins + "</div></div>" +
      '<div class="title" style="margin-top:8px">KEISHA’S WORLD</div><div class="zh" style="text-align:center;font-size:18px">琦莎的世界</div>' +
      (testDue() ? '<button class="btn yellow" id="pc" style="width:100%;margin-top:10px">⚡ Power Check ready! +' + RULES.testReward + " coins</button>" : "") +
      '<div class="card" style="margin-top:10px;padding:10px 12px"><div class="spread" style="margin-bottom:8px"><b>Daily check-in</b><b>🔥 ' + (c.last && daysBetween(c.last, today) <= 1 ? c.streak : 0) + "-day streak</b></div>" +
      '<div class="days">' + days + '</div><div class="notice spread" style="margin-top:8px"><span>Today: ' + Math.min(done, RULES.perStage) + " / " + RULES.perStage + ' words</span><span style="font-size:12px">Skip 3 days = lose ' + RULES.penaltyCoins + " coins</span></div></div>" +
      '<div id="av" class="av-stage" style="height:250px;margin-top:4px"></div><div class="platform"></div>' +
      '<div class="card" style="margin-top:22px;padding:10px 12px"><div class="spread"><b>Island ' + (S.unlocked + 1) + ' · <span class="zh">' + cur.zh + "</span></b><span class=\"muted\">" + cur.en + '</span></div><div class="map" id="map">' + map + "</div></div>" +
      '<div class="col" style="margin-top:16px;align-items:center"><button class="btn big green" id="play">PLAY</button>' +
      '<div class="row" style="width:100%"><button class="btn pink" style="flex:1" id="shop">Shop</button><button class="btn yellow" style="flex:1" id="cash">Cash out</button><button class="btn blue" style="flex:1" id="words">My words</button></div>' +
      '<button class="btn" id="mum" style="min-height:38px;font-size:14px;padding:4px 12px;box-shadow:0 3px 0 var(--ink)">🔒 Mummy</button></div>';
    mountAvatar("#av", { look: S.look, pet: S.pet, size: 0.95 });
    var curNode = app.querySelector(".node.cur"); if (curNode) curNode.scrollIntoView({ inline: "center", block: "nearest" });
    $("#play").onclick = function () { startStage(Math.min(S.unlocked, STAGES.length - 1)); };
    app.querySelectorAll(".node").forEach(function (n) { n.onclick = function () { var i = +n.dataset.s; if (i <= S.unlocked) startStage(i); else toast("Clear Island " + (S.unlocked + 1) + " first!"); }; });
    $("#shop").onclick = function () { shop("hair"); };
    $("#cash").onclick = cashOut;
    $("#words").onclick = myWords;
    $("#mum").onclick = mummyGate;
    if ($("#pc")) $("#pc").onclick = powerCheck;
  }

  /* ======================= GAME ======================= */
  var G = null;
  function pickOptions(w, mode, stage) {
    var pool = ALL.filter(function (x) { return x.zh !== w.zh && x.en !== w.en && Math.abs(x.stage - stage) <= 2; });
    if (pool.length < 6) pool = ALL.filter(function (x) { return x.zh !== w.zh && x.en !== w.en; });
    var out = [], seenEn = {}, seenZh = {};
    shuffle(pool).forEach(function (x) { if (out.length < 3 && !seenEn[x.en] && !seenZh[x.zh]) { out.push(x); seenEn[x.en] = 1; seenZh[x.zh] = 1; } });
    return shuffle([w].concat(out));
  }
  function startStage(i) {
    var st = STAGES[i];
    var own = shuffle(st.words);
    var review = shuffle(ALL.filter(function (w) { return w.stage < i; })).sort(function (a, b) { return stats(b.zh).weak - stats(a.zh).weak; }).slice(0, 8);
    var zhPool = own.concat(review), qs = [];
    for (var k = 0; k < RULES.zh2en; k++) qs.push({ w: zhPool[k % zhPool.length], mode: "zh2en" });
    var enPool = shuffle(own);
    for (k = 0; k < RULES.en2zh; k++) qs.push({ w: enPool[k % enPool.length], mode: "en2zh" });
    qs = shuffle(qs).map(function (q) { q.opts = pickOptions(q.w, q.mode, i); return q; });
    G = { stage: i, qs: qs, idx: 0, score: 0, hints: 0, coins: 0, wrong: [], t0: Date.now() };
    log("stage_start", null, { stage: i });
    question();
  }
  function question() {
    var q = G.qs[G.idx]; q.hints = []; q.t0 = Date.now(); q.done = false;
    var w = q.w, zh2en = q.mode === "zh2en";
    var pct = Math.round(G.idx / G.qs.length * 100);
    app.className = "";
    app.innerHTML =
      '<div class="row"><button class="btn" id="quit" aria-label="Quit" style="min-height:40px;width:44px;padding:0">✕</button><div class="bar" style="flex:1"><i style="width:' + pct + '%"></i></div><b>' + (G.idx + 1) + "/" + G.qs.length + "</b></div>" +
      '<div class="card prompt" style="margin-top:14px">' +
      '<span class="tag">' + (zh2en ? "中文 → ENGLISH" : "ENGLISH → 中文") + "</span>" +
      (zh2en ? '<span class="muted">What does this mean?</span><span class="big">' + w.zh + '</span><span class="py hidden" id="py">' + w.py + '</span><span class="reveal hidden" id="tr">= ' + esc(w.en) + "</span>"
        : '<span class="muted">Which one means…</span><span class="en">' + esc(w.en) + "</span>") +
      "</div>" +
      '<div class="opts" style="margin-top:14px">' + q.opts.map(function (o, k) {
        return '<button class="opt" data-k="' + k + '">' + (zh2en ? esc(o.en) : '<span class="zh">' + o.zh + '</span><small class="opy hidden">' + o.py + '</small><small class="oen hidden" style="color:#1b1b2b">' + esc(o.en) + "</small>") + "</button>";
      }).join("") + "</div>" +
      '<div class="hints" style="margin-top:14px" id="hintbox"><div class="spread"><b>Need help?</b><span class="muted">Each hint = −' + (zh2en ? RULES.hintCostZh2En : RULES.hintCostEn2Zh) + ' coin' + (zh2en ? "s" : "") + '</span></div><div class="grid">' +
      '<button class="hint" style="background:#e9e0ff" data-h="py"><span style="font-size:18px">Aa</span>Pinyin</button>' +
      '<button class="hint" style="background:var(--blue)" data-h="hear" disabled><span style="font-size:18px">🔊</span>Hear it</button>' +
      '<button class="hint" style="background:var(--pink)" data-h="tr" disabled><span style="font-size:16px">EN</span>Translate</button></div></div>' +
      '<div id="fb" style="margin-top:14px"></div>';
    $("#quit").onclick = quitAsk;
    app.querySelectorAll(".opt").forEach(function (b) { b.onclick = function () { answer(+b.dataset.k); }; });
    app.querySelectorAll(".hint").forEach(function (b) { b.onclick = function () { useHint(b); }; });
  }
  function useHint(b) {
    var q = G.qs[G.idx]; if (q.done) return;
    var h = b.dataset.h, w = q.w, zh2en = q.mode === "zh2en";
    if (q.hints.indexOf(h) < 0) {
      q.hints.push(h);
      log("hint", w.zh, { hint: h, mode: q.mode, stage: G.stage, ms: Date.now() - q.t0 });
      b.classList.add("used");
      var next = b.nextElementSibling; if (next) next.disabled = false;
    }
    if (h === "py") { if (zh2en) $("#py").classList.remove("hidden"); else app.querySelectorAll(".opy").forEach(function (x) { x.classList.remove("hidden"); }); }
    if (h === "hear") speak(w.zh);
    if (h === "tr") { if (zh2en) $("#tr").classList.remove("hidden"); else app.querySelectorAll(".oen").forEach(function (x) { x.classList.remove("hidden"); }); }
  }
  function answer(k) {
    var q = G.qs[G.idx]; if (q.done) return; q.done = true;
    var w = q.w, o = q.opts[k], ok = o.zh === w.zh, ms = Date.now() - q.t0, zh2en = q.mode === "zh2en";
    var nh = q.hints.length, earned = 0, speed = false;
    if (ok) {
      earned = Math.max(0, (zh2en ? RULES.coinZh2En : RULES.coinEn2Zh) - nh * (zh2en ? RULES.hintCostZh2En : RULES.hintCostEn2Zh));
      if (G.stage + 1 >= RULES.speedFromStage && nh === 0 && ms < RULES.speedMs) { earned += 1; speed = true; }
      G.score++;
    } else G.wrong.push(w);
    G.hints += nh; G.coins += earned; S.coins += earned;
    app.querySelectorAll(".opt").forEach(function (b, j) { var x = q.opts[j]; if (x.zh === w.zh) b.classList.add("right"); else if (j === k) b.classList.add("wrong"); b.disabled = true; });
    log("answer", w.zh, { mode: q.mode, stage: G.stage, correct: ok ? 1 : 0, chosen: o.zh, hints: nh, hintList: q.hints.join(","), ms: ms, coins: earned, speed: speed ? 1 : 0, q: G.idx });
    save();
    speak(w.zh);
    $("#hintbox").classList.add("hidden");
    $("#fb").innerHTML = '<div class="feedback" style="background:' + (ok ? "#c9f5d4" : "#ffe1e1") + '"><div style="flex:1">' +
      (ok ? (nh ? "Correct!" : ["Yes! First try!", "Amazing!", "So smart!", "Perfect!"][Math.floor(Math.random() * 4)]) : "Not quite!") +
      ' <span class="zh">' + w.zh + "</span> " + w.py + " = " + esc(w.en) + (speed ? "<br><small>⚡ Speed bonus!</small>" : "") + "</div>" +
      '<b style="white-space:nowrap">' + coin() + "+" + earned + "</b></div>" +
      '<button class="btn big green" id="next" style="margin-top:14px">' + (G.idx + 1 < G.qs.length ? "NEXT" : "FINISH") + "</button>";
    $("#next").onclick = function () { G.idx++; if (G.idx < G.qs.length) question(); else endStage(); };
  }
  function quitAsk() {
    modal('<b style="font-size:20px">Leave this stage?</b><p>Your coins so far are kept, but the stage won’t count.</p><div class="row"><button class="btn" id="mno" style="flex:1">Keep playing</button><button class="btn pink" id="myes" style="flex:1">Leave</button></div>');
    document.getElementById("mno").onclick = closeModal;
    document.getElementById("myes").onclick = function () { closeModal(); log("quit", null, { stage: G.stage, at: G.idx, ms: Date.now() - G.t0 }); G = null; lobby(); };
  }
  function endStage() {
    var ms = Date.now() - G.t0, i = G.stage, prev = S.stageBest[i];
    var passed = G.score >= RULES.passScore && G.hints <= RULES.passMaxHints;
    var firstClear = passed && i === S.unlocked && i + 1 < STAGES.length;
    if (firstClear) S.unlocked = i + 1;
    var checked = doCheckin();
    S.stageBest[i] = { ms: prev && prev.ms && prev.ms < ms ? prev.ms : ms, score: Math.max(G.score, prev ? prev.score : 0), lastMs: ms };
    log("stage_end", null, { stage: i, score: G.score, hints: G.hints, ms: ms, coins: G.coins, passed: passed ? 1 : 0 });
    save();
    var stars = G.score >= 14 ? 3 : G.score >= RULES.passScore ? 2 : G.score >= 8 ? 1 : 0;
    var starSvg = function (on, s) { return '<svg width="' + s + '" height="' + s + '" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9z" fill="' + (on ? "#ffc93c" : "#e6e6ee") + '" stroke="#1b1b2b" stroke-width="1.6" stroke-linejoin="round"/></svg>'; };
    var lastMs = prev ? prev.lastMs || prev.ms : null;
    var wrongUniq = []; G.wrong.forEach(function (w) { if (wrongUniq.indexOf(w) < 0) wrongUniq.push(w); });
    app.className = "purple-bg";
    document.body.style.background = "#7a4bd6";
    app.innerHTML = '<div class="col" style="align-items:center;padding-top:16px">' +
      '<div class="title">' + (passed ? "STAGE CLEAR!" : "SO CLOSE!") + "</div>" +
      '<div class="row" style="align-items:flex-end">' + starSvg(stars >= 1, 56) + starSvg(stars >= 2, 72) + starSvg(stars >= 3, 56) + "</div>" +
      '<div class="stats" style="width:100%">' +
      '<div class="stat" style="background:#d8f7e0"><span>Correct</span><b>' + G.score + " / " + G.qs.length + "</b></div>" +
      '<div class="stat" style="background:#ffe1f0"><span>Hints used</span><b>' + G.hints + "</b></div>" +
      '<div class="stat" style="background:#dcefff"><span>Time this stage</span><b>' + fmtTime(ms) + "</b></div>" +
      '<div class="stat" style="background:#fff4d1"><span>Coins earned</span><b>' + coin() + " +" + G.coins + "</b></div></div>" +
      (lastMs ? '<div class="card" style="width:100%"><b>' + (ms < lastMs ? "⏱ Faster than last time!" : "⏱ Last time: " + fmtTime(lastMs)) + '</b> <span class="muted">' + fmtTime(lastMs) + " → " + fmtTime(ms) + "</span></div>" : "") +
      (i + 1 < RULES.speedFromStage ? '<div class="card" style="width:100%;background:#fff4d1"><b>⚡ Speed bonus unlocks at Stage ' + RULES.speedFromStage + "</b><br><span class=\"muted\">Answer right in under 5 seconds with no hints = +1 extra coin</span></div>" : "") +
      (wrongUniq.length ? '<div class="card" style="width:100%"><b>Train these again</b><div class="row" style="flex-wrap:wrap;margin-top:6px">' + wrongUniq.map(function (w) { return '<button class="chip zh" style="font-size:22px" data-say="' + w.zh + '">' + w.zh + "</button>"; }).join("") + "</div></div>" : "") +
      (passed ? (firstClear ? '<div class="chip" style="background:var(--green)">✓ Island ' + (i + 2) + " unlocked!</div>" : "") : '<div class="card" style="width:100%;background:#ffe1e1">To clear: <b>' + RULES.passScore + "+ correct</b> with <b>" + RULES.passMaxHints + " hints or fewer</b>. Try again!</div>") +
      (checked ? '<div class="chip">🔥 Checked in for today!</div>' : "") +
      '<button class="btn big green" id="again">' + (passed && i + 1 < STAGES.length ? "NEXT STAGE" : "TRY AGAIN") + '</button><button class="btn" id="home" style="width:100%">Back to lobby</button></div>';
    app.querySelectorAll("[data-say]").forEach(function (b) { b.onclick = function () { speak(b.dataset.say); var w = BY_ZH[b.dataset.say]; toast(w.zh + " " + w.py + " = " + w.en); }; });
    if (passed) confetti();
    $("#again").onclick = function () { document.body.style.background = ""; startStage(passed && i + 1 < STAGES.length ? i + 1 : i); };
    $("#home").onclick = function () { document.body.style.background = ""; lobby(); };
    G = null;
  }
  function confetti() {
    var c = document.createElement("div"); c.className = "confetti";
    var cols = ["#ffc93c", "#2fd15a", "#4fb3ff", "#ff7ab6", "#fff"];
    for (var i = 0; i < 40; i++) { var p = document.createElement("i"); p.style.left = Math.random() * 100 + "%"; p.style.background = cols[i % 5]; p.style.animationDuration = 2 + Math.random() * 2 + "s"; p.style.animationDelay = Math.random() * .6 + "s"; c.appendChild(p); }
    document.body.appendChild(c); setTimeout(function () { c.remove(); }, 5000);
  }

  /* ======================= POWER CHECK ======================= */
  var T = null;
  function powerCheck() {
    var order = [];
    [1, 2, 3, 4].forEach(function (y) { shuffle(POWER_ITEMS[y]).forEach(function (w) { order.push({ y: y, w: w }); }); });
    T = { order: order, idx: 0, per: {}, t0: Date.now(), stopAt: null };
    [1, 2, 3, 4].forEach(function (y) { T.per[y] = { asked: 0, right: 0, wrong: 0, idk: 0, total: POWER_ITEMS[y].length }; });
    log("test_start", null, {});
    testQ();
  }
  function testQ() {
    if (T.idx >= T.order.length) return testEnd();
    var it = T.order[T.idx], y = it.y, p = T.per[y];
    // adaptive stop: after 6 words of a year with 1 or fewer right, stop the check
    if (p.asked >= 6 && p.right <= 1) { return testEnd(); }
    var pool = POWER_ITEMS[y].filter(function (x) { return x.en !== it.w.en; });
    var opts = shuffle([it.w].concat(shuffle(pool).slice(0, 3)));
    it.opts = opts; it.t0 = Date.now();
    var pct = Math.round(T.idx / T.order.length * 100);
    app.className = ""; document.body.style.background = "";
    app.innerHTML = '<div class="row"><b style="white-space:nowrap">⚡ Power Check</b><div class="bar" style="flex:1"><i style="width:' + pct + '%;background:var(--yellow)"></i></div></div>' +
      '<div class="card prompt" style="margin-top:14px"><span class="tag">LEVEL ' + y + '</span><span class="muted">What does this mean?</span><span class="big">' + it.w.zh + "</span></div>" +
      '<div class="opts" style="margin-top:14px">' + opts.map(function (o, k) { return '<button class="opt" data-k="' + k + '">' + esc(o.en) + "</button>"; }).join("") + "</div>" +
      '<button class="btn" id="idk" style="width:100%;margin-top:14px;background:#e9e0ff">🤔 I don’t know</button>' +
      '<p class="muted" style="text-align:center">No hints here. Just do your best. Not knowing is OK!</p>';
    app.querySelectorAll(".opt").forEach(function (b) { b.onclick = function () { testAns(+b.dataset.k); }; });
    $("#idk").onclick = function () { testAns(-1); };
  }
  function testAns(k) {
    var it = T.order[T.idx], p = T.per[it.y], res;
    p.asked++;
    if (k < 0) { p.idk++; res = "idk"; } else if (it.opts[k].zh === it.w.zh) { p.right++; res = "right"; } else { p.wrong++; res = "wrong"; }
    log("test", it.w.zh, { year: it.y, result: res, chosen: k < 0 ? null : it.opts[k].zh, ms: Date.now() - it.t0 });
    T.idx++; testQ();
  }
  function testEnd() {
    var per = {}, lines = "";
    [1, 2, 3, 4].forEach(function (y) {
      var p = T.per[y];
      // estimate: right answers corrected for lucky guesses (4 choices), out of the full list for that year
      var est = Math.max(0, Math.round((p.right - p.wrong / 3) / p.total * 100));
      per[y] = Object.assign({ est: est }, p);
      lines += '<div><div class="spread"><b>Standard ' + y + "</b><b>" + est + '%</b></div><div class="bar"><i style="width:' + est + '%;background:var(--yellow)"></i></div></div>';
    });
    S.lastTestAt = Date.now(); S.coins += RULES.testReward;
    log("test_end", null, { per: per, ms: Date.now() - T.t0, coins: RULES.testReward });
    save(); T = null;
    app.innerHTML = '<div class="col" style="padding-top:20px"><div class="title">POWER CHECK DONE!</div>' +
      '<div class="card col"><b>You earned ' + coin() + " " + RULES.testReward + ' coins!</b><span class="muted">Here’s how many words you know from each year’s book:</span>' + lines + "</div>" +
      '<div class="card" style="background:#fff4d1">Every month you’ll do this again. Watch your bars grow! 🌱</div>' +
      '<button class="btn big green" id="home">LET’S PLAY</button></div>';
    confetti();
    $("#home").onclick = lobby;
  }

  /* ======================= MY WORDS ======================= */
  function myWords() {
    var html = '<div class="spread"><button class="btn" id="back">← Back</button><span class="h2">My words</span><span></span></div><p class="muted">Tap a word to hear it. ⭐ = mastered (3 right in a row with no hints).</p>';
    STAGES.forEach(function (s, i) {
      if (i > S.unlocked) return;
      html += '<div class="card" style="margin-bottom:10px"><b>Island ' + (i + 1) + ' · <span class="zh">' + s.zh + '</span></b> <span class="muted">' + s.en + '</span><div class="row" style="flex-wrap:wrap;margin-top:8px">' +
        s.words.map(function (w) { var st = stats(w.zh); return '<button class="chip" data-say="' + w.zh + '" style="box-shadow:0 3px 0 var(--ink);' + (st.mastered ? "background:#d8f7e0" : st.wrong > st.right ? "background:#ffe1e1" : "") + '"><span class="zh" style="font-size:22px">' + w.zh + "</span>" + (st.mastered ? "⭐" : "") + "</button>"; }).join("") + "</div></div>";
    });
    app.className = ""; app.innerHTML = html;
    $("#back").onclick = lobby;
    app.querySelectorAll("[data-say]").forEach(function (b) { b.onclick = function () { var w = BY_ZH[b.dataset.say]; speak(w.zh); toast(w.zh + " " + w.py + " = " + w.en); }; });
  }

  /* ======================= SHOP ======================= */
  var tryLook = null;
  function owned(cat, id) { return cat === "pet" ? S.petsOwned.indexOf(id) >= 0 : cat === "petacc" ? S.petAcc.indexOf(id) >= 0 : S.owned.indexOf(cat + ":" + id) >= 0; }
  function shop(tab, sel) {
    tryLook = tryLook || {};
    var look = Object.assign({}, S.look), pet = S.pet ? Object.assign({}, S.pet) : null;
    if (sel) {
      if (tab === "pet") pet = { type: sel, name: pet && pet.type === sel ? pet.name : "", acc: S.pet ? S.pet.acc : [] };
      else if (tab === "petacc") { if (pet) pet = Object.assign({}, pet, { acc: (pet.acc || []).concat([sel]) }); }
      else look[tab] = sel;
    }
    var C = Avatar3D.colors, colorMap = { hair: C.HAIR, top: C.TOPS, skirt: C.SKIRTS, phones: C.PHONES };
    var items = SHOP[tab].map(function (it) {
      var id = it[0], name = it[1], price = it[2], needStage = it[3] || 0;
      if (needStage && S.unlocked < needStage) return '<div class="item locked">🔒<span>Unlock at Island ' + (needStage + 1) + "</span></div>";
      var isOwn = owned(tab, id), wearing = tab === "pet" ? S.pet && S.pet.type === id : tab === "petacc" ? S.pet && (S.pet.acc || []).indexOf(id) >= 0 : S.look[tab] === id;
      var pic = colorMap[tab] ? '<div class="swatch" style="background:' + colorMap[tab][id] + '"></div>'
        : tab === "style" ? '<div style="font-size:30px">' + { long: "💇‍♀️", bob: "👧", buns: "🎀" }[id] + "</div>"
        : tab === "pet" ? '<div style="font-size:34px">' + { cat: "🐱", bunny: "🐰", puppy: "🐶", panda: "🐼" }[id] + "</div>"
        : '<div style="font-size:30px">' + { bow: "🎀", glasses: "🕶️", crown: "👑" }[id] + "</div>";
      var tag = wearing ? '<span class="badge">Wearing</span>' : isOwn ? '<span class="badge" style="background:#dcefff">Owned</span>' : "<span>" + coin() + " " + price + "</span>";
      return '<button class="item ' + (isOwn ? "own " : "") + (sel === id ? "sel" : "") + '" data-id="' + id + '">' + pic + "<span>" + name + "</span>" + tag + "</button>";
    }).join("");
    var selItem = sel ? SHOP[tab].filter(function (x) { return x[0] === sel; })[0] : null;
    var action = "";
    if (selItem) {
      if (owned(tab, sel)) action = '<button class="btn big green" id="wear">' + (tab === "petacc" ? "PUT ON PET" : "WEAR") + "</button>";
      else action = '<button class="btn big green" id="buy" ' + (S.coins < selItem[2] ? "disabled" : "") + ">BUY · " + selItem[2] + " coins</button>" + (S.coins < selItem[2] ? '<p class="muted" style="text-align:center">You need ' + (selItem[2] - S.coins) + " more coins. Keep playing!</p>" : "");
      if (tab === "petacc" && !S.pet) action = '<p class="muted" style="text-align:center">Get a pet first!</p>';
    }
    app.className = "";
    app.innerHTML = '<div class="spread"><button class="btn" id="back">← Back</button><span class="h2">Shop</span><span class="chip">' + coin() + S.coins + "</span></div>" +
      '<div class="card" style="margin-top:12px;padding:0;overflow:hidden;background:#c9ecff;position:relative"><div id="av" class="av-stage" style="height:250px"></div><div style="position:absolute;left:0;right:0;bottom:0;height:40px;background:#58c65a;border-top:3px solid var(--ink);z-index:-0"></div>' +
      (S.pet && S.pet.name ? '<span class="chip zh" style="position:absolute;top:8px;right:8px;font-size:14px;padding:3px 8px">' + esc(S.pet.name) + "</span>" : "") + "</div>" +
      '<div class="tabs" style="margin-top:14px">' + SHOP_TABS.map(function (t) { return '<button class="tab ' + (t[0] === tab ? "on" : "") + '" data-t="' + t[0] + '">' + t[1] + "</button>"; }).join("") + "</div>" +
      '<div class="items" style="margin-top:10px">' + items + "</div><div style=\"margin-top:14px\">" + action + "</div>" +
      (tab === "pet" && S.pet ? '<button class="btn yellow" id="rename" style="width:100%;margin-top:10px">Give your pet a Chinese name</button>' : "");
    mountAvatar("#av", { look: look, pet: pet, size: 0.95 });
    $("#back").onclick = lobby;
    app.querySelectorAll(".tab").forEach(function (b) { b.onclick = function () { shop(b.dataset.t); }; });
    app.querySelectorAll(".item[data-id]").forEach(function (b) { b.onclick = function () { shop(tab, b.dataset.id); }; });
    if ($("#buy")) $("#buy").onclick = function () {
      if (S.coins < selItem[2]) return;
      S.coins -= selItem[2];
      if (tab === "pet") { S.petsOwned.push(sel); S.pet = { type: sel, name: "", acc: S.pet ? S.pet.acc : [] }; }
      else if (tab === "petacc") { S.petAcc.push(sel); S.pet.acc = (S.pet.acc || []).concat([sel]); }
      else { S.owned.push(tab + ":" + sel); S.look[tab] = sel; }
      log("shop", sel, { cat: tab, cost: selItem[2] }); save(); confetti(); toast("Yay! You got it!");
      if (tab === "pet") petName(); else shop(tab, sel);
    };
    if ($("#wear")) $("#wear").onclick = function () {
      if (tab === "pet") S.pet = { type: sel, name: S.pet && S.pet.type === sel ? S.pet.name : "", acc: S.pet ? S.pet.acc : [] };
      else if (tab === "petacc") { var a = S.pet.acc || []; S.pet.acc = a.indexOf(sel) >= 0 ? a.filter(function (x) { return x !== sel; }) : a.concat([sel]); }
      else S.look[tab] = sel;
      save(); shop(tab);
    };
    if ($("#rename")) $("#rename").onclick = petName;
  }
  function petName() {
    var learned = ALL.filter(function (w) { var s = stats(w.zh); return s.right > 0 && w.zh.length <= 2; });
    if (learned.length < 4) learned = ALL.slice(0, 12);
    modal('<b style="font-size:20px">Name your pet!</b><p class="muted">Pick a Chinese word you’ve learned:</p><div class="row" style="flex-wrap:wrap">' +
      learned.slice(0, 30).map(function (w) { return '<button class="chip" data-n="' + w.zh + '"><span class="zh" style="font-size:20px">' + w.zh + "</span><small>" + esc(w.en) + "</small></button>"; }).join("") +
      '</div><button class="btn" id="mclose" style="width:100%;margin-top:12px">Later</button>');
    layer.querySelectorAll("[data-n]").forEach(function (b) { b.onclick = function () { var w = BY_ZH[b.dataset.n]; S.pet.name = (w.zh.length === 1 ? "小" : "") + w.zh; save(); speak(S.pet.name); closeModal(); toast("Your pet is called " + S.pet.name + "!"); shop("pet"); }; });
    document.getElementById("mclose").onclick = function () { closeModal(); shop("pet"); };
  }

  /* ======================= CASH OUT ======================= */
  function cashOut() {
    var rm = (S.coins / RULES.coinsPerRM).toFixed(2), choice = 1;
    function draw() {
      app.className = ""; document.body.style.background = "#fff4d1";
      var opts = [1, 2, 5].map(function (r) { var c = r * RULES.coinsPerRM; return '<button class="btn ' + (choice === r ? "yellow" : "") + '" data-r="' + r + '" style="flex:1;flex-direction:column;display:flex;align-items:center;line-height:1.1" ' + (S.coins < c ? "disabled" : "") + ">RM " + r + '<span style="font-size:12px">' + c + " coins</span></button>"; }).join("");
      var hist = CASH.length ? CASH.map(function (c) {
        var st = c.status === "paid" ? '<span class="badge">Paid ' + fmtDate(c.decided) + "</span>" : c.status === "declined" ? '<span class="badge" style="background:#e6e6ee">Not now</span>' : '<span class="badge" style="background:#ffe2b8">Waiting for Mommy</span>';
        return '<div class="spread" style="border-top:1px solid #e6e6ee;padding-top:6px"><span>RM ' + Number(c.rm).toFixed(2) + " · " + c.coins + ' coins<br><span class="muted" style="font-size:12px">Asked ' + fmtDate(c.asked) + "</span></span>" + st + "</div>";
      }).join("") : '<span class="muted">No requests yet.</span>';
      app.innerHTML = '<div class="spread"><button class="btn" id="back">← Back</button><span class="h2">Cash Out</span><span class="chip" style="font-size:13px">' + RULES.coinsPerRM + " coins = RM 1</span></div>" +
        '<div class="card row" style="margin-top:14px"><span class="coin" style="width:52px;height:52px;box-shadow:inset 0 0 0 7px var(--yellow),inset 0 0 0 9px var(--ink)"></span><div><div class="muted">My coins</div><div style="font-size:34px;font-weight:700;line-height:1">' + S.coins + '</div><b style="color:#1f7a35">worth RM ' + rm + "</b></div></div>" +
        '<div class="card col" style="margin-top:14px"><b>How much do you want?</b><div class="row">' + opts + "</div></div>" +
        '<button class="btn big green" id="ask" style="margin-top:14px" ' + (S.coins < choice * RULES.coinsPerRM ? "disabled" : "") + ">ASK MOMMY FOR RM " + choice + "</button>" +
        '<div class="card col" style="margin-top:14px;gap:6px"><b>My requests</b>' + hist + "</div>" +
        '<p class="muted" style="text-align:center">Coins come from learning: first-try answers earn the most.</p>';
      $("#back").onclick = function () { document.body.style.background = ""; lobby(); };
      app.querySelectorAll("[data-r]").forEach(function (b) { b.onclick = function () { choice = +b.dataset.r; draw(); }; });
      $("#ask").onclick = function () {
        var coins = choice * RULES.coinsPerRM; if (S.coins < coins) return;
        S.coins -= coins; save(); log("cash_request", null, { coins: coins });
        var row = { id: Date.now(), asked: Date.now(), coins: coins, rm: coins / RULES.coinsPerRM, status: "pending" };
        if (ONLINE) apiPost("/api/cash", { coins: coins }).then(function () { return apiGet("/api/state"); }).then(function (r) { CASH = r.cash || []; draw(); }).catch(function () { toast("Couldn’t send. Check the internet."); });
        else { CASH.unshift(row); lsSet(LS.cash, CASH); draw(); }
        toast("Request sent to Mommy!");
      };
    }
    draw();
  }

  /* ======================= MODAL ======================= */
  function modal(html) { layer.innerHTML = '<div class="modal"><div class="card">' + html + "</div></div>"; }
  function closeModal() { layer.innerHTML = ""; }

  /* ======================= MUMMY ======================= */
  var PIN = null;
  function hashLocal(p) { var h = 0; for (var i = 0; i < p.length; i++) h = (h * 31 + p.charCodeAt(i)) | 0; return "h" + h; }
  function mummyGate() {
    var setting = !PIN_SET;
    modal('<b style="font-size:20px">' + (setting ? "Create Mummy’s PIN" : "Mummy’s Corner") + "</b><p class=\"muted\">" + (setting ? "Choose a 4–8 digit PIN. Keisha shouldn’t see it!" : "Enter your PIN") + '</p><input class="pin" id="pin" type="password" inputmode="numeric" autocomplete="off" maxlength="8">' +
      (setting ? '<input class="pin" id="pin2" type="password" inputmode="numeric" autocomplete="off" maxlength="8" placeholder="again" style="margin-top:8px">' : "") +
      '<div class="row" style="margin-top:12px"><button class="btn" id="mclose" style="flex:1">Cancel</button><button class="btn green" id="mok" style="flex:1">OK</button></div>');
    var inp = document.getElementById("pin"); inp.focus();
    document.getElementById("mclose").onclick = closeModal;
    document.getElementById("mok").onclick = function () {
      var p = inp.value.trim();
      if (setting) {
        if (!/^\d{4,8}$/.test(p)) return toast("PIN must be 4–8 digits");
        if (p !== document.getElementById("pin2").value.trim()) return toast("PINs don’t match");
        var done = function () { PIN_SET = true; PIN = p; closeModal(); mummy(); };
        if (ONLINE) apiPost("/api/mummy/setpin", { pin: p }).then(done).catch(function (e) { toast(e.message); });
        else { lsSet(LS.pin, hashLocal(p)); done(); }
      } else {
        if (ONLINE) apiGet("/api/mummy/data", p).then(function (d) { PIN = p; closeModal(); mummy(d); }).catch(function () { toast("Wrong PIN"); });
        else if (lsGet(LS.pin, null) === hashLocal(p)) { PIN = p; closeModal(); mummy(); } else toast("Wrong PIN");
      }
    };
  }
  function mummy(data) {
    if (!data) {
      if (ONLINE) return apiGet("/api/mummy/data", PIN).then(mummy).catch(function () { toast("Couldn’t load data"); });
      data = { state: S, events: lsGet(LS.events, []), cash: CASH, flags: FLAGS };
    }
    var ev = data.events || [], A = ev.filter(function (e) { return e.type === "answer"; });
    var now = new Date(), dow = (now.getDay() + 6) % 7, wkStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dow).getTime(), lwStart = wkStart - 7 * 86400000;
    function weekStats(a, b) {
      var ans = A.filter(function (e) { return e.ts >= a && e.ts < b; }), n = ans.length;
      var days = {}; ev.forEach(function (e) { if (e.type === "checkin" && e.ts >= a && e.ts < b) days[dstr(new Date(e.ts))] = 1; });
      var first = ans.filter(function (e) { return e.correct && !e.hints; }).length;
      var hints = ans.reduce(function (s, e) { return s + (e.hints || 0); }, 0);
      var ms = ans.reduce(function (s, e) { return s + (e.ms || 0); }, 0);
      var coins = ans.reduce(function (s, e) { return s + (e.coins || 0); }, 0);
      var stages = ev.filter(function (e) { return e.type === "stage_end" && e.passed && e.ts >= a && e.ts < b; }).length;
      return { days: Object.keys(days).length, n: n, first: n ? Math.round(first / n * 100) : null, hints: n ? (hints / n).toFixed(1) : null, ms: n ? (ms / n / 1000).toFixed(1) : null, coins: coins, stages: stages };
    }
    var tw = weekStats(wkStart, Infinity), lw = weekStats(lwStart, wkStart);
    function wrow(label, a, b, higherBetter, unit) {
      unit = unit || "";
      var cmp = a == null || b == null ? "" : Number(b) === Number(a) ? '<span class="muted" style="font-size:12px">same</span>' : (Number(b) > Number(a)) === higherBetter ? '<span class="good">better</span>' : '<span class="bad">lower</span>';
      return "<tr><td>" + label + '</td><td class="muted">' + (a == null ? "–" : a + unit) + "</td><td><b>" + (b == null ? "–" : b + unit) + "</b></td><td>" + cmp + "</td></tr>";
    }
    // per word
    var W = {};
    A.forEach(function (e) { var w = W[e.item] || (W[e.item] = { n: 0, right: 0, wrong: 0, tr: 0, hear: 0, py: 0, ms: 0, last: [] }); w.n++; w.ms += e.ms || 0; if (e.correct) w.right++; else w.wrong++; var hl = (e.hintList || "").split(","); if (hl.indexOf("tr") >= 0) w.tr++; if (hl.indexOf("hear") >= 0) w.hear++; if (hl.indexOf("py") >= 0) w.py++; w.last.push(e.correct && !e.hints ? 1 : 0); });
    var struggle = Object.keys(W).map(function (k) { var w = W[k]; return { zh: k, s: w.wrong * 2 + w.tr + w.hear * 0.5 + w.py * 0.3, w: w }; }).filter(function (x) { return x.s > 0; }).sort(function (a, b) { return b.s - a.s; }).slice(0, 10);
    var mastered = Object.keys(W).filter(function (k) { var l = W[k].last.slice(-3); return l.length === 3 && l.every(Boolean); }).length;
    // skills
    function acc(f) { var x = A.filter(f), r = x.filter(function (e) { return e.correct && !e.hints; }).length; return x.length ? Math.round(r / x.length * 100) : null; }
    var skZh = acc(function (e) { return e.mode === "zh2en"; }), skEn = acc(function (e) { return e.mode === "en2zh"; });
    var heard = A.filter(function (e) { return (e.hintList || "").indexOf("hear") >= 0; }), heardOk = heard.filter(function (e) { return e.correct; }).length;
    var pyOnly = A.filter(function (e) { return e.hintList === "py"; }), pyOk = pyOnly.filter(function (e) { return e.correct; }).length;
    // mix-ups
    var mix = {}; A.forEach(function (e) { if (!e.correct && e.chosen) { var k = e.item + "→" + e.chosen; mix[k] = (mix[k] || 0) + 1; } });
    var mixes = Object.keys(mix).sort(function (a, b) { return mix[b] - mix[a]; }).slice(0, 6);
    // retention: words answered right, then seen again 7+ days later
    var ret = { n: 0, ok: 0 };
    Object.keys(W).forEach(function (k) {
      var list = A.filter(function (e) { return e.item === k; }), firstOk = list.find(function (e) { return e.correct; });
      if (!firstOk) return; var later = list.filter(function (e) { return e.ts - firstOk.ts >= 7 * 86400000; });
      if (later.length) { ret.n++; if (later[0].correct && !later[0].hints) ret.ok++; }
    });
    // time of day
    var hours = {}; A.forEach(function (e) { var h = new Date(e.ts).getHours(), b = h < 12 ? "Morning" : h < 15 ? "Afternoon" : h < 19 ? "Evening" : "Night"; var x = hours[b] || (hours[b] = { n: 0, ok: 0 }); x.n++; if (e.correct && !e.hints) x.ok++; });
    // quits
    var quits = ev.filter(function (e) { return e.type === "quit"; });
    // tests
    var tests = ev.filter(function (e) { return e.type === "test_end"; });
    var lastTest = tests[tests.length - 1];
    var testHtml = lastTest ? [1, 2, 3, 4].map(function (y) { var p = lastTest.per[y] || {}, est = p.est || 0; var col = est >= 60 ? "#2b8a3e" : est >= 30 ? "#e8890c" : "#b42318"; return '<div><div class="spread"><span>Standard ' + y + (p.asked < p.total ? ' <span class="muted" style="font-size:12px">(stopped early)</span>' : "") + "</span><b>" + est + '%</b></div><div class="mbar"><i style="width:' + est + "%;background:" + col + '"></i></div></div>'; }).join("") +
      '<div class="spread" style="opacity:.8"><span class="muted">Standard 5 (her 2027 class)</span><span class="muted">needs the Std 5 book</span></div>'
      : '<span class="muted">No Power Check yet. Keisha will be asked to do one in the lobby.</span>';
    var working = "–"; if (lastTest) { var wl = 0; [1, 2, 3, 4].forEach(function (y) { if ((lastTest.per[y] || {}).est >= 60) wl = y; }); working = wl ? "Standard " + wl + (wl < 4 ? "–" + (wl + 1) : "") : "Below Standard 1"; }
    var testHist = tests.map(function (t) { return "<tr><td>" + fmtDate(t.ts) + "</td>" + [1, 2, 3, 4].map(function (y) { return "<td>" + ((t.per[y] || {}).est || 0) + "%</td>"; }).join("") + "</tr>"; }).join("");
    var nextTest = (data.state && data.state.lastTestAt) ? fmtDate(data.state.lastTestAt + RULES.testEveryDays * 86400000) : "now";
    // help log
    var helps = ev.filter(function (e) { return e.type === "hint"; }).slice(-30).reverse();
    var HN = { py: ["Pinyin", "#e9e0ff"], hear: ["Hear it", "#d6ecff"], tr: ["Translate", "#ffd6e8"] };
    var resultFor = function (h) { var a = A.find(function (e) { return e.item === h.item && e.ts >= h.ts && e.ts - h.ts < 120000; }); return a ? (a.correct ? '<span class="good">Right</span>' : '<span class="bad">Wrong</span>') : ""; };
    var cash = data.cash || [];
    var paidTotal = cash.filter(function (c) { return c.status === "paid"; }).reduce(function (s, c) { return s + Number(c.rm); }, 0);

    document.body.style.background = "#f7f5f0";
    app.className = "mum";
    app.innerHTML = '<div class="col">' +
      '<div class="spread"><button class="btn" id="back">← Exit</button><b style="font-size:20px">Mummy’s Corner</b><span></span></div>' +
      '<span class="muted">Keisha · coins now: <b>' + ((data.state || S).coins) + "</b> · Island " + (((data.state || S).unlocked || 0) + 1) + " of " + STAGES.length + " · " + (ONLINE ? "saved online" : "saved on this device only") + "</span>" +
      '<div class="sec"><h3>This week vs last week</h3><table><tr><th></th><th>Last wk</th><th>This wk</th><th></th></tr>' +
      wrow("Days checked in", lw.days, tw.days, true) + wrow("Questions answered", lw.n, tw.n, true) + wrow("Right on first try", lw.first, tw.first, true, "%") +
      wrow("Hints per question", lw.hints, tw.hints, false) + wrow("Avg time per answer", lw.ms, tw.ms, false, "s") + wrow("Stages cleared", lw.stages, tw.stages, true) + wrow("Coins earned", lw.coins, tw.coins, true) +
      '</table><span class="muted">Words mastered so far (3 right in a row, no hints): <b>' + mastered + "</b> of " + ALL.length + "</span></div>" +
      '<div class="sec"><div class="spread"><h3>Level vs school syllabus</h3><span class="muted" style="font-size:12px">' + (lastTest ? "Power Check " + fmtDate(lastTest.ts) : "") + "</span></div>" +
      '<span class="muted">Share of each year’s textbook characters she can read (lucky guesses removed)</span>' + testHtml +
      '<div class="notice"><b>Working level:</b> ' + working + " · <b>Target:</b> Standard 5</div>" +
      (tests.length > 1 ? '<table><tr><th>Date</th><th>Std 1</th><th>Std 2</th><th>Std 3</th><th>Std 4</th></tr>' + testHist + "</table>" : "") +
      '<div class="spread"><span class="muted">Next monthly check: ' + nextTest + '</span><button class="btn yellow" id="reqtest" style="min-height:36px;font-size:14px;padding:4px 10px">Ask for one now</button></div></div>' +
      '<div class="sec"><h3>Skills</h3>' +
      bar("Meaning (中文 → English), first try", skZh) + bar("Reading (English → 中文), first try", skEn) +
      '<span class="muted">When she taps <b>Hear it</b>, she gets it right ' + (heard.length ? Math.round(heardOk / heard.length * 100) + "%" : "–") + " of the time" + (heard.length ? " (" + heard.length + "×)" : "") + ". When <b>pinyin alone</b> is enough: " + (pyOnly.length ? Math.round(pyOk / pyOnly.length * 100) + "%" : "–") + ".</span>" +
      '<span class="muted">If “Hear it” works much better than reading, she understands spoken Chinese but can’t yet read the characters.</span></div>' +
      '<div class="sec"><h3>Words she struggles with</h3>' + (struggle.length ? '<table><tr><th>Word</th><th>Translate taps</th><th>Avg time</th><th>Wrong</th></tr>' + struggle.map(function (x) { var w = BY_ZH[x.zh] || { py: "", en: "" }; return '<tr><td><span class="zh" style="font-size:18px">' + x.zh + '</span><br><span class="muted" style="font-size:11px">' + esc(w.en) + "</span></td><td>" + x.w.tr + "×</td><td>" + (x.w.ms / x.w.n / 1000).toFixed(1) + "s</td><td>" + x.w.wrong + "×</td></tr>"; }).join("") + "</table>" : '<span class="muted">Nothing yet.</span>') + "</div>" +
      '<div class="sec"><h3>Understanding signals</h3><table>' +
      mixes.map(function (k) { var p = k.split("→"); return '<tr><td>Mixed up <span class="zh">' + p[0] + '</span> with <span class="zh">' + p[1] + "</span></td><td><b>" + mix[k] + "×</b></td></tr>"; }).join("") +
      "<tr><td>Still remembers words after 7+ days</td><td><b>" + (ret.n ? Math.round(ret.ok / ret.n * 100) + "%" : "–") + "</b>" + (ret.n ? ' <span class="muted" style="font-size:11px">(' + ret.n + " words)</span>" : "") + "</td></tr>" +
      Object.keys(hours).map(function (b) { var x = hours[b]; return "<tr><td>" + b + " accuracy</td><td><b>" + Math.round(x.ok / x.n * 100) + '%</b> <span class="muted" style="font-size:11px">(' + x.n + ")</span></td></tr>"; }).join("") +
      "<tr><td>Stages she quit before finishing</td><td><b>" + quits.length + "</b>" + (quits.length ? ' <span class="muted" style="font-size:11px">mostly at question ' + Math.round(quits.reduce(function (s, q) { return s + (q.at || 0) + 1; }, 0) / quits.length) + "</span>" : "") + "</td></tr></table></div>" +
      '<div class="sec"><div class="spread"><h3>Help log</h3><span class="muted" style="font-size:12px">every tap is saved</span></div>' + (helps.length ? '<table><tr><th>When</th><th>Word</th><th>Help</th><th>Then</th></tr>' + helps.map(function (h) { var n = HN[h.hint] || [h.hint, "#eee"]; var d = new Date(h.ts); return "<tr><td style=\"font-size:12px\">" + d.toLocaleDateString("en-GB", { day: "numeric", month: "short" }) + " " + d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) + '</td><td class="zh">' + h.item + '</td><td><span style="background:' + n[1] + ';border-radius:6px;padding:1px 6px;font-size:12px;font-weight:700">' + n[0] + "</span></td><td>" + resultFor(h) + "</td></tr>"; }).join("") + "</table>" : '<span class="muted">No help taps yet.</span>') +
      '<button class="btn" id="copy" style="min-height:40px;font-size:14px">Copy all data for analysis</button><textarea id="dump" class="hidden" style="width:100%;height:80px;font-size:11px"></textarea></div>' +
      '<div class="sec" style="background:#fff4d1"><h3>Cash-out requests</h3>' + (cash.length ? cash.map(function (c) {
        var right = c.status === "pending" ? '<div class="row"><button class="btn green" data-paid="' + c.id + '" style="min-height:36px;font-size:14px;padding:4px 10px">Paid</button><button class="btn" data-dec="' + c.id + '" style="min-height:36px;font-size:14px;padding:4px 10px">Not now</button></div>'
          : c.status === "paid" ? '<span class="good">Paid ' + fmtDate(c.decided) + "</span>" : '<span class="muted">Not now · coins returned</span>';
        return '<div class="spread" style="border-top:1px solid #e6dcc0;padding-top:6px"><span><b>RM ' + Number(c.rm).toFixed(2) + "</b> · " + c.coins + ' coins<br><span class="muted" style="font-size:12px">Asked ' + fmtDate(c.asked) + "</span></span>" + right + "</div>";
      }).join("") : '<span class="muted">No requests yet.</span>') + '<span class="muted">Paid so far: RM ' + paidTotal.toFixed(2) + "</span></div>" +
      '<div class="sec"><h3>Settings</h3><button class="btn" id="chpin" style="min-height:40px;font-size:14px">Change PIN</button></div>' +
      "</div>";
    function bar(label, v) { var col = v == null ? "#e6e6ee" : v >= 70 ? "#2b8a3e" : v >= 45 ? "#e8890c" : "#b42318"; return '<div><div class="spread" style="font-size:14px;font-weight:600"><span>' + label + "</span><span>" + (v == null ? "–" : v + "%") + '</span></div><div class="mbar"><i style="width:' + (v || 0) + "%;background:" + col + '"></i></div></div>'; }
    $("#back").onclick = function () { document.body.style.background = ""; PIN = null; lobby(); };
    $("#copy").onclick = function () {
      var txt = JSON.stringify({ exported: new Date().toISOString(), state: data.state, cash: cash, events: ev });
      var ta = $("#dump");
      try { navigator.clipboard.writeText(txt).then(function () { toast("Copied! Paste it to Claude for analysis."); }, function () { ta.classList.remove("hidden"); ta.value = txt; ta.select(); toast("Select all and copy the text in the box"); }); }
      catch (e) { ta.classList.remove("hidden"); ta.value = txt; ta.select(); }
    };
    $("#reqtest").onclick = function () {
      var f = { testRequestedAt: Date.now() };
      if (ONLINE) apiPost("/api/mummy/flag", { flags: f }, PIN).then(function () { FLAGS.testRequestedAt = f.testRequestedAt; toast("Done! Keisha will see the Power Check in her lobby."); });
      else { FLAGS.testRequestedAt = f.testRequestedAt; toast("Done! Keisha will see the Power Check in her lobby."); }
    };
    app.querySelectorAll("[data-paid],[data-dec]").forEach(function (b) {
      b.onclick = function () {
        var id = +(b.dataset.paid || b.dataset.dec), status = b.dataset.paid ? "paid" : "declined";
        if (ONLINE) apiPost("/api/mummy/cash", { id: id, status: status }, PIN).then(function () { mummy(); }).catch(function (e) { toast(e.message); });
        else { CASH.forEach(function (c) { if (c.id === id) { c.status = status; c.decided = Date.now(); if (status === "declined") { S.coins += c.coins; S.refunded.push(c.id); save(); } } }); lsSet(LS.cash, CASH); mummy(); }
      };
    });
    $("#chpin").onclick = function () {
      modal('<b>Change PIN</b><input class="pin" id="op" type="password" inputmode="numeric" placeholder="old" style="margin-top:8px"><input class="pin" id="np" type="password" inputmode="numeric" placeholder="new" style="margin-top:8px"><div class="row" style="margin-top:12px"><button class="btn" id="mclose" style="flex:1">Cancel</button><button class="btn green" id="mok" style="flex:1">Save</button></div>');
      document.getElementById("mclose").onclick = closeModal;
      document.getElementById("mok").onclick = function () {
        var o = document.getElementById("op").value.trim(), n = document.getElementById("np").value.trim();
        if (!/^\d{4,8}$/.test(n)) return toast("PIN must be 4–8 digits");
        if (ONLINE) apiPost("/api/mummy/setpin", { pin: n, oldPin: o }).then(function () { PIN = n; closeModal(); toast("PIN changed"); }).catch(function (e) { toast(e.message); });
        else if (lsGet(LS.pin, null) === hashLocal(o)) { lsSet(LS.pin, hashLocal(n)); PIN = n; closeModal(); toast("PIN changed"); } else toast("Old PIN is wrong");
      };
    };
  }

  boot();
})();
