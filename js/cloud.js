/* =====================================================================
   IMPULSA CRÉDITO — Cuentas en la nube (Supabase Auth)
   =====================================================================
   Permite que cada cliente entre desde CUALQUIER dispositivo con su
   DNI y contraseña, y vea su historial completo: identidad, tarjetas,
   cuentas bancarias y operaciones.

   Se activa cuando en js/config.js:
     backend.provider = "supabase"  y  backend.useAuth = true

   Si está desactivado, la plataforma sigue funcionando con los datos
   guardados en el navegador (modo local).
   ===================================================================== */
(function () {
  "use strict";

  var CFG = window.SITE_CONFIG || {};
  var B = CFG.backend || {};
  var base = (B.supabaseUrl || "").replace(/\/+$/, "");
  var KEY = B.supabaseAnonKey || "";
  var BUCKET = B.bucket || "documentos";
  var activo = B.provider === "supabase" && B.useAuth === true && !!base && !!KEY;
  var SES = "ic_sesion_v1";

  /* Cada cliente se registra con SU CORREO REAL. Eso es lo que permite
     que pueda recuperar su contraseña solo, sin depender de nosotros.
     Para entrar sigue escribiendo su DNI: la función correo_de_documento
     de Supabase hace la traducción por detrás (ver supabase-recuperacion.sql). */
  function pareceCorreo(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v || "").trim()); }

  /* A dónde vuelve el cliente tras pinchar el enlace del correo */
  function urlRecuperar() {
    return new URL((CFG.platform && CFG.platform.recoverHref) || "recuperar.html", document.baseURI).href;
  }

  var sesion = null;   // { access_token, refresh_token, user }
  var perfil = null;   // objeto del cliente en memoria

  /* ---------- utilidades de red ---------- */
  function cab(extra) {
    var h = { apikey: KEY, "Content-Type": "application/json" };
    h.Authorization = "Bearer " + (sesion && sesion.access_token ? sesion.access_token : KEY);
    for (var k in extra) h[k] = extra[k];
    return h;
  }
  async function api(ruta, opts) {
    var res = await fetch(base + ruta, opts);
    var texto = await res.text();
    var datos = null;
    try { datos = texto ? JSON.parse(texto) : null; } catch (e) { datos = texto; }
    if (!res.ok) {
      var msg = (datos && (datos.msg || datos.message || datos.error_description || datos.error)) || ("Error " + res.status);
      var err = new Error(msg); err.status = res.status; err.datos = datos;
      throw err;
    }
    return datos;
  }
  function guardarSesion(s) {
    sesion = s;
    try { localStorage.setItem(SES, JSON.stringify({ access_token: s.access_token, refresh_token: s.refresh_token })); } catch (e) {}
  }
  function borrarSesion() {
    sesion = null; perfil = null;
    try { localStorage.removeItem(SES); } catch (e) {}
  }

  /* ---------- traducción de errores al español ---------- */
  function traducir(msg) {
    msg = String(msg || "");
    if (/already registered|already been registered/i.test(msg)) return "Ya existe una cuenta con ese documento. Inicia sesión.";
    if (/Invalid login credentials/i.test(msg)) return "Datos incorrectos. Revisa tu contraseña, o prueba escribiendo tu correo en lugar del documento.";
    if (/Email not confirmed/i.test(msg)) return "La cuenta necesita activación. Escríbenos por WhatsApp y la activamos al instante.";
    if (/email_address_invalid|Email address .* is invalid/i.test(msg)) return "No pudimos crear la cuenta. Escríbenos por WhatsApp y te registramos nosotros.";
    if (/signups? (not allowed|disabled)/i.test(msg)) return "El registro está temporalmente cerrado. Escríbenos por WhatsApp.";
    if (/User already registered|duplicate key/i.test(msg)) return "Ya existe una cuenta con ese correo. Inicia sesión o recupera tu contraseña.";
    if (/correo_de_documento|function .* does not exist/i.test(msg)) return "El sistema de acceso está en mantenimiento. Escríbenos por WhatsApp.";
    if (/New password should be different/i.test(msg)) return "La contraseña nueva debe ser distinta a la anterior.";
    if (/expired|invalid.*token/i.test(msg)) return "El enlace ya caducó. Pide uno nuevo desde «Olvidé mi contraseña».";
    if (/Password should be at least/i.test(msg)) return "La contraseña debe tener al menos 8 caracteres.";
    if (/rate limit|too many/i.test(msg)) return "Demasiados intentos. Espera un momento e inténtalo de nuevo.";
    if (/Failed to fetch|NetworkError/i.test(msg)) return "Sin conexión a internet. Revisa tu red e inténtalo otra vez.";
    return msg;
  }

  /* ---------- subir imagen al almacenamiento del cliente ---------- */
  async function subirFoto(subruta, dataURL) {
    if (!dataURL || !sesion) return null;
    var blob = await (await fetch(dataURL)).blob();
    var ruta = sesion.user.id + "/" + subruta;
    var res = await fetch(base + "/storage/v1/object/" + BUCKET + "/" + encodeURI(ruta), {
      method: "POST",
      headers: { apikey: KEY, Authorization: "Bearer " + sesion.access_token, "Content-Type": blob.type || "image/jpeg" },
      body: blob
    });
    if (!res.ok) throw new Error("No se pudo subir la imagen");
    return ruta;
  }
  function sello() { return new Date().toISOString().replace(/[:.]/g, "-"); }

  /* ---------- armar el objeto que usa la plataforma ---------- */
  function vacio() {
    return { identity: { front: null, back: null, selfie: null, status: "pending", submittedAt: null },
             cards: [], accounts: [], ops: [], notifications: [] };
  }

  async function cargarTodo() {
    var uid = sesion.user.id;
    var q = "?user_id=eq." + uid + "&order=creado_en.desc";

    var p = await api("/rest/v1/perfiles?id=eq." + uid + "&select=*", { headers: cab() });
    var docs = await api("/rest/v1/documentos" + q + "&select=*", { headers: cab() });
    var tarj = await api("/rest/v1/tarjetas" + q + "&select=*", { headers: cab() });
    var ctas = await api("/rest/v1/cuentas" + q + "&select=*", { headers: cab() });
    var ops = await api("/rest/v1/operaciones" + q + "&select=*", { headers: cab() });
    var avisos = [];
    // la tabla de avisos existe solo si ya ejecutaste supabase-admin.sql
    try { avisos = await api("/rest/v1/avisos?user_id=eq." + uid + "&order=creado_en.desc&select=*", { headers: cab() }); } catch (e) { avisos = []; }

    var datos = p && p[0] ? p[0] : {};
    var u = vacio();
    u.id = uid;
    u.nombres = datos.nombres || ""; u.apellidos = datos.apellidos || "";
    u.docType = datos.tipo_doc || "DNI"; u.doc = datos.documento || "";
    u.phone = datos.celular || ""; u.email = datos.email || "";

    function estadoDoc(e) { return e === "verificado" || e === "verificada" ? "verified" : (e === "rechazado" ? "rejected" : "review"); }

    if (docs && docs.length) {
      u.identity = { front: null, back: null, selfie: null,
                     status: estadoDoc(docs[0].estado),
                     motivo: docs[0].motivo || null,
                     submittedAt: new Date(docs[0].creado_en).getTime(), remoto: true };
    }
    u.cards = (tarj || []).map(function (t) {
      return { id: "c" + t.id, remoteId: t.id, bank: t.banco, brand: t.marca, last4: t.ultimos4,
               holder: t.titular, payDay: t.dia_pago, primary: !!t.principal,
               photoFront: null, photoBack: null, remoto: true,
               status: estadoDoc(t.estado), motivo: t.motivo || null,
               createdAt: new Date(t.creado_en).getTime() };
    });
    u.accounts = (ctas || []).map(function (c) {
      return { id: "a" + c.id, remoteId: c.id, bank: c.banco, type: c.tipo, currency: c.moneda,
               number: c.numero, cci: c.cci, holder: c.titular, primary: !!c.principal,
               createdAt: new Date(c.creado_en).getTime() };
    });
    u.ops = (ops || []).map(function (o) {
      return { id: "op" + o.id, remoteId: o.id, code: o.codigo, type: o.tipo,
               cardId: o.tarjeta_id ? "c" + o.tarjeta_id : null,
               accountId: o.cuenta_id ? "a" + o.cuenta_id : null,
               amount: Number(o.monto), commission: Number(o.comision), net: Number(o.neto),
               commissionPct: Number((CFG.platform || {}).commissionPercent || 1),
               status: o.estado, createdAt: new Date(o.creado_en).getTime(),
               completedAt: o.estado === "completada" ? new Date(o.creado_en).getTime() : null,
               history: [] };
    });
    u.notifications = (avisos || []).map(function (a) {
      return { id: "av" + a.id, remoteId: a.id, title: a.titulo, text: a.texto || "",
               at: new Date(a.creado_en).getTime(), read: !!a.leido };
    });

    perfil = u;
    return u;
  }

  /* =====================================================================
     API pública
  ===================================================================== */
  var cloud = {
    activo: activo,
    usuario: function () { return perfil; },

    /* restaura la sesión guardada al abrir la web */
    async init() {
      if (!activo) return null;
      var guardada = null;
      try { guardada = JSON.parse(localStorage.getItem(SES) || "null"); } catch (e) {}
      if (!guardada || !guardada.refresh_token) return null;
      try {
        var s = await api("/auth/v1/token?grant_type=refresh_token", {
          method: "POST", headers: { apikey: KEY, "Content-Type": "application/json" },
          body: JSON.stringify({ refresh_token: guardada.refresh_token })
        });
        guardarSesion(s);
        return await cargarTodo();
      } catch (e) { borrarSesion(); return null; }
    },

    async registrar(d) {
      try {
        var s = await api("/auth/v1/signup", {
          method: "POST", headers: { apikey: KEY, "Content-Type": "application/json" },
          body: JSON.stringify({ email: String(d.email || "").trim(), password: d.password,
                                 data: { nombres: d.nombres, apellidos: d.apellidos, documento: d.doc } })
        });
        if (!s.access_token) {
          // si el proyecto pide confirmar correo, iniciamos sesión igual
          s = await api("/auth/v1/token?grant_type=password", {
            method: "POST", headers: { apikey: KEY, "Content-Type": "application/json" },
            body: JSON.stringify({ email: String(d.email || "").trim(), password: d.password })
          });
        }
        guardarSesion(s);
        await api("/rest/v1/perfiles", {
          method: "POST", headers: cab({ Prefer: "return=minimal" }),
          body: JSON.stringify({ id: s.user.id, nombres: d.nombres.trim(), apellidos: d.apellidos.trim(),
                                 tipo_doc: d.docType, documento: String(d.doc).trim(),
                                 celular: d.phone.trim(), email: (d.email || "").trim() })
        });
        var u = await cargarTodo();
        return { ok: true, user: u };
      } catch (e) { return { ok: false, error: traducir(e.message) }; }
    },

    async login(doc, password) {
      try {
        var correo = String(doc || "").trim();

        /* Si escribió su DNI, preguntamos a Supabase cuál es su correo.
           La función solo responde si la contraseña también es correcta. */
        if (!pareceCorreo(correo)) {
          var r = await api("/rest/v1/rpc/correo_de_documento", {
            method: "POST", headers: { apikey: KEY, "Content-Type": "application/json" },
            body: JSON.stringify({ doc: correo, clave: password })
          });
          if (!r) return { ok: false, error: "No encontramos esa combinación. Revisa que el documento esté completo y sin espacios, o entra escribiendo tu correo." };
          correo = r;
        }

        var s = await api("/auth/v1/token?grant_type=password", {
          method: "POST", headers: { apikey: KEY, "Content-Type": "application/json" },
          body: JSON.stringify({ email: correo, password: password })
        });
        guardarSesion(s);
        var u = await cargarTodo();
        return { ok: true, user: u };
      } catch (e) { return { ok: false, error: traducir(e.message) }; }
    },

    /* Le manda al cliente el enlace para crear una contraseña nueva.
       Responde siempre ok: así nadie puede averiguar qué correos existen. */
    async pedirRecuperacion(correo) {
      try {
        await api("/auth/v1/recover?redirect_to=" + encodeURIComponent(urlRecuperar()), {
          method: "POST", headers: { apikey: KEY, "Content-Type": "application/json" },
          body: JSON.stringify({ email: String(correo || "").trim() })
        });
        return { ok: true };
      } catch (e) {
        if (/rate limit|too many/i.test(e.message)) return { ok: false, error: traducir(e.message) };
        return { ok: true };   // no delatamos si el correo existe o no
      }
    },

    /* Guarda la contraseña nueva usando el token que trae el enlace del correo.
       Devuelve tambien con que datos debe entrar, para no dejarlo adivinando. */
    async fijarPassword(accessToken, nueva) {
      try {
        var cab = { apikey: KEY, "Content-Type": "application/json", Authorization: "Bearer " + accessToken };
        await api("/auth/v1/user", { method: "PUT", headers: cab, body: JSON.stringify({ password: nueva }) });

        var correo = null, documento = null;
        try {
          var u = await api("/auth/v1/user", { headers: cab });
          correo = u && u.email;
          if (u && u.id) {
            var perf = await api("/rest/v1/perfiles?id=eq." + u.id + "&select=documento", { headers: cab });
            if (perf && perf[0]) documento = perf[0].documento;
          }
        } catch (e) { /* si no se puede leer, se muestra el mensaje generico */ }

        return { ok: true, correo: correo, documento: documento };
      } catch (e) { return { ok: false, error: traducir(e.message) }; }
    },

    async logout() {
      try { await api("/auth/v1/logout", { method: "POST", headers: cab() }); } catch (e) {}
      borrarSesion();
    },

    /* ---------- envío de documentos de identidad ---------- */
    async enviarIdentidad(imgs, u) {
      var t = sello(), dni = (u && u.doc) || "sin-dni";
      var f = await subirFoto("identidad/" + dni + "-dni-frontal-" + t + ".jpg", imgs.front);
      var b = await subirFoto("identidad/" + dni + "-dni-posterior-" + t + ".jpg", imgs.back);
      var s = await subirFoto("identidad/" + dni + "-selfie-" + t + ".jpg", imgs.selfie);
      await api("/rest/v1/documentos", {
        method: "POST", headers: cab({ Prefer: "return=minimal" }),
        body: JSON.stringify({ user_id: sesion.user.id, documento: u.doc,
                               nombre: (u.nombres + " " + u.apellidos).trim(), celular: u.phone,
                               dni_frontal: f, dni_posterior: b, selfie: s, estado: "en_revision" })
      });
      return await cargarTodo();
    },

    /* ---------- tarjetas ---------- */
    async agregarTarjeta(c, u) {
      var t = sello(), dni = (u && u.doc) || "sin-dni";
      var ff = c.photoFront ? await subirFoto("tarjetas/" + dni + "-" + c.bank + "-" + c.last4 + "-frontal-" + t + ".jpg", c.photoFront) : null;
      var fb = c.photoBack ? await subirFoto("tarjetas/" + dni + "-" + c.bank + "-" + c.last4 + "-posterior-" + t + ".jpg", c.photoBack) : null;
      await api("/rest/v1/tarjetas", {
        method: "POST", headers: cab({ Prefer: "return=minimal" }),
        body: JSON.stringify({ user_id: sesion.user.id, documento: u.doc,
                               nombre: (u.nombres + " " + u.apellidos).trim(),
                               banco: c.bank, marca: c.brand, ultimos4: c.last4, titular: c.holder,
                               dia_pago: c.payDay || null, principal: !!c.primary,
                               foto_frontal: ff, foto_posterior: fb, estado: "en_revision" })
      });
      return await cargarTodo();
    },

    /* ---------- cuentas bancarias ---------- */
    async agregarCuenta(a, u) {
      await api("/rest/v1/cuentas", {
        method: "POST", headers: cab({ Prefer: "return=minimal" }),
        body: JSON.stringify({ user_id: sesion.user.id, documento: u.doc,
                               nombre: (u.nombres + " " + u.apellidos).trim(),
                               banco: a.bank, tipo: a.type, moneda: a.currency,
                               numero: a.number, cci: a.cci || null, titular: a.holder,
                               principal: !!a.primary })
      });
      return await cargarTodo();
    },

    /* ---------- operaciones ---------- */
    async crearOperacion(op, card, acc, u) {
      await api("/rest/v1/operaciones", {
        method: "POST", headers: cab({ Prefer: "return=minimal" }),
        body: JSON.stringify({ user_id: sesion.user.id, codigo: op.code, documento: u.doc,
                               nombre: (u.nombres + " " + u.apellidos).trim(), celular: u.phone,
                               tipo: op.type,
                               banco_tarjeta: card ? card.bank : null, ultimos4: card ? card.last4 : null,
                               banco_cuenta: acc ? acc.bank : null, numero_cuenta: acc ? acc.number : null,
                               tarjeta_id: card && card.remoteId ? card.remoteId : null,
                               cuenta_id: acc && acc.remoteId ? acc.remoteId : null,
                               monto: op.amount, comision: op.commission, neto: op.net, estado: op.status })
      });
      return await cargarTodo();
    },

    async cambiarEstadoOperacion(remoteId, estado) {
      await api("/rest/v1/operaciones?id=eq." + remoteId, {
        method: "PATCH", headers: cab({ Prefer: "return=minimal" }),
        body: JSON.stringify({ estado: estado })
      });
      return await cargarTodo();
    },

    async actualizarPerfil(campos) {
      await api("/rest/v1/perfiles?id=eq." + sesion.user.id, {
        method: "PATCH", headers: cab({ Prefer: "return=minimal" }),
        body: JSON.stringify(campos)
      });
      return await cargarTodo();
    },

    async cambiarPassword(nueva) {
      await api("/auth/v1/user", {
        method: "PUT", headers: cab(), body: JSON.stringify({ password: nueva })
      });
    },

    /* la campana los marca como vistos */
    async marcarAvisosLeidos() {
      if (!perfil || !sesion) return;
      var sinLeer = (perfil.notifications || []).filter(function (n) { return !n.read && n.remoteId; });
      if (!sinLeer.length) return;
      try {
        await api("/rest/v1/avisos?user_id=eq." + sesion.user.id + "&leido=is.false", {
          method: "PATCH", headers: cab({ Prefer: "return=minimal" }),
          body: JSON.stringify({ leido: true })
        });
        (perfil.notifications || []).forEach(function (n) { n.read = true; });
      } catch (e) { /* si falla, se reintenta la proxima vez que abra la campana */ }
    },

    recargar: cargarTodo
  };

  window.IC = window.IC || {};
  window.IC.cloud = cloud;

  if (activo) console.info("[Impulsa Crédito] Cuentas en la nube ACTIVAS: los clientes pueden entrar desde cualquier dispositivo.");
})();
