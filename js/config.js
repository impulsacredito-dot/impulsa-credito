/* =====================================================================
   IMPULSA CRÉDITO — ARCHIVO DE CONFIGURACIÓN
   =====================================================================
   Este es el ÚNICO archivo que necesitas editar para personalizar
   el sitio: textos, número de WhatsApp, colores, fotos, estadísticas,
   preguntas frecuentes, bancos aliados, etc.

   No necesitas tocar index.html, styles.css ni script.js.
   Después de editar, solo guarda el archivo y recarga la página.

   Consejos:
   - Los textos van entre comillas "así".
   - Las listas van entre corchetes [ ... ] separadas por comas.
   - No borres las comas ni las llaves { } — solo cambia el contenido.
   - Iconos disponibles para las tarjetas: layers, target, shield, bolt,
     users, phone, lock, bank, card, clock
   ===================================================================== */

var SITE_CONFIG = {

  /* ---------------------------------------------------------------
     1. INFORMACIÓN GENERAL DEL SITIO (pestaña del navegador, SEO)
  --------------------------------------------------------------- */
  meta: {
    title: "Impulsa Crédito — Efectiviza tu tarjeta de crédito al instante",
    description: "Convierte la línea disponible de tu tarjeta de crédito en efectivo, depositado directo a tu cuenta el mismo día. 100% digital, seguro y con la mejor comisión. Además, asesoría crediticia gratuita."
  },

  /* ---------------------------------------------------------------
     2. MARCA — logo y nombre
  --------------------------------------------------------------- */
  brand: {
    name: "Impulsa Crédito",
    logo: "assets/logo.png",              // logo completo para FONDOS OSCUROS (texto blanco)
    logoDark: "assets/logo-dark.png",     // logo completo para FONDOS CLAROS (texto negro)
    icon: "assets/logo-icon.png",         // isotipo para fondos oscuros
    iconDark: "assets/logo-icon-dark.png",// isotipo para fondos claros
    favicon: "assets/favicon.png"
    // También disponibles en /assets: icon-negro.png, icon-verde.png, icon-blanco.png
    // (avatares para redes sociales, según el manual de marca)
  },

  /* ---------------------------------------------------------------
     2b. ALMACENAMIENTO EN LA NUBE (para que TÚ recibas los datos)
     ---------------------------------------------------------------
     Mientras provider sea "local", los datos que suben tus clientes
     (DNI, selfie, tarjeta) quedan SOLO en el navegador de cada uno y
     tú no los recibes.

     Para recibirlos ordenados y con las fotos guardadas:
       1. Crea una cuenta gratis en https://supabase.com
       2. Abre "SQL Editor" y pega el archivo supabase-setup.sql
       3. En Project Settings → API copia los dos datos de abajo
       4. Cambia provider a "supabase"
     (Instrucciones detalladas en README.md)
  --------------------------------------------------------------- */
  backend: {
    provider: "supabase",           // "local" o "supabase"
    supabaseUrl: "https://sqbihengbsbgletrwyhk.supabase.co",
    supabaseAnonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNxYmloZW5nYnNiZ2xldHJ3eWhrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg3OTg5NTUsImV4cCI6MjEwNDM3NDk1NX0.HHT6HkBXm1Tuh-9tMMiDuZopuALyL3U46vylkmS2Cjg",
    bucket: "documentos",           // carpeta de fotos (no cambiar)
    // true = cada cliente tiene cuenta y entra desde cualquier dispositivo
    // (requiere haber ejecutado supabase-cuentas.sql)
    useAuth: true,
    // Los clientes entran con DNI. Por dentro Supabase necesita un correo,
    // así que se arma solo: dni12345678@<authDomain>. Debe ser un dominio
    // que exista de verdad. Cuando compres tu dominio, ponlo aquí.
    authDomain: "impulsacredito.com"
  },

  /* ---------------------------------------------------------------
     3. COLORES DEL SITIO
     Cambia estos valores (formato #rrggbb) y todo el sitio se
     actualiza automáticamente: botones, fondos, acentos, etc.
  --------------------------------------------------------------- */
  theme: {
    black: "#111111",       // fondo principal oscuro
    black2: "#121517",      // fondo oscuro secundario (degradados)
    black3: "#171b1d",      // fondo oscuro terciario (degradados)
    green: "#22c55e",       // color de marca principal
    greenDark: "#16a34a",   // verde oscuro (hover, textos sobre blanco)
    greenLight: "#4ade80",  // verde claro (textos sobre fondo oscuro)
    surface: "#f6f9f7",     // gris muy claro de fondo de secciones
    text: "#10151a",        // color de texto principal
    textMuted: "#5b6b63"    // color de texto secundario
  },

  /* ---------------------------------------------------------------
     4. CONTACTO — WhatsApp, correo, horario
     Este número se usa en TODOS los botones de WhatsApp del sitio.
     Formato: código de país + número, sin espacios, sin "+".
  --------------------------------------------------------------- */
  contact: {
    whatsapp: "51928266183",          // numero real (con 51 delante, sin espacios)
    whatsappDisplay: "928 266 183",   // cómo se muestra en pantalla
    email: "contacto@impulsacredito.com",
    city: "Lima, Perú",
    hoursLabel: "Lunes a Sábado, 10:00 a.m. – 7:00 p.m.",
    hoursShort: ["Lunes a Sábado", "10:00 a.m. – 7:00 p.m."],
    defaultMessage: "Hola Impulsa Crédito, quiero efectivizar mi tarjeta de crédito"
  },

  /* ---------------------------------------------------------------
     5. BOTONES DEL ENCABEZADO (header)
  --------------------------------------------------------------- */
  header: {
    whatsappLabel: "Contáctanos",
    loginLabel: "Inicia sesión",
    loginHref: "login.html",
    ctaLabel: "Regístrate gratis",
    ctaHref: "registro.html"
  },

  /* ---------------------------------------------------------------
     5c. PLATAFORMA DE USUARIO (registro, panel, operaciones)
  --------------------------------------------------------------- */
  platform: {
    loginHref: "login.html",
    registerHref: "registro.html",
    appHref: "app.html",
    recoverHref: "recuperar",  // pagina donde el cliente pone su contraseña nueva
    commissionPercent: 1,          // comisión por operación (%)
    minAmount: 100,                // monto mínimo por operación (S/)
    maxAmount: 30000,              // monto máximo por operación (S/)
    // false = el cliente NO puede marcar su propia operación como pagada.
    // Solo tú puedes darla por completada desde el panel de administración.
    // Ponlo en true unicamente si quieres volver a hacer pruebas.
    demoTools: false,
    maxCards: 30,
    maxAccounts: 10,
    verificationHours: "10:00 a.m. a 7:00 p.m. (lunes a sábado)",
    // ⏱️ CUÁNTO TARDA EL DEPÓSITO. Se muestra en varios sitios de la web.
    //    Cambia estos dos textos si tu tiempo real es otro: es lo primero
    //    que quiere saber un cliente que está esperando su dinero.
    depositTime: "en minutos",                    // corto, para etiquetas
    depositTimeLong: "en minutos, máximo el mismo día hábil",   // largo, para frases

    depositMessage: "Apenas confirmamos el cobro, te transferimos el dinero a tu cuenta en minutos (máximo el mismo día hábil). El cobro se hace con TU tarjeta, por POS o link de pago oficial, y recibes comprobante.",
    cardBrands: ["Visa", "Mastercard", "American Express", "Diners Club"],
    accountTypes: ["Ahorros", "Corriente"],
    banks: [
      { name: "BCP", color: "#0a3d91" },
      { name: "Interbank", color: "#0b9b4b" },
      { name: "BBVA", color: "#0b3b8f" },
      { name: "Scotiabank", color: "#e11b22" },
      { name: "Banco de la Nación", color: "#7a1f1f" },
      { name: "BanBif", color: "#1e40af" },
      { name: "Mibanco", color: "#0f766e" },
      { name: "Banco Falabella", color: "#15803d" },
      { name: "Banco Ripley", color: "#6b21a8" },
      { name: "Caja Piura", color: "#b45309" },
      { name: "Caja Arequipa", color: "#dc2626" },
      { name: "Diners Club", color: "#1f2937" },
      { name: "Otro", color: "#475569" }
    ]
  },

  /* ---------------------------------------------------------------
     5b. MENÚ DE NAVEGACIÓN
  --------------------------------------------------------------- */
  nav: [
    { label: "¿Cómo funciona?", href: "#como-funciona" },
    { label: "Beneficios", href: "#beneficios" },
    { label: "Nosotros", href: "#nosotros" },
    { label: "Preguntas Frecuentes", href: "#faq" }
  ],
  navMobileExtra: [
    { label: "Contáctanos", href: "#contacto" },
    { label: "Inicia sesión", href: "login.html" },
    { label: "Regístrate gratis", href: "registro.html" }
  ],

  /* ---------------------------------------------------------------
     6. SECCIÓN PRINCIPAL (HERO)
  --------------------------------------------------------------- */
  hero: {
    badge: "💳 ¿Tienes línea disponible en tu tarjeta de crédito?",
    titleBefore: "Convierte tu tarjeta en",
    titleHighlight: "efectivo",        // palabra resaltada (caja verde)
    titleAfter: "al instante.",
    subtitle: "Efectivizamos la línea de tu tarjeta de crédito y te depositamos el dinero directo a tu cuenta bancaria, en minutos. Solo 1% de comisión, 100% digital y sin papeles.",

    ctaPrimary: { label: "Regístrate gratis", href: "registro.html" },
    ctaSecondary: { label: "Inicia sesión", href: "login.html" },
    ctaWhatsappLabel: "Contáctanos",

    trust: [
      "Comisión de solo 1%",
      "Depósito en minutos",
      "100% digital",
      "Todas las tarjetas y bancos del Perú"
    ],

    photo: "assets/img/hero-efectivo.jpg",
    photoAlt: "Clienta efectivizando su tarjeta de crédito desde su celular",
    photoCaption: "🏆 +500 operaciones realizadas",
    phoneLabel: "Impulsa Crédito",     // texto bajo el isotipo en la pantalla del teléfono

    floatCards: [
      { kind: "check", text: "Depósito confirmado" },
      { kind: "stat", label: "Efectivizado", value: "S/ 5,000" },
      { kind: "stat", label: "Tiempo de depósito", value: "En minutos", positive: true }
    ]
  },

  /* ---------------------------------------------------------------
     7. ALIANZAS FINANCIERAS (marquesina de bancos)
  --------------------------------------------------------------- */
  partners: {
    eyebrow: "TARJETAS Y BANCOS",
    title: "Aceptamos tarjetas de todos los bancos del Perú",
    subtitle: "Visa, Mastercard, American Express y Diners de cualquier entidad. Te depositamos en el banco que prefieras.",
    /* Carrusel de logos. Reemplaza cada archivo de assets/bancos/ por el
       logo oficial (SVG o PNG con fondo transparente) manteniendo el nombre. */
    logos: [
      { name: "Visa", file: "assets/bancos/visa.svg" },
      { name: "Mastercard", file: "assets/bancos/mastercard.svg" },
      { name: "American Express", file: "assets/bancos/amex.svg" },
      { name: "Diners Club", file: "assets/bancos/diners.svg" },
      { name: "BCP", file: "assets/bancos/bcp.svg" },
      { name: "Interbank", file: "assets/bancos/interbank.svg" },
      { name: "BBVA", file: "assets/bancos/bbva.svg" },
      { name: "Scotiabank", file: "assets/bancos/scotiabank.svg" },
      { name: "Banco de la Nación", file: "assets/bancos/banco-nacion.svg" },
      { name: "BanBif", file: "assets/bancos/banbif.svg" },
      { name: "Mibanco", file: "assets/bancos/mibanco.svg" },
      { name: "Banco Falabella", file: "assets/bancos/falabella.svg" },
      { name: "Banco Ripley", file: "assets/bancos/ripley.svg" },
      { name: "Caja Piura", file: "assets/bancos/caja-piura.svg" },
      { name: "Caja Arequipa", file: "assets/bancos/caja-arequipa.svg" }
    ],
    note: "Las marcas mostradas pertenecen a sus respectivos titulares. Su uso es solo referencial e informativo."
  },

  /* ---------------------------------------------------------------
     8. SECCIÓN "BENEFICIOS" (diseño tipo mosaico / bento)
  --------------------------------------------------------------- */
  bento: {
    eyebrow: "POR QUÉ IMPULSA CRÉDITO",
    titleBefore: "Tu tarjeta,",
    titleAccent: "en efectivo.",       // parte del título en verde
    titleAfter: "Hoy.",
    subtitle: "Un servicio 100% digital que convierte la línea disponible de tu tarjeta de crédito en dinero real, directo a tu cuenta bancaria.",

    main: {
      tag: "SIN TRÁMITES",
      title: "Efectiviza tu tarjeta cuando lo necesites.",
      text: "Sin papeles, sin esperas, sin ir a una agencia. Todo desde tu celular por WhatsApp.",
      button: { label: "Empieza ahora →", href: "registro.html" },
      // mini flujo visual dentro de la tarjeta principal
      // El monto de abajo se calcula solo con la comisión de platform.commissionPercent
      flow: { fromLabel: "Cargo a tu tarjeta", toLabel: "Recibes hoy", amount: 5000, note: "sin costos ocultos" }
    },
    photo: {
      src: "assets/img/pago-pos.jpg",
      alt: "Cliente realizando un pago con tarjeta en un punto de venta",
      pill: "Procesando ahora mismo",
      caption: "Cientos de operaciones, todos los días.",
      rating: "4.9/5",
      ratingLabel: "+500 clientes atendidos"
    },
    small: [
      { icon: "phone", title: "100% digital", text: "Sin papeleo, sin agencias. Todo desde tu celular." },
      { icon: "lock", title: "Pago seguro", text: "Cobro por POS o link de pago oficial. Tu tarjeta nunca sale de tus manos." }
    ],
    wide: {
      icon: "bolt",
      title: "El dinero, hoy mismo.",
      text: "Recibe tu efectivo el mismo día hábil. Sin esperas de semanas.",
      counter: { value: 500, suffix: "+", label: "operaciones procesadas" }
    },
    // Simulador interactivo (ocupa toda la fila del mosaico)
    simulator: {
      eyebrow: "SIMULADOR",
      title: "¿Cuánto recibirías hoy?",
      subtitle: "Mueve el monto y calcula tu efectivo al instante.",
      labelAmount: "Monto a efectivizar",
      labelFee: "Comisión",
      labelNet: "Recibes en tu cuenta",
      quick: [1000, 2000, 5000, 10000],
      cta: { label: "Solicitar este monto →", href: "registro.html" },
      note: "Cálculo referencial. Te confirmamos la comisión exacta antes de realizar la operación."
    }
  },

  /* ---------------------------------------------------------------
     9. SECCIÓN "NOSOTROS"
  --------------------------------------------------------------- */
  why: {
    image: "assets/img/equipo-reunion.jpg",
    imageAlt: "Equipo de asesores de Impulsa Crédito en una reunión de trabajo",
    imageBadge: "Equipo especializado en gestión crediticia",
    eyebrow: "NOSOTROS",
    title: "Efectivo hoy, y asesoría para tu próximo crédito.",
    subtitle: "Somos especialistas en gestión crediticia. Efectivizamos tu tarjeta al instante y, si necesitas un préstamo personal, hipotecario, vehicular o para tu negocio, te asesoramos gratis para conseguir la mejor opción.",
    items: [
      { icon: "card", title: "Efectivización de tarjetas", desc: "Convertimos la línea disponible de tu tarjeta en efectivo en tu cuenta, con una comisión menor a la disposición de efectivo del banco." },
      { icon: "target", title: "Asesoría crediticia gratuita", desc: "Comparamos entre decenas de entidades financieras para conseguirte el crédito con la mejor tasa." },
      { icon: "shield", title: "100% confiable", desc: "Nunca pedimos claves bancarias ni retenemos tu tarjeta. Cada operación queda registrada y con comprobante." },
      { icon: "clock", title: "Atención inmediata", desc: "Te respondemos por WhatsApp en minutos, de lunes a sábado de 10:00 a.m. a 7:00 p.m." }
    ]
  },

  /* ---------------------------------------------------------------
     10. ESTADÍSTICAS / RESULTADOS
  --------------------------------------------------------------- */
  stats: {
    bg: "assets/img/chart-bg.jpg",
    eyebrow: "RESULTADOS",
    title: "Operaciones exitosas, todos los días.",
    subtitle: "Cientos de personas y negocios ya obtuvieron liquidez inmediata con nosotros.",
    items: [
      { value: 500, suffix: "+", label: "operaciones realizadas" },
      { value: 97, suffix: "%", label: "clientes satisfechos" },
      { value: 24, suffix: "h", label: "máximo para tu depósito" },
      { value: 15, suffix: "+", label: "bancos y tarjetas aceptadas" }
    ]
  },

  /* ---------------------------------------------------------------
     11. CÓMO FUNCIONA (pasos)
  --------------------------------------------------------------- */
  steps: {
    eyebrow: "PROCESO SIMPLE",
    title: "¿Cómo funciona?",
    subtitle: "En solo 4 pasos convertimos la línea de tu tarjeta en dinero real.",
    items: [
      { title: "Escríbenos por WhatsApp", desc: "Indícanos el monto que deseas efectivizar y el banco donde quieres recibir el dinero." },
      { title: "Validamos tu tarjeta", desc: "Verificamos tu identidad y la línea disponible de tu tarjeta. Sin papeleos ni formularios." },
      { title: "Realiza el pago", desc: "Pagas con tu tarjeta de crédito a través de nuestro POS o link de pago 100% seguro." },
      { title: "Recibe tu efectivo", desc: "Te transferimos el dinero a tu cuenta el mismo día, descontando solo nuestra comisión." }
    ],
    ctaText: "¿Listo para obtener tu efectivo? Toma solo unos minutos.",
    ctaButton: { label: "Efectivizar ahora", href: "registro.html" },
    ctaWhatsappLabel: "Preguntas por WhatsApp →",
    ctaWhatsappMessage: "Hola Impulsa Crédito, tengo preguntas sobre la efectivización de tarjetas"
  },

  /* ---------------------------------------------------------------
     12. FORMULARIO "SOLICITA TU OPERACIÓN"
  --------------------------------------------------------------- */
  apply: {
    eyebrow: "SOLICITA TU OPERACIÓN",
    title: "Cuéntanos cuánto necesitas y te contactamos hoy mismo.",
    subtitle: "Completa el formulario y lo enviamos directo a nuestro WhatsApp. Un asesor te escribirá en minutos.",
    trust: ["Sin compromiso", "Datos protegidos"],
    labels: {
      name: "Nombre completo",
      phone: "Celular / WhatsApp",
      type: "¿Qué necesitas?",
      amount: "Monto aproximado (S/)"
    },
    placeholders: {
      name: "Ej. María Torres",
      phone: "999 999 999",
      type: "Selecciona una opción",
      amount: "Ej. 3000"
    },
    typeOptions: [
      "Efectivizar mi tarjeta de crédito",
      "Asesoría para crédito personal",
      "Crédito hipotecario",
      "Crédito vehicular",
      "Crédito para mi negocio",
      "Consolidación de deudas",
      "Otro"
    ],
    submitLabel: "Enviar por WhatsApp",
    messageIntro: "quiero información:"   // se arma: "Hola [marca], quiero información:"
  },

  /* ---------------------------------------------------------------
     13. PREGUNTAS FRECUENTES
  --------------------------------------------------------------- */
  faq: {
    eyebrow: "¿TIENES MÁS DUDAS?",
    title: "Preguntas Frecuentes",
    subtitleBefore: "Si no encuentras la respuesta que buscas,",
    subtitleLink: "escríbenos",
    subtitleAfter: "directamente.",
    items: [
      { q: "¿Qué es Impulsa Crédito?", a: "Somos una empresa peruana de asesoría y gestión crediticia. Nuestro servicio principal es la efectivización de tarjetas de crédito: convertimos tu línea disponible en dinero en tu cuenta, en minutos y 100% digital. Además te asesoramos gratis si buscas un préstamo personal, hipotecario, vehicular o para tu negocio." },
      { q: "¿Qué significa efectivizar mi tarjeta?", a: "Es convertir la línea disponible de tu tarjeta de crédito en dinero depositado en tu cuenta bancaria. Pagas una comisión mucho menor que la de una disposición de efectivo o un retiro en cajero." },
      { q: "¿Cuánto cobran de comisión?", a: "El 1% del monto. Si efectivizas S/ 1,000, la comisión es S/ 10 y recibes S/ 990 en tu cuenta. Te confirmamos el monto exacto antes de hacer la operación. Sin costos ocultos." },
      { q: "¿Cuánto puedo efectivizar?", a: "Desde S/ 100 hasta S/ 30,000 por operación, siempre dentro de la línea disponible de tu tarjeta. Puedes hacer varias operaciones y usar más de una tarjeta si lo necesitas." },
      { q: "¿Cómo me cobran?", a: "Con TU PROPIA tarjeta, igual que cuando compras en una tienda. Te enviamos por WhatsApp un link de pago seguro y pagas desde tu celular sin moverte de casa, o coordinamos el cobro con un POS si lo prefieres. Recibes tu comprobante. Nunca te pedimos tu clave, tu CVV ni nos quedamos con tu tarjeta." },
      { q: "¿En qué momento recibo el dinero?", a: "Apenas se confirma el cobro, transferimos a tu cuenta: normalmente llega en minutos y, como máximo, el mismo día hábil. Depositamos al banco que prefieras, siempre que la cuenta esté a tu nombre. Puedes seguir el estado de tu operación desde tu cuenta." },
      { q: "¿Qué necesito para empezar?", a: "Tres cosas: tu DNI vigente, una tarjeta de crédito con línea disponible y una cuenta bancaria a tu nombre. Aceptamos Visa, Mastercard, American Express y Diners de cualquier banco, caja o financiera del Perú." },
      { q: "¿Es seguro?", a: "Sí. El cobro se realiza por POS o link de pago oficial, siempre con comprobante. Tus documentos viajan encriptados y se usan únicamente para verificar tu identidad, conforme a la Ley de Protección de Datos Personales. Nunca pedimos claves bancarias ni retenemos tu tarjeta física." }
    ]
  },

  /* ---------------------------------------------------------------
     14. SECCIÓN DE CONTACTO
  --------------------------------------------------------------- */
  contactSection: {
    eyebrow: "ESTAMOS PARA AYUDARTE",
    title: "¿Necesitas más información?",
    subtitle: "Nuestro equipo te atiende de lunes a sábado, de 10:00 a.m. a 7:00 p.m., para resolver todas tus dudas sobre cómo efectivizar tu tarjeta.",
    ctaButtonLabel: "Contáctanos ahora"
  },

  /* ---------------------------------------------------------------
     15. PIE DE PÁGINA
  --------------------------------------------------------------- */
  footer: {
    tagline: "Convertimos tu tarjeta de crédito en efectivo, hoy mismo. Asesoría y gestión crediticia.",
    navTitle: "Navegación",
    contactTitle: "Contacto",
    legalTitle: "Legal",
    legalLinks: [
      { label: "Términos y condiciones", href: "reclamaciones.html#terminos" },
      { label: "Política de privacidad", href: "reclamaciones.html#privacidad" }
    ],
    claimsLabel: "Libro de Reclamaciones",
    claimsHref: "reclamaciones.html",
    legal: "Impulsa Crédito es una empresa de asesoría y gestión crediticia. La efectivización se realiza mediante medios de pago autorizados. No otorgamos préstamos directamente."
  },

  /* ---------------------------------------------------------------
     16. LIBRO DE RECLAMACIONES (página reclamaciones.html)
  --------------------------------------------------------------- */
  claims: {
    company: "IMPULSA CRÉDITO S.A.C.",
    ruc: "20000000000",           // <-- COLOCA TU RUC REAL
    address: "Av. Ejemplo 123, Lima, Perú",
    title: "Libro de Reclamaciones",
    subtitle: "Conforme al Código de Protección y Defensa del Consumidor (Ley N.° 29571), ponemos a tu disposición nuestro Libro de Reclamaciones virtual.",
    deadlineNote: "El proveedor debe dar respuesta al reclamo o queja en un plazo no mayor a quince (15) días hábiles, pudiendo ampliarlo hasta por quince (15) días adicionales previa comunicación al consumidor.",
    defRec: "Reclamo: disconformidad relacionada a los productos o servicios contratados.",
    defQueja: "Queja: disconformidad no relacionada a los productos o servicios; o malestar respecto a la atención al público."
  }

};
