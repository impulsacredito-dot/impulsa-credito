/* =====================================================================
   IMPULSA CRÉDITO — Panel de administración
   =====================================================================
   Uso interno. Aquí revisas los registros nuevos, ves las fotos del DNI
   y de las tarjetas, y apruebas o rechazas.

   SEGURIDAD: este archivo es público (está en el repositorio), y da
   igual. La protección NO vive aquí: vive en Supabase. Solo los
   usuarios inscritos en la tabla "admins" pueden leer datos de otros
   clientes. Si alguien abre esta página sin ser admin, verá una lista
   vacía, porque el servidor no le entrega nada.

   Requiere haber ejecutado supabase-admin.sql.
   ===================================================================== */
(function () {
  "use strict";

  var CFG = window.SITE_CONFIG || {};
  var B = CFG.backend || {};
  var base = (B.supabaseUrl || "").replace(/\/+$/, "");
  var KEY = B.supabaseAnonKey || "";
  var BUCKET = B.bucket || "documentos";
  var SES = "ic_admin_sesion_v1";

  var sesion = null;
  var datos = { pendientes: [], clientes: [], ops: [] };
  var vista = "pendientes";
  var fichaDe = null;   // cliente cuya ficha se esta viendo
  var cacheFotos = {};

  function $(id) { return document.getElementById(id); }
  function esc(s) { return window.IC ? IC.esc(s) : String(s == null ? "" : s); }

  /* ---------------- red ---------------- */
  function cab(extra) {
    var h = { apikey: KEY, "Content-Type": "application/json" };
    h.Authorization = "Bearer " + (sesion ? sesion.access_token : KEY);
    for (var k in extra) h[k] = extra[k];
    return h;
  }
  async function api(ruta, opts) {
    var res = await fetch(base + ruta, opts || { headers: cab() });
    var txt = await res.text();
    var d = null;
    try { d = txt ? JSON.parse(txt) : null; } catch (e) { d = txt; }
    if (!res.ok) {
      var m = (d && (d.msg || d.message || d.error_description || d.error)) || ("Error " + res.status);
      var err = new Error(m); err.status = res.status; throw err;
    }
    return d;
  }

  /* ---------------- sesión ---------------- */
  function guardar(s) {
    sesion = s;
    try { localStorage.setItem(SES, JSON.stringify({ refresh_token: s.refresh_token })); } catch (e) {}
  }
  function salir() {
    sesion = null;
    try { localStorage.removeItem(SES); } catch (e) {}
    location.reload();
  }
  async function esAdmin() {
    try {
      var r = await api("/rest/v1/rpc/es_admin", { method: "POST", headers: cab(), body: "{}" });
      return r === true;
    } catch (e) { return false; }
  }

  /* ---------------- carga de datos ---------------- */
  async function cargar() {
    var perfiles = await api("/rest/v1/perfiles?select=*&order=creado_en.desc", { headers: cab() });
    var docs = await api("/rest/v1/documentos?select=*&order=creado_en.desc", { headers: cab() });
    var tarj = await api("/rest/v1/tarjetas?select=*&order=creado_en.desc", { headers: cab() });
    var ctas = await api("/rest/v1/cuentas?select=*&order=creado_en.desc", { headers: cab() });
    var ops = await api("/rest/v1/operaciones?select=*&order=creado_en.desc", { headers: cab() });

    var porId = {};
    (perfiles || []).forEach(function (p) {
      porId[p.id] = { perfil: p, docs: [], tarjetas: [], cuentas: [], ops: [] };
    });
    function meter(lista, campo) {
      (lista || []).forEach(function (x) {
        if (x.user_id && porId[x.user_id]) porId[x.user_id][campo].push(x);
      });
    }
    meter(docs, "docs"); meter(tarj, "tarjetas"); meter(ctas, "cuentas"); meter(ops, "ops");

    datos.clientes = Object.keys(porId).map(function (k) { return porId[k]; });
    datos.ops = ops || [];

    /* pendientes: identidad o tarjetas esperando revisión */
    var pend = [];
    (docs || []).forEach(function (d) {
      if (d.estado === "en_revision") pend.push({ clase: "identidad", tabla: "documentos", fila: d, cliente: porId[d.user_id] });
    });
    (tarj || []).forEach(function (t) {
      if (t.estado === "en_revision") pend.push({ clase: "tarjeta", tabla: "tarjetas", fila: t, cliente: porId[t.user_id] });
    });
    pend.sort(function (a, b) { return new Date(a.fila.creado_en) - new Date(b.fila.creado_en); });
    datos.pendientes = pend;
  }

  /* ---------------- fotos privadas (enlace temporal) ---------------- */
  async function urlFoto(ruta) {
    if (!ruta) return null;
    if (cacheFotos[ruta]) return cacheFotos[ruta];
    try {
      var r = await api("/storage/v1/object/sign/" + BUCKET + "/" + encodeURI(ruta), {
        method: "POST", headers: cab(), body: JSON.stringify({ expiresIn: 3600 })
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
      if (u) {
        n.innerHTML = '<img src="' + u + '" alt="">' +
          '<a class="ad-zoom" href="' + u + '" target="_blank" rel="noopener" title="Ver en grande">' +
          '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M15 3h6v6M10 14L21 3M21 14v7H3V3h7"/></svg></a>';
        // si el archivo esta dañado o no es una imagen, no dejamos el icono roto
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

  /* ---------------- acciones ---------------- */
  async function decidir(item, aprobar, motivo) {
    var esIdent = item.clase === "identidad";
    var nuevo = aprobar ? (esIdent ? "verificado" : "verificada") : "rechazado";
    var cuerpo = { estado: nuevo, revisado_en: new Date().toISOString() };
    if (!aprobar) cuerpo.motivo = motivo || null;

    await api("/rest/v1/" + item.tabla + "?id=eq." + item.fila.id, {
      method: "PATCH", headers: cab({ Prefer: "return=minimal" }), body: JSON.stringify(cuerpo)
    });

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
    try {
      await api("/rest/v1/avisos", {
        method: "POST", headers: cab({ Prefer: "return=minimal" }),
        body: JSON.stringify({ user_id: item.fila.user_id, titulo: titulo, texto: texto, tipo: aprobar ? "ok" : "alerta" })
      });
    } catch (e) { /* el aviso es un extra: si falla, la decisión ya quedó guardada */ }

    IC.toast(aprobar ? "Aprobado. El cliente ya fue avisado." : "Rechazado. El cliente ya fue avisado.", aprobar ? "ok" : "err");
    await cargar(); render();
  }

  function pedirMotivo(item) {
    IC.modal({
      title: "¿Por qué lo rechazas?",
      html: '<p class="muted">El cliente verá este mensaje en su panel, así sabrá qué corregir.</p>' +
        '<div class="field mt-8"><textarea id="adMotivo" rows="3" placeholder="Ej. La foto del DNI sale borrosa y no se lee el número."></textarea></div>',
      actions: [
        { label: "Cancelar", cls: "btn-outline-dark" },
        { label: "Rechazar y avisar", cls: "btn-danger", onClick: function () {
            var m = (($("adMotivo") && $("adMotivo").value) || "").trim();
            decidir(item, false, m);
          } }
      ]
    });
  }

  /* Marca la operación como completada o cancelada y avisa al cliente */
  async function cambiarOperacion(op, estado) {
    await api("/rest/v1/operaciones?id=eq." + op.id, {
      method: "PATCH", headers: cab({ Prefer: "return=minimal" }),
      body: JSON.stringify({ estado: estado })
    });
    var titulo = estado === "completada" ? "¡Depósito realizado!" : "Operación cancelada";
    var texto = estado === "completada"
      ? ("Ya depositamos " + IC.money(op.neto) + " en tu cuenta " + (op.banco_cuenta || "") +
         ". Tu comprobante de la operación " + (op.codigo || "") + " ya está disponible.")
      : ("La operación " + (op.codigo || "") + " fue cancelada. Si crees que es un error, escríbenos por WhatsApp.");
    try {
      await api("/rest/v1/avisos", {
        method: "POST", headers: cab({ Prefer: "return=minimal" }),
        body: JSON.stringify({ user_id: op.user_id, titulo: titulo, texto: texto,
                               tipo: estado === "completada" ? "ok" : "alerta" })
      });
    } catch (e) { /* el aviso es un extra: el cambio de estado ya quedó guardado */ }
    IC.toast(estado === "completada" ? "Marcada como completada. El cliente ya fue avisado." : "Operación cancelada.",
             estado === "completada" ? "ok" : "err");
    await cargar(); render();
  }

  function confirmarCompletada(op) {
    IC.modal({
      title: "¿Ya depositaste el dinero?",
      html: "<p>Vas a dar por <b>completada</b> la operación <b>" + esc(op.codigo || "") + "</b> de " +
            esc(op.nombre || "") + ".</p>" +
            '<p class="muted mt-8">Confirma solo si ya hiciste la transferencia de <b>' + IC.money(op.neto) +
            "</b> a la cuenta " + esc(op.banco_cuenta || "") + " " + esc(op.numero_cuenta || "") +
            ". El cliente recibirá el aviso y su comprobante quedará disponible.</p>",
      actions: [
        { label: "Todavía no", cls: "btn-outline-dark" },
        { label: "Sí, ya deposité", cls: "btn-primary", onClick: function () { cambiarOperacion(op, "completada"); } }
      ]
    });
  }

  function waCliente(p) {
    var tel = String((p && p.celular) || "").replace(/\D/g, "");
    if (!tel) { IC.toast("Este cliente no dejó su celular.", "err"); return; }
    if (tel.length === 9) tel = "51" + tel;
    var msg = "Hola " + ((p && p.nombres) || "") + ", te escribimos de Impulsa Crédito sobre tu solicitud.";
    window.open("https://wa.me/" + tel + "?text=" + encodeURIComponent(msg), "_blank", "noopener");
  }

  /* ---------------- pintado ---------------- */
  function chip(estado) {
    var m = {
      en_revision: ["En revisión", "warn"], verificado: ["Verificado", "ok"], verificada: ["Verificada", "ok"],
      rechazado: ["Rechazado", "err"], completada: ["Completada", "ok"], en_proceso: ["En proceso", "warn"],
      cancelada: ["Cancelada", "err"], pend_pago: ["Pendiente de pago", "warn"], activa: ["Activa", "warn"]
    };
    var v = m[estado] || [estado || "—", ""];
    return '<span class="ad-chip ' + v[1] + '">' + esc(v[0]) + "</span>";
  }
  function nombre(c) {
    if (!c || !c.perfil) return "Cliente sin perfil";
    return ((c.perfil.nombres || "") + " " + (c.perfil.apellidos || "")).trim() || "Sin nombre";
  }

  function tarjetaPendiente(item, i) {
    var p = (item.cliente && item.cliente.perfil) ? item.cliente.perfil : {};
    var f = item.fila;
    var fotos = item.clase === "identidad"
      ? [["DNI — frente", f.dni_frontal], ["DNI — reverso", f.dni_posterior], ["Selfie", f.selfie]]
      : [["Tarjeta — frente", f.foto_frontal], ["Tarjeta — reverso", f.foto_posterior]];

    return '<article class="ad-card">' +
      '<header class="ad-card-head">' +
        "<div>" +
          '<span class="ad-tipo ' + (item.clase === "identidad" ? "t-id" : "t-card") + '">' +
          (item.clase === "identidad" ? "Identidad" : "Tarjeta") + "</span>" +
          "<h3>" + esc(nombre(item.cliente)) + "</h3>" +
          '<p class="ad-meta">' + esc(p.tipo_doc || "DNI") + " " + esc(p.documento || "—") +
          " · " + esc(p.celular || "sin celular") +
          " · " + (window.IC ? IC.fmtDateTime(new Date(f.creado_en)) : "") + "</p>" +
        "</div>" +
        "<div>" + chip(f.estado) + "</div>" +
      "</header>" +
      (item.clase === "tarjeta"
        ? '<p class="ad-detalle"><b>' + esc(f.banco || "") + "</b> " + esc(f.marca || "") +
          " ···· " + esc(f.ultimos4 || "") + " · Titular: " + esc(f.titular || "—") + "</p>"
        : "") +
      '<div class="ad-fotos">' +
        fotos.map(function (x) {
          return "<figure><figcaption>" + esc(x[0]) + "</figcaption>" +
            '<div class="ad-foto" data-foto="' + esc(x[1] || "") + '"><span class="ad-cargando"></span></div></figure>';
        }).join("") +
      "</div>" +
      '<footer class="ad-acciones">' +
        '<button class="btn btn-outline-dark btn-sm" data-wa="' + i + '">Escribir por WhatsApp</button>' +
        '<div class="ad-acciones-der">' +
          '<button class="btn btn-danger btn-sm" data-no="' + i + '">Rechazar</button>' +
          '<button class="btn btn-primary btn-sm" data-si="' + i + '">Aprobar</button>' +
        "</div>" +
      "</footer>" +
    "</article>";
  }

  function render() {
    var cont = $("adView");
    var n = datos.pendientes.length;
    $("adBadge").textContent = n;
    $("adBadge").style.display = n ? "" : "none";

    document.querySelectorAll(".ad-tab").forEach(function (b) {
      b.classList.toggle("on", b.dataset.v === vista || (vista === "ficha" && b.dataset.v === "clientes"));
    });

    if (vista === "pendientes") {
      cont.innerHTML = !n
        ? '<div class="ad-vacio"><div class="ad-vacio-ico">✓</div><h3>Todo al día</h3><p>No hay solicitudes esperando revisión.</p></div>'
        : '<p class="ad-conteo">' + n + (n === 1 ? " solicitud espera" : " solicitudes esperan") + " tu revisión</p>" +
          datos.pendientes.map(tarjetaPendiente).join("");
      pintarFotos(cont);
      cont.querySelectorAll("[data-si]").forEach(function (b) {
        b.addEventListener("click", function () { decidir(datos.pendientes[+b.dataset.si], true); });
      });
      cont.querySelectorAll("[data-no]").forEach(function (b) {
        b.addEventListener("click", function () { pedirMotivo(datos.pendientes[+b.dataset.no]); });
      });
      cont.querySelectorAll("[data-wa]").forEach(function (b) {
        b.addEventListener("click", function () {
          var it = datos.pendientes[+b.dataset.wa];
          waCliente(it.cliente ? it.cliente.perfil : null);
        });
      });
      return;
    }

    if (vista === "clientes") {
      if (!datos.clientes.length) {
        cont.innerHTML = '<div class="ad-vacio"><h3>Aún no hay clientes</h3><p>Aparecerán aquí en cuanto alguien se registre.</p></div>';
        return;
      }
      cont.innerHTML = '<div class="ad-tabla-wrap"><table class="ad-tabla"><thead><tr>' +
        "<th>Cliente</th><th>Documento</th><th>Celular</th><th>Identidad</th><th>Tarjetas</th><th>Cuentas</th><th>Ops.</th><th></th>" +
        "</tr></thead><tbody>" +
        datos.clientes.map(function (c, i) {
          var id = c.docs[0];
          return "<tr><td><b>" + esc(nombre(c)) + "</b><br><span class=\"ad-sub\">" + esc(c.perfil.email || "") + "</span></td>" +
            "<td>" + esc(c.perfil.tipo_doc || "") + " " + esc(c.perfil.documento || "") + "</td>" +
            "<td>" + esc(c.perfil.celular || "—") + "</td>" +
            "<td>" + (id ? chip(id.estado) : '<span class="ad-chip">Sin subir</span>') + "</td>" +
            "<td>" + (c.tarjetas.length
              ? "<b>" + c.tarjetas.length + "</b><br>" + c.tarjetas.map(function (t) {
                  return '<span class="ad-sub">' + esc(t.banco || "") + " " + esc(t.marca || "") + " ····" + esc(t.ultimos4 || "") + "</span>";
                }).join("<br>")
              : '<span class="ad-sub">—</span>') + "</td>" +
            "<td>" + c.cuentas.length + "</td><td>" + c.ops.length + "</td>" +
            '<td><div class="ad-acc-op">' +
              '<button class="btn btn-primary btn-sm" data-ficha="' + i + '">Ver ficha</button>' +
              '<button class="btn btn-outline-dark btn-sm" data-wac="' + i + '">WhatsApp</button>' +
            "</div></td></tr>";
        }).join("") + "</tbody></table></div>";
      cont.querySelectorAll("[data-wac]").forEach(function (b) {
        b.addEventListener("click", function () { waCliente(datos.clientes[+b.dataset.wac].perfil); });
      });
      cont.querySelectorAll("[data-ficha]").forEach(function (b) {
        b.addEventListener("click", function () { fichaDe = +b.dataset.ficha; vista = "ficha"; render(); });
      });
      return;
    }

    /* ---------- ficha completa de un cliente ---------- */
    if (vista === "ficha") {
      var c = datos.clientes[fichaDe];
      if (!c) { vista = "clientes"; render(); return; }
      var p = c.perfil, idn = c.docs[0];

      function dato(k, v) { return '<div class="ad-dato"><span>' + k + "</span><b>" + esc(v || "—") + "</b></div>"; }
      function bloqueFotos(titulo, lista) {
        if (!lista.length) return "";
        return '<h4 class="ad-sub-titulo">' + esc(titulo) + "</h4>" +
          '<div class="ad-fotos">' + lista.map(function (x) {
            return "<figure><figcaption>" + esc(x[0]) + "</figcaption>" +
              '<div class="ad-foto" data-foto="' + esc(x[1] || "") + '"><span class="ad-cargando"></span></div></figure>';
          }).join("") + "</div>";
      }

      var fotosId = idn ? [["DNI — frente", idn.dni_frontal], ["DNI — reverso", idn.dni_posterior], ["Selfie", idn.selfie]]
                         .filter(function (x) { return x[1]; }) : [];

      cont.innerHTML =
        '<button class="btn btn-outline-dark btn-sm" id="volverClientes" style="margin-bottom:16px">‹ Volver a Clientes</button>' +
        '<article class="ad-card">' +
          '<header class="ad-card-head"><div><span class="ad-tipo t-id">Ficha del cliente</span>' +
          "<h3>" + esc(nombre(c)) + "</h3>" +
          '<p class="ad-meta">Registrado el ' + (p.creado_en ? IC.fmtDateTime(new Date(p.creado_en)) : "—") + "</p></div>" +
          "<div>" + (idn ? chip(idn.estado) : '<span class="ad-chip">Identidad sin subir</span>') + "</div></header>" +
          '<div class="ad-datos">' +
            dato("Documento", (p.tipo_doc || "DNI") + " " + (p.documento || "")) +
            dato("Celular", p.celular) + dato("Correo", p.email) +
            dato("Tarjetas", String(c.tarjetas.length)) + dato("Cuentas", String(c.cuentas.length)) +
            dato("Operaciones", String(c.ops.length)) +
          "</div>" +
          bloqueFotos("Documentos de identidad", fotosId) +

          '<h4 class="ad-sub-titulo">Tarjetas registradas</h4>' +
          (c.tarjetas.length ? c.tarjetas.map(function (t) {
            var f = [["Frente", t.foto_frontal], ["Reverso", t.foto_posterior]].filter(function (x) { return x[1]; });
            return '<div class="ad-sub-bloque"><p class="ad-detalle" style="margin-top:0"><b>' + esc(t.banco || "") + "</b> " +
              esc(t.marca || "") + " ····" + esc(t.ultimos4 || "") + " · Titular: " + esc(t.titular || "—") +
              (t.dia_pago ? " · Paga el " + esc(t.dia_pago) : "") +
              (t.principal ? " · <b>principal</b>" : "") + " " + chip(t.estado) + "</p>" +
              (f.length ? '<div class="ad-fotos">' + f.map(function (x) {
                return "<figure><figcaption>" + esc(x[0]) + "</figcaption>" +
                  '<div class="ad-foto" data-foto="' + esc(x[1]) + '"><span class="ad-cargando"></span></div></figure>';
              }).join("") + "</div>" : "") + "</div>";
          }).join("") : '<p class="ad-sub">Todavía no registró ninguna tarjeta.</p>') +

          '<h4 class="ad-sub-titulo">Cuentas donde recibe el dinero</h4>' +
          (c.cuentas.length ? '<div class="ad-tabla-wrap"><table class="ad-tabla"><thead><tr><th>Banco</th><th>Tipo</th><th>Moneda</th><th>Número</th><th>CCI</th><th>Titular</th></tr></thead><tbody>' +
            c.cuentas.map(function (a) {
              return "<tr><td><b>" + esc(a.banco || "") + "</b></td><td>" + esc(a.tipo || "") + "</td><td>" + esc(a.moneda || "") +
                "</td><td>" + esc(a.numero || "") + "</td><td>" + esc(a.cci || "—") + "</td><td>" + esc(a.titular || "") + "</td></tr>";
            }).join("") + "</tbody></table></div>" : '<p class="ad-sub">Todavía no registró ninguna cuenta.</p>') +

          '<h4 class="ad-sub-titulo">Operaciones</h4>' +
          (c.ops.length ? '<div class="ad-tabla-wrap"><table class="ad-tabla"><thead><tr><th>Código</th><th>Monto</th><th>Comisión</th><th>Recibe</th><th>Estado</th><th>Fecha</th></tr></thead><tbody>' +
            c.ops.map(function (o) {
              return "<tr><td><b>" + esc(o.codigo || "") + "</b></td><td>" + IC.money(o.monto) + "</td><td>" + IC.money(o.comision) +
                "</td><td><b>" + IC.money(o.neto) + "</b></td><td>" + chip(o.estado) + "</td><td>" + IC.fmtDate(new Date(o.creado_en)) + "</td></tr>";
            }).join("") + "</tbody></table></div>" : '<p class="ad-sub">Todavía no hizo ninguna operación.</p>') +

          '<footer class="ad-acciones"><button class="btn btn-outline-dark btn-sm" id="waFicha">Escribir por WhatsApp</button>' +
          '<span class="ad-sub">Carpeta de sus fotos en Supabase: <code>' + esc(p.id || "") + "</code></span></footer>" +
        "</article>";

      pintarFotos(cont);
      $("volverClientes").addEventListener("click", function () { vista = "clientes"; render(); });
      $("waFicha").addEventListener("click", function () { waCliente(p); });
      return;
    }

    /* operaciones */
    if (!datos.ops.length) {
      cont.innerHTML = '<div class="ad-vacio"><h3>Sin operaciones</h3><p>Aquí verás cada efectivización solicitada.</p></div>';
      return;
    }
    var total = datos.ops.reduce(function (a, o) { return a + Number(o.monto || 0); }, 0);
    var comis = datos.ops.reduce(function (a, o) { return a + Number(o.comision || 0); }, 0);
    cont.innerHTML =
      '<div class="ad-kpis">' +
        '<div class="ad-kpi"><span>Operaciones</span><b>' + datos.ops.length + "</b></div>" +
        '<div class="ad-kpi"><span>Monto total</span><b>' + IC.money(total) + "</b></div>" +
        '<div class="ad-kpi verde"><span>Tus comisiones</span><b>' + IC.money(comis) + "</b></div>" +
      "</div>" +
      '<div class="ad-tabla-wrap"><table class="ad-tabla"><thead><tr>' +
      "<th>Código</th><th>Cliente</th><th>Tarjeta</th><th>Destino</th><th>Monto</th><th>Comisión</th><th>Recibe</th><th>Estado</th><th>Fecha</th><th>Acción</th>" +
      "</tr></thead><tbody>" +
      datos.ops.map(function (o, i) {
        return "<tr><td><b>" + esc(o.codigo || "") + "</b></td>" +
          "<td>" + esc(o.nombre || "") + "<br><span class=\"ad-sub\">" + esc(o.documento || "") + "</span></td>" +
          "<td>" + esc(o.banco_tarjeta || "—") + " ···· " + esc(o.ultimos4 || "") + "</td>" +
          "<td>" + esc(o.banco_cuenta || "—") + "<br><span class=\"ad-sub\">" + esc(o.numero_cuenta || "") + "</span></td>" +
          "<td>" + IC.money(o.monto) + "</td><td>" + IC.money(o.comision) + "</td><td><b>" + IC.money(o.neto) + "</b></td>" +
          "<td>" + chip(o.estado) + "</td>" +
          "<td>" + IC.fmtDate(new Date(o.creado_en)) + "</td>" +
          "<td>" + (o.estado === "completada" || o.estado === "cancelada"
            ? '<span class="ad-sub">—</span>'
            : '<div class="ad-acc-op">' +
              '<button class="btn btn-primary btn-sm" data-ok="' + i + '">Completada</button>' +
              '<button class="btn btn-outline-dark btn-sm" data-cx="' + i + '">Cancelar</button></div>') +
          "</td></tr>";
      }).join("") + "</tbody></table></div>";

    cont.querySelectorAll("[data-ok]").forEach(function (b) {
      b.addEventListener("click", function () { confirmarCompletada(datos.ops[+b.dataset.ok]); });
    });
    cont.querySelectorAll("[data-cx]").forEach(function (b) {
      b.addEventListener("click", function () {
        var op = datos.ops[+b.dataset.cx];
        IC.modal({
          title: "Cancelar operación",
          html: "<p>Vas a cancelar la operación <b>" + esc(op.codigo || "") + "</b> de " + esc(op.nombre || "") + ".</p>",
          actions: [
            { label: "Volver", cls: "btn-outline-dark" },
            { label: "Sí, cancelar", cls: "btn-danger", onClick: function () { cambiarOperacion(op, "cancelada"); } }
          ]
        });
      });
    });
  }

  /* ---------------- arranque ---------------- */
  async function entrarConSesion() {
    if (!(await esAdmin())) {
      $("adLoginError").textContent = "Esta cuenta no tiene permisos de administrador.";
      $("adLoginError").classList.remove("hidden");
      sesion = null;
      try { localStorage.removeItem(SES); } catch (e) {}
      return false;
    }
    $("adLogin").classList.add("hidden");
    $("adPanel").classList.remove("hidden");
    $("adView").innerHTML = '<div class="ad-vacio"><span class="ad-cargando grande"></span><p>Cargando solicitudes...</p></div>';
    try {
      await cargar();
      render();
    } catch (e) {
      $("adView").innerHTML = '<div class="ad-vacio"><h3>No se pudieron cargar las solicitudes</h3>' +
        "<p>" + esc(e.message || "Revisa tu conexión a internet.") + "</p>" +
        '<button class="btn btn-primary btn-sm" style="margin-top:16px" onclick="location.reload()">Reintentar</button></div>';
    }
    return true;
  }

  /* Si algo falla de forma inesperada, mostramos el acceso y avisamos,
     en lugar de dejar una pantalla vacia sin explicacion. */
  function rescatar(motivo) {
    try {
      var login = $("adLogin"), panel = $("adPanel"), err = $("adLoginError");
      if (login) login.classList.remove("hidden");
      if (panel) panel.classList.add("hidden");
      if (err) {
        err.textContent = "Hubo un problema al abrir el panel: " + motivo + ". Vuelve a entrar.";
        err.classList.remove("hidden");
      }
      try { localStorage.removeItem(SES); } catch (e) {}
    } catch (e) {}
  }
  window.addEventListener("error", function (ev) {
    if (document.getElementById("adPanel") && document.getElementById("adPanel").classList.contains("hidden")) return;
    rescatar((ev && ev.message) || "error inesperado");
  });
  window.addEventListener("unhandledrejection", function (ev) {
    rescatar((ev && ev.reason && ev.reason.message) || "no respondio el servidor");
  });

  async function arrancar() {
    if (window.IC && IC.bindPassToggles) IC.bindPassToggles(document);

    document.querySelectorAll(".ad-tab").forEach(function (b) {
      b.addEventListener("click", function () { vista = b.dataset.v; render(); });
    });
    $("adSalir").addEventListener("click", salir);
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
      err.classList.add("hidden");
      b.disabled = true; b.textContent = "Verificando...";
      try {
        var s = await api("/auth/v1/token?grant_type=password", {
          method: "POST", headers: { apikey: KEY, "Content-Type": "application/json" },
          body: JSON.stringify({ email: $("adEmail").value.trim(), password: $("adPass").value })
        });
        guardar(s);
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
          method: "POST", headers: { apikey: KEY, "Content-Type": "application/json" },
          body: JSON.stringify({ refresh_token: g.refresh_token })
        });
        guardar(s2);
        await entrarConSesion();
      } catch (e) { try { localStorage.removeItem(SES); } catch (e2) {} }
    }
  }

  /* Arranca ya si el documento esta listo; si no, en cuanto lo este.
     Asi funciona aunque el navegador cargue los scripts en otro orden. */
  function inicio() { arrancar().catch(function (e) { rescatar(e.message || "no se pudo iniciar"); }); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", inicio);
  else inicio();
})();
