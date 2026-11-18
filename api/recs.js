// Vercel serverless function: /api/recs
// GET    -> owner only, returns all recommendations
// POST   -> anyone, adds a recommendation
// DELETE -> owner only, /api/recs?id=...
const crypto = require("node:crypto");

const REDIS_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

async function cmd(args) {
  const r = await fetch(REDIS_URL, {
    method: "POST",
    headers: { Authorization: "Bearer " + REDIS_TOKEN },
    body: JSON.stringify(args)
  });
  const j = await r.json();
  if (j.error) throw new Error(j.error);
  return j.result;
}

async function bump(key, seconds) {
  const r = await fetch(REDIS_URL + "/pipeline", {
    method: "POST",
    headers: { Authorization: "Bearer " + REDIS_TOKEN },
    body: JSON.stringify([["INCR", key], ["EXPIRE", key, seconds]])
  });
  const j = await r.json();
  return Number(j[0].result);
}

const ipOf = (req) => String(req.headers["x-forwarded-for"] || "unknown").split(",")[0].trim();

function passwordOk(req) {
  const given = Buffer.from(String(req.headers["x-admin-password"] || ""));
  const real = Buffer.from(ADMIN_PASSWORD);
  return given.length === real.length && crypto.timingSafeEqual(given, real);
}

// returns true if the request may continue
async function requireAdmin(req, res) {
  const key = "authfail:" + ipOf(req);
  const fails = Number((await cmd(["GET", key])) || 0);
  if (fails >= 10) { res.status(429).json({ error: "too many tries" }); return false; }
  if (!passwordOk(req)) {
    await bump(key, 600);
    res.status(401).json({ error: "wrong password" });
    return false;
  }
  return true;
}

const okImage = (u) => u === "" || /^https:\/\/(s4\.anilist\.co|image\.tmdb\.org)\//.test(u);
const str = (v, n) => String(v == null ? "" : v).trim().slice(0, n);

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (!REDIS_URL || !REDIS_TOKEN || !ADMIN_PASSWORD) {
    return res.status(503).json({ error: "server not configured" });
  }
  try {
    if (req.method === "GET") {
      if (!(await requireAdmin(req, res))) return;
      const rows = await cmd(["HVALS", "recs"]);
      const recs = rows.map((x) => { try { return JSON.parse(x); } catch (e) { return null; } }).filter(Boolean);
      return res.status(200).json(recs);
    }

    if (req.method === "POST") {
      if ((await bump("post:" + ipOf(req), 600)) > 10) return res.status(429).json({ error: "slow down" });
      const b = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
      const rec = {
        id: crypto.randomUUID(),
        key: str(b.key, 60), title: str(b.title, 150), year: str(b.year, 4),
        type: str(b.type, 20), image: str(b.image, 300),
        name: str(b.name, 40), note: str(b.note, 300), at: Date.now()
      };
      if (!/^(anilist:\d+|tmdb:(movie|tv):\d+)$/.test(rec.key) || !rec.title || !okImage(rec.image)) {
        return res.status(400).json({ error: "bad recommendation" });
      }
      await cmd(["HSET", "recs", rec.id, JSON.stringify(rec)]);
      return res.status(200).json({ ok: true });
    }

    if (req.method === "DELETE") {
      if (!(await requireAdmin(req, res))) return;
      const id = str(req.query && req.query.id, 80);
      const removed = id ? await cmd(["HDEL", "recs", id]) : 0;
      if (!removed) return res.status(404).json({ error: "not found" });
      return res.status(200).json({ ok: true });
    }

    res.setHeader("Allow", "GET, POST, DELETE");
    return res.status(405).json({ error: "method not allowed" });
  } catch (e) {
    return res.status(500).json({ error: "server error" });
  }
};
