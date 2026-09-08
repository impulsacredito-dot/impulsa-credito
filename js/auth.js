/* Impulsa Crédito — lógica de registro e inicio de sesión */
(function () {
  "use strict";
  var IC = window.IC, P = IC.p;

  document.querySelectorAll("#year").forEach(function (y) { y.textContent = new Date().getFullYear(); });
  document.querySelectorAll(".js-brand-mark").forEach(function (img) { if (IC.cfg.brand) img.src = IC.cfg.brand.icon || IC.cfg.brand.logo; });

  /* mostrar / ocultar contraseña (ojo cerrado = oculta, ojo abierto = visible) */
  IC.bindPassToggles(document);

  /* horario desde config */
  var pinHours = document.getElementById("pinHours");
  if (pinHours && IC.cfg.contact && IC.cfg.contact.hoursLabel) pinHours.textContent = IC.cfg.contact.hoursLabel;

  /* ---------------------------------------------------------------
     Ilustración animada (tarjeta → teléfono → efectivo)
     Dibujada en SVG con los colores de la marca.
  --------------------------------------------------------------- */
  var art = document.querySelector(".auth-art");
  if (art) {
    art.innerHTML =
      '<svg viewBox="0 0 420 330" role="img" aria-label="Tu tarjeta convertida en efectivo">' +
        '<defs>' +
          '<linearGradient id="gGreen" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#4ade80"/><stop offset="100%" stop-color="#16a34a"/></linearGradient>' +
          '<linearGradient id="gCard" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#1f2a25"/><stop offset="100%" stop-color="#0e1512"/></linearGradient>' +
        '</defs>' +
        // aro decorativo
        '<circle class="art-ring" cx="210" cy="165" r="122" fill="none" stroke="rgba(34,197,94,.28)" stroke-width="1.5" stroke-dasharray="6 10"/>' +
        '<circle cx="210" cy="165" r="92" fill="rgba(34,197,94,.07)"/>' +
        // ruta punteada tarjeta -> teléfono -> monedas
        '<path class="art-path" d="M96 214 C 130 250, 200 250, 214 196" fill="none" stroke="#4ade80" stroke-width="2.5" stroke-linecap="round" stroke-dasharray="7 9"/>' +
        '<path class="art-path art-path-2" d="M258 138 C 300 120, 320 96, 330 78" fill="none" stroke="#4ade80" stroke-width="2.5" stroke-linecap="round" stroke-dasharray="7 9"/>' +
        // tarjeta de crédito
        '<g class="art-card">' +
          '<rect x="42" y="176" width="118" height="74" rx="12" fill="url(#gCard)" stroke="rgba(255,255,255,.16)"/>' +
          '<rect x="54" y="192" width="20" height="14" rx="3" fill="#e6c15c"/>' +
          '<rect x="54" y="220" width="56" height="6" rx="3" fill="rgba(255,255,255,.35)"/>' +
          '<rect x="118" y="220" width="28" height="6" rx="3" fill="#4ade80"/>' +
        '</g>' +
        // teléfono con el isotipo
        '<g class="art-phone">' +
          '<rect x="176" y="84" width="94" height="168" rx="18" fill="#0f1613" stroke="rgba(255,255,255,.18)" stroke-width="2"/>' +
          '<rect x="206" y="92" width="34" height="7" rx="3.5" fill="rgba(255,255,255,.25)"/>' +
          '<g transform="translate(198,126) scale(0.92)">' +
            '<rect x="4" y="46" width="10" height="26" rx="2" fill="#fff"/>' +
            '<rect x="19" y="34" width="10" height="38" rx="2" fill="#fff"/>' +
            '<rect x="34" y="20" width="10" height="52" rx="2" fill="#fff"/>' +
            '<path d="M2 40 L 22 16 L 36 26 L 58 2" stroke="#22c55e" stroke-width="6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>' +
            '<path d="M44 2 L 58 2 L 58 16" stroke="#22c55e" stroke-width="6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>' +
          '</g>' +
          '<rect x="192" y="212" width="62" height="8" rx="4" fill="rgba(255,255,255,.18)"/>' +
          '<rect x="192" y="228" width="40" height="8" rx="4" fill="rgba(34,197,94,.55)"/>' +
        '</g>' +
        // billetes y monedas
        '<g class="art-cash">' +
          '<rect x="286" y="180" width="96" height="58" rx="9" fill="url(#gGreen)" opacity=".92" transform="rotate(-8 334 209)"/>' +
          '<circle cx="334" cy="209" r="15" fill="#0e1512" opacity=".25" transform="rotate(-8 334 209)"/>' +
          '<text x="334" y="215" text-anchor="middle" font-family="Montserrat,sans-serif" font-size="15" font-weight="800" fill="#0b2417" transform="rotate(-8 334 209)">S/</text>' +
        '</g>' +
        '<g class="art-coin art-coin-1"><circle cx="330" cy="72" r="21" fill="#4ade80"/><text x="330" y="79" text-anchor="middle" font-family="Montserrat,sans-serif" font-size="17" font-weight="800" fill="#08130c">S/</text></g>' +
        '<g class="art-coin art-coin-2"><circle cx="378" cy="126" r="14" fill="#22c55e"/><text x="378" y="132" text-anchor="middle" font-family="Montserrat,sans-serif" font-size="12" font-weight="800" fill="#08130c">S/</text></g>' +
        '<g class="art-coin art-coin-3"><circle cx="70" cy="96" r="12" fill="#16a34a"/><text x="70" y="101" text-anchor="middle" font-family="Montserrat,sans-serif" font-size="10" font-weight="800" fill="#eafff1">S/</text></g>' +
        // check de confirmación
        '<g class="art-check"><circle cx="118" cy="132" r="22" fill="#fff"/><path d="M108 132l7 7 14-15" stroke="#16a34a" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></g>' +
      "</svg>";
  }

  function field(form, name) { return form.querySelector('[name="' + name + '"]'); }
  function setInvalid(input, bad) { input.closest(".field").classList.toggle("invalid", !!bad); return !bad; }
  var validators = {
    nombres: function (v) { return v.trim().length >= 2; },
    apellidos: function (v) { return v.trim().length >= 2; },
    doc: function (v, form) { var t = field(form, "docType") ? field(form, "docType").value : "DNI"; return t === "DNI" ? /^\d{8}$/.test(v.trim()) : /^[A-Za-z0-9]{9,12}$/.test(v.trim()); },
    phone: function (v) { return /^\d{9}$/.test(v.replace(/\s/g, "")); },
    email: function (v) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()); },
    password: function (v) { return v.length >= 8 && /\d/.test(v); },
    password2: function (v, form) { return v === field(form, "password").value && v.length > 0; }
  };
  function validate(form, names) {
    var ok = true;
    names.forEach(function (n) {
      var input = field(form, n);
      if (!input) return;
      var good = validators[n] ? validators[n](input.value, form) : true;
      if (!setInvalid(input, !good)) ok = false;
    });
    return ok;
  }
  function liveValidate(form) {
    form.querySelectorAll("input,select").forEach(function (input) {
      input.addEventListener("input", function () {
        if (input.closest(".field").classList.contains("invalid") && validators[input.name]) setInvalid(input, !validators[input.name](input.value, form));
      });
    });
  }

  /* ================= REGISTRO ================= */
  var reg = document.getElementById("registerForm");
  if (reg) {
    if (IC.auth.current()) { /* ya hay sesión: ofrecer ir al panel */ }
    liveValidate(reg);
    var step = 1, total = 3;
    var titles = {
      1: ["Crea tu cuenta", "Ingresa tus datos tal como figuran en tu documento."],
      2: ["Datos de acceso", "Con estos datos ingresarás a tu cuenta."],
      3: ["Confirma tus datos", "Revisa que todo esté correcto antes de crear tu cuenta."]
    };
    function showStep(n) {
      step = n;
      reg.querySelectorAll(".form-step").forEach(function (s) { s.classList.toggle("active", +s.dataset.step === n); });
      document.querySelectorAll(".stepper span").forEach(function (s, i) { s.className = i + 1 < n ? "done" : (i + 1 === n ? "active" : ""); });
      document.getElementById("stepLabel").textContent = "Paso " + n + " de " + total;
      document.getElementById("formTitle").textContent = titles[n][0];
      document.getElementById("formSub").textContent = titles[n][1];
      if (n === 3) renderSummary();
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
    function renderSummary() {
      var v = function (n) { return IC.esc(field(reg, n).value.trim()); };
      document.getElementById("summary").innerHTML =
        "<div><b>" + v("nombres") + " " + v("apellidos") + "</b><br>" +
        "<span class='small'>" + v("docType") + " " + v("doc") + " · Cel. " + v("phone") + "<br>" + v("email") + "</span></div>";
    }
    reg.querySelectorAll("[data-next]").forEach(function (b) {
      b.addEventListener("click", function () {
        var names = step === 1 ? ["nombres", "apellidos", "doc", "phone"] : ["email", "password", "password2"];
        if (validate(reg, names)) showStep(step + 1);
      });
    });
    reg.querySelectorAll("[data-prev]").forEach(function (b) { b.addEventListener("click", function () { showStep(step - 1); }); });

    field(reg, "docType").addEventListener("change", function () {
      var d = field(reg, "doc");
      d.placeholder = this.value === "DNI" ? "8 dígitos" : "9 a 12 caracteres";
      d.maxLength = this.value === "DNI" ? 8 : 12;
    });
    field(reg, "doc").addEventListener("input", function () { if (field(reg, "docType").value === "DNI") this.value = this.value.replace(/\D/g, "").slice(0, 8); });
    field(reg, "phone").addEventListener("input", function () { this.value = this.value.replace(/\D/g, "").slice(0, 9); });

    /* fuerza de contraseña */
    field(reg, "password").addEventListener("input", function () {
      var v = this.value, s = 0;
      if (v.length >= 8) s++; if (/\d/.test(v)) s++; if (/[A-Z]/.test(v)) s++; if (/[^A-Za-z0-9]/.test(v)) s++;
      var bar = document.getElementById("strengthBar"), txt = document.getElementById("strengthText");
      var map = [["0%", "#e5e7eb", "Usa letras y números."], ["25%", "#dc2626", "Débil"], ["50%", "#f59e0b", "Regular"], ["75%", "#22c55e", "Buena"], ["100%", "#16a34a", "Excelente"]];
      bar.style.width = map[s][0]; bar.style.background = map[s][1]; txt.textContent = map[s][2];
    });

    document.getElementById("termsLink").addEventListener("click", function (e) {
      e.preventDefault();
      IC.modal({ title: "Términos y condiciones", html: "<p>Impulsa Crédito es una empresa de asesoría y gestión crediticia. La efectivización se realiza mediante medios de pago autorizados y se cobra una comisión informada previamente. Tus datos e imágenes se usan únicamente para verificar tu identidad y la titularidad de tu tarjeta, conforme a la Ley de Protección de Datos Personales (Ley N.° 29733).</p><p class='mt-8'>Puedes solicitar la eliminación de tu información en cualquier momento desde Ajustes.</p>" });
    });

    reg.addEventListener("submit", async function (e) {
      e.preventDefault();
      var terms = field(reg, "terms");
      if (!setInvalid(terms, !terms.checked)) return;
      var btn = document.getElementById("submitBtn");
      btn.disabled = true; btn.textContent = "Creando tu cuenta...";
      var datos = {
        nombres: field(reg, "nombres").value, apellidos: field(reg, "apellidos").value,
        docType: field(reg, "docType").value, doc: field(reg, "doc").value,
        phone: field(reg, "phone").value, email: field(reg, "email").value, password: field(reg, "password").value
      };
      var res;
      if (IC.cloud && IC.cloud.activo) {
        res = await IC.cloud.registrar(datos);              // cuenta real en la nube
      } else {
        res = await IC.auth.register(datos);                // respaldo: solo este navegador
        if (res.ok && IC.backend) { try { await IC.backend.cliente(res.user); } catch (err) {} }
      }
      if (!res.ok) { btn.disabled = false; btn.textContent = "Crear mi cuenta"; IC.toast(res.error, "err"); return; }
      IC.confetti();
      btn.textContent = "¡Cuenta creada! Entrando...";
      setTimeout(function () { window.location.href = (P.appHref || "app.html") + "#/inicio"; }, 1100);
    });
  }

  /* ================= LOGIN ================= */
  var login = document.getElementById("loginForm");
  if (login) {
    liveValidate(login);
    var err = document.getElementById("loginError");
    login.addEventListener("submit", async function (e) {
      e.preventDefault();
      err.classList.add("hidden");
      var doc = field(login, "doc"), pass = field(login, "password");
      var ok = setInvalid(doc, !doc.value.trim()) & setInvalid(pass, !pass.value);
      if (!ok) return;
      var btn = document.getElementById("loginBtn");
      btn.disabled = true; btn.textContent = "Verificando...";
      var res = (IC.cloud && IC.cloud.activo)
        ? await IC.cloud.login(doc.value, pass.value)
        : await IC.auth.login(doc.value, pass.value);
      if (!res.ok) { btn.disabled = false; btn.textContent = "INGRESAR"; err.textContent = res.error; err.classList.remove("hidden"); return; }
      btn.textContent = "¡Bienvenido! Entrando...";
      setTimeout(function () { window.location.href = (P.appHref || "app.html") + "#/inicio"; }, 500);
    });
    document.getElementById("forgotLink").addEventListener("click", function (e) {
      e.preventDefault();

      /* Sin cuentas en la nube no hay correo que enviar: lo vemos con un asesor */
      if (!(IC.cloud && IC.cloud.activo)) {
        IC.modal({
          title: "Recuperar contraseña",
          html: "<p>Escríbenos por WhatsApp indicando tu número de documento y te ayudamos a restablecerla en el momento.</p>",
          actions: [
            { label: "Cerrar", cls: "btn-outline-dark" },
            { label: "Escribir por WhatsApp", onClick: function () { window.open(IC.waLink("Hola, olvidé mi contraseña de la plataforma Impulsa Crédito. Mi documento es: "), "_blank"); } }
          ]
        });
        return;
      }

      IC.modal({
        title: "Recuperar contraseña",
        html: '<p class="muted">Escribe el correo con el que te registraste. Te enviaremos un enlace para crear una contraseña nueva.</p>' +
              '<div class="field mt-8"><label for="recoverMail">Tu correo</label>' +
              '<input type="email" id="recoverMail" placeholder="tucorreo@ejemplo.com" autocomplete="email"></div>' +
              '<p class="form-error hidden" id="recoverErr"></p>',
        actions: [
          { label: "Cancelar", cls: "btn-outline-dark" },
          { label: "Enviar enlace", keepOpen: true, onClick: async function (boton) {
              var campo = document.getElementById("recoverMail");
              var aviso = document.getElementById("recoverErr");
              var correo = (campo && campo.value || "").trim();
              if (!validators.email(correo)) {
                aviso.textContent = "Escribe un correo válido.";
                aviso.classList.remove("hidden");
                if (campo) campo.focus();
                return;
              }
              if (boton) { boton.disabled = true; boton.textContent = "Enviando..."; }
              var r = await IC.cloud.pedirRecuperacion(correo);
              IC.closeModal();
              if (r.ok) {
                IC.modal({
                  title: "Revisa tu correo",
                  html: "<p>Si <b>" + IC.esc(correo) + "</b> corresponde a una cuenta nuestra, ahí encontrarás el enlace para crear tu contraseña nueva.</p>" +
                        '<p class="muted mt-8">Puede tardar un par de minutos. Si no lo ves, mira en la carpeta de spam o correo no deseado.</p>',
                  actions: [{ label: "Entendido", cls: "btn-primary" }]
                });
              } else {
                IC.toast(r.error || "No se pudo enviar. Inténtalo en unos minutos.", "err");
              }
            } }
        ]
      });
    });
  }
})();
