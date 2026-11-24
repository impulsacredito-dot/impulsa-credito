/* =====================================================================
   Impulsa Crédito — Aviso y configuración de cookies
   =====================================================================
   · Necesarias (siempre activas): mantener la sesión, recordar
     preferencias y esta misma elección.
   · Análisis y Marketing: SOLO se activan si la persona las acepta.
     Hoy la web no usa ninguna. Cuando agregues Google Analytics o el
     píxel de Meta, cárgalos así para respetar la elección:

       ICCookies.cuandoAcepte("analitica", function () { ...cargar GA... });
       ICCookies.cuandoAcepte("marketing", function () { ...cargar píxel... });

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
    try { document.dispatchEvent(new CustomEvent("ic:cookies", { detail: v })); } catch (e) {}
    return v;
  }

  var css =
    "#ckCaja{position:fixed;left:20px;right:auto;top:auto;bottom:20px;z-index:2147483000;box-sizing:border-box;width:min(420px,calc(100% - 32px));margin:0;" +
      "background:#fff;color:#111;text-align:left;border-radius:22px;padding:22px 22px 20px;" +
      "box-shadow:0 24px 60px rgba(9,20,14,.22),0 0 0 1px rgba(9,20,14,.06);" +
      "font-family:Montserrat,system-ui,-apple-system,'Segoe UI',sans-serif;font-size:16px;line-height:1.5;letter-spacing:normal;" +
      "animation:ckSube .35s cubic-bezier(.22,1,.36,1) both}" +
    "#ckCaja *{box-sizing:border-box}" +
    "@keyframes ckSube{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}}" +
    "#ckCaja h2{margin:0 0 10px;padding:0;font-size:1.08rem;line-height:1.3;font-weight:800;letter-spacing:-.01em;color:#111;text-align:left}" +
    "#ckCaja p{margin:0;padding:0;font-size:.86rem;line-height:1.6;color:#5d6b63;text-align:left}" +
    "#ckCaja p a{color:#15803d;font-weight:700;text-decoration:underline;text-underline-offset:2px}" +
    "#ckCaja .ck-botones{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-top:18px}" +
    "#ckCaja .ck-btn{margin:0;width:auto;min-height:0;text-align:center;text-transform:none;letter-spacing:normal;box-shadow:none;border-radius:999px;padding:12px 10px;font:800 .82rem Montserrat,system-ui,sans-serif;cursor:pointer;line-height:1.2;border:1.5px solid transparent;transition:background .15s,border-color .15s,transform .1s}" +
    "#ckCaja .ck-btn:active{transform:scale(.98)}" +
    "#ckCaja .ck-btn:focus-visible{outline:3px solid #22c55e;outline-offset:2px}" +
    "#ckCaja .ck-gris{background:#f1f3f2;color:#222}#ckCaja .ck-gris:hover{background:#e6e9e7}" +
    "#ckCaja .ck-borde{background:#fff;color:#222;border-color:#d9dfdb}#ckCaja .ck-borde:hover{border-color:#9aa7a0}" +
    "#ckCaja .ck-verde{background:#22c55e;color:#07210f}#ckCaja .ck-verde:hover{background:#4ade80}" +
    "#ckCaja .ck-detalle{margin-top:16px;border-top:1px solid #eef1ef;padding-top:6px}" +
    "#ckCaja .ck-op{display:flex;gap:14px;align-items:flex-start;justify-content:space-between;padding:12px 0;border-bottom:1px solid #f3f5f4}" +
    "#ckCaja .ck-op b{display:block;font-size:.86rem;margin-bottom:2px}#ckCaja .ck-op span{font-size:.76rem;color:#6b7a72;line-height:1.5}" +
    "#ckCaja .ck-sw{position:relative;flex:none;width:42px;height:24px;margin-top:2px}" +
    "#ckCaja .ck-sw input{opacity:0;width:100%;height:100%;margin:0;position:absolute;cursor:pointer;z-index:1}" +
    "#ckCaja .ck-sw i{position:absolute;inset:0;border-radius:999px;background:#d9dfdb;transition:background .15s}" +
    "#ckCaja .ck-sw i:after{content:'';position:absolute;top:3px;left:3px;width:18px;height:18px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.2);transition:transform .15s}" +
    "#ckCaja .ck-sw input:checked+i{background:#22c55e}#ckCaja .ck-sw input:checked+i:after{transform:translateX(18px)}" +
    "#ckCaja .ck-sw input:disabled+i{opacity:.55}#ckCaja .ck-sw input:focus-visible+i{outline:3px solid #22c55e;outline-offset:2px}" +
    "#ckCaja .ck-guardar{width:100%;margin-top:14px}" +
    "@media (max-width:520px){#ckCaja{left:12px;right:12px;bottom:12px;width:auto;padding:18px}#ckCaja .ck-botones{grid-template-columns:1fr 1fr}#ckCaja .ck-botones .ck-verde{grid-column:1/-1;order:-1}}" +
    "@media print{#ckCaja{display:none}}";

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
    caja.setAttribute("role", "dialog"); caja.setAttribute("aria-labelledby", "ckTitulo"); caja.setAttribute("aria-describedby", "ckTexto");
    caja.innerHTML =
      '<h2 id="ckTitulo">Configuración de cookies</h2>' +
      '<p id="ckTexto">Utilizamos cookies para mejorar su experiencia, comprender cómo se utiliza nuestro sitio y ofrecerle herramientas de marketing relevantes. ' +
        'Las necesarias para que la web funcione siempre están activas. <a href="reclamaciones.html#cookies">Política de cookies</a></p>' +
      '<div class="ck-detalle" id="ckDetalle"' + (conDetalle ? "" : " hidden") + ">" +
        '<div class="ck-op"><div><b>Necesarias</b><span>Mantienen tu sesión, tus preferencias y esta elección. Siempre activas.</span></div>' +
          '<label class="ck-sw"><input type="checkbox" checked disabled aria-label="Cookies necesarias (siempre activas)"><i></i></label></div>' +
        '<div class="ck-op"><div><b>Análisis</b><span>Nos dicen qué páginas se visitan para mejorar el sitio. Sin datos que te identifiquen.</span></div>' +
          '<label class="ck-sw"><input type="checkbox" id="ckAnalitica"' + (actual.analitica ? " checked" : "") + ' aria-label="Cookies de análisis"><i></i></label></div>' +
        '<div class="ck-op"><div><b>Marketing</b><span>Permiten mostrarte publicidad de Impulsa Crédito en redes sociales.</span></div>' +
          '<label class="ck-sw"><input type="checkbox" id="ckMarketing"' + (actual.marketing ? " checked" : "") + ' aria-label="Cookies de marketing"><i></i></label></div>' +
        '<button type="button" class="ck-btn ck-verde ck-guardar" id="ckGuardar">Guardar mi elección</button>' +
      "</div>" +
      '<div class="ck-botones" id="ckBotones">' +
        '<button type="button" class="ck-btn ck-gris" id="ckDenegar">Denegar</button>' +
        '<button type="button" class="ck-btn ck-borde" id="ckDetalles" aria-expanded="' + (conDetalle ? "true" : "false") + '" aria-controls="ckDetalle">' + (conDetalle ? "Ocultar detalles" : "Mostrar detalles") + "</button>" +
        '<button type="button" class="ck-btn ck-verde" id="ckTodo">Permitir todo</button>' +
      "</div>";
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
      this.textContent = abierto ? "Ocultar detalles" : "Mostrar detalles";
    });
  }
  function cerrar() { var c = document.getElementById("ckCaja"); if (c) c.remove(); }

  window.ICCookies = {
    consentimiento: function () { return leer() || { analitica: false, marketing: false }; },
    abrir: function () { abrir(true); },
    cuandoAcepte: function (tipo, fn) { var v = leer(); if (v && v[tipo]) fn(); else esperando[tipo].push(fn); }
  };

  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest('a[href$="#configurar-cookies"]');
    if (a) { e.preventDefault(); abrir(true); }
  });

  function iniciar() { if (!leer()) abrir(false); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar);
  else iniciar();
})();
