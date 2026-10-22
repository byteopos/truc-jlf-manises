# Campionat de Truc · JLF Manises

Web del campeonato con datos en Supabase y publicada en Vercel.
Realizada por KazaIA.

## Qué hay en esta carpeta

| Archivo | Para qué sirve |
|---|---|
| `index.html`, `styles.css`, `app.js` | La web. |
| `config.js` | Conexión con tu proyecto de Supabase. **Es lo único que tienes que editar.** |
| `favicon.png`, `og.jpg`, `escudos/` | Icono, imagen para compartir por WhatsApp y escudos de las fallas. |
| `supabase/01_esquema.sql` | Tablas, reglas de seguridad y tiempo real. |
| `supabase/02_datos.sql` | Datos actuales: fallas, escudos, parejas, calendario y resultados de las jornadas 1 a 3. |
| `supabase/03_perfiles.sql` | Da su rol a root y a admin_jlf. |
| `supabase/functions/admin-users/` | Función del servidor con la que root crea, borra y cambia contraseñas de usuarios. |

## Cómo funciona la seguridad

- Cualquiera puede **ver** la web.
- Para **escribir** hay que iniciar sesión. La contraseña la comprueba Supabase en su servidor, y la base de datos rechaza cualquier escritura sin una sesión válida de un usuario con rol `admin` o `root`.
- Solo `root` puede cambiar fechas y casales, y gestionar usuarios. Esto también lo impone la base de datos, no la página.
- Las contraseñas no están en ningún archivo. Por dentro, cada usuario es `usuario@jlfmanises.local`, pero en la web se entra solo con el nombre de usuario.

## Estado

Supabase ya está montado (proyecto `truc-jlf-manises`, Europa) con los datos, la seguridad, la función de usuarios y los usuarios root y admin_jlf. `config.js` ya apunta a él. Solo falta publicar esta carpeta en Vercel.

## Puesta en marcha desde cero (por si hubiera que repetirla)

### 1. Supabase

1. Crea un proyecto nuevo en <https://supabase.com/dashboard> (región: Europa).
2. **SQL Editor** → pega y ejecuta `supabase/01_esquema.sql`.
3. **SQL Editor** → pega y ejecuta `supabase/02_datos.sql`.
4. **Authentication → Users → Add user → Create new user**. Crea estos dos usuarios con **Auto Confirm User** marcado:
   - `root@jlfmanises.local` con la contraseña de root
   - `admin_jlf@jlfmanises.local` con la contraseña de admin_jlf
5. **SQL Editor** → ejecuta `supabase/03_perfiles.sql`. Al final debe listar `root` y `admin_jlf`.
6. **Edge Functions → Deploy a new function → Via Editor**. Llámala `admin-users` y pega el contenido de `supabase/functions/admin-users/index.ts`.
7. **Project Settings → API**: copia la **Project URL** y la **anon public key** en `config.js`.

### 2. GitHub y Vercel

1. Crea un repositorio en GitHub (por ejemplo, `truc-jlf-manises`) y sube el contenido de esta carpeta.
2. En <https://vercel.com/new>, importa ese repositorio. Framework: **Other**. No hace falta configurar nada más. Pulsa **Deploy**.
3. Tendrás la web en `https://truc-jlf-manises.vercel.app`, o en el nombre que elijas.
4. Opcional: **Settings → Domains** para conectar un dominio propio.

Cada vez que cambies algo en el repositorio, Vercel vuelve a publicar solo. Los resultados **no** necesitan volver a publicar: se guardan en Supabase y aparecen al momento.

## Uso diario

- **Organización** → usuario y contraseña → meter resultados → **Publicar cambios**.
- Quien tenga la web abierta ve los cambios sin recargar.
- Las contraseñas de admin_jlf y de otros usuarios las cambia root desde **Organización → Usuarios**.
- Si root olvida su contraseña, no hay correo de recuperación, porque el correo interno no existe. Desde Supabase → **SQL Editor**, ejecuta esto con la contraseña nueva:

  ```sql
  update auth.users set encrypted_password = extensions.crypt('NUEVA-CONTRASEÑA', extensions.gen_salt('bf'))
  where email = 'root@jlfmanises.local';
  ```
