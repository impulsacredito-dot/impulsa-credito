/* =====================================================================
   IMPULSA CRÉDITO — Conector de almacenamiento en la nube
   =====================================================================
   Envía a TU base de datos (Supabase) todo lo que el cliente registra:
   datos personales, fotos del DNI, selfie, fotos de tarjeta, cuentas
   bancarias y operaciones.

   • Si NO configuras Supabase en config.js, el sitio sigue funcionando
     igual (los datos quedan solo en el navegador del cliente).
   • Si SÍ lo configuras, cada registro te llega ordenado y las fotos se
     guardan en carpetas por número de documento.

   Configuración: js/config.js → sección "backend".
   Instrucciones paso a paso: README.md
   ===================================================================== */
(function () {
  "use strict";

  var CFG = window.SITE_CONFIG || {};
  var B = CFG.backend || {};
  var QUEUE_KEY = "ic_sync_queue_v1";

  var activo = B.provider === "supabase" && !!B.supabaseUrl && !!B.supabaseAnonKey;
  var BUCKET = B.bucket || "documentos";
  var base = (B.supabaseUrl || "").replace(/\/+$/, "");

  function headers(extra) {
    var h = {
      apikey: B.supabaseAnonKey,
      Authorization: "Bearer " + B.supabaseAnonKey
    };
    for (var k in extra) h[k] = extra[k];
    return h;
  }

  /* ---------- inserta una fila en una tabla ---------- */
  async function insertar(tabla, fila) {
    var res = await fetch(base + "/rest/v1/" + tabla, {
      method: "POST",
      headers: headers({ "Content-Type": "application/json", Prefer: "return=minimal" }),
      body: JSON.stringify(fila)
    });
    if (!res.ok) throw new Error("Tabla " + tabla + " → " + res.status + " " + (await res.text()).slice(0, 200));
    return true;
  }

  /* ---------- sube una imagen (dataURL) al Storage ---------- */
  async function subirImagen(ruta, dataURL) {
    if (!dataURL) return null;
    var blob = await (await fetch(dataURL)).blob();
    var res = await fetch(base + "/storage/v1/object/" + BUCKET + "/" + encodeURI(ruta), {
      method: "POST",
      headers: headers({ "Content-Type": blob.type || "image/jpeg", "x-upsert": "true" }),
      body: blob
    });
    if (!res.ok) throw new Error("Storage " + ruta + " → " + res.status + " " + (await res.text()).slice(0, 200));
    return ruta;
  }

  /* ---------- cola de reintentos (si no hay internet) ---------- */
  function leerCola() {
    try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]"); } catch (e) { return []; }
  }
  function guardarCola(items) {
    try { localStorage.setItem(QUEUE_KEY, JSON.stringify(items.slice(-40))); } catch (e) {}
  }
  function encolar(tarea) {
    var cola = leerCola();
    cola.push({ id: Date.now() + "-" + Math.random().toString(36).slice(2, 6), tarea: tarea, intentos: 0 });
    guardarCola(cola);
  }

  async function ejecutar(tarea) {
    if (tarea.tipo === "fila") return insertar(tarea.tabla, tarea.fila);
    if (tarea.tipo === "archivo") return subirImagen(tarea.ruta, tarea.dataURL);
    return true;
  }

  async function procesarCola() {
    if (!activo) return;
    var cola = leerCola();
    if (!cola.length) return;
    var pendientes = [];
    for (var i = 0; i < cola.length; i++) {
      try { await ejecutar(cola[i].tarea); }
      catch (e) {
        cola[i].intentos++;
        if (cola[i].intentos < 6) pendientes.push(cola[i]);
        else console.warn("[Impulsa] Se descartó un envío tras 6 intentos:", e.message);
      }
    }
    guardarCola(pendientes);
  }

  /* Ejecuta una tarea; si falla, la encola para reintentar después */
  async function intentar(tarea) {
    if (!activo) return { ok: false, motivo: "backend-desactivado" };
    try {
      await ejecutar(tarea);
      return { ok: true };
    } catch (e) {
      console.warn("[Impulsa] Envío pendiente (se reintentará):", e.message);
      encolar(tarea);
      return { ok: false, motivo: e.message };
    }
  }

  function carpeta(doc) { return String(doc || "sin-documento").replace(/[^A-Za-z0-9_-]/g, ""); }
  function sello() { return new Date().toISOString().replace(/[:.]/g, "-"); }

  /* =====================================================================
     API pública — se usa desde auth.js, app.js y reclamos.js
  ===================================================================== */
  var backend = {
    activo: activo,

    /* Cliente nuevo (registro) */
    async cliente(u) {
      return intentar({ tipo: "fila", tabla: B.tablas && B.tablas.clientes || "clientes", fila: {
        nombres: u.nombres, apellidos: u.apellidos,
        tipo_doc: u.docType, documento: u.doc,
        celular: u.phone, email: u.email
      }});
    },

    /* Documentos de identidad: sube las 3 imágenes y registra la fila */
    async identidad(u, imgs) {
      var dir = carpeta(u.doc), t = sello(), rutas = {};
      var mapa = { front: "dni-frontal", back: "dni-posterior", selfie: "selfie" };
      for (var k in mapa) {
        if (!imgs[k]) continue;
        var ruta = dir + "/identidad/" + mapa[k] + "-" + t + ".jpg";
        var r = await intentar({ tipo: "archivo", ruta: ruta, dataURL: imgs[k] });
        rutas[k] = r.ok ? ruta : null;
      }
      return intentar({ tipo: "fila", tabla: B.tablas && B.tablas.documentos || "documentos", fila: {
        documento: u.doc, nombre: (u.nombres + " " + u.apellidos).trim(), celular: u.phone,
        dni_frontal: rutas.front || null, dni_posterior: rutas.back || null, selfie: rutas.selfie || null,
        estado: "en_revision"
      }});
    },

    /* Tarjeta de crédito (fotos ya censuradas por el cliente) */
    async tarjeta(u, card) {
      var dir = carpeta(u.doc), t = sello(), frente = null, dorso = null;
      if (card.photoFront) {
        var rf = dir + "/tarjetas/" + card.bank + "-" + card.last4 + "-frontal-" + t + ".jpg";
        if ((await intentar({ tipo: "archivo", ruta: rf, dataURL: card.photoFront })).ok) frente = rf;
      }
      if (card.photoBack) {
        var rb = dir + "/tarjetas/" + card.bank + "-" + card.last4 + "-posterior-" + t + ".jpg";
        if ((await intentar({ tipo: "archivo", ruta: rb, dataURL: card.photoBack })).ok) dorso = rb;
      }
      return intentar({ tipo: "fila", tabla: B.tablas && B.tablas.tarjetas || "tarjetas", fila: {
        documento: u.doc, nombre: (u.nombres + " " + u.apellidos).trim(),
        banco: card.bank, marca: card.brand, ultimos4: card.last4,
        titular: card.holder, dia_pago: card.payDay || null,
        foto_frontal: frente, foto_posterior: dorso, estado: "en_revision"
      }});
    },

    /* Cuenta bancaria donde recibe el dinero */
    async cuenta(u, acc) {
      return intentar({ tipo: "fila", tabla: B.tablas && B.tablas.cuentas || "cuentas", fila: {
        documento: u.doc, nombre: (u.nombres + " " + u.apellidos).trim(),
        banco: acc.bank, tipo: acc.type, moneda: acc.currency,
        numero: acc.number, cci: acc.cci || null, titular: acc.holder
      }});
    },

    /* Operación (efectivización / autopago) */
    async operacion(u, op, card, acc) {
      return intentar({ tipo: "fila", tabla: B.tablas && B.tablas.operaciones || "operaciones", fila: {
        codigo: op.code, documento: u.doc, nombre: (u.nombres + " " + u.apellidos).trim(),
        celular: u.phone, tipo: op.type,
        banco_tarjeta: card ? card.bank : null, ultimos4: card ? card.last4 : null,
        banco_cuenta: acc ? acc.bank : null, numero_cuenta: acc ? acc.number : null,
        monto: op.amount, comision: op.commission, neto: op.net, estado: op.status
      }});
    },

    /* Libro de reclamaciones */
    async reclamo(r) {
      return intentar({ tipo: "fila", tabla: B.tablas && B.tablas.reclamos || "reclamos", fila: {
        codigo: r.code, tipo: r.tipo,
        nombres: r.nombres, apellidos: r.apellidos, tipo_doc: r.docType, documento: r.doc,
        domicilio: r.domicilio, telefono: r.phone, email: r.email,
        menor_edad: !!r.menor, apoderado: r.tutor || null,
        bien: r.bien, monto: r.monto || null, descripcion: r.descripcion,
        detalle: r.detalle, pedido: r.pedido
      }});
    },

    procesarCola: procesarCola
  };

  window.IC = window.IC || {};
  window.IC.backend = backend;

  if (activo) {
    procesarCola();
    window.addEventListener("online", procesarCola);
  } else {
    console.info("[Impulsa Crédito] Almacenamiento en la nube DESACTIVADO: los datos quedan solo en este navegador. Actívalo en js/config.js → backend.");
  }
})();
