/* =====================================================================
   Impulsa Crédito — núcleo de la plataforma
   Almacenamiento local (localStorage), autenticación y utilidades.
   NOTA: los datos se guardan en el navegador del usuario. Para cuentas
   reales entre dispositivos se necesita un backend (ver README).
   ===================================================================== */
(function () {
  "use strict";

  var CFG = window.SITE_CONFIG || {};
  var P = CFG.platform || {};
  var KEY = "ic_db_v3";   // v2: arranca sin datos (limpia cualquier cuenta de prueba anterior)

  /* ---------- base de datos local ---------- */
  function load() {
    try { return JSON.parse(localStorage.getItem(KEY)) || { users: [], session: null }; }
    catch (e) { return { users: [], session: null }; }
  }
  function save(db) {
    try { localStorage.setItem(KEY, JSON.stringify(db)); return true; }
    catch (e) { toast("No se pudo guardar: el almacenamiento está lleno. Usa fotos más ligeras.", "err"); return false; }
  }

  /* ---------- utilidades ---------- */
  function uid(prefix) { return (prefix || "id") + "_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function money(n) { return "S/ " + (Number(n) || 0).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function fmtDate(d, opts) {
    var dt = d ? new Date(d) : new Date();
    return dt.toLocaleDateString("es-PE", opts || { weekday: "long", day: "numeric", month: "long" });
  }
  function fmtDateTime(d) {
    var dt = new Date(d);
    return dt.toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" }) + " " + dt.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" });
  }
  function initials(name) {
    return String(name || "").trim().split(/\s+/).slice(0, 2).map(function (w) { return w[0] || ""; }).join("").toUpperCase() || "U";
  }
  function greeting() {
    var h = new Date().getHours();
    return h < 12 ? "Buenos días" : h < 19 ? "Buenas tardes" : "Buenas noches";
  }
  function opCode() { return "IC-" + Date.now().toString(36).toUpperCase().slice(-6); }

  async function sha256(str) {
    if (window.crypto && crypto.subtle) {
      var buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
      return Array.from(new Uint8Array(buf)).map(function (b) { return b.toString(16).padStart(2, "0"); }).join("");
    }
    var h = 0; for (var i = 0; i < str.length; i++) { h = (h << 5) - h + str.charCodeAt(i); h |= 0; }
    return "x" + Math.abs(h).toString(16);
  }

  /* comprime una imagen (File o dataURL) a JPEG para guardar en localStorage */
  function compressImage(src, maxW, quality) {
    maxW = maxW || 1000; quality = quality || 0.78;
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () {
        var scale = Math.min(1, maxW / img.width);
        var c = document.createElement("canvas");
        c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL("image/jpeg", quality));
      };
      img.onerror = function () { reject(new Error("No se pudo leer la imagen")); };
      if (typeof src === "string") { img.src = src; }
      else {
        var fr = new FileReader();
        fr.onload = function () { img.src = fr.result; };
        fr.onerror = function () { reject(new Error("No se pudo leer el archivo")); };
        fr.readAsDataURL(src);
      }
    });
  }

  /* ---------- ojo mostrar/ocultar contraseña ---------- */
  var EYE_OPEN =
    '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M1.5 12S5.5 4.5 12 4.5 22.5 12 22.5 12 18.5 19.5 12 19.5 1.5 12 1.5 12z"/><circle cx="12" cy="12" r="3.2"/></svg>';
  var EYE_CLOSED =
    '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s4-7.5 10-7.5c1.2 0 2.3.2 3.3.6M22 12s-1.4 2.6-4 4.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/><path d="M6.5 6.5C3.9 8.4 2 12 2 12s4 7.5 10 7.5c2.2 0 4.1-.7 5.6-1.6"/><path d="M3 3l18 18"/></svg>';

  /* Convierte los botones .pass-toggle en un ojo que se abre al mostrar la contraseña */
  function bindPassToggles(root) {
    (root || document).querySelectorAll(".pass-toggle").forEach(function (btn) {
      if (btn.dataset.bound) return;
      btn.dataset.bound = "1";
      var input = btn.parentElement.querySelector("input");
      if (!input) return;
      btn.type = "button";
      function paint() {
        var visible = input.type !== "password";
        btn.innerHTML = visible ? EYE_OPEN : EYE_CLOSED;
        btn.classList.toggle("on", visible);
        btn.setAttribute("aria-label", visible ? "Ocultar contraseña" : "Mostrar contraseña");
        btn.setAttribute("aria-pressed", visible ? "true" : "false");
      }
      paint();
      btn.addEventListener("click", function () {
        input.type = input.type === "password" ? "text" : "password";
        paint();
        input.focus();
      });
    });
  }

  /* ---------- toast ---------- */
  function toast(msg, type) {
    var wrap = document.querySelector(".toast-wrap");
    if (!wrap) { wrap = document.createElement("div"); wrap.className = "toast-wrap"; document.body.appendChild(wrap); }
    var t = document.createElement("div");
    t.className = "toast " + (type || "ok");
    t.innerHTML = (type === "err" ? "⚠️ " : "✅ ") + esc(msg);
    wrap.appendChild(t);
    setTimeout(function () { t.style.opacity = "0"; t.style.transition = "opacity .3s"; setTimeout(function () { t.remove(); }, 300); }, 3200);
  }

  /* ---------- modal ---------- */
  function modal(opts) {
    closeModal();
    var bg = document.createElement("div");
    bg.className = "modal-bg"; bg.id = "modalBg";
    bg.innerHTML =
      '<div class="modal" role="dialog">' +
      (opts.title ? "<h3>" + esc(opts.title) + "</h3>" : "") +
      (opts.html ? opts.html : (opts.text ? "<p>" + esc(opts.text) + "</p>" : "")) +
      '<div class="modal-actions" id="modalActions"></div></div>';
    document.body.appendChild(bg);
    var actions = bg.querySelector("#modalActions");
    (opts.actions || [{ label: "Cerrar", cls: "btn-outline-dark" }]).forEach(function (a) {
      var b = document.createElement("button");
      b.className = "btn btn-sm " + (a.cls || "btn-primary");
      b.textContent = a.label;
      b.addEventListener("click", function () { if (a.onClick) a.onClick(); if (!a.keepOpen) closeModal(); });
      actions.appendChild(b);
    });
    bg.addEventListener("click", function (e) { if (e.target === bg && !opts.persistent) closeModal(); });
    return bg;
  }
  function closeModal() { var m = document.getElementById("modalBg"); if (m) m.remove(); }

  /* ---------- confetti ---------- */
  function confetti() {
    var c = document.createElement("div"); c.className = "confetti";
    var colors = ["#22c55e", "#4ade80", "#16a34a", "#ffffff", "#facc15"];
    for (var i = 0; i < 70; i++) {
      var p = document.createElement("i");
      p.style.left = Math.random() * 100 + "vw";
      p.style.background = colors[i % colors.length];
      p.style.animationDelay = (Math.random() * .8) + "s";
      p.style.transform = "rotate(" + Math.random() * 360 + "deg)";
      c.appendChild(p);
    }
    document.body.appendChild(c);
    setTimeout(function () { c.remove(); }, 3200);
  }

  /* ---------- autenticación ---------- */
  var auth = {
    current: function () {
      var db = load();
      if (!db.session) return null;
      return db.users.find(function (u) { return u.id === db.session; }) || null;
    },
    register: async function (data) {
      var db = load();
      var doc = String(data.doc || "").trim();
      if (db.users.some(function (u) { return u.doc === doc; })) return { ok: false, error: "Ya existe una cuenta con ese documento. Inicia sesión." };
      if (data.email && db.users.some(function (u) { return u.email && u.email.toLowerCase() === data.email.toLowerCase(); })) return { ok: false, error: "Ese correo ya está registrado." };
      var user = {
        id: uid("u"),
        nombres: data.nombres.trim(), apellidos: data.apellidos.trim(),
        docType: data.docType || "DNI", doc: doc,
        phone: data.phone.trim(), email: (data.email || "").trim(),
        passHash: await sha256(data.password + "|" + doc),
        createdAt: Date.now(),
        identity: { front: null, back: null, selfie: null, status: "pending", submittedAt: null },
        cards: [], accounts: [], ops: [],
        notifications: [{ id: uid("n"), title: "¡Bienvenido a Impulsa Crédito!", text: "Completa tu verificación para empezar a efectivizar.", at: Date.now(), read: false }]
      };
      db.users.push(user); db.session = user.id;
      if (!save(db)) return { ok: false, error: "No se pudo guardar la cuenta." };
      return { ok: true, user: user };
    },
    login: async function (doc, password) {
      var db = load();
      var user = db.users.find(function (u) { return u.doc === String(doc).trim(); });
      if (!user) return { ok: false, error: "No encontramos una cuenta con ese documento." };
      var hash = await sha256(password + "|" + user.doc);
      if (hash !== user.passHash) return { ok: false, error: "Contraseña incorrecta." };
      db.session = user.id; save(db);
      return { ok: true, user: user };
    },
    logout: function () { var db = load(); db.session = null; save(db); },
    update: function (fn) {
      var db = load();
      var user = db.users.find(function (u) { return u.id === db.session; });
      if (!user) return null;
      fn(user);
      save(db);
      return user;
    },
    requireSession: function () {
      var u = auth.current();
      if (!u) { window.location.href = (P.loginHref || "login.html") + "?next=1"; return null; }
      return u;
    },
    deleteAccount: function () {
      var db = load();
      db.users = db.users.filter(function (u) { return u.id !== db.session; });
      db.session = null; save(db);
    }
  };

  /* ---------- helpers de negocio ---------- */
  function commission(amount) {
    var pct = Number(P.commissionPercent || 5);
    var c = Math.round(amount * pct) / 100;
    return { pct: pct, commission: c, net: Math.round((amount - c) * 100) / 100 };
  }
  function bankColor(name) {
    var b = (P.banks || []).find(function (x) { return x.name === name; });
    return b ? b.color : "#334155";
  }
  function bankShort(name) {
    return String(name || "").replace(/^Banco de la /i, "B.").split(/\s+/).map(function (w) { return w[0]; }).join("").slice(0, 3).toUpperCase();
  }
  function onboarding(user) {
    var idDone = user.identity.status === "verified";
    var idReview = user.identity.status === "review";
    var steps = [
      { key: "identity", title: "Verifica tu identidad", desc: idReview ? "Estamos revisando tus documentos" : "Sube tu DNI y una selfie", done: idDone, review: idReview, route: "#/identificacion", cta: "Verificar" },
      { key: "card", title: "Registra tu tarjeta", desc: "Agrega la tarjeta de crédito que quieres efectivizar.", done: user.cards.length > 0, route: "#/tarjetas/nueva", cta: "Agregar tarjeta" },
      { key: "account", title: "Agrega tu cuenta bancaria", desc: "Donde recibirás tu dinero.", done: user.accounts.length > 0, route: "#/cuentas/nueva", cta: "Agregar cuenta" },
      { key: "op", title: "Crea tu primera operación", desc: "Efectiviza tu tarjeta en minutos.", done: user.ops.length > 0, route: "#/operacion", cta: "Nueva operación" }
    ];
    var completed = steps.filter(function (s) { return s.done; }).length;
    return { steps: steps, completed: completed, total: steps.length, pct: Math.round(completed / steps.length * 100) };
  }
  function waLink(message) {
    var c = CFG.contact || {};
    return "https://wa.me/" + (c.whatsapp || "") + "?text=" + encodeURIComponent(message || c.defaultMessage || "");
  }

  window.IC = {
    cfg: CFG, p: P, load: load, save: save, auth: auth,
    uid: uid, esc: esc, money: money, fmtDate: fmtDate, fmtDateTime: fmtDateTime, initials: initials, greeting: greeting, opCode: opCode,
    sha256: sha256, compressImage: compressImage, toast: toast, modal: modal, closeModal: closeModal, confetti: confetti,
    bindPassToggles: bindPassToggles, eyeOpen: EYE_OPEN, eyeClosed: EYE_CLOSED,
    commission: commission, bankColor: bankColor, bankShort: bankShort, onboarding: onboarding, waLink: waLink
  };
})();
