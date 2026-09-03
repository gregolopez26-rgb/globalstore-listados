/* Listados GlobalStore — un solo motor para los cuatro listados:
   minorista (Global Store al público), mayorista (escalas), local (lista interna
   de un local en consignación) y publico (catálogo del local para sus clientes).
   Los datos salen de dos CSV publicados desde la planilla (PUBLICO y LOCALES_PUB). */
(function () {
  "use strict";
  const CFG = window.GS_CONFIG || {};
  const BASE = window.GS_BASE || "";
  const qs = new URLSearchParams(location.search);
  const MODE = window.GS_MODE || qs.get("modo") || "minorista";
  const SLUG = (window.GS_LOCAL || qs.get("l") || "").toLowerCase();
  const TEST = qs.get("src") === "test";
  const app = document.getElementById("app");
  const GS_LOGO = BASE + "globalstore.svg";

  /* ───────────────────────── utilidades ───────────────────────── */
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function parseCSV(text) {
    const rows = []; let row = [], field = "", inQ = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQ) {
        if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
        else field += c;
      } else if (c === '"') inQ = true;
      else if (c === ",") { row.push(field); field = ""; }
      else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(field); rows.push(row); row = []; field = "";
      } else field += c;
    }
    if (field !== "" || row.length) { row.push(field); rows.push(row); }
    return rows;
  }

  // Números como los publica Google: "89500", "44.80" o "44,80". Nunca se emiten separadores de miles.
  function toNum(s) {
    if (typeof s === "number") return s;
    let t = String(s == null ? "" : s).trim().replace(/[^0-9,.\-]/g, "");
    if (!t) return null;
    if (t.includes(",") && t.includes(".")) {
      if (t.lastIndexOf(",") > t.lastIndexOf(".")) t = t.replace(/\./g, "").replace(",", ".");
      else t = t.replace(/,/g, "");
    } else if (t.includes(",")) t = t.replace(",", ".");
    const n = parseFloat(t);
    return isNaN(n) ? null : n;
  }
  const round500 = (n) => Math.round(n / 500) * 500;
  const money = (n) => "$ " + Math.round(n).toLocaleString("es-AR");
  const usdt = (n) => n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " USDT";

  function driveImg(url) {
    const u = String(url || "").trim();
    if (!u) return "";
    const m = u.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:export=\w+&)?id=)([\w-]{20,})/);
    return m ? `https://lh3.googleusercontent.com/d/${m[1]}=w800` : u;
  }
  function hue(str) { let h = 0; for (const ch of str) h = (h * 31 + ch.charCodeAt(0)) % 360; return h; }
  function tileStyle(brand) {
    const h = hue(brand || "x");
    return `--t1:hsl(${h},42%,28%);--t2:hsl(${(h + 40) % 360},55%,16%)`;
  }
  const wa = (num, text) => `https://wa.me/${String(num).replace(/\D/g, "")}?text=${encodeURIComponent(text)}`;
  const ig = (user) => `https://instagram.com/${String(user).replace(/^@/, "")}`;
  const ICON_WA = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.6.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.3-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.1.6a2.7 2.7 0 0 0 1.8-1.2 2.2 2.2 0 0 0 .1-1.2c0-.1-.2-.2-.4-.3z"/></svg>';
  const ICON_SEARCH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>';

  /* ───────────────────────── datos ───────────────────────── */
  function objects(rows) {
    if (!rows.length) return { keys: [], list: [] };
    const keys = rows[0].map((k) => String(k).trim().toLowerCase());
    const list = [];
    for (const r of rows.slice(1)) {
      if (!r.some((v) => String(v).trim() !== "")) continue;
      const o = {};
      keys.forEach((k, i) => { if (k) o[k] = r[i] == null ? "" : String(r[i]).trim(); });
      list.push(o);
    }
    return { keys, list };
  }

  async function fetchCSV(url) {
    const sep = url.includes("?") ? "&" : "?";
    const res = await fetch(url + sep + "_=" + Date.now(), { cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status + " al leer " + url);
    return parseCSV(await res.text());
  }

  async function loadData() {
    const pubUrl = TEST ? BASE + "test-publico.csv" : CFG.publicoCsv;
    const locUrl = TEST ? BASE + "test-locales.csv" : CFG.localesCsv;
    if (!pubUrl) return null;
    const [pubRows, locRows] = await Promise.all([fetchCSV(pubUrl), locUrl ? fetchCSV(locUrl) : Promise.resolve([])]);
    const pub = objects(pubRows), loc = objects(locRows);
    const fixed = new Set(["sku", "categoria", "marca", "producto", "ml", "genero", "imagen", "activo", "disponible",
      "minorista", "locales", "p3_usdt", "p10_usdt", "p24_usdt", "p3", "p10", "p24", "tc", "actualizado"]);
    const slugs = pub.keys.filter((k) => k && !fixed.has(k));
    const productos = pub.list.filter((o) => o.sku).map((o) => {
      const p = {
        sku: o.sku, categoria: (o.categoria || "").toUpperCase(), marca: o.marca || "", nombre: o.producto || o.sku,
        ml: toNum(o.ml), genero: o.genero || "", imagen: driveImg(o.imagen), activo: (o.activo || "SÍ").toUpperCase() !== "NO",
        disponible: toNum(o.disponible) || 0, minorista: toNum(o.minorista), locales: toNum(o.locales),
        p3u: toNum(o.p3_usdt), p10u: toNum(o.p10_usdt), p24u: toNum(o.p24_usdt),
        p3: toNum(o.p3), p10: toNum(o.p10), p24: toNum(o.p24), enLocal: {},
      };
      p.mini = p.categoria.includes("30ML");
      for (const s of slugs) p.enLocal[s] = toNum(o[s]) || 0;
      return p;
    });
    const locales = loc.list.filter((o) => o.slug).map((o) => ({
      slug: o.slug.toLowerCase(), nombre: o.nombre || o.slug, recargo: toNum(o.recargo) || 0,
      color1: o.color1 || "#1f1f1f", color2: o.color2 || "#ffffff", logo: o.logo || "",
      whatsapp: o.whatsapp || "", instagram: o.instagram || "", activo: (o.activo || "SÍ").toUpperCase() !== "NO",
    }));
    const first = pub.list.find((o) => o.actualizado);
    return { productos, locales, actualizado: first ? first.actualizado : "", tc: first ? toNum(first.tc) : null };
  }

  /* ───────────────────────── vistas ───────────────────────── */
  function setTheme(local) {
    const b = document.body;
    if (local) {
      b.classList.add("theme-light");
      b.style.setProperty("--accent", local.color1);
      b.style.setProperty("--accent-2", local.color1);
      b.style.setProperty("--hero-bg", local.color1);
      b.style.setProperty("--hero-text", local.color2);
      b.style.setProperty("--hero-glow", "rgba(255,255,255,0.18)");
      b.style.setProperty("--on-accent", local.color2);
    }
  }

  function hero(opts) {
    const logo = opts.logo
      ? `<img class="logo ${opts.round ? "round" : ""}" src="${esc(opts.logo)}" alt="${esc(opts.titulo)}" onerror="this.remove()">`
      : `<div class="wordmark">${esc(opts.titulo)}</div>`;
    return `<header class="hero"><div class="hero-in">
      ${logo}
      <div><h1>${esc(opts.h1)}</h1><p class="sub">${esc(opts.sub || "")}</p>${opts.by || ""}</div>
      <div class="meta">${opts.actualizado ? `Lista actualizada<b>${esc(opts.actualizado)}</b>` : ""}${opts.metaExtra || ""}</div>
    </div></header>`;
  }

  function toolbar(state, marcas) {
    return `<div class="toolbar">
      <label class="search">${ICON_SEARCH}<input id="q" type="search" placeholder="Buscar perfume o marca…" value="${esc(state.q)}" autocomplete="off"></label>
      <select class="select" id="marca"><option value="">Todas las marcas</option>${marcas.map((m) => `<option ${state.marca === m ? "selected" : ""}>${esc(m)}</option>`).join("")}</select>
      <select class="select" id="genero"><option value="">Todos</option><option ${state.genero === "Masculino" ? "selected" : ""}>Masculino</option><option ${state.genero === "Femenino" ? "selected" : ""}>Femenino</option><option ${state.genero === "Unisex" ? "selected" : ""}>Unisex</option></select>
      <select class="select" id="orden"><option value="marca" ${state.orden === "marca" ? "selected" : ""}>Por marca</option><option value="precio" ${state.orden === "precio" ? "selected" : ""}>Precio: menor a mayor</option><option value="precio-desc" ${state.orden === "precio-desc" ? "selected" : ""}>Precio: mayor a menor</option></select>
    </div>
    <div class="chips">
      ${[["", "Todo"], ["grandes", "Perfumes"], ["mini", "Miniaturas 30ml"]].map(([v, t]) => `<button class="chip ${state.cat === v ? "on" : ""}" data-cat="${v}">${t}</button>`).join("")}
    </div>`;
  }

  function pedido(contacto, nombre) {
    const btns = [];
    if (contacto.whatsapp) btns.push(`<a class="btn" target="_blank" rel="noopener" href="${wa(contacto.whatsapp, "Hola! Quiero consultar por un perfume a pedido")}">${ICON_WA} Consultar por WhatsApp</a>`);
    if (contacto.instagram) btns.push(`<a class="btn ghost" target="_blank" rel="noopener" href="${ig(contacto.instagram)}">Instagram</a>`);
    return `<section class="pedido"><div><h3>¿Buscás algo que no está en la lista?</h3><p>${esc(CFG.aPedido || "")}${nombre ? ` Consultá en ${esc(nombre)}.` : ""}</p></div><div>${btns.join(" ")}</div></section>`;
  }

  function thumb(p, badges) {
    const img = p.imagen
      ? `<img loading="lazy" src="${esc(p.imagen)}" alt="${esc(p.nombre)}" onerror="this.parentNode.innerHTML=this.parentNode.dataset.tile">`
      : "";
    const tile = `<div class="tile" style="${tileStyle(p.marca)}"><div class="mono">${esc((p.marca || p.nombre).slice(0, 2))}</div><div class="brand">${esc(p.marca)}</div><div class="name">${esc(p.ml ? p.ml + " ml" : "")}</div></div>`;
    return `<div class="thumb" data-tile="${esc(tile)}">${img || tile}<div class="tag">${badges}</div></div>`;
  }
  function nombreCorto(p) {
    let n = p.nombre;
    if (p.marca && n.toLowerCase().startsWith(p.marca.toLowerCase())) n = n.slice(p.marca.length).trim();
    return n.replace(/\[.*?\]/g, "").trim() || p.nombre;
  }
  const specs = (p) => [p.ml ? p.ml + " ml" : "", p.genero].filter(Boolean).join(" · ");
  const badgeStock = (n) => n <= 1 ? '<span class="warn">Última unidad</span>' : '<span class="ok">Disponible</span>';

  function cardPrecio(p, precio, badges, extra) {
    return `<article class="card">${thumb(p, badges)}<div class="body">
      <div class="brand">${esc(p.marca)}</div><div class="name">${esc(nombreCorto(p))}</div><div class="specs">${esc(specs(p))}</div>
      <div class="price"><b>${money(precio)}</b>${extra || ""}</div></div></article>`;
  }

  function cardMayorista(p) {
    const stock = p.disponible <= 3 ? `<span class="warn">Quedan ${p.disponible}</span>` : `<span class="ok">Stock ${p.disponible}</span>`;
    const tiers = p.mini
      ? [["+3 unid.", p.p3, p.p3u], ["+12 unid.", p.p10, p.p10u], ["+24 unid.", p.p24, p.p24u]]
      : [["+3 unid.", p.p3, p.p3u], ["+10 unid.", p.p10, p.p10u]];
    return `<article class="card">${thumb(p, stock)}<div class="body">
      <div class="brand">${esc(p.marca)}</div><div class="name">${esc(nombreCorto(p))}</div><div class="specs">${esc(specs(p))}</div>
      <div class="tiers ${tiers.length === 2 ? "two" : ""}">${tiers.map(([t, ars, u], i) => `<div class="tier ${i === tiers.length - 1 ? "hl" : ""}"><small>${t}</small><b>${ars != null ? money(ars) : "—"}</b><i>${u != null ? usdt(u) : ""}</i></div>`).join("")}</div>
    </div></article>`;
  }

  function filtrar(list, state) {
    const q = state.q.trim().toLowerCase();
    let out = list.filter((p) =>
      (!state.cat || (state.cat === "mini" ? p.mini : !p.mini)) &&
      (!state.marca || p.marca === state.marca) &&
      (!state.genero || p.genero === state.genero) &&
      (!q || (p.nombre + " " + p.marca + " " + p.sku).toLowerCase().includes(q)));
    const precio = (p) => p._precio != null ? p._precio : (p.p3 || 0);
    if (state.orden === "precio") out.sort((a, b) => precio(a) - precio(b));
    else if (state.orden === "precio-desc") out.sort((a, b) => precio(b) - precio(a));
    else out.sort((a, b) => (a.marca + a.nombre).localeCompare(b.marca + b.nombre, "es"));
    return out;
  }

  function grillaPorCategoria(list, render) {
    const grandes = list.filter((p) => !p.mini), minis = list.filter((p) => p.mini);
    let html = "";
    if (grandes.length) html += `<section class="section"><h2>Perfumes</h2><div class="grid">${grandes.map(render).join("")}</div></section>`;
    if (minis.length) html += `<section class="section"><h2>Miniaturas 30 ml</h2><div class="grid">${minis.map(render).join("")}</div></section>`;
    if (!html) html = `<div class="empty">No hay productos que coincidan con la búsqueda.</div>`;
    return html;
  }

  /* ───────────────────────── páginas ───────────────────────── */
  const state = { q: "", marca: "", genero: "", orden: "marca", cat: "" };

  function paginaMinorista(data) {
    const list = data.productos.filter((p) => p.activo && p.disponible > 0 && p.minorista != null);
    list.forEach((p) => (p._precio = p.minorista));
    const marcas = [...new Set(list.map((p) => p.marca))].sort();
    const render = () => {
      const vis = filtrar(list, state);
      app.innerHTML = hero({ logo: GS_LOGO, titulo: CFG.nombre, h1: "Perfumes importados", sub: "Catálogo con precios al público. Stock real, actualizado desde nuestro sistema.", actualizado: data.actualizado })
        + toolbar(state, marcas) + `<div class="count">${vis.length} productos</div>`
        + grillaPorCategoria(vis, (p) => cardPrecio(p, p.minorista, badgeStock(p.disponible)))
        + pedido(CFG, "") + footerGS();
      wire(render);
    };
    render();
  }

  function paginaMayorista(data) {
    const list = data.productos.filter((p) => p.activo && p.disponible > 0 && p.p3 != null);
    const marcas = [...new Set(list.map((p) => p.marca))].sort();
    const render = () => {
      const vis = filtrar(list, state);
      app.innerHTML = hero({ logo: GS_LOGO, titulo: CFG.nombre, h1: "Lista mayorista", sub: "Perfumes grandes: precio +3 desde 3 unidades, +10 desde 10. Miniaturas 30 ml: +3, +12 y +24. Se pueden combinar modelos.", actualizado: data.actualizado, metaExtra: data.tc ? `<div>Dólar de referencia <b>${money(data.tc)}</b></div>` : "" })
        + toolbar(state, marcas) + `<div class="count">${vis.length} productos · precios en pesos y en USDT</div>`
        + grillaPorCategoria(vis, cardMayorista) + pedido(CFG, "") + footerGS();
      wire(render);
    };
    render();
  }

  function precioPublico(p, local) { return round500((p.locales || 0) * (1 + local.recargo)); }

  function paginaLocal(data, local) {
    setTheme(local);
    const list = data.productos.filter((p) => p.activo && p.locales != null && (p.disponible > 0 || (p.enLocal[local.slug] || 0) > 0));
    list.forEach((p) => (p._precio = p.locales));
    const marcas = [...new Set(list.map((p) => p.marca))].sort();
    const enLocal = data.productos.reduce((a, p) => a + (p.enLocal[local.slug] || 0), 0);
    const render = () => {
      const vis = filtrar(list, state);
      const filas = vis.map((p) => {
        const mio = p.enLocal[local.slug] || 0;
        return `<tr><td class="name">${esc(nombreCorto(p))}<span class="brand">${esc(p.marca)} · ${esc(specs(p))}</span></td>
          <td class="num">${mio > 0 ? `<span class="pill mine">${mio} en tu local</span>` : `<span class="pill zero">0</span>`}</td>
          <td class="num">${p.disponible > 0 ? `<span class="pill ${p.disponible <= 3 ? "warn" : "ok"}">${p.disponible}</span>` : `<span class="pill zero">sin stock</span>`}</td>
          <td class="num"><b>${money(p.locales)}</b></td>
          <td class="num">${money(precioPublico(p, local))}</td></tr>`;
      }).join("");
      app.innerHTML = hero({ logo: local.logo ? BASE + local.logo.replace(/^\/+/, "") : "", round: true, titulo: local.nombre, h1: `Lista para ${local.nombre}`,
          sub: "Precio que te cobramos por unidad y precio sugerido al público con tu recargo. Podés vender cualquier producto de la lista: lo que no tenés en el local te lo acercamos.",
          actualizado: data.actualizado, by: `<div class="badge-by"><img src="${GS_LOGO}" alt="Global Store"> distribuido por Global Store</div>`,
          metaExtra: `<div>Tu recargo <b>${Math.round(local.recargo * 100)}%</b></div>` })
        + `<div class="strip"><div class="stat"><b>${enLocal}</b><span>unidades en tu local (consignación)</span></div><div class="stat"><b>${list.length}</b><span>productos que podés vender</span></div><div class="stat"><b>${money(data.tc || 0)}</b><span>dólar de referencia</span></div></div>`
        + toolbar(state, marcas) + `<div class="count">${vis.length} productos</div>`
        + `<div class="table"><table><thead><tr><th>Producto</th><th class="num">En tu local</th><th class="num">En depósito</th><th class="num">Te cuesta</th><th class="num">Sugerido al público</th></tr></thead><tbody>${filas || `<tr><td colspan="5" class="empty">Nada que coincida.</td></tr>`}</tbody></table></div>`
        + pedido(CFG, "") + footerGS(`Lista interna de ${local.nombre}. No compartir con clientes: para eso está tu catálogo público.`);
      wire(render);
    };
    render();
  }

  function paginaPublico(data, local) {
    setTheme(local);
    const list = data.productos.filter((p) => p.activo && p.locales != null && (p.disponible > 0 || (p.enLocal[local.slug] || 0) > 0));
    list.forEach((p) => (p._precio = precioPublico(p, local)));
    const marcas = [...new Set(list.map((p) => p.marca))].sort();
    const render = () => {
      const vis = filtrar(list, state);
      app.innerHTML = hero({ logo: local.logo ? BASE + local.logo.replace(/^\/+/, "") : "", round: true, titulo: local.nombre, h1: "Perfumes importados", sub: "Fragancias árabes y de diseñador, originales. Consultanos por el que te guste.", actualizado: data.actualizado })
        + toolbar(state, marcas) + `<div class="count">${vis.length} productos</div>`
        + grillaPorCategoria(vis, (p) => {
          const mio = p.enLocal[local.slug] || 0;
          const badge = mio > 0 ? '<span class="mine">En el local</span>' : badgeStock(p.disponible);
          return cardPrecio(p, p._precio, badge);
        })
        + pedido(local, local.nombre) + `<footer>Catálogo de ${esc(local.nombre)} · precios en pesos, actualizados automáticamente.</footer>`;
      wire(render);
    };
    render();
  }

  const footerGS = (extra) => `<footer><img src="${GS_LOGO}" alt="Global Store"> ${esc(CFG.nombre)} · precios en pesos, se actualizan con el dólar. ${esc(extra || "")}</footer>`;

  function wire(render) {
    const q = document.getElementById("q");
    if (q) { q.addEventListener("input", () => { state.q = q.value; const pos = q.selectionStart; render(); const q2 = document.getElementById("q"); q2.focus(); q2.setSelectionRange(pos, pos); }); }
    for (const id of ["marca", "genero", "orden"]) {
      const el = document.getElementById(id);
      if (el) el.addEventListener("change", () => { state[id] = el.value; render(); });
    }
    document.querySelectorAll(".chip").forEach((b) => b.addEventListener("click", () => { state.cat = b.dataset.cat; render(); }));
  }

  /* ───────────────────────── estados especiales ───────────────────────── */
  function setup() {
    app.innerHTML = hero({ logo: GS_LOGO, titulo: CFG.nombre, h1: "Listados todavía no conectados", sub: "Falta publicar las dos hojas de la planilla y pegar los links en config.js." })
      + `<div class="notice"><h2>Cómo conectar la planilla</h2><ol>
        <li>Abrí la hoja de Google <b>Stock Maestro</b> → Archivo → Compartir → <b>Publicar en la web</b>.</li>
        <li>En el desplegable elegí la hoja <code>PUBLICO</code> y el formato <b>Valores separados por comas (.csv)</b>. Publicar y copiar el link.</li>
        <li>Repetí con la hoja <code>LOCALES_PUB</code>.</li>
        <li>Pegá los dos links en <code>config.js</code> (<code>publicoCsv</code> y <code>localesCsv</code>).</li></ol>
        <p>Mientras tanto podés ver el diseño con datos de prueba: <a href="?src=test${SLUG ? "&l=" + esc(SLUG) : ""}">abrir con datos de prueba</a>.</p></div>`;
  }
  function error(msg) {
    app.innerHTML = hero({ logo: GS_LOGO, titulo: CFG.nombre, h1: "No pudimos cargar la lista" })
      + `<div class="notice"><h2>Volvé a intentar en un minuto</h2><p>${esc(msg)}</p><p>Si sigue pasando, la hoja puede haber dejado de estar publicada.</p></div>`;
  }

  async function main() {
    app.innerHTML = `<div class="section skeleton"><div class="grid">${"<div class=\"card\"></div>".repeat(8)}</div></div>`;
    let data;
    try { data = await loadData(); } catch (e) { console.error(e); return error(e.message); }
    if (!data) return setup();
    if (MODE === "local" || MODE === "publico") {
      const local = data.locales.find((l) => l.slug === SLUG);
      if (!local || !local.activo) {
        app.innerHTML = hero({ logo: GS_LOGO, titulo: CFG.nombre, h1: "Local no encontrado" })
          + `<div class="notice"><p>No hay ningún local activo con el código <code>${esc(SLUG || "(vacío)")}</code>. Revisá la columna <b>Slug</b> de la hoja LOCALES.</p></div>`;
        return;
      }
      document.title = `${local.nombre} · ${MODE === "local" ? "Lista para el local" : "Perfumes"}`;
      return MODE === "local" ? paginaLocal(data, local) : paginaPublico(data, local);
    }
    document.title = `${CFG.nombre} · ${MODE === "mayorista" ? "Lista mayorista" : "Perfumes importados"}`;
    return MODE === "mayorista" ? paginaMayorista(data) : paginaMinorista(data);
  }

  if (TEST) {
    console.assert(toNum("44,80") === 44.8 && toNum("44.80") === 44.8 && toNum("89500") === 89500 && toNum("$ 1.234,50") === 1234.5 && toNum("") === null, "toNum");
    console.assert(round500(76800) === 77000 && round500(89600) === 89500, "round500");
  }
  main();
})();
