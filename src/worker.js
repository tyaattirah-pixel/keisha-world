// Keisha's World — Cloudflare Worker (serves the app + a small API on D1)

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated INTEGER)`,
  `CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER NOT NULL, type TEXT NOT NULL, item TEXT, data TEXT)`,
  `CREATE INDEX IF NOT EXISTS idx_events_ts ON events(ts)`,
  `CREATE TABLE IF NOT EXISTS cash (id INTEGER PRIMARY KEY AUTOINCREMENT, asked INTEGER NOT NULL, coins INTEGER NOT NULL, rm REAL NOT NULL, status TEXT NOT NULL DEFAULT 'pending', decided INTEGER)`
];

let ready = false;
async function ensureSchema(db) {
  if (ready) return;
  await db.batch(SCHEMA.map((s) => db.prepare(s)));
  ready = true;
}

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

async function sha256(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("keisha-world:" + text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function getKV(db, key) {
  const row = await db.prepare("SELECT value FROM kv WHERE key = ?").bind(key).first();
  return row ? JSON.parse(row.value) : null;
}
async function setKV(db, key, value) {
  await db.prepare("INSERT INTO kv (key, value, updated) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated = excluded.updated")
    .bind(key, JSON.stringify(value), Date.now()).run();
}

async function checkPin(req, db) {
  const hash = await getKV(db, "pin");
  if (!hash) return false;
  const pin = req.headers.get("x-pin") || "";
  return (await sha256(pin)) === hash;
}

async function api(req, env, url) {
  const db = env.DB;
  if (!db) return json({ error: "Database not connected. Add the D1 binding named DB." }, 500);
  await ensureSchema(db);
  const p = url.pathname;
  const body = req.method === "POST" ? await req.json().catch(() => ({})) : null;

  // ---------- Keisha's side ----------
  if (p === "/api/state" && req.method === "GET") {
    const state = await getKV(db, "state");
    const events = await db.prepare("SELECT ts, type, item, data FROM events WHERE type IN ('answer','stage_end','test_end') ORDER BY id DESC LIMIT 5000").all();
    const cash = await db.prepare("SELECT * FROM cash ORDER BY id DESC LIMIT 50").all();
    const pinSet = !!(await getKV(db, "pin"));
    const flags = (await getKV(db, "flags")) || {};
    return json({ state, flags, events: events.results.map(unpack), cash: cash.results, pinSet });
  }
  if (p === "/api/state" && req.method === "POST") {
    if (!body || typeof body.state !== "object") return json({ error: "bad state" }, 400);
    await setKV(db, "state", body.state);
    return json({ ok: true });
  }
  if (p === "/api/events" && req.method === "POST") {
    const list = Array.isArray(body.events) ? body.events.slice(0, 200) : [];
    if (list.length) {
      await db.batch(list.map((e) =>
        db.prepare("INSERT INTO events (ts, type, item, data) VALUES (?, ?, ?, ?)")
          .bind(Number(e.ts) || Date.now(), String(e.type || "event").slice(0, 40), e.item == null ? null : String(e.item).slice(0, 40), JSON.stringify(e).slice(0, 4000))));
    }
    return json({ ok: true, saved: list.length });
  }
  if (p === "/api/cash" && req.method === "POST") {
    const coins = Math.max(0, Math.floor(Number(body.coins) || 0));
    if (!coins) return json({ error: "bad amount" }, 400);
    await db.prepare("INSERT INTO cash (asked, coins, rm) VALUES (?, ?, ?)").bind(Date.now(), coins, coins / 100).run();
    return json({ ok: true });
  }

  // ---------- Mummy's side (PIN protected) ----------
  if (p === "/api/mummy/setpin" && req.method === "POST") {
    const existing = await getKV(db, "pin");
    const pin = String(body.pin || "");
    if (!/^\d{4,8}$/.test(pin)) return json({ error: "PIN must be 4–8 digits" }, 400);
    if (existing) {
      const old = String(body.oldPin || "");
      if ((await sha256(old)) !== existing) return json({ error: "Old PIN is wrong" }, 403);
    }
    await setKV(db, "pin", await sha256(pin));
    return json({ ok: true });
  }
  if (p.startsWith("/api/mummy/")) {
    if (!(await checkPin(req, db))) return json({ error: "Wrong PIN" }, 403);
    if (p === "/api/mummy/data" && req.method === "GET") {
      const events = await db.prepare("SELECT ts, type, item, data FROM events ORDER BY id ASC LIMIT 50000").all();
      const cash = await db.prepare("SELECT * FROM cash ORDER BY id DESC").all();
      const state = await getKV(db, "state");
      const flags = (await getKV(db, "flags")) || {};
      return json({ state, flags, events: events.results.map(unpack), cash: cash.results });
    }
    if (p === "/api/mummy/cash" && req.method === "POST") {
      const id = Number(body.id);
      const status = body.status === "paid" ? "paid" : body.status === "declined" ? "declined" : null;
      if (!id || !status) return json({ error: "bad request" }, 400);
      const row = await db.prepare("SELECT * FROM cash WHERE id = ?").bind(id).first();
      if (!row || row.status !== "pending") return json({ error: "Already decided" }, 409);
      await db.prepare("UPDATE cash SET status = ?, decided = ? WHERE id = ?").bind(status, Date.now(), id).run();
      // Coins for a declined request are given back by the app the next time Keisha opens it.
      return json({ ok: true });
    }
    if (p === "/api/mummy/flag" && req.method === "POST") {
      const flags = (await getKV(db, "flags")) || {};
      Object.assign(flags, body.flags || {});
      await setKV(db, "flags", flags);
      return json({ ok: true });
    }
  }
  return json({ error: "Not found" }, 404);
}

function unpack(r) {
  let d = {};
  try { d = JSON.parse(r.data || "{}"); } catch (e) {}
  return Object.assign(d, { ts: r.ts, type: r.type, item: r.item });
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname.startsWith("/api/")) {
      try { return await api(req, env, url); }
      catch (e) { return json({ error: String(e && e.message || e) }, 500); }
    }
    return env.ASSETS.fetch(req);
  }
};
