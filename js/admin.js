/* =====================================================================
   IMPULSA CRÉDITO — Panel del equipo (diseño empresarial)
   =====================================================================
   Menú lateral:
     General       Dashboard · Por revisar · Clientes · Operaciones
     Análisis      Reportes
     Administración (solo el administrador)  Equipo y accesos · Auditoría

   Roles:
   · ADMINISTRADOR (el dueño): ve todo, aprueba, marca depósitos,
     descarga Excel y administra al equipo.
   · SOPORTE (trabajadores de confianza): como Consulta, y además ve
     las fotos del DNI, la selfie y las tarjetas.
   · CONSULTA (trabajadores): ve clientes y operaciones para atender,
     sin fotos.
   Soporte y Consulta no pueden cambiar nada y reciben las cuentas, los
   celulares y los correos ocultos.

   SEGURIDAD: la protección vive en Supabase (supabase-admin.sql,
   supabase-equipo-consulta.sql y supabase-equipo-soporte.sql). Aquí
   solo se esconden los botones que un usuario no podría usar: aunque
   los forzara, el servidor lo rechaza.
   ===================================================================== */
(function () {
  "use strict";

  var CFG = window.SITE_CONFIG || {};
  var B = CFG.backend || {};
  var base = (B.supabaseUrl || "").replace(/\/+$/, "");
  var KEY = B.supabaseAnonKey || "";
  var BUCKET = B.bucket || "documentos";
  var SES = "ic_admin_sesion_v1";
  var POR_PAGINA = 25;

  var sesion = null, rol = null;
  var perfil = { nombre: "", puesto: "", avatar: null, disponible: false };
  var datos = { pendientes: [], clientes: [], ops: [], docs: [], tarjetas: [], historial: [], porId: {} };
  var hay = { notas: false, historial: false };

  /* estado de cada pantalla */
  var vista = "inicio";
  var dash = { rango: { clave: "mes" }, gran: "auto", metrica: "monto" };
  var pend = { tipo: "todo" };
  var cli = { q: "", filtro: "todos", orden: "registro", dir: -1, pag: 1 };
  var ops = { q: "", filtro: "todas", orden: "fecha", dir: -1, pag: 1, rango: { clave: "todo" } };
  var rep = { rango: { clave: "mes" }, agrupar: "auto" };
  var fic = { id: null };
  var eq = { lista: null, error: null };
  var aud = { filtro: "todo", pag: 1, rango: { clave: "todo" } };

  var cacheFotos = {}, ocupado = false, graficos = [];
  var recienCreadas = {};   // cuentas creadas en esta sesión (por si hay que reintentar)
  var eqReloj = null;       // refresca el estado de conexión mientras se ve "Equipo"

  function $(id) { return document.getElementById(id); }
  function esc(s) { return window.IC ? IC.esc(s) : String(s == null ? "" : s); }
  /* esConsulta: cualquier trabajador de solo lectura (Consulta o Soporte) */
  function esConsulta() { return rol === "consulta" || rol === "soporte"; }
  function esAdmin() { return rol === "admin"; }
  function verFotos() { return rol === "admin" || rol === "soporte"; }
  var NOMBRE_ROL = { admin: "Administrador", soporte: "Soporte", consulta: "Consulta", cliente: "Cliente", sistema: "Sistema" };
  function dinero(n) { return IC.money(n); }
  function plural(n, uno, varios) { return n + " " + (n === 1 ? uno : varios); }

  /* ======================= fechas ======================= */
  function fecha(d) { return d ? new Date(d).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" }) : "—"; }
  function fechaHora(d) { return d ? IC.fmtDateTime(new Date(d)) : "—"; }
  function hace(d) {
    if (!d) return "";
    var s = (Date.now() - new Date(d).getTime()) / 1000;
    if (s < 60) return "hace un momento";
    if (s < 3600) return "hace " + Math.floor(s / 60) + " min";
    if (s < 86400) return "hace " + Math.floor(s / 3600) + " h";
    var dias = Math.floor(s / 86400);
    return dias === 1 ? "hace 1 día" : "hace " + dias + " días";
  }
  function inicioDia(d) { var x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
  function sumarDias(d, n) { var x = new Date(d); x.setDate(x.getDate() + n); return x; }
  function lunes(d) { var x = inicioDia(d); return sumarDias(x, -((x.getDay() + 6) % 7)); }
  function inicioMes(d) { var x = new Date(d); return new Date(x.getFullYear(), x.getMonth(), 1); }
  function isoLocal(d) { if (!d) return ""; var x = new Date(d); return x.getFullYear() + "-" + ("0" + (x.getMonth() + 1)).slice(-2) + "-" + ("0" + x.getDate()).slice(-2); }
  function mismoDia(a, b) { return a && b && inicioDia(a).getTime() === inicioDia(b).getTime(); }
  function mesCorto(d) { return d.toLocaleDateString("es-PE", { month: "short" }).replace(".", ""); }

  var PRESETS = [["hoy", "Hoy"], ["ayer", "Ayer"], ["7d", "Últimos 7 días"], ["30d", "Últimos 30 días"],
                 ["mes", "Este mes"], ["mes_ant", "Mes pasado"], ["anio", "Este año"], ["todo", "Todo"]];
  /* [desde, hasta) del rango; null = sin límite */
  function limites(r) {
    var hoy = inicioDia(new Date()), man = sumarDias(hoy, 1);
    switch (r.clave) {
      case "hoy": return [hoy, man];
      case "ayer": return [sumarDias(hoy, -1), hoy];
      case "7d": return [sumarDias(hoy, -6), man];
      case "30d": return [sumarDias(hoy, -29), man];
      case "mes": return [inicioMes(hoy), man];
      case "mes_ant": return [new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1), inicioMes(hoy)];
      case "anio": return [new Date(hoy.getFullYear(), 0, 1), man];
      case "propio": return [r.desde ? inicioDia(r.desde) : null, r.hasta ? sumarDias(inicioDia(r.hasta), 1) : null];
      default: return [null, null];
    }
  }
  function enLimites(f, l) { if (!f) return false; var t = new Date(f); return (!l[0] || t >= l[0]) && (!l[1] || t < l[1]); }
  function enRango(f, r) { return enLimites(f, limites(r)); }
  function nombreRango(r) {
    if (r.clave === "propio") return mismoDia(r.desde, r.hasta) ? fecha(r.desde) : fecha(r.desde) + " – " + fecha(r.hasta);
    for (var i = 0; i < PRESETS.length; i++) if (PRESETS[i][0] === r.clave) return PRESETS[i][1];
    return "Todo";
  }
  function primeraFecha() {
    var f = datos.ops.map(function (o) { return o.creado_en; }).concat(datos.clientes.map(function (c) { return c.perfil.creado_en; })).filter(Boolean).sort()[0];
    return f ? new Date(f) : new Date();
  }
  function limitesEfectivos(r) {
    var l = limites(r);
    return [l[0] || inicioDia(primeraFecha()), l[1] || sumarDias(inicioDia(new Date()), 1)];
  }
  function sufijoRango(r) {
    var l = limitesEfectivos(r);
    return r.clave === "todo" ? "todo" : isoLocal(l[0]) + "_a_" + isoLocal(sumarDias(l[1], -1));
  }

  /* ======================= red ======================= */
  function cab(extra, sinSesion) {
    var h = { apikey: KEY, "Content-Type": "application/json" };
    if (!sinSesion) h.Authorization = "Bearer " + (sesion ? sesion.access_token : KEY);
    for (var k in extra) h[k] = extra[k];
    return h;
  }
  /* si la sesión venció (dura 1 hora) se renueva sola y se repite el pedido */
  async function api(ruta, o, reintento) {
    o = o || {};
    var extra = {};
    if (o.prefer) extra.Prefer = o.prefer;
    var res = await fetch(base + ruta, { method: o.method || "GET", headers: cab(extra, o.sinSesion), body: o.body });
    var txt = await res.text();
    var d = null;
    try { d = txt ? JSON.parse(txt) : null; } catch (e) { d = txt; }
    if (!res.ok) {
      var m = (d && (d.msg || d.message || d.error_description || d.error)) || ("Error " + res.status);
      if (res.status === 401 && !reintento && !o.sinSesion && sesion && sesion.refresh_token && /jwt|expired|token/i.test(m)) {
        await renovar();
        return api(ruta, o, true);
      }
      var err = new Error(m); err.status = res.status; err.code = d && d.code; throw err;
    }
    return d;
  }
  function faltaFuncion(e) { return e && (e.status === 404 || e.code === "PGRST202"); }
  async function traerTodo(tabla) {
    var todo = [], desde = 0, LOTE = 1000;
    for (;;) {
      var lote = await api("/rest/v1/" + tabla + "?select=*&order=creado_en.desc,id.desc&limit=" + LOTE + "&offset=" + desde);
      todo = todo.concat(lote || []);
      if (!lote || lote.length < LOTE) break;
      desde += LOTE;
    }
    return todo;
  }
  /* escribe y COMPRUEBA que el servidor aplicó el cambio */
  async function escribir(ruta, metodo, cuerpo) {
    if (!esAdmin()) throw new Error("Tu usuario es de consulta: no puede hacer cambios.");
    var r = await api(ruta, { method: metodo, body: JSON.stringify(cuerpo), prefer: "return=representation" });
    if (!Array.isArray(r) || !r.length) throw new Error("El servidor no aplicó el cambio (sin permiso o el registro ya no existe).");
    return r;
  }

  /* ======================= sesión, rol y perfil ======================= */
  function guardar(s) {
    sesion = s;
    try { localStorage.setItem(SES, JSON.stringify({ refresh_token: s.refresh_token })); } catch (e) {}
  }
  async function renovar() {
    guardar(await api("/auth/v1/token?grant_type=refresh_token", { method: "POST", sinSesion: true, body: JSON.stringify({ refresh_token: sesion.refresh_token }) }));
  }
  function salir() {
    despedirse();
    sesion = null; rol = null;
    try { localStorage.removeItem(SES); } catch (e) {}
    location.reload();
  }
  async function obtenerRol() {
    try {
      var r = await api("/rest/v1/rpc/mi_rol", { method: "POST", body: "{}" });
      return r === "admin" || r === "consulta" || r === "soporte" ? r : null;
    } catch (e) {
      if (!e.status) throw e;
      if (!faltaFuncion(e)) return null;
    }
    try {
      var a = await api("/rest/v1/rpc/es_admin", { method: "POST", body: "{}" });
      return a === true ? "admin" : null;
    } catch (e) { if (!e.status) throw e; return null; }
  }
  async function cargarPerfil() {
    var correo = (sesion && sesion.user && sesion.user.email) || "";
    perfil = { nombre: correo.split("@")[0], puesto: esAdmin() ? "Administrador" : "Equipo", avatar: null, disponible: false, email: correo };
    try {
      var p = await api("/rest/v1/rpc/mi_perfil", { method: "POST", body: "{}" });
      if (p) {
        perfil.nombre = p.nombre || perfil.nombre;
        perfil.puesto = p.puesto || perfil.puesto;
        perfil.avatar = p.avatar || null;
        perfil.disponible = true;
      }
    } catch (e) { /* aún no se ejecutó el SQL: se usan los datos del correo */ }
    pintarYo();
  }
  function iniciales(n) {
    return String(n || "?").trim().split(/\s+/).slice(0, 2).map(function (w) { return w.charAt(0); }).join("").toUpperCase() || "?";
  }
  function avatarHTML(nombre, avatar, clase) {
    var ok = typeof avatar === "string" && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(avatar);
    return '<span class="ad-avatar' + (clase ? " " + clase : "") + '" aria-hidden="true">' + (ok ? '<img src="' + avatar + '" alt="">' : esc(iniciales(nombre))) + "</span>";
  }
  function pintarYo() {
    $("adAvatar").outerHTML = avatarHTML(perfil.nombre, perfil.avatar).replace('class="ad-avatar"', 'class="ad-avatar" id="adAvatar"');
    $("adYoNombre").textContent = perfil.nombre || "Mi cuenta";
    $("adYoPuesto").textContent = perfil.puesto || "";
    $("adUsuario").textContent = perfil.email || "";
  }

  /* ======================= carga de datos ======================= */
  async function cargar() {
    var t;
    if (esConsulta()) {
      var d = await api("/rest/v1/rpc/consulta_datos", { method: "POST", body: "{}" }) || {};
      t = [d.perfiles, d.documentos, d.tarjetas, d.cuentas, d.operaciones];
    } else {
      t = await Promise.all(["perfiles", "documentos", "tarjetas", "cuentas", "operaciones"].map(traerTodo));
    }
    var perfiles = t[0] || [], docs = t[1] || [], tarj = t[2] || [], ctas = t[3] || [], lista = t[4] || [];
    var notas = [];
    try { notas = await traerTodo("notas_cliente"); hay.notas = true; } catch (e) { hay.notas = false; }
    datos.historial = []; hay.historial = false;
    if (esAdmin()) {
      try { datos.historial = await api("/rest/v1/auditoria?select=*&order=creado_en.desc&limit=3000") || []; hay.historial = true; }
      catch (e) { hay.historial = false; }
    }
    var porId = {};
    perfiles.forEach(function (p) { porId[p.id] = { id: p.id, perfil: p, docs: [], tarjetas: [], cuentas: [], ops: [], notas: [] }; });
    function meter(l, campo, llave) { l.forEach(function (x) { var id = x[llave || "user_id"]; if (id && porId[id]) porId[id][campo].push(x); }); }
    meter(docs, "docs"); meter(tarj, "tarjetas"); meter(ctas, "cuentas"); meter(lista, "ops"); meter(notas, "notas", "cliente_id");
    datos.clientes = Object.keys(porId).map(function (k) {
      var c = porId[k], f = [c.perfil.creado_en];
      c.docs.concat(c.tarjetas, c.ops).forEach(function (x) { f.push(x.creado_en); if (x.completada_en) f.push(x.completada_en); });
      c.ultima = f.filter(Boolean).sort().pop();
      return c;
    });
    datos.porId = porId; datos.ops = lista; datos.docs = docs; datos.tarjetas = tarj;
    var p = [];
    docs.forEach(function (d) { if (d.estado === "en_revision") p.push({ clase: "identidad", tabla: "documentos", fila: d, cliente: porId[d.user_id] }); });
    tarj.forEach(function (x) { if (x.estado === "en_revision") p.push({ clase: "tarjeta", tabla: "tarjetas", fila: x, cliente: porId[x.user_id] }); });
    p.sort(function (a, b) { return new Date(a.fila.creado_en) - new Date(b.fila.creado_en); });
    datos.pendientes = p;
  }
  async function cargarEquipo() {
    try { eq.lista = await api("/rest/v1/rpc/equipo_listar", { method: "POST", body: "{}" }) || []; eq.error = null; }
    catch (e) { eq.lista = []; eq.error = faltaFuncion(e) ? "falta_sql" : e.message; }
    eq.conEstado = eq.lista.some(function (t) { return "estado" in t; });
  }

  /* ======================= estado de conexión ======================= */
  /* Cada minuto el panel le dice al servidor si la persona está ACTIVA
     o AUSENTE (más de 5 min sin tocar nada, o en otra pestaña), y al
     cerrar, que se DESCONECTÓ. La respuesta trae el rol actual: si el
     administrador le cambió el acceso o se lo quitó, el panel se
     actualiza solo. */
  var pres = { enviado: null, enviadoEn: 0, latido: null, espera: null, ultimaAccion: Date.now(), apagado: false };
  var INACTIVO_MS = 5 * 60 * 1000;
  function estadoLocal() {
    if (document.visibilityState === "hidden") return "ausente";
    return Date.now() - pres.ultimaAccion > INACTIVO_MS ? "ausente" : "activo";
  }
  async function enviarPresencia(e) {
    if (!sesion || !rol || pres.apagado) return;
    pres.enviado = e; pres.enviadoEn = Date.now();
    var r;
    try { r = await api("/rest/v1/rpc/registrar_presencia", { method: "POST", body: JSON.stringify({ p_estado: e }) }); }
    catch (err) { if (faltaFuncion(err)) detenerPresencia(); return; }   // aún no se ejecutó el SQL
    if (sesion && rol && r !== rol) cambioDeRol(r);
  }
  function revisarPresencia(inmediato) {
    clearTimeout(pres.espera);
    pres.espera = setTimeout(function () {
      var e = estadoLocal();
      if (e !== pres.enviado || Date.now() - pres.enviadoEn > 50000) enviarPresencia(e);
    }, inmediato ? 0 : 1200);
  }
  function alActuar() {
    pres.ultimaAccion = Date.now();
    if (pres.enviado === "ausente" && document.visibilityState === "visible") revisarPresencia();
  }
  function alCambiarPestana() {
    if (document.visibilityState === "visible") pres.ultimaAccion = Date.now();
    revisarPresencia();
  }
  function despedirse() {
    if (!sesion || pres.apagado || !pres.enviado) return;
    try {
      fetch(base + "/rest/v1/rpc/registrar_presencia", { method: "POST", keepalive: true, headers: cab({}), body: JSON.stringify({ p_estado: "desconectado" }) }).catch(function () {});
    } catch (e) {}
  }
  function iniciarPresencia() {
    if (pres.latido) return;
    pres.apagado = false; pres.enviado = null; pres.ultimaAccion = Date.now();
    revisarPresencia(true);
    pres.latido = setInterval(function () { revisarPresencia(true); }, 60000);
    if (pres.oyentes) return;
    pres.oyentes = true;
    ["pointerdown", "keydown", "wheel", "touchstart", "mousemove"].forEach(function (ev) { document.addEventListener(ev, alActuar, { passive: true }); });
    document.addEventListener("visibilitychange", alCambiarPestana);
    window.addEventListener("pagehide", despedirse);
    window.addEventListener("pageshow", function (ev) { if (ev.persisted && !pres.apagado) { pres.ultimaAccion = Date.now(); revisarPresencia(true); } });
  }
  function detenerPresencia() {
    pres.apagado = true;
    clearInterval(pres.latido); clearTimeout(pres.espera); pres.latido = null;
  }
  /* el administrador cambió el acceso de esta persona (o se lo quitó) */
  function cambioDeRol(nuevo) {
    if (nuevo !== "admin" && nuevo !== "consulta" && nuevo !== "soporte") return accesoRetirado();
    rol = nuevo; cacheFotos = {};
    prepararSegunRol();
    if (!esAdmin() && (vista === "equipo" || vista === "auditoria")) vista = "inicio";
    cargarPerfil();
    cargar().then(render).catch(function () {});
    IC.toast("Tu acceso cambió a " + NOMBRE_ROL[nuevo] + ".", "ok");
  }
  function accesoRetirado() {
    detenerPresencia();
    sesion = null; rol = null; cacheFotos = {};
    datos = { pendientes: [], clientes: [], ops: [], docs: [], tarjetas: [], historial: [], porId: {} };
    try { localStorage.removeItem(SES); } catch (e) {}
    cerrarDrawer(); cerrarMenu(); IC.closeModal();
    $("adView").innerHTML = "";
    $("adPanel").classList.add("hidden");
    $("adLogin").classList.remove("hidden");
    $("adLoginError").textContent = "Tu acceso al panel fue retirado. Si crees que es un error, habla con el administrador.";
    $("adLoginError").classList.remove("hidden");
  }

  /* ======================= fotos de documentos (administrador y soporte) ======================= */
  /* enlaces firmados de corta duración (15 min): si alguien copia uno,
     deja de servir enseguida */
  var VIDA_FOTO = 900;
  async function urlFoto(ruta) {
    if (!ruta || !verFotos()) return null;
    var c = cacheFotos[ruta];
    if (c && c.vence > Date.now()) return c.url;
    try {
      var r = await api("/storage/v1/object/sign/" + BUCKET + "/" + encodeURI(ruta), { method: "POST", body: JSON.stringify({ expiresIn: VIDA_FOTO }) });
      cacheFotos[ruta] = { url: base + "/storage/v1" + r.signedURL, vence: Date.now() + (VIDA_FOTO - 60) * 1000 };
      return cacheFotos[ruta].url;
    } catch (e) { return null; }
  }
  async function pintarFotos(cont) {
    var nodos = cont.querySelectorAll("[data-foto]");
    for (var i = 0; i < nodos.length; i++) {
      var n = nodos[i], u = await urlFoto(n.getAttribute("data-foto"));
      if (!n.isConnected) return;
      if (!u) { n.innerHTML = '<span class="ad-sinfoto">Sin foto</span>'; continue; }
      n.innerHTML = '<img src="' + u + '" alt=""><a class="ad-zoom" href="' + u + '" target="_blank" rel="noopener" title="Ver en grande" aria-label="Ver en grande">' +
        '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M15 3h6v6M10 14L21 3M21 14v7H3V3h7"/></svg></a>';
      (function (caja, enlace) {
        caja.querySelector("img").addEventListener("error", function () {
          caja.innerHTML = '<span class="ad-sinfoto">La imagen no se pudo abrir.<br><a href="' + enlace + '" target="_blank" rel="noopener">Descargar archivo</a></span>';
        });
      })(n, u);
    }
  }

  /* ======================= acciones (solo administrador) ======================= */
  async function accion(fn, btn) {
    if (ocupado) return;
    if (!esAdmin()) { IC.toast("Tu usuario es de consulta: no puede hacer cambios.", "err"); return; }
    ocupado = true;
    if (btn) btn.disabled = true;
    try { await fn(); }
    catch (e) { IC.toast("No se guardó: " + (e.message || "error de conexión"), "err"); }
    finally { ocupado = false; if (btn && btn.isConnected) btn.disabled = false; }
  }
  async function avisar(userId, titulo, texto, tipo) {
    try { await escribir("/rest/v1/avisos", "POST", { user_id: userId, titulo: titulo, texto: texto, tipo: tipo }); } catch (e) {}
  }
  async function decidir(item, aprobar, motivo) {
    var esIdent = item.clase === "identidad";
    var cuerpo = { estado: aprobar ? (esIdent ? "verificado" : "verificada") : "rechazado", revisado_en: new Date().toISOString() };
    if (!aprobar) cuerpo.motivo = motivo || null;
    await escribir("/rest/v1/" + item.tabla + "?id=eq." + item.fila.id, "PATCH", cuerpo);
    var titulo, texto;
    if (esIdent) {
      titulo = aprobar ? "Identidad verificada" : "Identidad rechazada";
      texto = aprobar ? "Ya validamos tu DNI y tu selfie. Puedes registrar tu tarjeta y crear tu operación."
                      : ("No pudimos validar tus documentos. " + (motivo || "Vuelve a subirlos con mejor luz y sin reflejos."));
    } else {
      titulo = aprobar ? "Tarjeta verificada" : "Tarjeta rechazada";
      texto = aprobar ? ("Tu tarjeta " + (item.fila.banco || "") + " terminada en " + (item.fila.ultimos4 || "") + " quedó habilitada.")
                      : ("No pudimos validar tu tarjeta. " + (motivo || "Revisa que la foto muestre tu nombre y los últimos 4 dígitos."));
    }
    await avisar(item.fila.user_id, titulo, texto, aprobar ? "ok" : "alerta");
    IC.toast(aprobar ? "Aprobado. El cliente ya fue avisado." : "Rechazado. El cliente ya fue avisado.", aprobar ? "ok" : "err");
    await cargar(); render();
  }
  function pedirMotivo(item) {
    IC.modal({
      title: "¿Por qué lo rechazas?",
      html: '<p class="muted">El cliente verá este mensaje en su panel, así sabrá qué corregir.</p>' +
        '<div class="field mt-8"><label for="adMotivo">Motivo</label><textarea id="adMotivo" rows="3" maxlength="300" placeholder="Ej. La foto del DNI sale borrosa y no se lee el número."></textarea></div>',
      actions: [{ label: "Cancelar", cls: "btn-outline-dark" },
        { label: "Rechazar y avisar", cls: "btn-danger", onClick: function () { var m = (($("adMotivo") && $("adMotivo").value) || "").trim(); accion(function () { return decidir(item, false, m); }); } }]
    });
  }
  async function cambiarOperacion(op, estado) {
    await escribir("/rest/v1/operaciones?id=eq." + op.id, "PATCH", { estado: estado });
    var completa = estado === "completada";
    await avisar(op.user_id, completa ? "¡Depósito realizado!" : "Operación cancelada",
      completa ? ("Ya depositamos " + dinero(op.neto) + " en tu cuenta " + (op.banco_cuenta || "") + ". Tu comprobante de la operación " + (op.codigo || "") + " ya está disponible.")
               : ("La operación " + (op.codigo || "") + " fue cancelada. Si crees que es un error, escríbenos por WhatsApp."), completa ? "ok" : "alerta");
    IC.toast(completa ? "Marcada como pagada. El cliente ya fue avisado." : "Operación cancelada.", completa ? "ok" : "err");
    cerrarDrawer();
    await cargar(); render();
  }
  function confirmarCompletada(op) {
    IC.modal({
      title: "¿Ya depositaste el dinero?",
      html: "<p>Vas a marcar como <b>pagada</b> la operación <b>" + esc(op.codigo || "") + "</b> de " + esc(op.nombre || "") + ".</p>" +
            '<p class="muted mt-8">Confirma solo si ya transferiste <b>' + dinero(op.neto) + "</b> a la cuenta " + esc(op.banco_cuenta || "") + " " + esc(op.numero_cuenta || "") + ". El cliente recibirá el aviso y su comprobante.</p>",
      actions: [{ label: "Todavía no", cls: "btn-outline-dark" },
        { label: "Sí, ya deposité", cls: "btn-primary", onClick: function () { accion(function () { return cambiarOperacion(op, "completada"); }); } }]
    });
  }
  function confirmarCancelar(op) {
    IC.modal({
      title: "Cancelar operación",
      html: "<p>Vas a cancelar la operación <b>" + esc(op.codigo || "") + "</b> de " + esc(op.nombre || "") + ".</p><p class=\"muted mt-8\">El cliente recibirá un aviso. Una operación cancelada no suma comisión.</p>",
      actions: [{ label: "Volver", cls: "btn-outline-dark" },
        { label: "Sí, cancelar", cls: "btn-danger", onClick: function () { accion(function () { return cambiarOperacion(op, "cancelada"); }); } }]
    });
  }
  async function guardarNota(c, texto, btn) {
    await accion(async function () {
      var r = await escribir("/rest/v1/notas_cliente", "POST", { cliente_id: c.id, texto: texto });
      c.notas.unshift(r[0]);
      IC.toast("Nota guardada.", "ok");
      render();
    }, btn);
  }
  function waCliente(p) {
    if (!esAdmin()) return;
    var tel = String((p && p.celular) || "").replace(/\D/g, "");
    if (!tel) { IC.toast("Este cliente no dejó su celular.", "err"); return; }
    if (tel.length === 9) tel = "51" + tel;
    window.open("https://wa.me/" + tel + "?text=" + encodeURIComponent("Hola " + ((p && p.nombres) || "") + ", te escribimos de Impulsa Crédito sobre tu solicitud."), "_blank", "noopener");
  }

  /* ======================= cuenta propia: contraseña y perfil ======================= */
  function validarClave(p) { return p.length >= 8 && /\d/.test(p) && /[a-zA-Z]/.test(p); }
  function cambiarClave() {
    IC.modal({
      title: "Cambiar mi contraseña",
      html: '<p class="muted">Mínimo 8 caracteres, con letras y al menos un número.</p>' +
        '<div class="field mt-8"><label for="adClave1">Contraseña nueva</label><input type="password" id="adClave1" autocomplete="new-password"></div>' +
        '<div class="field"><label for="adClave2">Repítela</label><input type="password" id="adClave2" autocomplete="new-password"></div><p class="form-error hidden" id="adClaveErr"></p>',
      actions: [{ label: "Cancelar", cls: "btn-outline-dark" },
        { label: "Guardar", cls: "btn-primary", keepOpen: true, onClick: async function (b) {
            var p1 = $("adClave1").value, p2 = $("adClave2").value, err = $("adClaveErr");
            function mal(t) { err.textContent = t; err.classList.remove("hidden"); }
            if (!validarClave(p1)) return mal("Mínimo 8 caracteres, con letras y al menos un número.");
            if (p1 !== p2) return mal("Las contraseñas no coinciden.");
            b.disabled = true; b.textContent = "Guardando...";
            try { await api("/auth/v1/user", { method: "PUT", body: JSON.stringify({ password: p1 }) }); IC.closeModal(); IC.toast("Contraseña actualizada.", "ok"); }
            catch (e) { b.disabled = false; b.textContent = "Guardar"; mal(/different/i.test(e.message) ? "Debe ser distinta a la actual." : (e.message || "No se pudo cambiar.")); }
          } }]
    });
  }
  /* recorta la foto al centro y la guarda pequeña (200 px), como un avatar */
  function fotoCuadrada(archivo) {
    return new Promise(function (ok, mal) {
      if (!archivo || !/^image\//.test(archivo.type)) return mal(new Error("Elige una imagen (JPG o PNG)."));
      if (archivo.size > 12 * 1024 * 1024) return mal(new Error("La imagen pesa demasiado (máximo 12 MB)."));
      var fr = new FileReader();
      fr.onload = function () {
        var img = new Image();
        img.onload = function () {
          var lado = Math.min(img.width, img.height), c = document.createElement("canvas");
          c.width = c.height = 200;
          c.getContext("2d").drawImage(img, (img.width - lado) / 2, (img.height - lado) / 2, lado, lado, 0, 0, 200, 200);
          ok(c.toDataURL("image/jpeg", 0.85));
        };
        img.onerror = function () { mal(new Error("No se pudo leer la imagen.")); };
        img.src = fr.result;
      };
      fr.onerror = function () { mal(new Error("No se pudo leer el archivo.")); };
      fr.readAsDataURL(archivo);
    });
  }
  /* elegir el tipo de acceso de un trabajador (Consulta o Soporte) */
  function elegirRolHTML(nombreCampo, actual) {
    function op(v, tit, txt) {
      return '<label class="ad-op-rol"><input type="radio" name="' + nombreCampo + '" value="' + v + '"' + (actual === v ? " checked" : "") + ">" +
        "<span><b>" + tit + "</b><small>" + txt + "</small></span></label>";
    }
    return '<div class="ad-campo-rol"><span class="ad-campo-tit" id="' + nombreCampo + 'Tit">Tipo de acceso</span>' +
      '<div class="ad-elegir-rol" role="radiogroup" aria-labelledby="' + nombreCampo + 'Tit">' +
        op("consulta", "Consulta", "Ve clientes y operaciones. No ve fotos.") +
        op("soporte", "Soporte", "Además ve las fotos del DNI, la selfie y las tarjetas.") +
      "</div><p class=\"ad-campo-nota\">En los dos: cuentas, celulares y correos ocultos; no aprueba, no cambia nada ni descarga datos.</p></div>";
  }
  function rolElegido(nombreCampo) {
    var r = document.querySelector('input[name="' + nombreCampo + '"]:checked');
    return r ? r.value : "consulta";
  }
  /* formulario de perfil reutilizable (mi perfil y editar trabajador) */
  function modalPerfil(o) {
    var foto = o.avatar || null, cambio = null;   // cambio: null = sin tocar, "" = quitar, dataURL = nueva
    IC.modal({
      title: o.titulo,
      html: '<div class="ad-foto-perfil"><span id="pfAvatar">' + avatarHTML(o.nombre, foto, "grande") + "</span>" +
          '<div><label class="btn btn-outline-dark btn-sm">Cambiar foto<input type="file" id="pfArchivo" accept="image/*"></label> ' +
          '<button type="button" class="btn btn-ghost-dark btn-sm" id="pfQuitar">Quitar</button></div></div>' +
        '<div class="field"><label for="pfNombre">Nombre</label><input id="pfNombre" maxlength="80" value="' + esc(o.nombre || "") + '"></div>' +
        '<div class="field"><label for="pfPuesto">Puesto de trabajo</label><input id="pfPuesto" maxlength="60" value="' + esc(o.puesto || "") + '"' + (o.puestoBloqueado ? " disabled" : "") + ' placeholder="Ej. Asesora comercial"></div>' +
        (o.puestoBloqueado ? '<p class="muted" style="font-size:.78rem">El puesto lo asigna el administrador.</p>' : "") +
        (o.rol ? elegirRolHTML("pfRol", o.rol) : "") +
        '<p class="form-error hidden" id="pfErr"></p>',
      actions: [{ label: "Cancelar", cls: "btn-outline-dark" },
        { label: "Guardar", cls: "btn-primary", keepOpen: true, onClick: async function (b) {
            var nom = $("pfNombre").value.trim(), pue = $("pfPuesto").value.trim(), err = $("pfErr");
            if (nom.length < 2) { err.textContent = "Escribe el nombre."; err.classList.remove("hidden"); return; }
            b.disabled = true; b.textContent = "Guardando...";
            try { await o.guardar(nom, pue, cambio, o.rol ? rolElegido("pfRol") : null); IC.closeModal(); IC.toast(o.aviso ? o.aviso() : "Perfil guardado.", "ok"); }
            catch (e) { b.disabled = false; b.textContent = "Guardar"; err.textContent = faltaFuncion(e) ? "Primero ejecuta supabase-equipo-consulta.sql en Supabase." : (e.message || "No se pudo guardar."); err.classList.remove("hidden"); }
          } }]
    });
    $("pfArchivo").addEventListener("change", function () {
      fotoCuadrada(this.files[0]).then(function (url) { cambio = url; $("pfAvatar").innerHTML = avatarHTML($("pfNombre").value, url, "grande"); })
        .catch(function (e) { IC.toast(e.message, "err"); });
    });
    $("pfQuitar").addEventListener("click", function () { cambio = ""; $("pfAvatar").innerHTML = avatarHTML($("pfNombre").value, null, "grande"); });
  }
  function miPerfil() {
    if (!perfil.disponible) { IC.modal({ title: "Mi perfil", text: "Para guardar tu foto y tu puesto, primero ejecuta supabase-equipo-consulta.sql en Supabase." }); return; }
    modalPerfil({
      titulo: "Mi perfil", nombre: perfil.nombre, puesto: perfil.puesto, avatar: perfil.avatar, puestoBloqueado: esConsulta(),
      guardar: async function (nom, pue, foto) {
        await api("/rest/v1/rpc/mi_perfil_guardar", { method: "POST", body: JSON.stringify({ p_nombre: nom, p_puesto: esConsulta() ? null : pue, p_avatar: foto }) });
        perfil.nombre = nom; if (!esConsulta()) perfil.puesto = pue || "Administrador";
        if (foto !== null) perfil.avatar = foto || null;
        pintarYo(); if (vista === "equipo") render();
      }
    });
  }

  /* ======================= Excel (solo administrador) ======================= */
  function descargarCSV(nombreArchivo, filas) {
    if (!esAdmin()) { IC.toast("Las descargas son solo para el administrador.", "err"); return; }
    if (!filas.length) { IC.toast("No hay datos en ese periodo.", "err"); return; }
    var cols = Object.keys(filas[0]), sep = ";";
    function celda(v) {
      if (v === null || v === undefined) return "";
      var t = String(v);
      if (/^[=+\-@]/.test(t) && isNaN(Number(t))) t = "'" + t;   // evita fórmulas escondidas
      if (t.indexOf(sep) >= 0 || t.indexOf('"') >= 0 || /[\r\n]/.test(t)) t = '"' + t.replace(/"/g, '""') + '"';
      return t;
    }
    var csv = cols.join(sep) + "\r\n" + filas.map(function (f) { return cols.map(function (c) { return celda(f[c]); }).join(sep); }).join("\r\n");
    var url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" }));
    var a = document.createElement("a");
    a.href = url; a.download = "impulsa-" + nombreArchivo + ".csv";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    IC.toast("Descargado. Ábrelo con Excel o Google Sheets.", "ok");
  }
  function filasClientes(lista) {
    return lista.map(function (c) {
      var idd = c.docs[0], comp = c.ops.filter(completada);
      return { "DNI": c.perfil.documento || "", "Cliente": nombre(c), "Celular": c.perfil.celular || "", "Correo": c.perfil.email || "",
        "DNI y selfie": idd ? idd.estado : "sin subir", "N tarjetas": c.tarjetas.length,
        "Tarjetas": c.tarjetas.map(function (t) { return (t.banco || "") + " " + (t.marca || "") + " ****" + (t.ultimos4 || ""); }).join(" | "),
        "N cuentas": c.cuentas.length, "Cuentas": c.cuentas.map(function (a) { return (a.banco || "") + " " + (a.numero || ""); }).join(" | "),
        "N operaciones": c.ops.length, "Efectivizado": sumar(comp, "monto"), "Comision": sumar(comp, "comision"),
        "Se registro": fechaHora(c.perfil.creado_en), "Ultima actividad": fechaHora(c.ultima) };
    });
  }
  function filasOperaciones(lista) {
    return lista.map(function (o) {
      return { "Codigo": o.codigo || "", "Fecha": fechaHora(o.creado_en), "Cliente": o.nombre || "", "DNI": o.documento || "", "Celular": o.celular || "",
        "Tarjeta": (o.banco_tarjeta || "") + " ****" + (o.ultimos4 || ""), "Banco destino": o.banco_cuenta || "", "Cuenta destino": o.numero_cuenta || "",
        "Monto": Number(o.monto || 0), "Comision": Number(o.comision || 0), "Recibe": Number(o.neto || 0), "Estado": o.estado || "",
        "Depositada": o.completada_en ? fechaHora(o.completada_en) : "" };
    });
  }

  /* ======================= piezas de interfaz ======================= */
  function svg(d) { return '<svg viewBox="0 0 24 24" aria-hidden="true">' + d + "</svg>"; }
  var ICO = {
    wa: '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M17.5 14.4c-.3-.2-1.7-.9-2-1-.3-.1-.5-.1-.7.1-.2.3-.7 1-.9 1.2-.2.2-.3.2-.6.1-1.7-.9-2.9-1.6-4-3.5-.3-.5.3-.5.8-1.5.1-.2 0-.4 0-.5s-.7-1.6-.9-2.2c-.2-.5-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.5s1.1 2.9 1.2 3.1c.1.2 2.1 3.2 5.1 4.5 1.9.8 2.6.9 3.5.7.6-.1 1.7-.7 1.9-1.3.2-.7.2-1.2.2-1.3-.1-.2-.3-.2-.5-.3z"/><path d="M12 2a10 10 0 00-8.6 15L2 22l5.2-1.4A10 10 0 1012 2zm0 18.2a8.2 8.2 0 01-4.2-1.1l-.3-.2-3.1.8.8-3-.2-.3A8.2 8.2 0 1112 20.2z"/></svg>',
    buscar: svg('<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>'),
    excel: svg('<path d="M12 3v12M7 12l5 5 5-5M5 21h14"/>'),
    cal: svg('<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/>'),
    chev: '<svg class="chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>',
    soles: svg('<rect x="2" y="6" width="20" height="12" rx="3"/><circle cx="12" cy="12" r="2.5"/>'),
    estrella: svg('<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>'),
    check: svg('<path d="M20 6L9 17l-5-5"/>'),
    persona: svg('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0116 0"/>'),
    doc: svg('<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>'),
    deposito: svg('<path d="M12 3v12M7 10l5 5 5-5"/><path d="M4 21h16"/>')
  };
  function chip(estado) {
    var m = { en_revision: ["En revisión", "warn"], verificado: ["Verificado", "ok"], verificada: ["Verificada", "ok"], rechazado: ["Rechazado", "err"],
      completada: ["Completada", "ok"], cancelada: ["Cancelada", "err"], pend_pago: ["Pendiente de pago", "warn"], activa: ["Activa", "warn"], sin_subir: ["Sin DNI", ""] };
    var v = m[estado] || [estado || "—", ""];
    return '<span class="ad-chip ' + v[1] + '">' + esc(v[0]) + "</span>";
  }
  function nombre(c) { if (!c || !c.perfil) return "Cliente sin perfil"; return ((c.perfil.nombres || "") + " " + (c.perfil.apellidos || "")).trim() || "Sin nombre"; }
  function completada(o) { return o.estado === "completada"; }
  function pendiente(o) { return o.estado === "pend_pago" || o.estado === "activa"; }
  function cancelada(o) { return o.estado === "cancelada"; }
  function sumar(l, campo) { return l.reduce(function (a, o) { return a + Number(o[campo] || 0); }, 0); }
  function estadoIdentidad(c) { return c.docs[0] ? c.docs[0].estado : "sin_subir"; }
  function seg(id, opciones, actual) {
    return '<div class="ad-seg" role="group" id="' + id + '">' + opciones.map(function (o) {
      return '<button data-seg="' + o[0] + '" class="' + (o[0] === actual ? "on" : "") + '" aria-pressed="' + (o[0] === actual) + '"' + (o[2] ? ' title="' + esc(o[2]) + '"' : "") + ">" + o[1] + "</button>";
    }).join("") + "</div>";
  }
  function enlazarSeg(id, fn) { var g = $(id); if (g) g.querySelectorAll("[data-seg]").forEach(function (b) { b.addEventListener("click", function () { fn(b.dataset.seg); }); }); }
  function th(texto, campo, est, clase) {
    var c = clase ? ' class="' + clase + '"' : "";
    if (!campo) return "<th" + c + ">" + texto + "</th>";
    var on = est.orden === campo;
    return "<th" + c + ' aria-sort="' + (on ? (est.dir > 0 ? "ascending" : "descending") : "none") + '"><button class="ad-orden-btn' + (on ? " on" : "") + '" data-orden="' + campo + '">' + texto +
      '<span class="fl" aria-hidden="true">' + (on ? (est.dir > 0 ? "▲" : "▼") : "↕") + "</span></button></th>";
  }
  function enlazarOrden(cont, est) {
    cont.querySelectorAll("[data-orden]").forEach(function (b) {
      b.addEventListener("click", function () {
        var c = b.dataset.orden;
        if (est.orden === c) est.dir = -est.dir; else { est.orden = c; est.dir = c === "nombre" || c === "codigo" ? 1 : -1; }
        est.pag = 1; render();
      });
    });
  }
  function paginador(total, est, id, unidad) {
    var paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
    if (est.pag > paginas) est.pag = paginas;
    if (total <= POR_PAGINA) return '<div class="ad-pager"><span>' + plural(total, unidad[0], unidad[1]) + "</span></div>";
    return '<div class="ad-pager"><span>' + ((est.pag - 1) * POR_PAGINA + 1) + "–" + Math.min(total, est.pag * POR_PAGINA) + " de " + total + " " + unidad[1] + "</span><div>" +
      '<button data-pg="' + id + '" data-d="-1"' + (est.pag <= 1 ? " disabled" : "") + ">‹ Anterior</button><span>Página " + est.pag + " de " + paginas + "</span>" +
      '<button data-pg="' + id + '" data-d="1"' + (est.pag >= paginas ? " disabled" : "") + ">Siguiente ›</button></div></div>";
  }
  function enlazarPaginador(cont, id, est) {
    cont.querySelectorAll('[data-pg="' + id + '"]').forEach(function (b) { b.addEventListener("click", function () { est.pag += Number(b.dataset.d); render(); window.scrollTo({ top: 0, behavior: "smooth" }); }); });
  }
  function pagina(lista, est) { return lista.slice((est.pag - 1) * POR_PAGINA, est.pag * POR_PAGINA); }
  function enlazarBuscador(id, fijar) {
    var campo = $(id); if (!campo) return;
    campo.addEventListener("input", function () {
      fijar(campo.value);
      var pos = campo.selectionStart;
      render();
      var nc = $(id);
      if (nc) { nc.focus(); try { nc.setSelectionRange(pos, pos); } catch (e) {} }
    });
  }
  function filasClicables(cont, fn) {
    cont.querySelectorAll("tr.fila-link").forEach(function (tr) {
      tr.addEventListener("click", function (e) { if (e.target.closest("button,a")) return; fn(tr.dataset.k); });
      tr.addEventListener("keydown", function (e) { if (e.key === "Enter" && e.target === tr) fn(tr.dataset.k); });
    });
  }

  /* ---------- ventanas flotantes ---------- */
  function cerrarPops() {
    document.querySelectorAll(".ad-pop").forEach(function (p) { p.classList.add("hidden"); });
    document.querySelectorAll("[aria-expanded='true']").forEach(function (b) { if (b.id !== "adAbrirMenu") b.setAttribute("aria-expanded", "false"); });
  }
  document.addEventListener("click", function (e) { if (!e.target.closest(".ad-menu")) cerrarPops(); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") { cerrarPops(); cerrarDrawer(); cerrarMenu(); } });

  /* ---------- calendario propio (atajos + mes con rango) ---------- */
  function controlFechas(id, r) {
    return '<div class="ad-menu"><button class="ad-fecha" id="' + id + '" aria-haspopup="dialog" aria-expanded="false">' + ICO.cal +
      "<span>" + esc(nombreRango(r)) + '</span><span class="flecha" aria-hidden="true">▾</span></button>' +
      '<div class="ad-pop ad-pop-fechas ad-cal hidden" id="' + id + 'Pop" role="dialog" aria-label="Elegir fechas"></div></div>';
  }
  function enlazarFechas(id, r, alCambiar) {
    var boton = $(id), pop = $(id + "Pop");
    if (!boton) return;
    var l0 = limites(r);
    var tmp = { a: r.clave === "propio" ? r.desde : l0[0], b: r.clave === "propio" ? r.hasta : (l0[1] ? sumarDias(l0[1], -1) : null) };
    tmp.mes = inicioMes(tmp.b || new Date());
    var DIAS = ["L", "M", "M", "J", "V", "S", "D"];
    function pintar() {
      var hoy = inicioDia(new Date()), inicio = lunes(tmp.mes), celdas = "";
      for (var i = 0; i < 42; i++) {
        var d = sumarDias(inicio, i), cl = [];
        if (d.getMonth() !== tmp.mes.getMonth()) cl.push("fuera");
        if (mismoDia(d, hoy)) cl.push("hoy");
        var a = tmp.a && inicioDia(tmp.a), b = tmp.b && inicioDia(tmp.b);
        if (a && mismoDia(d, a)) cl.push("ini");
        if (b && mismoDia(d, b)) cl.push("fin");
        if (a && b && d > a && d < b) cl.push("rango");
        celdas += '<button type="button" class="' + cl.join(" ") + '" data-dia="' + isoLocal(d) + '" aria-label="' + esc(d.toLocaleDateString("es-PE", { weekday: "long", day: "numeric", month: "long", year: "numeric" })) + '"><span>' + d.getDate() + "</span></button>";
      }
      var txt = tmp.a ? (tmp.b && !mismoDia(tmp.a, tmp.b) ? fecha(tmp.a) + " – " + fecha(tmp.b) : fecha(tmp.a)) : "Elige el primer día";
      pop.innerHTML =
        '<div class="ad-cal-atajos">' + PRESETS.map(function (p) { return '<button type="button" data-pre="' + p[0] + '" class="' + (r.clave === p[0] ? "on" : "") + '">' + p[1] + "</button>"; }).join("") + "</div>" +
        '<div class="ad-cal-mes"><div class="ad-cal-cab"><button type="button" data-mes="-1" aria-label="Mes anterior">‹</button><b>' +
          esc((function (t) { return t.charAt(0).toUpperCase() + t.slice(1); })(tmp.mes.toLocaleDateString("es-PE", { month: "long", year: "numeric" }))) + '</b><button type="button" data-mes="1" aria-label="Mes siguiente">›</button></div>' +
          '<div class="ad-cal-sem">' + DIAS.map(function (x) { return "<span>" + x + "</span>"; }).join("") + "</div>" +
          '<div class="ad-cal-dias">' + celdas + "</div>" +
          '<div class="ad-cal-pie"><small>' + esc(txt) + '</small><div><button type="button" class="btn btn-ghost-dark btn-sm" data-cal="no">Cancelar</button>' +
          '<button type="button" class="btn btn-primary btn-sm" data-cal="ok"' + (tmp.a ? "" : " disabled") + ">Aplicar</button></div></div></div>";
    }
    pop.addEventListener("click", function (e) {
      var t = e.target.closest("button");
      if (!t) return;
      e.stopPropagation();
      if (t.dataset.pre) { r.clave = t.dataset.pre; delete r.desde; delete r.hasta; cerrarPops(); alCambiar(); return; }
      if (t.dataset.mes) { tmp.mes = new Date(tmp.mes.getFullYear(), tmp.mes.getMonth() + Number(t.dataset.mes), 1); pintar(); return; }
      if (t.dataset.dia) {
        var p = t.dataset.dia.split("-"), d = new Date(+p[0], +p[1] - 1, +p[2]);
        if (!tmp.a || tmp.b) { tmp.a = d; tmp.b = null; }
        else if (d < tmp.a) { tmp.b = tmp.a; tmp.a = d; }
        else tmp.b = d;
        pintar();
        var foco = pop.querySelector('[data-dia="' + isoLocal(d) + '"]'); if (foco) foco.focus();
        return;
      }
      if (t.dataset.cal === "no") { cerrarPops(); boton.focus(); return; }
      if (t.dataset.cal === "ok" && tmp.a) { r.clave = "propio"; r.desde = tmp.a; r.hasta = tmp.b || tmp.a; cerrarPops(); alCambiar(); }
    });
    boton.addEventListener("click", function () {
      var abrir = pop.classList.contains("hidden");
      cerrarPops();
      if (abrir) { pintar(); pop.classList.remove("hidden"); boton.setAttribute("aria-expanded", "true"); var f = pop.querySelector(".on") || pop.querySelector("button"); if (f) f.focus(); }
    });
  }

  /* ---------- agrupar operaciones por día, semana o mes ---------- */
  function agrupar(lista, gran, desde, hasta) {
    var cursor = gran === "mes" ? inicioMes(desde) : gran === "semana" ? lunes(desde) : inicioDia(desde), cubos = [];
    function sig(d) { return gran === "mes" ? new Date(d.getFullYear(), d.getMonth() + 1, 1) : sumarDias(d, gran === "semana" ? 7 : 1); }
    while (cursor < hasta && cubos.length < 400) { var fin = sig(cursor); cubos.push({ desde: cursor, hasta: fin, n: 0, comp: 0, canc: 0, pend: 0, monto: 0, comision: 0, neto: 0 }); cursor = fin; }
    lista.forEach(function (o) {
      var t = new Date(o.creado_en);
      for (var i = 0; i < cubos.length; i++) {
        var c = cubos[i];
        if (t >= c.desde && t < c.hasta) {
          c.n++;
          if (completada(o)) { c.comp++; c.monto += Number(o.monto || 0); c.comision += Number(o.comision || 0); c.neto += Number(o.neto || 0); }
          else if (cancelada(o)) c.canc++;
          else if (pendiente(o)) c.pend++;
          break;
        }
      }
    });
    return cubos;
  }
  function etiquetaCubo(c, gran, larga) {
    var otroAnio = c.desde.getFullYear() !== new Date().getFullYear();
    if (gran === "mes") return larga ? c.desde.toLocaleDateString("es-PE", { month: "long", year: "numeric" }) : mesCorto(c.desde) + (otroAnio ? " " + String(c.desde.getFullYear()).slice(-2) : "");
    if (gran === "semana") { var f = sumarDias(c.hasta, -1); return larga ? "Semana del " + c.desde.getDate() + " " + mesCorto(c.desde) + " al " + f.getDate() + " " + mesCorto(f) + " " + f.getFullYear() : c.desde.getDate() + " " + mesCorto(c.desde); }
    return larga ? c.desde.toLocaleDateString("es-PE", { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : c.desde.getDate() + " " + mesCorto(c.desde);
  }
  function granularidad(pedida, desde, hasta) {
    var dias = Math.round((hasta - desde) / 864e5);
    var g = pedida === "auto" ? (dias <= 35 ? "dia" : dias <= 200 ? "semana" : "mes") : pedida;
    var nota = "";
    if (g === "dia" && dias > 92) { g = "semana"; nota = "Por días se muestran como máximo 3 meses: este periodo se agrupó por semana."; }
    return { gran: g, nota: nota };
  }

  /* ---------- gráfico de barras ---------- */
  function techo(v) { if (v <= 0) return 1; var e = Math.pow(10, Math.floor(Math.log10(v))), f = v / e; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * e; }
  function compacto(v, metrica) {
    if (metrica === "ops") return new Intl.NumberFormat("es-PE", { maximumFractionDigits: 0 }).format(v);
    return "S/ " + new Intl.NumberFormat("es-PE", { notation: "compact", maximumFractionDigits: 1 }).format(v);
  }
  function valorDe(c, metrica) { return metrica === "comision" ? c.comision : metrica === "ops" ? c.comp : c.monto; }
  function textoValor(v, metrica) { return metrica === "ops" ? plural(v, "operación", "operaciones") : dinero(v); }
  var nGraf = 0;
  function dibujarGrafico(id, cubos, gran, metrica) {
    var caja = $(id);
    if (!caja) return;
    var vals = cubos.map(function (c) { return valorDe(c, metrica); });
    var max = Math.max.apply(null, vals.concat([0]));
    if (!max) { caja.innerHTML = '<div class="ad-grafico-vacio">Todavía no hay operaciones completadas en este periodo.</div>'; return; }
    var W = Math.max(280, caja.clientWidth), H = 280, izq = 62, der = 10, arr = 26, aba = 30;
    var util = W - izq - der, alto = H - arr - aba, n = cubos.length;
    var slot = util / n, ancho = Math.max(4, Math.min(42, slot * 0.64)), top = techo(max);
    var paso = Math.max(1, Math.ceil(n / Math.max(1, Math.floor(util / 64))));
    var iMax = vals.indexOf(max), conDatos = vals.filter(function (v) { return v > 0; });
    var prom = conDatos.length ? conDatos.reduce(function (a, b) { return a + b; }, 0) / conDatos.length : 0;
    var gid = "adGrad" + (++nGraf);
    var s = '<svg viewBox="0 0 ' + W + " " + H + '" width="' + W + '" height="' + H + '" role="img" aria-label="' + esc(metrica === "ops" ? "Operaciones completadas por periodo" : "Monto por periodo") + '">' +
      '<defs><linearGradient id="' + gid + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#34d399"/><stop offset="1" stop-color="#16a34a"/></linearGradient></defs>';
    [0, 0.25, 0.5, 0.75, 1].forEach(function (f) {
      var y = arr + alto - alto * f;
      s += '<line class="' + (f === 0 ? "base" : "grid") + '" x1="' + izq + '" x2="' + (W - der) + '" y1="' + y + '" y2="' + y + '"/>' +
           (f === 0 || f === 0.5 || f === 1 ? '<text class="eje" x="' + (izq - 10) + '" y="' + (y + 3.5) + '" text-anchor="end">' + esc(compacto(top * f, metrica)) + "</text>" : "");
    });
    cubos.forEach(function (c, i) {
      var v = vals[i], x = izq + i * slot + (slot - ancho) / 2, h = (v / top) * alto, y = arr + alto - h, r = Math.min(6, h, ancho / 2), cx = izq + i * slot + slot / 2;
      s += '<g class="col" data-i="' + i + '"><line class="guia" x1="' + cx + '" x2="' + cx + '" y1="' + arr + '" y2="' + (arr + alto) + '"/>';
      if (h > 0) s += '<path class="barra" fill="url(#' + gid + ')" style="animation-delay:' + Math.min(i * 18, 400) + 'ms" d="M' + x + "," + (y + h) + "V" + (y + r) + "Q" + x + "," + y + " " + (x + r) + "," + y + "H" + (x + ancho - r) + "Q" + (x + ancho) + "," + y + " " + (x + ancho) + "," + (y + r) + "V" + (y + h) + 'Z"/>';
      if (i === iMax) s += '<text class="valor" x="' + cx + '" y="' + (y - 8) + '" text-anchor="middle">' + esc(compacto(v, metrica)) + "</text>";
      s += '<rect class="hit" x="' + (izq + i * slot) + '" y="' + arr + '" width="' + slot + '" height="' + alto + '" tabindex="0" aria-label="' + esc(etiquetaCubo(c, gran, true) + ": " + textoValor(v, metrica)) + '"/></g>';
      if (i % paso === 0) s += '<text class="eje" x="' + cx + '" y="' + (H - 9) + '" text-anchor="middle">' + esc(etiquetaCubo(c, gran, false)) + "</text>";
    });
    if (prom && conDatos.length > 2) {
      var yp = arr + alto - (prom / top) * alto;
      s += '<line class="prom" x1="' + izq + '" x2="' + (W - der) + '" y1="' + yp + '" y2="' + yp + '"/>' +
           '<text class="prom-txt" x="' + (W - der) + '" y="' + (yp - 6) + '" text-anchor="end">promedio ' + esc(compacto(prom, metrica)) + "</text>";
    }
    caja.innerHTML = s + "</svg>";
    var tip = document.createElement("div");
    tip.className = "ad-tip hidden";
    caja.appendChild(tip);
    function mostrar(g) {
      var c = cubos[+g.dataset.i], rc = g.querySelector(".hit").getBoundingClientRect(), rb = caja.getBoundingClientRect();
      var barra = g.querySelector(".barra"), topY = barra ? barra.getBoundingClientRect().top : rc.bottom;
      caja.querySelectorAll("g.col.on").forEach(function (x) { x.classList.remove("on"); });
      g.classList.add("on");
      tip.textContent = "";
      var b = document.createElement("b"); b.textContent = textoValor(valorDe(c, metrica), metrica);
      var l1 = document.createElement("span"); l1.textContent = etiquetaCubo(c, gran, true);
      var l2 = document.createElement("span");
      l2.textContent = metrica === "ops" ? ("Efectivizado " + dinero(c.monto) + " · comisión " + dinero(c.comision)) : (plural(c.comp, "operación completada", "operaciones completadas") + (metrica === "monto" ? " · comisión " + dinero(c.comision) : " · efectivizado " + dinero(c.monto)));
      tip.appendChild(b); tip.appendChild(l1); tip.appendChild(l2);
      tip.classList.remove("hidden");
      var x = rc.left - rb.left + rc.width / 2;
      x = Math.max(tip.offsetWidth / 2 + 4, Math.min(rb.width - tip.offsetWidth / 2 - 4, x));
      tip.style.left = x + "px";
      tip.style.top = Math.max(tip.offsetHeight + 4, topY - rb.top - 10) + "px";
    }
    function ocultar() { tip.classList.add("hidden"); caja.querySelectorAll("g.col.on").forEach(function (x) { x.classList.remove("on"); }); }
    caja.querySelectorAll("g.col").forEach(function (g) {
      g.addEventListener("pointerenter", function () { mostrar(g); });
      g.addEventListener("focusin", function () { mostrar(g); });
      g.addEventListener("focusout", ocultar);
    });
    caja.addEventListener("pointerleave", ocultar);
  }
  /* dona: estado de las operaciones (colores de estado + texto, nunca solo color) */
  function dona(partes) {
    var total = partes.reduce(function (a, p) { return a + p.n; }, 0);
    if (!total) return '<div class="ad-grafico-vacio" style="min-height:150px">Sin operaciones en este periodo.</div>';
    var R = 58, C = 2 * Math.PI * R, acum = 0, segs = "";
    partes.forEach(function (p) {
      if (!p.n) return;
      var largo = (p.n / total) * C, hueco = partes.filter(function (x) { return x.n; }).length > 1 ? 2.5 : 0;
      segs += '<circle class="seg" cx="75" cy="75" r="' + R + '" fill="none" stroke="' + p.color + '" stroke-width="16" stroke-dasharray="' + Math.max(0, largo - hueco) + " " + (C - Math.max(0, largo - hueco)) + '" stroke-dashoffset="' + (-acum) + '" transform="rotate(-90 75 75)"><title>' + esc(p.nombre + ": " + p.n) + "</title></circle>";
      acum += largo;
    });
    return '<div class="ad-dona"><svg viewBox="0 0 150 150" role="img" aria-label="Estado de las operaciones">' +
      '<circle cx="75" cy="75" r="' + R + '" fill="none" stroke="#eef3f0" stroke-width="16"/>' + segs +
      '<text class="centro-n" x="75" y="78" text-anchor="middle">' + total + '</text><text class="centro-t" x="75" y="96" text-anchor="middle">operaciones</text></svg>' +
      '<ul class="ad-leyenda">' + partes.map(function (p) {
        return '<li><span class="mark" style="background:' + p.color + '"></span><span class="nom">' + esc(p.nombre) + "</span><b>" + p.n + "</b><small>" + Math.round((p.n / total) * 100) + "%</small></li>";
      }).join("") + "</ul></div>";
  }
  function barrasH(items, clic) {
    var max = Math.max.apply(null, items.map(function (i) { return i.v; }).concat([1]));
    return '<ul class="ad-barras">' + items.map(function (it, i) {
      var cuerpo = '<div class="fila"><span>' + esc(it.nombre) + "</span><b>" + esc(it.texto) + (it.extra ? "<small>" + esc(it.extra) + "</small>" : "") + '</b></div><div class="pista"><i style="width:' + Math.max(2, (it.v / max) * 100) + '%"></i></div>';
      return "<li>" + (clic ? '<button class="fila-btn" data-bar="' + i + '">' + cuerpo + "</button>" : cuerpo) + "</li>";
    }).join("") + "</ul>";
  }
  var redibujo = null;
  window.addEventListener("resize", function () {
    clearTimeout(redibujo);
    redibujo = setTimeout(function () { graficos.forEach(function (g) { dibujarGrafico.apply(null, g); }); }, 150);
  });

  /* ---------- panel lateral: detalle de una operación ---------- */
  function cerrarDrawer() { var d = $("adDrawer"); if (d) d.remove(); }
  function abrirOperacion(op) {
    cerrarDrawer();
    var c = op.user_id && datos.porId[op.user_id];
    function fila(k, v, extra) { return "<div><dt>" + esc(k) + "</dt><dd>" + esc(v || "—") + (extra || "") + "</dd></div>"; }
    var bg = document.createElement("div");
    bg.className = "ad-drawer-bg"; bg.id = "adDrawer";
    bg.innerHTML =
      '<aside class="ad-drawer" role="dialog" aria-modal="true" aria-labelledby="adDrTit">' +
        '<header><div><span class="ad-sub">Operación</span><h3 id="adDrTit">' + esc(op.codigo || "") + '</h3><div style="margin-top:8px">' + chip(op.estado) + "</div></div>" +
          '<button class="ad-cerrar" id="adDrCerrar" aria-label="Cerrar">×</button></header>' +
        '<div class="ad-drawer-cuerpo">' +
          '<div class="ad-drawer-total"><span>' + (completada(op) ? "Depositado al cliente" : pendiente(op) ? "Por depositar al cliente" : "Monto que iba a recibir") + "</span><b>" + dinero(op.neto) + "</b></div>" +
          '<p class="ad-bloque-tit">Cliente</p><dl class="ad-filas">' + fila("Nombre", op.nombre) + fila("DNI", op.documento) + fila("Celular", op.celular) + "</dl>" +
          '<p class="ad-bloque-tit">Dinero</p><dl class="ad-filas">' + fila("Cobrado a la tarjeta", dinero(op.monto)) + fila("Comisión", dinero(op.comision)) + fila("Recibe", dinero(op.neto)) + "</dl>" +
          '<p class="ad-bloque-tit">Tarjeta y cuenta de destino</p><dl class="ad-filas">' + fila("Tarjeta", (op.banco_tarjeta || "—") + " ···· " + (op.ultimos4 || "")) + fila("Banco de destino", op.banco_cuenta) +
            fila("Cuenta de destino", op.numero_cuenta, esAdmin() && op.numero_cuenta ? '<button class="ad-copiar" id="adCopiarCta">Copiar</button>' : "") + "</dl>" +
          '<p class="ad-bloque-tit">Fechas</p><dl class="ad-filas">' + fila("Solicitada", fechaHora(op.creado_en)) + fila("Depositada", op.completada_en ? fechaHora(op.completada_en) : "—") + "</dl>" +
        "</div><footer>" +
          (c ? '<button class="btn btn-outline-dark btn-sm" id="adDrFicha">Ver ficha 360°</button>' : "") +
          (esAdmin() && pendiente(op) ? '<button class="btn btn-outline-dark btn-sm" id="adDrCancelar">Cancelar</button><button class="btn btn-primary btn-sm" id="adDrOk">Marcar como pagada</button>' : "") +
        "</footer></aside>";
    document.body.appendChild(bg);
    bg.addEventListener("click", function (e) { if (e.target === bg) cerrarDrawer(); });
    $("adDrCerrar").addEventListener("click", cerrarDrawer);
    $("adDrCerrar").focus();
    if ($("adCopiarCta")) $("adCopiarCta").addEventListener("click", function () {
      try { navigator.clipboard.writeText(String(op.numero_cuenta)); IC.toast("Número de cuenta copiado.", "ok"); } catch (e) { IC.toast("No se pudo copiar.", "err"); }
    });
    if ($("adDrFicha")) $("adDrFicha").addEventListener("click", function () { cerrarDrawer(); abrirFicha(op.user_id); });
    if ($("adDrOk")) $("adDrOk").addEventListener("click", function () { confirmarCompletada(op); });
    if ($("adDrCancelar")) $("adDrCancelar").addEventListener("click", function () { confirmarCancelar(op); });
  }

  /* ---------- menú lateral en celulares ---------- */
  function cerrarMenu() { var a = $("adPanel"); if (a) a.classList.remove("menu-abierto"); }
  function irA(v) { vista = v; cerrarDrawer(); cerrarMenu(); render(); window.scrollTo({ top: 0, behavior: "smooth" }); }
  function abrirFicha(id) { fic.id = id; irA("ficha"); }

  /* ======================= PANTALLAS ======================= */

  /* ---------- Dashboard ejecutivo ---------- */
  function delta(act, ant) {
    if (ant == null) return "";
    if (!ant && !act) return '<span class="ad-delta igual">= 0%</span>';
    if (!ant) return '<span class="ad-delta sube">▲ nuevo</span>';
    var p = Math.round(((act - ant) / ant) * 100);
    if (p === 0) return '<span class="ad-delta igual">= 0%</span>';
    return '<span class="ad-delta ' + (p > 0 ? "sube" : "baja") + '">' + (p > 0 ? "▲ " : "▼ ") + Math.abs(p) + "%</span>";
  }
  function kpi(icono, titulo, valor, nota, clase) {
    return '<div class="ad-kpi' + (clase ? " " + clase : "") + '"><div class="tit"><i>' + icono + "</i>" + esc(titulo) + "</div><b>" + valor + "</b><small>" + nota + "</small></div>";
  }
  function vistaInicio(cont) {
    var l = limitesEfectivos(dash.rango), conAnterior = dash.rango.clave !== "todo";
    var la = [new Date(l[0].getTime() - (l[1] - l[0])), l[0]];
    var enR = datos.ops.filter(function (o) { return enLimites(o.creado_en, l); });
    var enA = conAnterior ? datos.ops.filter(function (o) { return enLimites(o.creado_en, la); }) : [];
    var comp = enR.filter(completada), compA = enA.filter(completada);
    var nuevos = datos.clientes.filter(function (c) { return enLimites(c.perfil.creado_en, l); });
    var nuevosA = conAnterior ? datos.clientes.filter(function (c) { return enLimites(c.perfil.creado_en, la); }).length : null;
    var ticket = comp.length ? sumar(comp, "monto") / comp.length : 0;
    var vs = conAnterior ? " vs. periodo anterior" : "desde el inicio";

    var g = granularidad(dash.gran, l[0], l[1]);
    var cubos = agrupar(comp, g.gran, l[0], l[1]);

    /* embudo de los clientes que se registraron en el periodo */
    var conDni = nuevos.filter(function (c) { return c.docs.length; }).length;
    var verif = nuevos.filter(function (c) { return estadoIdentidad(c) === "verificado"; }).length;
    var conOp = nuevos.filter(function (c) { return c.ops.length; }).length;
    var conPago = nuevos.filter(function (c) { return c.ops.some(completada); }).length;
    var pct = function (n) { return nuevos.length ? Math.round((n / nuevos.length) * 100) + "%" : "—"; };

    /* mejores clientes del periodo */
    var porCliente = {};
    comp.forEach(function (o) { var k = o.user_id || o.documento; porCliente[k] = porCliente[k] || { id: o.user_id, nombre: o.nombre, monto: 0, n: 0 }; porCliente[k].monto += Number(o.monto || 0); porCliente[k].n++; });
    var top = Object.keys(porCliente).map(function (k) { return porCliente[k]; }).sort(function (a, b) { return b.monto - a.monto; }).slice(0, 5);

    /* lo que requiere atención (ahora mismo, no depende del periodo) */
    var items = datos.pendientes.map(function (p) { return { f: p.fila.creado_en, tipo: "rev", p: p, t: (p.clase === "identidad" ? "Revisar identidad · " : "Revisar tarjeta · ") + nombre(p.cliente) }; })
      .concat(datos.ops.filter(pendiente).map(function (o) { return { f: o.creado_en, tipo: "pago", o: o, t: "Depositar " + (o.codigo || "") + " · " + (o.nombre || ""), m: dinero(o.neto) }; }))
      .sort(function (a, b) { return new Date(a.f) - new Date(b.f); });

    cont.innerHTML =
      '<div class="ad-kpis">' +
        kpi(ICO.soles, "Efectivizado", dinero(sumar(comp, "monto")), (conAnterior ? delta(sumar(comp, "monto"), sumar(compA, "monto")) : "") + esc(vs)) +
        kpi(ICO.estrella, "Comisiones ganadas", dinero(sumar(comp, "comision")), (conAnterior ? delta(sumar(comp, "comision"), sumar(compA, "comision")) : "") + esc(vs), "oscuro") +
        kpi(ICO.check, "Operaciones completadas", String(comp.length), (conAnterior ? delta(comp.length, compA.length) : "") + "ticket promedio " + esc(dinero(ticket))) +
        kpi(ICO.persona, "Clientes nuevos", String(nuevos.length), (conAnterior ? delta(nuevos.length, nuevosA) : "") + esc(vs)) +
      "</div>" +
      '<div class="ad-grid ad-g-2-1 ad-espacio-abajo">' +
        '<section class="ad-card"><div class="ad-card-tit"><div><h3>' + { monto: "Monto efectivizado", comision: "Comisiones ganadas", ops: "Operaciones completadas" }[dash.metrica] + "</h3><p>" + esc(nombreRango(dash.rango)) + " · por " + { dia: "día", semana: "semana", mes: "mes" }[g.gran] + "</p></div>" +
          '<div class="der">' + seg("adDashMet", [["monto", "Monto"], ["comision", "Comisión"], ["ops", "Operaciones"]], dash.metrica) +
          seg("adDashGran", [["dia", "Días"], ["semana", "Semanas"], ["mes", "Meses"]], g.gran) + "</div></div>" +
          '<div class="ad-grafico" id="adGrafDash"></div>' + (g.nota ? '<p class="ad-nota-graf">' + esc(g.nota) + "</p>" : "") + "</section>" +
        '<section class="ad-card"><div class="ad-card-tit"><div><h3>Requiere atención</h3><p>' + (items.length ? plural(items.length, "pendiente", "pendientes") + " ahora · primero lo más antiguo" : "Nada pendiente ahora") + "</p></div></div>" +
          (items.length ? '<ul class="ad-lista">' + items.slice(0, 7).map(function (it, i) {
            return '<li><button data-at="' + i + '"><span class="ic' + (it.tipo === "rev" ? " id" : "") + '">' + (it.tipo === "rev" ? ICO.doc : ICO.deposito) + '</span><span class="txt"><b>' + esc(it.t) + "</b><span>" + esc(hace(it.f)) + "</span></span>" +
              (it.m ? '<span class="der">' + esc(it.m) + "</span>" : "") + ICO.chev + "</button></li>";
          }).join("") + "</ul>" + (items.length > 7 ? '<p class="ad-sub" style="margin-top:8px">y ' + (items.length - 7) + " más</p>" : "")
          : '<div class="ad-todo-ok"><b>✓</b>Todo al día</div>') + "</section>" +
      "</div>" +
      '<div class="ad-grid ad-g-3">' +
        '<section class="ad-card"><div class="ad-card-tit"><div><h3>Estado de las operaciones</h3><p>Solicitadas en el periodo</p></div></div>' +
          dona([{ nombre: "Completadas", n: comp.length, color: "#22c55e" }, { nombre: "Pendientes de pago", n: enR.filter(pendiente).length, color: "#f59e0b" }, { nombre: "Canceladas", n: enR.filter(cancelada).length, color: "#ef4444" }]) + "</section>" +
        '<section class="ad-card"><div class="ad-card-tit"><div><h3>Embudo de clientes</h3><p>De los ' + plural(nuevos.length, "cliente nuevo", "clientes nuevos") + " del periodo</p></div></div>" +
          (nuevos.length ? barrasH([
            { nombre: "Se registraron", v: nuevos.length, texto: String(nuevos.length), extra: "100%" },
            { nombre: "Subieron su DNI", v: conDni, texto: String(conDni), extra: pct(conDni) },
            { nombre: "Identidad verificada", v: verif, texto: String(verif), extra: pct(verif) },
            { nombre: "Pidieron una operación", v: conOp, texto: String(conOp), extra: pct(conOp) },
            { nombre: "Completaron una operación", v: conPago, texto: String(conPago), extra: pct(conPago) }
          ]) : '<div class="ad-grafico-vacio" style="min-height:150px">Sin clientes nuevos en este periodo.</div>') + "</section>" +
        '<section class="ad-card"><div class="ad-card-tit"><div><h3>Mejores clientes</h3><p>Por monto efectivizado en el periodo</p></div></div>' +
          (top.length ? barrasH(top.map(function (t) { return { nombre: t.nombre || "Cliente", v: t.monto, texto: dinero(t.monto), extra: plural(t.n, "op.", "ops.") }; }), true)
                      : '<div class="ad-grafico-vacio" style="min-height:150px">Sin operaciones completadas en este periodo.</div>') + "</section>" +
      "</div>";

    graficos = [["adGrafDash", cubos, g.gran, dash.metrica]];
    dibujarGrafico("adGrafDash", cubos, g.gran, dash.metrica);
    enlazarSeg("adDashMet", function (v) { dash.metrica = v; render(); });
    enlazarSeg("adDashGran", function (v) { dash.gran = v; render(); });
    cont.querySelectorAll("[data-at]").forEach(function (b) {
      b.addEventListener("click", function () { var it = items[+b.dataset.at]; if (it.tipo === "pago") abrirOperacion(it.o); else { pend.tipo = "todo"; irA("pendientes"); } });
    });
    cont.querySelectorAll("[data-bar]").forEach(function (b) {
      b.addEventListener("click", function () { var t = top[+b.dataset.bar]; if (t && t.id && datos.porId[t.id]) abrirFicha(t.id); });
    });
  }

  /* ---------- Por revisar ---------- */
  function tarjetaPendiente(item, i) {
    var p = (item.cliente && item.cliente.perfil) || {}, f = item.fila;
    var fotos = item.clase === "identidad"
      ? [["DNI — frente", f.dni_frontal, f.tiene_dni_frontal], ["DNI — reverso", f.dni_posterior, f.tiene_dni_posterior], ["Selfie", f.selfie, f.tiene_selfie]]
      : [["Tarjeta (frente) o estado de cuenta", f.foto_frontal, f.tiene_foto_frontal]].concat(f.foto_posterior || f.tiene_foto_posterior ? [["Tarjeta — reverso", f.foto_posterior, f.tiene_foto_posterior]] : []);
    return '<article class="ad-card"><header class="ad-card-head"><div>' +
        '<span class="ad-tipo ' + (item.clase === "identidad" ? "t-id" : "t-card") + '">' + (item.clase === "identidad" ? "Identidad" : "Tarjeta") + "</span>" +
        "<h3>" + esc(nombre(item.cliente)) + "</h3>" +
        '<p class="ad-meta">' + esc(p.tipo_doc || "DNI") + " " + esc(p.documento || "—") + " · " + esc(p.celular || "sin celular") + " · enviado " + esc(hace(f.creado_en)) + "</p>" +
      "</div><div>" + chip(f.estado) + "</div></header>" +
      (item.clase === "tarjeta" ? '<p class="ad-detalle"><b>' + esc(f.banco || "") + "</b> " + esc(f.marca || "") + " ···· " + esc(f.ultimos4 || "") + " · Titular: " + esc(f.titular || "—") + "</p>" : "") +
      (!verFotos()
        ? '<ul class="ad-recibidos">' + fotos.map(function (x) { return '<li class="' + (x[2] ? "si" : "no") + '">' + (x[2] ? "✓ " : "✗ ") + esc(x[0]) + "</li>"; }).join("") + "</ul>"
        : '<div class="ad-fotos">' + fotos.map(function (x) { return "<figure><figcaption>" + esc(x[0]) + '</figcaption><div class="ad-foto" data-foto="' + esc(x[1] || "") + '"><span class="ad-cargando"></span></div></figure>'; }).join("") + "</div>") +
      '<footer class="ad-acciones"><button class="btn btn-outline-dark btn-sm" data-ficha-p="' + i + '">Ver ficha 360°</button>' +
        (esAdmin()
          ? '<div class="ad-acciones-der"><button class="btn btn-outline-dark btn-sm ad-wa" data-wa="' + i + '" title="Escribir por WhatsApp" aria-label="Escribir por WhatsApp">' + ICO.wa + "</button>" +
            '<button class="btn btn-danger btn-sm" data-no="' + i + '">Rechazar</button><button class="btn btn-primary btn-sm" data-si="' + i + '">Aprobar</button></div>'
          : '<span class="ad-sub">' + (verFotos() ? "Solo el administrador aprueba o rechaza." : "Solo el administrador ve las fotos y aprueba.") + "</span>") +
      "</footer></article>";
  }
  function vistaPendientes(cont) {
    var todos = datos.pendientes, nId = todos.filter(function (p) { return p.clase === "identidad"; }).length;
    if (!todos.length) { cont.innerHTML = '<div class="ad-vacio"><div class="ad-vacio-ico">✓</div><h3>Todo al día</h3><p>No hay solicitudes esperando revisión.</p></div>'; return; }
    var lista = todos.filter(function (p) { return pend.tipo === "todo" || (pend.tipo === "id" ? p.clase === "identidad" : p.clase === "tarjeta"); });
    cont.innerHTML =
      '<div class="ad-barra">' + seg("adPendTipo", [["todo", "Todo (" + todos.length + ")"], ["id", "Identidad (" + nId + ")"], ["tarj", "Tarjetas (" + (todos.length - nId) + ")"]], pend.tipo) +
        '<span class="ad-sub" style="margin-left:auto">Primero lo que más tiempo lleva esperando</span></div>' +
      (lista.length ? '<div class="ad-revision">' + lista.map(function (it) { return tarjetaPendiente(it, todos.indexOf(it)); }).join("") + "</div>" : '<div class="ad-vacio"><h3>Nada en esta categoría</h3></div>');
    enlazarSeg("adPendTipo", function (v) { pend.tipo = v; render(); });
    if (verFotos()) pintarFotos(cont);
    cont.querySelectorAll("[data-si]").forEach(function (b) { b.addEventListener("click", function () { accion(function () { return decidir(todos[+b.dataset.si], true); }, b); }); });
    cont.querySelectorAll("[data-no]").forEach(function (b) { b.addEventListener("click", function () { pedirMotivo(todos[+b.dataset.no]); }); });
    cont.querySelectorAll("[data-wa]").forEach(function (b) { b.addEventListener("click", function () { var it = todos[+b.dataset.wa]; waCliente(it.cliente ? it.cliente.perfil : null); }); });
    cont.querySelectorAll("[data-ficha-p]").forEach(function (b) { b.addEventListener("click", function () { var it = todos[+b.dataset.fichaP]; if (it.cliente) abrirFicha(it.cliente.id); }); });
  }

  /* ---------- Clientes ---------- */
  function listaClientes() {
    var q = cli.q.trim().toLowerCase();
    var l = datos.clientes.filter(function (c) {
      var ide = estadoIdentidad(c);
      if (cli.filtro === "pendientes" && !(ide === "en_revision" || ide === "rechazado" || c.tarjetas.some(function (t) { return t.estado === "en_revision"; }))) return false;
      if (cli.filtro === "verificados" && ide !== "verificado") return false;
      if (cli.filtro === "sin_dni" && ide !== "sin_subir") return false;
      if (!q) return true;
      return (nombre(c) + " " + (c.perfil.documento || "") + " " + (c.perfil.celular || "") + " " + (c.perfil.email || "")).toLowerCase().indexOf(q) >= 0;
    });
    var f = { nombre: function (a, b) { return nombre(a).localeCompare(nombre(b), "es"); },
      registro: function (a, b) { return new Date(a.perfil.creado_en) - new Date(b.perfil.creado_en); },
      ops: function (a, b) { return a.ops.length - b.ops.length; },
      monto: function (a, b) { return sumar(a.ops.filter(completada), "monto") - sumar(b.ops.filter(completada), "monto"); } }[cli.orden];
    return l.sort(function (a, b) { return f(a, b) * cli.dir; });
  }
  function vistaClientes(cont) {
    if (!datos.clientes.length) { cont.innerHTML = '<div class="ad-vacio"><h3>Aún no hay clientes</h3><p>Aparecerán aquí en cuanto alguien se registre.</p></div>'; return; }
    var lista = listaClientes(), vis = pagina(lista, cli);
    var cuenta = function (fn) { return datos.clientes.filter(fn).length; };
    var filtros = [["todos", "Todos", datos.clientes.length],
      ["pendientes", "Por revisar", cuenta(function (c) { var i = estadoIdentidad(c); return i === "en_revision" || i === "rechazado" || c.tarjetas.some(function (t) { return t.estado === "en_revision"; }); })],
      ["verificados", "Verificados", cuenta(function (c) { return estadoIdentidad(c) === "verificado"; })],
      ["sin_dni", "Sin DNI", cuenta(function (c) { return estadoIdentidad(c) === "sin_subir"; })]];
    cont.innerHTML =
      '<div class="ad-barra"><div class="ad-buscador">' + ICO.buscar + '<input id="adBuscarCli" type="search" aria-label="Buscar clientes" placeholder="' + (esConsulta() ? "Buscar por nombre o DNI" : "Buscar por nombre, DNI, celular o correo") + '" value="' + esc(cli.q) + '"></div>' +
        '<div class="ad-filtros">' + filtros.map(function (f) { return '<button class="ad-filtro' + (cli.filtro === f[0] ? " on" : "") + '" data-f="' + f[0] + '">' + f[1] + '<span class="n">' + f[2] + "</span></button>"; }).join("") + "</div>" +
        (esAdmin() ? '<button class="ad-boton-sec ad-excel" id="adExpCli">' + ICO.excel + "<span>Excel</span></button>" : "") + "</div>" +
      (lista.length
        ? '<div class="ad-tabla-wrap"><table class="ad-tabla cards"><thead><tr>' + th("Cliente", "nombre", cli) + th("Documento") + th("Celular") + th("Identidad") + th("Operaciones", "ops", cli, "centro") + th("Efectivizado", "monto", cli, "dinero") + th("Cliente desde", "registro", cli) + "</tr></thead><tbody>" +
            vis.map(function (c) {
              return '<tr class="fila-link" tabindex="0" data-k="' + esc(c.id) + '"><td data-label="Cliente"><div class="ad-celda-persona">' + avatarHTML(nombre(c), null, "chico") + "<div><b>" + esc(nombre(c)) + "</b>" + (c.perfil.email ? '<span class="ad-sub">' + esc(c.perfil.email) + "</span>" : "") + "</div></div></td>" +
                '<td class="nowrap" data-label="Documento">' + esc((c.perfil.tipo_doc || "DNI") + " " + (c.perfil.documento || "")) + '</td><td class="nowrap" data-label="Celular">' + esc(c.perfil.celular || "—") + "</td>" +
                '<td data-label="Identidad">' + chip(estadoIdentidad(c)) + '</td><td class="centro" data-label="Operaciones"><b>' + c.ops.length + "</b></td>" +
                '<td class="dinero" data-label="Efectivizado">' + dinero(sumar(c.ops.filter(completada), "monto")) + '</td><td class="fecha" data-label="Cliente desde">' + esc(fecha(c.perfil.creado_en)) + "</td></tr>";
            }).join("") + "</tbody></table></div>" + paginador(lista.length, cli, "cli", ["cliente", "clientes"])
        : '<div class="ad-vacio"><h3>Sin resultados</h3><p>Prueba con otro nombre o quita los filtros.</p></div>');
    enlazarBuscador("adBuscarCli", function (v) { cli.q = v; cli.pag = 1; });
    cont.querySelectorAll("[data-f]").forEach(function (b) { b.addEventListener("click", function () { cli.filtro = b.dataset.f; cli.pag = 1; render(); }); });
    if ($("adExpCli")) $("adExpCli").addEventListener("click", function () { descargarCSV("clientes-" + isoLocal(new Date()), filasClientes(lista)); });
    enlazarOrden(cont, cli); enlazarPaginador(cont, "cli", cli);
    filasClicables(cont, abrirFicha);
  }

  /* ---------- Ficha 360° del cliente ---------- */
  function vistaFicha(cont) {
    var c = datos.porId[fic.id];
    if (!c) { vista = "clientes"; render(); return; }
    var p = c.perfil, idn = c.docs[0], comp = c.ops.filter(completada), pp = c.ops.filter(pendiente);
    var ultimaOp = c.ops.slice().sort(function (a, b) { return new Date(b.creado_en) - new Date(a.creado_en); })[0];
    function fila(k, v) { return "<div><dt>" + esc(k) + "</dt><dd>" + esc(v || "—") + "</dd></div>"; }
    function fotosHTML(l) { return '<div class="ad-fotos">' + l.map(function (x) { return "<figure><figcaption>" + esc(x[0]) + '</figcaption><div class="ad-foto" data-foto="' + esc(x[1]) + '"><span class="ad-cargando"></span></div></figure>'; }).join("") + "</div>"; }

    var avisos = [];
    if (!idn) avisos.push(["", "Todavía no subió su DNI ni su selfie."]);
    else if (idn.estado === "en_revision") avisos.push(["warn", "Su identidad espera revisión desde " + fechaHora(idn.creado_en) + "."]);
    else if (idn.estado === "rechazado") avisos.push(["err", "Identidad rechazada" + (idn.motivo ? ": «" + idn.motivo + "»" : "") + "."]);
    c.tarjetas.filter(function (t) { return t.estado === "en_revision"; }).forEach(function (t) { avisos.push(["warn", "Tarjeta " + (t.banco || "") + " ····" + (t.ultimos4 || "") + " espera revisión."]); });
    if (pp.length) avisos.push(["warn", plural(pp.length, "operación pendiente", "operaciones pendientes") + " de pago por " + dinero(sumar(pp, "neto")) + "."]);
    if (esAdmin()) {
      var cel = String(p.celular || "").replace(/\D/g, ""), mail = String(p.email || "").toLowerCase();
      datos.clientes.forEach(function (o) {
        if (o.id === c.id) return;
        var oc = String(o.perfil.celular || "").replace(/\D/g, ""), om = String(o.perfil.email || "").toLowerCase();
        if ((cel && oc === cel) || (mail && om === mail)) avisos.push(["err", "Posible duplicado: " + nombre(o) + " (" + (o.perfil.documento || "sin DNI") + ") usa el mismo " + (cel && oc === cel ? "celular" : "correo") + "."]);
      });
    }
    var linea = [];
    if (esAdmin() && hay.historial) datos.historial.filter(function (x) { return x.cliente_id === c.id; }).forEach(function (x) { linea.push([x.creado_en, (x.actor_email || (x.actor_rol === "cliente" ? "El cliente" : "Sistema")) + " " + textoAccion(x) + detalleAccion(x), false]); });
    linea.push([p.creado_en, "Se registró", true]);
    c.docs.forEach(function (d) { linea.push([d.creado_en, "Subió su DNI y selfie", true]); });
    c.tarjetas.forEach(function (t) { linea.push([t.creado_en, "Registró la tarjeta " + (t.banco || "") + " ····" + (t.ultimos4 || ""), true]); });
    c.ops.forEach(function (o) { linea.push([o.creado_en, "Pidió la operación " + (o.codigo || "") + " por " + dinero(o.monto), true]); if (o.completada_en && !(esAdmin() && hay.historial)) linea.push([o.completada_en, "Operación " + (o.codigo || "") + " pagada", false]); });
    linea.sort(function (a, b) { return new Date(b[0]) - new Date(a[0]); });
    var fotosId = idn ? [["DNI — frente", idn.dni_frontal, idn.tiene_dni_frontal], ["DNI — reverso", idn.dni_posterior, idn.tiene_dni_posterior], ["Selfie", idn.selfie, idn.tiene_selfie]] : [];

    cont.innerHTML =
      '<button class="ad-boton-sec ad-volver" id="adVolver">‹ Volver a clientes</button>' +
      '<section class="ad-card"><div class="ad-360-cab">' + avatarHTML(nombre(c), null, "grande") +
        '<div class="quien"><h2>' + esc(nombre(c)) + '</h2><p class="ad-meta">' + esc((p.tipo_doc || "DNI") + " " + (p.documento || "")) + " · " + esc(p.celular || "sin celular") + " · " + esc(p.email || "sin correo") + "</p>" +
          '<div class="chips">' + chip(estadoIdentidad(c)) + '<span class="ad-chip">Cliente desde ' + esc(fecha(p.creado_en)) + '</span><span class="ad-chip">Activo ' + esc(hace(c.ultima)) + "</span></div></div>" +
        (esAdmin() ? '<button class="btn btn-outline-dark btn-sm ad-wa" id="adWaFicha">' + ICO.wa + " WhatsApp</button>" : "") + "</div>" +
        '<div class="ad-360-kpis"><div><span>Efectivizado</span><b>' + dinero(sumar(comp, "monto")) + "</b></div><div><span>Comisión generada</span><b>" + dinero(sumar(comp, "comision")) + "</b></div>" +
          "<div><span>Operaciones</span><b>" + comp.length + " de " + c.ops.length + "</b></div><div><span>Ticket promedio</span><b>" + dinero(comp.length ? sumar(comp, "monto") / comp.length : 0) + "</b></div>" +
          "<div><span>Última operación</span><b>" + esc(ultimaOp ? fecha(ultimaOp.creado_en) : "—") + "</b></div></div></section>" +
      '<div class="ad-360">' +
        "<div>" +
          '<section class="ad-card"><div class="ad-card-tit"><div><h3>Identidad y documentos</h3><p>DNI, selfie y tarjetas registradas</p></div></div>' +
            (idn ? '<p class="ad-detalle" style="margin-top:0">' + chip(idn.estado) + " Enviado el " + esc(fechaHora(idn.creado_en)) + (idn.revisado_en ? " · revisado el " + esc(fechaHora(idn.revisado_en)) : "") + "</p>" +
                (!verFotos() ? '<ul class="ad-recibidos">' + fotosId.map(function (x) { return '<li class="' + (x[2] ? "si" : "no") + '">' + (x[2] ? "✓ " : "✗ ") + esc(x[0]) + "</li>"; }).join("") + "</ul>"
                              : fotosHTML(fotosId.filter(function (x) { return x[1]; })))
                 : '<p class="ad-sub">Todavía no subió su DNI ni su selfie.</p>') +
            '<p class="ad-bloque-tit">Tarjetas</p>' +
            (c.tarjetas.length ? c.tarjetas.map(function (t) {
              var fs = [["Frente o estado de cuenta", t.foto_frontal], ["Reverso", t.foto_posterior]].filter(function (x) { return x[1]; });
              return '<div class="ad-sub-bloque"><p class="ad-detalle" style="margin:0"><b>' + esc(t.banco || "") + "</b> " + esc(t.marca || "") + " ····" + esc(t.ultimos4 || "") + " · Titular: " + esc(t.titular || "—") + (t.principal ? " · principal" : "") + " " + chip(t.estado) + "</p>" +
                (verFotos() && fs.length ? fotosHTML(fs) : "") + "</div>";
            }).join("") : '<p class="ad-sub">Todavía no registró ninguna tarjeta.</p>') +
            '<p class="ad-bloque-tit">Cuentas donde recibe el dinero</p>' +
            (c.cuentas.length ? c.cuentas.map(function (a) { return '<dl class="ad-filas ad-sub-bloque">' + fila("Banco", a.banco) + fila("Número", a.numero) + fila("Tipo", (a.tipo || "") + " · " + (a.moneda || "")) + (esAdmin() ? fila("CCI", a.cci) : "") + fila("Titular", a.titular) + "</dl>"; }).join("")
                              : '<p class="ad-sub">Todavía no registró ninguna cuenta.</p>') +
          "</section>" +
          '<section class="ad-card"><div class="ad-card-tit"><div><h3>Operaciones</h3><p>' + plural(c.ops.length, "operación", "operaciones") + " · toca una para ver el detalle</p></div></div>" +
            (c.ops.length ? '<div class="ad-tabla-wrap plano"><table class="ad-tabla cards"><thead><tr><th>Código</th><th class="dinero">Monto</th><th class="dinero">Recibe</th><th>Estado</th><th>Fecha</th></tr></thead><tbody>' +
              c.ops.map(function (o, i) {
                return '<tr class="fila-link" tabindex="0" data-k="' + i + '"><td data-label="Código"><b>' + esc(o.codigo || "") + '</b></td><td class="dinero" data-label="Monto">' + dinero(o.monto) + '</td><td class="dinero" data-label="Recibe"><b>' + dinero(o.neto) + '</b></td><td data-label="Estado">' + chip(o.estado) + '</td><td class="fecha" data-label="Fecha">' + esc(fecha(o.creado_en)) + "</td></tr>";
              }).join("") + "</tbody></table></div>" : '<p class="ad-sub">Todavía no hizo ninguna operación.</p>') +
          "</section>" +
        "</div><div>" +
          (avisos.length ? '<section class="ad-card"><div class="ad-card-tit"><div><h3>Alertas</h3></div></div><ul class="ad-avisos">' + avisos.map(function (a) { return '<li class="' + a[0] + '">' + esc(a[1]) + "</li>"; }).join("") + "</ul></section>" : "") +
          '<section class="ad-card"><div class="ad-card-tit"><div><h3>Notas internas</h3><p>' + (esAdmin() ? "Las ve todo el equipo. No se editan ni se borran." : "Escritas por el administrador") + "</p></div></div>" +
            (!hay.notas ? '<p class="ad-sub">Las notas se activan al ejecutar supabase-equipo-consulta.sql en Supabase.</p>'
              : (esAdmin() ? '<div class="ad-nota-form"><label for="adNota" class="sr-only">Nueva nota</label><textarea id="adNota" rows="2" maxlength="2000" placeholder="Ej. Llamó hoy: prefiere que lo contacten por la tarde."></textarea><button class="btn btn-primary btn-sm" id="adGuardarNota">Guardar nota</button></div>' : "") +
                (c.notas.length ? '<ul class="ad-notas">' + c.notas.map(function (n) { return "<li><p>" + esc(n.texto) + '</p><span class="ad-sub">' + esc(n.autor_email || "Equipo") + " · " + esc(fechaHora(n.creado_en)) + "</span></li>"; }).join("") + "</ul>" : '<p class="ad-sub" style="margin-top:10px">Sin notas todavía.</p>')) +
          "</section>" +
          '<section class="ad-card"><div class="ad-card-tit"><div><h3>Línea de tiempo</h3><p>Todo lo que pasó con este cliente</p></div></div><ul class="ad-linea">' +
            linea.slice(0, 30).map(function (x) { return '<li class="' + (x[2] ? "gris" : "") + '">' + esc(x[1]) + "<time>" + esc(fechaHora(x[0])) + "</time></li>"; }).join("") + "</ul></section>" +
        "</div></div>";

    if (verFotos()) pintarFotos(cont);
    $("adVolver").addEventListener("click", function () { irA("clientes"); });
    if ($("adWaFicha")) $("adWaFicha").addEventListener("click", function () { waCliente(p); });
    filasClicables(cont, function (k) { abrirOperacion(c.ops[+k]); });
    if ($("adGuardarNota")) $("adGuardarNota").addEventListener("click", function () {
      var t = $("adNota").value.trim();
      if (!t) { IC.toast("Escribe la nota primero.", "err"); $("adNota").focus(); return; }
      guardarNota(c, t, this);
    });
  }

  /* ---------- Operaciones (lista de trabajo) ---------- */
  function vistaOps(cont) {
    var enR = datos.ops.filter(function (o) { return enRango(o.creado_en, ops.rango); });
    var q = ops.q.trim().toLowerCase();
    var lista = enR.filter(function (o) {
      if (ops.filtro === "pend_pago" && !pendiente(o)) return false;
      if (ops.filtro === "completada" && !completada(o)) return false;
      if (ops.filtro === "cancelada" && !cancelada(o)) return false;
      if (!q) return true;
      return ((o.codigo || "") + " " + (o.nombre || "") + " " + (o.documento || "") + " " + (o.banco_tarjeta || "") + " " + (o.ultimos4 || "")).toLowerCase().indexOf(q) >= 0;
    });
    var f = { fecha: function (a, b) { return new Date(a.creado_en) - new Date(b.creado_en); }, monto: function (a, b) { return Number(a.monto) - Number(b.monto); }, codigo: function (a, b) { return String(a.codigo).localeCompare(String(b.codigo)); } }[ops.orden];
    lista.sort(function (a, b) { return f(a, b) * ops.dir; });
    var vis = pagina(lista, ops);
    var filtros = [["todas", "Todas", enR.length], ["pend_pago", "Por pagar", enR.filter(pendiente).length], ["completada", "Completadas", enR.filter(completada).length], ["cancelada", "Canceladas", enR.filter(cancelada).length]];
    cont.innerHTML =
      '<div class="ad-barra"><div class="ad-buscador">' + ICO.buscar + '<input id="adBuscarOps" type="search" aria-label="Buscar operaciones" placeholder="Buscar por código, cliente, DNI o tarjeta" value="' + esc(ops.q) + '"></div>' +
        '<div class="ad-filtros">' + filtros.map(function (x) { return '<button class="ad-filtro' + (ops.filtro === x[0] ? " on" : "") + '" data-fo="' + x[0] + '">' + x[1] + '<span class="n">' + x[2] + "</span></button>"; }).join("") + "</div>" +
        (esAdmin() ? '<button class="ad-boton-sec ad-excel" id="adExpOps">' + ICO.excel + "<span>Excel</span></button>" : "") + "</div>" +
      (lista.length
        ? '<div class="ad-tabla-wrap"><table class="ad-tabla cards"><thead><tr>' + th("Código", "codigo", ops) + th("Cliente") + th("Monto", "monto", ops, "dinero") + th("Comisión", null, null, "dinero") + th("Recibe", null, null, "dinero") + th("Estado") + th("Fecha", "fecha", ops) + (esAdmin() ? th("") : "") + "</tr></thead><tbody>" +
            vis.map(function (o, i) {
              return '<tr class="fila-link" tabindex="0" data-k="' + i + '"><td data-label="Código"><b>' + esc(o.codigo || "") + '</b></td><td data-label="Cliente">' + esc(o.nombre || "") + '<span class="ad-sub">' + esc(o.documento || "") + "</span></td>" +
                '<td class="dinero" data-label="Monto">' + dinero(o.monto) + '</td><td class="dinero" data-label="Comisión">' + dinero(o.comision) + '</td><td class="dinero" data-label="Recibe"><b>' + dinero(o.neto) + "</b></td>" +
                '<td data-label="Estado">' + chip(o.estado) + '</td><td class="fecha" data-label="Fecha">' + esc(fecha(o.creado_en)) + "</td>" +
                (esAdmin() ? '<td data-label="">' + (pendiente(o) ? '<button class="btn btn-primary btn-sm" data-pagar="' + i + '">Depositar</button>' : '<span class="ad-sub">Ver ›</span>') + "</td>" : "") + "</tr>";
            }).join("") + "</tbody></table></div>" + paginador(lista.length, ops, "ops", ["operación", "operaciones"])
        : '<div class="ad-vacio"><h3>Sin operaciones</h3><p>Prueba con otro periodo, otro código o quita los filtros.</p></div>');
    enlazarBuscador("adBuscarOps", function (v) { ops.q = v; ops.pag = 1; });
    cont.querySelectorAll("[data-fo]").forEach(function (b) { b.addEventListener("click", function () { ops.filtro = b.dataset.fo; ops.pag = 1; render(); }); });
    if ($("adExpOps")) $("adExpOps").addEventListener("click", function () { descargarCSV("operaciones-" + sufijoRango(ops.rango), filasOperaciones(lista)); });
    enlazarOrden(cont, ops); enlazarPaginador(cont, "ops", ops);
    filasClicables(cont, function (k) { abrirOperacion(vis[+k]); });
    cont.querySelectorAll("[data-pagar]").forEach(function (b) { b.addEventListener("click", function () { abrirOperacion(vis[+b.dataset.pagar]); }); });
  }

  /* ---------- Reportes: tabla por periodo + descargas (sin repetir el dashboard) ---------- */
  function vistaReportes(cont) {
    var l = limitesEfectivos(rep.rango), g = granularidad(rep.agrupar, l[0], l[1]);
    var enR = datos.ops.filter(function (o) { return enLimites(o.creado_en, l); });
    var cubos = agrupar(enR, g.gran, l[0], l[1]).filter(function (c) { return c.n; });
    var comp = enR.filter(completada), cc = enR.filter(cancelada), pp = enR.filter(pendiente);
    var nuevos = datos.clientes.filter(function (c) { return enLimites(c.perfil.creado_en, l); });
    var nomG = { dia: "día", semana: "semana", mes: "mes" }[g.gran];
    cont.innerHTML =
      '<section class="ad-card"><div class="ad-card-tit"><div><h3>Resumen por ' + nomG + "</h3><p>" + esc(nombreRango(rep.rango)) + " · por fecha de la operación</p></div>" +
        '<div class="der">' + seg("adRepGran", [["dia", "Días"], ["semana", "Semanas"], ["mes", "Meses"]], g.gran) +
          (esAdmin() ? '<button class="ad-boton-sec ad-excel" id="adExpResumen">' + ICO.excel + "<span>Descargar tabla</span></button>" : "") + "</div></div>" +
        (g.nota ? '<p class="ad-nota-graf" style="margin:-6px 0 12px">' + esc(g.nota) + "</p>" : "") +
        '<div class="ad-tabla-wrap plano"><table class="ad-tabla cards"><thead><tr><th>Periodo</th><th class="centro">Solicitudes</th><th class="centro">Completadas</th><th class="centro">Pendientes</th><th class="centro">Canceladas</th><th class="dinero">Efectivizado</th><th class="dinero">Comisión</th><th class="dinero">Depositado</th></tr></thead><tbody>' +
          cubos.slice().reverse().map(function (c) {
            return '<tr><td data-label="Periodo"><b>' + esc(etiquetaCubo(c, g.gran, true)) + '</b></td><td class="centro" data-label="Solicitudes">' + c.n + '</td><td class="centro" data-label="Completadas">' + c.comp + '</td><td class="centro" data-label="Pendientes">' + c.pend +
              '</td><td class="centro" data-label="Canceladas">' + c.canc + '</td><td class="dinero" data-label="Efectivizado"><b>' + dinero(c.monto) + '</b></td><td class="dinero" data-label="Comisión">' + dinero(c.comision) + '</td><td class="dinero" data-label="Depositado">' + dinero(c.neto) + "</td></tr>";
          }).join("") +
        '</tbody><tfoot><tr><td data-label="">Total del periodo</td><td class="centro" data-label="Solicitudes">' + enR.length + '</td><td class="centro" data-label="Completadas">' + comp.length + '</td><td class="centro" data-label="Pendientes">' + pp.length +
          '</td><td class="centro" data-label="Canceladas">' + cc.length + '</td><td class="dinero" data-label="Efectivizado">' + dinero(sumar(comp, "monto")) + '</td><td class="dinero" data-label="Comisión">' + dinero(sumar(comp, "comision")) + '</td><td class="dinero" data-label="Depositado">' + dinero(sumar(comp, "neto")) + "</td></tr></tfoot></table></div>" +
        (enR.length ? "" : '<p class="ad-sub" style="margin-top:12px">No hay operaciones en este periodo.</p>') + "</section>" +
      '<section class="ad-card"><div class="ad-card-tit"><div><h3>Descargas para Excel</h3><p>Del periodo elegido: ' + esc(nombreRango(rep.rango)) + "</p></div></div>" +
        (esAdmin()
          ? '<div class="ad-filtros"><button class="ad-boton-sec ad-excel" id="adExpRepOps">' + ICO.excel + "<span>Operaciones (" + enR.length + ")</span></button>" +
            '<button class="ad-boton-sec ad-excel" id="adExpRepCli">' + ICO.excel + "<span>Clientes nuevos (" + nuevos.length + ")</span></button></div>"
          : '<p class="ad-sub">Las descargas son solo para el administrador.</p>') + "</section>";
    enlazarSeg("adRepGran", function (v) { rep.agrupar = v; render(); });
    var suf = sufijoRango(rep.rango);
    if ($("adExpResumen")) $("adExpResumen").addEventListener("click", function () {
      descargarCSV("resumen-por-" + g.gran + "-" + suf, cubos.map(function (c) {
        return { "Periodo": etiquetaCubo(c, g.gran, true), "Desde": isoLocal(c.desde), "Hasta": isoLocal(sumarDias(c.hasta, -1)), "Solicitudes": c.n, "Completadas": c.comp, "Pendientes": c.pend, "Canceladas": c.canc,
                 "Efectivizado": Math.round(c.monto * 100) / 100, "Comision": Math.round(c.comision * 100) / 100, "Depositado a clientes": Math.round(c.neto * 100) / 100 };
      }));
    });
    if ($("adExpRepOps")) $("adExpRepOps").addEventListener("click", function () { descargarCSV("operaciones-" + suf, filasOperaciones(enR)); });
    if ($("adExpRepCli")) $("adExpRepCli").addEventListener("click", function () { descargarCSV("clientes-nuevos-" + suf, filasClientes(nuevos)); });
  }

  /* ---------- Equipo y accesos (solo administrador) ---------- */
  function claveTemporal() {
    var abc = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ", num = "23456789", todo = abc + num, r = new Uint32Array(12), s = "";
    crypto.getRandomValues(r);
    for (var i = 0; i < 10; i++) s += todo[r[i] % todo.length];
    return s + num[r[10] % num.length] + abc[r[11] % abc.length];
  }
  function agregarTrabajador() {
    IC.modal({
      title: "Agregar trabajador",
      html: '<p class="muted">Tendrá acceso de <b>solo lectura</b>: ve clientes y operaciones, pero no cambia nada ni descarga datos.</p>' +
        '<div class="field mt-8"><label for="eqNombre">Nombre</label><input id="eqNombre" maxlength="80" placeholder="Ej. Lucía Ramos" autocomplete="off"></div>' +
        '<div class="field"><label for="eqPuesto">Puesto de trabajo</label><input id="eqPuesto" maxlength="60" placeholder="Ej. Asesora comercial" autocomplete="off"></div>' +
        elegirRolHTML("eqRol", "consulta") +
        '<div class="field"><label for="eqCorreo">Correo con el que entrará</label><input id="eqCorreo" type="email" maxlength="120" placeholder="lucia@ejemplo.com" autocomplete="off"></div>' +
        '<div class="field"><label for="eqClave">Contraseña temporal</label><div class="ad-clave-gen"><input id="eqClave" maxlength="72" autocomplete="off" spellcheck="false"><button type="button" class="btn btn-outline-dark btn-sm" id="eqGenerar">Generar</button></div></div>' +
        '<p class="muted" style="font-size:.78rem">Al entrar, que la cambie en su menú → «Cambiar contraseña». La foto se agrega después con «Editar».</p><p class="form-error hidden" id="eqErr"></p>',
      actions: [{ label: "Cancelar", cls: "btn-outline-dark" },
        { label: "Crear acceso", cls: "btn-primary", keepOpen: true, onClick: async function (b) {
            var nom = $("eqNombre").value.trim(), pue = $("eqPuesto").value.trim(), correo = $("eqCorreo").value.trim().toLowerCase(), clave = $("eqClave").value, err = $("eqErr");
            var tipo = rolElegido("eqRol");
            function mal(t) { err.textContent = t; err.classList.remove("hidden"); }
            if (nom.length < 2) return mal("Escribe su nombre.");
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(correo)) return mal("Escribe un correo válido.");
            if (!validarClave(clave)) return mal("La contraseña necesita 8 caracteres o más, con letras y al menos un número.");
            b.disabled = true; b.textContent = "Creando...";
            var nueva = true;
            try {
              try { await api("/auth/v1/signup", { method: "POST", sinSesion: true, body: JSON.stringify({ email: correo, password: clave, data: { nombre: nom, equipo: true } }) }); recienCreadas[correo] = clave; }
              catch (e) { if (/already|registered|exists/i.test(e.message)) nueva = recienCreadas[correo] === clave; else throw e; }
              try { await api("/rest/v1/rpc/equipo_agregar", { method: "POST", body: JSON.stringify({ p_email: correo, p_nombre: nom, p_puesto: pue || null, p_rol: tipo }) }); }
              catch (e) {
                /* sin supabase-equipo-soporte.sql todavía: Consulta funciona igual, Soporte no */
                if (!faltaFuncion(e)) throw e;
                if (tipo === "soporte") throw new Error("Para dar acceso Soporte, primero ejecuta supabase-equipo-soporte.sql en Supabase. Mientras tanto puedes crearlo como Consulta.");
                await api("/rest/v1/rpc/equipo_agregar", { method: "POST", body: JSON.stringify({ p_email: correo, p_nombre: nom, p_puesto: pue || null }) });
              }
              IC.closeModal();
              mostrarCredenciales(nom, correo, nueva ? clave : null);
              await cargarEquipo();
              try { await cargar(); } catch (e) {}
              render();
            } catch (e) {
              b.disabled = false; b.textContent = "Crear acceso";
              mal(faltaFuncion(e) ? "Primero ejecuta supabase-equipo-consulta.sql en Supabase." : (e.message || "No se pudo crear."));
            }
          } }]
    });
    $("eqGenerar").addEventListener("click", function () { $("eqClave").value = claveTemporal(); });
  }
  function mostrarCredenciales(nom, correo, clave) {
    var link = location.origin + "/admin";
    var texto = "Hola " + nom + ", este es tu acceso al panel de Impulsa Crédito:\n" + link + "\nCorreo: " + correo + (clave ? "\nContraseña temporal: " + clave + "\nCámbiala al entrar, en tu menú → Cambiar contraseña." : "");
    IC.modal({
      title: "Acceso creado",
      html: '<div class="ad-credenciales">Panel: <code>' + esc(link) + "</code><br>Correo: <code>" + esc(correo) + "</code><br>" + (clave ? "Contraseña temporal: <code>" + esc(clave) + "</code>" : "Ese correo ya tenía cuenta: entra con su contraseña de siempre.") + "</div>" +
        '<p class="muted mt-8">Envíaselo por un medio privado. Esta contraseña no se vuelve a mostrar.</p>',
      actions: [{ label: "Copiar mensaje", cls: "btn-outline-dark", keepOpen: true, onClick: function () { try { navigator.clipboard.writeText(texto); IC.toast("Copiado. Pégalo en un chat privado con esa persona.", "ok"); } catch (e) { IC.toast("No se pudo copiar.", "err"); } } },
        { label: "Listo", cls: "btn-primary" }]
    });
  }
  /* estado de conexión: [color del punto, texto, detalle] */
  function estadoConexion(t) {
    if (t.estado === "en_linea") return ["verde", "En línea", "Usando el panel ahora"];
    if (t.estado === "ausente") return ["ambar", "Ausente", "Panel abierto, sin uso"];
    return ["rojo", "Desconectado", t.visto_en ? "Visto " + hace(t.visto_en) : t.ultimo_ingreso ? "Último ingreso " + hace(t.ultimo_ingreso) : "Aún no entra"];
  }
  function estadoHTML(e) {
    return '<span class="ad-punto ' + e[0] + '" aria-hidden="true"></span><span class="txt"><b>' + esc(e[1]) + '</b><span class="cuando">' + esc(e[2]) + "</span></span>";
  }
  function accesoHTML(r) { return '<span class="ad-acceso ' + esc(r) + '">' + esc(NOMBRE_ROL[r] || "Consulta") + "</span>"; }
  function resumenEquipo() {
    var l = eq.lista || [], s = plural(l.length, "trabajador con acceso", "trabajadores con acceso");
    if (!eq.conEstado || !l.length) return s;
    var on = l.filter(function (t) { return t.estado === "en_linea"; }).length, aus = l.filter(function (t) { return t.estado === "ausente"; }).length;
    return s + " · " + on + " en línea" + (aus ? " · " + plural(aus, "ausente", "ausentes") : "");
  }
  /* cada 30 s, mientras se ve "Equipo": actualiza solo los puntos */
  function refrescarEquipo() {
    if (vista !== "equipo" || !esAdmin() || document.visibilityState === "hidden") return;
    var firma = function () { return (eq.lista || []).map(function (t) { return t.id + ":" + t.rol; }).join(","); };
    var antes = firma();
    cargarEquipo().then(function () {
      if (vista !== "equipo") return;
      if (firma() !== antes || eq.error) return render();
      eq.lista.forEach(function (t) {
        var celda = document.querySelector('[data-eqestado="' + t.id + '"]');
        if (celda) celda.innerHTML = estadoHTML(estadoConexion(t));
      });
      if ($("eqResumen")) $("eqResumen").textContent = resumenEquipo();
    });
  }
  function vistaEquipo(cont) {
    if (!esAdmin()) { irA("inicio"); return; }
    if (eq.lista === null) { cont.innerHTML = '<div class="ad-vacio"><span class="ad-cargando grande"></span><p>Cargando el equipo...</p></div>'; cargarEquipo().then(render); return; }
    if (!eqReloj) eqReloj = setInterval(refrescarEquipo, 30000);
    var conEstado = eq.conEstado;
    var cuantos = function (r) { return eq.lista.filter(function (t) { return (t.rol === "soporte" ? "soporte" : "consulta") === r; }).length; };
    function tarjetaRol(titulo, extra, texto, puntos) {
      return '<div class="ad-rol"><h4>' + titulo + " " + extra + "</h4><p>" + texto + "</p><ul>" +
        puntos.map(function (p) { return '<li class="' + p[0] + '">' + p[1] + "</li>"; }).join("") + "</ul></div>";
    }
    var roles =
      '<section class="ad-card"><div class="ad-card-tit"><div><h3>Tipos de acceso</h3><p>Lo que cada persona puede hacer. Lo controla el servidor, no solo la pantalla.</p></div></div><div class="ad-roles tres">' +
        tarjetaRol("Administrador", '<span class="ad-tu">Tú</span>', "Control total del negocio.",
          [["si", "Ve todo: fotos y datos completos"], ["si", "Aprueba o rechaza documentos y tarjetas"], ["si", "Marca depósitos y cancela operaciones"], ["si", "Descarga reportes a Excel"], ["si", "Administra al equipo y ve la auditoría"]]) +
        tarjetaRol("Soporte", '<span class="ad-cuenta-rol">' + plural(cuantos("soporte"), "persona", "personas") + "</span>", "Para validar identidades y resolver casos.",
          [["si", "Ve clientes, operaciones, reportes y notas"], ["si", "Ve las fotos del DNI, la selfie y las tarjetas"], ["no", "No ve cuentas, celulares ni correos completos"], ["no", "No aprueba, no cambia, no borra"], ["no", "No descarga datos ni ve la auditoría"]]) +
        tarjetaRol("Consulta", '<span class="ad-cuenta-rol">' + plural(cuantos("consulta"), "persona", "personas") + "</span>", "Para atender clientes sin riesgo.",
          [["si", "Ve clientes, operaciones, reportes y notas"], ["no", "No ve fotos del DNI, la selfie ni las tarjetas"], ["no", "No ve cuentas, celulares ni correos completos"], ["no", "No aprueba, no cambia, no borra"], ["no", "No descarga datos ni ve la auditoría"]]) +
      "</div></section>";

    var yoPuesto = perfil.puesto && perfil.puesto.trim().toLowerCase() !== "administrador" ? perfil.puesto : "";
    var filaYo = '<li class="ad-eq-fila">' +
        '<div class="ad-eq-persona">' + avatarHTML(perfil.nombre, perfil.avatar) + '<div class="quien"><b>' + esc(perfil.nombre) + ' <span class="ad-tu">Tú</span></b>' +
          (yoPuesto ? '<span class="puesto">' + esc(yoPuesto) + "</span>" : "") + '<span class="mail">' + esc(perfil.email || "") + "</span></div></div>" +
        '<div class="ad-eq-acceso">' + accesoHTML("admin") + "</div>" +
        (conEstado ? '<div class="ad-eq-estado">' + estadoHTML(["verde", "En línea", "Eres tú"]) + "</div>" : "") +
        '<div class="acc"><button class="btn btn-outline-dark btn-sm" id="eqYo">Editar mi perfil</button></div></li>';
    var filas = eq.lista.map(function (t, i) {
      var e = estadoConexion(t);
      return '<li class="ad-eq-fila">' +
        '<div class="ad-eq-persona">' + avatarHTML(t.nombre || t.email, t.avatar) + '<div class="quien"><b>' + esc(t.nombre || "Sin nombre") + "</b>" +
          (t.puesto ? '<span class="puesto">' + esc(t.puesto) + "</span>" : "") +
          '<span class="mail">' + esc(t.email || "") + " · desde " + esc(fecha(t.desde)) +
            (conEstado ? "" : " · " + (t.ultimo_ingreso ? "último ingreso " + esc(hace(t.ultimo_ingreso)) : "aún no entra")) + "</span></div></div>" +
        '<div class="ad-eq-acceso">' + accesoHTML(t.rol === "soporte" ? "soporte" : "consulta") + "</div>" +
        (conEstado ? '<div class="ad-eq-estado" data-eqestado="' + esc(t.id) + '">' + estadoHTML(e) + "</div>" : "") +
        '<div class="acc"><button class="btn btn-outline-dark btn-sm" data-eqeditar="' + i + '">Editar</button>' +
          '<button class="btn btn-outline-dark btn-sm" data-eqclave="' + i + '" title="Le llega a su correo un enlace para crear una contraseña nueva">Restablecer clave</button>' +
          '<button class="btn btn-outline-dark btn-sm" data-eqquitar="' + i + '">Quitar acceso</button></div></li>';
    }).join("");

    var leyenda = conEstado
      ? '<div class="ad-eq-leyenda"><span><i class="ad-punto verde"></i><b>En línea</b> usando el panel</span>' +
          '<span><i class="ad-punto ambar"></i><b>Ausente</b> panel abierto, pero sin uso hace 5 min o en otra pestaña</span>' +
          '<span><i class="ad-punto rojo"></i><b>Desconectado</b> cerró el panel o perdió la conexión</span>' +
          '<span class="ad-eq-auto">Se actualiza solo cada 30 segundos</span></div>'
      : "";
    var falta2 = !conEstado && eq.lista.length
      ? '<ul class="ad-avisos" style="margin-bottom:14px"><li class="warn"><b>Activa el acceso Soporte y los puntos de conexión (una sola vez):</b><br>' +
          "1. Entra a supabase.com → tu proyecto → <b>SQL Editor</b> → <b>New query</b>.<br>" +
          "2. Pega todo el archivo <b>supabase-equipo-soporte.sql</b> y pulsa <b>Run</b>.<br>" +
          "3. Vuelve aquí y recarga la página (F5).</li></ul>"
      : "";
    var lista = eq.error === "falta_sql"
      ? '<ul class="ad-avisos"><li class="warn"><b>Falta activar el equipo en Supabase (una sola vez):</b><br>' +
          "1. Entra a supabase.com → tu proyecto → <b>SQL Editor</b> → <b>New query</b>.<br>" +
          "2. Pega todo el archivo <b>supabase-equipo-consulta.sql</b> y pulsa <b>Run</b>. Luego haz lo mismo con <b>supabase-equipo-soporte.sql</b>.<br>" +
          "3. Vuelve aquí y recarga la página (F5): aparecerá el botón <b>+ Agregar trabajador</b>.</li></ul>"
      : eq.error ? '<p class="ad-sub">No se pudo cargar el equipo: ' + esc(eq.error) + "</p>"
      : falta2 + '<ul class="ad-equipo' + (conEstado ? "" : " sin-estado") + '">' +
          '<li class="ad-eq-cab" aria-hidden="true"><span>Persona</span><span>Acceso</span>' + (conEstado ? "<span>Conexión</span>" : "") + "<span></span></li>" +
          filaYo + filas + "</ul>" +
          (eq.lista.length ? "" : '<p class="ad-sub" style="margin-top:10px">Todavía no agregaste trabajadores.</p>') + leyenda;
    cont.innerHTML =
      '<section class="ad-card"><div class="ad-card-tit"><div><h3>Equipo</h3><p id="eqResumen">' + esc(resumenEquipo()) + "</p></div>" +
        (eq.error !== "falta_sql" ? '<button class="btn btn-primary btn-sm" id="eqAgregar">+ Agregar trabajador</button>' : "") + "</div>" + lista + "</section>" + roles;
    if ($("eqAgregar")) $("eqAgregar").addEventListener("click", agregarTrabajador);
    if ($("eqYo")) $("eqYo").addEventListener("click", miPerfil);
    cont.querySelectorAll("[data-eqeditar]").forEach(function (b) {
      b.addEventListener("click", function () {
        var t = eq.lista[+b.dataset.eqeditar], aviso = null;
        modalPerfil({ titulo: "Editar a " + (t.nombre || t.email), nombre: t.nombre, puesto: t.puesto, avatar: t.avatar,
          rol: conEstado ? (t.rol === "soporte" ? "soporte" : "consulta") : null,
          aviso: function () { return aviso || "Perfil guardado."; },
          guardar: async function (nom, pue, foto, nuevoRol) {
            var cuerpo = { p_id: t.id, p_nombre: nom, p_puesto: pue || null, p_avatar: foto };
            if (nuevoRol) cuerpo.p_rol = nuevoRol;
            await api("/rest/v1/rpc/equipo_guardar", { method: "POST", body: JSON.stringify(cuerpo) });
            if (nuevoRol && nuevoRol !== t.rol) aviso = nom + " ahora tiene acceso " + NOMBRE_ROL[nuevoRol] + ". Si está conectado, su panel se actualiza solo en menos de un minuto.";
            await cargarEquipo(); render();
          } });
      });
    });
    cont.querySelectorAll("[data-eqquitar]").forEach(function (b) {
      b.addEventListener("click", function () {
        var t = eq.lista[+b.dataset.eqquitar];
        IC.modal({ title: "Quitar acceso", html: "<p><b>" + esc(t.nombre || t.email) + "</b> ya no podrá entrar al panel. Si está conectado, el panel se le cierra en menos de un minuto. Su cuenta no se borra: puedes volver a darle acceso cuando quieras.</p>",
          actions: [{ label: "Volver", cls: "btn-outline-dark" }, { label: "Quitar acceso", cls: "btn-danger", onClick: function () {
            accion(async function () { await api("/rest/v1/rpc/equipo_quitar", { method: "POST", body: JSON.stringify({ p_id: t.id }) }); IC.toast("Acceso quitado.", "ok"); await cargarEquipo(); await cargar(); render(); });
          } }] });
      });
    });
    cont.querySelectorAll("[data-eqclave]").forEach(function (b) {
      b.addEventListener("click", function () {
        var t = eq.lista[+b.dataset.eqclave];
        accion(async function () {
          await api("/auth/v1/recover?redirect_to=" + encodeURIComponent(location.origin + "/recuperar"), { method: "POST", sinSesion: true, body: JSON.stringify({ email: t.email }) });
          IC.toast("Le enviamos a " + t.email + " un enlace para crear una contraseña nueva.", "ok");
        }, b);
      });
    });
  }

  /* ---------- Auditoría (solo administrador) ---------- */
  function textoAccion(h) {
    var d = h.detalle || {};
    if (h.accion === "ingreso_panel") return "entró al panel";
    if (h.accion === "equipo_alta") return "dio acceso de " + (d.rol === "soporte" ? "soporte" : "consulta") + " a " + (d.nombre || d.email || "una persona");
    if (h.accion === "equipo_baja") return "quitó el acceso a " + (d.nombre || "una persona");
    if (h.accion === "equipo_edicion") {
      if (d.rol && d.rol_antes && d.rol !== d.rol_antes) return "cambió el acceso de " + (d.nombre || "una persona") + " a " + (NOMBRE_ROL[d.rol] || d.rol);
      return "editó el perfil de " + (d.nombre || "una persona");
    }
    if (h.accion === "cambio_estado") {
      var que = { documentos: "la identidad", tarjetas: "la tarjeta", operaciones: "la operación" }[h.tabla] || h.tabla;
      var hizo = { verificado: "aprobó", verificada: "aprobó", rechazado: "rechazó", completada: "marcó como pagada", cancelada: "canceló", en_revision: "devolvió a revisión" }[h.despues] || ("cambió a «" + h.despues + "»");
      return hizo + " " + que;
    }
    return h.accion;
  }
  function detalleAccion(h) {
    var d = h.detalle || {}, partes = [];
    if (d.codigo) partes.push(d.codigo);
    if (d.ultimos4) partes.push((d.banco || "") + " ····" + d.ultimos4);
    if (d.monto != null && h.tabla === "operaciones") partes.push(dinero(d.monto));
    return partes.length ? " · " + partes.join(" · ") : "";
  }
  function vistaAuditoria(cont) {
    if (!esAdmin()) { irA("inicio"); return; }
    if (!hay.historial) { cont.innerHTML = '<div class="ad-vacio"><h3>La auditoría aún no está activa</h3><p>Ejecuta <b>supabase-equipo-consulta.sql</b> en Supabase. Desde ese momento cada aprobación, rechazo, depósito, cancelación e ingreso queda registrado.</p></div>'; return; }
    if (eq.lista === null) { cargarEquipo().then(render); }
    var personas = {};
    personas[perfil.email] = { nombre: perfil.nombre, avatar: perfil.avatar };
    (eq.lista || []).forEach(function (t) { personas[t.email] = { nombre: t.nombre, avatar: t.avatar }; });
    var lista = datos.historial.filter(function (h) {
      if (!enRango(h.creado_en, aud.rango)) return false;
      if (aud.filtro === "cambios") return h.accion === "cambio_estado";
      if (aud.filtro === "ingresos") return h.accion === "ingreso_panel";
      if (aud.filtro === "equipo") return /^equipo_/.test(h.accion);
      return true;
    });
    var vis = pagina(lista, aud);
    cont.innerHTML =
      '<div class="ad-barra">' + seg("adAudFiltro", [["todo", "Todo"], ["cambios", "Cambios de estado"], ["ingresos", "Ingresos"], ["equipo", "Equipo"]], aud.filtro) +
        '<span class="ad-sub" style="margin-left:auto">Lo registra el servidor. Nadie puede editarlo ni borrarlo.</span></div>' +
      (lista.length
        ? '<div class="ad-tabla-wrap"><table class="ad-tabla cards"><thead><tr><th>Fecha</th><th>Quién</th><th>Qué hizo</th><th>Cliente</th><th>Cambio</th></tr></thead><tbody>' +
            vis.map(function (h) {
              var c = h.cliente_id && datos.porId[h.cliente_id], pz = personas[h.actor_email] || { nombre: h.actor_email || (h.actor_rol === "cliente" ? "Cliente" : "Sistema") };
              return '<tr><td class="fecha" data-label="Fecha">' + esc(fechaHora(h.creado_en)) + '</td><td data-label="Quién"><div class="ad-celda-persona">' + avatarHTML(pz.nombre, pz.avatar, "chico") + "<div><b>" + esc(pz.nombre) + '</b><span class="ad-sub">' + esc(NOMBRE_ROL[h.actor_rol] || h.actor_rol || "") + "</span></div></div></td>" +
                '<td data-label="Qué hizo">' + esc(textoAccion(h) + detalleAccion(h)) + '</td><td data-label="Cliente">' + (c ? esc(nombre(c)) : '<span class="ad-sub">—</span>') + '</td><td data-label="Cambio">' +
                (h.antes && h.despues ? chip(h.antes) + " → " + chip(h.despues) : '<span class="ad-sub">—</span>') + "</td></tr>";
            }).join("") + "</tbody></table></div>" + paginador(lista.length, aud, "aud", ["registro", "registros"])
        : '<div class="ad-vacio"><h3>Sin movimientos en este periodo</h3><p>Prueba con otro periodo o quita el filtro.</p></div>');
    enlazarSeg("adAudFiltro", function (v) { aud.filtro = v; aud.pag = 1; render(); });
    enlazarPaginador(cont, "aud", aud);
  }

  /* ======================= despachador ======================= */
  var TITULOS = {
    inicio: ["Dashboard", "Cómo va el negocio en el periodo elegido"],
    pendientes: ["Por revisar", "Documentos y tarjetas que esperan aprobación"],
    clientes: ["Clientes", "Toda tu cartera, con su estado y lo que ha movido"],
    ficha: ["Ficha 360° del cliente", "Todo sobre una persona en una sola pantalla"],
    ops: ["Operaciones", "Cada efectivización solicitada, para depositar y dar seguimiento"],
    reportes: ["Reportes", "Resumen por periodo y descargas para Excel"],
    equipo: ["Equipo y accesos", "Quién entra al panel y qué puede hacer"],
    auditoria: ["Auditoría", "Historial de cambios registrado por el servidor"]
  };
  function render() {
    var cont = $("adView"), n = datos.pendientes.length;
    graficos = [];
    if (vista !== "equipo" && eqReloj) { clearInterval(eqReloj); eqReloj = null; }
    $("adBadge").textContent = n;
    $("adBadge").style.display = n ? "" : "none";
    document.querySelectorAll(".ad-tab").forEach(function (b) {
      var on = b.dataset.v === vista || (vista === "ficha" && b.dataset.v === "clientes");
      b.classList.toggle("on", on);
      if (on) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
    });
    var t = TITULOS[vista] || TITULOS.inicio;
    $("adTitulo").textContent = t[0];
    $("adSubtitulo").textContent = t[1];
    document.title = t[0] + " — Impulsa Crédito";
    var rango = { inicio: dash.rango, ops: ops.rango, reportes: rep.rango, auditoria: aud.rango }[vista];
    $("adTopFechas").innerHTML = rango ? controlFechas("adFecha", rango) : "";
    if (rango) enlazarFechas("adFecha", rango, function () { ops.pag = 1; aud.pag = 1; if (vista === "inicio") dash.gran = "auto"; if (vista === "reportes") rep.agrupar = "auto"; render(); });
    if (vista === "inicio") return vistaInicio(cont);
    if (vista === "pendientes") return vistaPendientes(cont);
    if (vista === "clientes") return vistaClientes(cont);
    if (vista === "ficha") return vistaFicha(cont);
    if (vista === "reportes") return vistaReportes(cont);
    if (vista === "equipo") return vistaEquipo(cont);
    if (vista === "auditoria") return vistaAuditoria(cont);
    return vistaOps(cont);
  }

  /* ======================= arranque ======================= */
  function prepararSegunRol() {
    var consulta = esConsulta();
    $("adRolTag").textContent = esAdmin() ? "Administración" : NOMBRE_ROL[rol];
    $("adPillRol").classList.toggle("hidden", !consulta);
    $("adPillRol").title = verFotos()
      ? "Acceso Soporte: ves clientes, operaciones y las fotos del DNI, la selfie y las tarjetas, pero no puedes aprobar, cambiar ni descargar datos. Cuentas, celulares y correos se muestran ocultos."
      : "Acceso Consulta: ves clientes y operaciones, pero no puedes aprobar, cambiar ni descargar datos. Las fotos y lo sensible se muestran ocultos.";
    document.querySelectorAll(".ad-solo-admin").forEach(function (x) { x.classList.toggle("hidden", !esAdmin()); });
    var cl = CFG.claims || {};
    $("adPie").textContent = "Impulsa Crédito · " + [cl.company, cl.ruc ? "RUC " + cl.ruc : ""].filter(Boolean).join(" · ") + " · Uso interno";
  }
  async function entrarConSesion() {
    rol = await obtenerRol();
    if (!rol) {
      $("adLoginError").textContent = "Esta cuenta no tiene acceso al panel.";
      $("adLoginError").classList.remove("hidden");
      sesion = null;
      try { localStorage.removeItem(SES); } catch (e) {}
      return false;
    }
    prepararSegunRol();
    $("adLogin").classList.add("hidden");
    $("adPanel").classList.remove("hidden");
    $("adView").innerHTML = '<div class="ad-vacio"><span class="ad-cargando grande"></span><p>Cargando la información...</p></div>';
    api("/rest/v1/rpc/registrar_ingreso", { method: "POST", body: "{}" }).catch(function () {});
    iniciarPresencia();
    await cargarPerfil();
    try { await cargar(); render(); }
    catch (e) {
      $("adView").innerHTML = '<div class="ad-vacio"><h3>No se pudo cargar la información</h3><p>' + esc(e.message || "Revisa tu conexión a internet.") + '</p><button class="btn btn-primary btn-sm" style="margin-top:16px" id="adReintentar">Reintentar</button></div>';
      $("adReintentar").addEventListener("click", function () { location.reload(); });
    }
    return true;
  }
  function rescatar(motivo) {
    try {
      $("adLogin").classList.remove("hidden");
      $("adPanel").classList.add("hidden");
      $("adLoginError").textContent = "Hubo un problema al abrir el panel: " + motivo + ". Vuelve a entrar.";
      $("adLoginError").classList.remove("hidden");
      try { localStorage.removeItem(SES); } catch (e) {}
    } catch (e) {}
  }
  window.addEventListener("error", function (ev) {
    if ($("adPanel") && $("adPanel").classList.contains("hidden")) return;
    rescatar((ev && ev.message) || "error inesperado");
  });

  async function arrancar() {
    if (window.IC && IC.bindPassToggles) IC.bindPassToggles(document);
    document.querySelectorAll(".ad-tab").forEach(function (b) { b.addEventListener("click", function () { irA(b.dataset.v); }); });
    $("adCuenta").addEventListener("click", function () {
      var m = $("adCuentaMenu"), abrir = m.classList.contains("hidden");
      cerrarPops();
      if (abrir) { m.classList.remove("hidden"); $("adCuenta").setAttribute("aria-expanded", "true"); m.querySelector("button").focus(); }
    });
    $("adSalir").addEventListener("click", salir);
    $("adClave").addEventListener("click", function () { cerrarPops(); cambiarClave(); });
    $("adPerfil").addEventListener("click", function () { cerrarPops(); miPerfil(); });
    $("adAbrirMenu").addEventListener("click", function () { $("adPanel").classList.add("menu-abierto"); $("adCerrarMenu").focus(); });
    $("adCerrarMenu").addEventListener("click", cerrarMenu);
    $("adVelo").addEventListener("click", cerrarMenu);
    $("adRefrescar").addEventListener("click", async function () {
      var b = $("adRefrescar");
      b.disabled = true; cacheFotos = {};
      try { await cargar(); if (vista === "equipo" || vista === "auditoria") await cargarEquipo(); render(); IC.toast("Actualizado", "ok"); }
      catch (e) { IC.toast("No se pudo actualizar: " + e.message, "err"); }
      b.disabled = false;
    });
    $("adLoginForm").addEventListener("submit", async function (e) {
      e.preventDefault();
      var b = $("adLoginBtn"), err = $("adLoginError"), correo = $("adEmail").value.trim(), clave = $("adPass").value;
      err.classList.add("hidden");
      if (!correo || !clave) { err.textContent = "Escribe tu correo y tu contraseña."; err.classList.remove("hidden"); return; }
      b.disabled = true; b.textContent = "Verificando...";
      try {
        guardar(await api("/auth/v1/token?grant_type=password", { method: "POST", sinSesion: true, body: JSON.stringify({ email: correo, password: clave }) }));
        $("adPass").value = "";
        await entrarConSesion();
      } catch (ex) {
        err.textContent = /Invalid login/i.test(ex.message) ? "Correo o contraseña incorrectos." : ex.message;
        err.classList.remove("hidden");
      }
      b.disabled = false; b.textContent = "Entrar";
    });
    var g = null;
    try { g = JSON.parse(localStorage.getItem(SES) || "null"); } catch (e) {}
    if (g && g.refresh_token) {
      try {
        guardar(await api("/auth/v1/token?grant_type=refresh_token", { method: "POST", sinSesion: true, body: JSON.stringify({ refresh_token: g.refresh_token }) }));
        await entrarConSesion();
      } catch (e) { try { localStorage.removeItem(SES); } catch (e2) {} }
    }
  }
  function inicio() { arrancar().catch(function (e) { rescatar(e.message || "no se pudo iniciar"); }); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", inicio);
  else inicio();
})();
