/* =====================================================================
   IMPULSA CRÉDITO — Panel del equipo (administración y consulta)
   =====================================================================
   Uso interno. Dos tipos de usuario:

   · ADMINISTRADOR: ve todo (fotos incluidas), aprueba o rechaza
     documentos y tarjetas, completa o cancela operaciones, escribe
     notas internas, descarga a Excel y ve el historial de cambios.

   · CONSULTA: ve clientes y operaciones para responder dudas, pero NO
     puede cambiar nada. Recibe los datos sensibles ya ocultos (sin
     fotos de DNI ni selfie, cuentas y celulares enmascarados).

   SEGURIDAD: este archivo es público (está en el repositorio), y da
   igual. La protección NO vive aquí: vive en Supabase.
     - supabase-admin.sql            → quién es administrador
     - supabase-equipo-consulta.sql  → quién es de consulta, qué ve,
                                        y el bloqueo de toda escritura
   Aquí solo se esconden los botones que ese usuario no podría usar:
   aunque alguien los forzara, el servidor rechaza el cambio.
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
  var datos = { pendientes: [], clientes: [], ops: [], historial: [] };
  var hay = { notas: false, historial: false };   // tablas que ya existen en Supabase
  var vista = "resumen";
  var fichaId = null;             // id del cliente cuya ficha se está viendo
  var busqueda = "", filtro = "todos", orden = "recientes", pagCli = 1;
  var busquedaOps = "", filtroOps = "todas", periodoOps = "todo", pagOps = 1;
  var filtroAct = "todo", pagAct = 1;
  var cacheFotos = {};
  var ocupado = false;            // evita doble clic en acciones

  function $(id) { return document.getElementById(id); }
  function esc(s) { return window.IC ? IC.esc(s) : String(s == null ? "" : s); }
  function esConsulta() { return rol === "consulta"; }
  function esAdmin() { return rol === "admin"; }
  function dinero(n) { return IC.money(n); }

  /* fechas: siempre con año, para que no haya dudas con el tiempo */
  function fecha(d) {
    if (!d) return "—";
    return new Date(d).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" });
  }
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
  function plural(n, uno, varios) { return n + " " + (n === 1 ? uno : varios); }

  /* ---------------- red ----------------
     Cada pedido lleva la sesión. Si la sesión venció (dura 1 hora), se
     renueva sola y se repite el pedido: el equipo no pierde lo que hacía. */
  function cab(extra, sinSesion) {
    var h = { apikey: KEY, "Content-Type": "application/json" };
    if (!sinSesion) h.Authorization = "Bearer " + (sesion ? sesion.access_token : KEY);
    for (var k in extra) h[k] = extra[k];
    return h;
  }
  async function api(ruta, o, reintento) {
    o = o || {};
    var extra = {};
    if (o.prefer) extra.Prefer = o.prefer;
    var res = await fetch(base + ruta, {
      method: o.method || "GET",
      headers: cab(extra, o.sinSesion),
      body: o.body
    });
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

  /* Escribe y COMPRUEBA que el servidor aplicó el cambio. Si las reglas
     de Supabase lo impiden, la respuesta llega vacía: antes eso pasaba
     en silencio y parecía que se había guardado. */
  async function escribir(ruta, metodo, cuerpo) {
    if (!esAdmin()) throw new Error("Tu usuario es de consulta: no puede hacer cambios.");
    var r = await api(ruta, { method: metodo, body: JSON.stringify(cuerpo), prefer: "return=representation" });
    if (!Array.isArray(r) || !r.length) {
      throw new Error("El servidor no aplicó el cambio (sin permiso o el registro ya no existe).");
    }
    return r;
  }

  /* ---------------- sesión ---------------- */
  function guardar(s) {
    sesion = s;
    try { localStorage.setItem(SES, JSON.stringify({ refresh_token: s.refresh_token })); } catch (e) {}
  }
  async function renovar() {
    var s = await api("/auth/v1/token?grant_type=refresh_token", {
      method: "POST", sinSesion: true, body: JSON.stringify({ refresh_token: sesion.refresh_token })
    });
    guardar(s);
  }
  function salir() {
    sesion = null; rol = null;
    try { localStorage.removeItem(SES); } catch (e) {}
    location.reload();
  }

  /* ¿Qué rol tiene esta cuenta? Lo responde el servidor.
     Si aún no se ejecutó supabase-equipo-consulta.sql, la función mi_rol
     no existe y se usa la comprobación de siempre (solo administrador). */
  async function obtenerRol() {
    try {
      var r = await api("/rest/v1/rpc/mi_rol", { method: "POST", body: "{}" });
      return r === "admin" || r === "consulta" ? r : null;
    } catch (e) {
      if (!e.status) throw e;   // sin internet: que se vea el error, no "sin permisos"
      if (e.status !== 404 && e.code !== "PGRST202") return null;
    }
    try {
      var a = await api("/rest/v1/rpc/es_admin", { method: "POST", body: "{}" });
      return a === true ? "admin" : null;
    } catch (e) { if (!e.status) throw e; return null; }
  }

  /* ---------------- carga de datos ---------------- */
  async function cargar() {
    var t;
    if (esConsulta()) {
      // consulta: todo llega por una sola función del servidor, ya enmascarado
      var d = await api("/rest/v1/rpc/consulta_datos", { method: "POST", body: "{}" }) || {};
      t = [d.perfiles, d.documentos, d.tarjetas, d.cuentas, d.operaciones];
    } else {
      t = await Promise.all(["perfiles", "documentos", "tarjetas", "cuentas", "operaciones"].map(traerTodo));
    }
    var perfiles = t[0] || [], docs = t[1] || [], tarj = t[2] || [], ctas = t[3] || [], ops = t[4] || [];

    var notas = [];
    try { notas = await traerTodo("notas_cliente"); hay.notas = true; }
    catch (e) { hay.notas = false; }

    datos.historial = [];
    hay.historial = false;
    if (esAdmin()) {
      try {
        datos.historial = await api("/rest/v1/auditoria?select=*&order=creado_en.desc&limit=1000") || [];
        hay.historial = true;
      } catch (e) { hay.historial = false; }
    }

    var porId = {};
    perfiles.forEach(function (p) {
      porId[p.id] = { id: p.id, perfil: p, docs: [], tarjetas: [], cuentas: [], ops: [], notas: [] };
    });
    function meter(lista, campo, llave) {
      lista.forEach(function (x) {
        var id = x[llave || "user_id"];
        if (id && porId[id]) porId[id][campo].push(x);
      });
    }
    meter(docs, "docs"); meter(tarj, "tarjetas"); meter(ctas, "cuentas"); meter(ops, "ops");
    meter(notas, "notas", "cliente_id");

    datos.clientes = Object.keys(porId).map(function (k) {
      var c = porId[k];
      var fechas = [c.perfil.creado_en];
      c.docs.concat(c.tarjetas, c.ops).forEach(function (x) { fechas.push(x.creado_en); if (x.completada_en) fechas.push(x.completada_en); });
      c.ultima = fechas.filter(Boolean).sort().pop();
      return c;
    });
    datos.porId = porId;
    datos.ops = ops;
    datos.docs = docs;
    datos.tarjetas = tarj;

    /* pendientes: identidad o tarjetas esperando revisión (la más antigua primero) */
    var pend = [];
    docs.forEach(function (d) {
      if (d.estado === "en_revision") pend.push({ clase: "identidad", tabla: "documentos", fila: d, cliente: porId[d.user_id] });
    });
    tarj.forEach(function (x) {
      if (x.estado === "en_revision") pend.push({ clase: "tarjeta", tabla: "tarjetas", fila: x, cliente: porId[x.user_id] });
    });
    pend.sort(function (a, b) { return new Date(a.fila.creado_en) - new Date(b.fila.creado_en); });
    datos.pendientes = pend;
  }

  /* ---------------- fotos privadas (solo administrador) ---------------- */
  async function urlFoto(ruta) {
    if (!ruta || !esAdmin()) return null;
    if (cacheFotos[ruta]) return cacheFotos[ruta];
    try {
      var r = await api("/storage/v1/object/sign/" + BUCKET + "/" + encodeURI(ruta), {
        method: "POST", body: JSON.stringify({ expiresIn: 3600 })
      });
      var u = base + "/storage/v1" + r.signedURL;
      cacheFotos[ruta] = u;
      return u;
    } catch (e) { return null; }
  }
  async function pintarFotos(cont) {
    var nodos = cont.querySelectorAll("[data-foto]");
    for (var i = 0; i < nodos.length; i++) {
      var n = nodos[i], ruta = n.getAttribute("data-foto");
      var u = await urlFoto(ruta);
      if (!n.isConnected) return;   // el usuario ya cambió de pantalla
      if (u) {
        n.innerHTML = '<img src="' + u + '" alt="">' +
          '<a class="ad-zoom" href="' + u + '" target="_blank" rel="noopener" title="Ver en grande" aria-label="Ver en grande">' +
          '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M15 3h6v6M10 14L21 3M21 14v7H3V3h7"/></svg></a>';
        (function (caja, enlace) {
          var img = caja.querySelector("img");
          img.addEventListener("error", function () {
            caja.innerHTML = '<span class="ad-sinfoto">La imagen no se pudo abrir.<br>' +
              '<a href="' + enlace + '" target="_blank" rel="noopener">Descargar archivo</a></span>';
          });
        })(n, u);
      } else {
        n.innerHTML = '<span class="ad-sinfoto">Sin foto</span>';
      }
    }
  }

  /* ---------------- acciones (solo administrador) ---------------- */
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
    try {
      await escribir("/rest/v1/avisos", "POST", { user_id: userId, titulo: titulo, texto: texto, tipo: tipo });
    } catch (e) { /* el aviso es un extra: la decisión ya quedó guardada */ }
  }

  async function decidir(item, aprobar, motivo) {
    var esIdent = item.clase === "identidad";
    var nuevo = aprobar ? (esIdent ? "verificado" : "verificada") : "rechazado";
    var cuerpo = { estado: nuevo, revisado_en: new Date().toISOString() };
    if (!aprobar) cuerpo.motivo = motivo || null;
    await escribir("/rest/v1/" + item.tabla + "?id=eq." + item.fila.id, "PATCH", cuerpo);

    var titulo, texto;
    if (esIdent) {
      titulo = aprobar ? "Identidad verificada" : "Identidad rechazada";
      texto = aprobar
        ? "Ya validamos tu DNI y tu selfie. Puedes registrar tu tarjeta y crear tu operación."
        : ("No pudimos validar tus documentos. " + (motivo || "Vuelve a subirlos con mejor luz y sin reflejos."));
    } else {
      titulo = aprobar ? "Tarjeta verificada" : "Tarjeta rechazada";
      texto = aprobar
        ? ("Tu tarjeta " + (item.fila.banco || "") + " terminada en " + (item.fila.ultimos4 || "") + " quedó habilitada.")
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

  /* Marca la operación como completada o cancelada y avisa al cliente */
  async function cambiarOperacion(op, estado) {
    await escribir("/rest/v1/operaciones?id=eq." + op.id, "PATCH", { estado: estado });
    var titulo = estado === "completada" ? "¡Depósito realizado!" : "Operación cancelada";
    var texto = estado === "completada"
      ? ("Ya depositamos " + dinero(op.neto) + " en tu cuenta " + (op.banco_cuenta || "") +
         ". Tu comprobante de la operación " + (op.codigo || "") + " ya está disponible.")
      : ("La operación " + (op.codigo || "") + " fue cancelada. Si crees que es un error, escríbenos por WhatsApp.");
    await avisar(op.user_id, titulo, texto, estado === "completada" ? "ok" : "alerta");
    IC.toast(estado === "completada" ? "Marcada como completada. El cliente ya fue avisado." : "Operación cancelada.",
             estado === "completada" ? "ok" : "err");
    await cargar(); render();
  }

  function confirmarCompletada(op) {
    IC.modal({
      title: "¿Ya depositaste el dinero?",
      html: "<p>Vas a dar por <b>completada</b> la operación <b>" + esc(op.codigo || "") + "</b> de " +
            esc(op.nombre || "") + ".</p>" +
            '<p class="muted mt-8">Confirma solo si ya hiciste la transferencia de <b>' + dinero(op.neto) +
            "</b> a la cuenta " + esc(op.banco_cuenta || "") + " " + esc(op.numero_cuenta || "") +
            ". El cliente recibirá el aviso y su comprobante quedará disponible.</p>",
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

  /* ---------------- Mi contraseña (cada persona la suya) ---------------- */
  function cambiarClave() {
    IC.modal({
      title: "Cambiar mi contraseña",
      html: '<p class="muted">Úsala solo tú. Mínimo 8 caracteres e incluye al menos un número.</p>' +
        '<div class="field mt-8"><label for="adClave1">Contraseña nueva</label><input type="password" id="adClave1" autocomplete="new-password"></div>' +
        '<div class="field"><label for="adClave2">Repítela</label><input type="password" id="adClave2" autocomplete="new-password"></div>' +
        '<p class="form-error hidden" id="adClaveErr"></p>',
      actions: [
        { label: "Cancelar", cls: "btn-outline-dark" },
        { label: "Guardar", cls: "btn-primary", keepOpen: true, onClick: async function (b) {
            var p1 = $("adClave1").value, p2 = $("adClave2").value, err = $("adClaveErr");
            function mal(t) { err.textContent = t; err.classList.remove("hidden"); }
            if (p1.length < 8 || !/\d/.test(p1)) return mal("Mínimo 8 caracteres e incluye al menos un número.");
            if (p1 !== p2) return mal("Las contraseñas no coinciden.");
            b.disabled = true; b.textContent = "Guardando...";
            try {
              await api("/auth/v1/user", { method: "PUT", body: JSON.stringify({ password: p1 }) });
              IC.closeModal();
              IC.toast("Contraseña actualizada.", "ok");
            } catch (e) {
              b.disabled = false; b.textContent = "Guardar";
              mal(/different/i.test(e.message) ? "Debe ser distinta a la actual." : (e.message || "No se pudo cambiar."));
            }
          } }
      ]
    });
  }

  /* ---------------- Descargar a Excel / Google Sheets (solo administrador) ----------------
     CSV para Excel en español: separador ";" y BOM para que salgan las tildes. */
  function descargarCSV(nombreArchivo, filas) {
    if (!esAdmin()) { IC.toast("La descarga es solo para administradores.", "err"); return; }
    if (!filas.length) { IC.toast("No hay nada que descargar.", "err"); return; }
    var cols = Object.keys(filas[0]);
    var sep = ";";
    function celda(v) {
      if (v === null || v === undefined) return "";
      var t = String(v);
      // evita que Excel ejecute fórmulas escondidas en un dato (=, +, -, @)
      if (/^[=+\-@]/.test(t) && isNaN(Number(t))) t = "'" + t;
      if (t.indexOf(sep) >= 0 || t.indexOf('"') >= 0 || /[\r\n]/.test(t)) t = '"' + t.replace(/"/g, '""') + '"';
      return t;
    }
    var csv = cols.join(sep) + "\r\n" +
      filas.map(function (f) { return cols.map(function (c) { return celda(f[c]); }).join(sep); }).join("\r\n");
    var hoy = new Date();
    var f = hoy.getFullYear() + "-" + ("0" + (hoy.getMonth() + 1)).slice(-2) + "-" + ("0" + hoy.getDate()).slice(-2);
    var blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url; a.download = "impulsa-" + nombreArchivo + "-" + f + ".csv";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    IC.toast("Descargado. Ábrelo con Excel o Google Sheets.", "ok");
  }
  function exportarClientes(lista) {
    descargarCSV("clientes", lista.map(function (c) {
      var idd = c.docs[0];
      return {
        "DNI": c.perfil.documento || "", "Cliente": nombre(c), "Celular": c.perfil.celular || "",
        "Correo": c.perfil.email || "", "DNI y selfie": idd ? idd.estado : "sin subir",
        "N tarjetas": c.tarjetas.length,
        "Tarjetas": c.tarjetas.map(function (t) {
          return (t.banco || "") + " " + (t.marca || "") + " ****" + (t.ultimos4 || "") + (t.principal ? " (principal)" : "");
        }).join(" | "),
        "N cuentas": c.cuentas.length,
        "Cuentas": c.cuentas.map(function (a) { return (a.banco || "") + " " + (a.numero || ""); }).join(" | "),
        "N operaciones": c.ops.length,
        "Efectivizado": sumar(c.ops.filter(completada), "monto"),
        "Tu comision": sumar(c.ops.filter(completada), "comision"),
        "Se registro": fechaHora(c.perfil.creado_en),
        "Ultima actividad": fechaHora(c.ultima),
        "Carpeta de fotos": c.perfil.id || ""
      };
    }));
  }
  function exportarOperaciones(lista) {
    descargarCSV("operaciones", lista.map(function (o) {
      return {
        "Codigo": o.codigo || "", "Fecha": fechaHora(o.creado_en), "Cliente": o.nombre || "",
        "DNI": o.documento || "", "Celular": o.celular || "",
        "Tarjeta": (o.banco_tarjeta || "") + " ****" + (o.ultimos4 || ""),
        "Banco destino": o.banco_cuenta || "", "Cuenta destino": o.numero_cuenta || "",
        "Monto": Number(o.monto || 0), "Comision": Number(o.comision || 0), "Recibe": Number(o.neto || 0),
        "Estado": o.estado || "", "Depositada": o.completada_en ? fechaHora(o.completada_en) : ""
      };
    }));
  }

  function waCliente(p) {
    if (!esAdmin()) return;
    var tel = String((p && p.celular) || "").replace(/\D/g, "");
    if (!tel) { IC.toast("Este cliente no dejó su celular.", "err"); return; }
    if (tel.length === 9) tel = "51" + tel;
    var msg = "Hola " + ((p && p.nombres) || "") + ", te escribimos de Impulsa Crédito sobre tu solicitud.";
    window.open("https://wa.me/" + tel + "?text=" + encodeURIComponent(msg), "_blank", "noopener");
  }

  /* ---------------- utilidades de pintado ---------------- */
  var ICO_WA = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M17.5 14.4c-.3-.2-1.7-.9-2-1-.3-.1-.5-.1-.7.1-.2.3-.7 1-.9 1.2-.2.2-.3.2-.6.1-1.7-.9-2.9-1.6-4-3.5-.3-.5.3-.5.8-1.5.1-.2 0-.4 0-.5s-.7-1.6-.9-2.2c-.2-.5-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.5s1.1 2.9 1.2 3.1c.1.2 2.1 3.2 5.1 4.5 1.9.8 2.6.9 3.5.7.6-.1 1.7-.7 1.9-1.3.2-.7.2-1.2.2-1.3-.1-.2-.3-.2-.5-.3z"/><path d="M12 2a10 10 0 00-8.6 15L2 22l5.2-1.4A10 10 0 1012 2zm0 18.2a8.2 8.2 0 01-4.2-1.1l-.3-.2-3.1.8.8-3-.2-.3A8.2 8.2 0 1112 20.2z"/></svg>';
  var ICO_BUSCAR = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>';
  var ICO_EXCEL = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12M7 12l5 5 5-5M5 21h14"/></svg>';

  function chip(estado) {
    var m = {
      en_revision: ["En revisión", "warn"], verificado: ["Verificado", "ok"], verificada: ["Verificada", "ok"],
      rechazado: ["Rechazado", "err"], completada: ["Completada", "ok"], en_proceso: ["En proceso", "warn"],
      cancelada: ["Cancelada", "err"], pend_pago: ["Pendiente de pago", "warn"], activa: ["Activa", "warn"],
      sin_subir: ["Sin subir", ""]
    };
    var v = m[estado] || [estado || "—", ""];
    return '<span class="ad-chip ' + v[1] + '">' + esc(v[0]) + "</span>";
  }
  function chipCorto(estado) {
    var m = { en_revision: ["Revisión", "warn"], verificada: ["Verificada", "ok"], verificado: ["Verificada", "ok"], rechazado: ["Rechazada", "err"] };
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
  function sumar(lista, campo) { return lista.reduce(function (a, o) { return a + Number(o[campo] || 0); }, 0); }
  function estadoIdentidad(c) { return c.docs[0] ? c.docs[0].estado : "sin_subir"; }
  function esteMes(d) {
    if (!d) return false;
    var x = new Date(d), h = new Date();
    return x.getFullYear() === h.getFullYear() && x.getMonth() === h.getMonth();
  }
  function enPeriodo(d, p) {
    if (p === "todo") return true;
    if (!d) return false;
    var t = new Date(d).getTime(), ahora = Date.now();
    if (p === "hoy") return new Date(d).toDateString() === new Date().toDateString();
    if (p === "7d") return ahora - t < 7 * 864e5;
    if (p === "30d") return ahora - t < 30 * 864e5;
    if (p === "mes") return esteMes(d);
    return true;
  }
  function kpi(titulo, valor, nota, clase, accionVista) {
    return '<div class="ad-kpi' + (clase ? " " + clase : "") + '"' + (accionVista ? ' data-ir="' + accionVista + '" role="button" tabindex="0"' : "") + ">" +
      "<span>" + esc(titulo) + "</span><b>" + valor + "</b>" + (nota ? "<small>" + nota + "</small>" : "") + "</div>";
  }
  function paginador(total, visibles, id) {
    if (total <= visibles) return total > POR_PAGINA ? '<p class="ad-pag">Mostrando los ' + total + "</p>" : "";
    return '<div class="ad-pag"><span>Mostrando ' + visibles + " de " + total + "</span>" +
      '<button class="btn btn-outline-dark btn-sm" id="' + id + '">Mostrar ' + Math.min(POR_PAGINA, total - visibles) + " más</button></div>";
  }
  function irA(v, extra) {
    vista = v;
    if (extra) for (var k in extra) {
      if (k === "filtro") filtro = extra[k];
      if (k === "filtroOps") filtroOps = extra[k];
      if (k === "periodoOps") periodoOps = extra[k];
    }
    pagCli = 1; pagOps = 1; pagAct = 1;
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function abrirFicha(id) { fichaId = id; vista = "ficha"; render(); window.scrollTo({ top: 0, behavior: "smooth" }); }

  /* buscador que no pierde el foco al volver a pintar */
  function enlazarBuscador(idCampo, fijar) {
    var campo = $(idCampo);
    if (!campo) return;
    campo.addEventListener("input", function () {
      fijar(campo.value);
      var pos = campo.selectionStart;
      render();
      var nc = $(idCampo);
      if (nc) { nc.focus(); try { nc.setSelectionRange(pos, pos); } catch (e) {} }
    });
  }

  /* ======================= VISTAS ======================= */

  /* ---------- Resumen: lo importante de un vistazo ---------- */
  function vistaResumen(cont) {
    var cl = datos.clientes, ops = datos.ops;
    var nuevos7 = cl.filter(function (c) { return enPeriodo(c.perfil.creado_en, "7d"); }).length;
    var verificados = cl.filter(function (c) { return estadoIdentidad(c) === "verificado"; }).length;
    var sinId = cl.filter(function (c) { return estadoIdentidad(c) === "sin_subir"; }).length;
    var nPend = datos.pendientes.length;
    var masAntigua = nPend ? datos.pendientes[0].fila.creado_en : null;

    var pend = ops.filter(pendiente), comp = ops.filter(completada);
    // "este mes" se cuenta por la fecha del depósito; las operaciones antiguas sin esa fecha usan la de creación
    var compMes = comp.filter(function (o) { return esteMes(o.completada_en || o.creado_en); });
    var cancMes = ops.filter(function (o) { return cancelada(o) && esteMes(o.creado_en); });

    /* alertas: solo cosas que piden una acción */
    var alertas = [];
    var viejas = datos.pendientes.filter(function (p) { return Date.now() - new Date(p.fila.creado_en) > 864e5; }).length;
    if (viejas) alertas.push(["warn", plural(viejas, "solicitud lleva", "solicitudes llevan") + " más de 24 h esperando revisión.", "pendientes", null]);
    var pagoViejo = pend.filter(function (o) { return Date.now() - new Date(o.creado_en) > 864e5; }).length;
    if (pagoViejo) alertas.push(["warn", plural(pagoViejo, "operación lleva", "operaciones llevan") + " más de 24 h pendiente de pago.", "ops", { filtroOps: "pend_pago", periodoOps: "todo" }]);
    var rechazados = cl.filter(function (c) { return estadoIdentidad(c) === "rechazado"; }).length;
    if (rechazados) alertas.push(["", plural(rechazados, "cliente tiene", "clientes tienen") + " su DNI rechazado y aún no lo vuelve a subir.", "clientes", { filtro: "pendientes" }]);
    var sinIdViejos = cl.filter(function (c) { return estadoIdentidad(c) === "sin_subir" && Date.now() - new Date(c.perfil.creado_en) > 3 * 864e5; }).length;
    if (sinIdViejos) alertas.push(["", plural(sinIdViejos, "cliente se registró", "clientes se registraron") + " hace más de 3 días y no sube su DNI: buen momento para escribirles.", "clientes", { filtro: "sin_identidad" }]);

    /* actividad reciente, a partir de las fechas de cada registro */
    var ev = [];
    cl.forEach(function (c) { ev.push([c.perfil.creado_en, nombre(c) + " se registró", c.id]); });
    datos.docs.forEach(function (d) { var c = datos.porId[d.user_id]; if (c) ev.push([d.creado_en, nombre(c) + " subió su DNI y selfie", c.id]); });
    datos.tarjetas.forEach(function (t) { var c = datos.porId[t.user_id]; if (c) ev.push([t.creado_en, nombre(c) + " registró su tarjeta " + (t.banco || "") + " ····" + (t.ultimos4 || ""), c.id]); });
    ops.forEach(function (o) {
      ev.push([o.creado_en, (o.nombre || "Un cliente") + " pidió efectivizar " + dinero(o.monto) + " (" + (o.codigo || "") + ")", o.user_id]);
      if (o.completada_en) ev.push([o.completada_en, "Operación " + (o.codigo || "") + " completada: " + dinero(o.neto) + " depositados", o.user_id]);
    });
    ev.sort(function (a, b) { return new Date(b[0]) - new Date(a[0]); });
    ev = ev.slice(0, 10);

    cont.innerHTML =
      '<h2 class="ad-h2">Clientes</h2>' +
      '<div class="ad-kpis">' +
        kpi("Clientes", String(cl.length), "+" + nuevos7 + " en los últimos 7 días", "", "clientes") +
        kpi("Por revisar", String(nPend), nPend ? "la más antigua " + hace(masAntigua) : "todo al día", nPend ? "alerta" : "", "pendientes") +
        kpi("Identidad verificada", String(verificados), "de " + cl.length + " clientes", "", "clientes:verificados") +
        kpi("Sin subir su DNI", String(sinId), "registrados sin identidad", "", "clientes:sin_identidad") +
      "</div>" +
      '<h2 class="ad-h2">Operaciones</h2>' +
      '<div class="ad-kpis">' +
        kpi("Pendientes de pago", dinero(sumar(pend, "monto")), plural(pend.length, "operación", "operaciones") + " · " + dinero(sumar(pend, "comision")) + " de comisión por cobrar", pend.length ? "alerta" : "", "ops:pend_pago") +
        kpi("Efectivizado este mes", dinero(sumar(compMes, "monto")), plural(compMes.length, "operación completada", "operaciones completadas") + " · por fecha de depósito", "", "ops:completada") +
        kpi("Comisiones cobradas este mes", dinero(sumar(compMes, "comision")), "Total histórico: " + dinero(sumar(comp, "comision")) + " · solo completadas", "verde", null) +
        kpi("Canceladas este mes", String(cancMes.length), "no suman comisión", "", "ops:cancelada") +
      "</div>" +
      '<div class="ad-resumen-grid">' +
        '<section class="ad-card ad-bloque"><h3>Alertas</h3>' +
          (alertas.length ? '<ul class="ad-alertas">' + alertas.map(function (a, i) {
            return '<li class="' + a[0] + '"><span>' + esc(a[1]) + '</span><button class="btn btn-outline-dark btn-sm" data-alerta="' + i + '">Ver</button></li>';
          }).join("") + "</ul>" : '<p class="ad-sub">Nada urgente. Todo al día.</p>') +
        "</section>" +
        '<section class="ad-card ad-bloque"><h3>Actividad reciente</h3>' +
          (ev.length ? '<ul class="ad-actividad">' + ev.map(function (e) {
            return '<li><button class="ad-link" data-cliente="' + esc(e[2] || "") + '">' + esc(e[1]) + "</button><time>" + esc(hace(e[0])) + "</time></li>";
          }).join("") + "</ul>" : '<p class="ad-sub">Todavía no hay movimiento.</p>') +
        "</section>" +
      "</div>";

    cont.querySelectorAll("[data-ir]").forEach(function (k) {
      function ir() {
        var p = k.dataset.ir.split(":");
        if (p[0] === "clientes") irA("clientes", { filtro: p[1] || "todos" });
        else if (p[0] === "ops") irA("ops", { filtroOps: p[1] || "todas", periodoOps: "todo" });
        else irA(p[0]);
      }
      k.addEventListener("click", ir);
      k.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); ir(); } });
    });
    cont.querySelectorAll("[data-alerta]").forEach(function (b) {
      b.addEventListener("click", function () { var a = alertas[+b.dataset.alerta]; irA(a[2], a[3]); });
    });
    cont.querySelectorAll("[data-cliente]").forEach(function (b) {
      b.addEventListener("click", function () { if (datos.porId[b.dataset.cliente]) abrirFicha(b.dataset.cliente); });
    });
  }

  /* ---------- Por revisar ---------- */
  function tarjetaPendiente(item, i) {
    var p = (item.cliente && item.cliente.perfil) ? item.cliente.perfil : {};
    var f = item.fila;
    var fotos = item.clase === "identidad"
      ? [["DNI — frente", f.dni_frontal, f.tiene_dni_frontal], ["DNI — reverso", f.dni_posterior, f.tiene_dni_posterior], ["Selfie", f.selfie, f.tiene_selfie]]
      : [["Tarjeta — frente", f.foto_frontal, f.tiene_foto_frontal], ["Tarjeta — reverso", f.foto_posterior, f.tiene_foto_posterior]];

    return '<article class="ad-card">' +
      '<header class="ad-card-head"><div>' +
        '<span class="ad-tipo ' + (item.clase === "identidad" ? "t-id" : "t-card") + '">' + (item.clase === "identidad" ? "Identidad" : "Tarjeta") + "</span>" +
        "<h3>" + esc(nombre(item.cliente)) + "</h3>" +
        '<p class="ad-meta">' + esc(p.tipo_doc || "DNI") + " " + esc(p.documento || "—") + " · " + esc(p.celular || "sin celular") +
        " · enviado " + esc(hace(f.creado_en)) + " (" + esc(fechaHora(f.creado_en)) + ")</p>" +
      "</div><div>" + chip(f.estado) + "</div></header>" +
      (item.clase === "tarjeta"
        ? '<p class="ad-detalle"><b>' + esc(f.banco || "") + "</b> " + esc(f.marca || "") + " ···· " + esc(f.ultimos4 || "") + " · Titular: " + esc(f.titular || "—") + "</p>"
        : "") +
      (esConsulta()
        ? '<ul class="ad-recibidos">' + fotos.map(function (x) {
            return "<li class=\"" + (x[2] ? "si" : "no") + "\">" + (x[2] ? "✓ " : "✗ ") + esc(x[0]) + "</li>";
          }).join("") + '</ul><p class="ad-sub">Las fotos y la aprobación son solo para administradores.</p>'
        : '<div class="ad-fotos">' + fotos.map(function (x) {
            return "<figure><figcaption>" + esc(x[0]) + "</figcaption>" +
              '<div class="ad-foto" data-foto="' + esc(x[1] || "") + '"><span class="ad-cargando"></span></div></figure>';
          }).join("") + "</div>") +
      '<footer class="ad-acciones">' +
        '<button class="btn btn-outline-dark btn-sm" data-ficha-p="' + i + '">Ver ficha</button>' +
        (esAdmin()
          ? '<div class="ad-acciones-der">' +
              '<button class="btn btn-outline-dark btn-sm ad-wa" data-wa="' + i + '" title="Escribir por WhatsApp" aria-label="Escribir por WhatsApp">' + ICO_WA + "</button>" +
              '<button class="btn btn-danger btn-sm" data-no="' + i + '">Rechazar</button>' +
              '<button class="btn btn-primary btn-sm" data-si="' + i + '">Aprobar</button>' +
            "</div>"
          : "") +
      "</footer>" +
    "</article>";
  }

  function vistaPendientes(cont) {
    var n = datos.pendientes.length;
    cont.innerHTML = !n
      ? '<div class="ad-vacio"><div class="ad-vacio-ico">✓</div><h3>Todo al día</h3><p>No hay solicitudes esperando revisión.</p></div>'
      : '<p class="ad-conteo">' + plural(n, "solicitud espera", "solicitudes esperan") + " revisión · primero las más antiguas</p>" +
        datos.pendientes.map(tarjetaPendiente).join("");
    pintarFotos(cont);
    cont.querySelectorAll("[data-si]").forEach(function (b) {
      b.addEventListener("click", function () { accion(function () { return decidir(datos.pendientes[+b.dataset.si], true); }, b); });
    });
    cont.querySelectorAll("[data-no]").forEach(function (b) {
      b.addEventListener("click", function () { pedirMotivo(datos.pendientes[+b.dataset.no]); });
    });
    cont.querySelectorAll("[data-wa]").forEach(function (b) {
      b.addEventListener("click", function () { var it = datos.pendientes[+b.dataset.wa]; waCliente(it.cliente ? it.cliente.perfil : null); });
    });
    cont.querySelectorAll("[data-ficha-p]").forEach(function (b) {
      b.addEventListener("click", function () { var it = datos.pendientes[+b.dataset.fichaP]; if (it.cliente) abrirFicha(it.cliente.id); });
    });
  }

  /* ---------- Clientes ---------- */
  function vistaClientes(cont) {
    if (!datos.clientes.length) {
      cont.innerHTML = '<div class="ad-vacio"><h3>Aún no hay clientes</h3><p>Aparecerán aquí en cuanto alguien se registre.</p></div>';
      return;
    }
    var q = busqueda.trim().toLowerCase();
    var lista = datos.clientes.filter(function (c) {
      var ide = estadoIdentidad(c);
      if (filtro === "pendientes" && !(ide === "en_revision" || ide === "rechazado" || c.tarjetas.some(function (t) { return t.estado === "en_revision"; }))) return false;
      if (filtro === "verificados" && ide !== "verificado") return false;
      if (filtro === "sin_identidad" && ide !== "sin_subir") return false;
      if (filtro === "activos" && !c.ops.length) return false;
      if (filtro === "sin_ops" && c.ops.length) return false;
      if (!q) return true;
      return (nombre(c) + " " + (c.perfil.documento || "") + " " + (c.perfil.celular || "") + " " + (c.perfil.email || "")).toLowerCase().indexOf(q) >= 0;
    });
    var ordenes = {
      recientes: function (a, b) { return new Date(b.perfil.creado_en) - new Date(a.perfil.creado_en); },
      actividad: function (a, b) { return new Date(b.ultima || 0) - new Date(a.ultima || 0); },
      nombre: function (a, b) { return nombre(a).localeCompare(nombre(b), "es"); },
      operaciones: function (a, b) { return b.ops.length - a.ops.length; }
    };
    lista.sort(ordenes[orden] || ordenes.recientes);
    var visibles = lista.slice(0, pagCli * POR_PAGINA);

    var filtros = [["todos", "Todos"], ["pendientes", "Por revisar"], ["verificados", "Verificados"], ["sin_identidad", "Sin DNI"], ["activos", "Con operaciones"], ["sin_ops", "Sin operaciones"]];

    cont.innerHTML =
      '<div class="ad-barra">' +
        '<div class="ad-buscador">' + ICO_BUSCAR +
          '<input id="adBuscar" type="search" aria-label="Buscar clientes" placeholder="' + (esConsulta() ? "Buscar por nombre o DNI" : "Buscar por nombre, DNI, celular o correo") + '" value="' + esc(busqueda) + '">' +
        "</div>" +
        '<label class="ad-orden"><span>Ordenar</span><select id="adOrden">' +
          [["recientes", "Más recientes"], ["actividad", "Última actividad"], ["nombre", "Nombre (A-Z)"], ["operaciones", "Más operaciones"]].map(function (o) {
            return '<option value="' + o[0] + '"' + (orden === o[0] ? " selected" : "") + ">" + o[1] + "</option>";
          }).join("") + "</select></label>" +
        (esAdmin() ? '<button class="btn btn-outline-dark btn-sm ad-excel" id="adExpClientes" title="Descargar para Excel o Google Sheets">' + ICO_EXCEL + " Excel</button>" : "") +
        '<div class="ad-filtros">' + filtros.map(function (f) {
          return '<button class="ad-filtro' + (filtro === f[0] ? " on" : "") + '" data-f="' + f[0] + '">' + f[1] + "</button>";
        }).join("") + "</div>" +
      "</div>" +
      '<p class="ad-conteo">' + plural(lista.length, "cliente", "clientes") + (q || filtro !== "todos" ? " de " + datos.clientes.length : "") + "</p>" +
      (lista.length ? '<div class="ad-tabla-wrap"><table class="ad-tabla cards"><thead><tr>' +
        "<th>Cliente</th><th>Documento</th><th>Celular</th><th>DNI y selfie</th><th>Tarjetas</th><th class=\"centro\">Cuentas</th><th class=\"centro\">Ops.</th><th><span class=\"sr-only\">Acciones</span></th>" +
        "</tr></thead><tbody>" +
        visibles.map(function (c, i) {
          var muestra = c.tarjetas.slice(0, 2), resto = c.tarjetas.length - muestra.length;
          var celdaTarjetas = c.tarjetas.length
            ? '<ul class="ad-mini-lista">' + muestra.map(function (t) {
                return "<li" + (t.principal ? ' class="es-principal"' : "") + '><span class="tx"><b>' + esc(t.banco || "") + "</b> ····" + esc(t.ultimos4 || "") +
                  " <i>" + esc(t.marca || "") + "</i>" + (t.principal ? '<em title="Tarjeta principal">principal</em>' : "") + "</span>" + chipCorto(t.estado) + "</li>";
              }).join("") + (resto > 0 ? '<li class="mas">y ' + resto + (resto === 1 ? " tarjeta más" : " tarjetas más") + "</li>" : "") + "</ul>"
            : '<span class="ad-sub">—</span>';
          return "<tr>" +
            '<td class="ad-col-cliente" data-label="Cliente"><b>' + esc(nombre(c)) + "</b>" + (c.perfil.email ? '<span class="ad-sub">' + esc(c.perfil.email) + "</span>" : "") +
              '<span class="ad-sub">desde ' + esc(fecha(c.perfil.creado_en)) + "</span></td>" +
            '<td class="nowrap" data-label="Documento">' + esc(c.perfil.tipo_doc || "DNI") + " " + esc(c.perfil.documento || "") + "</td>" +
            '<td class="nowrap" data-label="Celular">' + esc(c.perfil.celular || "—") + "</td>" +
            '<td data-label="DNI y selfie">' + chip(estadoIdentidad(c)) + "</td>" +
            '<td class="ad-col-tarjetas" data-label="Tarjetas">' + celdaTarjetas + "</td>" +
            '<td class="num" data-label="Cuentas">' + c.cuentas.length + '</td><td class="num" data-label="Operaciones">' + c.ops.length + "</td>" +
            '<td data-label="" class="ad-celda-acc"><div class="ad-acc-op">' +
              '<button class="btn btn-primary btn-sm" data-ficha="' + i + '">Ver ficha</button>' +
              (esAdmin() ? '<button class="btn btn-outline-dark btn-sm ad-wa" data-wac="' + i + '" title="Escribir por WhatsApp" aria-label="Escribir por WhatsApp a ' + esc(nombre(c)) + '">' + ICO_WA + "</button>" : "") +
            "</div></td></tr>";
        }).join("") + "</tbody></table></div>" + paginador(lista.length, visibles.length, "adMasCli")
      : '<div class="ad-vacio"><h3>Sin resultados</h3><p>Prueba con otro nombre o quita los filtros.</p></div>');

    enlazarBuscador("adBuscar", function (v) { busqueda = v; pagCli = 1; });
    $("adOrden").addEventListener("change", function () { orden = this.value; pagCli = 1; render(); });
    cont.querySelectorAll(".ad-filtro").forEach(function (b) {
      b.addEventListener("click", function () { filtro = b.dataset.f; pagCli = 1; render(); });
    });
    if ($("adExpClientes")) $("adExpClientes").addEventListener("click", function () { exportarClientes(lista); });
    if ($("adMasCli")) $("adMasCli").addEventListener("click", function () { pagCli++; render(); });
    cont.querySelectorAll("[data-wac]").forEach(function (b) {
      b.addEventListener("click", function () { waCliente(visibles[+b.dataset.wac].perfil); });
    });
    cont.querySelectorAll("[data-ficha]").forEach(function (b) {
      b.addEventListener("click", function () { abrirFicha(visibles[+b.dataset.ficha].id); });
    });
  }

  /* ---------- Ficha del cliente ---------- */
  function vistaFicha(cont) {
    var c = datos.porId && datos.porId[fichaId];
    if (!c) { vista = "clientes"; render(); return; }
    var p = c.perfil, idn = c.docs[0];
    var opsComp = c.ops.filter(completada), opsPend = c.ops.filter(pendiente);

    function dato(k, v) { return '<div class="ad-dato"><span>' + esc(k) + "</span><b>" + esc(v || "—") + "</b></div>"; }
    function fotosHtml(lista) {
      return '<div class="ad-fotos">' + lista.map(function (x) {
        return "<figure><figcaption>" + esc(x[0]) + "</figcaption>" +
          '<div class="ad-foto" data-foto="' + esc(x[1] || "") + '"><span class="ad-cargando"></span></div></figure>';
      }).join("") + "</div>";
    }
    function recibidos(lista) {
      return '<ul class="ad-recibidos">' + lista.map(function (x) {
        return '<li class="' + (x[1] ? "si" : "no") + '">' + (x[1] ? "✓ " : "✗ ") + esc(x[0]) + "</li>";
      }).join("") + "</ul>";
    }

    /* alertas de la ficha */
    var alertas = [];
    if (!idn) alertas.push(["", "Todavía no subió su DNI ni su selfie."]);
    else if (idn.estado === "en_revision") alertas.push(["warn", "Su identidad espera revisión desde " + fechaHora(idn.creado_en) + "."]);
    else if (idn.estado === "rechazado") alertas.push(["err", "Identidad rechazada" + (idn.motivo ? ": «" + idn.motivo + "»" : "") + ". Espera que la vuelva a subir."]);
    c.tarjetas.filter(function (t) { return t.estado === "en_revision"; }).forEach(function (t) {
      alertas.push(["warn", "Tarjeta " + (t.banco || "") + " ····" + (t.ultimos4 || "") + " espera revisión."]);
    });
    if (opsPend.length) alertas.push(["warn", plural(opsPend.length, "operación pendiente", "operaciones pendientes") + " de pago por " + dinero(sumar(opsPend, "monto")) + "."]);
    if (esAdmin()) {
      /* posibles duplicados: otra cuenta con el mismo celular o correo */
      var cel = String(p.celular || "").replace(/\D/g, ""), mail = String(p.email || "").toLowerCase();
      datos.clientes.forEach(function (o) {
        if (o.id === c.id) return;
        var oc = String(o.perfil.celular || "").replace(/\D/g, ""), om = String(o.perfil.email || "").toLowerCase();
        if ((cel && oc === cel) || (mail && om === mail)) {
          alertas.push(["err", "Posible duplicado: " + nombre(o) + " (" + (o.perfil.documento || "sin DNI") + ") usa el mismo " + (cel && oc === cel ? "celular" : "correo") + "."]);
        }
      });
    }

    var fotosId = idn ? [["DNI — frente", idn.dni_frontal, idn.tiene_dni_frontal], ["DNI — reverso", idn.dni_posterior, idn.tiene_dni_posterior], ["Selfie", idn.selfie, idn.tiene_selfie]] : [];

    /* historial: para el administrador, lo que registró el servidor; para consulta, las fechas clave */
    var hist = [];
    if (esAdmin() && hay.historial) {
      datos.historial.filter(function (h) { return h.cliente_id === c.id; }).forEach(function (h) {
        hist.push([h.creado_en, (h.actor_email || (h.actor_rol === "cliente" ? "El cliente" : "Sistema")) + " " + textoAccion(h) + detalleAccion(h, true)]);
      });
    }
    hist.push([p.creado_en, "Se registró"]);
    c.docs.forEach(function (d) { hist.push([d.creado_en, "Subió su DNI y selfie"]); });
    c.tarjetas.forEach(function (t) { hist.push([t.creado_en, "Registró la tarjeta " + (t.banco || "") + " ····" + (t.ultimos4 || "")]); });
    c.ops.forEach(function (o) {
      hist.push([o.creado_en, "Pidió la operación " + (o.codigo || "") + " por " + dinero(o.monto)]);
      if (o.completada_en && !(esAdmin() && hay.historial)) hist.push([o.completada_en, "Operación " + (o.codigo || "") + " completada"]);
    });
    hist.sort(function (a, b) { return new Date(b[0]) - new Date(a[0]); });

    cont.innerHTML =
      '<button class="btn btn-outline-dark btn-sm ad-volver" id="volverClientes">‹ Volver a Clientes</button>' +
      '<article class="ad-card ad-ficha">' +
        '<header class="ad-card-head"><div><span class="ad-tipo t-id">Ficha del cliente</span>' +
          "<h3>" + esc(nombre(c)) + "</h3>" +
          '<p class="ad-meta">Registrado el ' + esc(fechaHora(p.creado_en)) + " · Última actividad " + esc(hace(c.ultima)) + "</p></div>" +
          "<div>" + chip(estadoIdentidad(c)) + "</div></header>" +

        (alertas.length ? '<ul class="ad-alertas compactas">' + alertas.map(function (a) { return '<li class="' + a[0] + '"><span>' + esc(a[1]) + "</span></li>"; }).join("") + "</ul>" : "") +

        '<div class="ad-datos">' +
          dato("Documento", (p.tipo_doc || "DNI") + " " + (p.documento || "")) +
          dato("Celular", p.celular) + dato("Correo", p.email) +
          dato("Efectivizado", dinero(sumar(opsComp, "monto"))) +
          dato(esConsulta() ? "Comisión generada" : "Tu comisión", dinero(sumar(opsComp, "comision"))) +
          dato("Operaciones", c.ops.length + " (" + opsComp.length + " completadas)") +
        "</div>" +

        '<h4 class="ad-sub-titulo">Identidad (DNI y selfie)</h4>' +
        (idn
          ? '<p class="ad-detalle">' + chip(idn.estado) + " Enviado el " + esc(fechaHora(idn.creado_en)) +
              (idn.revisado_en ? " · revisado el " + esc(fechaHora(idn.revisado_en)) : "") +
              (idn.motivo ? " · Motivo: " + esc(idn.motivo) : "") + "</p>" +
            (esConsulta()
              ? recibidos(fotosId.map(function (x) { return [x[0], x[2]]; })) + '<p class="ad-sub">Las fotos solo las ve un administrador.</p>'
              : fotosHtml(fotosId.filter(function (x) { return x[1]; })))
          : '<p class="ad-sub">Todavía no subió su DNI ni su selfie.</p>') +

        '<h4 class="ad-sub-titulo">Tarjetas registradas</h4>' +
        (c.tarjetas.length ? c.tarjetas.map(function (t, nt) {
          var f = [["Frente", t.foto_frontal, t.tiene_foto_frontal], ["Reverso", t.foto_posterior, t.tiene_foto_posterior]];
          return '<div class="ad-sub-bloque"><span class="ad-num-tarjeta">Tarjeta ' + (nt + 1) + " de " + c.tarjetas.length + "</span>" +
            '<p class="ad-detalle" style="margin-top:6px"><b>' + esc(t.banco || "") + "</b> " + esc(t.marca || "") + " ····" + esc(t.ultimos4 || "") +
            " · Titular: " + esc(t.titular || "—") + (t.dia_pago ? " · Paga el " + esc(t.dia_pago) : "") +
            (t.principal ? " · <b>principal</b>" : "") + (t.archivada ? " · archivada" : "") + " " + chip(t.estado) +
            (t.motivo ? '<br><span class="ad-sub">Motivo: ' + esc(t.motivo) + "</span>" : "") + "</p>" +
            (esConsulta() ? recibidos(f.map(function (x) { return ["Foto " + x[0].toLowerCase(), x[2]]; }))
                          : (f.some(function (x) { return x[1]; }) ? fotosHtml(f.filter(function (x) { return x[1]; })) : "")) + "</div>";
        }).join("") : '<p class="ad-sub">Todavía no registró ninguna tarjeta.</p>') +

        '<h4 class="ad-sub-titulo">Cuentas donde recibe el dinero</h4>' +
        (c.cuentas.length ? '<div class="ad-tabla-wrap plano"><table class="ad-tabla cards"><thead><tr><th>Banco</th><th>Tipo</th><th>Moneda</th><th>Número</th>' + (esAdmin() ? "<th>CCI</th>" : "") + "<th>Titular</th></tr></thead><tbody>" +
          c.cuentas.map(function (a) {
            return '<tr><td data-label="Banco"><b>' + esc(a.banco || "") + '</b></td><td data-label="Tipo">' + esc(a.tipo || "") + '</td><td data-label="Moneda">' + esc(a.moneda || "") +
              '</td><td data-label="Número">' + esc(a.numero || "") + "</td>" + (esAdmin() ? '<td data-label="CCI">' + esc(a.cci || "—") + "</td>" : "") +
              '<td data-label="Titular">' + esc(a.titular || "") + "</td></tr>";
          }).join("") + "</tbody></table></div>" : '<p class="ad-sub">Todavía no registró ninguna cuenta.</p>') +

        '<h4 class="ad-sub-titulo">Operaciones</h4>' +
        (c.ops.length ? '<div class="ad-tabla-wrap plano"><table class="ad-tabla cards"><thead><tr><th>Código</th><th class="dinero">Monto</th><th class="dinero">Comisión</th><th class="dinero">Recibe</th><th>Estado</th><th>Fecha</th></tr></thead><tbody>' +
          c.ops.map(function (o) {
            return '<tr><td data-label="Código"><b>' + esc(o.codigo || "") + '</b></td><td class="dinero" data-label="Monto">' + dinero(o.monto) + '</td><td class="dinero" data-label="Comisión">' + dinero(o.comision) +
              '</td><td class="dinero" data-label="Recibe"><b>' + dinero(o.neto) + '</b></td><td data-label="Estado">' + chip(o.estado) +
              (o.completada_en ? '<span class="ad-sub ad-bajo">depositada ' + esc(fecha(o.completada_en)) + "</span>" : "") +
              '</td><td class="nowrap" data-label="Fecha">' + esc(fecha(o.creado_en)) + "</td></tr>";
          }).join("") + "</tbody></table></div>" : '<p class="ad-sub">Todavía no hizo ninguna operación.</p>') +

        '<h4 class="ad-sub-titulo">Notas internas</h4>' +
        (hay.notas
          ? (esAdmin()
              ? '<div class="ad-nota-form"><label for="adNota" class="sr-only">Nueva nota</label><textarea id="adNota" rows="2" maxlength="2000" placeholder="Ej. Llamó el 12/11: prefiere que lo contacten por la tarde."></textarea>' +
                '<button class="btn btn-primary btn-sm" id="adGuardarNota">Guardar nota</button></div><p class="ad-sub">Las notas no se pueden editar ni borrar, y el equipo de consulta también las ve.</p>'
              : "") +
            (c.notas.length ? '<ul class="ad-notas">' + c.notas.map(function (n) {
              return "<li><p>" + esc(n.texto) + '</p><span class="ad-sub">' + esc(n.autor_email || "Equipo") + " · " + esc(fechaHora(n.creado_en)) + "</span></li>";
            }).join("") + "</ul>" : '<p class="ad-sub">Sin notas todavía.</p>')
          : '<p class="ad-sub">Las notas se activan al ejecutar supabase-equipo-consulta.sql en Supabase.</p>') +

        '<h4 class="ad-sub-titulo">Historial</h4>' +
        '<ul class="ad-actividad">' + hist.slice(0, 30).map(function (h) {
          return "<li><span>" + esc(h[1]) + "</span><time>" + esc(fechaHora(h[0])) + "</time></li>";
        }).join("") + "</ul>" +

        '<footer class="ad-acciones">' +
          (esAdmin() ? '<button class="btn btn-outline-dark btn-sm" id="waFicha">' + ICO_WA + " Escribir por WhatsApp</button>" +
            '<span class="ad-sub">Carpeta de sus fotos en Supabase: <code>' + esc(p.id || "") + "</code></span>" : '<span class="ad-sub">Vista de consulta: solo lectura.</span>') +
        "</footer>" +
      "</article>";

    if (esAdmin()) pintarFotos(cont);
    $("volverClientes").addEventListener("click", function () { vista = "clientes"; render(); });
    if ($("waFicha")) $("waFicha").addEventListener("click", function () { waCliente(p); });
    if ($("adGuardarNota")) $("adGuardarNota").addEventListener("click", function () {
      var t = $("adNota").value.trim();
      if (!t) { IC.toast("Escribe la nota primero.", "err"); $("adNota").focus(); return; }
      guardarNota(c, t, this);
    });
  }

  /* ---------- Operaciones ---------- */
  function vistaOps(cont) {
    if (!datos.ops.length) {
      cont.innerHTML = '<div class="ad-vacio"><h3>Sin operaciones</h3><p>Aquí verás cada efectivización solicitada.</p></div>';
      return;
    }
    /* el periodo se aplica a TODO lo de esta pestaña (tarjetas de resumen,
       contadores y lista), según la fecha en que se pidió la operación.
       Solo lo COMPLETADO es dinero cobrado: lo cancelado no suma comisión. */
    var enRango = datos.ops.filter(function (o) { return enPeriodo(o.creado_en, periodoOps); });
    var comp = enRango.filter(completada), pend = enRango.filter(pendiente), canc = enRango.filter(cancelada);

    var qo = busquedaOps.trim().toLowerCase();
    var ops = enRango.filter(function (o) {
      if (filtroOps === "pend_pago" && !pendiente(o)) return false;
      if (filtroOps === "completada" && !completada(o)) return false;
      if (filtroOps === "cancelada" && !cancelada(o)) return false;
      if (!qo) return true;
      return ((o.codigo || "") + " " + (o.nombre || "") + " " + (o.documento || "") + " " + (o.banco_tarjeta || "") + " " + (o.ultimos4 || "")).toLowerCase().indexOf(qo) >= 0;
    });
    var visibles = ops.slice(0, pagOps * POR_PAGINA);
    var periodos = [["todo", "Todo"], ["hoy", "Hoy"], ["7d", "7 días"], ["30d", "30 días"], ["mes", "Este mes"]];
    var filtrosOps = [["todas", "Todas (" + enRango.length + ")"], ["pend_pago", "Por pagar (" + pend.length + ")"],
                      ["completada", "Completadas (" + comp.length + ")"], ["cancelada", "Canceladas (" + canc.length + ")"]];

    cont.innerHTML =
      '<div class="ad-periodos" role="group" aria-label="Periodo">' + periodos.map(function (p) {
        return '<button class="ad-filtro' + (periodoOps === p[0] ? " on" : "") + '" data-per="' + p[0] + '">' + p[1] + "</button>";
      }).join("") + '<span class="ad-sub">según la fecha en que se pidió</span></div>' +
      '<div class="ad-kpis">' +
        kpi("Efectivizado", dinero(sumar(comp, "monto")), plural(comp.length, "operación completada", "operaciones completadas")) +
        kpi("Esperando pago", dinero(sumar(pend, "monto")), plural(pend.length, "operación", "operaciones") + " · " + dinero(sumar(pend, "comision")) + " de comisión", pend.length ? "alerta" : "") +
        kpi(esConsulta() ? "Comisiones cobradas" : "Tus comisiones cobradas", dinero(sumar(comp, "comision")), "solo operaciones completadas", "verde") +
      "</div>" +
      '<div class="ad-barra">' +
        '<div class="ad-buscador">' + ICO_BUSCAR +
          '<input id="adBuscarOps" type="search" aria-label="Buscar operaciones" placeholder="Buscar por código, cliente, DNI o tarjeta" value="' + esc(busquedaOps) + '">' +
        "</div>" +
        (esAdmin() ? '<button class="btn btn-outline-dark btn-sm ad-excel" id="adExpOps" title="Descargar para Excel o Google Sheets">' + ICO_EXCEL + " Excel</button>" : "") +
        '<div class="ad-filtros">' + filtrosOps.map(function (f) {
          return '<button class="ad-filtro' + (filtroOps === f[0] ? " on" : "") + '" data-fo="' + f[0] + '">' + f[1] + "</button>";
        }).join("") + "</div>" +
      "</div>" +
      (ops.length ? '<div class="ad-tabla-wrap"><table class="ad-tabla ops cards"><thead><tr>' +
        "<th>Código</th><th>Cliente</th><th>Tarjeta</th><th>Destino</th><th class=\"dinero\">Monto</th><th class=\"dinero\">Comisión</th><th class=\"dinero\">Recibe</th><th>Estado</th><th>Fecha</th>" +
        (esAdmin() ? "<th>Acción</th>" : "") + "</tr></thead><tbody>" +
        visibles.map(function (o, i) {
          var tieneFicha = o.user_id && datos.porId[o.user_id];
          return '<tr><td data-label="Código"><b>' + esc(o.codigo || "") + "</b></td>" +
            '<td data-label="Cliente">' + (tieneFicha ? '<button class="ad-link" data-cli="' + esc(o.user_id) + '">' + esc(o.nombre || "") + "</button>" : esc(o.nombre || "")) +
              '<span class="ad-sub ad-bajo">' + esc(o.documento || "") + "</span></td>" +
            '<td data-label="Tarjeta">' + esc(o.banco_tarjeta || "—") + " ···· " + esc(o.ultimos4 || "") + "</td>" +
            '<td data-label="Destino">' + esc(o.banco_cuenta || "—") + '<span class="ad-sub ad-bajo">' + esc(o.numero_cuenta || "") + "</span></td>" +
            '<td class="dinero" data-label="Monto">' + dinero(o.monto) + '</td><td class="dinero" data-label="Comisión">' + dinero(o.comision) +
            '</td><td class="dinero" data-label="Recibe"><b>' + dinero(o.neto) + "</b></td>" +
            '<td data-label="Estado">' + chip(o.estado) + (o.completada_en ? '<span class="ad-sub ad-bajo">depositada ' + esc(fecha(o.completada_en)) + "</span>" : "") + "</td>" +
            '<td class="fecha" data-label="Fecha">' + esc(fecha(o.creado_en)) + "</td>" +
            (esAdmin()
              ? '<td data-label="" class="ad-celda-acc">' + (completada(o) || cancelada(o)
                  ? '<span class="ad-sub">—</span>'
                  : '<div class="ad-acc-op"><button class="btn btn-primary btn-sm" data-ok="' + i + '">Completada</button>' +
                    '<button class="btn btn-outline-dark btn-sm" data-cx="' + i + '">Cancelar</button></div>') + "</td>"
              : "") +
            "</tr>";
        }).join("") + "</tbody></table></div>" + paginador(ops.length, visibles.length, "adMasOps")
      : '<div class="ad-vacio"><h3>Sin resultados</h3><p>Prueba con otro código, otro periodo o quita los filtros.</p></div>');

    enlazarBuscador("adBuscarOps", function (v) { busquedaOps = v; pagOps = 1; });
    cont.querySelectorAll("[data-fo]").forEach(function (b) { b.addEventListener("click", function () { filtroOps = b.dataset.fo; pagOps = 1; render(); }); });
    cont.querySelectorAll("[data-per]").forEach(function (b) { b.addEventListener("click", function () { periodoOps = b.dataset.per; pagOps = 1; render(); }); });
    if ($("adExpOps")) $("adExpOps").addEventListener("click", function () { exportarOperaciones(ops); });
    if ($("adMasOps")) $("adMasOps").addEventListener("click", function () { pagOps++; render(); });
    cont.querySelectorAll("[data-cli]").forEach(function (b) { b.addEventListener("click", function () { abrirFicha(b.dataset.cli); }); });
    cont.querySelectorAll("[data-ok]").forEach(function (b) { b.addEventListener("click", function () { confirmarCompletada(visibles[+b.dataset.ok]); }); });
    cont.querySelectorAll("[data-cx]").forEach(function (b) { b.addEventListener("click", function () { confirmarCancelar(visibles[+b.dataset.cx]); }); });
  }

  /* ---------- Actividad (historial del servidor; solo administrador) ---------- */
  function textoAccion(h) {
    if (h.accion === "ingreso_panel") return "entró al panel";
    if (h.accion === "cambio_estado") {
      var que = { documentos: "la identidad", tarjetas: "la tarjeta", operaciones: "la operación" }[h.tabla] || h.tabla;
      var hizo = { verificado: "aprobó", verificada: "aprobó", rechazado: "rechazó", completada: "marcó como completada",
                   cancelada: "canceló", en_revision: "devolvió a revisión", pend_pago: "dejó pendiente de pago" }[h.despues] || ("cambió a «" + h.despues + "»");
      return hizo + " " + que;
    }
    return h.accion;
  }
  function detalleAccion(h, corto) {
    var d = h.detalle || {}, partes = [];
    if (!corto && h.cliente_id && datos.porId[h.cliente_id]) partes.push("de " + nombre(datos.porId[h.cliente_id]));
    if (d.codigo) partes.push(d.codigo);
    if (d.banco || d.ultimos4) partes.push((d.banco || "") + " ····" + (d.ultimos4 || ""));
    if (d.monto != null && h.tabla === "operaciones") partes.push(dinero(d.monto));
    if (d.motivo && h.despues === "rechazado") partes.push("motivo: «" + d.motivo + "»");
    return partes.length ? " " + partes.join(" · ") : "";
  }
  function vistaActividad(cont) {
    if (!esAdmin()) { vista = "resumen"; render(); return; }
    if (!hay.historial) {
      cont.innerHTML = '<div class="ad-vacio"><h3>El historial aún no está activo</h3><p>Ejecuta <b>supabase-equipo-consulta.sql</b> en Supabase. Desde ese momento cada aprobación, rechazo, depósito y cancelación queda registrada con quién la hizo.</p></div>';
      return;
    }
    var lista = datos.historial.filter(function (h) {
      if (filtroAct === "cambios") return h.accion === "cambio_estado";
      if (filtroAct === "ingresos") return h.accion === "ingreso_panel";
      return true;
    });
    var visibles = lista.slice(0, pagAct * POR_PAGINA);
    var filtros = [["todo", "Todo"], ["cambios", "Cambios de estado"], ["ingresos", "Ingresos al panel"]];
    cont.innerHTML =
      '<div class="ad-barra"><div class="ad-filtros">' + filtros.map(function (f) {
        return '<button class="ad-filtro' + (filtroAct === f[0] ? " on" : "") + '" data-fa="' + f[0] + '">' + f[1] + "</button>";
      }).join("") + '</div><span class="ad-sub">Registrado por el servidor. No se puede editar ni borrar.</span></div>' +
      (lista.length ? '<div class="ad-tabla-wrap"><table class="ad-tabla cards"><thead><tr><th>Fecha</th><th>Quién</th><th>Qué hizo</th><th>Detalle</th></tr></thead><tbody>' +
        visibles.map(function (h) {
          return '<tr><td class="nowrap" data-label="Fecha">' + esc(fechaHora(h.creado_en)) + "</td>" +
            '<td data-label="Quién"><b>' + esc(h.actor_email || (h.actor_rol === "cliente" ? "Cliente" : "Sistema")) + '</b><span class="ad-sub ad-bajo">' + esc(h.actor_rol || "") + "</span></td>" +
            '<td data-label="Qué hizo">' + esc(textoAccion(h)) + (h.antes && h.despues ? '<span class="ad-sub ad-bajo">' + esc(h.antes) + " → " + esc(h.despues) + "</span>" : "") + "</td>" +
            '<td data-label="Detalle">' + (h.cliente_id && datos.porId[h.cliente_id] ? '<button class="ad-link" data-cli="' + esc(h.cliente_id) + '">' + esc(nombre(datos.porId[h.cliente_id])) + "</button>" : "") +
              '<span class="ad-sub ad-bajo">' + esc(detalleAccion(h, true).trim()) + "</span></td></tr>";
        }).join("") + "</tbody></table></div>" + paginador(lista.length, visibles.length, "adMasAct")
      : '<div class="ad-vacio"><h3>Sin movimientos todavía</h3><p>Aquí aparecerá cada cambio que haga el equipo.</p></div>');
    cont.querySelectorAll("[data-fa]").forEach(function (b) { b.addEventListener("click", function () { filtroAct = b.dataset.fa; pagAct = 1; render(); }); });
    if ($("adMasAct")) $("adMasAct").addEventListener("click", function () { pagAct++; render(); });
    cont.querySelectorAll("[data-cli]").forEach(function (b) { b.addEventListener("click", function () { abrirFicha(b.dataset.cli); }); });
  }

  /* ---------- despachador ---------- */
  function render() {
    var cont = $("adView");
    var n = datos.pendientes.length;
    $("adBadge").textContent = n;
    $("adBadge").style.display = n ? "" : "none";
    document.querySelectorAll(".ad-tab").forEach(function (b) {
      var on = b.dataset.v === vista || (vista === "ficha" && b.dataset.v === "clientes");
      b.classList.toggle("on", on);
      if (on) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
    });
    if (vista === "resumen") return vistaResumen(cont);
    if (vista === "pendientes") return vistaPendientes(cont);
    if (vista === "clientes") return vistaClientes(cont);
    if (vista === "ficha") return vistaFicha(cont);
    if (vista === "actividad") return vistaActividad(cont);
    return vistaOps(cont);
  }

  /* ---------------- arranque ---------------- */
  function prepararSegunRol() {
    var consulta = esConsulta();
    $("adRolTag").textContent = consulta ? "Consulta" : "Administración";
    $("adAvisoRol").classList.toggle("hidden", !consulta);
    $("adTabActividad").classList.toggle("hidden", !esAdmin());
    document.body.classList.toggle("ad-modo-consulta", consulta);
    var correo = sesion && sesion.user && sesion.user.email;
    $("adUsuario").textContent = correo ? correo : "";
    var cl = CFG.claims || {};
    $("adPie").textContent = "Impulsa Crédito · " + [cl.company, cl.ruc ? "RUC " + cl.ruc : ""].filter(Boolean).join(" · ") + " · Uso interno";
  }

  async function entrarConSesion() {
    rol = await obtenerRol();
    if (!rol) {
      $("adLoginError").textContent = "Esta cuenta no tiene permisos del equipo.";
      $("adLoginError").classList.remove("hidden");
      sesion = null;
      try { localStorage.removeItem(SES); } catch (e) {}
      return false;
    }
    prepararSegunRol();
    $("adLogin").classList.add("hidden");
    $("adPanel").classList.remove("hidden");
    $("adView").innerHTML = '<div class="ad-vacio"><span class="ad-cargando grande"></span><p>Cargando la información...</p></div>';
    // deja constancia del ingreso (si el historial ya está activo)
    api("/rest/v1/rpc/registrar_ingreso", { method: "POST", body: "{}" }).catch(function () {});
    try {
      await cargar();
      render();
    } catch (e) {
      $("adView").innerHTML = '<div class="ad-vacio"><h3>No se pudo cargar la información</h3>' +
        "<p>" + esc(e.message || "Revisa tu conexión a internet.") + "</p>" +
        '<button class="btn btn-primary btn-sm" style="margin-top:16px" id="adReintentar">Reintentar</button></div>';
      $("adReintentar").addEventListener("click", function () { location.reload(); });
    }
    return true;
  }

  /* Si algo falla de forma inesperada al abrir el panel, mostramos el
     acceso y avisamos, en lugar de dejar una pantalla vacía. */
  function rescatar(motivo) {
    try {
      var login = $("adLogin"), panel = $("adPanel"), err = $("adLoginError");
      if (login) login.classList.remove("hidden");
      if (panel) panel.classList.add("hidden");
      if (err) { err.textContent = "Hubo un problema al abrir el panel: " + motivo + ". Vuelve a entrar."; err.classList.remove("hidden"); }
      try { localStorage.removeItem(SES); } catch (e) {}
    } catch (e) {}
  }
  window.addEventListener("error", function (ev) {
    if ($("adPanel") && $("adPanel").classList.contains("hidden")) return;
    rescatar((ev && ev.message) || "error inesperado");
  });

  async function arrancar() {
    if (window.IC && IC.bindPassToggles) IC.bindPassToggles(document);

    document.querySelectorAll(".ad-tab").forEach(function (b) {
      b.addEventListener("click", function () { irA(b.dataset.v); });
    });
    $("adSalir").addEventListener("click", salir);
    $("adClave").addEventListener("click", cambiarClave);
    $("adRefrescar").addEventListener("click", async function () {
      $("adRefrescar").disabled = true;
      cacheFotos = {};
      try { await cargar(); render(); IC.toast("Actualizado", "ok"); }
      catch (e) { IC.toast("No se pudo actualizar: " + e.message, "err"); }
      $("adRefrescar").disabled = false;
    });

    $("adLoginForm").addEventListener("submit", async function (e) {
      e.preventDefault();
      var b = $("adLoginBtn"), err = $("adLoginError");
      var correo = $("adEmail").value.trim(), clave = $("adPass").value;
      err.classList.add("hidden");
      if (!correo || !clave) { err.textContent = "Escribe tu correo y tu contraseña."; err.classList.remove("hidden"); return; }
      b.disabled = true; b.textContent = "Verificando...";
      try {
        var s = await api("/auth/v1/token?grant_type=password", {
          method: "POST", sinSesion: true, body: JSON.stringify({ email: correo, password: clave })
        });
        guardar(s);
        $("adPass").value = "";
        await entrarConSesion();
      } catch (ex) {
        err.textContent = /Invalid login/i.test(ex.message) ? "Correo o contraseña incorrectos." : ex.message;
        err.classList.remove("hidden");
      }
      b.disabled = false; b.textContent = "Entrar";
    });

    /* ¿había sesión guardada? */
    var g = null;
    try { g = JSON.parse(localStorage.getItem(SES) || "null"); } catch (e) {}
    if (g && g.refresh_token) {
      try {
        var s2 = await api("/auth/v1/token?grant_type=refresh_token", {
          method: "POST", sinSesion: true, body: JSON.stringify({ refresh_token: g.refresh_token })
        });
        guardar(s2);
        await entrarConSesion();
      } catch (e) { try { localStorage.removeItem(SES); } catch (e2) {} }
    }
  }

  function inicio() { arrancar().catch(function (e) { rescatar(e.message || "no se pudo iniciar"); }); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", inicio);
  else inicio();
})();
