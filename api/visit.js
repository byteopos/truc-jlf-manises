// Registra una visita con la ubicación aproximada que da Vercel (ciudad, región y país).
// No se guarda la IP ni ningún dato personal.
const SUPABASE_URL = "https://rqutlmglykqbvsvmazmk.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJxdXRsbWdseWtxYnZzdm1hem1rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI2NjMwMjEsImV4cCI6MjEwODIzOTAyMX0.NWoIZA3Jks1EIfpxDFqsvitWQ9bdZ3k4J8Zz8w7TnuY";

const dec = (v) => {
  if (!v) return null;
  try { return decodeURIComponent(String(v)); } catch (e) { return String(v); }
};

module.exports = async (req, res) => {
  if (req.method !== "POST") { res.statusCode = 405; return res.end(); }
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  body = body || {};
  const h = req.headers;
  try {
    await fetch(SUPABASE_URL + "/rest/v1/rpc/track_visit_geo", {
      method: "POST",
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: "Bearer " + SUPABASE_ANON_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({
        p_visitor: typeof body.visitor === "string" ? body.visitor.slice(0, 64) : null,
        p_city: dec(h["x-vercel-ip-city"]),
        p_region: dec(h["x-vercel-ip-country-region"]),
        p_country: dec(h["x-vercel-ip-country"]),
        p_device: typeof body.device === "string" ? body.device.slice(0, 60) : null,
      }),
    });
  } catch (e) { /* una visita perdida no es grave */ }
  res.statusCode = 204;
  res.end();
};
