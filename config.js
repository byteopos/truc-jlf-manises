// Conexión con Supabase (proyecto truc-jlf-manises).
// La clave "anon" es pública por diseño: la seguridad la ponen las reglas (RLS) de la base de datos.
window.TRUC_CONFIG = {
  SUPABASE_URL: "https://rqutlmglykqbvsvmazmk.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJxdXRsbWdseWtxYnZzdm1hem1rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI2NjMwMjEsImV4cCI6MjEwODIzOTAyMX0.NWoIZA3Jks1EIfpxDFqsvitWQ9bdZ3k4J8Zz8w7TnuY",
  LOGIN_DOMAIN: "jlfmanises.local",
  // Clave pública de las notificaciones (la privada está solo en Vercel).
  VAPID_PUBLIC_KEY: "BLZDw-2FAKh_eDHvF2XQGDwuaYfMnDLhPYJLsSCo-A2Z8vJxU_1D6qrh4PmpEJXA4MmrkJERqnwzessDwrPUZLY",
};
