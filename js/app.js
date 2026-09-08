/* =====================================================================
   Impulsa Crédito — Panel de usuario (SPA con rutas por #hash)
   ===================================================================== */
(function () {
  "use strict";
  var IC = window.IC, CFG = IC.cfg, P = IC.p, esc = IC.esc;
  var NUBE = !!(IC.cloud && IC.cloud.activo);   // cuentas en la nube activas
  var user = null;

  /* ---------- iconos ---------- */
  /* Set de iconos lineales, alineado al manual de marca (trazo redondeado) */
  var ICONS = {
    home: "M3 10.2 12 3l9 7.2V20a1.5 1.5 0 0 1-1.5 1.5H15V15H9v6.5H4.5A1.5 1.5 0 0 1 3 20z",
    shield: "M12 2.6 19.5 6v5.6c0 4.6-3.1 7.9-7.5 9.4-4.4-1.5-7.5-4.8-7.5-9.4V6zM9.2 12.1l2 2 3.6-3.7",
    swap: "M3.5 8.5h14M14 5l3.5 3.5L14 12M20.5 15.5h-14M10 12l-3.5 3.5L10 19",
    card: "M2.5 6.5h19v11h-19zM2.5 10.5h19M6 14.5h3.5",
    bank: "M12 3 21 8H3zM5.5 8v9M10 8v9M14 8v9M18.5 8v9M3 21h18",
    history: "M3.5 12a8.5 8.5 0 1 0 2.6-6.1M3.5 4.2v3.9h3.9M12 7.5V12l3 1.8",
    receipt: "M6 2.8h12v18.4l-2.5-1.7-2.4 1.7-2.6-1.7L8 21.2 6 19.9zM9.2 8h5.6M9.2 12h5.6",
    settings: "M4 6.5h5M13 6.5h7M4 12h11M19 12h1M4 17.5h3M11 17.5h9M11 6.5a2 2 0 1 0 0-.1M17 12a2 2 0 1 0 0-.1M9 17.5a2 2 0 1 0 0-.1",
    plus: "M12 5.5v13M5.5 12h13",
    check: "M5 12.5l4.8 4.8L19 7.5",
    camera: "M4 8.2h3.2l1.7-2.6h6.2l1.7 2.6H20v11H4zM12 17.2a3.4 3.4 0 1 0 0-6.8 3.4 3.4 0 0 0 0 6.8z",
    image: "M4 5.2h16v13.6H4zM8.4 11a1.6 1.6 0 1 0 0-3.2 1.6 1.6 0 0 0 0 3.2M4 16.5l4.7-4.6 3.6 3.6 3-2.9 4.7 4.6",
    left: "M14.5 18.5 8 12l6.5-6.5",
    right: "M9.5 5.5 16 12l-6.5 6.5",
    trash: "M4 7h16M9.5 11v6M14.5 11v6M6.2 7l.9 13h9.8l.9-13M9.2 7V4.2h5.6V7",
    dollar: "M12 3v18M16.2 7c0-1.7-1.9-2.7-4.2-2.7S7.8 5.3 7.8 7s1.9 2.7 4.2 2.7 4.2 1 4.2 2.7-1.9 2.7-4.2 2.7-4.2-1-4.2-2.7",
    banknote: "M2.5 6.5h19v11h-19zM12 14.6a2.6 2.6 0 1 0 0-5.2 2.6 2.6 0 0 0 0 5.2M6 9.8v.01M18 14.2v.01",
    wallet: "M3 7.5A2 2 0 0 1 5 5.5h13v4M3 7.5v9A2 2 0 0 0 5 18.5h14a1 1 0 0 0 1-1v-3M21 11.5h-3.5a2 2 0 1 0 0 4H21z",
    clock: "M12 21.5a9.5 9.5 0 1 0 0-19 9.5 9.5 0 0 0 0 19M12 7v5.2l3.2 1.9",
    x: "M18 6 6 18M6 6l12 12",
    upload: "M12 16.5V4.5M7 9.2l5-4.7 5 4.7M4 20h16",
    info: "M12 21.5a9.5 9.5 0 1 0 0-19 9.5 9.5 0 0 0 0 19M12 7.8v.01M12 11.5v5",
    refresh: "M20.5 12a8.5 8.5 0 1 1-2.6-6.1M20.5 4.2v3.9h-3.9",
    user: "M19.5 20.5v-1.8a4.2 4.2 0 0 0-4.2-4.2H8.7a4.2 4.2 0 0 0-4.2 4.2v1.8M12 10.8a4.1 4.1 0 1 0 0-8.2 4.1 4.1 0 0 0 0 8.2",
    star: "M12 3.2l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17.2l-5.4 2.9 1-6.1L3.2 9.7l6.1-.9z",
    bolt: "M13.4 2.5 4.8 13.6h6.1l-1.3 7.9 8.6-11.1h-6.1z",
    id: "M2.5 5.5h19v13h-19zM6.5 9.8h3.8v4H6.5zM13.5 9.8h4.5M13.5 13.5h4.5",
    chat: "M20.5 11.6c0 4-3.8 7.2-8.5 7.2-1 0-2-.15-2.9-.42L4 20l1.5-3.4C4.1 15.3 3.5 13.5 3.5 11.6c0-4 3.8-7.2 8.5-7.2s8.5 3.2 8.5 7.2z",
    doc: "M6.5 2.8h7.8L18 6.5v14.7H6.5zM14 2.8V7h4",
    handshake: "M8 12.5 5 9.5l3.5-3.5 2.5 1.5h2l2.5-1.5L19 9.5l-3 3M8 12.5l2.5 2.5 1.5-1.5 1.5 1.5 1.5-1.5 1.5 1.5M4 9.5 2.5 11l3.5 3.5M20 9.5 21.5 11 18 14.5"
  };
  function ic(name, size) {
    return '<svg viewBox="0 0 24 24" width="' + (size || 18) + '" height="' + (size || 18) + '" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="' + (ICONS[name] || ICONS.info) + '"/></svg>';
  }
  var WA_SVG = '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12c0 1.85.5 3.58 1.36 5.07L2 22l5.05-1.32A9.94 9.94 0 0 0 12 22c5.52 0 10-4.48 10-10S17.52 2 12 2z"/></svg>';

  /* ---------- shell ---------- */
  var NAV = [
    { route: "#/inicio", label: "Inicio", icon: "home" },
    { route: "#/identificacion", label: "Identificación", icon: "shield" },
    { route: "#/operacion", label: "Nueva Operación", icon: "swap" },
    { route: "#/tarjetas", label: "Mis Tarjetas", icon: "card" },
    { route: "#/cuentas", label: "Mis Cuentas", icon: "bank" },
    { route: "#/historial", label: "Historial", icon: "history" },
    { route: "#/comprobantes", label: "Comprobantes", icon: "receipt" },
    { route: "#/ajustes", label: "Ajustes", icon: "settings" }
  ];
  var sidebar = document.getElementById("sidebar");
  var viewEl = document.getElementById("view");

  function refreshUser() {
    user = (NUBE ? IC.cloud.usuario() : IC.auth.current()) || user;
  }
  /* guarda un cambio: en la nube (servidor) o en este navegador */
  async function guardar(accionNube, accionLocal) {
    if (NUBE) { user = await accionNube(); }
    else { IC.auth.update(accionLocal); refreshUser(); }
    return user;
  }
  function fullName() { return user.nombres + " " + user.apellidos; }
  function renderShell() {
    refreshUser();
    document.querySelectorAll(".js-brand-mark").forEach(function (i) { if (CFG.brand) i.src = CFG.brand.icon || CFG.brand.logo; });
    document.getElementById("sbAvatar").textContent = IC.initials(fullName());
    document.getElementById("tbAvatar").textContent = IC.initials(fullName());
    document.getElementById("sbName").textContent = fullName().toUpperCase();
    document.getElementById("sbDoc").textContent = user.docType + ": " + user.doc;
    document.getElementById("tbName").textContent = user.nombres.split(" ")[0].toUpperCase();
    document.getElementById("pageDate").textContent = IC.fmtDate();
    var ob = IC.onboarding(user);
    var pending = ob.total - ob.completed;
    document.getElementById("sbNav").innerHTML = NAV.map(function (n) {
      var badge = n.route === "#/inicio" && pending ? '<span class="badge-n">' + pending + '</span>' : "";
      return '<a href="' + n.route + '" data-route="' + n.route + '">' + ic(n.icon) + esc(n.label) + badge + "</a>";
    }).join("");
    var unread = (user.notifications || []).filter(function (n) { return !n.read; }).length;
    var bc = document.getElementById("bellCount");
    bc.textContent = unread; bc.classList.toggle("hidden", !unread);
  }
  function setActiveNav(route) {
    document.querySelectorAll("#sbNav a").forEach(function (a) {
      var r = a.dataset.route;
      a.classList.toggle("active", route === r || (r !== "#/inicio" && route.indexOf(r) === 0));
    });
  }
  document.getElementById("logoutBtn").addEventListener("click", function () {
    IC.modal({ title: "Cerrar sesión", text: "¿Seguro que deseas salir de tu cuenta?", actions: [{ label: "Cancelar", cls: "btn-outline-dark" }, { label: "Salir", cls: "btn-dark", onClick: async function () { if (NUBE) { await IC.cloud.logout(); } else { IC.auth.logout(); } window.location.href = P.loginHref || "login.html"; } }] });
  });
  var backdrop = document.getElementById("sidebarBackdrop");
  function setMenu(open) {
    sidebar.classList.toggle("open", open);
    if (backdrop) backdrop.classList.toggle("show", open);
  }
  document.getElementById("menuBtn").addEventListener("click", function () { setMenu(!sidebar.classList.contains("open")); });
  if (backdrop) backdrop.addEventListener("click", function () { setMenu(false); });
  sidebar.addEventListener("click", function (e) { if (e.target.closest("a")) setMenu(false); });
  window.addEventListener("resize", function () { if (window.innerWidth > 820) setMenu(false); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") setMenu(false); });
  document.getElementById("bellBtn").addEventListener("click", function () {
    refreshUser();
    var list = (user.notifications || []).slice().sort(function (a, b) { return b.at - a.at; });
    IC.modal({
      title: "Notificaciones",
      html: list.length ? list.map(function (n) { return '<div class="notif-item"><b>' + esc(n.title) + "</b>" + esc(n.text) + '<br><span>' + IC.fmtDateTime(n.at) + "</span></div>"; }).join("") : "<p>No tienes notificaciones.</p>",
      actions: [{ label: "Cerrar", cls: "btn-outline-dark" }]
    });
    if (NUBE) { IC.cloud.marcarAvisosLeidos(); (user.notifications || []).forEach(function (n) { n.read = true; }); }
    else { IC.auth.update(function (u) { (u.notifications || []).forEach(function (n) { n.read = true; }); }); }
    renderShell();
  });
  function notify(title, text) {
    var n = { id: IC.uid("n"), title: title, text: text, at: Date.now(), read: false };
    if (NUBE) { user.notifications = user.notifications || []; user.notifications.push(n); }
    else { IC.auth.update(function (u) { u.notifications = u.notifications || []; u.notifications.push(n); }); }
  }

  /* ---------- router ---------- */
  var ROUTES = [
    ["/inicio", viewHome], ["/identificacion", viewIdentity], ["/operacion", viewNewOp], ["/operacion/:id", viewOpDetail],
    ["/tarjetas", viewCards], ["/tarjetas/nueva", viewAddCard], ["/cuentas", viewAccounts], ["/cuentas/nueva", viewAddAccount],
    ["/historial", viewHistory], ["/comprobantes", viewReceipts], ["/comprobantes/:id", viewReceipt], ["/ajustes", viewSettings]
  ];
  var activeCleanup = null;
  function navigate() {
    refreshUser();
    var path = (location.hash || "#/inicio").slice(1).split("?")[0];
    var match = null, params = {};
    for (var i = 0; i < ROUTES.length; i++) {
      var parts = ROUTES[i][0].split("/"), segs = path.split("/");
      if (parts.length !== segs.length) continue;
      var ok = true, p = {};
      for (var j = 0; j < parts.length; j++) {
        if (parts[j][0] === ":") p[parts[j].slice(1)] = decodeURIComponent(segs[j]);
        else if (parts[j] !== segs[j]) { ok = false; break; }
      }
      if (ok) { match = ROUTES[i][1]; params = p; break; }
    }
    if (!match) { location.hash = "#/inicio"; return; }
    if (activeCleanup) { try { activeCleanup(); } catch (e) {} activeCleanup = null; }
    var v = match(params);
    document.getElementById("pageTitle").textContent = v.title;
    viewEl.innerHTML = v.html;
    viewEl.classList.remove("view"); void viewEl.offsetWidth; viewEl.classList.add("view");
    // evita que el navegador autocomplete con datos de otras cuentas
    viewEl.querySelectorAll("input,select,textarea").forEach(function (i) {
      if (!i.getAttribute("autocomplete")) i.setAttribute("autocomplete", "off");
    });
    if (v.mount) activeCleanup = v.mount(viewEl) || null;
    setActiveNav("#" + path);
    renderShell();
    window.scrollTo({ top: 0 });
  }
  window.addEventListener("hashchange", navigate);

  /* ---------- helpers UI ---------- */
  function statusLabel(s) { return { activa: "ACTIVA", pend_pago: "PEND. PAGO", completada: "COMPLETADA", cancelada: "CANCELADA", review: "EN REVISIÓN", verified: "VERIFICADA", pending: "PENDIENTE" }[s] || s; }
  function statusBadge(s) { return '<span class="status ' + s + '">' + statusLabel(s) + "</span>"; }
  function emptyState(icon, title, text, btnHtml) {
    return '<div class="empty"><div class="ic">' + ic(icon, 24) + "</div><b>" + esc(title) + "</b><p>" + esc(text) + "</p>" + (btnHtml ? '<div class="mt-16">' + btnHtml + "</div>" : "") + "</div>";
  }
  function bankDot(name) { return '<span class="bank-dot" style="background:' + IC.bankColor(name) + '">' + esc(IC.bankShort(name)) + "</span>"; }
  function opTypeLabel(t) { return t === "autopago" ? "Autopago de tarjeta" : "Efectivización"; }
  function cardById(id) { return user.cards.find(function (c) { return c.id === id; }); }
  function accountById(id) { return user.accounts.find(function (a) { return a.id === id; }); }

  /* dropzone reutilizable: devuelve html; bind(el, onImage) engancha eventos */
  function dropzoneHTML(id, label, hint, capture) {
    return '<div class="dropzone" id="' + id + '">' +
      '<input type="file" accept="image/*"' + (capture ? ' capture="' + capture + '"' : "") + '>' +
      '<div class="ic">' + ic("image", 22) + "</div><b>" + esc(label) + "</b><span>" + esc(hint) + "</span></div>";
  }
  function bindDropzone(el, onImage) {
    var input = el.querySelector("input");
    function handle(file) {
      if (!file || !/^image\//.test(file.type)) { IC.toast("Selecciona una imagen (JPG o PNG).", "err"); return; }
      el.classList.add("loading");
      IC.compressImage(file, 1100, 0.8).then(function (data) { onImage(data); }).catch(function () { IC.toast("No se pudo procesar la imagen.", "err"); });
    }
    input.addEventListener("change", function () { handle(input.files[0]); input.value = ""; });
    ["dragenter", "dragover"].forEach(function (ev) { el.addEventListener(ev, function (e) { e.preventDefault(); el.classList.add("drag"); }); });
    ["dragleave", "drop"].forEach(function (ev) { el.addEventListener(ev, function (e) { e.preventDefault(); el.classList.remove("drag"); }); });
    el.addEventListener("drop", function (e) { handle(e.dataTransfer.files[0]); });
  }
  function showPreview(el, dataURL, onChange, onCamera) {
    el.classList.add("has");
    el.innerHTML = '<img src="' + dataURL + '" alt="Vista previa">' +
      '<div class="dz-actions no-print"><button type="button" class="btn btn-sm btn-outline-dark" data-change>' + ic("refresh", 14) + " Cambiar</button>" +
      (onCamera ? '<button type="button" class="btn btn-sm btn-soft" data-cam>' + ic("camera", 14) + " Tomar otra</button>" : "") + "</div>";
    el.querySelector("[data-change]").addEventListener("click", function (e) { e.stopPropagation(); onChange(); });
    if (onCamera) el.querySelector("[data-cam]").addEventListener("click", function (e) { e.stopPropagation(); onCamera(); });
  }

  /* cámara en vivo (getUserMedia) */
  function openCamera(facing, shape, onCapture) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { IC.toast("Tu navegador no permite usar la cámara aquí. Sube una foto.", "err"); return; }
    var stream = null;
    var bg = IC.modal({
      title: "Tomar foto",
      persistent: true,
      html: '<div class="cam-wrap"><video autoplay playsinline muted></video><div class="cam-frame ' + (shape === "rect" ? "rect" : "") + '"></div></div><p class="small mt-8 text-muted">Centra el ' + (shape === "rect" ? "documento" : "rostro") + " dentro del marco y captura.</p>",
      actions: [
        { label: "Cancelar", cls: "btn-outline-dark", onClick: stop },
        { label: "📸 Capturar", onClick: function () {
            var video = bg.querySelector("video");
            var c = document.createElement("canvas"); c.width = video.videoWidth || 1280; c.height = video.videoHeight || 960;
            c.getContext("2d").drawImage(video, 0, 0, c.width, c.height);
            stop();
            IC.compressImage(c.toDataURL("image/jpeg", 0.9), 1100, 0.8).then(onCapture);
          } }
      ]
    });
    function stop() { if (stream) stream.getTracks().forEach(function (t) { t.stop(); }); stream = null; }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: facing || "environment" }, audio: false })
      .then(function (s) { stream = s; bg.querySelector("video").srcObject = s; })
      .catch(function () { IC.closeModal(); IC.toast("No se pudo acceder a la cámara. Sube una foto desde tu galería.", "err"); });
  }

  /* editor de censura (tapar datos sensibles) */
  function maskEditor(container, dataURL, onDone, onCancel) {
    container.innerHTML =
      '<div class="mask-editor"><canvas></canvas>' +
      '<div class="mask-tools"><span class="hint">🖌️ Arrastra sobre los números para taparlos. Deja visibles tu <b>nombre</b> y los <b>últimos 4 dígitos</b>.</span>' +
      '<div class="row"><button type="button" class="btn btn-sm btn-outline-dark" data-undo>Deshacer</button><button type="button" class="btn btn-sm btn-outline-dark" data-clear>Limpiar</button><button type="button" class="btn btn-sm btn-outline-dark" data-cancel>Cancelar</button><button type="button" class="btn btn-sm btn-primary" data-done>' + ic("check", 14) + " Listo</button></div></div></div>";
    var canvas = container.querySelector("canvas"), ctx = canvas.getContext("2d");
    var img = new Image(), rects = [], drawing = null;
    img.onload = function () { canvas.width = img.width; canvas.height = img.height; redraw(); };
    img.src = dataURL;
    function redraw(preview) {
      ctx.drawImage(img, 0, 0);
      ctx.fillStyle = "#0b0f0d";
      rects.concat(preview ? [preview] : []).forEach(function (r) { ctx.fillRect(r.x, r.y, r.w, r.h); });
      if (preview) { ctx.strokeStyle = "#22c55e"; ctx.lineWidth = 3; ctx.strokeRect(preview.x, preview.y, preview.w, preview.h); }
    }
    function pos(e) {
      var r = canvas.getBoundingClientRect();
      return { x: (e.clientX - r.left) * canvas.width / r.width, y: (e.clientY - r.top) * canvas.height / r.height };
    }
    function norm(a, b) { return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) }; }
    canvas.addEventListener("pointerdown", function (e) { canvas.setPointerCapture(e.pointerId); drawing = pos(e); });
    canvas.addEventListener("pointermove", function (e) { if (drawing) redraw(norm(drawing, pos(e))); });
    canvas.addEventListener("pointerup", function (e) {
      if (!drawing) return;
      var r = norm(drawing, pos(e)); drawing = null;
      // Un arrastre casi recto sobre los numeros es lo natural: le damos
      // grosor minimo para que tape de verdad en vez de ignorarlo.
      if (r.w > 8 || r.h > 8) {
        if (r.h < 16) { r.y = Math.max(0, r.y - 8); r.h = 16; }
        if (r.w < 16) { r.x = Math.max(0, r.x - 8); r.w = 16; }
        rects.push(r);
      }
      redraw();
    });
    container.querySelector("[data-undo]").addEventListener("click", function () { rects.pop(); redraw(); });
    container.querySelector("[data-clear]").addEventListener("click", function () { rects = []; redraw(); });
    container.querySelector("[data-cancel]").addEventListener("click", onCancel);
    function terminar() {
      redraw();
      IC.compressImage(canvas.toDataURL("image/jpeg", 0.85), 1100, 0.8).then(onDone);
    }
    container.querySelector("[data-done]").addEventListener("click", function () {
      if (rects.length) { terminar(); return; }
      // Sin confirm() del navegador: algunos lo bloquean y el editor se quedaba trabado.
      IC.modal({
        title: "No tapaste ningún dato",
        html: "<p>Por tu seguridad conviene tapar el número completo de la tarjeta, la fecha de vencimiento y el CVV. " +
              "Deja visibles solo tu <b>nombre</b> y los <b>últimos 4 dígitos</b>.</p>" +
              '<p class="muted mt-8">Arrastra el dedo o el mouse por encima de los números para taparlos.</p>',
        actions: [
          { label: "Volver a taparlos", cls: "btn-primary" },
          { label: "Continuar así", cls: "btn-outline-dark", onClick: terminar }
        ]
      });
    });
  }

  /* =====================================================================
     VISTAS
  ===================================================================== */

  /* ---------- INICIO ---------- */
  function viewHome() {
    var ob = IC.onboarding(user);
    var total = user.ops.filter(function (o) { return o.status !== "cancelada"; }).reduce(function (s, o) { return s + o.amount; }, 0);
    var completed = user.ops.filter(function (o) { return o.status === "completada"; }).length;
    var active = user.ops.filter(function (o) { return o.status === "activa" || o.status === "pend_pago"; }).length;
    var recent = user.ops.slice().sort(function (a, b) { return b.createdAt - a.createdAt; }).slice(0, 5);
    var pending = ob.total - ob.completed;

    var html =
      '<div class="banner"><div><div class="greet">' + esc(IC.greeting()) + '</div><h2>' + esc(fullName()) + '</h2><div class="sub">' + (pending ? "Completa tu perfil para efectivizar tu tarjeta." : "Tu cuenta está lista. ¡Crea una operación cuando quieras!") + '</div></div>' +
      '<a href="#/operacion" class="btn btn-white">' + ic("plus", 16) + " Nueva Operación</a></div>";

    if (pending) {
      html += '<div class="card onboard"><div class="onboard-top"><div class="mascot"><img src="' + esc(CFG.brand.icon || "assets/logo-icon.png") + '" alt=""></div><div><b>Te ' + (pending === 1 ? "falta 1 paso" : "faltan " + pending + " pasos") + '</b><div class="small text-muted">' + (user.identity.status === "review" ? "Mientras revisamos tu identidad, ya puedes ir registrando tu tarjeta." : "Sigue estos pasos para realizar tu primera operación.") + "</div></div></div>" +
        '<div class="row between mt-16 small"><span>' + ob.completed + " de " + ob.total + ' completados</span><b>' + ob.pct + '%</b></div><div class="progress"><i id="obProgress"></i></div><div class="todo">';
      var nextFound = false;
      ob.steps.forEach(function (s, i) {
        var cls = s.done ? "done" : (s.review ? "review" : (!nextFound ? "next" : ""));
        if (!s.done && !s.review && !nextFound) nextFound = true;
        html += '<div class="todo-item ' + cls + '"><div class="num">' + (s.done ? "✓" : (s.review ? "⏳" : i + 1)) + '</div><div><b>' + esc(s.title) + "</b><span>" + esc(s.desc) + "</span></div>" +
          (!s.done && !s.review ? '<a href="' + s.route + '" class="btn btn-sm ' + (cls === "next" ? "btn-primary" : "btn-outline-dark") + '">' + esc(s.cta) + " ›</a>" : "") + "</div>";
      });
      html += "</div></div>";
    } else {
      html += '<div class="note green mt-16">' + ic("check", 18) + '<div><b>¡Perfil completo!</b> Tu identidad está verificada y tienes tarjeta y cuenta registradas.</div></div>';
    }

    html += '<div class="stat-cards">' +
      '<div class="card stat"><div class="ic">' + ic("dollar", 20) + '</div><span class="chip">' + user.ops.length + ' OPS</span><div class="lbl">TOTAL OPERADO</div><div class="val">' + IC.money(total) + "</div></div>" +
      '<div class="card stat"><div class="ic blue">' + ic("check", 20) + '</div><div class="lbl">COMPLETADAS</div><div class="val">' + completed + "</div></div>" +
      '<div class="card stat"><div class="ic amber">' + ic("clock", 20) + '</div><div class="lbl">OPS. ACTIVAS</div><div class="val">' + active + "</div></div></div>";

    html += '<div class="dash-grid"><div class="card"><div class="card-h"><div><h3>Operaciones recientes</h3><p>Historial de tus últimas transacciones</p></div><a href="#/historial" class="small text-green">Ver todas ›</a></div>' +
      (recent.length ? '<div class="list">' + recent.map(opRow).join("") + "</div>" : emptyState("swap", "Sin operaciones todavía", "Realiza tu primera operación y aparecerá aquí", '<a href="#/operacion" class="btn btn-primary btn-sm">' + ic("plus", 14) + " Nueva operación</a>")) + "</div>" +
      '<div><div class="card"><div class="card-h"><h3>Mis tarjetas</h3><a href="#/tarjetas/nueva" class="icon-btn" title="Agregar">' + ic("plus", 16) + "</a></div>" +
      (user.cards.length ? '<div class="list">' + user.cards.slice(0, 3).map(function (c) { return '<div class="list-item">' + bankDot(c.bank) + '<div class="body"><b>' + esc(c.bank) + " •••• " + esc(c.last4) + "</b><span>" + esc(c.brand || "") + "</span></div>" + statusBadge(c.status) + "</div>"; }).join("") + "</div>" : emptyState("card", "Sin tarjetas registradas", "", '<a href="#/tarjetas/nueva" class="small text-green">Agregar tarjeta</a>')) + "</div>" +
      '<div class="card mt-16"><div class="card-h"><h3>Mis cuentas</h3><a href="#/cuentas/nueva" class="icon-btn" title="Agregar">' + ic("plus", 16) + "</a></div>" +
      (user.accounts.length ? '<div class="list">' + user.accounts.slice(0, 3).map(function (a) { return '<div class="list-item">' + bankDot(a.bank) + '<div class="body"><b>' + esc(a.bank) + "</b><span>" + esc(a.type) + " · " + esc(a.number) + "</span></div></div>"; }).join("") + "</div>" : emptyState("bank", "Sin cuentas registradas", "", '<a href="#/cuentas/nueva" class="small text-green">Agregar cuenta</a>')) + "</div></div></div>";

    return { title: "Inicio", html: html, mount: function () { setTimeout(function () { var p = document.getElementById("obProgress"); if (p) p.style.width = ob.pct + "%"; }, 80); } };
  }
  function opRow(o) {
    var card = cardById(o.cardId);
    return '<a href="#/operacion/' + o.id + '" class="list-item"><div class="ic">' + ic(o.type === "autopago" ? "card" : "swap", 18) + '</div><div class="body"><b>' + opTypeLabel(o.type) + " · " + esc(o.code) + "</b><span>" + (card ? esc(card.bank) + " •••• " + esc(card.last4) + " · " : "") + IC.fmtDateTime(o.createdAt) + '</span></div><div class="amt">' + IC.money(o.amount) + "<small>recibes " + IC.money(o.net) + "</small></div>" + statusBadge(o.status) + "</a>";
  }

  /* ---------- IDENTIFICACIÓN ---------- */
  function viewIdentity() {
    var idn = user.identity;
    if (idn.status === "review" || idn.status === "verified") {
      var html = '<div class="wizard"><div class="card"><div class="wz-h"><div class="ic">' + ic("shield", 24) + '</div><h3>Verificación de identidad</h3><p>' + (idn.status === "verified" ? "Tu identidad fue verificada. ¡Ya puedes operar!" : "Recibimos tus documentos. Los revisamos en horario de " + esc(P.verificationHours || "oficina") + ".") + "</p></div>" +
        '<div style="text-align:center">' + statusBadge(idn.status) + '<div class="small text-muted mt-8">Enviado: ' + IC.fmtDateTime(idn.submittedAt) + "</div></div>" +
        '<div class="doc-grid mt-24">' + [["front", "DNI frontal"], ["back", "DNI posterior"], ["selfie", "Selfie"]].map(function (k) { return '<figure class="doc-thumb"><div class="doc-img"><img src="' + idn[k[0]] + '" alt="' + k[1] + '"></div><figcaption>' + k[1] + "</figcaption></figure>"; }).join("") + "</div>" +
        '<div class="wz-actions"><a href="#/inicio" class="btn btn-outline-dark">← Volver al inicio</a>' + (idn.status === "review" ? '<button class="btn btn-soft" id="resend">Volver a enviar fotos</button>' : "") + "</div></div></div>";
      return { title: "Identificación", html: html, mount: function (el) {
        var r = el.querySelector("#resend");
        if (r) r.addEventListener("click", function () { IC.auth.update(function (u) { u.identity.status = "pending"; }); navigate(); });
      } };
    }

    var steps = [
      { key: "front", title: "Documento – Parte frontal", sub: "Sube una foto clara del frente de tu documento de identidad", capture: "environment", shape: "rect", tips: ["Enfocada", "Sin brillos", "Bordes visibles", "No capturas de pantalla"] },
      { key: "back", title: "Documento – Parte posterior", sub: "Ahora la parte de atrás de tu documento", capture: "environment", shape: "rect", tips: ["Enfocada", "Sin brillos", "Bordes visibles", "No capturas de pantalla"] },
      { key: "selfie", title: "Selfie de verificación", sub: "Tómate una foto con buena iluminación, sin lentes ni gorra", capture: "user", shape: "face", tips: ["Rostro completo", "Buena luz", "Sin lentes ni gorra", "Solo tú en la foto"] }
    ];
    var data = { front: idn.front, back: idn.back, selfie: idn.selfie };
    var step = 0;
    var html = '<div class="wizard"><div class="wizard-top"><button class="icon-btn" id="wzBack">' + ic("left", 16) + '</button><div class="wz-steps">' + steps.map(function (s, i) { return '<div class="wz-step" data-i="' + i + '"><i>' + (i + 1) + "</i>" + ["FRONTAL", "POSTERIOR", "SELFIE"][i] + "</div>" + (i < 2 ? '<div class="wz-line"></div>' : ""); }).join("") + '</div><span class="small text-green" id="wzLabel"></span></div><div class="card" id="wzBody"></div></div>';

    return { title: "Identificación", html: html, mount: function (el) {
      var body = el.querySelector("#wzBody");
      function render() {
        var s = steps[step];
        el.querySelector("#wzLabel").textContent = "Paso " + (step + 1) + " de 3";
        el.querySelectorAll(".wz-step").forEach(function (w, i) { w.className = "wz-step" + (i < step ? " done" : i === step ? " active" : ""); });
        el.querySelectorAll(".wz-line").forEach(function (l, i) { l.classList.toggle("done", i < step); });
        body.innerHTML = '<div class="wz-h"><div class="ic">' + ic(s.key === "selfie" ? "user" : "id", 24) + "</div><h3>" + esc(s.title) + "</h3><p>" + esc(s.sub) + "</p></div>" +
          '<div class="note green">' + ic("shield", 18) + "<div><b>Tu información está protegida.</b> Tus fotos se usan únicamente para verificar tu identidad.</div></div>" +
          '<div class="mt-16">' + dropzoneHTML("dz", s.key === "selfie" ? "Sube tu selfie o usa la cámara" : "Arrastra o toca para subir la foto", "JPG o PNG · Máx. 10MB", s.capture) + "</div>" +
          '<div class="dz-actions"><button type="button" class="btn btn-sm btn-soft" id="camBtn">' + ic("camera", 14) + " Usar cámara</button></div>" +
          '<div class="tips"><b>ASEGÚRATE QUE LA FOTO ESTÉ:</b><div class="tips-grid">' + s.tips.map(function (t) { return '<div class="tip">' + ic("check", 14) + esc(t) + "</div>"; }).join("") + "</div></div>" +
          '<div class="wz-actions"><button type="button" class="btn btn-outline-dark" id="prev"' + (step === 0 ? " disabled" : "") + '>← Atrás</button><span class="mid">' + (step === 2 ? "Al enviar, revisamos tus datos en menos de 24h" : "Puedes cambiar la foto antes de continuar") + '</span><button type="button" class="btn btn-primary" id="next" disabled>' + (step === 2 ? "Enviar para revisión ✓" : "Continuar →") + "</button></div>";
        var dz = body.querySelector("#dz"), next = body.querySelector("#next");
        function setImage(d) { data[s.key] = d; showPreview(dz, d, function () { data[s.key] = null; render(); }, function () { openCamera(s.capture, s.shape, setImage); }); next.disabled = false; }
        bindDropzone(dz, setImage);
        if (data[s.key]) setImage(data[s.key]);
        body.querySelector("#camBtn").addEventListener("click", function () { openCamera(s.capture, s.shape, setImage); });
        body.querySelector("#prev").addEventListener("click", function () { if (step > 0) { step--; render(); } });
        next.addEventListener("click", async function () {
          if (!data[s.key]) return;
          if (step < 2) { step++; render(); return; }
          next.disabled = true; next.textContent = "Enviando...";
          try {
            if (NUBE) { user = await IC.cloud.enviarIdentidad(data, user); }
            else {
              IC.auth.update(function (u) { u.identity = { front: data.front, back: data.back, selfie: data.selfie, status: "review", submittedAt: Date.now() }; });
              if (IC.backend) { try { IC.backend.identidad(IC.auth.current(), data); } catch (e) {} }
              refreshUser();
            }
          } catch (err) {
            next.disabled = false; next.textContent = "Enviar para revisión ✓";
            IC.toast("No se pudieron enviar las fotos. Revisa tu conexión.", "err"); return;
          }
          notify("Documentos recibidos", "Estamos verificando tu identidad. Te avisaremos cuando esté lista.");
          IC.confetti();
          body.innerHTML = '<div style="text-align:center;padding:20px 0"><div class="success-anim">' + ic("check", 40) + '</div><h3>¡Documentos enviados!</h3><p class="text-muted mt-8">Revisaremos tu identidad en horario de ' + esc(P.verificationHours || "oficina") + '.<br>Mientras tanto, ya puedes registrar tu tarjeta.</p><div class="row mt-24" style="justify-content:center"><a href="#/tarjetas/nueva" class="btn btn-primary">Registrar mi tarjeta →</a><a href="#/inicio" class="btn btn-outline-dark">Ir al inicio</a></div></div>';
          renderShell();
        });
      }
      el.querySelector("#wzBack").addEventListener("click", function () { if (step > 0) { step--; render(); } else location.hash = "#/inicio"; });
      render();
    } };
  }

  /* ---------- TARJETAS ---------- */
  function viewCards() {
    var html = '<div class="page-h"><div class="left"><a href="#/inicio" class="icon-btn">' + ic("left", 16) + '</a><div><h2>Mis Tarjetas de Crédito</h2><p>' + user.cards.length + " de " + (P.maxCards || 30) + ' tarjetas registradas</p></div></div><a href="#/tarjetas/nueva" class="btn btn-primary">' + ic("plus", 16) + " Agregar Tarjeta de Crédito</a></div>";
    if (!user.cards.length) html += '<div class="card">' + emptyState("card", "Sin tarjetas de crédito registradas", "Agrega tu primera tarjeta de crédito para comenzar a realizar operaciones", '<a href="#/tarjetas/nueva" class="btn btn-primary">' + ic("plus", 16) + " Agregar Tarjeta de Crédito</a>") + "</div>";
    else html += '<div class="cards-grid">' + user.cards.map(function (c) {
      return '<div class="card-item"><div class="cc" style="background:radial-gradient(110% 120% at 100% 0%, ' + IC.bankColor(c.bank) + '55 0%, #0f1613 55%, var(--black) 100%)"><div class="bank">' + esc(c.bank).toUpperCase() + (c.primary ? ' · PRINCIPAL' : "") + '</div><div class="chipc"></div><div class="num"><span>••••</span><span>••••</span><span>••••</span><i class="ok">' + esc(c.last4) + '</i></div><div class="meta"><span>' + esc(c.brand || "") + '</span><span>Pago día ' + esc(c.payDay || "-") + '</span></div><div class="holder">' + esc(c.holder).toUpperCase() + '</div></div>' +
        '<div class="foot">' + statusBadge(c.status) + '<div class="row"><button class="btn btn-sm btn-outline-dark" data-view="' + c.id + '">Ver foto</button><button class="btn btn-sm btn-danger" data-del="' + c.id + '">' + ic("trash", 14) + "</button></div></div></div>";
    }).join("") + "</div>";
    html += '<div class="note blue mt-24">' + ic("info", 18) + "<div><b>Ten en cuenta:</b> nuestro equipo verifica tarjetas en horario de " + esc(P.verificationHours || "oficina") + ". Si registraste fuera de este horario, tu tarjeta será verificada al siguiente día hábil.</div></div>";
    return { title: "Mis Tarjetas", html: html, mount: function (el) {
      el.querySelectorAll("[data-del]").forEach(function (b) { b.addEventListener("click", function () {
        IC.modal({ title: "Eliminar tarjeta", text: "¿Deseas eliminar esta tarjeta? Podrás registrarla nuevamente.", actions: [{ label: "Cancelar", cls: "btn-outline-dark" }, { label: "Eliminar", cls: "btn-danger", onClick: function () { IC.auth.update(function (u) { u.cards = u.cards.filter(function (c) { return c.id !== b.dataset.del; }); }); IC.toast("Tarjeta eliminada"); navigate(); } }] });
      }); });
      el.querySelectorAll("[data-view]").forEach(function (b) { b.addEventListener("click", function () {
        var c = cardById(b.dataset.view);
        IC.modal({ title: "Foto registrada (datos censurados)", html: '<img src="' + c.photoFront + '" style="width:100%;border-radius:12px">' + (c.photoBack ? '<img src="' + c.photoBack + '" style="width:100%;border-radius:12px;margin-top:10px">' : "") });
      }); });
    } };
  }

  function viewAddCard() {
    if (user.cards.length >= (P.maxCards || 30)) { IC.toast("Alcanzaste el máximo de tarjetas.", "err"); location.hash = "#/tarjetas"; return viewCards(); }
    var banks = P.banks || [];
    var state = { bank: "", brand: (P.cardBrands || [])[0] || "Visa", last4: "", holder: "", payDay: "", primary: user.cards.length === 0, front: null, back: null };
    var html = '<div class="wizard" style="max-width:1000px"><div class="page-h"><div class="left"><a href="#/tarjetas" class="icon-btn">' + ic("left", 16) + '</a><div><h2>Agregar Tarjeta de Crédito</h2><p>Registra una nueva tarjeta de crédito</p></div></div><button class="btn btn-soft btn-sm" id="howBtn">❓ ¿Cómo lleno esto?</button></div>' +
      '<div class="card"><div class="grid-2" style="gap:28px"><div>' +
      '<b class="small" style="letter-spacing:.08em">FOTO DEL LADO FRONTAL DE LA TARJETA</b>' +
      '<div class="note amber mt-8">' + ic("info", 16) + "<div>Si tu tarjeta no tiene tu nombre impreso como titular, adjunta también un <b>estado de cuenta</b> o el contrato para validar la titularidad.</div></div>" +
      '<div class="calc mt-16"><b class="small">Antes de tomar la foto:</b><div class="small mt-8">✔ Deja visibles solo tus nombres y los últimos 4 dígitos.</div><div class="small">✔ Con nuestro editor puedes <b>tapar los datos sensibles</b> directamente en la foto.</div></div>' +
      '<div class="cc mt-16" id="ccPreview"></div>' +
      '<div class="legend"><div class="r"><i></i><b>Rojo:</b> tápalo, no debe verse en la foto.</div><div class="g"><i></i><b>Verde:</b> déjalo visible en la foto.</div></div>' +
      '<div class="mt-16" id="frontWrap">' + dropzoneHTML("dzFront", "Sube o toma la foto frontal", "Luego podrás tapar los datos sensibles", "environment") + "</div>" +
      '<div class="dz-actions"><button type="button" class="btn btn-sm btn-soft" id="camFront">' + ic("camera", 14) + " Usar cámara</button></div>" +
      "</div><div>" +
      '<div class="field"><label>Banco</label><div class="bank-select" id="bankSel">' + banks.map(function (b) { return '<div class="bank-opt" data-bank="' + esc(b.name) + '">' + bankDot(b.name) + esc(b.name) + "</div>"; }).join("") + "</div></div>" +
      '<div class="grid-2"><div class="field"><label>Marca</label><select id="brand">' + (P.cardBrands || []).map(function (b) { return "<option>" + esc(b) + "</option>"; }).join("") + '</select></div><div class="field"><label>Últimos 4 dígitos</label><input id="last4" inputmode="numeric" maxlength="4" placeholder="Ej. 4598"><span class="hint">Solo los últimos 4</span></div></div>' +
      '<div class="field"><label>Nombre del titular (como figura en la tarjeta)</label><input id="holder" placeholder="Escribe el nombre impreso en tu tarjeta" autocomplete="off"></div>' +
      '<div class="field"><label>Día de pago</label><input id="payDay" inputmode="numeric" maxlength="2" placeholder="Ej. 15"><span class="hint">Día del mes en que vence el pago</span></div>' +
      '<label class="check"><input type="checkbox" id="primary"' + (state.primary ? " checked" : "") + '> Usar como tarjeta de crédito principal</label>' +
      '<button class="btn btn-primary btn-block btn-lg mt-24" id="saveCard" disabled>Registrar Tarjeta de Crédito</button>' +
      '<hr style="border:none;border-top:1px solid var(--line);margin:26px 0">' +
      '<b class="small" style="letter-spacing:.08em">FOTO DEL LADO POSTERIOR (opcional)</b><div class="mt-8" id="backWrap">' + dropzoneHTML("dzBack", "O sube la foto posterior", "Tapa el CVV con el editor", "environment") + "</div>" +
      "</div></div></div>" +
      '<div class="note blue mt-16">' + ic("info", 18) + "<div><b>Ten en cuenta:</b> verificamos tarjetas en horario de " + esc(P.verificationHours || "oficina") + ". Fuera de ese horario, se verifica el siguiente día hábil.</div></div></div>";

    return { title: "Mis Tarjetas", html: html, mount: function (el) {
      var cc = el.querySelector("#ccPreview");
      function renderCC() {
        cc.innerHTML = '<div class="bank">' + (state.bank ? esc(state.bank).toUpperCase() : "TU BANCO") + '</div><div class="chipc"></div><div class="num"><i>••••</i><i>••••</i><i>••••</i><i class="ok">' + (state.last4 ? esc(state.last4) : "•598") + '</i></div><div class="meta"><span>VENC<i>••/••</i></span><span>CVV<i>•••</i></span></div><div class="holder">' + (state.holder ? esc(state.holder).toUpperCase() : "NOMBRE DEL TITULAR") + "</div>";
      }
      function validate() { el.querySelector("#saveCard").disabled = !(state.bank && /^\d{4}$/.test(state.last4) && state.holder.trim().length > 2 && state.front); }
      el.querySelectorAll(".bank-opt").forEach(function (b) { b.addEventListener("click", function () { el.querySelectorAll(".bank-opt").forEach(function (x) { x.classList.remove("active"); }); b.classList.add("active"); state.bank = b.dataset.bank; renderCC(); validate(); }); });
      el.querySelector("#brand").addEventListener("change", function () { state.brand = this.value; });
      el.querySelector("#last4").addEventListener("input", function () { this.value = this.value.replace(/\D/g, "").slice(0, 4); state.last4 = this.value; renderCC(); validate(); });
      el.querySelector("#holder").addEventListener("input", function () { state.holder = this.value; renderCC(); validate(); });
      el.querySelector("#payDay").addEventListener("input", function () { this.value = this.value.replace(/\D/g, "").slice(0, 2); state.payDay = this.value; });
      el.querySelector("#primary").addEventListener("change", function () { state.primary = this.checked; });
      renderCC();

      function setupPhoto(key, wrapId, dzId, label, hint) {
        var wrap = el.querySelector("#" + wrapId);
        function fresh() {
          wrap.innerHTML = dropzoneHTML(dzId, label, hint, "environment");
          bindDropzone(wrap.querySelector("#" + dzId), function (data) { maskEditor(wrap, data, function (masked) { state[key] = masked; showDone(masked); validate(); }, fresh); });
        }
        function showDone(masked) {
          wrap.innerHTML = '<div class="dropzone has"><img src="' + masked + '"><div class="dz-actions"><span class="status verified">DATOS CENSURADOS ✓</span><button type="button" class="btn btn-sm btn-outline-dark" data-redo>Cambiar</button></div></div>';
          wrap.querySelector("[data-redo]").addEventListener("click", function () { state[key] = null; validate(); fresh(); });
        }
        fresh();
        return { open: function (data) { maskEditor(wrap, data, function (masked) { state[key] = masked; showDone(masked); validate(); }, fresh); } };
      }
      var front = setupPhoto("front", "frontWrap", "dzFront", "Sube o toma la foto frontal", "Luego podrás tapar los datos sensibles");
      setupPhoto("back", "backWrap", "dzBack", "O sube la foto posterior", "Tapa el CVV con el editor");
      el.querySelector("#camFront").addEventListener("click", function () { openCamera("environment", "rect", front.open); });

      el.querySelector("#howBtn").addEventListener("click", function () {
        IC.modal({ title: "¿Cómo registro mi tarjeta?", html: "<ol style='padding-left:18px;font-size:.9rem;line-height:1.7'><li>Elige tu banco y escribe los <b>últimos 4 dígitos</b>.</li><li>Sube la foto frontal de la tarjeta.</li><li>En el editor, <b>arrastra sobre los números</b> para taparlos (deja visible tu nombre y los últimos 4).</li><li>Presiona <b>Listo</b> y luego <b>Registrar</b>.</li></ol><p class='small mt-8'>Nunca te pediremos el CVV ni tu clave.</p>" });
      });
      el.querySelector("#saveCard").addEventListener("click", async function () {
        var btn = this; btn.disabled = true; btn.textContent = "Registrando...";
        var nueva = { id: IC.uid("c"), bank: state.bank, brand: state.brand, last4: state.last4,
                      holder: state.holder.trim(), payDay: state.payDay, primary: state.primary,
                      photoFront: state.front, photoBack: state.back, status: "review", createdAt: Date.now() };
        try {
          if (NUBE) { user = await IC.cloud.agregarTarjeta(nueva, user); }
          else {
            IC.auth.update(function (u) {
              if (state.primary) u.cards.forEach(function (c) { c.primary = false; });
              u.cards.push(nueva);
            });
            if (IC.backend) { try { var uu = IC.auth.current(); IC.backend.tarjeta(uu, uu.cards[uu.cards.length - 1]); } catch (e) {} }
            refreshUser();
          }
        } catch (err) {
          btn.disabled = false; btn.textContent = "Registrar Tarjeta de Crédito";
          IC.toast("No se pudo registrar la tarjeta. Revisa tu conexión.", "err"); return;
        }
        notify("Tarjeta registrada", state.bank + " •••• " + state.last4 + " está en verificación.");
        IC.confetti(); IC.toast("Tarjeta registrada. La verificaremos pronto.");
        setTimeout(function () { location.hash = "#/tarjetas"; }, 700);
      });
    } };
  }

  /* ---------- CUENTAS ---------- */
  function viewAccounts() {
    var html = '<div class="page-h"><div class="left"><a href="#/inicio" class="icon-btn">' + ic("left", 16) + '</a><div><h2>Mis Cuentas</h2><p>' + user.accounts.length + " de " + (P.maxAccounts || 10) + ' cuentas registradas</p></div></div><a href="#/cuentas/nueva" class="btn btn-primary">' + ic("plus", 16) + " Agregar Cuenta</a></div>";
    html += '<div class="card">' + (user.accounts.length ? '<div class="list">' + user.accounts.map(function (a) {
      return '<div class="list-item">' + bankDot(a.bank) + '<div class="body"><b>' + esc(a.bank) + " · " + esc(a.type) + (a.primary ? ' <span class="status verified">PRINCIPAL</span>' : "") + "</b><span>N.° " + esc(a.number) + (a.cci ? " · CCI " + esc(a.cci) : "") + " · " + esc(a.holder) + '</span></div><button class="btn btn-sm btn-danger" data-del="' + a.id + '">' + ic("trash", 14) + "</button></div>";
    }).join("") + "</div>" : emptyState("bank", "Sin cuentas registradas", "Agrega tu primera cuenta bancaria para agilizar tus operaciones", '<a href="#/cuentas/nueva" class="btn btn-primary">' + ic("plus", 16) + " Agregar Cuenta</a>")) + "</div>";
    return { title: "Mis Cuentas", html: html, mount: function (el) {
      el.querySelectorAll("[data-del]").forEach(function (b) { b.addEventListener("click", function () {
        IC.modal({ title: "Eliminar cuenta", text: "¿Deseas eliminar esta cuenta bancaria?", actions: [{ label: "Cancelar", cls: "btn-outline-dark" }, { label: "Eliminar", cls: "btn-danger", onClick: function () { IC.auth.update(function (u) { u.accounts = u.accounts.filter(function (a) { return a.id !== b.dataset.del; }); }); IC.toast("Cuenta eliminada"); navigate(); } }] });
      }); });
    } };
  }
  function viewAddAccount() {
    var banks = P.banks || [];
    var html = '<div class="wizard"><div class="page-h"><div class="left"><a href="#/cuentas" class="icon-btn">' + ic("left", 16) + '</a><div><h2>Agregar Cuenta Bancaria</h2><p>Aquí recibirás el dinero de tus operaciones</p></div></div></div>' +
      '<div class="card"><div class="note green">' + ic("shield", 18) + "<div>La cuenta debe estar <b>a tu nombre</b>. No realizamos depósitos a terceros.</div></div>" +
      '<div class="field mt-16"><label>Banco</label><div class="bank-select" id="bankSel">' + banks.map(function (b) { return '<div class="bank-opt" data-bank="' + esc(b.name) + '">' + bankDot(b.name) + esc(b.name) + "</div>"; }).join("") + "</div></div>" +
      '<div class="grid-2"><div class="field"><label>Tipo de cuenta</label><select id="type">' + (P.accountTypes || ["Ahorros", "Corriente"]).map(function (t) { return "<option>" + esc(t) + "</option>"; }).join("") + '</select></div><div class="field"><label>Moneda</label><select id="currency"><option>Soles (S/)</option><option>Dólares (US$)</option></select></div></div>' +
      '<div class="field"><label>Número de cuenta</label><input id="number" inputmode="numeric" placeholder="Ej. 19112345678012"><span class="error">Ingresa el número de cuenta (10 a 20 dígitos)</span></div>' +
      '<div class="field"><label>CCI (código interbancario) <span class="text-muted">— opcional, 20 dígitos</span></label><input id="cci" inputmode="numeric" maxlength="20" placeholder="Ej. 00219100123456780123"></div>' +
      '<div class="field"><label>Titular de la cuenta</label><input id="holder" placeholder="Nombre del titular de la cuenta" autocomplete="off"></div>' +
      '<label class="check"><input type="checkbox" id="primary"' + (user.accounts.length ? "" : " checked") + '> Usar como cuenta principal</label>' +
      '<div class="wz-actions"><a href="#/cuentas" class="btn btn-outline-dark">Cancelar</a><button class="btn btn-primary" id="save" disabled>Guardar cuenta</button></div></div></div>';
    return { title: "Mis Cuentas", html: html, mount: function (el) {
      var bank = "";
      function validate() { el.querySelector("#save").disabled = !(bank && /^\d{10,20}$/.test(el.querySelector("#number").value) && el.querySelector("#holder").value.trim().length > 2); }
      el.querySelectorAll(".bank-opt").forEach(function (b) { b.addEventListener("click", function () { el.querySelectorAll(".bank-opt").forEach(function (x) { x.classList.remove("active"); }); b.classList.add("active"); bank = b.dataset.bank; validate(); }); });
      el.querySelector("#number").addEventListener("input", function () { this.value = this.value.replace(/\D/g, "").slice(0, 20); validate(); });
      el.querySelector("#holder").addEventListener("input", validate);
      el.querySelector("#cci").addEventListener("input", function () { this.value = this.value.replace(/\D/g, "").slice(0, 20); });
      el.querySelector("#save").addEventListener("click", async function () {
        var btn = this; btn.disabled = true; btn.textContent = "Guardando...";
        var primary = el.querySelector("#primary").checked;
        var nueva = { id: IC.uid("a"), bank: bank, type: el.querySelector("#type").value,
                      currency: el.querySelector("#currency").value, number: el.querySelector("#number").value,
                      cci: el.querySelector("#cci").value, holder: el.querySelector("#holder").value.trim(),
                      primary: primary, createdAt: Date.now() };
        try {
          if (NUBE) { user = await IC.cloud.agregarCuenta(nueva, user); }
          else {
            IC.auth.update(function (u) {
              if (primary) u.accounts.forEach(function (a) { a.primary = false; });
              u.accounts.push(nueva);
            });
            if (IC.backend) { try { var ua = IC.auth.current(); IC.backend.cuenta(ua, ua.accounts[ua.accounts.length - 1]); } catch (e) {} }
            refreshUser();
          }
        } catch (err) {
          btn.disabled = false; btn.textContent = "Guardar cuenta";
          IC.toast("No se pudo guardar la cuenta. Revisa tu conexión.", "err"); return;
        }
        IC.toast("Cuenta guardada"); location.hash = "#/cuentas";
      });
    } };
  }

  /* ---------- NUEVA OPERACIÓN ---------- */
  function viewNewOp() {
    var state = { step: 0, type: "efectivizar", cardId: (user.cards.find(function (c) { return c.primary; }) || user.cards[0] || {}).id, accountId: (user.accounts.find(function (a) { return a.primary; }) || user.accounts[0] || {}).id, amount: Math.min(1000, P.maxAmount || 30000) };
    var html = '<div class="wizard" style="max-width:900px"><div class="wizard-top"><div class="wz-steps">' + ["TIPO", "OPERACIÓN", "COMPLETADO"].map(function (l, i) { return '<div class="wz-step"><i>' + (i + 1) + "</i>" + l + "</div>" + (i < 2 ? '<div class="wz-line"></div>' : ""); }).join("") + '</div></div><div class="card" id="body"></div></div>';
    return { title: "Nueva Operación", html: html, mount: function (el) {
      var body = el.querySelector("#body");
      function steps() {
        el.querySelectorAll(".wz-step").forEach(function (w, i) { w.className = "wz-step" + (i < state.step ? " done" : i === state.step ? " active" : ""); });
        el.querySelectorAll(".wz-line").forEach(function (l, i) { l.classList.toggle("done", i < state.step); });
      }
      function render() {
        steps();
        if (state.step === 0) {
          body.innerHTML = '<div class="row between"><div><h3>¿Qué necesitas hacer?</h3><p class="small text-muted">Selecciona el servicio que necesitas</p></div><div style="text-align:right"><b class="text-green small">Paso 1 de 3</b><div class="small text-muted">33% completado</div></div></div>' +
            '<div class="choice-grid mt-24">' +
            '<div class="choice' + (state.type === "efectivizar" ? " active" : "") + '" data-type="efectivizar"><div class="radio"></div><div class="ic">' + ic("banknote", 22) + '</div><h4>Efectivizar el saldo disponible de mi tarjeta de crédito</h4><p>¡El más simple! Tengo saldo disponible en mi tarjeta de crédito y lo necesito en mi cuenta de ahorros.</p></div>' +
            '<div class="choice' + (state.type === "autopago" ? " active" : "") + '" data-type="autopago"><div class="radio"></div><div class="ic">' + ic("card", 22) + '</div><h4>Autopagar la deuda de mi tarjeta con el saldo disponible</h4><p>Tengo que pagar mi tarjeta de crédito y necesito realizar varias efectivizaciones para completarlo.</p></div></div>' +
            '<div class="wz-actions"><a href="#/inicio" class="btn btn-outline-dark">Cancelar</a><span class="mid">Puedes cambiar esto en el siguiente paso</span><button class="btn btn-primary" id="next">Continuar ›</button></div>';
          body.querySelectorAll(".choice").forEach(function (c) { c.addEventListener("click", function () { state.type = c.dataset.type; render(); }); });
          body.querySelector("#next").addEventListener("click", function () { state.step = 1; render(); });
        } else if (state.step === 1) {
          if (!user.cards.length || !user.accounts.length) {
            body.innerHTML = '<div class="wz-h"><div class="ic">' + ic("info", 24) + "</div><h3>Te falta un paso</h3><p>Para operar necesitas al menos una tarjeta y una cuenta bancaria registradas.</p></div>" +
              '<div class="grid-2">' + (user.cards.length ? '<div class="note green">' + ic("check", 16) + "<div>Tarjeta registrada ✓</div></div>" : '<a href="#/tarjetas/nueva" class="note amber">' + ic("card", 16) + "<div><b>Registra tu tarjeta</b><br>La que deseas efectivizar</div></a>") +
              (user.accounts.length ? '<div class="note green">' + ic("check", 16) + "<div>Cuenta registrada ✓</div></div>" : '<a href="#/cuentas/nueva" class="note amber">' + ic("bank", 16) + "<div><b>Agrega tu cuenta</b><br>Donde recibirás el dinero</div></a>") + "</div>" +
              '<div class="wz-actions"><button class="btn btn-outline-dark" id="prev">← Atrás</button></div>';
            body.querySelector("#prev").addEventListener("click", function () { state.step = 0; render(); });
            return;
          }
          var min = P.minAmount || 100, max = P.maxAmount || 30000;
          body.innerHTML = '<div class="row between"><div><h3>' + (state.type === "autopago" ? "Autopago de tarjeta" : "Efectivizar tarjeta") + '</h3><p class="small text-muted">Elige tu tarjeta, tu cuenta y el monto</p></div><div style="text-align:right"><b class="text-green small">Paso 2 de 3</b><div class="small text-muted">66% completado</div></div></div>' +
            '<div class="grid-2 mt-24"><div><div class="field"><label>Tarjeta de crédito a usar</label><div class="list" id="cards">' + user.cards.map(function (c) { return '<div class="list-item choice-item' + (c.id === state.cardId ? " active" : "") + '" data-card="' + c.id + '" style="cursor:pointer;' + (c.id === state.cardId ? "border-color:var(--green);background:#f0fdf4" : "") + '">' + bankDot(c.bank) + '<div class="body"><b>' + esc(c.bank) + " •••• " + esc(c.last4) + "</b><span>" + esc(c.brand || "") + "</span></div>" + statusBadge(c.status) + "</div>"; }).join("") + "</div></div>" +
            '<div class="field"><label>' + (state.type === "autopago" ? "Cuenta desde donde pagarás" : "Cuenta donde recibirás el dinero") + '</label><div class="list" id="accounts">' + user.accounts.map(function (a) { return '<div class="list-item' + (a.id === state.accountId ? " active" : "") + '" data-acc="' + a.id + '" style="cursor:pointer;' + (a.id === state.accountId ? "border-color:var(--green);background:#f0fdf4" : "") + '">' + bankDot(a.bank) + '<div class="body"><b>' + esc(a.bank) + " · " + esc(a.type) + "</b><span>" + esc(a.number) + "</span></div></div>"; }).join("") + "</div></div></div>" +
            '<div><div class="field"><label>Monto a efectivizar (S/)</label><input id="amount" type="number" min="' + min + '" max="' + max + '" step="50" value="' + state.amount + '"><input type="range" class="range" id="range" min="' + min + '" max="' + max + '" step="50" value="' + state.amount + '"><span class="hint">Mínimo ' + IC.money(min) + " · Máximo " + IC.money(max) + '</span></div>' +
            '<div class="calc" id="calc"></div>' +
            '<div class="note blue mt-16">' + ic("info", 16) + "<div>" + esc(P.depositMessage || "") + "</div></div></div></div>" +
            '<div class="wz-actions"><button class="btn btn-outline-dark" id="prev">← Atrás</button><span class="mid">Revisa el monto antes de confirmar</span><button class="btn btn-primary" id="next">Confirmar operación ›</button></div>';
          function calc() {
            var a = Math.max(min, Math.min(max, Number(body.querySelector("#amount").value) || 0));
            state.amount = a;
            var c = IC.commission(a);
            body.querySelector("#calc").innerHTML = '<div class="r"><span>Monto a cargar en tu tarjeta</span><b>' + IC.money(a) + '</b></div><div class="r"><span>Comisión (' + c.pct + '%)</span><b>- ' + IC.money(c.commission) + '</b></div><div class="r total"><span>' + (state.type === "autopago" ? "Se abona a tu tarjeta" : "Recibes en tu cuenta") + '</span><span class="v">' + IC.money(c.net) + "</span></div>";
          }
          body.querySelector("#amount").addEventListener("input", function () { body.querySelector("#range").value = this.value; calc(); });
          body.querySelector("#range").addEventListener("input", function () { body.querySelector("#amount").value = this.value; calc(); });
          body.querySelectorAll("[data-card]").forEach(function (x) { x.addEventListener("click", function () { state.cardId = x.dataset.card; render(); }); });
          body.querySelectorAll("[data-acc]").forEach(function (x) { x.addEventListener("click", function () { state.accountId = x.dataset.acc; render(); }); });
          body.querySelector("#prev").addEventListener("click", function () { state.step = 0; render(); });
          body.querySelector("#next").addEventListener("click", async function () {
            calc();
            if (!state.cardId || !state.accountId) { IC.toast("Selecciona una tarjeta y una cuenta.", "err"); return; }
            var btn = this; btn.disabled = true; btn.textContent = "Creando...";
            var c = IC.commission(state.amount);
            var op = { id: IC.uid("op"), code: IC.opCode(), type: state.type, cardId: state.cardId, accountId: state.accountId, amount: state.amount, commissionPct: c.pct, commission: c.commission, net: c.net, status: "pend_pago", createdAt: Date.now(), history: [{ at: Date.now(), status: "pend_pago", text: "Operación creada" }] };
            try {
              if (NUBE) {
                user = await IC.cloud.crearOperacion(op, cardById(op.cardId), accountById(op.accountId), user);
                var creada = user.ops.filter(function (o) { return o.code === op.code; })[0];
                if (creada) op = creada;
              } else {
                IC.auth.update(function (u) { u.ops.push(op); });
                if (IC.backend) { try { IC.backend.operacion(IC.auth.current(), op, cardById(op.cardId), accountById(op.accountId)); } catch (e) {} }
                refreshUser();
              }
            } catch (err) {
              btn.disabled = false; btn.textContent = "Confirmar operación ›";
              IC.toast("No se pudo crear la operación. Revisa tu conexión.", "err"); return;
            }
            notify("Operación " + op.code + " creada", "Realiza el pago con tu tarjeta para continuar.");
            state.op = op; state.step = 2; render(); IC.confetti();
          });
          calc();
        } else {
          var op = state.op, card = cardById(op.cardId), acc = accountById(op.accountId);
          var msg = "Hola Impulsa Crédito, acabo de crear la operación " + op.code + " por " + IC.money(op.amount) + " (" + opTypeLabel(op.type) + "). Tarjeta " + card.bank + " •••• " + card.last4 + ". Quedo atento al link de pago.";
          body.innerHTML = '<div style="text-align:center"><div class="success-anim">' + ic("check", 40) + '</div><h3>¡Operación creada!</h3><p class="text-muted mt-8">Código <b class="code">' + esc(op.code) + '</b> · Estado: ' + statusBadge(op.status) + "</p></div>" +
            '<div class="calc mt-24"><div class="r"><span>Tipo</span><b>' + opTypeLabel(op.type) + '</b></div><div class="r"><span>Tarjeta</span><b>' + esc(card.bank) + " •••• " + esc(card.last4) + '</b></div><div class="r"><span>Cuenta destino</span><b>' + esc(acc.bank) + " · " + esc(acc.number) + '</b></div><div class="r"><span>Monto</span><b>' + IC.money(op.amount) + '</b></div><div class="r"><span>Comisión (' + op.commissionPct + '%)</span><b>- ' + IC.money(op.commission) + '</b></div><div class="r total"><span>Recibes</span><span class="v">' + IC.money(op.net) + "</span></div></div>" +
            '<div class="note amber mt-16">' + ic("bolt", 18) + "<div><b>Siguiente paso: realiza el pago.</b> Te enviaremos por WhatsApp el <b>link de pago seguro</b> (o coordinamos el cobro por POS). Apenas confirmemos el pago, depositamos a tu cuenta.</div></div>" +
            '<div class="wz-actions"><a href="#/operacion/' + op.id + '" class="btn btn-outline-dark">Ver detalle</a><a href="' + IC.waLink(msg) + '" target="_blank" rel="noopener" class="btn btn-primary">' + WA_SVG + " Avisar por WhatsApp</a></div>";
        }
      }
      render();
    } };
  }

  function viewOpDetail(params) {
    var op = user.ops.find(function (o) { return o.id === params.id; });
    if (!op) { location.hash = "#/historial"; return viewHistory(); }
    var card = cardById(op.cardId) || {}, acc = accountById(op.accountId) || {};
    var timeline = [["Creada", true], ["Pago pendiente", op.status !== "cancelada"], ["Pago confirmado", op.status === "completada"], ["Depósito realizado", op.status === "completada"]];
    var msg = "Hola, consulto por mi operación " + op.code + " (" + IC.money(op.amount) + ").";
    var html = '<div class="wizard"><div class="page-h"><div class="left"><a href="#/historial" class="icon-btn">' + ic("left", 16) + '</a><div><h2>Operación ' + esc(op.code) + '</h2><p>' + IC.fmtDateTime(op.createdAt) + "</p></div></div>" + statusBadge(op.status) + "</div>" +
      '<div class="card"><div class="grid-2"><div class="calc"><div class="r"><span>Tipo</span><b>' + opTypeLabel(op.type) + '</b></div><div class="r"><span>Tarjeta</span><b>' + esc(card.bank || "-") + " •••• " + esc(card.last4 || "") + '</b></div><div class="r"><span>Cuenta</span><b>' + esc(acc.bank || "-") + " · " + esc(acc.number || "") + '</b></div><div class="r"><span>Monto</span><b>' + IC.money(op.amount) + '</b></div><div class="r"><span>Comisión (' + op.commissionPct + '%)</span><b>- ' + IC.money(op.commission) + '</b></div><div class="r total"><span>Recibes</span><span class="v">' + IC.money(op.net) + "</span></div></div>" +
      '<div><b class="small" style="letter-spacing:.08em">SEGUIMIENTO</b><div class="todo mt-8">' + timeline.map(function (t, i) { return '<div class="todo-item ' + (op.status === "cancelada" && i > 0 ? "" : (t[1] ? "done" : "")) + '"><div class="num">' + (t[1] && !(op.status === "cancelada" && i > 0) ? "✓" : i + 1) + "</div><div><b>" + t[0] + "</b></div></div>"; }).join("") + (op.status === "cancelada" ? '<div class="note red mt-8">Operación cancelada.</div>' : "") + "</div></div></div>" +
      '<div class="wz-actions"><div class="row">' + (op.status === "pend_pago" || op.status === "activa" ? '<button class="btn btn-danger btn-sm" id="cancel">Cancelar operación</button>' : "") + (op.status === "completada" ? '<a href="#/comprobantes/' + op.id + '" class="btn btn-soft btn-sm">' + ic("receipt", 14) + " Ver comprobante</a>" : "") + (P.demoTools !== false && op.status === "pend_pago" ? '<button class="btn btn-outline-dark btn-sm" id="simulate" title="Solo para pruebas">Simular pago confirmado (demo)</button>' : "") + '</div><a href="' + IC.waLink(msg) + '" target="_blank" rel="noopener" class="btn btn-primary">' + WA_SVG + " Consultar por WhatsApp</a></div></div></div>";
    return { title: "Operación", html: html, mount: function (el) {
      var c = el.querySelector("#cancel");
      if (c) c.addEventListener("click", function () { IC.modal({ title: "Cancelar operación", text: "¿Deseas cancelar la operación " + op.code + "?", actions: [{ label: "No", cls: "btn-outline-dark" }, { label: "Sí, cancelar", cls: "btn-danger", onClick: async function () {
        try {
          if (NUBE) { user = await IC.cloud.cambiarEstadoOperacion(op.remoteId, "cancelada"); }
          else { IC.auth.update(function (u) { var o = u.ops.find(function (x) { return x.id === op.id; }); o.status = "cancelada"; o.history.push({ at: Date.now(), status: "cancelada", text: "Cancelada por el usuario" }); }); refreshUser(); }
        } catch (e) { IC.toast("No se pudo cancelar. Revisa tu conexión.", "err"); return; }
        IC.toast("Operación cancelada"); navigate(); } }] }); });
      var s = el.querySelector("#simulate");
      if (s) s.addEventListener("click", async function () {
        try {
          if (NUBE) { user = await IC.cloud.cambiarEstadoOperacion(op.remoteId, "completada"); }
          else { IC.auth.update(function (u) { var o = u.ops.find(function (x) { return x.id === op.id; }); o.status = "completada"; o.completedAt = Date.now(); o.history.push({ at: Date.now(), status: "completada", text: "Pago confirmado y depósito realizado" }); }); refreshUser(); }
        } catch (e) { IC.toast("No se pudo actualizar. Revisa tu conexión.", "err"); return; }
        notify("¡Depósito realizado!", "La operación " + op.code + " fue completada. Ya puedes ver tu comprobante."); IC.confetti(); IC.toast("Pago confirmado y depósito realizado"); navigate(); });
    } };
  }

  /* ---------- HISTORIAL ---------- */
  function viewHistory() {
    var filter = "todas";
    var html = '<div class="page-h"><div><h2>Mis Operaciones</h2><p>' + user.ops.length + ' operaciones</p></div><a href="#/operacion" class="btn btn-primary">' + ic("plus", 16) + ' Nueva Operación</a></div>' +
      '<div class="chips" id="chips">' + [["todas", "Todas"], ["activa", "Activas"], ["pend_pago", "Pend. Pago"], ["completada", "Completadas"], ["cancelada", "Canceladas"]].map(function (f) { return '<button class="chip-f' + (f[0] === "todas" ? " active" : "") + '" data-f="' + f[0] + '">' + f[1] + "</button>"; }).join("") + "</div>" +
      '<div class="card" id="listWrap"></div>';
    return { title: "Historial", html: html, mount: function (el) {
      function render() {
        var list = user.ops.filter(function (o) { return filter === "todas" || o.status === filter; }).sort(function (a, b) { return b.createdAt - a.createdAt; });
        el.querySelector("#listWrap").innerHTML = list.length ? '<div class="list">' + list.map(opRow).join("") + "</div>" : emptyState("history", "No tienes operaciones", "Crea tu primera operación para comenzar", '<a href="#/operacion" class="btn btn-primary">' + ic("plus", 16) + " Nueva Operación</a>");
      }
      el.querySelectorAll(".chip-f").forEach(function (c) { c.addEventListener("click", function () { el.querySelectorAll(".chip-f").forEach(function (x) { x.classList.remove("active"); }); c.classList.add("active"); filter = c.dataset.f; render(); }); });
      render();
    } };
  }

  /* ---------- COMPROBANTES ---------- */
  function viewReceipts() {
    var done = user.ops.filter(function (o) { return o.status === "completada"; }).sort(function (a, b) { return b.completedAt - a.completedAt; });
    var html = '<div class="banner"><div><h2 style="margin:0">Mis Comprobantes</h2><div class="sub">Comprobantes de tus operaciones completadas</div></div><a href="#/historial" class="icon-btn" style="background:rgba(255,255,255,.15);border-color:transparent;color:#fff">' + ic("refresh", 16) + "</a></div>" +
      '<div class="card mt-16">' + (done.length ? '<div class="list">' + done.map(function (o) { return '<a href="#/comprobantes/' + o.id + '" class="list-item"><div class="ic">' + ic("receipt", 18) + '</div><div class="body"><b>Comprobante ' + esc(o.code) + "</b><span>" + IC.fmtDateTime(o.completedAt) + '</span></div><div class="amt">' + IC.money(o.net) + "<small>depositado</small></div></a>"; }).join("") + "</div>" : emptyState("receipt", "Sin comprobantes todavía", "Los comprobantes de tus operaciones completadas aparecerán aquí automáticamente", '<span class="note green" style="display:inline-flex">' + ic("info", 14) + " Los comprobantes se emiten al completar una operación</span>")) + "</div>";
    return { title: "Comprobantes", html: html };
  }
  function viewReceipt(params) {
    var op = user.ops.find(function (o) { return o.id === params.id && o.status === "completada"; });
    if (!op) { location.hash = "#/comprobantes"; return viewReceipts(); }
    var card = cardById(op.cardId) || {}, acc = accountById(op.accountId) || {};
    var html = '<div class="page-h no-print"><div class="left"><a href="#/comprobantes" class="icon-btn">' + ic("left", 16) + '</a><div><h2>Comprobante</h2><p>' + esc(op.code) + '</p></div></div><button class="btn btn-primary" id="print">🖨️ Descargar / Imprimir</button></div>' +
      '<div class="receipt"><div class="receipt-h"><img class="rc-logo rc-logo-light" src="' + esc(CFG.brand.logo) + '" alt=""><img class="rc-logo rc-logo-dark" src="' + esc(CFG.brand.logoDark || CFG.brand.logo) + '" alt=""><div style="text-align:right"><div class="small">COMPROBANTE DE OPERACIÓN</div><div class="code">' + esc(op.code) + '</div></div></div><div class="receipt-b">' +
      '<div class="r"><span>Cliente</span><b>' + esc(fullName()) + '</b></div><div class="r"><span>Documento</span><b>' + esc(user.docType + " " + user.doc) + '</b></div><div class="r"><span>Fecha</span><b>' + IC.fmtDateTime(op.completedAt) + '</b></div><div class="r"><span>Tipo</span><b>' + opTypeLabel(op.type) + '</b></div><div class="r"><span>Tarjeta</span><b>' + esc(card.bank || "") + " •••• " + esc(card.last4 || "") + '</b></div><div class="r"><span>Cuenta destino</span><b>' + esc(acc.bank || "") + " · " + esc(acc.number || "") + '</b></div><div class="r"><span>Monto operado</span><b>' + IC.money(op.amount) + '</b></div><div class="r"><span>Comisión (' + op.commissionPct + '%)</span><b>' + IC.money(op.commission) + '</b></div><div class="r total"><span>Total depositado</span><span class="text-green">' + IC.money(op.net) + '</span></div>' +
      '<p class="small text-muted mt-16">' + esc(CFG.brand.name) + " · " + esc((CFG.contact || {}).email || "") + " · WhatsApp " + esc((CFG.contact || {}).whatsappDisplay || "") + "</p></div></div>";
    return { title: "Comprobantes", html: html, mount: function (el) { el.querySelector("#print").addEventListener("click", function () { window.print(); }); } };
  }

  /* ---------- AJUSTES ---------- */
  function viewSettings() {
    var html = '<div class="page-h"><div><h2>Ajustes</h2><p>Administra tu perfil y tu seguridad</p></div></div><div class="settings-grid">' +
      '<div class="card"><div class="card-h"><h3>Mi perfil</h3></div><div class="grid-2"><div class="field"><label>Nombres</label><input id="nombres" value="' + esc(user.nombres) + '"></div><div class="field"><label>Apellidos</label><input id="apellidos" value="' + esc(user.apellidos) + '"></div></div><div class="field"><label>Documento</label><input value="' + esc(user.docType + " " + user.doc) + '" disabled></div><div class="field"><label>Celular</label><input id="phone" value="' + esc(user.phone) + '" maxlength="9"></div><div class="field"><label>Correo</label><input id="email" value="' + esc(user.email) + '"></div><button class="btn btn-primary" id="saveProfile">Guardar cambios</button></div>' +
      '<div><div class="card"><div class="card-h"><h3>Cambiar contraseña</h3></div><div class="field"><label>Contraseña actual</label><div class="pass-wrap"><input type="password" id="pass0"><button class="pass-toggle"></button></div></div><div class="field"><label>Nueva contraseña</label><div class="pass-wrap"><input type="password" id="pass1" placeholder="Mínimo 8 caracteres, con un número"><button class="pass-toggle"></button></div></div><button class="btn btn-dark" id="savePass">Actualizar contraseña</button></div>' +
      '<div class="card mt-16"><div class="card-h"><h3>Zona de riesgo</h3></div><p class="small text-muted">Elimina tu cuenta y todos tus datos de este dispositivo. Esta acción no se puede deshacer.</p><button class="btn btn-danger mt-16" id="deleteAcc">Eliminar mi cuenta</button></div></div></div>';
    return { title: "Ajustes", html: html, mount: function (el) {
      IC.bindPassToggles(el);
      el.querySelector("#saveProfile").addEventListener("click", async function () {
        var n = el.querySelector("#nombres").value.trim(), a = el.querySelector("#apellidos").value.trim(), p = el.querySelector("#phone").value.trim(), e = el.querySelector("#email").value.trim();
        if (n.length < 2 || a.length < 2 || !/^\d{9}$/.test(p)) { IC.toast("Revisa los datos ingresados.", "err"); return; }
        try {
          if (NUBE) { user = await IC.cloud.actualizarPerfil({ nombres: n, apellidos: a, celular: p, email: e }); }
          else { IC.auth.update(function (u) { u.nombres = n; u.apellidos = a; u.phone = p; u.email = e; }); refreshUser(); }
        } catch (err) { IC.toast("No se pudo guardar. Revisa tu conexión.", "err"); return; }
        IC.toast("Perfil actualizado"); renderShell();
      });
      el.querySelector("#savePass").addEventListener("click", async function () {
        var p0 = el.querySelector("#pass0").value, p1 = el.querySelector("#pass1").value;
        if (p1.length < 8 || !/\d/.test(p1)) { IC.toast("La nueva contraseña debe tener 8+ caracteres y un número.", "err"); return; }
        if (NUBE) {
          var v = await IC.cloud.login(user.doc, p0);
          if (!v.ok) { IC.toast("La contraseña actual no es correcta.", "err"); return; }
          try { await IC.cloud.cambiarPassword(p1); }
          catch (e) { IC.toast("No se pudo cambiar la contraseña.", "err"); return; }
        } else {
          if (await IC.sha256(p0 + "|" + user.doc) !== user.passHash) { IC.toast("La contraseña actual no es correcta.", "err"); return; }
          var h = await IC.sha256(p1 + "|" + user.doc);
          IC.auth.update(function (u) { u.passHash = h; });
        }
        IC.toast("Contraseña actualizada"); el.querySelector("#pass0").value = ""; el.querySelector("#pass1").value = "";
      });
      el.querySelector("#deleteAcc").addEventListener("click", function () {
        IC.modal({ title: "Eliminar cuenta", text: "Se borrarán tus datos, tarjetas, cuentas y operaciones de este dispositivo. ¿Continuar?", actions: [{ label: "Cancelar", cls: "btn-outline-dark" }, { label: "Eliminar todo", cls: "btn-danger", onClick: async function () { if (NUBE) { await IC.cloud.logout(); IC.toast("Sesión cerrada. Escríbenos por WhatsApp para borrar definitivamente tus datos."); } else { IC.auth.deleteAccount(); } window.location.href = "index.html"; } }] });
      });
    } };
  }

  /* ---------- arranque ---------- */
  (async function iniciar() {
    if (NUBE) {
      var v = document.getElementById("view");
      v.innerHTML = '<div class="empty" style="padding:80px 16px"><div class="ic">' + ic("refresh", 24) + "</div><b>Cargando tu cuenta…</b></div>";
      user = await IC.cloud.init();
      if (!user) { window.location.href = (P.loginHref || "login.html") + "?next=1"; return; }
    } else {
      user = IC.auth.requireSession();
      if (!user) return;
    }
    renderShell();
    navigate();
  })();
})();
