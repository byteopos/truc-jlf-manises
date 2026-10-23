(function () {
  "use strict";
  const CFG = window.TRUC_CONFIG || {};
  const sb = window.supabase && CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY ? window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY) : null;
  const LOGIN_DOMAIN = CFG.LOGIN_DOMAIN || "jlfmanises.local";
  let saved = null, S = null, loadError = null;
  let dirty = false;
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const ui = { view: "inicio", table: "parejas", atab: "resultados", openRound: null };

  const SUITS = {
    oros: '<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="17" fill="#f2b632" stroke="#b37a0d" stroke-width="2.5"/><circle cx="20" cy="20" r="9" fill="none" stroke="#b37a0d" stroke-width="2.5"/><circle cx="20" cy="20" r="3" fill="#b37a0d"/></svg>',
    copas: '<svg viewBox="0 0 40 40"><path d="M7 6h26c0 11-5 17-13 17S7 17 7 6z" fill="#d6383a" stroke="#8f1f21" stroke-width="2"/><rect x="18" y="22" width="4" height="9" fill="#f2b632"/><path d="M11 36c0-4 4-6 9-6s9 2 9 6z" fill="#f2b632" stroke="#b37a0d" stroke-width="1.5"/></svg>',
    espadas: '<svg viewBox="0 0 40 40"><path d="M20 2l4 6v20h-8V8z" fill="#2f6fd6" stroke="#1a3f80" stroke-width="2"/><rect x="10" y="27" width="20" height="4" rx="2" fill="#f2b632"/><rect x="18" y="31" width="4" height="7" fill="#7a4b22"/></svg>',
    bastos: '<svg viewBox="0 0 40 40"><path d="M14 38l4-30c1-6 9-6 10 0l-2 30z" fill="#3f9a4a" stroke="#1f5a27" stroke-width="2"/><circle cx="21" cy="14" r="2" fill="#1f5a27"/><circle cx="22" cy="24" r="2" fill="#1f5a27"/></svg>',
  };
  const SUIT_ORDER = ["oros", "copas", "espadas", "bastos"];
  const PROV_NOTE = '<p class="prov">Posibles cruces, a falta de confirmar con la hoja oficial de la JLF. Pueden cambiar.</p>';

  // ---------- helpers ----------
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const DOW = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
  const DOWL = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
  const MON = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  const pd = (iso) => { const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d); };
  const todayISO = () => { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
  const fmtDate = (iso, long) => { const d = pd(iso); return (long ? DOWL : DOW)[d.getDay()] + " " + d.getDate() + " de " + MON[d.getMonth()]; };
  const daysUntil = (iso) => Math.round((pd(iso) - pd(todayISO())) / 864e5);
  const weekStart = (iso) => { const d = pd(iso); const dow = (d.getDay() + 6) % 7; d.setDate(d.getDate() - dow); return d.getTime(); };
  const falla = (id) => S.fallas.find((f) => f.id === id);
  const pairFalla = (pid) => falla(pid.replace(/-\d$/, ""));
  const pairLabel = (pid) => { const f = pairFalla(pid); return f.short + " " + pid.slice(-1); };
  const pairNick = (pid) => (S.pairs[pid] && S.pairs[pid].nick) || "";
  const players = (pid) => ((S.pairs[pid] && S.pairs[pid].players) || []).filter((p) => p && p.trim());
  const playersText = (pid) => { const p = players(pid); return p.length ? p.join(" y ") : "Jugadores por confirmar"; };
  const teams = () => S.fallas.filter((f) => !f.hostOnly);
  const allPairs = () => teams().flatMap((f) => [f.id + "-1", f.id + "-2"]);
  const played = (m) => m.sa != null && m.sb != null;
  const initials = (f) => { const w = f.short.replace(/\b(i|la|el|de)\b/gi, "").split(/\s+/).filter(Boolean); return (w.length > 1 ? w[0][0] + w[1][0] : w[0].slice(0, 2)).toUpperCase(); };
  const logoUrl = (v) => (!v ? null : /^(data:|https?:|\/)/.test(v) ? v : "/_blob/" + v);
  function crest(f, size) {
    if (!f) return "";
    const cls = "crest" + (size ? " " + size : "");
    const url = logoUrl(f.logo);
    const inner = url ? '<img src="' + esc(url) + '" alt="Escudo ' + esc(f.name) + '" onerror="this.remove()">' : esc(initials(f));
    return '<span class="' + cls + '" style="--c:' + esc(f.color) + '" title="' + esc(f.name) + '">' + inner + "</span>";
  }
  const pairCrest = (pid, size) => crest(pairFalla(pid), size);

  // ---------- computations ----------
  function compute() {
    const st = {};
    allPairs().forEach((p) => (st[p] = { id: p, pj: 0, pg: 0, pp: 0, pf: 0, pc: 0, pts: 0, nets: 0, form: [], hist: [] }));
    S.rounds.forEach((r) => r.matches.forEach((m) => {
      if (!played(m) || !st[m.a] || !st[m.b]) return;
      const A = st[m.a], B = st[m.b];
      A.pj++; B.pj++; A.pf += m.sa; A.pc += m.sb; B.pf += m.sb; B.pc += m.sa;
      A.pts += m.sa; B.pts += m.sb;
      const aw = m.sa > m.sb;
      if (aw) { A.pg++; B.pp++; } else { B.pg++; A.pp++; }
      if (m.sa === 3) A.nets++; if (m.sb === 3) B.nets++;
      A.form.push(aw ? "W" : "L"); B.form.push(aw ? "L" : "W");
      A.hist.push({ r: r.n, vs: m.b, f: m.sa, c: m.sb }); B.hist.push({ r: r.n, vs: m.a, f: m.sb, c: m.sa });
    }));
    const table = Object.values(st).sort((x, y) => y.pts - x.pts || y.pg - x.pg || (y.pf - y.pc) - (x.pf - x.pc) || y.nets - x.nets || x.id.localeCompare(y.id));
    let pos = 0, prev = null;
    table.forEach((t, i) => { const key = t.pts + "|" + t.pg + "|" + (t.pf - t.pc); if (key !== prev) pos = i + 1; t.pos = pos; prev = key; });
    const fallaTable = teams().map((f) => {
      const a = st[f.id + "-1"], b = st[f.id + "-2"];
      return { f, pts: a.pts + b.pts, pg: a.pg + b.pg, pj: a.pj + b.pj, best: Math.min(table.indexOf(a), table.indexOf(b)) };
    }).sort((x, y) => y.pts - x.pts || y.pg - x.pg || x.best - y.best);
    const today = todayISO();
    const roundState = (r) => {
      const n = r.matches.length, p = r.matches.filter(played).length;
      if (n && p === n) return "played";
      if (r.date === today) return "today";
      if (p > 0) return "partial";
      if (r.date < today) return "awaiting";
      return "upcoming";
    };
    S.rounds.forEach((r) => (r._st = roundState(r)));
    const next = S.rounds.find((r) => r._st !== "played" && r.date >= today) || S.rounds.find((r) => r._st !== "played") || null;
    const lastPlayed = [...S.rounds].reverse().find((r) => r.matches.some(played)) || null;
    const playedRounds = S.rounds.filter((r) => r._st === "played").length;
    return { st, table, fallaTable, next, lastPlayed, playedRounds, today };
  }

  function weekly(C) {
    const tw = weekStart(C.today);
    // Best pair: current week if it has results, else the most recent week with results.
    const withRes = S.rounds.filter((r) => r.matches.some(played) && r.date <= C.today);
    let bw = withRes.some((r) => weekStart(r.date) === tw) ? tw : (withRes.length ? weekStart(withRes[withRes.length - 1].date) : null);
    let best = null;
    if (bw != null) {
      const wr = S.rounds.filter((r) => weekStart(r.date) === bw);
      const agg = {};
      wr.forEach((r) => r.matches.forEach((m) => {
        if (!played(m)) return;
        [[m.a, m.sa, m.sb], [m.b, m.sb, m.sa]].forEach(([p, f, c]) => {
          agg[p] = agg[p] || { p, f: 0, c: 0, w: 0, n: 0 };
          agg[p].f += f; agg[p].c += c; agg[p].n++; if (f > c) agg[p].w++;
        });
      }));
      const list = Object.values(agg).sort((x, y) => y.f - x.f || y.w - x.w || (y.f - y.c) - (x.f - x.c) || C.table.indexOf(C.st[x.p]) - C.table.indexOf(C.st[y.p]));
      best = list[0] || null;
      if (S.weekly.bestPair && agg[S.weekly.bestPair]) best = agg[S.weekly.bestPair];
      if (best) best.rounds = wr.filter((r) => r.matches.some(played)).map((r) => r.n);
    }
    // Match of the week: upcoming matches this week (or the next week that has confirmed matches).
    const upcoming = S.rounds.filter((r) => r.confirmed && !r.provisional && r.matches.length && r.date >= C.today);
    let mw = upcoming.some((r) => weekStart(r.date) === tw) ? tw : (upcoming.length ? weekStart(upcoming[0].date) : null);
    let match = null;
    if (mw != null) {
      const cands = [];
      S.rounds.filter((r) => weekStart(r.date) === mw && r.confirmed && !r.provisional && r.date >= C.today).forEach((r) => r.matches.forEach((m, i) => cands.push({ r, m, i })));
      const ov = S.weekly.match && cands.find((c) => c.r.n === S.weekly.match.r && c.i === S.weekly.match.i);
      if (ov) match = Object.assign({ manual: true }, ov);
      else {
        const rank = (p) => C.table.indexOf(C.st[p]);
        cands.sort((x, y) => (rank(x.m.a) + rank(x.m.b)) - (rank(y.m.a) + rank(y.m.b)) || Math.abs(rank(x.m.a) - rank(x.m.b)) - Math.abs(rank(y.m.a) - rank(y.m.b)));
        match = cands[0] || null;
      }
    }
    return { best, match };
  }

  // ---------- render pieces ----------
  function matchRow(m, hl) {
    const p = played(m), aw = p && m.sa > m.sb, bw = p && m.sb > m.sa;
    const side = (pid, cls, won) => '<div class="side ' + cls + (won ? " won" : "") + '">' + pairCrest(pid, "sm") + '<div class="nm"><b>' + esc(pairLabel(pid)) + "</b><small>" + esc(players(pid).join(" · ") || pairNick(pid) || "") + "</small></div></div>";
    const mid = p ? '<div class="score num"><span class="' + (aw ? "w" : "") + '">' + m.sa + '</span><span class="' + (bw ? "w" : "") + '">' + m.sb + "</span></div>" : '<div class="vs">vs</div>';
    return '<div class="match' + (hl ? " hl" : "") + '">' + side(m.a, "a", aw) + mid + side(m.b, "b", bw) + "</div>";
  }
  function formDots(t, n) {
    const f = t.form.slice(-(n || 5));
    while (f.length < (n || 5)) f.unshift("N");
    return '<span class="form" aria-label="Últimos resultados">' + f.map((x) => '<i class="' + x + '">' + (x === "W" ? "G" : x === "L" ? "P" : "·") + "</i>").join("") + "</span>";
  }
  function countdownChip(r) {
    if (!r) return "";
    const d = daysUntil(r.date);
    if (d === 0) return '<span class="countdown live">● Hoy se juega</span>';
    if (d === 1) return '<span class="countdown">Mañana</span>';
    if (d > 1) return '<span class="countdown">Faltan ' + d + " días</span>";
    return '<span class="countdown">Pendiente de resultados</span>';
  }

  function podio(C, withLink) {
    const top = C.table.slice(0, 3);
    if (!top.length) return "";
    const medal = ["Oro", "Plata", "Bronce"];
    const col = (t, i) => '<div class="col g' + (i + 1) + '"><span class="medal"><i></i>' + medal[i] + "</span>" + (i === 0 ? '<div class="crown">' + pairCrest(t.id, "xl") + "</div>" : pairCrest(t.id, i === 0 ? "xl" : "lg")) + '<div class="who"><b>' + esc(pairLabel(t.id)) + "</b><small>" + esc(playersText(t.id)) + '</small></div><div class="step"><span class="n">' + (i + 1) + 'º</span><span class="p num">' + t.pts + " pts · " + t.pg + "G " + t.pp + "P</span></div></div>";
    const order = [1, 0, 2].filter((i) => top[i]);
    return '<section class="card podio-card" aria-labelledby="podio-h"><div class="corner">' + SUITS.oros + '</div><div class="card-head"><div><div class="eyebrow" style="color:var(--copas)">Clasificación general</div><h2 id="podio-h">El podio</h2><div class="sub">Tras ' + C.playedRounds + " de " + S.rounds.length + ' jornadas</div></div></div><div class="podio">' + order.map((i) => col(top[i], i)).join("") + '</div>' + (withLink ? '<p class="podio-foot"><button class="link" data-go="clasificacion">Ver la clasificación completa</button></p>' : "") + "</section>";
  }

  // Aviso destacado: automático (próxima jornada y su falla) salvo que la organización escriba uno propio.
  function autoNotice(C) {
    const r = C.next;
    if (!r) return "";
    const f = falla(r.host), d = daysUntil(r.date);
    const donde = "en la " + (f ? f.name : r.host);
    if (d === 0) return "Esta noche, jornada " + r.n + " " + donde + ". ¡Que no falte nadie!";
    if (d === 1) return "Mañana, jornada " + r.n + " " + donde + ". ¡Que no falte nadie!";
    return "Próxima jornada: " + fmtDate(r.date, true) + " " + donde + ". ¡Que no falte nadie!";
  }
  function noticeText(C) {
    if (S.weekly && S.weekly.autoNotice !== false) return autoNotice(C);
    return (S.notice || "").trim();
  }

  function viewInicio(C) {
    const W = weekly(C);
    let h = "";
    const nt = noticeText(C);
    if (nt) h += '<div class="notice" role="status"><span class="shout">¡Truc!</span><span>' + esc(nt) + "</span></div>";
    const r = C.next;
    if (r) {
      const hf = falla(r.host);
      const hlIdx = W.match && W.match.r === r ? W.match.i : -1;
      h += '<section class="card next" aria-labelledby="next-h"><div class="corner">' + SUITS.oros + '</div><div class="card-head"><div><div class="eyebrow" style="color:var(--copas)">Próxima jornada</div><h2 id="next-h">Jornada ' + r.n + " · " + esc(fmtDate(r.date, true)) + "</h2></div>" + countdownChip(r) + "</div>";
      h += '<div class="host">' + crest(hf, "lg") + "<div><small class=\"sub\">Se juega en el casal de</small><br><strong>" + esc(hf.name) + "</strong></div></div>";
      h += r.confirmed && r.matches.length ? (r.provisional ? PROV_NOTE : "") + '<div class="matches">' + r.matches.map((m, i) => matchRow(m, i === hlIdx)).join("") + "</div>" : '<div class="pending" style="padding:14px;border-radius:12px;background:var(--card-2);color:var(--ink-soft);text-align:center">Los cruces de esta jornada están por confirmar.</div>';
      h += "</section>";
    }
    h += podio(C, false);
    // Featured pair of cards
    h += '<div class="grid-2">';
    if (W.match) {
      const { m, r: mr } = W.match, ra = C.st[m.a], rb = C.st[m.b];
      const pl = played(m);
      h += '<section class="card feature" aria-labelledby="pw-h"><span class="ribbon">Partidazo</span><div class="eyebrow" style="color:var(--copas)">Partida de la semana</div><h2 id="pw-h">' + esc(pairLabel(m.a)) + " contra " + esc(pairLabel(m.b)) + '</h2><div class="sub">Jornada ' + mr.n + " · " + esc(fmtDate(mr.date)) + " · casal de " + esc(falla(mr.host).short) + "</div>";
      h += '<div class="duel"><div class="who">' + pairCrest(m.a, "xl") + "<b>" + esc(pairLabel(m.a)) + "</b><small>" + esc(playersText(m.a)) + '</small><span class="chip gold">' + ra.pos + "º · " + ra.pts + " pts</span></div>";
      h += pl ? '<div class="score num" style="font-size:34px"><span class="' + (m.sa > m.sb ? "w" : "") + '">' + m.sa + '</span><span class="' + (m.sb > m.sa ? "w" : "") + '">' + m.sb + "</span></div>" : '<div class="big-vs">VS</div>';
      h += '<div class="who">' + pairCrest(m.b, "xl") + "<b>" + esc(pairLabel(m.b)) + "</b><small>" + esc(playersText(m.b)) + '</small><span class="chip gold">' + rb.pos + "º · " + rb.pts + " pts</span></div></div>";
      h += '<p class="why">' + (W.match.manual ? "Elegida por la organización." : pl ? "Ya se ha jugado. ¡Vaya partida!" : "El cruce entre las parejas mejor clasificadas de la semana. ¿Quién cantará el primer truc?") + "</p></section>";
    }
    if (W.best) {
      const b = W.best, t = C.st[b.p];
      h += '<section class="card feature" aria-labelledby="bp-h"><span class="ribbon" style="background:var(--oros);color:var(--ink)">Pareja top</span><div class="eyebrow" style="color:var(--bastos)">Mejor pareja de la semana</div><h2 id="bp-h">' + esc(pairLabel(b.p)) + "</h2><div class=\"sub\">Jornada" + (b.rounds.length > 1 ? "s " : " ") + b.rounds.join(" y ") + "</div>";
      h += '<div class="mvp" style="margin-top:26px"><div class="crown">' + pairCrest(b.p, "xl") + '</div><div class="info"><b>' + esc(playersText(b.p)) + "</b>" + (pairNick(b.p) ? "<small>«" + esc(pairNick(b.p)) + "»</small>" : "<small>" + esc(pairFalla(b.p).name) + "</small>") + '<div class="statline"><span class="chip green">' + b.w + (b.w === 1 ? " victoria" : " victorias") + " de " + b.n + "</span><span class=\"chip gold\">" + b.f + " camas ganadas</span><span class=\"chip\">" + t.pos + "º en la general</span></div></div></div>";
      h += '<p class="why">' + (b.c === 0 ? "No ha cedido ni una cama esta semana. ¡Ni un truc en contra!" : "Las que más camas sumaron esta semana.") + "</p></section>";
    }
    h += "</div>";
    // Podium + last results
    h += '<div class="grid-2">';
    h += '<section class="card" aria-labelledby="top-h"><div class="corner">' + SUITS.copas + '</div><div class="card-head"><div><h2 id="top-h">Así va la tabla</h2><div class="sub">Tras ' + C.playedRounds + " de " + S.rounds.length + ' jornadas</div></div></div><div class="podium">' + C.table.slice(0, 6).map((t, i) => '<div class="pod' + (i < 3 ? " p" + (i + 1) : "") + '"><span class="pos">' + t.pos + "</span>" + pairCrest(t.id, "sm") + '<div class="nm"><b>' + esc(pairLabel(t.id)) + "</b><small>" + t.pts + " pts · " + t.pg + "G " + t.pp + "P</small></div></div>").join("") + '</div><h3 style="font-size:19px;margin-top:20px">Copa de Fallas</h3><div class="sub" style="margin-bottom:10px">Las dos parejas de cada casal suman juntas</div><div class="podium">' + C.fallaTable.slice(0, 3).map((x, i) => '<div class="pod p' + (i + 1) + '"><span class="pos">' + (i + 1) + "</span>" + crest(x.f, "sm") + '<div class="nm"><b>' + esc(x.f.short) + "</b><small>" + x.pts + " pts</small></div></div>").join("") + '</div><p style="margin:14px 0 0"><button class="link" data-go="clasificacion">Ver la clasificación completa</button></p></section>';
    if (C.lastPlayed) {
      const lr = C.lastPlayed;
      const nets = lr.matches.filter((m) => played(m) && (m.sa === 3 || m.sb === 3)).length;
      h += '<section class="card" aria-labelledby="last-h"><div class="corner">' + SUITS.espadas + '</div><div class="card-head"><div><h2 id="last-h">Últimos resultados</h2><div class="sub">Jornada ' + lr.n + " · " + esc(fmtDate(lr.date)) + " · " + esc(falla(lr.host).short) + '</div></div><span class="chip red">' + nets + (nets === 1 ? " victoria" : " victorias") + " 3-0</span></div><div class=\"matches\" style=\"grid-template-columns:1fr\">" + lr.matches.map((m) => matchRow(m)).join("") + "</div></section>";
    }
    h += "</div>";
    return h;
  }

  function viewClasificacion(C) {
    let h = '<div class="section-title"><div><h2>Clasificación</h2><p>Cada cama ganada suma 1 punto. Cada partida se juega a 3 camas.</p></div><div class="seg" role="group" aria-label="Tipo de clasificación"><button data-table="parejas" aria-pressed="' + (ui.table === "parejas") + '">Parejas</button><button data-table="fallas" aria-pressed="' + (ui.table === "fallas") + '">Copa de Fallas</button></div></div>';
    if (ui.table === "parejas") {
      h += podio(C, false);
      h += '<section class="card"><div class="table-wrap"><table><thead><tr><th>#</th><th class="l">Pareja</th><th title="Enfrentamientos jugados">PJ</th><th title="Ganados">G</th><th title="Perdidos">P</th><th title="Camas a favor">CF</th><th title="Camas en contra">CC</th><th title="Victorias por 3-0">3-0</th><th>Racha</th><th>Pts</th></tr></thead><tbody>';
      C.table.forEach((t) => {
        h += '<tr class="' + (t.pos <= 3 ? "r" + t.pos : "") + '"><td><span class="posb">' + t.pos + '</span></td><td class="l"><div class="pair-cell">' + pairCrest(t.id, "sm") + "<div><b>" + esc(pairLabel(t.id)) + "</b><small>" + esc(playersText(t.id)) + "</small></div></div></td><td>" + t.pj + "</td><td>" + t.pg + "</td><td>" + t.pp + "</td><td>" + t.pf + "</td><td>" + t.pc + "</td><td>" + t.nets + "</td><td>" + formDots(t, 5) + '</td><td class="pts">' + t.pts + "</td></tr>";
      });
      h += '</tbody></table></div><p class="legend">Desempate: puntos, enfrentamientos ganados, diferencia de camas y victorias por 3-0. CF = camas a favor, CC = camas en contra, G = ganada, P = perdida.</p></section>';
    } else {
      h += '<section class="card"><div class="card-head"><div><h2>Copa de Fallas</h2><div class="sub">Suma de los puntos de las dos parejas de cada falla. ¡Por el orgullo del casal!</div></div></div><div class="table-wrap"><table><thead><tr><th>#</th><th class="l">Falla</th><th>Pareja 1</th><th>Pareja 2</th><th>G</th><th>Pts</th></tr></thead><tbody>';
      C.fallaTable.forEach((x, i) => {
        h += '<tr class="' + (i < 3 ? "r" + (i + 1) : "") + '"><td><span class="posb">' + (i + 1) + '</span></td><td class="l"><div class="pair-cell">' + crest(x.f, "sm") + "<b>" + esc(x.f.name) + "</b></div></td><td>" + C.st[x.f.id + "-1"].pts + "</td><td>" + C.st[x.f.id + "-2"].pts + "</td><td>" + x.pg + '</td><td class="pts">' + x.pts + "</td></tr>";
      });
      h += "</tbody></table></div></section>";
    }
    return h;
  }

  function viewCalendario(C) {
    let h = '<div class="section-title"><div><h2>Calendario</h2><p>' + S.rounds.length + " jornadas, martes y jueves. Todas las parejas se enfrentan entre sí una vez.</p></div></div><div class=\"rounds\">";
    S.rounds.forEach((r) => {
      const f = falla(r.host), st = r._st;
      const chip = st === "played" ? '<span class="chip green">Jugada</span>' : st === "today" ? '<span class="chip red">Hoy</span>' : st === "partial" ? '<span class="chip gold">En juego</span>' : st === "awaiting" ? '<span class="chip gold">Faltan resultados</span>' : r.provisional && r.confirmed ? '<span class="chip ghost">Posibles cruces</span>' : !r.confirmed ? '<span class="chip ghost">Cruces por confirmar</span>' : C.next === r ? '<span class="chip blue">Próxima</span>' : '<span class="chip ghost">Pendiente</span>';
      const open = ui.openRound != null ? ui.openRound === r.n : C.next === r || (C.lastPlayed === r && st === "played" && C.next !== r && false);
      h += '<details class="round ' + st + '"' + (open ? " open" : "") + ' data-round="' + r.n + '"><summary><div class="rnum"><small>J</small>' + r.n + '</div><div class="rmeta"><b>' + esc(fmtDate(r.date, true)) + "</b><span>" + crest(f, "sm") + " Casal de " + esc(f.name) + "</span></div>" + chip + '</summary><div class="body">';
      h += r.confirmed && r.matches.length ? (r.provisional ? PROV_NOTE : "") + '<div class="matches">' + r.matches.map((m) => matchRow(m)).join("") + "</div>" : '<div class="pending">Los cruces de la segunda fase se publicarán pronto. ¡Ve calentando la muñeca!</div>';
      h += "</div></details>";
    });
    return h + "</div>";
  }

  function viewParejas(C) {
    let h = '<div class="section-title"><div><h2>Parejas</h2><p>' + allPairs().length + " parejas de " + teams().length + " fallas. Toca una para ver sus partidas.</p></div></div><div class=\"pairs-grid\">";
    allPairs().forEach((pid) => {
      const t = C.st[pid], pl = (S.pairs[pid] && S.pairs[pid].players) || ["", ""];
      h += '<article class="card pair-card"><div class="top">' + pairCrest(pid, "lg") + "<div><b>" + esc(pairLabel(pid)) + '</b><span class="sub">' + (pairNick(pid) ? "«" + esc(pairNick(pid)) + "»" : esc(pairFalla(pid).name)) + '</span></div></div><div class="players">' + [0, 1].map((i) => { const n = (pl[i] || "").trim(); return '<div class="player' + (n ? "" : " tbd") + '">' + SUITS[SUIT_ORDER[i * 2]] + (n ? esc(n) : "Por confirmar") + "</div>"; }).join("") + '</div><div class="mini-stats"><span class="chip gold">' + t.pos + 'º</span><span class="chip">' + t.pts + ' pts</span><span class="chip">' + t.pg + "G · " + t.pp + "P</span>" + formDots(t, 5) + "</div>";
      if (t.hist.length) h += '<details class="hist"><summary>Ver sus ' + t.hist.length + " partidas</summary><ul>" + t.hist.map((x) => "<li><span>J" + x.r + " · vs " + esc(pairLabel(x.vs)) + '</span><b class="num" style="color:' + (x.f > x.c ? "var(--win)" : "var(--loss)") + '">' + x.f + "-" + x.c + "</b></li>").join("") + "</ul></details>";
      h += "</article>";
    });
    return h + "</div>";
  }

  function viewFallas(C) {
    let h = '<div class="section-title"><div><h2>Fallas</h2><p>Las comisiones que se juegan el honor a la baraja.</p></div></div><div class="fallas-grid">';
    S.fallas.forEach((f) => {
      const hosts = S.rounds.filter((r) => r.host === f.id);
      h += '<article class="card falla-card"><div class="top">' + crest(f, "xl") + "<div><b>" + esc(f.name) + '</b><span class="sub">' + (f.hostOnly ? "Casal anfitrión" : (C.fallaTable.findIndex((x) => x.f.id === f.id) + 1) + "º en la Copa de Fallas") + "</span></div></div><ul>";
      if (!f.hostOnly) [1, 2].forEach((k) => { const pid = f.id + "-" + k, t = C.st[pid]; h += "<li><span><b>" + esc(pairLabel(pid)) + "</b><br><small class=\"sub\">" + esc(playersText(pid)) + '</small></span><span class="chip gold">' + t.pts + " pts</span></li>"; });
      h += '<li><span class="sub">Acoge: ' + hosts.map((r) => "J" + r.n + " (" + pd(r.date).getDate() + "/" + (pd(r.date).getMonth() + 1) + ")").join(", ") + "</span></li></ul></article>";
    });
    return h + "</div>";
  }


  // ---------- login (Supabase Auth) ----------
  const ROLE_NAME = { root: "Administrador principal", admin: "Organización" };
  let session = null, users = null, usersError = null;
  const isRoot = () => !!session && session.role === "root";
  async function loadProfile(user) {
    session = null;
    if (!user) return;
    const { data } = await sb.from("profiles").select("username, role").eq("user_id", user.id).maybeSingle();
    if (data) session = { u: data.username, role: data.role, id: user.id };
  }
  function viewLogin() {
    return '<section class="card login" aria-labelledby="login-h"><div class="corner">' + SUITS.espadas + '</div><div class="eyebrow" style="color:var(--copas)">Acceso restringido</div><h2 id="login-h">Organización</h2><div class="sub">Entra con el usuario y la contraseña de la organización del campeonato.</div><form id="login-form" class="login-form" autocomplete="on"><label class="field" for="lg-user">Usuario<input type="text" id="lg-user" name="username" autocomplete="username" autocapitalize="none" required></label><label class="field" for="lg-pass">Contraseña<input type="password" id="lg-pass" name="password" autocomplete="current-password" required></label><p class="login-err" id="lg-err" role="alert" hidden>Usuario o contraseña incorrectos.</p><button class="btn gold" type="submit" id="lg-btn">Entrar</button></form></section>';
  }
  document.addEventListener("submit", async (e) => {
    if (e.target.id !== "login-form") return;
    e.preventDefault();
    const u = document.getElementById("lg-user").value.trim().toLowerCase(), p = document.getElementById("lg-pass").value;
    const err = document.getElementById("lg-err"), btn = document.getElementById("lg-btn");
    if (!sb) { err.textContent = "La web aún no está conectada a la base de datos."; err.hidden = false; return; }
    btn.disabled = true; btn.textContent = "Entrando…";
    const { data, error } = await sb.auth.signInWithPassword({ email: u + "@" + LOGIN_DOMAIN, password: p });
    if (!error) await loadProfile(data.user);
    btn.disabled = false; btn.textContent = "Entrar";
    if (error || !session) {
      if (!error) await sb.auth.signOut();
      sb.rpc("audit_failed_login", { p_username: u, p_info: deviceInfo() }).then(() => {}, () => {});
      err.textContent = error && error.status === 429 ? "Demasiados intentos. Espera unos minutos y vuelve a probar." : "Usuario o contraseña incorrectos.";
      err.hidden = false; document.getElementById("lg-pass").value = ""; return;
    }
    sb.rpc("audit_event", { p_action: "login", p_info: deviceInfo() }).then(() => {}, () => {});
    toast("Sesión iniciada como " + session.u + ".");
    render();
  });
  function deviceInfo() {
    const ua = navigator.userAgent || "";
    const nav = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "Navegador";
    const so = /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iPhone/iPad" : /Windows/.test(ua) ? "Windows" : /Mac OS X/.test(ua) ? "Mac" : /Linux/.test(ua) ? "Linux" : "otro sistema";
    return nav + " en " + so + (/Mobi/.test(ua) ? " (móvil)" : "");
  }

  // ---------- auditoría (solo root) ----------
  let audit = null, auditError = null;
  async function loadAudit() {
    auditError = null;
    const { data, error } = await sb.rpc("audit_entries", { p_limit: 300, p_username: ui.auditUser || null });
    if (error) { auditError = "No se pudo cargar la auditoría."; audit = []; } else audit = data || [];
    render();
  }
  const fmtStamp = (iso) => { try { return new Date(iso).toLocaleString("es-ES", { timeZone: "Europe/Madrid", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }); } catch (e) { return iso; } };
  const sc = (a, b) => (a == null || b == null ? "sin resultado" : a + "-" + b);
  const yn = (v) => (v ? "sí" : "no");
  function auditText(e) {
    const d = e.detail || {}, ch = d.cambios || {}, f = d.fila || {}, has = (k) => Object.prototype.hasOwnProperty.call(ch, k);
    const pl = (id) => { try { return pairLabel(id); } catch (x) { return id; } };
    const fname = (id) => { const x = falla(id); return x ? x.name : id; };
    switch (e.action) {
      case "login": return ["Entrada", "Inició sesión" + (d.dispositivo ? " · " + d.dispositivo : "")];
      case "logout": return ["Salida", "Cerró sesión"];
      case "login_fallido": return ["Fallo", "Intento de entrada fallido con el usuario «" + e.username + "»" + (d.dispositivo ? " · " + d.dispositivo : "")];
      case "usuario_creado": return ["Usuarios", "Creó el usuario «" + (d.usuario || "") + "» (" + (d.rol === "root" ? "administrador principal" : "organización") + ")"];
      case "contrasena_cambiada": return ["Usuarios", "Cambió la contraseña de «" + (d.usuario || "") + "»"];
      case "usuario_eliminado": return ["Usuarios", "Eliminó el usuario «" + (d.usuario || "") + "»"];
    }
    const out = [];
    if (e.entity === "matches") {
      const cruce = "J" + f.round_n + " · " + pl(f.a) + " – " + pl(f.b);
      if (e.action === "insert") return ["Cruces", "Añadió el cruce " + cruce];
      if (e.action === "delete") return ["Cruces", "Quitó el cruce " + cruce];
      if (has("sa") || has("sb")) out.push("Resultado " + cruce + ": " + sc(has("sa") ? ch.sa.antes : f.sa, has("sb") ? ch.sb.antes : f.sb) + " → " + sc(f.sa, f.sb));
      if (has("a") || has("b")) out.push("Cambió el cruce J" + f.round_n + ": " + pl(has("a") ? ch.a.antes : f.a) + " – " + pl(has("b") ? ch.b.antes : f.b) + " → " + pl(f.a) + " – " + pl(f.b));
      return [has("sa") || has("sb") ? "Resultados" : "Cruces", out.join(". ")];
    }
    if (e.entity === "pairs") {
      ["player1", "player2", "nick"].forEach((k, i) => { if (has(k)) out.push((k === "nick" ? "Mote" : "Jugador/a " + (i + 1)) + " de " + pl(f.id) + ": «" + (ch[k].antes || "—") + "» → «" + (ch[k].despues || "—") + "»"); });
      return ["Jugadores", out.join(". ") || "Cambió " + pl(f.id)];
    }
    if (e.entity === "fallas") {
      if (has("logo")) out.push((f.logo ? "Cambió el escudo de " : "Quitó el escudo de ") + (f.name || f.id));
      if (has("name") || has("short")) out.push("Nombre: «" + ((ch.name && ch.name.antes) || (ch.short && ch.short.antes)) + "» → «" + (f.name || f.short) + "»");
      if (has("color")) out.push("Color de " + (f.name || f.id));
      return ["Escudos", out.join(". ") || (e.action === "insert" ? "Añadió la falla " + f.name : e.action === "delete" ? "Quitó la falla " + f.name : "Cambió " + f.name)];
    }
    if (e.entity === "rounds") {
      if (has("date")) out.push("Jornada " + f.n + ": fecha " + fmtDate(ch.date.antes) + " → " + fmtDate(f.date));
      if (has("host")) out.push("Jornada " + f.n + ": casal " + fname(ch.host.antes) + " → " + fname(f.host));
      if (has("confirmed")) out.push("Jornada " + f.n + ": cruces visibles " + yn(f.confirmed));
      if (has("provisional")) out.push("Jornada " + f.n + ": " + (f.provisional ? "marcada como posibles cruces" : "cruces confirmados"));
      return [has("date") || has("host") ? "Fechas" : "Cruces", out.join(". ") || "Cambió la jornada " + f.n];
    }
    if (e.entity === "settings") {
      if (has("notice")) out.push("Aviso propio: «" + (f.notice || "—") + "»");
      if (has("jlf_logo")) out.push("Cambió el logo de la JLF");
      if (has("weekly")) {
        const a = ch.weekly.antes || {}, b = ch.weekly.despues || {};
        if (JSON.stringify(a.match) !== JSON.stringify(b.match)) out.push(b.match ? "Eligió la partida de la semana (J" + b.match.r + ")" : "Partida de la semana en automático");
        if (a.bestPair !== b.bestPair) out.push(b.bestPair ? "Eligió como mejor pareja a " + pl(b.bestPair) : "Mejor pareja en automático");
        if (a.autoNotice !== b.autoNotice) out.push("Aviso automático: " + yn(b.autoNotice !== false));
      }
      if (has("season")) out.push("Temporada: " + f.season);
      return ["Ajustes", out.join(". ") || "Cambió los ajustes"];
    }
    return ["Cambio", e.entity + " " + (e.entity_id || "")];
  }
  function viewAudit() {
    if (audit === null) { loadAudit(); return '<p class="sub">Cargando auditoría…</p>'; }
    let h = "";
    if (auditError) h += '<p class="login-err">' + esc(auditError) + "</p>";
    const names = Array.from(new Set(["root", "admin_jlf"].concat((users || []).map((x) => x.username), audit.map((x) => x.username)))).filter(Boolean);
    h += '<div style="display:flex;gap:10px;align-items:end;flex-wrap:wrap"><label class="field" style="min-width:200px">Usuario<select id="a-audit-user"><option value="">Todos</option>' + names.map((n) => '<option value="' + esc(n) + '"' + (ui.auditUser === n ? " selected" : "") + ">" + esc(n) + "</option>").join("") + '</select></label><button class="btn ghost sm" data-reload-audit>Actualizar</button></div>';
    if (!audit.length) return h + '<p class="sub" style="margin-top:12px">Todavía no hay movimientos registrados.</p>';
    let lastDay = "";
    h += '<div class="audit">';
    audit.forEach((e) => {
      const day = new Date(e.at).toLocaleDateString("es-ES", { timeZone: "Europe/Madrid", weekday: "long", day: "numeric", month: "long" });
      if (day !== lastDay) { h += '<div class="audit-day">' + esc(day) + "</div>"; lastDay = day; }
      const [tag, txt] = auditText(e);
      const time = new Date(e.at).toLocaleTimeString("es-ES", { timeZone: "Europe/Madrid", hour: "2-digit", minute: "2-digit", second: "2-digit" });
      h += '<div class="audit-row' + (e.action === "login_fallido" ? " bad" : "") + '"><span class="audit-time num">' + time + '</span><span class="audit-user">' + esc(e.username) + '</span><span class="chip ' + (tag === "Fallo" ? "red" : tag === "Entrada" || tag === "Salida" ? "blue" : tag === "Usuarios" ? "gold" : "ghost") + '">' + esc(tag) + '</span><span class="audit-txt">' + esc(txt) + "</span></div>";
    });
    return h + '</div><p class="legend">Se guardan las entradas y salidas, los intentos fallidos y cada cambio publicado (quién, cuándo y qué). Lo registra la base de datos, no la página, y solo lo ve el administrador principal. Se muestran los 300 movimientos más recientes.</p>';
  }
  async function adminUsers(action, payload) {
    const { data, error } = await sb.functions.invoke("admin-users", { body: Object.assign({ action }, payload || {}) });
    if (error) {
      let msg = "No se pudo completar la operación.";
      try { const j = await error.context.json(); if (j && j.error) msg = j.error; } catch (x) {}
      throw new Error(msg);
    }
    return data;
  }
  let stats = null, statsError = null;
  async function loadStats() {
    statsError = null;
    const { data, error } = await sb.rpc("visit_stats", { p_days: 30 });
    if (error) { statsError = "No se pudieron cargar las visitas. Vuelve a entrar y prueba de nuevo."; stats = {}; } else stats = data || {};
    render();
  }
  async function loadUsers() {
    usersError = null;
    try { users = (await adminUsers("list")).users; } catch (x) { usersError = x.message; users = []; }
    render();
  }

  // ---------- admin ----------
  const SCORE_OPTS = ["", "3-0", "2-1", "1-2", "0-3"];
  function viewAdmin(C) {
    let h = '<section class="card admin"><h2>' + SUITS.bastos.replace("<svg", '<svg width="28"') + ' Modo organización <button class="btn ghost sm" data-logout style="margin-left:auto">Cerrar sesión</button></h2><div class="who-line">Sesión: <b>' + esc(session.u) + '</b> <span class="chip ' + (isRoot() ? "red" : "ghost") + '">' + ROLE_NAME[session.role] + '</span></div><div class="sub">Zona privada de la organización. Los cambios se ven en la web al pulsar «Publicar cambios».</div><div class="atabs" role="group">';
    const ATABS = [["resultados", "Resultados"], ["cruces", "Cruces"], ["parejas", "Jugadores"], ["logos", "Escudos"], ["semana", "Semana y aviso"], ["visitas", "Visitas"]];
    if (isRoot()) ATABS.push(["fechas", "Fechas y casales"], ["usuarios", "Usuarios"], ["auditoria", "Auditoría"]);
    if (!ATABS.some(([k]) => k === ui.atab)) ui.atab = "resultados";
    ATABS.forEach(([k, l]) => (h += '<button data-atab="' + k + '" aria-pressed="' + (ui.atab === k) + '">' + l + "</button>"));
    h += "</div>";
    const roundSel = (id) => '<label class="field">Jornada<select id="' + id + '">' + S.rounds.map((r) => '<option value="' + r.n + '"' + (ui.adminRound === r.n ? " selected" : "") + ">J" + r.n + " · " + esc(fmtDate(r.date)) + " · " + esc(falla(r.host).short) + (r._st === "played" ? " ✓" : "") + "</option>").join("") + "</select></label>";
    if (ui.adminRound == null) ui.adminRound = (C.next || S.rounds[0]).n;
    const R = S.rounds.find((r) => r.n === ui.adminRound);
    if (ui.atab === "resultados") {
      h += '<div style="max-width:360px">' + roundSel("a-round") + "</div>";
      if (!R.matches.length) h += '<p class="sub">Esta jornada no tiene cruces todavía. Añádelos en la pestaña «Cruces».</p>';
      R.matches.forEach((m, i) => {
        const v = played(m) ? m.sa + "-" + m.sb : "";
        h += '<div class="arow"><span class="nm">' + esc(pairLabel(m.a)) + '</span><select id="sc-' + R.n + "-" + i + '" data-score="' + i + '" aria-label="Resultado ' + esc(pairLabel(m.a)) + " contra " + esc(pairLabel(m.b)) + '">' + SCORE_OPTS.map((o) => '<option value="' + o + '"' + (o === v ? " selected" : "") + ">" + (o || "—") + "</option>").join("") + '</select><span class="nm r">' + esc(pairLabel(m.b)) + "</span></div>";
      });
    } else if (ui.atab === "cruces") {
      h += '<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:end">' + '<div style="flex:1 1 260px;max-width:360px">' + roundSel("a-round") + '</div><label class="field" style="flex-direction:row;display:flex;gap:8px;align-items:center"><input type="checkbox" id="a-confirmed"' + (R.confirmed ? " checked" : "") + "> Cruces visibles al público</label><label class=\"field\" style=\"flex-direction:row;display:flex;gap:8px;align-items:center\"><input type=\"checkbox\" id=\"a-prov\"" + (R.provisional ? " checked" : "") + "> Marcar como posibles cruces (sin confirmar)</label></div>";
      const opts = (sel) => allPairs().map((p) => '<option value="' + p + '"' + (p === sel ? " selected" : "") + ">" + esc(pairLabel(p)) + "</option>").join("");
      R.matches.forEach((m, i) => (h += '<div class="arow"><select id="pa-' + R.n + "-" + i + '" data-pair="a" data-i="' + i + '">' + opts(m.a) + '</select><button class="btn ghost sm" data-delmatch="' + i + '">Quitar</button><select id="pb-' + R.n + "-" + i + '" data-pair="b" data-i="' + i + '">' + opts(m.b) + "</select></div>"));
      h += '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px"><button class="btn ghost sm" data-addmatch>Añadir cruce</button>';
      if (R.n > 10) h += '<button class="btn ghost sm" data-propose>Proponer cruces de la 2ª fase (J11–J19)</button>';
      h += '</div><p class="legend">La propuesta de la 2ª fase enfrenta a las parejas «1» entre sí y a las «2» entre sí (todos contra todos). Revísala con la hoja oficial antes de confirmarla.</p>';
    } else if (ui.atab === "parejas") {
      h += '<div class="form-grid">' + allPairs().map((pid) => { const p = S.pairs[pid]; return '<div class="pair-edit"><b>' + pairCrest(pid, "sm") + esc(pairLabel(pid)) + '</b><input type="text" id="pl-' + pid + '-0" data-player="' + pid + '" data-k="0" placeholder="Jugador/a 1" value="' + esc(p.players[0]) + '"><input type="text" id="pl-' + pid + '-1" data-player="' + pid + '" data-k="1" placeholder="Jugador/a 2" value="' + esc(p.players[1]) + '"><input type="text" id="nk-' + pid + '" data-nick="' + pid + '" placeholder="Mote de la pareja (opcional)" value="' + esc(p.nick) + '"></div>'; }).join("") + "</div>";
    } else if (ui.atab === "logos") {
      h += '<div class="form-grid">';
      h += '<div class="logo-edit"><span class="jlf" style="width:40px;height:40px;font-size:14px;border-width:2px">' + (S.jlfLogo ? '<img src="' + esc(logoUrl(S.jlfLogo)) + '" alt="">' : "JLF") + '</span><span class="nm">Junta Local Fallera</span><label class="btn sm gold">Subir<input type="file" accept="image/*" data-logo="__jlf" hidden></label></div>';
      S.fallas.forEach((f) => (h += '<div class="logo-edit">' + crest(f) + '<span class="nm">' + esc(f.name) + '</span><label class="btn sm gold">Subir<input type="file" accept="image/*" data-logo="' + f.id + '" hidden></label>' + (f.logo ? '<button class="btn ghost sm" data-unlogo="' + f.id + '">Quitar</button>' : "") + "</div>"));
      h += '</div><div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:14px"><label class="btn sm">Subir varios a la vez<input type="file" accept="image/*" multiple data-logos-bulk hidden></label><span class="legend" style="margin:0">Si el archivo se llama como la falla (manises.jpg, carmen.jpg, jlf.jpg…), cada escudo va a su sitio solo.</span></div><p class="legend">Mejor en PNG o JPG cuadrado, con fondo blanco. Se muestran en círculo.</p>';
    } else if (ui.atab === "fechas" && isRoot()) {
      h += '<p class="sub">Cambia el día o el casal de cada jornada.</p>' + S.rounds.map((r) => '<div class="arow" style="grid-template-columns:52px 1fr 1fr"><span class="nm">J' + r.n + '</span><input type="date" id="rd-' + r.n + '" data-rdate="' + r.n + '" value="' + esc(r.date) + '" aria-label="Fecha jornada ' + r.n + '"><select id="rh-' + r.n + '" data-rhost="' + r.n + '" aria-label="Casal jornada ' + r.n + '">' + S.fallas.map((f) => '<option value="' + f.id + '"' + (f.id === r.host ? " selected" : "") + ">" + esc(f.name) + "</option>").join("") + "</select></div>").join("");
    } else if (ui.atab === "auditoria" && isRoot()) {
      h += viewAudit();
    } else if (ui.atab === "usuarios" && isRoot()) {
      if (users === null) { loadUsers(); h += '<p class="sub">Cargando usuarios…</p>'; }
      else {
        if (usersError) h += '<p class="login-err">' + esc(usersError) + "</p>";
        h += '<div class="form-grid">' + users.map((x) => '<div class="pair-edit"><b>' + esc(x.username) + ' <span class="chip ' + (x.role === "root" ? "red" : "ghost") + '">' + ROLE_NAME[x.role] + '</span></b><input type="password" id="pw1-' + esc(x.id) + '" placeholder="Nueva contraseña" autocomplete="new-password" aria-label="Nueva contraseña de ' + esc(x.username) + '"><input type="password" id="pw2-' + esc(x.id) + '" placeholder="Repite la contraseña" autocomplete="new-password" aria-label="Repite la contraseña de ' + esc(x.username) + '"><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn sm" data-setpw="' + esc(x.id) + '">Cambiar contraseña</button>' + (x.id !== session.id ? '<button class="btn ghost sm" data-deluser="' + esc(x.id) + '" data-name="' + esc(x.username) + '">Eliminar</button>' : "") + "</div></div>").join("") + "</div>";
        if (ui.confirmDel) { const x = users.find((y) => y.id === ui.confirmDel); if (x) h += '<div class="notice" style="margin-top:12px"><span>¿Eliminar a <b>' + esc(x.username) + '</b>? No podrá volver a entrar.</span><button class="btn sm" data-deluser-ok="' + esc(x.id) + '">Sí, eliminar</button><button class="btn ghost sm" data-deluser-no>Cancelar</button></div>'; }
        h += '<h3 style="font-size:19px;margin-top:18px">Nuevo usuario</h3><div class="form-grid" style="margin-top:8px"><input type="text" id="nu-name" placeholder="Usuario" autocomplete="off" autocapitalize="none" aria-label="Nuevo usuario"><input type="password" id="nu-pass" placeholder="Contraseña" autocomplete="new-password" aria-label="Contraseña del nuevo usuario"><select id="nu-role" aria-label="Tipo de usuario"><option value="admin">Organización</option><option value="root">Administrador principal</option></select><button class="btn sm" data-adduser>Añadir usuario</button></div><p class="legend">Organización: resultados, cruces, jugadores, escudos y avisos. Administrador principal: además, fechas, casales y usuarios. Los cambios de usuarios se aplican al momento, sin pulsar «Publicar cambios». Mínimo 8 caracteres por contraseña.</p>';
      }
    } else if (ui.atab === "visitas") {
      if (stats === null) { loadStats(); h += '<p class="sub">Cargando visitas…</p>'; }
      else if (statsError) h += '<p class="login-err">' + esc(statsError) + "</p>";
      else {
        const per = (n) => n + (n === 1 ? " persona distinta" : " personas distintas");
        const tile = (n, l, sub) => '<div class="vtile"><b class="num">' + n + "</b><span>" + l + "</span><small>" + sub + "</small></div>";
        h += '<div class="vtiles">' + tile(stats.today || 0, "Visitas hoy", per(stats.today_unique || 0)) + tile(stats.week || 0, "Últimos 7 días", per(stats.week_unique || 0)) + tile(stats.total || 0, "En total", per(stats.total_unique || 0)) + "</div>";
        const d = stats.daily || [], max = Math.max(1, ...d.map((x) => x.visits));
        h += '<h3 style="font-size:19px;margin-top:18px">Visitas por día · últimos 30 días</h3><div class="vchart" role="img" aria-label="Visitas diarias de los últimos 30 días">' + d.map((x, i) => '<div class="vbar" title="' + esc(fmtDate(x.day)) + ": " + x.visits + (x.visits === 1 ? " visita" : " visitas") + '"><em class="num">' + (x.visits || "") + '</em><i style="height:' + Math.round((x.visits / max) * 100) + '%"></i><span>' + (i % 5 === 4 || i === d.length - 1 ? pd(x.day).getDate() + "/" + (pd(x.day).getMonth() + 1) : "") + "</span></div>").join("") + "</div>";
        h += '<p class="legend">Se cuenta una visita cada vez que alguien abre la web (una por sesión del navegador, aunque recargue). «Personas distintas» es aproximado: cuenta navegadores y no guarda ningún dato personal. Contando desde el ' + esc(stats.first_day ? fmtDate(stats.first_day) : fmtDate(todayISO())) + '.</p><button class="btn ghost sm" data-reload-stats>Actualizar</button>';
      }
    } else if (ui.atab === "semana") {
      const W = weekly(C);
      const tw = weekStart(C.today);
      const cands = [];
      S.rounds.filter((r) => r.confirmed && !r.provisional && r.date >= C.today).slice(0, 2).forEach((r) => r.matches.forEach((m, i) => cands.push({ r, m, i })));
      h += '<div class="form-grid"><label class="field">Partida de la semana<select id="a-pw"><option value="">Automática (cruce entre las mejores clasificadas)</option>' + cands.map((c) => '<option value="' + c.r.n + ":" + c.i + '"' + (S.weekly.match && S.weekly.match.r === c.r.n && S.weekly.match.i === c.i ? " selected" : "") + ">J" + c.r.n + " · " + esc(pairLabel(c.m.a)) + " vs " + esc(pairLabel(c.m.b)) + "</option>").join("") + '</select></label><label class="field">Mejor pareja de la semana<select id="a-bp"><option value="">Automática (más camas ganadas)</option>' + allPairs().map((p) => '<option value="' + p + '"' + (S.weekly.bestPair === p ? " selected" : "") + ">" + esc(pairLabel(p)) + "</option>").join("") + '</select></label></div>' + '<label class="field" style="margin-top:14px;display:flex;flex-direction:row;gap:8px;align-items:center"><input type="checkbox" id="a-autonotice"' + (S.weekly.autoNotice !== false ? " checked" : "") + '> Aviso automático con la próxima jornada y su falla</label>' + (S.weekly.autoNotice !== false ? '<p class="legend" style="margin-top:6px">Ahora dice: «' + esc(autoNotice(C)) + '». Cambia solo cada jornada.</p>' : '<label class="field" style="margin-top:8px">Aviso propio (deja vacío para ocultarlo)<textarea id="a-notice">' + esc(S.notice || "") + "</textarea></label>");
      h += '<p class="legend">Ahora mismo se muestra: ' + (W.match ? esc(pairLabel(W.match.m.a) + " vs " + pairLabel(W.match.m.b)) : "—") + " como partida de la semana y " + (W.best ? esc(pairLabel(W.best.p)) : "—") + " como mejor pareja.</p>";
    }
    h += '<div class="savebar"><span class="msg" id="save-msg">' + (dirty ? "Tienes cambios sin publicar." : "Todo publicado.") + '</span>' + (dirty ? '<button class="btn ghost" data-discard>Descartar</button>' : "") + '<button class="btn gold" data-save' + (dirty ? "" : " disabled") + ">Publicar cambios</button></div></section>";
    return h;
  }

  function proposeSecondPhase() {
    const ids = teams().map((f) => f.id);
    const rr = (list) => { const t = list.slice(), out = []; for (let k = 0; k < t.length - 1; k++) { const rnd = []; for (let i = 0; i < t.length / 2; i++) rnd.push([t[i], t[t.length - 1 - i]]); out.push(rnd); t.splice(1, 0, t.pop()); } return out; };
    const g1 = rr(ids.map((x) => x + "-1")), g2 = rr(ids.map((x) => x + "-2"));
    S.rounds.filter((r) => r.n > 10).forEach((r, k) => { if (!g1[k]) return; r.matches = g1[k].concat(g2[k]).map(([a, b]) => ({ a, b, sa: null, sb: null })); });
  }

  // ---------- shell ----------
  const VIEWS = [["inicio", "Inicio"], ["clasificacion", "Clasificación"], ["calendario", "Calendario"], ["parejas", "Parejas"], ["fallas", "Fallas"]];
  function render() {
    if (!S) {
      document.getElementById("app").innerHTML = '<header class="hero"><div class="wrap"><div class="hero-inner"><div class="jlf">JLF</div><div class="hero-text"><div class="eyebrow">Junta Local Fallera de Manises</div><h1>Campionat de <em>Truc</em></h1><p>' + (loadError ? esc(loadError) : "Cargando resultados, cruces y clasificación…") + "</p></div></div></div></header>";
      return;
    }
    const C = compute();
    const app = document.getElementById("app");
    const jlf = S.jlfLogo ? '<img src="' + esc(logoUrl(S.jlfLogo)) + '" alt="Junta Local Fallera de Manises" onerror="this.replaceWith(\'JLF\')">' : "JLF";
    const pct = Math.round((C.playedRounds / S.rounds.length) * 100);
    let h = '<header class="hero"><div class="wrap"><div class="hero-inner"><div class="jlf">' + jlf + '</div><div class="hero-text"><div class="eyebrow">Junta Local Fallera de Manises · Temporada ' + esc(S.season) + '</div><h1>Campionat de <em>Truc</em></h1><p>' + allPairs().length + " parejas, " + teams().length + " fallas y " + S.rounds.length + ' jornadas de casal en casal. Aquí se canta el truc, se apunta cada partida y se sabe quién manda en Manises.</p></div><div class="fan" aria-hidden="true">' + SUIT_ORDER.map((s, i) => '<div class="pc"><b>' + ["1", "3", "7", "12"][i] + "</b>" + SUITS[s] + "</div>").join("") + '</div></div><div class="progress"><span class="num">Jornada ' + C.playedRounds + " de " + S.rounds.length + '</span><div class="bar" role="progressbar" aria-valuenow="' + pct + '" aria-valuemin="0" aria-valuemax="100"><i style="width:' + Math.max(pct, 2) + '%"></i></div><span>' + (C.next ? "Próxima: " + esc(fmtDate(C.next.date)) : "¡Campeonato terminado!") + "</span></div></div></header>";
    h += '<nav class="tabs" aria-label="Secciones"><div class="wrap">' + VIEWS.map(([k, l]) => '<button class="tab" data-go="' + k + '"' + (ui.view === k ? ' aria-current="page"' : "") + ">" + l + "</button>").join("") + ('<button class="tab admin-tab" data-go="admin"' + (ui.view === "admin" ? ' aria-current="page"' : "") + ">Organización" + (dirty ? " •" : "") + "</button>") + "</div></nav>";
    const fn = { inicio: viewInicio, clasificacion: viewClasificacion, calendario: viewCalendario, parejas: viewParejas, fallas: viewFallas, admin: session ? viewAdmin : viewLogin }[ui.view] || viewInicio;
    h += '<main class="wrap">' + fn(C) + "</main>";
    h += '<footer class="wrap">Campionat de Truc · Junta Local Fallera de Manises · Actualizado el ' + esc(fmtDate(S.updated)) + '<span class="sign">Realizada por <strong>KazaIA</strong></span></footer>';
    const y = window.scrollY;
    app.innerHTML = h;
    window.scrollTo(0, y);
  }

  function toast(msg) {
    const t = document.createElement("div"); t.className = "toast"; t.setAttribute("role", "status"); t.textContent = msg;
    document.body.appendChild(t); setTimeout(() => t.remove(), 3200);
  }
  function markDirty() { dirty = true; const el = document.getElementById("save-msg"); if (el) el.textContent = "Tienes cambios sin publicar."; const b = document.querySelector("[data-save]"); if (b) b.disabled = false; }

  function go(view) {
    ui.view = view;
    try { if (view !== "admin") history.replaceState(null, "", "#" + view); } catch (e) {}
    render();
    const nav = document.querySelector(".tabs");
    if (nav && window.scrollY > nav.offsetTop) window.scrollTo({ top: nav.offsetTop, behavior: "instant" in window ? "instant" : "auto" });
  }

  document.addEventListener("click", (e) => {
    const t = e.target.closest("button, [data-go]");
    if (!t) return;
    if (t.dataset.go) return go(t.dataset.go);
    if (t.dataset.table) { ui.table = t.dataset.table; return render(); }
    if (t.dataset.atab) { ui.atab = t.dataset.atab; return render(); }
    const R = S.rounds.find((r) => r.n === ui.adminRound);
    if (t.hasAttribute("data-addmatch")) { const p = allPairs(); R.matches.push({ a: p[0], b: p[1], sa: null, sb: null }); markDirty(); return render(); }
    if (t.dataset.delmatch != null) { R.matches.splice(+t.dataset.delmatch, 1); markDirty(); return render(); }
    if (t.hasAttribute("data-propose")) { proposeSecondPhase(); markDirty(); toast("Propuesta creada para J11–J19. Revísala y confirma cada jornada."); return render(); }
    if (t.dataset.unlogo) { falla(t.dataset.unlogo).logo = null; markDirty(); return render(); }
    if (t.hasAttribute("data-discard")) { S = clone(saved); dirty = false; return render(); }
    if (t.hasAttribute("data-save")) return save(t);
    if (t.hasAttribute("data-reload-stats")) { stats = null; return render(); }
    if (t.dataset.setpw && isRoot()) {
      const id = t.dataset.setpw, p1 = document.getElementById("pw1-" + id).value, p2 = document.getElementById("pw2-" + id).value;
      if (p1.length < 8) return toast("La contraseña necesita al menos 8 caracteres.");
      if (p1 !== p2) return toast("Las dos contraseñas no coinciden.");
      t.disabled = true;
      adminUsers("set_password", { user_id: id, password: p1 }).then(() => { toast("Contraseña cambiada."); render(); }).catch((x) => { toast(x.message); t.disabled = false; });
      return;
    }
    if (t.dataset.deluser && isRoot()) { ui.confirmDel = t.dataset.deluser; return render(); }
    if (t.hasAttribute("data-deluser-no")) { ui.confirmDel = null; return render(); }
    if (t.dataset.deluserOk && isRoot()) {
      t.disabled = true;
      adminUsers("delete", { user_id: t.dataset.deluserOk }).then(() => { ui.confirmDel = null; toast("Usuario eliminado."); loadUsers(); }).catch((x) => { toast(x.message); t.disabled = false; });
      return;
    }
    if (t.hasAttribute("data-adduser") && isRoot()) {
      const u = document.getElementById("nu-name").value.trim().toLowerCase(), p = document.getElementById("nu-pass").value, role = document.getElementById("nu-role").value;
      if (!/^[a-z0-9_.-]{3,30}$/.test(u)) return toast("El usuario debe tener entre 3 y 30 letras, números, puntos o guiones, sin espacios.");
      if (p.length < 8) return toast("La contraseña necesita al menos 8 caracteres.");
      t.disabled = true;
      adminUsers("create", { username: u, password: p, role }).then(() => { toast("Usuario " + u + " creado."); loadUsers(); }).catch((x) => { toast(x.message); t.disabled = false; });
      return;
    }
    if (t.hasAttribute("data-logout")) {
      session = null; users = null; stats = null; audit = null;
      if (sb) sb.rpc("audit_event", { p_action: "logout" }).then(() => sb.auth.signOut(), () => sb.auth.signOut());
      S = clone(saved); dirty = false; return go("inicio");
    }
    if (t.hasAttribute("data-reload-audit")) { audit = null; return render(); }
  });
  document.addEventListener("toggle", (e) => { const d = e.target; if (d.matches && d.matches("details.round") && d.open) ui.openRound = +d.dataset.round; }, true);
  document.addEventListener("change", async (e) => {
    const t = e.target;
    if (t.id === "a-round") { ui.adminRound = +t.value; return render(); }
    const R = S.rounds.find((r) => r.n === ui.adminRound);
    if (t.dataset.score != null) { const m = R.matches[+t.dataset.score]; if (t.value) { const [a, b] = t.value.split("-").map(Number); m.sa = a; m.sb = b; } else { m.sa = m.sb = null; } markDirty(); return; }
    if (t.dataset.pair) { R.matches[+t.dataset.i][t.dataset.pair] = t.value; markDirty(); return; }
    if (t.id === "a-confirmed") { R.confirmed = t.checked; markDirty(); return; }
    if (t.dataset.rdate && isRoot() && t.value) { S.rounds.find((r) => r.n === +t.dataset.rdate).date = t.value; markDirty(); return; }
    if (t.dataset.rhost && isRoot()) { S.rounds.find((r) => r.n === +t.dataset.rhost).host = t.value; markDirty(); return; }
    if (t.id === "a-prov") { R.provisional = t.checked; markDirty(); return; }
    if (t.id === "a-pw") { S.weekly.match = t.value ? { r: +t.value.split(":")[0], i: +t.value.split(":")[1] } : null; markDirty(); return render(); }
    if (t.id === "a-audit-user") { ui.auditUser = t.value || null; audit = null; return render(); }
    if (t.id === "a-autonotice") { S.weekly = Object.assign({}, S.weekly, { autoNotice: t.checked }); markDirty(); return render(); }
    if (t.id === "a-bp") { S.weekly.bestPair = t.value || null; markDirty(); return render(); }
    if (t.hasAttribute("data-logos-bulk") && t.files && t.files.length) {
      let ok = 0; const miss = [];
      for (const file of Array.from(t.files)) {
        const key = file.name.toLowerCase().replace(/\.[^.]+$/, "");
        const f = key === "jlf" ? null : falla(key);
        if (key !== "jlf" && !f) { miss.push(file.name); continue; }
        try {
          const url = await imageToDataUrl(file, key === "jlf" ? 240 : 200);
          if (key === "jlf") S.jlfLogo = url; else f.logo = url;
          ok++;
        } catch (err) { miss.push(file.name); }
      }
      if (ok) markDirty();
      render();
      toast(ok + " escudos listos" + (miss.length ? "; no reconocidos: " + miss.join(", ") : "") + ". Pulsa «Publicar cambios».");
      return;
    }
    if (t.dataset.logo && t.files && t.files[0]) {
      try {
        const url = await imageToDataUrl(t.files[0], t.dataset.logo === "__jlf" ? 260 : 220);
        if (t.dataset.logo === "__jlf") S.jlfLogo = url; else falla(t.dataset.logo).logo = url;
        markDirty(); render(); toast("Escudo listo. Pulsa «Publicar cambios».");
      } catch (err) { toast("No se pudo leer la imagen. Prueba con un PNG o JPG."); }
    }
  });
  document.addEventListener("input", (e) => {
    const t = e.target;
    if (t.dataset.player) { S.pairs[t.dataset.player].players[+t.dataset.k] = t.value; markDirty(); }
    else if (t.dataset.nick) { S.pairs[t.dataset.nick].nick = t.value; markDirty(); }
    else if (t.id === "a-notice") { S.notice = t.value; markDirty(); }
  });

  function imageToDataUrl(file, size) {
    return new Promise((resolve, reject) => {
      const img = new Image(), url = URL.createObjectURL(file);
      img.onload = () => {
        const sc = Math.min(size / img.width, size / img.height, 1), w = Math.round(img.width * sc), h = Math.round(img.height * sc);
        const c = document.createElement("canvas"); c.width = w; c.height = h;
        const x = c.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, w, h); x.drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url); resolve(c.toDataURL("image/jpeg", 0.82));
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("img")); };
      img.src = url;
    });
  }

  // ---------- data (Supabase) ----------
  async function loadAll() {
    const q = (t, o) => sb.from(t).select("*").order(o);
    const [st, fa, pa, ro, ma] = await Promise.all([sb.from("settings").select("*").eq("id", 1).maybeSingle(), q("fallas", "sort"), q("pairs", "id"), q("rounds", "n"), sb.from("matches").select("*").order("round_n").order("idx")]);
    const err = [st, fa, pa, ro, ma].find((r) => r.error);
    if (err) throw err.error;
    const set = st.data || {};
    const next = {
      season: set.season || "", notice: set.notice || "", jlfLogo: set.jlf_logo || null, updated: set.updated || todayISO(),
      weekly: set.weekly || { match: null, bestPair: null },
      fallas: fa.data.map((f) => ({ id: f.id, name: f.name, short: f.short, color: f.color, logo: f.logo || null, hostOnly: !!f.host_only })),
      pairs: {}, rounds: ro.data.map((r) => ({ n: r.n, date: r.date, host: r.host, confirmed: r.confirmed, provisional: r.provisional, matches: [] })),
    };
    pa.data.forEach((p) => (next.pairs[p.id] = { players: [p.player1 || "", p.player2 || ""], nick: p.nick || "" }));
    ma.data.forEach((m) => { const r = next.rounds.find((x) => x.n === m.round_n); if (r) r.matches[m.idx] = { a: m.a, b: m.b, sa: m.sa, sb: m.sb }; });
    next.rounds.forEach((r) => (r.matches = r.matches.filter(Boolean)));
    saved = next; S = clone(next); dirty = false;
  }
  const strip = (o) => JSON.stringify(o, (k, v) => (k.charAt(0) === "_" ? undefined : v));
  async function save(btn) {
    if (!sb || !session) return toast("Inicia sesión para publicar cambios.");
    btn.disabled = true; btn.textContent = "Publicando…";
    const ok = (r) => { if (r.error) throw r.error; };
    try {
      const today = todayISO();
      const setRow = { id: 1, season: S.season, notice: S.notice, jlf_logo: S.jlfLogo, weekly: S.weekly, updated: today };
      ok(await sb.from("settings").upsert(setRow));
      const fRows = S.fallas.map((f, i) => ({ f, i })).filter(({ f, i }) => strip(f) !== strip(saved.fallas[i])).map(({ f, i }) => ({ id: f.id, name: f.name, short: f.short, color: f.color, logo: f.logo, host_only: !!f.hostOnly, sort: i }));
      for (const row of fRows) ok(await sb.from("fallas").update(row).eq("id", row.id));
      const pRows = Object.keys(S.pairs).filter((id) => strip(S.pairs[id]) !== strip(saved.pairs[id])).map((id) => ({ id, falla_id: id.replace(/-\d$/, ""), num: +id.slice(-1), player1: S.pairs[id].players[0] || "", player2: S.pairs[id].players[1] || "", nick: S.pairs[id].nick || "" }));
      for (const row of pRows) ok(await sb.from("pairs").update(row).eq("id", row.id));
      const rRows = [], mRows = [], trims = [];
      S.rounds.forEach((r) => {
        const o = saved.rounds.find((x) => x.n === r.n) || { matches: [] };
        if (r.date !== o.date || r.host !== o.host || r.confirmed !== o.confirmed || !!r.provisional !== !!o.provisional) rRows.push({ n: r.n, date: r.date, host: r.host, confirmed: r.confirmed, provisional: !!r.provisional });
        r.matches.forEach((m, idx) => { if (strip(m) !== strip(o.matches[idx])) mRows.push({ round_n: r.n, idx, a: m.a, b: m.b, sa: m.sa, sb: m.sb }); });
        if (o.matches.length > r.matches.length) trims.push([r.n, r.matches.length]);
      });
      for (const row of rRows) ok(await sb.from("rounds").update(row).eq("n", row.n));
      for (const [n, len] of trims) ok(await sb.from("matches").delete().eq("round_n", n).gte("idx", len));
      if (mRows.length) ok(await sb.from("matches").upsert(mRows));
      S.updated = today; saved = clone(S); dirty = false;
      toast("¡Publicado! Todo el mundo ya lo ve.");
      render();
    } catch (err) {
      const code = err && (err.code || err.status);
      toast(code === "42501" || code === 401 || code === 403 ? "Tu usuario no tiene permiso para este cambio." : "No se pudo publicar: " + ((err && err.message) || "error") + ". Inténtalo de nuevo.");
      btn.disabled = false; btn.textContent = "Publicar cambios";
    }
  }

  // ---------- boot ----------
  const h0 = (location.hash || "").replace("#", "");
  if (VIEWS.some(([k]) => k === h0)) ui.view = h0;
  render();
  (async () => {
    if (!sb) { loadError = !window.supabase ? "No se ha podido cargar la conexión con la base de datos. Recarga la página; si sigue igual, prueba desde otra red o desde el móvil." : "Falta configurar la conexión con Supabase (archivo config.js)."; return render(); }
    try { await loadAll(); } catch (e) { loadError = "No se pudo cargar el campeonato. Revisa tu conexión y recarga la página."; return render(); }
    try {
      if (!sessionStorage.getItem("truc-visit")) {
        let id = localStorage.getItem("truc-vid");
        if (!id) { id = window.crypto && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem("truc-vid", id); }
        sessionStorage.setItem("truc-visit", "1");
        sb.rpc("track_visit", { p_visitor: id }).then(() => {}, () => {});
      }
    } catch (e) {}
    try { const { data } = await sb.auth.getSession(); if (data && data.session) await loadProfile(data.session.user); } catch (e) {}
    render();
    let timer = null;
    sb.channel("truc-cambios").on("postgres_changes", { event: "*", schema: "public" }, () => {
      clearTimeout(timer);
      timer = setTimeout(async () => { if (dirty) return; try { await loadAll(); render(); } catch (e) {} }, 800);
    }).subscribe();
  })();
})();
