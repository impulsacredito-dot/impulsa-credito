/* =====================================================================
   IMPULSA CRÉDITO — script.js
   Motor de renderizado (lee js/config.js) + interacciones del sitio.
   No necesitas editar este archivo para personalizar contenido:
   usa js/config.js.
   ===================================================================== */
(function () {
  "use strict";

  var CFG = window.SITE_CONFIG || {};

  /* ---------------------------------------------------------------
     Helpers
  --------------------------------------------------------------- */
  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function $all(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }
  function setText(id, value) { var el = document.getElementById(id); if (el && value != null) el.textContent = value; }
  function el(tag, className) { var n = document.createElement(tag); if (className) n.className = className; return n; }
  function waLink(number, message) {
    return "https://wa.me/" + number + "?text=" + encodeURIComponent(message || "");
  }

  var checkIconSVG =
    '<svg viewBox="0 0 20 20" width="16" height="16"><circle cx="10" cy="10" r="10" fill="currentColor"/><path d="M6 10.5l2.5 2.5L14 7" stroke="#08130c" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  var ICON_LIB = {
    layers: 'M4 19h16M4 19V7l5-3 5 3v12M14 19V11l6-3v11',
    target: 'M3 17l6-6 4 4 8-8M21 7v6M21 7h-6',
    bolt: 'M13 2L4 14h7l-1 8 9-12h-7l1-8z',
    users: 'M17 20h5v-2a4 4 0 0 0-3-3.87M9 20H4v-2a4 4 0 0 1 3-3.87m5-4.13a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm6.5-1.5a3 3 0 1 0 0-6M6.5 9.5a3 3 0 1 1 0-6',
    shield: 'M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6l8-4zM9 12l2 2 4-4',
    phone: 'M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zM11 18h2',
    lock: 'M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4M12 15v2',
    bank: 'M3 9l9-6 9 6H3zM5 9v9M10 9v9M14 9v9M19 9v9M3 21h18',
    card: 'M2 6h20v12H2zM2 10h20M6 15h4',
    clock: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 7v5l3 2'
  };
  function iconSVG(name, size) {
    var d = ICON_LIB[name] || ICON_LIB.bolt;
    var s = size || 20;
    return '<svg viewBox="0 0 24 24" width="' + s + '" height="' + s + '" fill="none" stroke="currentColor" stroke-width="1.8"><path d="' + d + '" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }

  /* ---------------------------------------------------------------
     RENDER: aplica js/config.js a todo el DOM
  --------------------------------------------------------------- */
  function applyTheme() {
    var t = CFG.theme;
    if (!t) return;
    var root = document.documentElement.style;
    var map = {
      black: "--black", black2: "--black-2", black3: "--black-3",
      green: "--green", greenDark: "--green-dark", greenLight: "--green-light",
      surface: "--surface", text: "--text", textMuted: "--text-muted"
    };
    Object.keys(map).forEach(function (key) {
      if (t[key]) root.setProperty(map[key], t[key]);
    });
  }

  function applyMeta() {
    if (CFG.meta) {
      if (CFG.meta.title) { document.title = CFG.meta.title; setText("pageTitle", CFG.meta.title); }
      var descEl = document.getElementById("pageDescription");
      if (descEl && CFG.meta.description) descEl.setAttribute("content", CFG.meta.description);
    }
    if (CFG.brand) {
      $all(".js-brand-mark").forEach(function (img) { img.src = CFG.brand.icon || CFG.brand.logo; });
      var fav = document.getElementById("faviconLink");
      if (fav && CFG.brand.favicon) fav.href = CFG.brand.favicon;
    }
  }

  function applyWhatsappLinks() {
    var c = CFG.contact || {};
    var messages = {
      default: c.defaultMessage || "Hola, quiero información",
      steps: (CFG.steps && CFG.steps.ctaWhatsappMessage) || c.defaultMessage
    };
    $all(".js-wa-link").forEach(function (a) {
      var key = a.getAttribute("data-wa-msg") || "default";
      a.href = waLink(c.whatsapp, messages[key] || messages.default);
    });
  }

  function renderHeader() {
    var h = CFG.header || {};
    setText("headerWhatsappLabel", h.whatsappLabel);
    setText("headerCta", h.ctaLabel);
    var cta = document.getElementById("headerCta");
    if (cta && h.ctaHref) cta.setAttribute("href", h.ctaHref);
    var login = document.getElementById("headerLogin");
    if (login) { if (h.loginLabel) login.textContent = h.loginLabel; if (h.loginHref) login.setAttribute("href", h.loginHref); }

    var nav = document.getElementById("mainNav");
    if (!nav) return;
    nav.innerHTML = "";
    (CFG.nav || []).forEach(function (item) {
      var a = el("a"); a.href = item.href; a.textContent = item.label;
      nav.appendChild(a);
    });
    (CFG.navMobileExtra || []).forEach(function (item) {
      var a = el("a", "nav-only-mobile"); a.href = item.href; a.textContent = item.label;
      nav.appendChild(a);
    });
  }

  function renderHero() {
    var hcfg = CFG.hero;
    if (!hcfg) return;
    setText("heroBadge", hcfg.badge);

    var titleEl = document.getElementById("heroTitle");
    if (titleEl) {
      titleEl.innerHTML =
        (hcfg.titleBefore || "") + "<br>" +
        '<span class="hl">' + (hcfg.titleHighlight || "") + "</span><br>" +
        (hcfg.titleAfter || "");
    }

    var phoneIcon = document.getElementById("heroPhoneIcon");
    if (phoneIcon && CFG.brand && CFG.brand.icon) phoneIcon.src = CFG.brand.icon;
    setText("heroPhoneLabel", hcfg.phoneLabel || (CFG.brand && CFG.brand.name));

    setText("heroSubtitle", hcfg.subtitle);

    var p1 = document.getElementById("heroCtaPrimary");
    if (p1 && hcfg.ctaPrimary) { p1.textContent = hcfg.ctaPrimary.label; p1.href = hcfg.ctaPrimary.href; }
    var p2 = document.getElementById("heroCtaSecondary");
    if (p2 && hcfg.ctaSecondary) { p2.textContent = hcfg.ctaSecondary.label; p2.href = hcfg.ctaSecondary.href; }
    setText("heroCtaWhatsapp", hcfg.ctaWhatsappLabel);

    var trustUl = document.getElementById("heroTrust");
    if (trustUl) {
      trustUl.innerHTML = "";
      (hcfg.trust || []).forEach(function (text) {
        var li = el("li"); li.innerHTML = checkIconSVG + " " + text;
        trustUl.appendChild(li);
      });
    }

    var photo = document.getElementById("heroPhoto");
    if (photo) { photo.src = hcfg.photo; photo.alt = hcfg.photoAlt || ""; }
    setText("heroPhotoCaption", hcfg.photoCaption);

    var floats = document.getElementById("heroFloats");
    if (floats) {
      floats.innerHTML = "";
      (hcfg.floatCards || []).forEach(function (card, i) {
        var div = el("div", "glass-card gc-" + (i + 1));
        if (card.kind === "check") {
          div.innerHTML = checkIconSVG + " " + card.text;
        } else {
          div.innerHTML =
            '<span class="gc-label">' + card.label + '</span>' +
            '<span class="gc-value' + (card.positive ? " pos" : "") + '">' + card.value + "</span>";
        }
        floats.appendChild(div);
      });
    }
  }

  function renderPartners() {
    var p = CFG.partners;
    if (!p) return;
    setText("partnersEyebrow", p.eyebrow);
    setText("partnersTitle", p.title);
    setText("partnersSubtitle", p.subtitle);

    var track = document.getElementById("marqueeTrack");
    if (track) {
      track.innerHTML = "";
      var logos = p.logos || (p.list || []).map(function (n) { return { name: n }; });
      // se duplica la lista para que el carrusel sea infinito y sin saltos
      logos.concat(logos).forEach(function (item) {
        var card = el("div", "logo-card");
        card.innerHTML = item.file
          ? '<img src="' + item.file + '" alt="' + item.name + '">'
          : '<span class="logo-text">' + item.name + "</span>";
        track.appendChild(card);
      });
    }
    var note = document.getElementById("partnersNote");
    if (note) note.textContent = p.note || "";
  }

  function renderBento() {
    var b = CFG.bento;
    if (!b) return;
    setText("bentoEyebrow", b.eyebrow);
    setText("bentoSubtitle", b.subtitle);
    var title = document.getElementById("bentoTitle");
    if (title) {
      title.innerHTML = (b.titleBefore || "") + ' <span class="accent">' + (b.titleAccent || "") + "</span> " + (b.titleAfter || "");
    }

    var grid = document.getElementById("bentoGrid");
    if (!grid) return;
    grid.innerHTML = "";

    if (b.main) {
      var main = el("article", "bento-card bento-main");
      main.setAttribute("data-reveal", "");
      var f = b.main.flow;
      if (f && f.amount != null) {
        // calcula el ejemplo con la comisión real de platform.commissionPercent
        var pctF = Number((CFG.platform || {}).commissionPercent || 0);
        var netoF = f.amount - Math.round(f.amount * pctF) / 100;
        var mon = function (n) { return "S/ " + Number(n).toLocaleString("es-PE"); };
        f = {
          fromLabel: f.fromLabel, from: mon(f.amount),
          toLabel: f.toLabel, to: mon(netoF),
          note: "Comisión " + pctF + "%" + (f.note ? " · " + f.note : "")
        };
      }
      main.innerHTML =
        '<span class="bento-tag">' + (b.main.tag || "") + '</span>' +
        '<h3>' + (b.main.title || "") + '</h3>' +
        '<p>' + (b.main.text || "") + '</p>' +
        (b.main.button ? '<a class="btn btn-white" href="' + b.main.button.href + '">' + b.main.button.label + '</a>' : "") +
        (f ? '<div class="bento-flow"><div class="fl"><span>' + f.fromLabel + '</span><b>' + f.from + '</b></div>' +
          '<div class="arrow"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12h14M13 6l6 6-6 6"/></svg></div>' +
          '<div class="fl net"><span>' + f.toLabel + '</span><b>' + f.to + '</b></div>' +
          (f.note ? '<div class="fnote">' + f.note + "</div>" : "") + "</div>" : "");
      grid.appendChild(main);
    }

    if (b.photo) {
      var photo = el("article", "bento-card bento-photo");
      photo.setAttribute("data-reveal", "");
      photo.innerHTML =
        '<img src="' + b.photo.src + '" alt="' + (b.photo.alt || "") + '" loading="lazy">' +
        (b.photo.pill ? '<span class="bento-pill">' + b.photo.pill + '</span>' : "") +
        (b.photo.rating ? '<div class="bento-rating"><div><b>' + b.photo.rating + '</b><div class="stars">★★★★★</div></div><span>' + (b.photo.ratingLabel || "") + "</span></div>" : "") +
        '<p class="bento-photo-caption">' + (b.photo.caption || "") + '</p>';
      grid.appendChild(photo);
    }

    (b.small || []).forEach(function (card) {
      var c = el("article", "bento-card bento-small");
      c.setAttribute("data-reveal", "");
      c.innerHTML =
        '<span class="bento-icon">' + iconSVG(card.icon, 22) + '</span>' +
        '<h3>' + card.title + '</h3><p>' + card.text + '</p>';
      grid.appendChild(c);
    });

    if (b.wide) {
      var wide = el("article", "bento-card bento-wide");
      wide.setAttribute("data-reveal", "");
      var c = b.wide.counter;
      wide.innerHTML =
        '<span class="bento-icon">' + iconSVG(b.wide.icon, 26) + '</span>' +
        '<div><h3>' + (b.wide.title || "") + '</h3><p>' + (b.wide.text || "") + '</p></div>' +
        (c ? '<div class="bento-counter"><b><span class="stat-number" data-count="' + c.value + '">0</span>' + (c.suffix || "") + "</b><span>" + c.label + "</span></div>" : "");
      grid.appendChild(wide);
    }

  }

  /* ---------- simulador de efectivización (sección propia) ---------- */
  function renderSimulator(grid, s) {
    var plat = CFG.platform || {};
    var pct = Number(plat.commissionPercent || 5);
    var min = Number(plat.minAmount || 100), max = Number(plat.maxAmount || 30000);
    var amount = Math.min(Math.max(Number(s.quick && s.quick[0]) || 1000, min), max);
    var money = function (n) { return "S/ " + Number(n).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };

    var card = grid;
    card.className = "sim-card";
    card.setAttribute("data-reveal", "");
    card.innerHTML =
      '<div class="sim-left"><p class="eyebrow">' + (s.eyebrow || "") + '</p><h3>' + (s.title || "") + '</h3><p class="sub">' + (s.subtitle || "") + "</p>" +
      '<div class="sim-amount"><span class="cur">S/</span><input type="number" id="simAmount" min="' + min + '" max="' + max + '" step="50" value="' + amount + '"></div>' +
      '<input type="range" class="sim-range" id="simRange" min="' + min + '" max="' + max + '" step="50" value="' + amount + '">' +
      '<div class="sim-chips" id="simChips">' + (s.quick || []).map(function (q) { return '<button type="button" class="sim-chip" data-q="' + q + '">S/ ' + Number(q).toLocaleString("es-PE") + "</button>"; }).join("") + "</div>" +
      '<p class="sim-note">' + (s.note || "") + "</p></div>" +
      '<div class="sim-right"><div class="sim-row"><span>' + (s.labelAmount || "Monto") + '</span><b id="simGross"></b></div>' +
      '<div class="sim-row"><span>' + (s.labelFee || "Comisión") + " (" + pct + '%)</span><b id="simFee"></b></div>' +
      '<div class="sim-net"><span>' + (s.labelNet || "Recibes") + '</span><b id="simNet"></b></div>' +
      (s.cta ? '<a class="btn btn-white btn-block" href="' + s.cta.href + '">' + s.cta.label + "</a>" : "") + "</div>";

    var input = card.querySelector("#simAmount"), range = card.querySelector("#simRange");
    function update(v, syncInput) {
      amount = Math.min(Math.max(Number(v) || min, min), max);
      if (syncInput) input.value = amount;
      range.value = amount;
      var fee = Math.round(amount * pct) / 100;
      card.querySelector("#simGross").textContent = money(amount);
      card.querySelector("#simFee").textContent = "- " + money(fee);
      card.querySelector("#simNet").textContent = money(amount - fee);
      card.querySelectorAll(".sim-chip").forEach(function (ch) { ch.classList.toggle("active", Number(ch.dataset.q) === amount); });
    }
    input.addEventListener("input", function () { update(this.value, false); });
    input.addEventListener("blur", function () { update(this.value, true); });
    range.addEventListener("input", function () { update(this.value, true); });
    card.querySelectorAll(".sim-chip").forEach(function (ch) { ch.addEventListener("click", function () { update(ch.dataset.q, true); }); });
    update(amount, true);
  }

  function renderWhy() {
    var w = CFG.why;
    if (!w) return;
    var img = document.getElementById("whyImage");
    if (img) { img.src = w.image; img.alt = w.imageAlt || ""; }
    setText("whyImageBadge", w.imageBadge);
    setText("whyEyebrow", w.eyebrow);
    setText("whyTitle", w.title);
    setText("whySubtitle", w.subtitle);

    var list = document.getElementById("whyList");
    if (list) {
      list.innerHTML = "";
      (w.items || []).forEach(function (item) {
        var row = el("div", "why-item");
        row.setAttribute("data-reveal", "");
        row.innerHTML =
          '<span class="why-icon">' + iconSVG(item.icon) + '</span>' +
          '<div><h3>' + item.title + '</h3><p>' + item.desc + '</p></div>';
        list.appendChild(row);
      });
    }
  }

  function renderStats() {
    var s = CFG.stats;
    if (!s) return;
    setText("statsEyebrow", s.eyebrow);
    setText("statsTitle", s.title);
    setText("statsSubtitle", s.subtitle);

    var section = document.getElementById("statsSection");
    if (section && s.bg) {
      var absoluteUrl = new URL(s.bg, document.baseURI).href;
      section.style.backgroundImage =
        "linear-gradient(135deg, rgba(8,9,9,.94) 0%, rgba(14,18,17,.92) 100%), url('" + absoluteUrl + "')";
      section.style.backgroundSize = "cover";
      section.style.backgroundPosition = "center";
      section.style.backgroundRepeat = "no-repeat";
    }

    var cards = document.getElementById("statsCards");
    if (cards) {
      cards.innerHTML = "";
      (s.items || []).forEach(function (item) {
        var card = el("div", "stat-card");
        card.innerHTML =
          '<span class="stat-number" data-count="' + item.value + '">0</span>' +
          '<span class="stat-plus">' + item.suffix + '</span>' +
          '<p>' + item.label + '</p>';
        cards.appendChild(card);
      });
    }
  }

  function renderSteps() {
    var s = CFG.steps;
    if (!s) return;
    setText("stepsEyebrow", s.eyebrow);
    setText("stepsTitle", s.title);
    setText("stepsSubtitle", s.subtitle);

    var grid = document.getElementById("stepsGrid");
    if (grid) {
      grid.innerHTML = "";
      (s.items || []).forEach(function (item, i) {
        var num = String(i + 1).padStart(2, "0");
        var card = el("div", "step-card");
        card.setAttribute("data-reveal", "");
        card.innerHTML =
          '<span class="step-num">' + num + '</span>' +
          '<span class="step-tag">PASO ' + num + '</span>' +
          '<h3>' + item.title + '</h3><p>' + item.desc + '</p>';
        grid.appendChild(card);
      });
    }

    setText("stepsCtaText", s.ctaText);
    var btn = document.getElementById("stepsCtaButton");
    if (btn && s.ctaButton) { btn.textContent = s.ctaButton.label; btn.href = s.ctaButton.href; }
    setText("stepsCtaWhatsapp", s.ctaWhatsappLabel);
  }

  function renderApply() {
    var a = CFG.apply;
    if (!a) return;
    setText("applyEyebrow", a.eyebrow);
    setText("applyTitle", a.title);
    setText("applySubtitle", a.subtitle);
    setText("applySubmitLabel", a.submitLabel);

    var labels = a.labels || {};
    setText("labelName", labels.name);
    setText("labelPhone", labels.phone);
    setText("labelType", labels.type);
    setText("labelAmount", labels.amount);
    setText("ftypePlaceholder", (a.placeholders || {}).type);

    var ph = a.placeholders || {};
    var fname = document.getElementById("fname"); if (fname && ph.name) fname.placeholder = ph.name;
    var fphone = document.getElementById("fphone"); if (fphone && ph.phone) fphone.placeholder = ph.phone;
    var famount = document.getElementById("famount"); if (famount && ph.amount) famount.placeholder = ph.amount;

    var trust = document.getElementById("applyTrust");
    if (trust) {
      trust.innerHTML = "";
      (a.trust || []).forEach(function (text) {
        var li = el("li"); li.innerHTML = checkIconSVG + " " + text;
        trust.appendChild(li);
      });
    }

    var select = document.getElementById("ftype");
    if (select) {
      $all("option:not([disabled])", select).forEach(function (o) { o.remove(); });
      (a.typeOptions || []).forEach(function (opt) {
        var o = el("option"); o.textContent = opt;
        select.appendChild(o);
      });
    }
  }

  function renderFaq() {
    var f = CFG.faq;
    if (!f) return;
    setText("faqEyebrow", f.eyebrow);
    setText("faqTitle", f.title);

    var sub = document.getElementById("faqSubtitle");
    if (sub) {
      var c = CFG.contact || {};
      sub.innerHTML =
        (f.subtitleBefore || "") + ' <a href="' + waLink(c.whatsapp, c.defaultMessage) +
        '" target="_blank" rel="noopener">' + (f.subtitleLink || "") + "</a> " + (f.subtitleAfter || "");
    }

    var acc = document.getElementById("accordion");
    if (acc) {
      acc.innerHTML = "";
      (f.items || []).forEach(function (item) {
        var wrap = el("div", "acc-item");
        wrap.innerHTML =
          '<button class="acc-trigger">' + item.q + '<span class="acc-icon">+</span></button>' +
          '<div class="acc-panel"><p>' + item.a + '</p></div>';
        acc.appendChild(wrap);
      });
    }
  }

  function renderContactSection() {
    var c = CFG.contactSection;
    var contact = CFG.contact || {};
    if (c) {
      setText("contactEyebrow", c.eyebrow);
      setText("contactTitle", c.title);
      setText("contactSubtitle", c.subtitle);
      setText("contactCtaButton", c.ctaButtonLabel);
    }
    var hours = document.getElementById("contactHours");
    if (hours) {
      hours.innerHTML = "";
      (contact.hoursShort || []).forEach(function (text) {
        var span = el("span", "hours-pill"); span.textContent = text;
        hours.appendChild(span);
      });
    }
    setText("contactNumber", contact.whatsappDisplay);
    setText("contactHoursLabel", contact.hoursLabel);
  }

  function renderFooter() {
    var f = CFG.footer || {};
    var contact = CFG.contact || {};
    setText("footerTagline", f.tagline);
    setText("footerNavTitle", f.navTitle);
    setText("footerContactTitle", f.contactTitle);
    setText("footerLegal", f.legal);
    setText("footerBrandName", CFG.brand && CFG.brand.name);

    var navWrap = document.getElementById("footerNav");
    if (navWrap) {
      navWrap.innerHTML = "";
      (CFG.nav || []).concat([{ label: (CFG.header && CFG.header.ctaLabel) || "Solicita tu asesoría", href: (CFG.header && CFG.header.ctaHref) || "#solicitar" }])
        .forEach(function (item) {
          var a = el("a"); a.href = item.href; a.textContent = item.label;
          navWrap.appendChild(a);
        });
    }

    setText("footerLegalTitle", f.legalTitle);
    var legalWrap = document.getElementById("footerLegalLinks");
    if (legalWrap) {
      legalWrap.innerHTML = "";
      (f.legalLinks || []).forEach(function (item) {
        var a = el("a"); a.href = item.href; a.textContent = item.label;
        legalWrap.appendChild(a);
      });
    }
    var claims = document.getElementById("claimsBadge");
    if (claims) {
      if (f.claimsHref) claims.href = f.claimsHref;
      var b = claims.querySelector("b");
      if (b && f.claimsLabel) b.textContent = f.claimsLabel;
    }

    var contactWrap = document.getElementById("footerContact");
    if (contactWrap) {
      contactWrap.innerHTML = "";
      var waA = el("a"); waA.href = waLink(contact.whatsapp, contact.defaultMessage);
      waA.target = "_blank"; waA.rel = "noopener";
      waA.textContent = "WhatsApp: " + (contact.whatsappDisplay || "");
      contactWrap.appendChild(waA);

      var mailA = el("a"); mailA.href = "mailto:" + contact.email; mailA.textContent = contact.email;
      contactWrap.appendChild(mailA);

      var citySpan = el("span"); citySpan.textContent = contact.city;
      contactWrap.appendChild(citySpan);
    }
  }

  function renderAll() {
    applyTheme();
    applyMeta();
    renderHeader();
    renderHero();
    renderPartners();
    renderBento();
    var simEl = document.getElementById("simCard");
    if (simEl && CFG.bento && CFG.bento.simulator) renderSimulator(simEl, CFG.bento.simulator);
    renderWhy();
    renderStats();
    renderSteps();
    renderApply();
    renderFaq();
    renderContactSection();
    renderFooter();
    applyWhatsappLinks();
  }

  renderAll();

  /* ---------------------------------------------------------------
     año en footer
  --------------------------------------------------------------- */
  var yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  /* ---------------------------------------------------------------
     barra de progreso de scroll (animación)
  --------------------------------------------------------------- */
  var progressBar = document.getElementById("scrollProgress");
  function updateProgress() {
    if (!progressBar) return;
    var h = document.documentElement;
    var scrolled = h.scrollTop;
    var max = h.scrollHeight - h.clientHeight;
    var pct = max > 0 ? (scrolled / max) * 100 : 0;
    progressBar.style.width = pct + "%";
  }

  /* ---------------------------------------------------------------
     header: sombra + progreso + menú móvil
  --------------------------------------------------------------- */
  var header = document.getElementById("siteHeader");
  var menuToggle = document.getElementById("menuToggle");
  var mainNav = document.getElementById("mainNav");

  window.addEventListener("scroll", function () {
    if (header) header.classList.toggle("scrolled", window.scrollY > 10);
    updateProgress();
  });
  updateProgress();

  if (menuToggle && mainNav) {
    menuToggle.addEventListener("click", function () {
      var isOpen = mainNav.classList.toggle("open");
      menuToggle.classList.toggle("open", isOpen);
      menuToggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
    });

    mainNav.addEventListener("click", function (e) {
      if (e.target.tagName === "A") {
        mainNav.classList.remove("open");
        menuToggle.classList.remove("open");
        menuToggle.setAttribute("aria-expanded", "false");
      }
    });
  }

  /* ---------------------------------------------------------------
     tilt 3D en la foto del hero
  --------------------------------------------------------------- */
  var heroVisual = document.getElementById("heroVisual");
  var photoCard = heroVisual ? heroVisual.querySelector(".hero-stage") : null;

  if (photoCard && window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
    heroVisual.addEventListener("mousemove", function (e) {
      var rect = heroVisual.getBoundingClientRect();
      var x = (e.clientX - rect.left) / rect.width - 0.5;
      var y = (e.clientY - rect.top) / rect.height - 0.5;
      photoCard.style.transform = "rotateY(" + (x * 10) + "deg) rotateX(" + (y * -10) + "deg)";
    });
    heroVisual.addEventListener("mouseleave", function () {
      photoCard.style.transform = "rotateY(0deg) rotateX(0deg)";
    });
  }

  /* ---------------------------------------------------------------
     scroll reveal (con efecto escalonado / stagger)
  --------------------------------------------------------------- */
  function applyStaggerDelays() {
    $all(".why-list, .steps-grid, .stats-cards, .accordion, .marquee-track, .bento-grid").forEach(function (group) {
      $all(":scope > [data-reveal]", group).forEach(function (child, i) {
        child.style.transitionDelay = Math.min(i * 90, 450) + "ms";
      });
    });
  }
  applyStaggerDelays();

  var revealEls = $all("[data-reveal]");
  if ("IntersectionObserver" in window && revealEls.length) {
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("in");
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15, rootMargin: "0px 0px -40px 0px" }
    );
    revealEls.forEach(function (elm) { io.observe(elm); });
  } else {
    revealEls.forEach(function (elm) { elm.classList.add("in"); });
  }

  /* ---------------------------------------------------------------
     contador animado (stats)
  --------------------------------------------------------------- */
  function animateCounter(elm) {
    var target = parseInt(elm.getAttribute("data-count"), 10) || 0;
    var duration = 1400;
    var startTime = null;

    function step(ts) {
      if (startTime === null) startTime = ts;
      var progress = Math.min((ts - startTime) / duration, 1);
      var eased = 1 - Math.pow(1 - progress, 3);
      elm.textContent = Math.floor(eased * target).toLocaleString("es-PE");
      if (progress < 1) {
        requestAnimationFrame(step);
      } else {
        elm.textContent = target.toLocaleString("es-PE");
      }
    }
    requestAnimationFrame(step);
  }

  var counters = $all(".stat-number[data-count]");
  if ("IntersectionObserver" in window && counters.length) {
    var counterIo = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            animateCounter(entry.target);
            counterIo.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.4 }
    );
    counters.forEach(function (elm) { counterIo.observe(elm); });
  } else {
    counters.forEach(animateCounter);
  }

  /* ---------------------------------------------------------------
     acordeón FAQ
  --------------------------------------------------------------- */
  var accordion = document.getElementById("accordion");
  if (accordion) {
    accordion.addEventListener("click", function (e) {
      var trigger = e.target.closest(".acc-trigger");
      if (!trigger) return;
      var item = trigger.closest(".acc-item");
      var panel = item.querySelector(".acc-panel");
      var isOpen = item.classList.contains("open");

      $all(".acc-item", accordion).forEach(function (other) {
        other.classList.remove("open");
        other.querySelector(".acc-panel").style.maxHeight = null;
      });

      if (!isOpen) {
        item.classList.add("open");
        panel.style.maxHeight = panel.scrollHeight + "px";
      }
    });
  }

  /* ---------------------------------------------------------------
     formulario "Solicita tu asesoría" -> WhatsApp
  --------------------------------------------------------------- */
  var applyForm = document.getElementById("applyForm");
  var formNote = document.getElementById("formNote");

  if (applyForm) {
    applyForm.addEventListener("submit", function (e) {
      e.preventDefault();

      var name = applyForm.fname.value.trim();
      var phone = applyForm.fphone.value.trim();
      var type = applyForm.ftype.value;
      var amount = applyForm.famount.value.trim();

      if (!name || !phone || !type) {
        if (formNote) {
          formNote.textContent = "Por favor completa los campos obligatorios.";
          formNote.style.color = "#dc2626";
        }
        return;
      }

      var intro = (CFG.apply && CFG.apply.messageIntro) || "quiero información:";
      var lines = [
        "Hola " + ((CFG.brand && CFG.brand.name) || "") + ", " + intro,
        "Nombre: " + name,
        "Celular: " + phone,
        "Necesito: " + type
      ];
      if (amount) lines.push("Monto aproximado: S/ " + amount);

      var url = waLink((CFG.contact && CFG.contact.whatsapp) || "", lines.join("\n"));

      if (formNote) {
        formNote.style.color = "#16a34a";
        formNote.textContent = "¡Listo! Te llevamos a WhatsApp para enviar tu solicitud...";
      }

      window.open(url, "_blank", "noopener");
      applyForm.reset();
    });
  }

})();
