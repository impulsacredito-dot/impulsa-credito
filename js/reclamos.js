/* Impulsa Crédito — Libro de Reclamaciones (virtual) */
(function () {
  "use strict";
  var IC = window.IC, CFG = IC.cfg, C = CFG.claims || {}, contact = CFG.contact || {};
  var esc = IC.esc;
  var KEY = "ic_claims_v1";

  /* textos desde config */
  document.getElementById("year").textContent = new Date().getFullYear();
  document.getElementById("footerBrandName").textContent = (CFG.brand || {}).name || "";
  document.getElementById("footerCompanyLine").textContent = [C.company, C.ruc ? "RUC " + C.ruc : "", C.address].filter(Boolean).join(" · ");
  document.querySelectorAll(".js-brand-mark").forEach(function (i) { if (CFG.brand) i.src = CFG.brand.icon || CFG.brand.logo; });
  if (C.title) document.getElementById("claimsTitle").textContent = C.title;
  document.getElementById("claimsSubtitle").textContent = C.subtitle || "";
  document.getElementById("claimsCompany").textContent = [C.company, C.ruc ? "RUC " + C.ruc : "", C.address].filter(Boolean).join(" · ");
  document.getElementById("claimsDefs").innerHTML =
    '<div><b>Diferencia entre reclamo y queja.</b><br>' + esc(C.defRec || "") + "<br>" + esc(C.defQueja || "") + "</div>";
  document.getElementById("claimsDeadline").innerHTML = "<div>" + esc(C.deadlineNote || "") + "</div>";
  document.getElementById("defRec").textContent = (C.defRec || "").replace(/^Reclamo:\s*/i, "");
  document.getElementById("defQueja").textContent = (C.defQueja || "").replace(/^Queja:\s*/i, "");

  var form = document.getElementById("claimsForm");
  var tipo = "Reclamo";

  /* selector Reclamo / Queja */
  form.querySelectorAll(".choice").forEach(function (c) {
    c.addEventListener("click", function () {
      form.querySelectorAll(".choice").forEach(function (x) { x.classList.remove("active"); });
      c.classList.add("active");
      tipo = c.dataset.tipo;
    });
  });

  /* menor de edad */
  document.getElementById("menor").addEventListener("change", function () {
    document.getElementById("tutorBox").classList.toggle("hidden", !this.checked);
  });

  function f(name) { return form.querySelector('[name="' + name + '"]'); }
  function mark(input, bad) { input.closest(".field, .check").classList.toggle("invalid", !!bad); return !bad; }

  form.querySelectorAll("input,textarea,select").forEach(function (i) {
    i.addEventListener("input", function () {
      var box = i.closest(".field, .check");
      if (box && box.classList.contains("invalid") && i.value.trim()) box.classList.remove("invalid");
    });
  });

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var required = ["nombres", "apellidos", "doc", "domicilio", "phone", "email", "descripcion", "detalle", "pedido"];
    var ok = true;
    required.forEach(function (n) { if (!mark(f(n), !f(n).value.trim())) ok = false; });
    if (f("email").value && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(f("email").value)) { mark(f("email"), true); ok = false; }
    if (f("phone").value && !/^\d{6,12}$/.test(f("phone").value.replace(/\s/g, ""))) { mark(f("phone"), true); ok = false; }
    if (!mark(f("acepta"), !f("acepta").checked)) ok = false;
    if (document.getElementById("menor").checked) {
      if (!mark(f("tutor"), !f("tutor").value.trim())) ok = false;
      if (!mark(f("tutorDoc"), !f("tutorDoc").value.trim())) ok = false;
    }
    if (!ok) { IC.toast("Revisa los campos marcados en rojo.", "err"); form.querySelector(".invalid").scrollIntoView({ behavior: "smooth", block: "center" }); return; }

    var code = "LR-" + new Date().getFullYear() + "-" + Date.now().toString(36).toUpperCase().slice(-5);
    var record = {
      code: code, at: Date.now(), tipo: tipo,
      nombres: f("nombres").value.trim(), apellidos: f("apellidos").value.trim(),
      docType: f("docType").value, doc: f("doc").value.trim(),
      domicilio: f("domicilio").value.trim(), phone: f("phone").value.trim(), email: f("email").value.trim(),
      menor: document.getElementById("menor").checked, tutor: f("tutor").value.trim(), tutorDoc: f("tutorDoc").value.trim(),
      bien: f("bien").value, monto: f("monto").value, descripcion: f("descripcion").value.trim(),
      detalle: f("detalle").value.trim(), pedido: f("pedido").value.trim()
    };
    try {
      var all = JSON.parse(localStorage.getItem(KEY) || "[]");
      all.push(record); localStorage.setItem(KEY, JSON.stringify(all));
    } catch (err) { /* si falla el guardado local, igual mostramos la constancia */ }
    if (IC.backend) { try { IC.backend.reclamo(record); } catch (err) {} }

    var waMsg = "LIBRO DE RECLAMACIONES - " + code + "\n" +
      "Tipo: " + tipo + "\n" +
      "Consumidor: " + record.nombres + " " + record.apellidos + " (" + record.docType + " " + record.doc + ")\n" +
      "Teléfono: " + record.phone + " · Correo: " + record.email + "\n" +
      "Domicilio: " + record.domicilio + "\n" +
      "Bien contratado: " + record.bien + (record.monto ? " · Monto reclamado: S/ " + record.monto : "") + "\n" +
      "Descripción: " + record.descripcion + "\n" +
      "Detalle: " + record.detalle + "\n" +
      "Pedido: " + record.pedido;

    form.classList.add("hidden");
    var res = document.getElementById("claimsResult");
    res.classList.remove("hidden");
    res.innerHTML =
      '<div class="card claims-ok"><div style="text-align:center"><div class="success-anim"><svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="#08130c" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5L20 7"/></svg></div>' +
      "<h3>Reclamo registrado</h3><p class='text-muted mt-8'>Guarda tu código de registro. Te responderemos al correo indicado.</p>" +
      '<div class="claims-code">' + esc(code) + "</div></div>" +
      '<div class="calc mt-24"><div class="r"><span>Tipo</span><b>' + esc(tipo) + '</b></div><div class="r"><span>Consumidor</span><b>' + esc(record.nombres + " " + record.apellidos) + '</b></div><div class="r"><span>Documento</span><b>' + esc(record.docType + " " + record.doc) + '</b></div><div class="r"><span>Fecha</span><b>' + IC.fmtDateTime(record.at) + '</b></div>' +
      (record.monto ? '<div class="r"><span>Monto reclamado</span><b>S/ ' + esc(record.monto) + "</b></div>" : "") + "</div>" +
      '<div class="note amber mt-16"><div>' + esc(C.deadlineNote || "") + "</div></div>" +
      '<div class="wz-actions no-print"><a href="index.html" class="btn btn-outline-dark">Volver al inicio</a><div class="row"><button class="btn btn-soft" id="printClaim">🖨️ Imprimir constancia</button><a class="btn btn-primary" target="_blank" rel="noopener" href="' + IC.waLink(waMsg) + '">Enviar copia por WhatsApp</a></div></div></div>';
    document.getElementById("printClaim").addEventListener("click", function () { window.print(); });
    IC.confetti();
    res.scrollIntoView({ behavior: "smooth", block: "start" });
  });
})();
