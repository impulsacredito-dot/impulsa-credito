/* =====================================================================
   IMPULSA CRÉDITO — Panel del equipo
   =====================================================================
   Pestañas: Inicio · Por revisar · Clientes · Operaciones · Reportes ·
   Equipo (solo administrador).

   Dos tipos de usuario:
   · ADMINISTRADOR (tú): ve todo, aprueba, completa operaciones, descarga
     Excel y administra al equipo.
   · CONSULTA (trabajadores): ve clientes y operaciones para atender,
     pero no puede cambiar nada y recibe lo sensible oculto.

   SEGURIDAD: la protección vive en Supabase (supabase-admin.sql y
   supabase-equipo-consulta.sql). Aquí solo se esconden los botones que
   un usuario no podría usar: aunque los forzara, el servidor lo rechaza.
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

  var sesion = null;
  var rol = null;                 // "admin" | "consulta"
  var datos = { pendientes: [], clientes: [], ops: [], docs: [], tarjetas: [], historial: [], porId: {} };
  var hay = { notas: false, historial: false };

  /* estado de cada pantalla */
  var vista = "inicio";
  var ini = { gran: "semana" };
  var pend = { tipo: "todo" };
  var cli = { q: "", filtro: "todos", orden: "registro", dir: -1, pag: 1 };
  var ops = { q: "", filtro: "todas", orden: "fecha", dir: -1, pag: 1, rango: { clave: "todo" } };
  var rep = { rango: { clave: "mes" }, agrupar: "auto" };
  var fic = { id: null, tab: "datos" };
  var eq = { lista: null, error: null, filtro: "todo", pag: 1 };

  var cacheFotos = {};
  var ocupado = false;
  var graficos = [];              // gráficos visibles (se redibujan al cambiar el tamaño)

  function $(id) { return document.getElementById(id); }
  function esc(s) { return window.IC ? IC.esc(s) : String(s == null ? "" : s); }
  function esConsulta() { return rol === "consulta"; }
  function esAdmin() { return rol === "admin"; }
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
  function lunes(d) { var x = inicioDia(d); var w = (x.getDay() + 6) % 7; return sumarDias(x, -w); }
  function inicioMes(d) { var x = new Date(d); return new Date(x.getFullYear(), x.getMonth(), 1); }
  function isoLocal(d) { if (!d) return ""; var x = new Date(d); return x.getFullYear() + "-" + ("0" + (x.getMonth() + 1)).slice(-2) + "-" + ("0" + x.getDate()).slice(-2); }
  function leerFecha(v) { if (!v) return null; var p = v.split("-"); return new Date(+p[0], +p[1] - 1, +p[2]); }   // sin desfase de zona horaria

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
  function enRango(f, r) {
    if (!f) return false;
    var l = limites(r), t = new Date(f);
    return (!l[0] || t >= l[0]) && (!l[1] || t < l[1]);
  }
  function nombreRango(r) {
    if (r.clave === "propio") return fecha(r.desde) + " – " + fecha(r.hasta);
    for (var i = 0; i < PRESETS.length; i++) if (PRESETS[i][0] === r.clave) return PRESETS[i][1];
    return "Todo";
  }
  function sufijoRango(r) {
    var l = limites(r);
    if (!l[0] && !l[1]) return "todo";
    return isoLocal(l[0] || primeraFecha()) + "_a_" + isoLocal(sumarDias(l[1] || new Date(), l[1] ? -1 : 0));
  }
  function primeraFecha() {
    var f = datos.ops.map(function (o) { return o.creado_en; }).concat(datos.clientes.map(function (c) { return c.perfil.creado_en; })).filter(Boolean).sort()[0];
    return f ? new Date(f) : new Date();
  }

  /* ======================= red ======================= */
  function cab(extra, sinSesion) {
    var h = { apikey: KEY, "Content-Type": "application/json" };
    if (!sinSesion) h.Authorization = "Bearer " + (sesion ? sesion.access_token : KEY);
    for (var k in extra) h[k] = extra[k];
    return h;
  }
  /* Si la sesión venció (dura 1 hora) se renueva sola y se repite el pedido */
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
  /* trae una tabla completa en tandas de 1000 (el límite de Supabase por pedido) */
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
  /* Escribe y COMPRUEBA que el servidor aplicó el cambio (si las reglas lo
     impiden, la respuesta llega vacía y antes parecía que se había guardado) */
  async function escribir(ruta, metodo, cuerpo) {
    if (!esAdmin()) throw new Error("Tu usuario es de consulta: no puede hacer cambios.");
    var r = await api(ruta, { method: metodo, body: JSON.stringify(cuerpo), prefer: "return=representation" });
    if (!Array.isArray(r) || !r.length) throw new Error("El servidor no aplicó el cambio (sin permiso o el registro ya no existe).");
    return r;
  }

  /* ======================= sesión y rol ======================= */
  function guardar(s) {
    sesion = s;
    try { localStorage.setItem(SES, JSON.stringify({ refresh_token: s.refresh_token })); } catch (e) {}
  }
  async function renovar() {
    var s = await api("/auth/v1/token?grant_type=refresh_token", { method: "POST", sinSesion: true, body: JSON.stringify({ refresh_token: sesion.refresh_token }) });
    guardar(s);
  }
  function salir() {
    sesion = null; rol = null;
    try { localStorage.removeItem(SES); } catch (e) {}
    location.reload();
  }
  /* El rol lo responde el servidor. Si aún no se ejecutó
     supabase-equipo-consulta.sql, se usa la comprobación de siempre. */
  async function obtenerRol() {
    try {
      var r = await api("/rest/v1/rpc/mi_rol", { method: "POST", body: "{}" });
      return r === "admin" || r === "consulta" ? r : null;
    } catch (e) {
      if (!e.status) throw e;
      if (e.status !== 404 && e.code !== "PGRST202") return null;
    }
    try {
      var a = await api("/rest/v1/rpc/es_admin", { method: "POST", body: "{}" });
      return a === true ? "admin" : null;
    } catch (e) { if (!e.status) throw e; return null; }
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
      try { datos.historial = await api("/rest/v1/auditoria?select=*&order=creado_en.desc&limit=2000") || []; hay.historial = true; }
      catch (e) { hay.historial = false; }
    }

    var porId = {};
    perfiles.forEach(function (p) { porId[p.id] = { id: p.id, perfil: p, docs: [], tarjetas: [], cuentas: [], ops: [], notas: [] }; });
    function meter(l, campo, llave) {
      l.forEach(function (x) { var id = x[llave || "user_id"]; if (id && porId[id]) porId[id][campo].push(x); });
    }
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

  /* ======================= fotos (solo administrador) ======================= */
  async function urlFoto(ruta) {
    if (!ruta || !esAdmin()) return null;
    if (cacheFotos[ruta]) return cacheFotos[ruta];
    try {
      var r = await api("/storage/v1/object/sign/" + BUCKET + "/" + encodeURI(ruta), { method: "POST", body: JSON.stringify({ expiresIn: 3600 }) });
      return (cacheFotos[ruta] = base + "/storage/v1" + r.signedURL);
    } catch (e) { return null; }
  }
  async function pintarFotos(cont) {
    var nodos = cont.querySelectorAll("[data-foto]");
    for (var i = 0; i < nodos.length; i++) {
      var n = nodos[i], u = await urlFoto(n.getAttribute("data-foto"));
      if (!n.isConnected) return;
      if (!u) { n.innerHTML = '<span class="ad-sinfoto">Sin foto</span>'; continue; }
      n.innerHTML = '<img src="' + u + '" alt="">' +
        '<a class="ad-zoom" href="' + u + '" target="_blank" rel="noopener" title="Ver en grande" aria-label="Ver en grande">' +
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
    try { await escribir("/rest/v1/avisos", "POST", { user_id: userId, titulo: titulo, texto: texto, tipo: tipo }); }
    catch (e) { /* el aviso es un extra: la decisión ya quedó guardada */ }
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
      actions: [
        { label: "Cancelar", cls: "btn-outline-dark" },
        { label: "Rechazar y avisar", cls: "btn-danger", onClick: function () {
            var m = (($("adMotivo") && $("adMotivo").value) || "").trim();
            accion(function () { return decidir(item, false, m); });
          } }
      ]
    });
  }
  async function cambiarOperacion(op, estado) {
    await escribir("/rest/v1/operaciones?id=eq." + op.id, "PATCH", { estado: estado });
    var completa = estado === "completada";
    await avisar(op.user_id, completa ? "¡Depósito realizado!" : "Operación cancelada",
      completa ? ("Ya depositamos " + dinero(op.neto) + " en tu cuenta " + (op.banco_cuenta || "") + ". Tu comprobante de la operación " + (op.codigo || "") + " ya está disponible.")
               : ("La operación " + (op.codigo || "") + " fue cancelada. Si crees que es un error, escríbenos por WhatsApp."),
      completa ? "ok" : "alerta");
    IC.toast(completa ? "Marcada como completada. El cliente ya fue avisado." : "Operación cancelada.", completa ? "ok" : "err");
    cerrarDrawer();
    await cargar(); render();
  }
  function confirmarCompletada(op) {
    IC.modal({
      title: "¿Ya depositaste el dinero?",
      html: "<p>Vas a dar por <b>completada</b> la operación <b>" + esc(op.codigo || "") + "</b> de " + esc(op.nombre || "") + ".</p>" +
            '<p class="muted mt-8">Confirma solo si ya transferiste <b>' + dinero(op.neto) + "</b> a la cuenta " +
            esc(op.banco_cuenta || "") + " " + esc(op.numero_cuenta || "") + ". El cliente recibirá el aviso y su comprobante.</p>",
      actions: [
        { label: "Todavía no", cls: "btn-outline-dark" },
        { label: "Sí, ya deposité", cls: "btn-primary", onClick: function () { accion(function () { return cambiarOperacion(op, "completada"); }); } }
      ]
    });
  }
  function confirmarCancelar(op) {
    IC.modal({
      title: "Cancelar operación",
      html: "<p>Vas a cancelar la operación <b>" + esc(op.codigo || "") + "</b> de " + esc(op.nombre || "") + ".</p>" +
            '<p class="muted mt-8">El cliente recibirá un aviso. Una operación cancelada no suma comisión.</p>',
      actions: [
        { label: "Volver", cls: "btn-outline-dark" },
        { label: "Sí, cancelar", cls: "btn-danger", onClick: function () { accion(function () { return cambiarOperacion(op, "cancelada"); }); } }
      ]
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

  /* ======================= cuenta propia ======================= */
  function validarClave(p) { return p.length >= 8 && /\d/.test(p) && /[a-zA-Z]/.test(p); }
  function cambiarClave() {
    IC.modal({
      title: "Cambiar mi contraseña",
      html: '<p class="muted">Mínimo 8 caracteres, con letras y al menos un número.</p>' +
        '<div class="field mt-8"><label for="adClave1">Contraseña nueva</label><input type="password" id="adClave1" autocomplete="new-password"></div>' +
        '<div class="field"><label for="adClave2">Repítela</label><input type="password" id="adClave2" autocomplete="new-password"></div>' +
        '<p class="form-error hidden" id="adClaveErr"></p>',
      actions: [
        { label: "Cancelar", cls: "btn-outline-dark" },
        { label: "Guardar", cls: "btn-primary", keepOpen: true, onClick: async function (b) {
            var p1 = $("adClave1").value, p2 = $("adClave2").value, err = $("adClaveErr");
            function mal(t) { err.textContent = t; err.classList.remove("hidden"); }
            if (!validarClave(p1)) return mal("Mínimo 8 caracteres, con letras y al menos un número.");
            if (p1 !== p2) return mal("Las contraseñas no coinciden.");
            b.disabled = true; b.textContent = "Guardando...";
            try {
              await api("/auth/v1/user", { method: "PUT", body: JSON.stringify({ password: p1 }) });
              IC.closeModal(); IC.toast("Contraseña actualizada.", "ok");
            } catch (e) {
              b.disabled = false; b.textContent = "Guardar";
              mal(/different/i.test(e.message) ? "Debe ser distinta a la actual." : (e.message || "No se pudo cambiar."));
            }
          } }
      ]
    });
  }

  /* ======================= Excel (solo administrador) =======================
     CSV para Excel en español: separador ";" y BOM para las tildes. */
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
      return {
        "DNI": c.perfil.documento || "", "Cliente": nombre(c), "Celular": c.perfil.celular || "", "Correo": c.perfil.email || "",
        "DNI y selfie": idd ? idd.estado : "sin subir", "N tarjetas": c.tarjetas.length,
        "Tarjetas": c.tarjetas.map(function (t) { return (t.banco || "") + " " + (t.marca || "") + " ****" + (t.ultimos4 || ""); }).join(" | "),
        "N cuentas": c.cuentas.length,
        "Cuentas": c.cuentas.map(function (a) { return (a.banco || "") + " " + (a.numero || ""); }).join(" | "),
        "N operaciones": c.ops.length, "Efectivizado": sumar(comp, "monto"), "Comision": sumar(comp, "comision"),
        "Se registro": fechaHora(c.perfil.creado_en), "Ultima actividad": fechaHora(c.ultima)
      };
    });
  }
  function filasOperaciones(lista) {
    return lista.map(function (o) {
      return {
        "Codigo": o.codigo || "", "Fecha": fechaHora(o.creado_en), "Cliente": o.nombre || "", "DNI": o.documento || "",
        "Celular": o.celular || "", "Tarjeta": (o.banco_tarjeta || "") + " ****" + (o.ultimos4 || ""),
        "Banco destino": o.banco_cuenta || "", "Cuenta destino": o.numero_cuenta || "",
        "Monto": Number(o.monto || 0), "Comision": Number(o.comision || 0), "Recibe": Number(o.neto || 0),
        "Estado": o.estado || "", "Depositada": o.completada_en ? fechaHora(o.completada_en) : ""
      };
    });
  }

  /* ======================= piezas de interfaz ======================= */
  var ICO = {
    wa: '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M17.5 14.4c-.3-.2-1.7-.9-2-1-.3-.1-.5-.1-.7.1-.2.3-.7 1-.9 1.2-.2.2-.3.2-.6.1-1.7-.9-2.9-1.6-4-3.5-.3-.5.3-.5.8-1.5.1-.2 0-.4 0-.5s-.7-1.6-.9-2.2c-.2-.5-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.5s1.1 2.9 1.2 3.1c.1.2 2.1 3.2 5.1 4.5 1.9.8 2.6.9 3.5.7.6-.1 1.7-.7 1.9-1.3.2-.7.2-1.2.2-1.3-.1-.2-.3-.2-.5-.3z"/><path d="M12 2a10 10 0 00-8.6 15L2 22l5.2-1.4A10 10 0 1012 2zm0 18.2a8.2 8.2 0 01-4.2-1.1l-.3-.2-3.1.8.8-3-.2-.3A8.2 8.2 0 1112 20.2z"/></svg>',
    buscar: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
    excel: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12M7 12l5 5 5-5M5 21h14"/></svg>',
    cal: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
    chev: '<svg class="chev" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>'
  };
  function chip(estado) {
    var m = {
      en_revision: ["En revisión", "warn"], verificado: ["Verificado", "ok"], verificada: ["Verificada", "ok"], rechazado: ["Rechazado", "err"],
      completada: ["Completada", "ok"], cancelada: ["Cancelada", "err"], pend_pago: ["Pendiente de pago", "warn"], activa: ["Activa", "warn"], sin_subir: ["Sin DNI", ""]
    };
    var v = m[estado] || [estado || "—", ""];
    return '<span class="ad-chip ' + v[1] + '">' + esc(v[0]) + "</span>";
  }
  function nombre(c) {
    if (!c || !c.perfil) return "Cliente sin perfil";
    return ((c.perfil.nombres || "") + " " + (c.perfil.apellidos || "")).trim() || "Sin nombre";
  }
  function completada(o) { return o.estado === "completada"; }
  function pendiente(o) { return o.estado === "pend_pago" || o.estado === "activa"; }
  function cancelada(o) { return o.estado === "cancelada"; }
  function sumar(l, campo) { return l.reduce(function (a, o) { return a + Number(o[campo] || 0); }, 0); }
  function estadoIdentidad(c) { return c.docs[0] ? c.docs[0].estado : "sin_subir"; }
  function kpi(t, v, nota, clase, ir) {
    return '<div class="ad-kpi' + (clase ? " " + clase : "") + '"' + (ir ? ' data-ir="' + ir + '" role="button" tabindex="0"' : "") + ">" +
      "<span>" + esc(t) + "</span><b>" + v + "</b>" + (nota ? "<small>" + nota + "</small>" : "") + "</div>";
  }
  function seg(id, opciones, actual) {
    return '<div class="ad-seg" role="group" id="' + id + '">' + opciones.map(function (o) {
      return '<button data-seg="' + o[0] + '" class="' + (o[0] === actual ? "on" : "") + '" aria-pressed="' + (o[0] === actual) + '">' + o[1] + "</button>";
    }).join("") + "</div>";
  }
  function enlazarSeg(id, fn) {
    var g = $(id); if (!g) return;
    g.querySelectorAll("[data-seg]").forEach(function (b) { b.addEventListener("click", function () { fn(b.dataset.seg); }); });
  }
  function th(texto, campo, est, clase) {
    var c = clase ? ' class="' + clase + '"' : "";
    if (!campo) return "<th" + c + ">" + texto + "</th>";
    var on = est.orden === campo;
    return "<th" + c + ' aria-sort="' + (on ? (est.dir > 0 ? "ascending" : "descending") : "none") + '"><button class="ad-orden-btn' + (on ? " on" : "") + '" data-orden="' + campo + '">' +
      texto + '<span class="fl" aria-hidden="true">' + (on ? (est.dir > 0 ? "▲" : "▼") : "↕") + "</span></button></th>";
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
    var desde = (est.pag - 1) * POR_PAGINA + 1, hasta = Math.min(total, est.pag * POR_PAGINA);
    return '<div class="ad-pager"><span>' + desde + "–" + hasta + " de " + total + " " + unidad[1] + "</span><div>" +
      '<button data-pg="' + id + '" data-d="-1"' + (est.pag <= 1 ? " disabled" : "") + ">‹ Anterior</button>" +
      "<span>Página " + est.pag + " de " + paginas + "</span>" +
      '<button data-pg="' + id + '" data-d="1"' + (est.pag >= paginas ? " disabled" : "") + ">Siguiente ›</button></div></div>";
  }
  function enlazarPaginador(cont, id, est) {
    cont.querySelectorAll('[data-pg="' + id + '"]').forEach(function (b) {
      b.addEventListener("click", function () { est.pag += Number(b.dataset.d); render(); window.scrollTo({ top: 0, behavior: "smooth" }); });
    });
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
      tr.addEventListener("click", function (e) { if (e.target.closest("button,a")) return; fn(tr.dataset.k, tr); });
      tr.addEventListener("keydown", function (e) { if (e.key === "Enter" && e.target === tr) fn(tr.dataset.k, tr); });
    });
  }

  /* ---------- ventanitas flotantes (menú de cuenta y fechas) ---------- */
  function alternarPop(boton, pop) {
    var abrir = pop.classList.contains("hidden");
    cerrarPops();
    if (abrir) { pop.classList.remove("hidden"); boton.setAttribute("aria-expanded", "true"); var f = pop.querySelector("button"); if (f) f.focus(); }
  }
  function cerrarPops() {
    document.querySelectorAll(".ad-pop").forEach(function (p) { p.classList.add("hidden"); });
    document.querySelectorAll("[aria-expanded='true']").forEach(function (b) { b.setAttribute("aria-expanded", "false"); });
  }
  document.addEventListener("click", function (e) { if (!e.target.closest(".ad-menu")) cerrarPops(); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") { cerrarPops(); cerrarDrawer(); } });

  /* ---------- selector de fechas: atajos + calendario ---------- */
  function controlFechas(id, r) {
    var l = limites(r);
    return '<div class="ad-menu"><button class="ad-fecha" id="' + id + '" aria-haspopup="true" aria-expanded="false">' + ICO.cal +
      "<span>" + esc(nombreRango(r)) + '</span><span class="flecha" aria-hidden="true">▾</span></button>' +
      '<div class="ad-pop ad-pop-fechas hidden" id="' + id + 'Pop" role="menu">' +
        PRESETS.map(function (p) {
          return '<button role="menuitemradio" aria-checked="' + (r.clave === p[0]) + '" class="' + (r.clave === p[0] ? "on" : "") + '" data-pre="' + p[0] + '">' + p[1] + '<span class="ok" aria-hidden="true">✓</span></button>';
        }).join("") +
        '<div class="ad-rango-propio"><p>Elegir en el calendario</p><div class="fila">' +
          '<label>Desde<input type="date" id="' + id + 'Desde" value="' + isoLocal(r.clave === "propio" ? r.desde : l[0]) + '"></label>' +
          '<label>Hasta<input type="date" id="' + id + 'Hasta" value="' + isoLocal(r.clave === "propio" ? r.hasta : (l[1] ? sumarDias(l[1], -1) : new Date())) + '"></label>' +
        '</div><button class="btn btn-primary btn-sm" id="' + id + 'Aplicar">Aplicar fechas</button></div>' +
      "</div></div>";
  }
  function enlazarFechas(id, r, alCambiar) {
    var b = $(id), pop = $(id + "Pop");
    if (!b) return;
    b.addEventListener("click", function () { alternarPop(b, pop); });
    pop.querySelectorAll("[data-pre]").forEach(function (x) {
      x.addEventListener("click", function () { r.clave = x.dataset.pre; delete r.desde; delete r.hasta; cerrarPops(); alCambiar(); });
    });
    $(id + "Aplicar").addEventListener("click", function () {
      var d = leerFecha($(id + "Desde").value), h = leerFecha($(id + "Hasta").value);
      if (!d || !h) { IC.toast("Elige las dos fechas.", "err"); return; }
      if (d > h) { var x = d; d = h; h = x; }
      r.clave = "propio"; r.desde = d; r.hasta = h; cerrarPops(); alCambiar();
    });
  }

  /* ---------- gráfico de barras (una sola serie, sin librerías) ---------- */
  function agrupar(lista, gran, desde, hasta) {
    var inicio = gran === "mes" ? inicioMes(desde) : gran === "semana" ? lunes(desde) : inicioDia(desde);
    var cubos = [], cursor = inicio;
    function siguiente(d) { return gran === "mes" ? new Date(d.getFullYear(), d.getMonth() + 1, 1) : sumarDias(d, gran === "semana" ? 7 : 1); }
    while (cursor < hasta && cubos.length < 400) {
      var fin = siguiente(cursor);
      cubos.push({ desde: cursor, hasta: fin, n: 0, comp: 0, canc: 0, pend: 0, monto: 0, comision: 0, neto: 0 });
      cursor = fin;
    }
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
    var mesCorto = function (d) { return d.toLocaleDateString("es-PE", { month: "short" }).replace(".", ""); };
    var anio = c.desde.getFullYear() !== new Date().getFullYear();
    if (gran === "mes") return larga ? c.desde.toLocaleDateString("es-PE", { month: "long", year: "numeric" }) : mesCorto(c.desde) + (anio ? " " + String(c.desde.getFullYear()).slice(-2) : "");
    if (gran === "semana") {
      var finS = sumarDias(c.hasta, -1);
      return larga ? "Semana del " + c.desde.getDate() + " " + mesCorto(c.desde) + " al " + finS.getDate() + " " + mesCorto(finS) + " " + finS.getFullYear()
                   : c.desde.getDate() + " " + mesCorto(c.desde);
    }
    return larga ? c.desde.toLocaleDateString("es-PE", { weekday: "long", day: "numeric", month: "short", year: "numeric" }) : c.desde.getDate() + " " + mesCorto(c.desde);
  }
  function tope(v) { var e = Math.pow(10, Math.floor(Math.log10(v))), f = v / e; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * e; }
  function compacto(v) { return "S/ " + new Intl.NumberFormat("es-PE", { notation: "compact", maximumFractionDigits: 1 }).format(v); }

  function dibujarGrafico(id, cubos, gran) {
    var caja = $(id);
    if (!caja) return;
    var max = Math.max.apply(null, cubos.map(function (c) { return c.monto; }).concat([0]));
    if (!max) { caja.innerHTML = '<div class="ad-grafico-vacio">Todavía no hay operaciones completadas en este periodo.</div>'; return; }
    var W = Math.max(260, caja.clientWidth), H = 230, izq = 56, der = 6, arr = 20, aba = 26;
    var util = W - izq - der, alto = H - arr - aba, n = cubos.length;
    var slot = util / n, ancho = Math.max(3, Math.min(34, slot * 0.62)), techo = tope(max);
    var paso = Math.max(1, Math.ceil(n / Math.max(1, Math.floor(util / 58))));
    var iMax = 0; cubos.forEach(function (c, i) { if (c.monto > cubos[iMax].monto) iMax = i; });
    var s = '<svg viewBox="0 0 ' + W + " " + H + '" width="' + W + '" height="' + H + '" role="img" aria-label="Monto efectivizado por periodo">';
    [0, 0.5, 1].forEach(function (f) {
      var y = arr + alto - alto * f;
      s += '<line class="grid" x1="' + izq + '" x2="' + (W - der) + '" y1="' + y + '" y2="' + y + '"/>' +
           '<text class="eje" x="' + (izq - 8) + '" y="' + (y + 3.5) + '" text-anchor="end">' + esc(compacto(techo * f)) + "</text>";
    });
    cubos.forEach(function (c, i) {
      var x = izq + i * slot + (slot - ancho) / 2, h = (c.monto / techo) * alto, y = arr + alto - h, r = Math.min(4, h, ancho / 2);
      s += '<g class="col" data-i="' + i + '">';
      if (h > 0) s += '<path class="barra" d="M' + x + "," + (y + h) + "V" + (y + r) + "Q" + x + "," + y + " " + (x + r) + "," + y + "H" + (x + ancho - r) + "Q" + (x + ancho) + "," + y + " " + (x + ancho) + "," + (y + r) + "V" + (y + h) + 'Z"/>';
      if (i === iMax) s += '<text class="valor" x="' + (x + ancho / 2) + '" y="' + (y - 6) + '" text-anchor="middle">' + esc(compacto(c.monto)) + "</text>";
      s += '<rect class="hit" x="' + (izq + i * slot) + '" y="' + arr + '" width="' + slot + '" height="' + alto + '" tabindex="0" aria-label="' + esc(etiquetaCubo(c, gran, true) + ": " + dinero(c.monto)) + '"/></g>';
      if (i % paso === 0 || i === n - 1 && (n - 1) % paso > paso / 2) {
        s += '<text class="eje" x="' + (izq + i * slot + slot / 2) + '" y="' + (H - 8) + '" text-anchor="middle">' + esc(etiquetaCubo(c, gran, false)) + "</text>";
      }
    });
    s += "</svg>";
    caja.innerHTML = s;
    var tip = document.createElement("div");
    tip.className = "ad-tip hidden";
    caja.appendChild(tip);
    function mostrar(g) {
      var c = cubos[+g.dataset.i], hit = g.querySelector(".hit"), rc = hit.getBoundingClientRect(), rb = caja.getBoundingClientRect();
      var barra = g.querySelector(".barra"), top = barra ? barra.getBoundingClientRect().top : rc.bottom;
      caja.querySelectorAll("g.col.on").forEach(function (x) { x.classList.remove("on"); });
      g.classList.add("on");
      tip.textContent = "";
      var b = document.createElement("b"); b.textContent = dinero(c.monto);
      var l1 = document.createElement("div"); l1.textContent = etiquetaCubo(c, gran, true);
      var l2 = document.createElement("span"); l2.textContent = plural(c.comp, "operación completada", "operaciones completadas") + " · comisión " + dinero(c.comision);
      tip.appendChild(b); tip.appendChild(l1); tip.appendChild(l2);
      tip.classList.remove("hidden");
      var x = rc.left - rb.left + rc.width / 2;
      x = Math.max(tip.offsetWidth / 2 + 4, Math.min(rb.width - tip.offsetWidth / 2 - 4, x));
      tip.style.left = x + "px";
      tip.style.top = Math.max(tip.offsetHeight + 4, top - rb.top - 8) + "px";
    }
    function ocultar() { tip.classList.add("hidden"); caja.querySelectorAll("g.col.on").forEach(function (x) { x.classList.remove("on"); }); }
    caja.querySelectorAll("g.col").forEach(function (g) {
      g.addEventListener("pointerenter", function () { mostrar(g); });
      g.addEventListener("focusin", function () { mostrar(g); });
      g.addEventListener("focusout", ocultar);
    });
    caja.addEventListener("pointerleave", ocultar);
  }
  var redibujo = null;
  window.addEventListener("resize", function () {
    clearTimeout(redibujo);
    redibujo = setTimeout(function () { graficos.forEach(function (g) { dibujarGrafico(g[0], g[1], g[2]); }); }, 150);
  });

  /* ---------- panel lateral con el detalle de una operación ---------- */
  function cerrarDrawer() { var d = $("adDrawer"); if (d) d.remove(); }
  function abrirOperacion(op) {
    cerrarDrawer();
    var c = op.user_id && datos.porId[op.user_id];
    function fila(k, v, extra) { return "<div><dt>" + esc(k) + "</dt><dd>" + esc(v || "—") + (extra || "") + "</dd></div>"; }
    var bg = document.createElement("div");
    bg.className = "ad-drawer-bg"; bg.id = "adDrawer";
    bg.innerHTML =
      '<aside class="ad-drawer" role="dialog" aria-modal="true" aria-labelledby="adDrTit">' +
        '<header><div><span class="ad-sub">Operación</span><h3 id="adDrTit">' + esc(op.codigo || "") + "</h3>" +
          '<div style="margin-top:8px">' + chip(op.estado) + "</div></div>" +
          '<button class="ad-cerrar" id="adDrCerrar" aria-label="Cerrar">×</button></header>' +
        '<div class="ad-drawer-cuerpo">' +
          '<div class="ad-drawer-total"><span>' + (completada(op) ? "Depositado al cliente" : pendiente(op) ? "A depositar al cliente" : "Monto que iba a recibir") + "</span><b>" + dinero(op.neto) + "</b></div>" +
          '<p class="ad-bloque-tit">Cliente</p><dl class="ad-filas">' +
            fila("Nombre", op.nombre) + fila("DNI", op.documento) + fila("Celular", op.celular) +
          "</dl>" +
          '<p class="ad-bloque-tit">Dinero</p><dl class="ad-filas">' +
            fila("Monto cobrado a la tarjeta", dinero(op.monto)) + fila("Comisión", dinero(op.comision)) + fila("Recibe", dinero(op.neto)) +
          "</dl>" +
          '<p class="ad-bloque-tit">Tarjeta y cuenta de destino</p><dl class="ad-filas">' +
            fila("Tarjeta", (op.banco_tarjeta || "—") + " ···· " + (op.ultimos4 || "")) +
            fila("Banco de destino", op.banco_cuenta) +
            fila("Cuenta de destino", op.numero_cuenta, esAdmin() && op.numero_cuenta ? '<button class="ad-copiar" id="adCopiarCta">Copiar</button>' : "") +
          "</dl>" +
          '<p class="ad-bloque-tit">Fechas</p><dl class="ad-filas">' +
            fila("Solicitada", fechaHora(op.creado_en)) + fila("Depositada", op.completada_en ? fechaHora(op.completada_en) : "—") +
          "</dl>" +
        "</div>" +
        "<footer>" +
          (c ? '<button class="btn btn-outline-dark btn-sm" id="adDrFicha">Ver cliente</button>' : "") +
          (esAdmin() && pendiente(op) ? '<button class="btn btn-outline-dark btn-sm" id="adDrCancelar">Cancelar</button><button class="btn btn-primary btn-sm" id="adDrOk">Marcar como pagada</button>' : "") +
        "</footer>" +
      "</aside>";
    document.body.appendChild(bg);
    bg.addEventListener("click", function (e) { if (e.target === bg) cerrarDrawer(); });
    $("adDrCerrar").addEventListener("click", cerrarDrawer);
    $("adDrCerrar").focus();
    if ($("adCopiarCta")) $("adCopiarCta").addEventListener("click", function () {
      try { navigator.clipboard.writeText(String(op.numero_cuenta)); IC.toast("Número de cuenta copiado.", "ok"); }
      catch (e) { IC.toast("No se pudo copiar.", "err"); }
    });
    if ($("adDrFicha")) $("adDrFicha").addEventListener("click", function () { cerrarDrawer(); abrirFicha(op.user_id); });
    if ($("adDrOk")) $("adDrOk").addEventListener("click", function () { confirmarCompletada(op); });
    if ($("adDrCancelar")) $("adDrCancelar").addEventListener("click", function () { confirmarCancelar(op); });
  }

  function irA(v) { vista = v; cerrarDrawer(); render(); window.scrollTo({ top: 0, behavior: "smooth" }); }
  function abrirFicha(id) { fic.id = id; fic.tab = "datos"; irA("ficha"); }

  /* ======================= PANTALLAS ======================= */

  /* ---------- Inicio: lo importante, sin ruido ---------- */
  function vistaInicio(cont) {
    var hoy = new Date();
    var pendPago = datos.ops.filter(pendiente);
    var mes = datos.ops.filter(function (o) { return completada(o) && enRango(o.creado_en, { clave: "mes" }); });
    var mesAnt = datos.ops.filter(function (o) { return completada(o) && enRango(o.creado_en, { clave: "mes_ant" }); });
    var nPend = datos.pendientes.length;

    /* lo que requiere atención: primero lo que más tiempo lleva esperando */
    var items = datos.pendientes.map(function (p) {
      return { f: p.fila.creado_en, tipo: "rev", p: p, t: (p.clase === "identidad" ? "Revisar identidad" : "Revisar tarjeta") + " · " + nombre(p.cliente) };
    }).concat(pendPago.map(function (o) {
      return { f: o.creado_en, tipo: "pago", o: o, t: "Depositar " + (o.codigo || "") + " · " + (o.nombre || ""), m: dinero(o.neto) };
    })).sort(function (a, b) { return new Date(a.f) - new Date(b.f); });

    var gran = ini.gran, desde = gran === "mes" ? new Date(hoy.getFullYear(), hoy.getMonth() - 11, 1) : sumarDias(lunes(hoy), -77);
    var cubos = agrupar(datos.ops.filter(completada), gran, desde, sumarDias(inicioDia(hoy), 1));

    cont.innerHTML =
      '<div class="ad-kpis">' +
        kpi("Por revisar", String(nPend), nPend ? "la más antigua " + hace(datos.pendientes[0].fila.creado_en) : "todo al día", "", "pendientes") +
        kpi("Por depositar", dinero(sumar(pendPago, "neto")), plural(pendPago.length, "operación esperando pago", "operaciones esperando pago"), "", "ops-pend") +
        kpi("Efectivizado este mes", dinero(sumar(mes, "monto")), plural(mes.length, "operación completada", "operaciones completadas"), "", "reportes") +
        kpi("Comisiones este mes", dinero(sumar(mes, "comision")), "mes pasado: " + dinero(sumar(mesAnt, "comision")), "verde", "reportes") +
      "</div>" +
      '<div class="ad-inicio">' +
        '<section class="ad-card">' +
          '<div class="ad-card-tit"><div><h3>Efectivizado por ' + (gran === "mes" ? "mes" : "semana") + "</h3><p>Operaciones completadas · últimos " + (gran === "mes" ? "12 meses" : "12 semanas") + "</p></div>" +
            seg("adIniGran", [["semana", "Semanas"], ["mes", "Meses"]], gran) + "</div>" +
          '<div class="ad-grafico" id="adGrafIni"></div>' +
        "</section>" +
        '<section class="ad-card">' +
          '<div class="ad-card-tit"><div><h3>Requiere atención</h3><p>' + (items.length ? plural(items.length, "pendiente", "pendientes") + ", primero lo más antiguo" : "Nada pendiente") + "</p></div></div>" +
          (items.length
            ? '<ul class="ad-lista">' + items.slice(0, 6).map(function (it, i) {
                return '<li><button data-at="' + i + '"><span class="punto' + (it.tipo === "rev" ? " id" : "") + '" aria-hidden="true"></span>' +
                  '<span class="txt"><b>' + esc(it.t) + "</b><span>" + esc(hace(it.f)) + "</span></span>" +
                  (it.m ? '<span class="der">' + esc(it.m) + "</span>" : "") + ICO.chev + "</button></li>";
              }).join("") + "</ul>"
            : '<div class="ad-todo-ok"><b>✓</b>Todo al día</div>') +
        "</section>" +
      "</div>";

    graficos = [["adGrafIni", cubos, gran]];
    dibujarGrafico("adGrafIni", cubos, gran);
    enlazarSeg("adIniGran", function (v) { ini.gran = v; render(); });
    cont.querySelectorAll("[data-ir]").forEach(function (k) {
      function ir() {
        var d = k.dataset.ir;
        if (d === "ops-pend") { ops.filtro = "pend_pago"; ops.rango = { clave: "todo" }; ops.pag = 1; irA("ops"); }
        else if (d === "reportes") { rep.rango = { clave: "mes" }; irA("reportes"); }
        else irA(d);
      }
      k.addEventListener("click", ir);
      k.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); ir(); } });
    });
    cont.querySelectorAll("[data-at]").forEach(function (b) {
      b.addEventListener("click", function () {
        var it = items[+b.dataset.at];
        if (it.tipo === "pago") abrirOperacion(it.o);
        else { pend.tipo = "todo"; irA("pendientes"); }
      });
    });
  }

  /* ---------- Por revisar ---------- */
  function tarjetaPendiente(item, i) {
    var p = (item.cliente && item.cliente.perfil) || {}, f = item.fila;
    var fotos = item.clase === "identidad"
      ? [["DNI — frente", f.dni_frontal, f.tiene_dni_frontal], ["DNI — reverso", f.dni_posterior, f.tiene_dni_posterior], ["Selfie", f.selfie, f.tiene_selfie]]
      : [["Tarjeta — frente", f.foto_frontal, f.tiene_foto_frontal], ["Tarjeta — reverso", f.foto_posterior, f.tiene_foto_posterior]];
    return '<article class="ad-card">' +
      '<header class="ad-card-head"><div>' +
        '<span class="ad-tipo ' + (item.clase === "identidad" ? "t-id" : "t-card") + '">' + (item.clase === "identidad" ? "Identidad" : "Tarjeta") + "</span>" +
        "<h3>" + esc(nombre(item.cliente)) + "</h3>" +
        '<p class="ad-meta">' + esc(p.tipo_doc || "DNI") + " " + esc(p.documento || "—") + " · " + esc(p.celular || "sin celular") + " · enviado " + esc(hace(f.creado_en)) + "</p>" +
      "</div><div>" + chip(f.estado) + "</div></header>" +
      (item.clase === "tarjeta" ? '<p class="ad-detalle"><b>' + esc(f.banco || "") + "</b> " + esc(f.marca || "") + " ···· " + esc(f.ultimos4 || "") + " · Titular: " + esc(f.titular || "—") + "</p>" : "") +
      (esConsulta()
        ? '<ul class="ad-recibidos">' + fotos.map(function (x) { return '<li class="' + (x[2] ? "si" : "no") + '">' + (x[2] ? "✓ " : "✗ ") + esc(x[0]) + "</li>"; }).join("") + "</ul>"
        : '<div class="ad-fotos">' + fotos.map(function (x) {
            return "<figure><figcaption>" + esc(x[0]) + '</figcaption><div class="ad-foto" data-foto="' + esc(x[1] || "") + '"><span class="ad-cargando"></span></div></figure>';
          }).join("") + "</div>") +
      '<footer class="ad-acciones">' +
        '<button class="btn btn-outline-dark btn-sm" data-ficha-p="' + i + '">Ver cliente</button>' +
        (esAdmin()
          ? '<div class="ad-acciones-der"><button class="btn btn-outline-dark btn-sm ad-wa" data-wa="' + i + '" title="Escribir por WhatsApp" aria-label="Escribir por WhatsApp">' + ICO.wa + "</button>" +
            '<button class="btn btn-danger btn-sm" data-no="' + i + '">Rechazar</button><button class="btn btn-primary btn-sm" data-si="' + i + '">Aprobar</button></div>'
          : '<span class="ad-sub">Solo el administrador ve las fotos y aprueba.</span>') +
      "</footer></article>";
  }
  function vistaPendientes(cont) {
    var todos = datos.pendientes;
    var nId = todos.filter(function (p) { return p.clase === "identidad"; }).length;
    var lista = todos.filter(function (p) { return pend.tipo === "todo" || (pend.tipo === "id" ? p.clase === "identidad" : p.clase === "tarjeta"); });
    if (!todos.length) {
      cont.innerHTML = '<div class="ad-vacio"><div class="ad-vacio-ico">✓</div><h3>Todo al día</h3><p>No hay solicitudes esperando revisión.</p></div>';
      return;
    }
    cont.innerHTML =
      '<div class="ad-toolbar">' + seg("adPendTipo", [["todo", "Todo (" + todos.length + ")"], ["id", "Identidad (" + nId + ")"], ["tarj", "Tarjetas (" + (todos.length - nId) + ")"]], pend.tipo) +
        '<span class="ad-espacio"></span><span class="ad-nota-fecha">Primero lo que más tiempo lleva esperando</span></div>' +
      (lista.length ? lista.map(function (it) { return tarjetaPendiente(it, todos.indexOf(it)); }).join("") : '<div class="ad-vacio"><h3>Nada en esta categoría</h3></div>');
    enlazarSeg("adPendTipo", function (v) { pend.tipo = v; render(); });
    if (esAdmin()) pintarFotos(cont);
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
    var f = {
      nombre: function (a, b) { return nombre(a).localeCompare(nombre(b), "es"); },
      registro: function (a, b) { return new Date(a.perfil.creado_en) - new Date(b.perfil.creado_en); },
      ops: function (a, b) { return a.ops.length - b.ops.length; }
    }[cli.orden];
    return l.sort(function (a, b) { return f(a, b) * cli.dir; });
  }
  function vistaClientes(cont) {
    if (!datos.clientes.length) { cont.innerHTML = '<div class="ad-vacio"><h3>Aún no hay clientes</h3><p>Aparecerán aquí en cuanto alguien se registre.</p></div>'; return; }
    var lista = listaClientes(), vis = pagina(lista, cli);
    var filtros = [["todos", "Todos"], ["pendientes", "Por revisar"], ["verificados", "Verificados"], ["sin_dni", "Sin DNI"]];
    cont.innerHTML =
      '<div class="ad-barra">' +
        '<div class="ad-buscador">' + ICO.buscar + '<input id="adBuscarCli" type="search" aria-label="Buscar clientes" placeholder="' + (esConsulta() ? "Buscar por nombre o DNI" : "Buscar por nombre, DNI, celular o correo") + '" value="' + esc(cli.q) + '"></div>' +
        '<div class="ad-filtros">' + filtros.map(function (f) { return '<button class="ad-filtro' + (cli.filtro === f[0] ? " on" : "") + '" data-f="' + f[0] + '">' + f[1] + "</button>"; }).join("") + "</div>" +
        (esAdmin() ? '<button class="btn btn-outline-dark btn-sm ad-excel" id="adExpCli">' + ICO.excel + " Excel</button>" : "") +
      "</div>" +
      (lista.length
        ? '<div class="ad-tabla-wrap"><table class="ad-tabla cards"><thead><tr>' +
            th("Cliente", "nombre", cli) + th("Documento") + th("Celular") + th("Identidad") + th("Tarjetas") + th("Operaciones", "ops", cli, "centro") + th("Registro", "registro", cli) +
          "</tr></thead><tbody>" + vis.map(function (c) {
            var revT = c.tarjetas.filter(function (t) { return t.estado === "en_revision"; }).length;
            return '<tr class="fila-link" tabindex="0" data-k="' + esc(c.id) + '">' +
              '<td data-label="Cliente"><b>' + esc(nombre(c)) + "</b>" + (c.perfil.email ? '<span class="ad-sub">' + esc(c.perfil.email) + "</span>" : "") + "</td>" +
              '<td class="nowrap" data-label="Documento">' + esc((c.perfil.tipo_doc || "DNI") + " " + (c.perfil.documento || "")) + "</td>" +
              '<td class="nowrap" data-label="Celular">' + esc(c.perfil.celular || "—") + "</td>" +
              '<td data-label="Identidad">' + chip(estadoIdentidad(c)) + "</td>" +
              '<td data-label="Tarjetas">' + (c.tarjetas.length ? "<b>" + c.tarjetas.length + "</b>" + (revT ? ' <span class="ad-chip warn">' + revT + " en revisión</span>" : "") : '<span class="ad-sub">—</span>') + "</td>" +
              '<td class="centro" data-label="Operaciones"><b>' + c.ops.length + "</b></td>" +
              '<td class="fecha" data-label="Registro">' + esc(fecha(c.perfil.creado_en)) + "</td></tr>";
          }).join("") + "</tbody></table></div>" + paginador(lista.length, cli, "cli", ["cliente", "clientes"])
        : '<div class="ad-vacio"><h3>Sin resultados</h3><p>Prueba con otro nombre o quita los filtros.</p></div>');
    enlazarBuscador("adBuscarCli", function (v) { cli.q = v; cli.pag = 1; });
    cont.querySelectorAll("[data-f]").forEach(function (b) { b.addEventListener("click", function () { cli.filtro = b.dataset.f; cli.pag = 1; render(); }); });
    if ($("adExpCli")) $("adExpCli").addEventListener("click", function () { descargarCSV("clientes-" + isoLocal(new Date()), filasClientes(lista)); });
    enlazarOrden(cont, cli); enlazarPaginador(cont, "cli", cli);
    filasClicables(cont, function (k) { abrirFicha(k); });
  }

  /* ---------- Ficha del cliente ---------- */
  function vistaFicha(cont) {
    var c = datos.porId[fic.id];
    if (!c) { vista = "clientes"; render(); return; }
    var p = c.perfil, idn = c.docs[0], comp = c.ops.filter(completada), pp = c.ops.filter(pendiente);
    function fila(k, v) { return "<div><dt>" + esc(k) + "</dt><dd>" + esc(v || "—") + "</dd></div>"; }

    var avisos = [];
    if (!idn) avisos.push(["", "Todavía no subió su DNI ni su selfie."]);
    else if (idn.estado === "en_revision") avisos.push(["warn", "Su identidad espera revisión desde " + fechaHora(idn.creado_en) + "."]);
    else if (idn.estado === "rechazado") avisos.push(["err", "Identidad rechazada" + (idn.motivo ? ": «" + idn.motivo + "»" : "") + "."]);
    if (pp.length) avisos.push(["warn", plural(pp.length, "operación pendiente", "operaciones pendientes") + " de pago por " + dinero(sumar(pp, "neto")) + "."]);
    if (esAdmin()) {
      var cel = String(p.celular || "").replace(/\D/g, ""), mail = String(p.email || "").toLowerCase();
      datos.clientes.forEach(function (o) {
        if (o.id === c.id) return;
        var oc = String(o.perfil.celular || "").replace(/\D/g, ""), om = String(o.perfil.email || "").toLowerCase();
        if ((cel && oc === cel) || (mail && om === mail)) avisos.push(["err", "Posible duplicado: " + nombre(o) + " (" + (o.perfil.documento || "sin DNI") + ") usa el mismo " + (cel && oc === cel ? "celular" : "correo") + "."]);
      });
    }

    var cuerpo = "";
    if (fic.tab === "datos") {
      var fotosId = idn ? [["DNI — frente", idn.dni_frontal, idn.tiene_dni_frontal], ["DNI — reverso", idn.dni_posterior, idn.tiene_dni_posterior], ["Selfie", idn.selfie, idn.tiene_selfie]] : [];
      cuerpo =
        '<p class="ad-bloque-tit">Identidad</p>' +
        (idn
          ? '<p class="ad-detalle" style="margin-top:0">' + chip(idn.estado) + " Enviado el " + esc(fechaHora(idn.creado_en)) + (idn.revisado_en ? " · revisado el " + esc(fechaHora(idn.revisado_en)) : "") + "</p>" +
            (esConsulta()
              ? '<ul class="ad-recibidos">' + fotosId.map(function (x) { return '<li class="' + (x[2] ? "si" : "no") + '">' + (x[2] ? "✓ " : "✗ ") + esc(x[0]) + "</li>"; }).join("") + "</ul>"
              : '<div class="ad-fotos">' + fotosId.filter(function (x) { return x[1]; }).map(function (x) {
                  return "<figure><figcaption>" + esc(x[0]) + '</figcaption><div class="ad-foto" data-foto="' + esc(x[1]) + '"><span class="ad-cargando"></span></div></figure>';
                }).join("") + "</div>")
          : '<p class="ad-sub">Todavía no subió su DNI ni su selfie.</p>') +
        '<p class="ad-bloque-tit">Tarjetas</p>' +
        (c.tarjetas.length ? c.tarjetas.map(function (t) {
          var fs = [["Frente", t.foto_frontal], ["Reverso", t.foto_posterior]].filter(function (x) { return x[1]; });
          return '<div class="ad-sub-bloque"><p class="ad-detalle" style="margin:0"><b>' + esc(t.banco || "") + "</b> " + esc(t.marca || "") + " ····" + esc(t.ultimos4 || "") +
            " · Titular: " + esc(t.titular || "—") + (t.principal ? " · principal" : "") + " " + chip(t.estado) + "</p>" +
            (esAdmin() && fs.length ? '<div class="ad-fotos">' + fs.map(function (x) {
              return "<figure><figcaption>" + esc(x[0]) + '</figcaption><div class="ad-foto" data-foto="' + esc(x[1]) + '"><span class="ad-cargando"></span></div></figure>';
            }).join("") + "</div>" : "") + "</div>";
        }).join("") : '<p class="ad-sub">Todavía no registró ninguna tarjeta.</p>') +
        '<p class="ad-bloque-tit">Cuentas donde recibe el dinero</p>' +
        (c.cuentas.length ? c.cuentas.map(function (a) {
          return '<dl class="ad-filas ad-sub-bloque">' + fila("Banco", a.banco) + fila("Número", a.numero) + fila("Tipo", (a.tipo || "") + " · " + (a.moneda || "")) +
            (esAdmin() ? fila("CCI", a.cci) : "") + fila("Titular", a.titular) + "</dl>";
        }).join("") : '<p class="ad-sub">Todavía no registró ninguna cuenta.</p>');
    } else if (fic.tab === "ops") {
      cuerpo = c.ops.length
        ? '<div class="ad-tabla-wrap" style="box-shadow:none;border:1px solid #eef1ef"><table class="ad-tabla cards"><thead><tr><th>Código</th><th class="dinero">Monto</th><th class="dinero">Recibe</th><th>Estado</th><th>Fecha</th></tr></thead><tbody>' +
          c.ops.map(function (o, i) {
            return '<tr class="fila-link" tabindex="0" data-k="' + i + '"><td data-label="Código"><b>' + esc(o.codigo || "") + '</b></td><td class="dinero" data-label="Monto">' + dinero(o.monto) +
              '</td><td class="dinero" data-label="Recibe"><b>' + dinero(o.neto) + '</b></td><td data-label="Estado">' + chip(o.estado) + '</td><td class="fecha" data-label="Fecha">' + esc(fecha(o.creado_en)) + "</td></tr>";
          }).join("") + "</tbody></table></div>"
        : '<p class="ad-sub">Todavía no hizo ninguna operación.</p>';
    } else if (fic.tab === "notas") {
      cuerpo = !hay.notas
        ? '<p class="ad-sub">Las notas se activan al ejecutar supabase-equipo-consulta.sql en Supabase.</p>'
        : (esAdmin() ? '<div class="ad-nota-form"><label for="adNota" class="sr-only">Nueva nota</label><textarea id="adNota" rows="2" maxlength="2000" placeholder="Ej. Llamó hoy: prefiere que lo contacten por la tarde."></textarea><button class="btn btn-primary btn-sm" id="adGuardarNota">Guardar nota</button></div>' : "") +
          (c.notas.length ? '<ul class="ad-notas">' + c.notas.map(function (n) {
            return "<li><p>" + esc(n.texto) + '</p><span class="ad-sub">' + esc(n.autor_email || "Equipo") + " · " + esc(fechaHora(n.creado_en)) + "</span></li>";
          }).join("") + "</ul>" : '<p class="ad-sub" style="margin-top:12px">Sin notas todavía.</p>');
    } else {
      var h = [];
      if (esAdmin() && hay.historial) datos.historial.filter(function (x) { return x.cliente_id === c.id; }).forEach(function (x) { h.push([x.creado_en, (x.actor_email || (x.actor_rol === "cliente" ? "El cliente" : "Sistema")) + " " + textoAccion(x) + detalleAccion(x)]); });
      h.push([p.creado_en, "Se registró"]);
      c.docs.forEach(function (d) { h.push([d.creado_en, "Subió su DNI y selfie"]); });
      c.tarjetas.forEach(function (t) { h.push([t.creado_en, "Registró la tarjeta " + (t.banco || "") + " ····" + (t.ultimos4 || "")]); });
      c.ops.forEach(function (o) { h.push([o.creado_en, "Pidió la operación " + (o.codigo || "") + " por " + dinero(o.monto)]); if (o.completada_en && !(esAdmin() && hay.historial)) h.push([o.completada_en, "Operación " + (o.codigo || "") + " completada"]); });
      h.sort(function (a, b) { return new Date(b[0]) - new Date(a[0]); });
      cuerpo = '<ul class="ad-linea">' + h.slice(0, 40).map(function (x) { return "<li><span>" + esc(x[1]) + "</span><time>" + esc(fechaHora(x[0])) + "</time></li>"; }).join("") + "</ul>";
    }

    cont.innerHTML =
      '<button class="btn btn-outline-dark btn-sm ad-volver" id="adVolver">‹ Volver a clientes</button>' +
      '<article class="ad-card">' +
        '<div class="ad-ficha-cab"><div><h2>' + esc(nombre(c)) + "</h2>" +
          '<p class="ad-meta">' + esc((p.tipo_doc || "DNI") + " " + (p.documento || "")) + " · " + esc(p.celular || "sin celular") + " · " + esc(p.email || "sin correo") + "</p>" +
          '<p class="ad-meta">Cliente desde ' + esc(fecha(p.creado_en)) + " · última actividad " + esc(hace(c.ultima)) + "</p>" +
          '<div class="chips">' + chip(estadoIdentidad(c)) + "</div></div>" +
          (esAdmin() ? '<button class="btn btn-outline-dark btn-sm ad-wa" id="adWaFicha">' + ICO.wa + " WhatsApp</button>" : "") +
        "</div>" +
        '<div class="ad-mini"><div><span>Operaciones</span><b>' + c.ops.length + '</b></div><div><span>Efectivizado</span><b>' + dinero(sumar(comp, "monto")) + '</b></div><div><span>Comisión</span><b>' + dinero(sumar(comp, "comision")) + "</b></div></div>" +
        (avisos.length ? '<ul class="ad-avisos">' + avisos.map(function (a) { return '<li class="' + a[0] + '">' + esc(a[1]) + "</li>"; }).join("") + "</ul>" : "") +
      "</article>" +
      '<article class="ad-card">' +
        '<nav class="ad-subtabs" aria-label="Secciones de la ficha">' +
          [["datos", "Datos y documentos"], ["ops", "Operaciones (" + c.ops.length + ")"], ["notas", "Notas" + (c.notas.length ? " (" + c.notas.length + ")" : "")], ["hist", "Historial"]].map(function (t) {
            return '<button data-ft="' + t[0] + '" class="' + (fic.tab === t[0] ? "on" : "") + '"' + (fic.tab === t[0] ? ' aria-current="page"' : "") + ">" + t[1] + "</button>";
          }).join("") + "</nav>" + cuerpo +
      "</article>";

    if (esAdmin()) pintarFotos(cont);
    $("adVolver").addEventListener("click", function () { irA("clientes"); });
    if ($("adWaFicha")) $("adWaFicha").addEventListener("click", function () { waCliente(p); });
    cont.querySelectorAll("[data-ft]").forEach(function (b) { b.addEventListener("click", function () { fic.tab = b.dataset.ft; render(); }); });
    if (fic.tab === "ops") filasClicables(cont, function (k) { abrirOperacion(c.ops[+k]); });
    if ($("adGuardarNota")) $("adGuardarNota").addEventListener("click", function () {
      var t = $("adNota").value.trim();
      if (!t) { IC.toast("Escribe la nota primero.", "err"); $("adNota").focus(); return; }
      guardarNota(c, t, this);
    });
  }

  /* ---------- Operaciones ---------- */
  function vistaOps(cont) {
    var enR = datos.ops.filter(function (o) { return enRango(o.creado_en, ops.rango); });
    var comp = enR.filter(completada), pp = enR.filter(pendiente), cc = enR.filter(cancelada);
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
    var filtros = [["todas", "Todas (" + enR.length + ")"], ["pend_pago", "Por pagar (" + pp.length + ")"], ["completada", "Completadas (" + comp.length + ")"], ["cancelada", "Canceladas (" + cc.length + ")"]];

    cont.innerHTML =
      '<div class="ad-toolbar">' + controlFechas("adFechaOps", ops.rango) + '<span class="ad-nota-fecha">por fecha de la operación</span></div>' +
      '<div class="ad-kpis">' +
        kpi("Efectivizado", dinero(sumar(comp, "monto")), plural(comp.length, "operación completada", "operaciones completadas")) +
        kpi("Esperando pago", dinero(sumar(pp, "monto")), plural(pp.length, "operación", "operaciones") + " · " + dinero(sumar(pp, "comision")) + " de comisión") +
        kpi(esConsulta() ? "Comisiones cobradas" : "Tus comisiones cobradas", dinero(sumar(comp, "comision")), "solo operaciones completadas", "verde") +
      "</div>" +
      '<div class="ad-barra">' +
        '<div class="ad-buscador">' + ICO.buscar + '<input id="adBuscarOps" type="search" aria-label="Buscar operaciones" placeholder="Buscar por código, cliente, DNI o tarjeta" value="' + esc(ops.q) + '"></div>' +
        '<div class="ad-filtros">' + filtros.map(function (x) { return '<button class="ad-filtro' + (ops.filtro === x[0] ? " on" : "") + '" data-fo="' + x[0] + '">' + x[1] + "</button>"; }).join("") + "</div>" +
        (esAdmin() ? '<button class="btn btn-outline-dark btn-sm ad-excel" id="adExpOps">' + ICO.excel + " Excel</button>" : "") +
      "</div>" +
      (lista.length
        ? '<div class="ad-tabla-wrap"><table class="ad-tabla cards"><thead><tr>' +
            th("Código", "codigo", ops) + th("Cliente") + th("Monto", "monto", ops, "dinero") + th("Comisión", null, null, "dinero") + th("Recibe", null, null, "dinero") + th("Estado") + th("Fecha", "fecha", ops) + (esAdmin() ? th("") : "") +
          "</tr></thead><tbody>" + vis.map(function (o, i) {
            return '<tr class="fila-link" tabindex="0" data-k="' + i + '"><td data-label="Código"><b>' + esc(o.codigo || "") + "</b></td>" +
              '<td data-label="Cliente">' + esc(o.nombre || "") + '<span class="ad-sub">' + esc(o.documento || "") + "</span></td>" +
              '<td class="dinero" data-label="Monto">' + dinero(o.monto) + '</td><td class="dinero" data-label="Comisión">' + dinero(o.comision) + '</td><td class="dinero" data-label="Recibe"><b>' + dinero(o.neto) + "</b></td>" +
              '<td data-label="Estado">' + chip(o.estado) + '</td><td class="fecha" data-label="Fecha">' + esc(fecha(o.creado_en)) + "</td>" +
              (esAdmin() ? '<td data-label="">' + (pendiente(o) ? '<button class="btn btn-primary btn-sm" data-pagar="' + i + '">Depositar</button>' : '<span class="ad-sub">Ver ›</span>') + "</td>" : "") +
              "</tr>";
          }).join("") + "</tbody></table></div>" + paginador(lista.length, ops, "ops", ["operación", "operaciones"])
        : '<div class="ad-vacio"><h3>Sin operaciones</h3><p>Prueba con otro periodo, otro código o quita los filtros.</p></div>');

    enlazarFechas("adFechaOps", ops.rango, function () { ops.pag = 1; render(); });
    enlazarBuscador("adBuscarOps", function (v) { ops.q = v; ops.pag = 1; });
    cont.querySelectorAll("[data-fo]").forEach(function (b) { b.addEventListener("click", function () { ops.filtro = b.dataset.fo; ops.pag = 1; render(); }); });
    if ($("adExpOps")) $("adExpOps").addEventListener("click", function () { descargarCSV("operaciones-" + sufijoRango(ops.rango), filasOperaciones(lista)); });
    enlazarOrden(cont, ops); enlazarPaginador(cont, "ops", ops);
    filasClicables(cont, function (k) { abrirOperacion(vis[+k]); });
    cont.querySelectorAll("[data-pagar]").forEach(function (b) { b.addEventListener("click", function () { abrirOperacion(vis[+b.dataset.pagar]); }); });
  }

  /* ---------- Reportes: gráfico + tabla + descargas por fecha ---------- */
  function vistaReportes(cont) {
    var l = limites(rep.rango);
    var desde = l[0] || inicioDia(primeraFecha()), hasta = l[1] || sumarDias(inicioDia(new Date()), 1);
    var dias = Math.round((hasta - desde) / 864e5);
    var gran = rep.agrupar === "auto" ? (dias <= 31 ? "dia" : dias <= 140 ? "semana" : "mes") : rep.agrupar;
    if (gran === "dia" && dias > 92) gran = "semana";      // demasiadas barras: se agrupa por semana
    var enR = datos.ops.filter(function (o) { return enRango(o.creado_en, rep.rango); });
    var cubos = agrupar(enR, gran, desde, hasta);
    var comp = enR.filter(completada), cc = enR.filter(cancelada);
    var nuevos = datos.clientes.filter(function (c) { return enRango(c.perfil.creado_en, rep.rango); });
    var nombreGran = { dia: "día", semana: "semana", mes: "mes" }[gran];

    cont.innerHTML =
      '<div class="ad-toolbar">' + controlFechas("adFechaRep", rep.rango) +
        seg("adRepGran", [["dia", "Por día"], ["semana", "Por semana"], ["mes", "Por mes"]], gran) +
      "</div>" +
      '<div class="ad-kpis">' +
        kpi("Efectivizado", dinero(sumar(comp, "monto")), plural(comp.length, "operación completada", "operaciones completadas")) +
        kpi("Comisiones", dinero(sumar(comp, "comision")), "solo completadas", "verde") +
        kpi("Solicitudes", String(enR.length), cc.length ? plural(cc.length, "cancelada", "canceladas") : "ninguna cancelada") +
        kpi("Clientes nuevos", String(nuevos.length), "registrados en el periodo") +
      "</div>" +
      '<section class="ad-card"><div class="ad-card-tit"><div><h3>Efectivizado por ' + nombreGran + "</h3><p>" + esc(nombreRango(rep.rango)) + " · operaciones completadas</p></div></div>" +
        '<div class="ad-grafico" id="adGrafRep"></div></section>' +
      '<section class="ad-card"><div class="ad-card-tit"><div><h3>Detalle por ' + nombreGran + "</h3><p>Los mismos números del gráfico, en tabla</p></div>" +
        (esAdmin() ? '<button class="btn btn-outline-dark btn-sm ad-excel" id="adExpResumen">' + ICO.excel + " Descargar tabla</button>" : "") + "</div>" +
        '<div class="ad-tabla-wrap" style="box-shadow:none;border:1px solid #eef1ef"><table class="ad-tabla cards"><thead><tr><th>Periodo</th><th class="centro">Solicitudes</th><th class="centro">Completadas</th><th class="dinero">Efectivizado</th><th class="dinero">Comisión</th><th class="centro">Canceladas</th></tr></thead><tbody>' +
          cubos.slice().reverse().filter(function (c) { return c.n; }).map(function (c) {
            return '<tr><td data-label="Periodo">' + esc(etiquetaCubo(c, gran, true)) + '</td><td class="centro" data-label="Solicitudes">' + c.n + '</td><td class="centro" data-label="Completadas">' + c.comp +
              '</td><td class="dinero" data-label="Efectivizado"><b>' + dinero(c.monto) + '</b></td><td class="dinero" data-label="Comisión">' + dinero(c.comision) + '</td><td class="centro" data-label="Canceladas">' + c.canc + "</td></tr>";
          }).join("") +
        '</tbody><tfoot><tr><td data-label="">Total</td><td class="centro" data-label="Solicitudes">' + enR.length + '</td><td class="centro" data-label="Completadas">' + comp.length +
          '</td><td class="dinero" data-label="Efectivizado">' + dinero(sumar(comp, "monto")) + '</td><td class="dinero" data-label="Comisión">' + dinero(sumar(comp, "comision")) + '</td><td class="centro" data-label="Canceladas">' + cc.length + "</td></tr></tfoot></table></div>" +
        (enR.length ? "" : '<p class="ad-sub" style="margin-top:12px">No hay operaciones en este periodo.</p>') +
      "</section>" +
      '<section class="ad-card"><div class="ad-card-tit"><div><h3>Descargar para Excel</h3><p>Del periodo elegido: ' + esc(nombreRango(rep.rango)) + "</p></div></div>" +
        (esAdmin()
          ? '<div class="ad-filtros"><button class="btn btn-outline-dark btn-sm ad-excel" id="adExpRepOps">' + ICO.excel + " Operaciones (" + enR.length + ")</button>" +
            '<button class="btn btn-outline-dark btn-sm ad-excel" id="adExpRepCli">' + ICO.excel + " Clientes nuevos (" + nuevos.length + ")</button></div>"
          : '<p class="ad-sub">Las descargas son solo para el administrador.</p>') +
      "</section>";

    graficos = [["adGrafRep", cubos, gran]];
    dibujarGrafico("adGrafRep", cubos, gran);
    enlazarFechas("adFechaRep", rep.rango, function () { rep.agrupar = "auto"; render(); });
    enlazarSeg("adRepGran", function (v) { rep.agrupar = v; render(); });
    var suf = sufijoRango(rep.rango);
    if ($("adExpResumen")) $("adExpResumen").addEventListener("click", function () {
      descargarCSV("resumen-por-" + gran + "-" + suf, cubos.filter(function (c) { return c.n; }).map(function (c) {
        return { "Periodo": etiquetaCubo(c, gran, true), "Desde": isoLocal(c.desde), "Hasta": isoLocal(sumarDias(c.hasta, -1)), "Solicitudes": c.n, "Completadas": c.comp,
                 "Efectivizado": Math.round(c.monto * 100) / 100, "Comision": Math.round(c.comision * 100) / 100, "Depositado a clientes": Math.round(c.neto * 100) / 100,
                 "Pendientes": c.pend, "Canceladas": c.canc };
      }));
    });
    if ($("adExpRepOps")) $("adExpRepOps").addEventListener("click", function () { descargarCSV("operaciones-" + suf, filasOperaciones(enR)); });
    if ($("adExpRepCli")) $("adExpRepCli").addEventListener("click", function () { descargarCSV("clientes-nuevos-" + suf, filasClientes(nuevos)); });
  }

  /* ---------- Equipo (solo administrador) ---------- */
  function textoAccion(h) {
    if (h.accion === "ingreso_panel") return "entró al panel";
    if (h.accion === "equipo_alta") return "dio acceso de consulta a " + ((h.detalle && (h.detalle.nombre || h.detalle.email)) || "una persona");
    if (h.accion === "equipo_baja") return "quitó el acceso a " + ((h.detalle && h.detalle.nombre) || "una persona");
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
  async function cargarEquipo() {
    try { eq.lista = await api("/rest/v1/rpc/equipo_listar", { method: "POST", body: "{}" }) || []; eq.error = null; }
    catch (e) { eq.lista = []; eq.error = (e.status === 404 || e.code === "PGRST202") ? "falta_sql" : e.message; }
  }
  function claveTemporal() {
    var abc = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ", num = "23456789", todo = abc + num, r = new Uint32Array(12), s = "";
    crypto.getRandomValues(r);
    for (var i = 0; i < 12; i++) s += todo[r[i] % todo.length];
    return s.slice(0, 10) + num[r[10] % num.length] + abc[r[11] % abc.length];   // siempre con número y letra
  }
  function agregarTrabajador() {
    IC.modal({
      title: "Agregar trabajador",
      html: '<p class="muted">Tendrá acceso de <b>solo lectura</b>: ve clientes y operaciones, pero no puede cambiar nada ni descargar datos.</p>' +
        '<div class="field mt-8"><label for="eqNombre">Nombre</label><input id="eqNombre" maxlength="80" placeholder="Ej. Lucía Ramos" autocomplete="off"></div>' +
        '<div class="field"><label for="eqCorreo">Correo con el que entrará</label><input id="eqCorreo" type="email" maxlength="120" placeholder="lucia@ejemplo.com" autocomplete="off"></div>' +
        '<div class="field"><label for="eqClave">Contraseña temporal</label><div class="ad-clave-gen"><input id="eqClave" maxlength="72" autocomplete="off" spellcheck="false"><button type="button" class="btn btn-outline-dark btn-sm" id="eqGenerar">Generar</button></div></div>' +
        '<p class="muted" style="font-size:.78rem">Al entrar por primera vez, que la cambie en «Mi cuenta → Cambiar contraseña».</p>' +
        '<p class="form-error hidden" id="eqErr"></p>',
      actions: [
        { label: "Cancelar", cls: "btn-outline-dark" },
        { label: "Crear acceso", cls: "btn-primary", keepOpen: true, onClick: async function (b) {
            var nom = $("eqNombre").value.trim(), correo = $("eqCorreo").value.trim().toLowerCase(), clave = $("eqClave").value, err = $("eqErr");
            function mal(t) { err.textContent = t; err.classList.remove("hidden"); }
            if (nom.length < 2) return mal("Escribe su nombre.");
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(correo)) return mal("Escribe un correo válido.");
            if (!validarClave(clave)) return mal("La contraseña necesita 8 caracteres o más, con letras y al menos un número.");
            b.disabled = true; b.textContent = "Creando...";
            var nueva = true;
            try {
              try {
                await api("/auth/v1/signup", { method: "POST", sinSesion: true, body: JSON.stringify({ email: correo, password: clave, data: { nombre: nom, equipo: true } }) });
              } catch (e) {
                if (/already|registered|exists/i.test(e.message)) nueva = false; else throw e;
              }
              await api("/rest/v1/rpc/equipo_agregar", { method: "POST", body: JSON.stringify({ p_email: correo, p_nombre: nom }) });
              IC.closeModal();
              mostrarCredenciales(nom, correo, nueva ? clave : null);
              await cargarEquipo();
              try { await cargar(); } catch (e) {}
              render();
            } catch (e) {
              b.disabled = false; b.textContent = "Crear acceso";
              mal((e.status === 404 || e.code === "PGRST202") ? "Primero ejecuta supabase-equipo-consulta.sql en Supabase." : (e.message || "No se pudo crear."));
            }
          } }
      ]
    });
    $("eqGenerar").addEventListener("click", function () { $("eqClave").value = claveTemporal(); });
  }
  function mostrarCredenciales(nom, correo, clave) {
    var link = location.origin + "/admin";
    var texto = "Hola " + nom + ", este es tu acceso al panel de Impulsa Crédito:\n" + link + "\nCorreo: " + correo + (clave ? "\nContraseña temporal: " + clave + "\nCámbiala al entrar en Mi cuenta → Cambiar contraseña." : "");
    IC.modal({
      title: "Acceso creado",
      html: '<div class="ad-credenciales">Panel: <code>' + esc(link) + "</code><br>Correo: <code>" + esc(correo) + "</code><br>" +
        (clave ? "Contraseña temporal: <code>" + esc(clave) + "</code>" : "Ese correo ya tenía cuenta: entra con su contraseña de siempre.") + "</div>" +
        '<p class="muted mt-8">Envíaselo por un medio privado. Esta contraseña no se vuelve a mostrar.</p>',
      actions: [
        { label: "Copiar mensaje", cls: "btn-outline-dark", keepOpen: true, onClick: function () {
            try { navigator.clipboard.writeText(texto); IC.toast("Copiado. Pégalo en un chat privado con esa persona.", "ok"); } catch (e) { IC.toast("No se pudo copiar.", "err"); }
          } },
        { label: "Listo", cls: "btn-primary" }
      ]
    });
  }
  function vistaEquipo(cont) {
    if (!esAdmin()) { irA("inicio"); return; }
    if (eq.lista === null) {
      cont.innerHTML = '<div class="ad-vacio"><span class="ad-cargando grande"></span><p>Cargando el equipo...</p></div>';
      cargarEquipo().then(render);
      return;
    }
    var act = datos.historial.filter(function (h) {
      if (eq.filtro === "cambios") return h.accion === "cambio_estado";
      if (eq.filtro === "ingresos") return h.accion === "ingreso_panel";
      if (eq.filtro === "equipo") return /^equipo_/.test(h.accion);
      return true;
    });
    var vis = pagina(act, eq);
    var nombres = {};
    eq.lista.forEach(function (t) { nombres[t.email] = t.nombre; });
    cont.innerHTML =
      '<section class="ad-card"><div class="ad-card-tit"><div><h3>Trabajadores</h3><p>Acceso de solo lectura al panel. El administrador eres tú.</p></div>' +
        (eq.error !== "falta_sql" ? '<button class="btn btn-primary btn-sm" id="eqAgregar">+ Agregar trabajador</button>' : "") + "</div>" +
        (eq.error === "falta_sql"
          ? '<p class="ad-sub">Para agregar trabajadores, primero ejecuta <b>supabase-equipo-consulta.sql</b> en Supabase (SQL Editor → Run).</p>'
          : eq.error ? '<p class="ad-sub">No se pudo cargar el equipo: ' + esc(eq.error) + "</p>"
          : eq.lista.length
            ? '<ul class="ad-equipo">' + eq.lista.map(function (t, i) {
                return '<li><span class="ad-avatar" aria-hidden="true">' + esc((t.nombre || t.email || "?").charAt(0)) + "</span>" +
                  '<div class="quien"><b>' + esc(t.nombre || "Sin nombre") + "</b><span>" + esc(t.email || "") + " · desde " + esc(fecha(t.desde)) +
                  " · " + (t.ultimo_ingreso ? "último ingreso " + esc(hace(t.ultimo_ingreso)) : "aún no entra") + "</span></div>" +
                  '<div class="acc"><button class="btn btn-outline-dark btn-sm" data-eqclave="' + i + '">Enviar cambio de contraseña</button>' +
                  '<button class="btn btn-outline-dark btn-sm" data-eqquitar="' + i + '">Quitar acceso</button></div></li>';
              }).join("") + "</ul>"
            : '<p class="ad-sub">Todavía no agregaste a nadie.</p>') +
      "</section>" +
      '<section class="ad-card"><div class="ad-card-tit"><div><h3>Actividad</h3><p>Quién aprobó, rechazó, pagó o canceló, y cuándo. Lo registra el servidor y no se puede borrar.</p></div>' +
        seg("adEqFiltro", [["todo", "Todo"], ["cambios", "Cambios"], ["ingresos", "Ingresos"], ["equipo", "Equipo"]], eq.filtro) + "</div>" +
        (!hay.historial
          ? '<p class="ad-sub">El historial se activa al ejecutar supabase-equipo-consulta.sql.</p>'
          : act.length
            ? '<div class="ad-tabla-wrap" style="box-shadow:none;border:1px solid #eef1ef"><table class="ad-tabla cards"><thead><tr><th>Fecha</th><th>Quién</th><th>Qué hizo</th><th>Cliente</th></tr></thead><tbody>' +
                vis.map(function (h) {
                  var c = h.cliente_id && datos.porId[h.cliente_id];
                  return '<tr><td class="fecha" data-label="Fecha">' + esc(fechaHora(h.creado_en)) + '</td><td data-label="Quién"><b>' + esc(nombres[h.actor_email] || h.actor_email || (h.actor_rol === "cliente" ? "Cliente" : "Sistema")) + "</b>" +
                    '<span class="ad-sub">' + esc(h.actor_rol || "") + '</span></td><td data-label="Qué hizo">' + esc(textoAccion(h) + detalleAccion(h)) + '</td><td data-label="Cliente">' + (c ? esc(nombre(c)) : '<span class="ad-sub">—</span>') + "</td></tr>";
                }).join("") + "</tbody></table></div>" + paginador(act.length, eq, "act", ["registro", "registros"])
            : '<p class="ad-sub">Sin movimientos todavía.</p>') +
      "</section>";
    if ($("eqAgregar")) $("eqAgregar").addEventListener("click", agregarTrabajador);
    enlazarSeg("adEqFiltro", function (v) { eq.filtro = v; eq.pag = 1; render(); });
    enlazarPaginador(cont, "act", eq);
    cont.querySelectorAll("[data-eqquitar]").forEach(function (b) {
      b.addEventListener("click", function () {
        var t = eq.lista[+b.dataset.eqquitar];
        IC.modal({
          title: "Quitar acceso",
          html: "<p><b>" + esc(t.nombre || t.email) + "</b> ya no podrá entrar al panel. Su cuenta no se borra: puedes volver a darle acceso cuando quieras.</p>",
          actions: [
            { label: "Volver", cls: "btn-outline-dark" },
            { label: "Quitar acceso", cls: "btn-danger", onClick: function () {
                accion(async function () {
                  await api("/rest/v1/rpc/equipo_quitar", { method: "POST", body: JSON.stringify({ p_id: t.id }) });
                  IC.toast("Acceso quitado.", "ok");
                  await cargarEquipo(); await cargar(); render();
                });
              } }
          ]
        });
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

  /* ======================= despachador ======================= */
  function render() {
    var cont = $("adView"), n = datos.pendientes.length;
    graficos = [];
    $("adBadge").textContent = n;
    $("adBadge").style.display = n ? "" : "none";
    document.querySelectorAll(".ad-tab").forEach(function (b) {
      var on = b.dataset.v === vista || (vista === "ficha" && b.dataset.v === "clientes");
      b.classList.toggle("on", on);
      if (on) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
    });
    if (vista === "inicio") return vistaInicio(cont);
    if (vista === "pendientes") return vistaPendientes(cont);
    if (vista === "clientes") return vistaClientes(cont);
    if (vista === "ficha") return vistaFicha(cont);
    if (vista === "reportes") return vistaReportes(cont);
    if (vista === "equipo") return vistaEquipo(cont);
    return vistaOps(cont);
  }

  /* ======================= arranque ======================= */
  function prepararSegunRol() {
    var consulta = esConsulta(), correo = (sesion && sesion.user && sesion.user.email) || "";
    $("adRolTag").textContent = consulta ? "Equipo" : "Administración";
    $("adPillRol").classList.toggle("hidden", !consulta);
    $("adTabEquipo").classList.toggle("hidden", !esAdmin());
    $("adUsuario").textContent = correo;
    $("adAvatar").textContent = (correo.charAt(0) || "·").toUpperCase();
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
    try { await cargar(); render(); }
    catch (e) {
      $("adView").innerHTML = '<div class="ad-vacio"><h3>No se pudo cargar la información</h3><p>' + esc(e.message || "Revisa tu conexión a internet.") + "</p>" +
        '<button class="btn btn-primary btn-sm" style="margin-top:16px" id="adReintentar">Reintentar</button></div>';
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
    $("adCuenta").addEventListener("click", function () { alternarPop($("adCuenta"), $("adCuentaMenu")); });
    $("adSalir").addEventListener("click", salir);
    $("adClave").addEventListener("click", function () { cerrarPops(); cambiarClave(); });
    $("adRefrescar").addEventListener("click", async function () {
      var b = $("adRefrescar");
      b.disabled = true; cacheFotos = {};
      try { await cargar(); if (vista === "equipo") await cargarEquipo(); render(); IC.toast("Actualizado", "ok"); }
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
