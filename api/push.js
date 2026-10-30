// Envía las notificaciones push del campeonato.
// - Supabase la llama sola (con el secreto compartido) para el aviso del día antes,
//   el de la misma mañana y cuando una jornada queda con todos los resultados.
// - La organización (admin o root con sesión) puede mandar una prueba a su móvil
//   o reenviar un aviso de una jornada.
const webpush = require("web-push");
const SUPABASE_URL = "https://rqutlmglykqbvsvmazmk.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJxdXRsbWdseWtxYnZzdm1hem1rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI2NjMwMjEsImV4cCI6MjEwODIzOTAyMX0.NWoIZA3Jks1EIfpxDFqsvitWQ9bdZ3k4J8Zz8w7TnuY";
const KINDS = ["eve", "today", "results"];

const send = (res, status, body) => {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
};

async function rpc(name, args, token) {
  const r = await fetch(SUPABASE_URL + "/rest/v1/rpc/" + name, {
    method: "POST",
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: "Bearer " + (token || SUPABASE_ANON_KEY), "Content-Type": "application/json" },
    body: JSON.stringify(args || {}),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(name + ": " + r.status + " " + text.slice(0, 200));
  return text ? JSON.parse(text) : null;
}

async function staff(token) {
  if (!token) return null;
  const u = await fetch(SUPABASE_URL + "/auth/v1/user", { headers: { apikey: SUPABASE_ANON_KEY, Authorization: "Bearer " + token } });
  if (!u.ok) return null;
  const user = await u.json();
  const p = await fetch(SUPABASE_URL + "/rest/v1/profiles?select=role,username&user_id=eq." + encodeURIComponent(user.id), {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: "Bearer " + token },
  });
  if (!p.ok) return null;
  const row = (await p.json())[0];
  return row && (row.role === "admin" || row.role === "root") ? row : null;
}

async function deliver(subs, msg) {
  const payload = JSON.stringify({ title: msg.title, body: msg.body, url: msg.url || "/", tag: msg.tag || "truc" });
  const gone = [], ok = [];
  let sent = 0, failed = 0;
  const queue = subs.slice();
  const worker = async () => {
    while (queue.length) {
      const s = queue.shift();
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 6 * 3600, urgency: "high" });
        sent++; ok.push(s.endpoint);
      } catch (e) {
        failed++;
        if (e && (e.statusCode === 404 || e.statusCode === 410)) gone.push(s.endpoint);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(20, subs.length) }, worker));
  return { sent, failed, gone, ok };
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return send(res, 405, { error: "Método no permitido." });
  const secret = process.env.PUSH_SECRET, pub = process.env.VAPID_PUBLIC_KEY, priv = process.env.VAPID_PRIVATE_KEY;
  if (!secret || !pub || !priv) return send(res, 500, { error: "Faltan las claves de notificaciones en Vercel." });
  webpush.setVapidDetails("mailto:byteopos@gmail.com", pub, priv);

  let b = req.body;
  if (typeof b === "string") { try { b = JSON.parse(b); } catch (e) { b = null; } }
  b = b || {};
  const kind = String(b.kind || ""), round = parseInt(b.round, 10);

  try {
    // 1) Llamada automática desde Supabase: el aviso ya está reservado en push_log.
    if (req.headers["x-push-secret"]) {
      if (req.headers["x-push-secret"] !== secret) return send(res, 401, { error: "No autorizado." });
      if (!KINDS.includes(kind) || !round) return send(res, 400, { error: "Aviso no válido." });
      const msg = await rpc("push_message", { p_kind: kind, p_round: round });
      if (!msg) return send(res, 404, { error: "Jornada no encontrada." });
      const subs = await rpc("push_targets", { p_secret: secret });
      const r = await deliver(subs, { ...msg, tag: kind + "-" + round });
      await rpc("push_done", { p_secret: secret, p_kind: kind, p_round: round, p_sent: r.sent, p_failed: r.failed, p_gone: r.gone, p_ok: r.ok });
      return send(res, 200, { sent: r.sent, failed: r.failed });
    }

    // 2) Organización con sesión.
    const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    const who = await staff(token);
    if (!who) return send(res, 401, { error: "Inicia sesión como organización." });

    if (kind === "test") {
      const ep = String(b.endpoint || "");
      const subs = (await rpc("push_targets", { p_secret: secret })).filter((s) => s.endpoint === ep);
      if (!subs.length) return send(res, 404, { error: "Este dispositivo no tiene los avisos activados." });
      const r = await deliver(subs, { title: "🃏 Prueba de avisos", body: "¡Funciona! Así llegarán los avisos del Campionat de Truc.", url: "/", tag: "test" });
      await rpc("push_done", { p_secret: secret, p_kind: "test", p_round: 0, p_sent: r.sent, p_failed: r.failed, p_gone: r.gone, p_ok: r.ok });
      return send(res, r.sent ? 200 : 502, r.sent ? { sent: 1 } : { error: "El aviso de prueba no se pudo entregar." });
    }

    if (!KINDS.includes(kind) || !round) return send(res, 400, { error: "Aviso no válido." });
    const msg = await rpc("push_message", { p_kind: kind, p_round: round });
    if (!msg) return send(res, 404, { error: "Jornada no encontrada." });
    await rpc("push_claim", { p_secret: secret, p_kind: kind, p_round: round, p_by: who.username, p_force: true });
    const subs = await rpc("push_targets", { p_secret: secret });
    const r = await deliver(subs, { ...msg, tag: kind + "-" + round });
    await rpc("push_done", { p_secret: secret, p_kind: kind, p_round: round, p_sent: r.sent, p_failed: r.failed, p_gone: r.gone, p_ok: r.ok });
    return send(res, 200, { sent: r.sent, failed: r.failed });
  } catch (e) {
    return send(res, 502, { error: "No se pudieron enviar los avisos.", detail: String(e.message || e).slice(0, 200) });
  }
};
