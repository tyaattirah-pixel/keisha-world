// Keisha's World — game app
(function () {
  "use strict";

  /* ======================= CONTENT ======================= */
  var STAGES = [];
  WORLDS.forEach(function (w) {
    w.islands.forEach(function (isl) {
      var si = STAGES.length;
      var words = parseWords(isl.w).map(function (x) { x.stage = si; return x; });
      var gaps = [];
      ["tb", "nw"].forEach(function (src) {
        (isl[src] || "").split(";").filter(Boolean).forEach(function (t, n) {
          var answers = [], re = /\[(.+?)\]/g, m;
          while ((m = re.exec(t))) answers.push(m[1]);
          answers.forEach(function (ans, k) {
            var c = -1;
            var text = t.replace(/\[(.+?)\]/g, function (_, a) { c++; return c === k ? "＿" : a; });
            gaps.push({ id: src + si + "-" + n + "-" + k, src: src, text: text, full: t.replace(/[\[\]]/g, ""), ans: ans, stage: si });
          });
        });
      });
      var rqs = (isl.rq || "").split(";").filter(Boolean).map(function (r, n) {
        var p = r.split("|");
        return { id: "rq" + si + "-" + n, src: "rq", text: p[0], q: p[1], ans: p[2], wrong: p[3].split(","), word: p[4], stage: si };
      });
      STAGES.push({ world: w.id, zh: isl.zh, en: isl.en, words: words, gaps: gaps, rqs: rqs });
    });
  });
  var ALL = [].concat.apply([], STAGES.map(function (s) { return s.words; }));
  var ALL_GAPS = [].concat.apply([], STAGES.map(function (s) { return s.gaps; }));
  var ALL_RQS = [].concat.apply([], STAGES.map(function (s) { return s.rqs; }));
  var BY_ZH = {}; ALL.forEach(function (w) { BY_ZH[w.zh] = w; });
  // pinyin for single characters (from the word list) — used by the "Key words" hint
  var CHAR_PY = {};
  ALL.forEach(function (w) { var cs = w.zh.split(""), ps = w.py.split(" "); if (cs.length === ps.length) cs.forEach(function (c, i) { if (!CHAR_PY[c]) CHAR_PY[c] = ps[i]; }); });
  var GLOSS = { "谁": "who", "什么": "what", "哪里": "where", "哪一个": "which one", "怎么样": "how / what is it like", "颜色": "colour", "做": "do", "旁边": "beside", "小朋友": "children", "晚上": "evening", "早上": "morning" };
  var POWER_ITEMS = {}; Object.keys(POWER).forEach(function (y) { POWER_ITEMS[y] = parseWords(POWER[y]); });

  var RULES = {
    perStage: 15, baseA: 3, maxA: 9,
    coin: { R: 3, C: 5, A: 7 }, hintCost: { R: 1, C: 3, A: 3 },
    passScore: 12, passMaxHints: 4,
    speedFromStage: 7, speedMs: 5000,
    badgeDays: 2,
    missDaysPerPenalty: 3, penaltyCoins: 5,
    coinsPerRM: 100, testEveryDays: 28, testReward: 20
  };
  var LVL = {
    R: { name: "Recognition", zh: "认读", color: "#2f6fd6", tag: "RECOGNITION · 认读" },
    C: { name: "Comprehension", zh: "理解", color: "#c4570a", tag: "COMPREHENSION · 理解" },
    A: { name: "Application", zh: "运用", color: "#7a3fd0", tag: "APPLICATION · 运用" }
  };

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
    if (type === "answer" || type === "stage_end" || type === "test_end") { HIST.push(e); PROG = null; }
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
  function speakSlow(t) { try { speechSynthesis.cancel(); var u = new SpeechSynthesisUtterance(t.split("").join(" ")); u.lang = "zh-CN"; if (zhVoice) u.voice = zhVoice; u.rate = 0.4; speechSynthesis.speak(u); } catch (e) {} }
  function speak(t) { try { speechSynthesis.cancel(); var u = new SpeechSynthesisUtterance(t); u.lang = "zh-CN"; if (zhVoice) u.voice = zhVoice; u.rate = 0.75; speechSynthesis.speak(u); } catch (e) { toast("Sound is not available on this device"); } }
  var avatarHandle = null;
  function mountAvatar(sel, opts) { if (avatarHandle) avatarHandle.destroy(); var el = $(sel); if (el) avatarHandle = Avatar3D.mount(el, opts); }
  // ---- per-word progress: badges R → C → A (2 clean answers on different days each) ----
  var PROG = null;
  function levelOf(e) { return e.level || (e.mode ? "C" : null); }
  function blankProg() { return { R: {}, C: {}, A: {}, right: 0, wrong: 0, hints: 0, clean: 0, cRight: 0, bR: false, bC: false, bA: false, mastered: false, weak: 0, last: [] }; }
  function progress() { if (!PROG) PROG = progressOf(HIST); return PROG; }
  function progressOf(list) {
    var P = {};
    list.forEach(function (e) {
      if (e.type !== "answer" || !e.item) return;
      var L = levelOf(e); if (!L) return;
      var p = P[e.item] || (P[e.item] = blankProg());
      if (e.correct) { p.right++; if (L === "C") p.cRight++; } else p.wrong++;
      p.hints += e.hints || 0;
      if (e.correct && !e.hints) { p.clean++; p[L][dstr(new Date(e.ts))] = 1; }
    });
    Object.keys(P).forEach(function (k) {
      var p = P[k], n = RULES.badgeDays;
      p.bR = Object.keys(p.R).length >= n;
      p.bC = p.bR && Object.keys(p.C).length >= n;
      p.bA = p.bC && Object.keys(p.A).length >= n;
      p.mastered = p.bA;
      p.weak = p.wrong * 2 + p.hints - p.clean;
    });
    return P;
  }
  function stats(zh) { return progress()[zh] || blankProg(); }
  function badgeCount(zh) { var p = stats(zh); return (p.bR ? 1 : 0) + (p.bC ? 1 : 0) + (p.bA ? 1 : 0); }
  function cleanGapIds() { var s = {}; HIST.forEach(function (e) { if (e.type === "answer" && e.gid && e.correct && !e.hints) s[e.gid] = 1; }); return s; }
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
  function canSpeak() { return "speechSynthesis" in window; }
  function plain(py) { return String(py).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ü/g, "v").replace(/\s/g, ""); }
  function pickN(lists, n, w, avoid) {
    var out = [], zh = {}, en = {};
    zh[w.zh] = 1; en[w.en] = 1;
    (avoid || []).forEach(function (a) { zh[a] = 1; });
    lists.forEach(function (list) {
      shuffle(list).forEach(function (x) { if (out.length < n && !zh[x.zh] && !en[x.en]) { out.push(x); zh[x.zh] = 1; if (x.en) en[x.en] = 1; } });
    });
    return out;
  }
  function near(w) { return ALL.filter(function (x) { return Math.abs(x.stage - w.stage) <= 2; }); }
  function soundAlike(w) {
    var b = plain(w.py), ini = (b.match(/^(zh|ch|sh|[bpmfdtnlgkhjqxrzcsyw])/) || [""])[0];
    var pool = ALL.filter(function (x) { return x.zh.length === w.zh.length; });
    return pickN([pool.filter(function (x) { return plain(x.py) === b; }), pool.filter(function (x) { return ini && plain(x.py).indexOf(ini) === 0; }), near(w).filter(function (x) { return x.zh.length === w.zh.length; }), pool, ALL], 3, w);
  }
  function twinsOf(w) {
    var t = (TWINS[w.zh] || "").split("").filter(function (c) { return c !== w.zh; }).map(function (c) { return BY_ZH[c] || { zh: c, py: "", en: "" }; });
    var out = []; t.forEach(function (x) { if (out.length < 3 && !out.some(function (o) { return o.zh === x.zh; })) out.push(x); });
    if (out.length < 3) out = out.concat(pickN([near(w), ALL], 3 - out.length, w, out.map(function (o) { return o.zh; })));
    return out;
  }
  function meaningOpts(w) { return pickN([near(w), ALL], 3, w); }

  function buildRC(level, w) {
    var type, opts;
    if (level === "R") {
      type = TWINS[w.zh] && (Math.random() < 0.5 || !canSpeak()) ? "twin" : "hear";
      opts = type === "twin" ? twinsOf(w) : soundAlike(w);
    } else {
      var r = Math.random();
      type = w.pic && r < 0.3 ? "pic" : r < 0.65 ? "zh2en" : "en2zh";
      opts = type === "pic" ? pickN([near(w).filter(function (x) { return x.pic && x.pic !== w.pic; }), ALL.filter(function (x) { return x.pic && x.pic !== w.pic; })], 3, w) : meaningOpts(w);
    }
    return { level: level, type: type, w: w, opts: shuffle([w].concat(opts.slice(0, 3))) };
  }
  function buildA(item) {
    var st = STAGES[item.stage], q = { level: "A", item: item };
    if (item.src === "rq") {
      q.type = "rq"; q.w = BY_ZH[item.word]; q.key = item.word;
      q.opts = shuffle([item.ans].concat(item.wrong)).map(function (t) { return { zh: t, text: t }; });
      q.answer = item.ans;
    } else {
      q.type = "gap"; q.w = BY_ZH[item.ans]; q.key = item.ans;
      var same = st.words.filter(function (x) { return x.zh !== item.ans && item.full.indexOf(x.zh) < 0; });
      var sameLen = same.filter(function (x) { return x.zh.length === item.ans.length; });
      var d = pickN([sameLen, same, near(q.w).filter(function (x) { return item.full.indexOf(x.zh) < 0; })], 3, q.w);
      q.opts = shuffle([q.w].concat(d)).map(function (x) { return { zh: x.zh, text: x.zh, w: x }; });
      q.answer = item.ans;
    }
    return q;
  }
  function itemsFor(word) {
    return ALL_GAPS.filter(function (g) { return g.ans === word; }).concat(ALL_RQS.filter(function (r) { return r.word === word; }));
  }
  function chooseA(stageIdx) {
    var st = STAGES[stageIdx], cleanIds = cleanGapIds();
    // words she got right in Comprehension (this stage first, then before), with fewest Application days
    var ok = Object.keys(G.cOk).concat(st.words.filter(function (w) { return stats(w.zh).cRight > 0; }).map(function (w) { return w.zh; }));
    var seen = {}, cands = [];
    ok.forEach(function (z) { if (!seen[z] && itemsFor(z).length) { seen[z] = 1; cands.push(z); } });
    cands = shuffle(cands).sort(function (a, b) { return Object.keys(stats(a).A).length - Object.keys(stats(b).A).length; });
    var pool = [];
    cands.forEach(function (z) {
      var its = itemsFor(z).filter(function (it) { return !G.used[it.id]; });
      var tbNew = its.filter(function (it) { return it.src === "tb" && !cleanIds[it.id]; });
      // textbook first; once she has done the textbook sentence, mix in new sentences
      var pick = tbNew.length ? tbNew : shuffle(its).sort(function (a, b) { return (a.src === "tb" ? 1 : 0) - (b.src === "tb" ? 1 : 0) + (Math.random() - 0.5); });
      if (pick.length) pool.push(pick[0]);
    });
    if (!pool.length) pool = shuffle(st.gaps.filter(function (g) { return g.src === "tb" && !G.used[g.id]; }));
    if (!pool.length) pool = shuffle(st.gaps.concat(st.rqs));
    var it = pool[0]; G.used[it.id] = 1;
    return buildA(it);
  }
  function startStage(i) {
    var st = STAGES[i];
    var cb = st.words.filter(function (w) { return stats(w.zh).bC; }).length / st.words.length;
    var nA = Math.min(RULES.maxA, RULES.baseA + Math.round(cb * (RULES.maxA - RULES.baseA)));
    var rest = RULES.perStage - nA, nR = Math.ceil(rest / 2), nC = rest - nR;
    var own = shuffle(st.words);
    var review = shuffle(ALL.filter(function (w) { return w.stage < i; })).sort(function (a, b) { return stats(b.zh).weak - stats(a.zh).weak; }).slice(0, 6);
    function pickWords(n, flag) {
      var pool = own.concat(review).slice().sort(function (a, b) { return (stats(a.zh)[flag] ? 1 : 0) - (stats(b.zh)[flag] ? 1 : 0); });
      var out = []; for (var k = 0; k < n; k++) out.push(pool[k % pool.length]); return out;
    }
    var qs = pickWords(nR, "bR").map(function (w) { return buildRC("R", w); }).concat(pickWords(nC, "bC").map(function (w) { return buildRC("C", w); }));
    qs = shuffle(qs);
    for (var k = 0; k < nA; k++) qs.push({ level: "A", pending: true });
    G = { stage: i, qs: qs, idx: 0, score: 0, hints: 0, coins: 0, wrong: [], t0: Date.now(), cOk: {}, used: {}, badges: [] };
    log("stage_start", null, { stage: i, mix: nR + "R" + nC + "C" + nA + "A" });
    question();
  }
  var HINTS = {
    hear: [["py", "Aa", "Pinyin"], ["slow", "🐢", "Hear slowly"], ["clue", "🔍", "Character clue"]],
    twin: [["en", "EN", "Meaning"], ["hear", "🔊", "Hear it"], ["clue", "🔍", "Character clue"]],
    zh2en: [["py", "Aa", "Pinyin"], ["hear", "🔊", "Hear it"], ["tr", "EN", "Translate"]],
    en2zh: [["py", "Aa", "Pinyin"], ["hear", "🔊", "Hear it"], ["tr", "EN", "Translate"]],
    pic: [["py", "Aa", "Pinyin"], ["hear", "🔊", "Hear it"], ["tr", "EN", "Translate"]],
    gap: [["sent", "🔊", "Hear sentence"], ["key", "Aa", "Key words"], ["tr", "EN", "Translate"]],
    rq: [["sent", "🔊", "Hear sentence"], ["key", "Aa", "Key words"], ["tr", "EN", "Translate"]]
  };
  function sentenceHtml(text) {
    return text.split("").map(function (c) {
      if (c === "＿") return '<span class="blank">？</span>';
      return CHAR_PY[c] ? '<ruby>' + c + '<rt class="kp hidden">' + CHAR_PY[c] + "</rt></ruby>" : c;
    }).join("");
  }
  function gloss(text) {
    var out = [], i = 0, keys = Object.keys(BY_ZH).concat(Object.keys(GLOSS)).sort(function (a, b) { return b.length - a.length; });
    while (i < text.length) {
      var hit = null;
      for (var k = 0; k < keys.length; k++) { if (text.substr(i, keys[k].length) === keys[k]) { hit = keys[k]; break; } }
      if (hit && hit.length > 0) { var en = BY_ZH[hit] ? BY_ZH[hit].en : GLOSS[hit]; if (out.every(function (o) { return o[0] !== hit; })) out.push([hit, en]); i += hit.length; } else i++;
    }
    return out;
  }
  function question() {
    var q = G.qs[G.idx];
    if (q.pending) { q = G.qs[G.idx] = chooseA(G.stage); }
    q.hints = []; q.t0 = Date.now(); q.done = false;
    var w = q.w, L = LVL[q.level], pct = Math.round(G.idx / G.qs.length * 100), prompt = "", optHtml;
    var label = { hear: "Listen. Which character is it?", twin: "Spot the twin! Which one is…", zh2en: "What does this mean?", en2zh: "Which one means…", pic: "这是什么？ <small>(What is this?)</small>", gap: "Fill the gap", rq: "Read, then answer" }[q.type];
    if (q.type === "hear") prompt = (canSpeak() ? '<button class="speak" id="say" aria-label="Play sound">🔊</button><span class="muted">Tap to hear again</span>' : '<span class="py" style="font-size:40px">' + w.py + "</span>") + '<span class="py hidden" id="py">' + w.py + "</span>";
    if (q.type === "twin") prompt = '<span class="py" style="font-size:42px">' + w.py + '</span><span class="reveal hidden" id="en">= ' + esc(w.en) + "</span>";
    if (q.type === "zh2en") prompt = '<span class="big">' + w.zh + '</span><span class="py hidden" id="py">' + w.py + '</span><span class="reveal hidden" id="tr">= ' + esc(w.en) + "</span>";
    if (q.type === "en2zh") prompt = '<span class="en">' + esc(w.en) + "</span>";
    if (q.type === "pic") prompt = '<span class="pic">' + w.pic + '</span><span class="reveal hidden" id="tr">= ' + esc(w.en) + "</span>";
    if (q.type === "gap" || q.type === "rq") {
      var it = q.item;
      prompt = '<span class="srctag ' + (it.src === "tb" ? "tb" : "nw") + '">' + (it.src === "tb" ? "From your textbook · " + STAGES[it.stage].zh : "New sentence · words you know") + "</span>" +
        '<div class="sent zh">' + sentenceHtml(it.text) + "</div>" + (q.type === "rq" ? '<div class="zh" style="font-size:24px;color:' + L.color + '">' + sentenceHtml(it.q) + "</div>" : "") +
        '<div id="gl" class="hidden gl">' + gloss(it.text + (it.q || "")).map(function (g) { return '<span><b class="zh">' + g[0] + "</b> " + esc(g[1]) + "</span>"; }).join("") + "</div>";
    }
    if (q.type === "zh2en") optHtml = q.opts.map(function (o) { return esc(o.en); });
    else if (q.type === "rq" || q.type === "gap") optHtml = q.opts.map(function (o) { var g = o.w || BY_ZH[o.zh]; return '<span class="zh">' + o.text + "</span>" + (g ? '<small class="oen hidden" style="color:#1b1b2b">' + esc(g.en) + "</small>" : ""); });
    else optHtml = q.opts.map(function (o) { return '<span class="zh">' + o.zh + "</span>" + (o.py ? '<small class="opy hidden">' + o.py + "</small>" : "") + (o.en ? '<small class="oen hidden" style="color:#1b1b2b">' + esc(o.en) + "</small>" : ""); });
    var cost = RULES.hintCost[q.level];
    app.className = ""; document.body.style.background = "";
    app.innerHTML =
      '<div class="row"><button class="btn" id="quit" aria-label="Quit" style="min-height:40px;width:44px;padding:0">✕</button><div class="bar" style="flex:1"><i style="width:' + pct + '%"></i></div><b>' + (G.idx + 1) + "/" + G.qs.length + "</b></div>" +
      '<div class="card prompt" style="margin-top:14px"><span class="tag" style="background:' + L.color + '">' + L.tag + '</span><span class="muted">' + label + "</span>" + prompt + "</div>" +
      '<div class="opts' + (q.type === "rq" || q.type === "gap" ? " small" : "") + '" style="margin-top:14px">' + optHtml.map(function (h, k) { return '<button class="opt" data-k="' + k + '">' + h + "</button>"; }).join("") + "</div>" +
      '<div id="cluebox" class="hidden"></div>' +
      '<div class="hints" style="margin-top:14px" id="hintbox"><div class="spread"><b>Need help?</b><span class="muted">Each hint = −' + cost + " coin" + (cost > 1 ? "s" : "") + '</span></div><div class="grid">' +
      HINTS[q.type].map(function (h, k) { return '<button class="hint" style="background:' + ["#e9e0ff", "var(--blue)", "var(--pink)"][k] + '" data-h="' + h[0] + '"' + (k ? " disabled" : "") + '><span style="font-size:16px">' + h[1] + "</span>" + h[2] + "</button>"; }).join("") + "</div></div>" +
      '<div id="fb" style="margin-top:14px"></div>';
    $("#quit").onclick = quitAsk;
    if ($("#say")) $("#say").onclick = function () { speak(w.zh); };
    app.querySelectorAll(".opt").forEach(function (b) { b.onclick = function () { answer(+b.dataset.k); }; });
    app.querySelectorAll(".hint").forEach(function (b) { b.onclick = function () { useHint(b); }; });
    if (q.type === "hear" && canSpeak()) setTimeout(function () { speak(w.zh); }, 350);
  }
  function useHint(b) {
    var q = G.qs[G.idx]; if (q.done) return;
    var h = b.dataset.h, w = q.w;
    if (q.hints.indexOf(h) < 0) {
      q.hints.push(h);
      log("hint", q.key || w.zh, { hint: h, level: q.level, qtype: q.type, stage: G.stage, ms: Date.now() - q.t0 });
      b.classList.add("used");
      var next = b.nextElementSibling; if (next) next.disabled = false;
    }
    var show = function (sel) { app.querySelectorAll(sel).forEach(function (x) { x.classList.remove("hidden"); }); };
    if (h === "py") { show("#py"); show(".opy"); }
    if (h === "en") show("#en");
    if (h === "hear") speak(q.type === "twin" || q.type === "en2zh" || q.type === "pic" ? w.zh : w.zh);
    if (h === "slow") speakSlow(w.zh);
    if (h === "clue") { var cb = $("#cluebox"); cb.className = "clue"; cb.innerHTML = '<b>🔍 Character clue</b><div class="row" style="margin-top:6px"><span class="zh" style="font-size:46px">' + w.zh + '</span><span style="font-size:15px;line-height:1.35">' + esc(w.clue) + "</span></div>"; }
    if (h === "tr") { show("#tr"); show(".oen"); show("#gl"); }
    if (h === "sent") speak((q.item.full || q.item.text) + (q.item.q ? "。" + q.item.q : ""));
    if (h === "key") show(".kp");
  }
  function answer(k) {
    var q = G.qs[G.idx]; if (q.done) return; q.done = true;
    var w = q.w, o = q.opts[k], ms = Date.now() - q.t0;
    var ok = q.level === "A" ? o.zh === q.answer : o.zh === w.zh;
    var key = q.key || w.zh, nh = q.hints.length, earned = 0, speed = false;
    var before = stats(key);
    var hadBadge = { R: before.bR, C: before.bC, A: before.bA };
    if (ok) {
      earned = Math.max(0, RULES.coin[q.level] - nh * RULES.hintCost[q.level]);
      if (G.stage + 1 >= RULES.speedFromStage && nh === 0 && ms < RULES.speedMs) { earned += 1; speed = true; }
      G.score++;
      if (q.level === "C") G.cOk[w.zh] = 1;
    } else G.wrong.push(w);
    G.hints += nh; G.coins += earned; S.coins += earned;
    app.querySelectorAll(".opt").forEach(function (b, j) { var x = q.opts[j]; var right = q.level === "A" ? x.zh === q.answer : x.zh === w.zh; if (right) b.classList.add("right"); else if (j === k) b.classList.add("wrong"); b.disabled = true; });
    log("answer", key, { level: q.level, qtype: q.type, stage: G.stage, correct: ok ? 1 : 0, chosen: o.zh, hints: nh, hintList: q.hints.join(","), ms: ms, coins: earned, speed: speed ? 1 : 0, q: G.idx, src: q.item ? q.item.src : null, gid: q.item ? q.item.id : null });
    save();
    var after = stats(key), newBadge = null;
    ["R", "C", "A"].forEach(function (L) { if (!hadBadge[L] && after["b" + L]) newBadge = L; });
    if (newBadge) G.badges.push([key, newBadge]);
    if (q.level === "A") speak(q.item.full ? q.item.full : q.item.text); else speak(w.zh);
    $("#hintbox").classList.add("hidden");
    var detail = q.level === "A"
      ? (q.item.full ? '<span class="zh">' + esc(q.item.full) + "</span>" : '<span class="zh">' + esc(q.answer) + "</span>")
      : '<span class="zh">' + w.zh + "</span> " + w.py + " = " + esc(w.en);
    $("#fb").innerHTML = '<div class="feedback" style="background:' + (ok ? "#c9f5d4" : "#ffe1e1") + '"><div style="flex:1">' +
      (ok ? (nh ? "Correct!" : ["Yes! First try!", "Amazing!", "So smart!", "Perfect!"][Math.floor(Math.random() * 4)]) : "Not quite!") + "<br>" + detail +
      (speed ? "<br><small>⚡ Speed bonus!</small>" : "") + (newBadge ? '<br><b style="color:' + LVL[newBadge].color + '">🏅 New ' + LVL[newBadge].name + " badge for " + key + "!</b>" : "") + "</div>" +
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
    var byL = { R: [0, 0], C: [0, 0], A: [0, 0] };
    HIST.slice(-G.qs.length).forEach(function (e) { var L = levelOf(e); if (e.type === "answer" && L && byL[L]) { byL[L][1]++; if (e.correct) byL[L][0]++; } });
    log("stage_end", null, { stage: i, score: G.score, hints: G.hints, ms: ms, coins: G.coins, passed: passed ? 1 : 0, byLevel: byL });
    save();
    var stars = G.score >= 14 ? 3 : G.score >= RULES.passScore ? 2 : G.score >= 8 ? 1 : 0;
    var starSvg = function (on, s) { return '<svg width="' + s + '" height="' + s + '" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9z" fill="' + (on ? "#ffc93c" : "#e6e6ee") + '" stroke="#1b1b2b" stroke-width="1.6" stroke-linejoin="round"/></svg>'; };
    var lastMs = prev ? prev.lastMs || prev.ms : null;
    var wrongUniq = []; G.wrong.forEach(function (w) { if (w && wrongUniq.indexOf(w) < 0) wrongUniq.push(w); });
    app.className = "purple-bg"; document.body.style.background = "#7a4bd6";
    app.innerHTML = '<div class="col" style="align-items:center;padding-top:16px">' +
      '<div class="title">' + (passed ? "STAGE CLEAR!" : "SO CLOSE!") + "</div>" +
      '<div class="row" style="align-items:flex-end">' + starSvg(stars >= 1, 56) + starSvg(stars >= 2, 72) + starSvg(stars >= 3, 56) + "</div>" +
      '<div class="stats" style="width:100%">' +
      '<div class="stat" style="background:#d8f7e0"><span>Correct</span><b>' + G.score + " / " + G.qs.length + "</b></div>" +
      '<div class="stat" style="background:#ffe1f0"><span>Hints used</span><b>' + G.hints + "</b></div>" +
      '<div class="stat" style="background:#dcefff"><span>Time this stage</span><b>' + fmtTime(ms) + "</b></div>" +
      '<div class="stat" style="background:#fff4d1"><span>Coins earned</span><b>' + coin() + " +" + G.coins + "</b></div></div>" +
      '<div class="card" style="width:100%"><div class="spread">' + ["R", "C", "A"].map(function (L) { return '<span class="lvpill" style="background:' + LVL[L].color + '">' + L + " " + byL[L][0] + "/" + byL[L][1] + "</span>"; }).join("") + "</div>" +
      (G.badges.length ? '<div style="margin-top:8px"><b>🏅 New badges:</b> ' + G.badges.map(function (b) { return '<span class="zh">' + b[0] + '</span> <span class="lvpill" style="background:' + LVL[b[1]].color + '">' + b[1] + "</span>"; }).join(" ") + "</div>" : "") + "</div>" +
      (lastMs ? '<div class="card" style="width:100%"><b>' + (ms < lastMs ? "⏱ Faster than last time!" : "⏱ Last time: " + fmtTime(lastMs)) + '</b> <span class="muted">' + fmtTime(lastMs) + " → " + fmtTime(ms) + "</span></div>" : "") +
      (i + 1 < RULES.speedFromStage ? '<div class="card" style="width:100%;background:#fff4d1"><b>⚡ Speed bonus unlocks at Stage ' + RULES.speedFromStage + '</b><br><span class="muted">Answer right in under 5 seconds with no hints = +1 extra coin</span></div>' : "") +
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
  // 12 per year: 4 Recognition (hear → pick), 6 Comprehension (meaning), 2 Application (fill the gap)
  var T = null;
  function powerCheck() {
    var order = [];
    [1, 2, 3, 4].forEach(function (y) {
      var items = shuffle(POWER_ITEMS[y]);
      items.slice(0, 4).forEach(function (w) { order.push({ y: y, L: "R", w: w }); });
      items.slice(4, 10).forEach(function (w) { order.push({ y: y, L: "C", w: w }); });
      POWER_A[y].forEach(function (t) { var ans = t.match(/\[(.+?)\]/)[1]; order.push({ y: y, L: "A", w: POWER_ITEMS[y].filter(function (x) { return x.zh === ans; })[0], text: t.replace(/\[(.+?)\]/, "＿"), full: t.replace(/[\[\]]/g, "") }); });
    });
    // keep years in order, shuffle inside each year
    var byY = {}; order.forEach(function (o) { (byY[o.y] = byY[o.y] || []).push(o); });
    order = [].concat.apply([], [1, 2, 3, 4].map(function (y) { return shuffle(byY[y]); }));
    T = { order: order, idx: 0, per: {}, t0: Date.now() };
    [1, 2, 3, 4].forEach(function (y) { T.per[y] = { asked: 0, right: 0, wrong: 0, idk: 0, total: 12, lv: { R: [0, 0], C: [0, 0], A: [0, 0] } }; });
    log("test_start", null, {});
    testQ();
  }
  function testQ() {
    if (T.idx >= T.order.length) return testEnd();
    var it = T.order[T.idx], y = it.y, p = T.per[y];
    if (p.asked >= 6 && p.right <= 1) return testEnd();
    var pool = POWER_ITEMS[y].filter(function (x) { return x.zh !== it.w.zh && x.en !== it.w.en; });
    var opts = shuffle([it.w].concat(shuffle(pool).slice(0, 3)));
    it.opts = opts; it.t0 = Date.now();
    var pct = Math.round(T.idx / T.order.length * 100), L = LVL[it.L], prompt, optH;
    if (it.L === "R") {
      prompt = '<span class="muted">Which character is it?</span>' + (canSpeak() ? '<button class="speak" id="say" aria-label="Play sound">🔊</button>' : "") + '<span class="py" style="font-size:' + (canSpeak() ? 20 : 40) + 'px">' + (canSpeak() ? "" : it.w.py) + "</span>";
      optH = opts.map(function (o) { return '<span class="zh" style="font-size:40px">' + o.zh + "</span>"; });
    } else if (it.L === "C") {
      prompt = '<span class="muted">What does this mean?</span><span class="big">' + it.w.zh + "</span>";
      optH = opts.map(function (o) { return esc(o.en); });
    } else {
      prompt = '<span class="muted">Fill the gap</span><div class="sent zh">' + it.text.replace("＿", '<span class="blank">？</span>') + "</div>";
      optH = opts.map(function (o) { return '<span class="zh" style="font-size:34px">' + o.zh + "</span>"; });
    }
    app.className = ""; document.body.style.background = "";
    app.innerHTML = '<div class="row"><b style="white-space:nowrap">⚡ Power Check</b><div class="bar" style="flex:1"><i style="width:' + pct + '%;background:var(--yellow)"></i></div></div>' +
      '<div class="card prompt" style="margin-top:14px"><div class="row"><span class="tag">STANDARD ' + y + '</span><span class="tag" style="background:' + L.color + '">' + L.name.toUpperCase() + "</span></div>" + prompt + "</div>" +
      '<div class="opts" style="margin-top:14px">' + optH.map(function (h, k) { return '<button class="opt" data-k="' + k + '">' + h + "</button>"; }).join("") + "</div>" +
      '<button class="btn" id="idk" style="width:100%;margin-top:14px;background:#e9e0ff">🤔 I don’t know</button>' +
      '<p class="muted" style="text-align:center">No hints here. Just do your best. Not knowing is OK!</p>';
    if ($("#say")) { $("#say").onclick = function () { speak(it.w.zh); }; setTimeout(function () { speak(it.w.zh); }, 350); }
    app.querySelectorAll(".opt").forEach(function (b) { b.onclick = function () { testAns(+b.dataset.k); }; });
    $("#idk").onclick = function () { testAns(-1); };
  }
  function testAns(k) {
    var it = T.order[T.idx], p = T.per[it.y], res;
    p.asked++; p.lv[it.L][1]++;
    if (k < 0) { p.idk++; res = "idk"; } else if (it.opts[k].zh === it.w.zh) { p.right++; p.lv[it.L][0]++; res = "right"; } else { p.wrong++; res = "wrong"; }
    log("test", it.w.zh, { year: it.y, level: it.L, result: res, chosen: k < 0 ? null : it.opts[k].zh, ms: Date.now() - it.t0 });
    T.idx++; testQ();
  }
  function testEnd() {
    var per = {}, lines = "";
    [1, 2, 3, 4].forEach(function (y) {
      var p = T.per[y];
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
    var pill = function (L, on) { return '<span class="lvpill' + (on ? "" : " off") + '" style="' + (on ? "background:" + LVL[L].color : "") + '">' + L + "</span>"; };
    var html = '<div class="spread"><button class="btn" id="back">← Back</button><span class="h2">My words</span><span></span></div>' +
      '<div class="card row" style="margin:12px 0;justify-content:space-between;font-size:13px;font-weight:600">' + pill("R", 1) + "Recognise " + pill("C", 1) + "Understand " + pill("A", 1) + "Use it</div>" +
      '<p class="muted">Badges unlock in order R → C → A: 2 right answers with no hints, on 2 different days. All three = ⭐ MASTER word. Tap a word to hear it.</p>';
    STAGES.forEach(function (s, i) {
      if (i > S.unlocked) return;
      html += '<div class="card" style="margin-bottom:10px"><b>Island ' + (i + 1) + ' · <span class="zh">' + s.zh + '</span></b> <span class="muted">' + s.en + "</span>" +
        s.words.map(function (w) { var p = stats(w.zh); return '<button class="wrow" data-say="' + w.zh + '"><span class="zh" style="font-size:24px;min-width:56px;text-align:left">' + w.zh + '</span><span style="flex:1;text-align:left;line-height:1.1"><b style="color:#c2185b;font-size:13px">' + w.py + '</b><br><span class="muted" style="font-size:12px">' + esc(w.en) + "</span></span>" + pill("R", p.bR) + pill("C", p.bC) + pill("A", p.bA) + (p.mastered ? " ⭐" : "") + "</button>"; }).join("") + "</div>";
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
    var PR = progressOf(A), met = Object.keys(PR).filter(function (k) { return BY_ZH[k]; });
    var mastered = met.filter(function (k) { return PR[k].mastered; }).length;
    var pct = function (f) { return met.length ? Math.round(met.filter(f).length / met.length * 100) : null; };
    var pR = pct(function (k) { return PR[k].bR; }), pC = pct(function (k) { return PR[k].bC; }), pA = pct(function (k) { return PR[k].bA; });
    var gapRC = met.filter(function (k) { return PR[k].bR && !PR[k].bC; }), gapCA = met.filter(function (k) { return PR[k].bC && !PR[k].bA; });
    var HNAME = { py: "Pinyin", slow: "Hear slowly", clue: "Character clue", en: "Meaning", hear: "Hear it", tr: "Translate", sent: "Hear sentence", key: "Key words" };
    var hintRows = ["R", "C", "A"].map(function (L) {
      var hs = ev.filter(function (e) { return e.type === "hint" && (e.level || (e.mode ? "C" : "")) === L; }), cnt = {};
      hs.forEach(function (e) { cnt[e.hint] = (cnt[e.hint] || 0) + 1; });
      var top = Object.keys(cnt).sort(function (a, b) { return cnt[b] - cnt[a]; })[0];
      var after = top ? A.filter(function (e) { return levelOf(e) === L && (e.hintList || "").split(",").indexOf(top) >= 0; }) : [];
      var ok = after.filter(function (e) { return e.correct; }).length;
      var firstTry = A.filter(function (e) { return levelOf(e) === L; }), ft = firstTry.filter(function (e) { return e.correct && !e.hints; }).length;
      return { L: L, top: top ? HNAME[top] + " (" + cnt[top] + "×)" : "–", after: after.length ? Math.round(ok / after.length * 100) + "%" : "–", first: firstTry.length ? Math.round(ft / firstTry.length * 100) : null };
    });
    var accSrc = function (f) { var x = A.filter(function (e) { return levelOf(e) === "A" && f(e.src); }), r = x.filter(function (e) { return e.correct && !e.hints; }).length; return x.length ? Math.round(r / x.length * 100) : null; };
    var aTb = accSrc(function (s) { return s === "tb"; }), aNw = accSrc(function (s) { return s === "nw" || s === "rq"; });
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
      '</table><span class="muted">Master words so far (all three badges): <b>' + mastered + "</b> of " + ALL.length + "</span></div>" +
      '<div class="sec"><div class="spread"><h3>Level vs school syllabus</h3><span class="muted" style="font-size:12px">' + (lastTest ? "Power Check " + fmtDate(lastTest.ts) : "") + "</span></div>" +
      '<span class="muted">Share of each year’s textbook characters she can read (lucky guesses removed)</span>' + testHtml +
      '<div class="notice"><b>Working level:</b> ' + working + " · <b>Target:</b> Standard 5</div>" +
      (tests.length > 1 ? '<table><tr><th>Date</th><th>Std 1</th><th>Std 2</th><th>Std 3</th><th>Std 4</th></tr>' + testHist + "</table>" : "") +
      '<div class="spread"><span class="muted">Next monthly check: ' + nextTest + '</span><button class="btn yellow" id="reqtest" style="min-height:36px;font-size:14px;padding:4px 10px">Ask for one now</button></div></div>' +
      '<div class="sec"><h3>Understanding levels</h3><span class="muted">Words she has met: <b>' + met.length + '</b> · Master words (all three badges): <b>' + mastered + '</b></span>' +
      bar("R · Recognises the character", pR, "#2f6fd6") + bar("C · Understands the meaning", pC, "#c4570a") + bar("A · Can use it in a sentence", pA, "#7a3fd0") +
      '<span class="muted" style="font-size:12px">A badge = 2 right answers with no hints on 2 different days, in order R → C → A.</span></div>' +
      '<div class="sec" style="background:#fff7ec"><h3>What the gaps mean</h3>' +
      '<div><b>Recognises but doesn’t understand (' + gapRC.length + ')</b><br><span class="muted">She can read them, but the meaning isn’t there yet. More picture and meaning practice.</span></div><div class="row" style="flex-wrap:wrap">' + gapRC.slice(0, 20).map(function (k) { return '<span class="chip zh" style="font-size:16px;padding:2px 8px;box-shadow:none">' + k + '</span>'; }).join("") + '</div>' +
      '<div style="border-top:1px solid #e6dcc0;padding-top:6px"><b>Understands but can’t use it (' + gapCA.length + ')</b><br><span class="muted">Knows the word alone, but gets lost in a sentence. More fill-the-gap and reading.</span></div><div class="row" style="flex-wrap:wrap">' + gapCA.slice(0, 20).map(function (k) { return '<span class="chip zh" style="font-size:16px;padding:2px 8px;box-shadow:none">' + k + '</span>'; }).join("") + '</div></div>' +
      '<div class="sec"><h3>Each level: first try and best hint</h3><table><tr><th>Level</th><th>First try</th><th>Most used hint</th><th>Right after it</th></tr>' +
      hintRows.map(function (r) { return '<tr><td><span class="lvpill" style="background:' + LVL[r.L].color + '">' + r.L + '</span> ' + LVL[r.L].name + '</td><td><b>' + (r.first == null ? "–" : r.first + "%") + '</b></td><td>' + r.top + '</td><td>' + r.after + '</td></tr>'; }).join("") + '</table>' +
      '<span class="muted">If “Hear it” helps most, she understands spoken Chinese better than written.</span></div>' +
      '<div class="sec"><h3>Textbook vs new sentences</h3>' + bar("Textbook sentences, first try", aTb, "#7a3fd0") + bar("New sentences (same words), first try", aNw, "#a78bfa") +
      '<span class="muted">A big gap means she may be remembering the textbook rather than reading it.</span></div>' +
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
    function bar(label, v, fixed) { var col = fixed || (v == null ? "#e6e6ee" : v >= 70 ? "#2b8a3e" : v >= 45 ? "#e8890c" : "#b42318"); return '<div><div class="spread" style="font-size:14px;font-weight:600"><span>' + label + "</span><span>" + (v == null ? "–" : v + "%") + '</span></div><div class="mbar"><i style="width:' + (v || 0) + "%;background:" + col + '"></i></div></div>'; }
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

  if (/debug/.test(location.search)) window.__kwG = function () { return G; };
  boot();
})();
