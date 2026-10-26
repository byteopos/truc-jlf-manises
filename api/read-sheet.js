// Lee los resultados escritos a mano en la hoja de una jornada a partir de una foto.
// Solo para usuarios de la organización (admin o root) con sesión válida en Supabase.
// Usa Vercel AI Gateway (autenticación OIDC del propio proyecto, sin claves en el código).
const SUPABASE_URL = "https://rqutlmglykqbvsvmazmk.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJxdXRsbWdseWtxYnZzdm1hem1rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI2NjMwMjEsImV4cCI6MjEwODIzOTAyMX0.NWoIZA3Jks1EIfpxDFqsvitWQ9bdZ3k4J8Zz8w7TnuY";
const MODEL = process.env.SHEET_MODEL || "anthropic/claude-sonnet-5";

const send = (res, status, body) => {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
};

async function staffRole(token) {
  if (!token) return null;
  const u = await fetch(SUPABASE_URL + "/auth/v1/user", { headers: { apikey: SUPABASE_ANON_KEY, Authorization: "Bearer " + token } });
  if (!u.ok) return null;
  const user = await u.json();
  const p = await fetch(SUPABASE_URL + "/rest/v1/profiles?select=role&user_id=eq." + encodeURIComponent(user.id), {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: "Bearer " + token },
  });
  if (!p.ok) return null;
  const rows = await p.json();
  const role = rows && rows[0] && rows[0].role;
  return role === "admin" || role === "root" ? role : null;
}

function buildPrompt(b) {
  const lista = b.matches.map((m) => m.n + ". " + m.a + " contra " + m.b).join("\n");
  return [
    "Eres el ayudante de la organización de un campeonato de truc (juego de cartas valenciano).",
    "En la foto hay una hoja impresa con una o varias jornadas. Cada jornada tiene una cabecera con la fecha y la falla, y una tabla:",
    "columna 1 = pareja local, columna 2 = pareja rival, y dos casillas donde se escribe A MANO el resultado (camas ganadas por cada pareja).",
    "Cada partida se juega a 3 camas, así que los dos números de una fila siempre suman 3 (3-0, 2-1, 1-2 o 0-3).",
    "",
    "Busca la tabla de la JORNADA " + b.round + (b.date ? " (" + b.date + (b.host ? ", " + b.host : "") + ")" : "") + ".",
    "Sus cruces, en este orden, son:",
    lista,
    "",
    "Lee los dos números escritos a mano de cada fila. Ojo: el '1' manuscrito puede parecer una 'L' o una 'I'; si hay un número tachado o repasado, quédate con el que se ve como definitivo.",
    "Si una fila está vacía o no se puede leer con seguridad, pon null en sus números. Si dudas, marca seguro=false.",
    "En la hoja 'Llun i Soroll' es 'Llum i Soroll' y 'Pensat I Fet' es 'Pensat i Fet'.",
    "",
    "Responde SOLO con JSON, sin texto antes ni después, con esta forma:",
    '{"jornada_en_foto": <número o null>, "resultados": [{"n": 1, "sa": 2, "sb": 1, "seguro": true}, ...], "avisos": ["..."]}',
    "Incluye una entrada por cada cruce de la lista, con el mismo n. En avisos explica en español y en pocas palabras cualquier duda (fila ilegible, la foto es de otra jornada, cruces distintos a la lista...).",
  ].join("\n");
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return send(res, 405, { error: "Método no permitido." });
  const auth = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  try {
    if (!(await staffRole(auth))) return send(res, 401, { error: "Inicia sesión como organización para usar esta función." });
  } catch (e) {
    return send(res, 502, { error: "No se pudo comprobar la sesión. Inténtalo de nuevo." });
  }

  let b = req.body;
  if (typeof b === "string") { try { b = JSON.parse(b); } catch (e) { b = null; } }
  if (!b || typeof b.image !== "string" || !/^data:image\/(jpeg|png|webp);base64,/.test(b.image) || !Array.isArray(b.matches) || !b.matches.length || b.matches.length > 20) {
    return send(res, 400, { error: "Falta la foto o los cruces de la jornada." });
  }
  if (b.image.length > 4_000_000) return send(res, 413, { error: "La foto es demasiado grande." });

  const key = process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN || req.headers["x-vercel-oidc-token"];
  if (!key) return send(res, 500, { error: "La lectura de fotos no está activada en Vercel (AI Gateway)." });

  let r;
  try {
    r = await fetch("https://ai-gateway.vercel.sh/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1200,
        temperature: 0,
        messages: [{ role: "user", content: [{ type: "text", text: buildPrompt(b) }, { type: "image_url", image_url: { url: b.image } }] }],
      }),
    });
  } catch (e) {
    return send(res, 502, { error: "No se pudo conectar con el servicio de lectura. Inténtalo de nuevo." });
  }
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    console.error("AI Gateway", r.status, t.slice(0, 500));
    return send(res, 502, { error: r.status === 402 || r.status === 403 ? "El servicio de lectura de fotos no está activado o se ha quedado sin crédito en Vercel." : "El servicio de lectura ha fallado (" + r.status + "). Inténtalo de nuevo." });
  }
  const data = await r.json();
  const text = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || "";
  const m = String(text).match(/\{[\s\S]*\}/);
  let out;
  try { out = JSON.parse(m ? m[0] : text); } catch (e) { return send(res, 502, { error: "No he entendido la respuesta al leer la foto. Prueba con otra foto más clara." }); }

  const valid = (a, c) => Number.isInteger(a) && Number.isInteger(c) && a >= 0 && c >= 0 && a + c === 3;
  const resultados = (Array.isArray(out.resultados) ? out.resultados : []).map((x) => {
    const sa = x && x.sa != null ? Number(x.sa) : null, sb = x && x.sb != null ? Number(x.sb) : null;
    const ok = valid(sa, sb);
    return { n: Number(x && x.n), sa: ok ? sa : null, sb: ok ? sb : null, seguro: ok && x.seguro !== false };
  }).filter((x) => Number.isInteger(x.n));
  return send(res, 200, {
    jornada_en_foto: Number.isInteger(out.jornada_en_foto) ? out.jornada_en_foto : null,
    resultados,
    avisos: Array.isArray(out.avisos) ? out.avisos.slice(0, 6).map((s) => String(s).slice(0, 200)) : [],
  });
};
