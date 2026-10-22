// Gestión de usuarios del Campionat de Truc. Solo la puede usar un usuario con rol "root".
// Acciones: list, create, set_password, delete.
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Método no permitido." }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const domain = Deno.env.get("LOGIN_DOMAIN") ?? "jlfmanises.local";

  // ¿Quién llama? Se comprueba su sesión con Supabase Auth, nunca con datos del navegador.
  const caller = createClient(url, anonKey, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
  const { data: { user } } = await caller.auth.getUser();
  if (!user) return json({ error: "Tu sesión ha caducado. Vuelve a entrar." }, 401);

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: me } = await admin.from("profiles").select("role").eq("user_id", user.id).maybeSingle();
  if (me?.role !== "root") return json({ error: "Solo el administrador principal puede gestionar usuarios." }, 403);

  const body = await req.json().catch(() => ({}));
  const validName = (u: unknown) => typeof u === "string" && /^[a-z0-9_.-]{3,30}$/.test(u);
  const validPass = (p: unknown) => typeof p === "string" && p.length >= 8 && p.length <= 72;
  const validRole = (r: unknown) => r === "admin" || r === "root";

  switch (body.action) {
    case "list": {
      const { data, error } = await admin.from("profiles").select("user_id, username, role").order("username");
      if (error) return json({ error: "No se pudo leer la lista de usuarios." }, 500);
      return json({ users: data.map((u) => ({ id: u.user_id, username: u.username, role: u.role })) });
    }
    case "create": {
      if (!validName(body.username)) return json({ error: "El usuario debe tener entre 3 y 30 letras, números, puntos o guiones." }, 400);
      if (!validPass(body.password)) return json({ error: "La contraseña debe tener entre 8 y 72 caracteres." }, 400);
      if (!validRole(body.role)) return json({ error: "Tipo de usuario no válido." }, 400);
      const { data: exists } = await admin.from("profiles").select("user_id").eq("username", body.username).maybeSingle();
      if (exists) return json({ error: "Ese usuario ya existe." }, 409);
      const { data: created, error } = await admin.auth.admin.createUser({
        email: `${body.username}@${domain}`, password: body.password, email_confirm: true,
      });
      if (error || !created.user) return json({ error: "No se pudo crear el usuario." }, 400);
      const { error: pErr } = await admin.from("profiles").insert({ user_id: created.user.id, username: body.username, role: body.role });
      if (pErr) { await admin.auth.admin.deleteUser(created.user.id); return json({ error: "No se pudo crear el usuario." }, 500); }
      return json({ ok: true });
    }
    case "set_password": {
      if (typeof body.user_id !== "string") return json({ error: "Usuario no válido." }, 400);
      if (!validPass(body.password)) return json({ error: "La contraseña debe tener entre 8 y 72 caracteres." }, 400);
      const { error } = await admin.auth.admin.updateUserById(body.user_id, { password: body.password });
      if (error) return json({ error: "No se pudo cambiar la contraseña." }, 400);
      return json({ ok: true });
    }
    case "delete": {
      if (typeof body.user_id !== "string") return json({ error: "Usuario no válido." }, 400);
      if (body.user_id === user.id) return json({ error: "No puedes eliminar tu propio usuario." }, 400);
      const { data: target } = await admin.from("profiles").select("role").eq("user_id", body.user_id).maybeSingle();
      if (target?.role === "root") {
        const { count } = await admin.from("profiles").select("user_id", { count: "exact", head: true }).eq("role", "root");
        if ((count ?? 0) <= 1) return json({ error: "Tiene que quedar al menos un administrador principal." }, 400);
      }
      const { error } = await admin.auth.admin.deleteUser(body.user_id);
      if (error) return json({ error: "No se pudo eliminar el usuario." }, 400);
      return json({ ok: true });
    }
    default:
      return json({ error: "Acción no válida." }, 400);
  }
});
