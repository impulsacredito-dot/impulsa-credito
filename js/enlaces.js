/* =====================================================================
   Impulsa Crédito — página de enlaces (bio de Instagram y TikTok)
   =====================================================================
   Dos pestañas, igual que las dos líneas de la marca:
     · Logra tu crédito (la principal): el cliente elige el tipo de
       préstamo y el monto, y pide asesoría por WhatsApp.
     · Efectiviza tu tarjeta: simulador con la comisión de config.js.
   En los dos casos el mensaje de WhatsApp llega ya escrito.

   DE DÓNDE VIENE CADA CLIENTE
   En la bio de cada red se pone un enlace distinto:
     Instagram → impulsacredito.com/ig   (lleva a enlaces?src=ig)
     TikTok    → impulsacredito.com/tt   (lleva a enlaces?src=tt)
   El mensaje dice "Los vi en Instagram" o "Los vi en TikTok", así sabes
   qué red te trae más clientes sin instalar nada.
   Con &l=ef la página abre directo en la pestaña de efectivizar.
   ===================================================================== */
(function () {
  "use strict";

  var CFG = window.SITE_CONFIG || {};
  var P = CFG.platform || {};
  var K = CFG.contact || {};
  var pct = Number(P.commissionPercent || 1);
  var min = Number(P.minAmount || 100), max = Number(P.maxAmount || 30000);
  var rapidos = ((CFG.bento || {}).simulator || {}).quick || [1000, 5000, 10000, 20000, 30000];

  var params = new URLSearchParams(location.search);
  var REDES = { ig: "Instagram", tt: "TikTok", fb: "Facebook", yt: "YouTube" };
  var src = (params.get("src") || "").toLowerCase();
  var red = REDES[src] || "";

  /* tipos de préstamo: [clave, texto del botón, cómo se dice en el mensaje] */
  var TIPOS = [
    ["negocio", "Mi negocio (Pyme)", "un préstamo para mi negocio"],
    ["personal", "Personal", "un préstamo personal"],
    ["vehicular", "Vehicular", "un crédito vehicular"],
    ["hipotecario", "Hipotecario", "un crédito hipotecario"],
    ["deuda", "Compra de deuda", "una compra de deuda"]
  ];

  function soles(n, dec) {
    return "S/ " + Number(n).toLocaleString("es-PE", { minimumFractionDigits: dec ? 2 : 0, maximumFractionDigits: dec ? 2 : 0 });
  }
  function $(id) { return document.getElementById(id); }
  function wa(texto) { return "https://wa.me/" + (K.whatsapp || "") + "?text=" + encodeURIComponent(texto); }
  function saludo() { return "Hola Impulsa Crédito 👋 " + (red ? "Los vi en " + red + ". " : ""); }

  /* ---------- cabecera ---------- */
  var CHECK = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.2 4.2L19 7"/></svg>';
  $("lnChips").innerHTML = ["Asesoría gratis", "Préstamos", (K.city || "Lima").split(",")[0]]
    .map(function (t) { return "<li>" + CHECK + t + "</li>"; }).join("");
  $("lnPct").textContent = pct;
  $("lnAnio").textContent = new Date().getFullYear();
  var CL = CFG.claims || {};
  $("lnRuc").textContent = [CL.company, CL.ruc ? "RUC " + CL.ruc : ""].filter(Boolean).join(" · ");
  var h = K.hoursShort || [];
  $("lnNota").textContent = "Te respondemos en minutos" + (h.length ? " · " + h.join(", ") : "");

  /* el registro también se entera de la red de origen (para medirlo más adelante) */
  if (red) $("lnRegistro").href = (P.registerHref || "/registro") + "?utm_source=" + src + "&utm_medium=bio";

  /* ---------- pestañas ---------- */
  var tabs = [$("tabCredito"), $("tabEfectivo")];
  var paneles = [$("panelCredito"), $("panelEfectivo")];
  function abrir(i, enfocar) {
    tabs.forEach(function (t, j) {
      var on = i === j;
      t.setAttribute("aria-selected", on ? "true" : "false");
      t.tabIndex = on ? 0 : -1;
      paneles[j].hidden = !on;
    });
    if (enfocar) tabs[i].focus();
  }
  tabs.forEach(function (t, i) {
    t.addEventListener("click", function () { abrir(i); });
    t.addEventListener("keydown", function (e) {
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") { e.preventDefault(); abrir(1 - i, true); }
    });
  });
  abrir(params.get("l") === "ef" ? 1 : 0);

  /* ---------- logra tu crédito ---------- */
  var tipo = TIPOS[0];
  var montoCredito = $("lnMontoCredito"), pedirCredito = $("lnPedirCredito");
  $("lnTipos").innerHTML = TIPOS.map(function (t) {
    return '<button type="button" role="radio" data-t="' + t[0] + '">' + t[1] + "</button>";
  }).join("");

  function actualizarCredito() {
    $("lnTipos").querySelectorAll("button").forEach(function (b) {
      b.setAttribute("aria-checked", b.dataset.t === tipo[0] ? "true" : "false");
    });
    var m = Math.round(Number(montoCredito.value) || 0);
    pedirCredito.href = wa(saludo() + "Quiero asesoría para " + tipo[2] + (m > 0 ? " de " + soles(m) + " aprox." : "."));
  }
  $("lnTipos").addEventListener("click", function (e) {
    var b = e.target.closest("button");
    if (!b) return;
    tipo = TIPOS.filter(function (t) { return t[0] === b.dataset.t; })[0] || TIPOS[0];
    actualizarCredito();
  });
  montoCredito.addEventListener("input", actualizarCredito);
  actualizarCredito();

  /* ---------- efectiviza: simulador ---------- */
  var monto = Math.min(Math.max(5000, min), max);
  var input = $("lnMonto"), rango = $("lnRango"), pedir = $("lnPedir");
  input.min = rango.min = min;
  input.max = rango.max = max;

  $("lnRapidos").innerHTML = rapidos.map(function (q) {
    return '<button type="button" data-q="' + q + '">' + soles(q) + "</button>";
  }).join("");

  function actualizar(v, escribirEnCaja) {
    monto = Math.min(Math.max(Math.round(Number(v) || min), min), max);
    if (escribirEnCaja) input.value = monto;
    rango.value = monto;
    var comision = Math.round(monto * pct) / 100;
    $("lnComision").textContent = "– " + soles(comision, true);
    $("lnNeto").textContent = soles(monto - comision, true);
    pedir.href = wa(saludo() + "Quiero efectivizar " + soles(monto) + " de mi tarjeta de crédito.");
    $("lnRapidos").querySelectorAll("button").forEach(function (b) { b.classList.toggle("on", Number(b.dataset.q) === monto); });
  }

  input.addEventListener("input", function () { actualizar(this.value, false); });
  input.addEventListener("blur", function () { actualizar(this.value, true); });
  rango.addEventListener("input", function () { actualizar(this.value, true); });
  $("lnRapidos").addEventListener("click", function (e) {
    var b = e.target.closest("button");
    if (b) actualizar(b.dataset.q, true);
  });

  actualizar(monto, true);
})();
