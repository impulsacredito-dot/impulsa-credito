/* =====================================================================
   Impulsa Crédito — Aviso y configuración de cookies
   =====================================================================
   · Necesarias (siempre activas): mantener la sesión, recordar
     preferencias y esta misma elección.
   · Análisis (Google Analytics) y Marketing (Tag Manager → píxel de
     Meta): SOLO se activan si la persona los acepta. Los IDs están en
     config.js → analytics. Para otra cosa que quieras cargar aquí:

       ICCookies.cuandoAcepte("analitica", function () { ... });
       ICCookies.cuandoAcepte("marketing", function () { ... });

   Cualquier enlace a "#configurar-cookies" vuelve a abrir el aviso.
   ===================================================================== */
(function () {
  "use strict";
  var CLAVE = "ic_cookies_v1";
  var esperando = { analitica: [], marketing: [] };

  function leer() { try { return JSON.parse(localStorage.getItem(CLAVE) || "null"); } catch (e) { return null; } }
  function guardar(analitica, marketing) {
    var v = { analitica: !!analitica, marketing: !!marketing, fecha: new Date().toISOString(), version: 1 };
    try { localStorage.setItem(CLAVE, JSON.stringify(v)); } catch (e) {}
    ["analitica", "marketing"].forEach(function (k) {
      if (v[k]) { esperando[k].forEach(function (fn) { try { fn(); } catch (e) {} }); esperando[k] = []; }
    });
    aplicarGoogle(v);
    aplicarClarity(v);
    aplicarMeta(v);
    try { document.dispatchEvent(new CustomEvent("ic:cookies", { detail: v })); } catch (e) {}
    return v;
  }

  /* ---------- Google Analytics y Tag Manager ----------
     · Analytics: SOLO si la persona acepta "Análisis".
     · Tag Manager (donde vive el píxel de Meta): SOLO si acepta
       "Marketing".
     Usa el modo de consentimiento de Google, y si la persona cambia
     su elección se avisa al instante a Google y a Meta. Nunca en
     páginas con datos privados. */
  var google = { listo: false, ga4: false, gtm: false };
  function idsGoogle() {
    var a = (window.SITE_CONFIG && window.SITE_CONFIG.analytics) || {};
    return {
      ga4: /^G-[A-Z0-9]{6,14}$/.test(a.ga4Id || "") ? a.ga4Id : "",
      gtm: /^GTM-[A-Z0-9]{4,12}$/.test(a.gtmId || "") ? a.gtmId : ""
    };
  }
  function cargarScript(src) {
    var s = document.createElement("script");
    s.async = true; s.src = src;
    document.head.appendChild(s);
  }
  function paginaPermitida() {
    if (/\/(admin|recuperar)(\.html)?\/?$/i.test(location.pathname)) return false;
    // enlaces de recuperación o de acceso: nunca se mandan a nadie
    if (/token|type=recovery|code=/i.test(location.hash + location.search)) return false;
    return true;
  }
  function estadoGoogle(v) {
    var a = v.analitica ? "granted" : "denied", m = v.marketing ? "granted" : "denied";
    return { analytics_storage: a, ad_storage: m, ad_user_data: m, ad_personalization: m };
  }
  function aplicarGoogle(v) {
    var id = idsGoogle();
    if ((!id.ga4 && !id.gtm) || !paginaPermitida()) return;
    var quiereGa4 = !!(id.ga4 && v.analitica), quiereGtm = !!(id.gtm && v.marketing);
    window.dataLayer = window.dataLayer || [];
    if (!window.gtag) window.gtag = function () { window.dataLayer.push(arguments); };
    if (google.listo) {
      window.gtag("consent", "update", estadoGoogle(v));
      if (typeof window.fbq === "function") window.fbq("consent", v.marketing ? "grant" : "revoke");
    } else {
      if (!quiereGa4 && !quiereGtm) return;
      window.gtag("consent", "default", estadoGoogle(v));
      window.gtag("js", new Date());
      google.listo = true;
    }
    if (quiereGa4 && !google.ga4) {
      window.gtag("config", id.ga4);
      cargarScript("https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(id.ga4));
      google.ga4 = true;
    }
    if (quiereGtm && !google.gtm) {
      window.dataLayer.push({ "gtm.start": new Date().getTime(), event: "gtm.js" });
      cargarScript("https://www.googletagmanager.com/gtm.js?id=" + encodeURIComponent(id.gtm));
      google.gtm = true;
    }
  }
  /* ---------- Microsoft Clarity (mapas de calor y grabaciones) ----------
     · SOLO si la persona acepta "Análisis".
     · Nunca en el área del cliente (/app), el panel ni /recuperar.
     · En páginas con formularios de datos personales (login, registro,
       reclamaciones) se oculta TODO el contenido en las grabaciones.
     · En clarity.microsoft.com → Configuración → Enmascaramiento, deja
       el modo "Estricto" para ocultar todos los textos del sitio. */
  var clarityEstado = { cargado: false };
  function idClarity() {
    var a = (window.SITE_CONFIG && window.SITE_CONFIG.analytics) || {};
    return /^[a-z0-9]{6,14}$/i.test(a.clarityId || "") ? a.clarityId : "";
  }
  function aplicarClarity(v) {
    var id = idClarity();
    if (!id || !paginaPermitida() || /^\/app(\.html)?\/?$/i.test(location.pathname)) return;
    if (clarityEstado.cargado) { window.clarity("consent", !!v.analitica); return; }
    if (!v.analitica) return;
    if (/\/(login|registro|reclamaciones)(\.html)?\/?$/i.test(location.pathname)) document.body.setAttribute("data-clarity-mask", "True");
    window.clarity = window.clarity || function () { (window.clarity.q = window.clarity.q || []).push(arguments); };
    window.clarity("consent");
    cargarScript("https://www.clarity.ms/tag/" + encodeURIComponent(id));
    clarityEstado.cargado = true;
  }

  /* ---------- Píxel de Meta (Facebook e Instagram), directo ----------
     · SOLO si la persona acepta "Marketing".
     · autoConfig apagado: no lee formularios ni botones; solo recibe la
       visita y las acciones clave que le mandamos (sin datos personales).
     · Si retira el permiso, se le avisa a Meta al instante. */
  var metaEstado = { cargado: false };
  var META_ACCION = { registro_completado: "CompleteRegistration", formulario_whatsapp: "Lead",
                      whatsapp_clic: "Contact", operacion_creada: "SubmitApplication" };
  function idMeta() {
    var a = (window.SITE_CONFIG && window.SITE_CONFIG.analytics) || {};
    return /^\d{10,20}$/.test(String(a.metaPixelId || "")) ? String(a.metaPixelId) : "";
  }
  function aplicarMeta(v) {
    var id = idMeta();
    if (!id || !paginaPermitida()) return;
    if (metaEstado.cargado) { window.fbq("consent", v.marketing ? "grant" : "revoke"); return; }
    if (!v.marketing) return;
    if (!window.fbq) {
      var n = window.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); };
      if (!window._fbq) window._fbq = n;
      n.push = n; n.loaded = true; n.version = "2.0"; n.queue = [];
    }
    window.fbq("set", "autoConfig", false, id);
    window.fbq("init", id);
    window.fbq("track", "PageView");
    cargarScript("https://connect.facebook.net/en_US/fbevents.js");
    metaEstado.cargado = true;
  }

  /* registra una acción importante (sin datos personales), solo si la
     persona sigue aceptando:
     · a Analytics con su nombre (registro_completado, …);
     · a Tag Manager como "ic.<nombre>", para el píxel de Meta. */
  function evento(nombre, datos) {
    if (!/^[a-z_]{3,40}$/.test(nombre)) return;
    var v = leer() || {}, p = {}, k;
    for (k in (datos || {})) if (typeof datos[k] === "number" || typeof datos[k] === "string") p[k] = datos[k];
    if (metaEstado.cargado && v.marketing && META_ACCION[nombre]) {
      if (nombre === "operacion_creada" && p.value > 0) window.fbq("track", META_ACCION[nombre], { value: p.value, currency: "PEN" });
      else window.fbq("track", META_ACCION[nombre]);
    }
    if (!google.listo) return;
    if (google.ga4 && v.analitica) window.gtag("event", nombre, p);
    if (google.gtm && v.marketing) {
      var o = { event: "ic." + nombre };
      for (k in p) o[k] = p[k];
      window.dataLayer.push(o);
    }
  }

  /* ---------- el aviso ----------
     Computadora y tablet: tarjeta pequeña abajo a la izquierda.
     Celular: franja compacta abajo, sobre la zona segura del equipo.
     No bloquea la página ni le quita el foco a nadie. */
  var css =
    "#ckCaja{position:fixed;left:24px;right:auto;top:auto;bottom:24px;z-index:2147483000;box-sizing:border-box;width:392px;max-width:calc(100vw - 32px);" +
      "max-height:calc(100vh - 32px);overflow:auto;overscroll-behavior:contain;margin:0;background:#fff;color:#0f1512;text-align:left;" +
      "border-radius:20px;padding:20px;border:1px solid rgba(15,21,18,.08);" +
      "box-shadow:0 18px 48px rgba(9,20,14,.18),0 2px 6px rgba(9,20,14,.06);" +
      "font-family:Montserrat,system-ui,-apple-system,'Segoe UI',sans-serif;font-size:14px;line-height:1.5;letter-spacing:normal;" +
      "animation:ckSube .32s cubic-bezier(.22,1,.36,1) both}" +
    "#ckCaja *{box-sizing:border-box}" +
    "@keyframes ckSube{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}" +
    "#ckCaja .ck-cab{display:flex;align-items:center;gap:12px;margin:0 0 8px}" +
    "#ckCaja .ck-ico{flex:none;width:36px;height:36px;border-radius:11px;background:#eafaf0;color:#15803d;display:flex;align-items:center;justify-content:center}" +
    "#ckCaja .ck-ico svg{width:20px;height:20px;display:block}" +
    "#ckCaja h2{margin:0;padding:0;font-size:15.5px;line-height:1.3;font-weight:800;letter-spacing:-.01em;color:#0f1512;text-align:left;text-transform:none}" +
    "#ckCaja p{margin:0;padding:0;font-size:13.5px;line-height:1.55;color:#4d5c54;text-align:left}" +
    "#ckCaja p a{color:#15803d;font-weight:700;text-decoration:underline;text-underline-offset:2px}" +
    "#ckCaja .ck-botones{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:16px}" +
    "#ckCaja .ck-btn{margin:0;width:100%;min-height:44px;text-align:center;text-transform:none;letter-spacing:normal;box-shadow:none;border-radius:12px;" +
      "padding:10px 12px;font:700 13.5px/1.2 Montserrat,system-ui,sans-serif;cursor:pointer;border:1.5px solid transparent;" +
      "transition:background .15s,border-color .15s,color .15s}" +
    "#ckCaja .ck-gris{background:#f1f4f2;color:#1b2520;border-color:#e2e8e4}#ckCaja .ck-gris:hover{background:#e6ece8}" +
    "#ckCaja .ck-verde{background:#22c55e;color:#06210f}#ckCaja .ck-verde:hover{background:#16a34a;color:#fff}" +
    "#ckCaja .ck-borde{background:#fff;color:#15803d;border-color:#bfe8cf}#ckCaja .ck-borde:hover{background:#f2fbf5}" +
    "#ckCaja .ck-btn:focus-visible,#ckCaja .ck-link:focus-visible{outline:3px solid #22c55e;outline-offset:2px}" +
    "#ckCaja .ck-link{display:block;margin:8px auto 0;padding:6px 10px;background:none;border:0;border-radius:8px;cursor:pointer;" +
      "font:600 13px Montserrat,system-ui,sans-serif;color:#4d5c54;text-decoration:underline;text-underline-offset:3px;text-transform:none;box-shadow:none;width:auto;min-height:0}" +
    "#ckCaja .ck-link:hover{color:#0f1512}" +
    "#ckCaja .ck-detalle{margin-top:14px;border:1px solid #e6ece8;border-radius:14px;padding:2px 14px 12px}" +
    "#ckCaja .ck-op{display:flex;gap:14px;align-items:center;justify-content:space-between;padding:11px 0;border-bottom:1px solid #eef2ef}" +
    "#ckCaja .ck-op b{display:block;font-size:13.5px;margin-bottom:1px;color:#0f1512}" +
    "#ckCaja .ck-op span{display:block;font-size:12.5px;color:#5f6e66;line-height:1.45}" +
    "#ckCaja .ck-sw{position:relative;flex:none;width:42px;height:24px;margin:0}" +
    "#ckCaja .ck-sw input{opacity:0;width:100%;height:100%;margin:0;position:absolute;cursor:pointer;z-index:1}" +
    "#ckCaja .ck-sw i{position:absolute;inset:0;border-radius:999px;background:#cfd8d2;transition:background .15s}" +
    "#ckCaja .ck-sw i:after{content:'';position:absolute;top:3px;left:3px;width:18px;height:18px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.2);transition:transform .15s}" +
    "#ckCaja .ck-sw input:checked+i{background:#22c55e}#ckCaja .ck-sw input:checked+i:after{transform:translateX(18px)}" +
    "#ckCaja .ck-sw input:disabled{cursor:default}#ckCaja .ck-sw input:disabled+i{opacity:.55}" +
    "#ckCaja .ck-sw input:focus-visible+i{outline:3px solid #22c55e;outline-offset:2px}" +
    "#ckCaja .ck-guardar{margin-top:12px}" +
    "@media (max-width:560px){#ckCaja{left:10px;right:10px;bottom:calc(10px + env(safe-area-inset-bottom,0px));width:auto;max-width:none;" +
      "max-height:calc(100vh - 20px);max-height:calc(100dvh - 20px);padding:16px;border-radius:18px}" +
      "#ckCaja .ck-ico{width:32px;height:32px;border-radius:10px}#ckCaja .ck-ico svg{width:18px;height:18px}" +
      "#ckCaja h2{font-size:15px}#ckCaja p{font-size:13px}#ckCaja .ck-botones{margin-top:14px}}" +
    "@media (prefers-reduced-motion:reduce){#ckCaja{animation:none}#ckCaja .ck-sw i,#ckCaja .ck-sw i:after{transition:none}}" +
    "@media print{#ckCaja{display:none}}";

  var ICONO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M12 3a9 9 0 1 0 9 9 3 3 0 0 1-3-3 3 3 0 0 1-3-3 3 3 0 0 1-3-3z"/>' +
    '<circle cx="8.5" cy="11.5" r="1" fill="currentColor" stroke="none"/><circle cx="12.5" cy="15.5" r="1" fill="currentColor" stroke="none"/>' +
    '<circle cx="15.8" cy="12.2" r=".75" fill="currentColor" stroke="none"/><circle cx="8.6" cy="16.2" r=".75" fill="currentColor" stroke="none"/></svg>';

  function abrir(conDetalle) {
    cerrar();
    if (!document.getElementById("ckEstilos")) {
      var st = document.createElement("style"); st.id = "ckEstilos"; st.textContent = css; document.head.appendChild(st);
    }
    var actual = leer() || { analitica: false, marketing: false };
    /* un <div> con id propio: así ninguna regla de la página (márgenes,
       rellenos de "section", tamaños de títulos) puede deformarlo */
    var caja = document.createElement("div");
    caja.id = "ckCaja";
    caja.setAttribute("role", "dialog"); caja.setAttribute("aria-modal", "false");
    caja.setAttribute("aria-labelledby", "ckTitulo"); caja.setAttribute("aria-describedby", "ckTexto");
    caja.innerHTML =
      '<div class="ck-cab"><span class="ck-ico" aria-hidden="true">' + ICONO + '</span><h2 id="ckTitulo">Usamos cookies</h2></div>' +
      '<p id="ckTexto">Las necesarias hacen que la web funcione. Si aceptas, también medimos visitas y mostramos publicidad relevante. ' +
        '<a href="/reclamaciones#cookies">Más información</a></p>' +
      '<div class="ck-detalle" id="ckDetalle"' + (conDetalle ? "" : " hidden") + ">" +
        '<div class="ck-op"><div><b>Necesarias</b><span>Tu sesión, tus preferencias y esta elección. Siempre activas.</span></div>' +
          '<label class="ck-sw"><input type="checkbox" checked disabled aria-label="Cookies necesarias (siempre activas)"><i></i></label></div>' +
        '<div class="ck-op"><div><b>Análisis</b><span>Google Analytics y Microsoft Clarity: cómo se usa la web, sin tu nombre, DNI ni celular.</span></div>' +
          '<label class="ck-sw"><input type="checkbox" id="ckAnalitica"' + (actual.analitica ? " checked" : "") + ' aria-label="Cookies de análisis"><i></i></label></div>' +
        '<div class="ck-op"><div><b>Marketing</b><span>Píxel de Meta: publicidad de Impulsa Crédito en Facebook e Instagram.</span></div>' +
          '<label class="ck-sw"><input type="checkbox" id="ckMarketing"' + (actual.marketing ? " checked" : "") + ' aria-label="Cookies de marketing"><i></i></label></div>' +
        '<button type="button" class="ck-btn ck-borde ck-guardar" id="ckGuardar">Guardar mi selección</button>' +
      "</div>" +
      '<div class="ck-botones" id="ckBotones">' +
        '<button type="button" class="ck-btn ck-gris" id="ckDenegar">Rechazar</button>' +
        '<button type="button" class="ck-btn ck-verde" id="ckTodo">Aceptar todo</button>' +
      "</div>" +
      '<button type="button" class="ck-link" id="ckDetalles" aria-expanded="' + (conDetalle ? "true" : "false") + '" aria-controls="ckDetalle">' +
        (conDetalle ? "Ocultar opciones" : "Personalizar") + "</button>";
    document.body.appendChild(caja);
    document.getElementById("ckDenegar").addEventListener("click", function () { guardar(false, false); cerrar(); });
    document.getElementById("ckTodo").addEventListener("click", function () { guardar(true, true); cerrar(); });
    document.getElementById("ckGuardar").addEventListener("click", function () {
      guardar(document.getElementById("ckAnalitica").checked, document.getElementById("ckMarketing").checked); cerrar();
    });
    document.getElementById("ckDetalles").addEventListener("click", function () {
      var d = document.getElementById("ckDetalle"), abierto = d.hidden;
      d.hidden = !abierto;
      this.setAttribute("aria-expanded", abierto ? "true" : "false");
      this.textContent = abierto ? "Ocultar opciones" : "Personalizar";
      if (abierto) document.getElementById("ckAnalitica").focus();
    });
    // abierto a pedido ("Configurar cookies"): el foco va a las opciones
    if (conDetalle) document.getElementById("ckAnalitica").focus();
  }
  function cerrar() { var c = document.getElementById("ckCaja"); if (c) c.remove(); }

  window.ICCookies = {
    consentimiento: function () { return leer() || { analitica: false, marketing: false }; },
    abrir: function () { abrir(true); },
    cuandoAcepte: function (tipo, fn) { var v = leer(); if (v && v[tipo]) fn(); else esperando[tipo].push(fn); },
    evento: evento
  };

  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest('a[href$="#configurar-cookies"]');
    if (a) { e.preventDefault(); abrir(true); return; }
    var wa = e.target.closest && e.target.closest('a[href*="wa.me/"]');
    if (wa) evento("whatsapp_clic", { ubicacion: location.pathname });
  });

  function iniciar() { var v = leer(); if (v) { aplicarGoogle(v); aplicarClarity(v); aplicarMeta(v); } else abrir(false); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar);
  else iniciar();
})();
