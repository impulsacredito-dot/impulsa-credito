/* =====================================================================
   IMPULSA CRÉDITO — Crear contraseña nueva
   =====================================================================
   El cliente llega aquí desde el enlace que le mandamos por correo.
   Supabase pone el permiso temporal en la parte de la dirección que va
   después del "#", que nunca sale de su navegador.
   ===================================================================== */
(function () {
  "use strict";

  var CFG = window.SITE_CONFIG || {};
  var P = CFG.platform || {};

  function $(id) { return document.getElementById(id); }
  function ver(cual) {
    ["recForm", "recInvalido", "recListo"].forEach(function (id) {
      $(id).classList.toggle("hidden", id !== cual);
    });
  }

  /* Lee el permiso que viene en el enlace y limpia la barra de direcciones */
  function leerToken() {
    var h = (location.hash || "").replace(/^#/, "");
    if (!h) return null;
    var p = new URLSearchParams(h);
    var t = p.get("access_token");
    var err = p.get("error_description") || p.get("error");
    // que no quede el permiso a la vista ni en el historial
    try { history.replaceState(null, "", location.pathname + location.search); } catch (e) {}
    return { token: t, error: err, tipo: p.get("type") };
  }

  document.addEventListener("DOMContentLoaded", function () {
    // el logo, la ilustración animada, el horario y los ojos de contraseña
    // los pinta auth.js, que se carga justo antes que este archivo
    document.querySelectorAll(".js-wa-link").forEach(function (a) {
      if (window.IC && IC.waLink) a.href = IC.waLink();
    });

    var datos = leerToken();

    if (!datos || !datos.token) { ver("recInvalido"); return; }
    if (datos.error) { ver("recInvalido"); return; }
    ver("recForm");

    $("recFormEl").addEventListener("submit", async function (e) {
      e.preventDefault();
      var p1 = $("recPass"), p2 = $("recPass2"), err = $("recError"), btn = $("recBtn");
      err.classList.add("hidden");

      if (p1.value.length < 8 || !/\d/.test(p1.value)) {
        err.textContent = "La contraseña debe tener al menos 8 caracteres e incluir un número.";
        err.classList.remove("hidden"); p1.focus(); return;
      }
      if (p1.value !== p2.value) {
        err.textContent = "Las dos contraseñas no coinciden.";
        err.classList.remove("hidden"); p2.focus(); return;
      }

      btn.disabled = true; btn.textContent = "Guardando...";
      var res = await IC.cloud.fijarPassword(datos.token, p1.value);
      if (res.ok) {
        /* Le recordamos con que datos entrar: el motivo mas comun de no
           poder acceder despues es no recordar el documento exacto. */
        var recordatorio = $("recDatos");
        if (recordatorio && (res.documento || res.correo)) {
          recordatorio.innerHTML =
            "<b>Entra con estos datos:</b>" +
            (res.documento ? "<span>Documento: <b>" + res.documento + "</b></span>" : "") +
            (res.correo ? "<span>O tu correo: <b>" + res.correo + "</b></span>" : "");
          recordatorio.classList.remove("hidden");
        }
        ver("recListo");
        if (window.IC && IC.confetti) IC.confetti();
      } else {
        err.textContent = res.error || "No se pudo guardar. Inténtalo otra vez.";
        err.classList.remove("hidden");
        btn.disabled = false; btn.textContent = "Guardar contraseña";
      }
    });
  });
})();
