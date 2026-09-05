# Impulsa Crédito — Sitio web + Plataforma de usuario

Sitio estático (HTML + CSS + JS) con landing page y una plataforma de usuario
(registro, login, verificación de identidad, tarjetas, cuentas, operaciones,
historial y comprobantes).

## Estructura

```
index.html          Landing page (todo su contenido sale de js/config.js)
registro.html       Crear cuenta (3 pasos)
login.html          Iniciar sesión
app.html            Panel del usuario (rutas: #/inicio, #/identificacion, #/operacion,
                    #/tarjetas, #/cuentas, #/historial, #/comprobantes, #/ajustes)
reclamaciones.html  Libro de Reclamaciones virtual + Términos y Política de privacidad

css/styles.css      Estilos de la landing (colores y tamaños base al inicio, en :root)
css/app.css         Estilos de registro/login/panel

js/config.js        ★ AQUÍ SE EDITA TODO: textos, WhatsApp, colores, fotos, bancos,
                    comisión, montos mínimo/máximo, horarios...
js/script.js        Motor de la landing (lee config.js) + animaciones
js/app-core.js      Núcleo de la plataforma: datos, autenticación, utilidades
js/auth.js          Lógica de registro e inicio de sesión
js/app.js           Panel del usuario (todas las vistas)
js/reclamos.js      Formulario del Libro de Reclamaciones

assets/logo.png            Logo completo para FONDOS OSCUROS (texto blanco)
assets/logo-dark.png       Logo completo para FONDOS CLAROS (texto negro)
assets/logo-icon.png       Isotipo (sin nombre) para fondos oscuros
assets/logo-icon-dark.png  Isotipo para fondos claros
assets/icon-negro.png      Avatar redes sociales (fondo negro)
assets/icon-verde.png      Avatar redes sociales (fondo verde)
assets/icon-blanco.png     Avatar redes sociales (fondo blanco)
assets/favicon.png         Ícono de la pestaña
assets/img/                Fotos del sitio (puedes reemplazarlas por las tuyas)
.vscode/                   Configuración recomendada para Visual Studio Code
```

## Cómo personalizar

1. Abre `js/config.js` con cualquier editor de texto.
2. Cambia textos, el número de WhatsApp (`contact.whatsapp`), colores (`theme`),
   fotos (rutas dentro de `assets/img/`), bancos y la comisión (`platform.commissionPercent`).
3. Guarda y recarga la página.

Tamaños globales (logo, títulos, letra base): variables al inicio de `css/styles.css`.

### ⚠️ Antes de publicar, completa estos datos en `js/config.js`
- `contact.whatsapp` → tu número real (código de país + número, sin `+`).
- `contact.email`, `contact.city`, `contact.hoursLabel` → tus datos y horario.
- `claims.company`, `claims.ruc`, `claims.address` → **razón social, RUC y dirección reales**.
  Son obligatorios por ley en el Libro de Reclamaciones.
- `platform.commissionPercent`, `minAmount`, `maxAmount` → tu comisión y montos.

### Simulador de la landing
Es una **sección propia** (`#simulador`) que calcula cuánto recibe el cliente.
Se configura en `bento.simulator` y usa la comisión de `platform.commissionPercent`
(actualmente **1%**).

### Logos de bancos (carrusel infinito)
Los archivos están en `assets/bancos/` y se listan en `partners.logos` (config.js).

> ⚠️ **Los logos incluidos son provisionales** (el nombre de cada entidad en su color
> corporativo). No pude descargar los logos oficiales porque son marcas registradas que
> no están disponibles libremente en la web.
>
### Cómo poner TUS logos descargados (2 formas)

**Forma A — la más rápida (sin tocar código):**
Renombra cada logo que descargaste con el nombre exacto del archivo que ya existe
y reemplázalo dentro de `assets/bancos/`:

| Entidad            | Nombre del archivo        |
|--------------------|---------------------------|
| Visa               | `visa.svg`                |
| Mastercard         | `mastercard.svg`          |
| American Express   | `amex.svg`                |
| Diners Club        | `diners.svg`              |
| BCP                | `bcp.svg`                 |
| Interbank          | `interbank.svg`           |
| BBVA               | `bbva.svg`                |
| Scotiabank         | `scotiabank.svg`          |
| Banco de la Nación | `banco-nacion.svg`        |
| BanBif             | `banbif.svg`              |
| Mibanco            | `mibanco.svg`             |
| Banco Falabella    | `falabella.svg`           |
| Banco Ripley       | `ripley.svg`              |
| Caja Piura         | `caja-piura.svg`          |
| Caja Arequipa      | `caja-arequipa.svg`       |

**Forma B — si tus archivos son PNG (o quieres otros nombres):**
Copia tus imágenes a `assets/bancos/` con el nombre que quieras y edita la lista
`partners.logos` en `js/config.js` poniendo la ruta real. Ejemplo:
```js
{ name: "BCP", file: "assets/bancos/bcp.png" },
```

**Recomendaciones para que se vean bien:**
- Fondo **transparente** (PNG o SVG). Si tu logo trae fondo blanco, igual funciona
  porque la tarjeta del carrusel es blanca.
- Formato horizontal, unos 400×140 px o más (el sitio lo escala solo).
- Evita imágenes con mucho margen alrededor: se verán pequeñas.
- Puedes agregar o quitar entidades libremente añadiendo o borrando líneas de
  `partners.logos`.
>
> Ten en cuenta que mostrar logos de bancos puede sugerir una alianza comercial.
> Si no tienes convenio con ellos, conviene mantener el aviso legal que aparece bajo
> el carrusel (`partners.note`) o mostrar solo Visa/Mastercard/Amex/Diners.

### Libro de Reclamaciones
`reclamaciones.html` implementa el libro virtual: registra el reclamo o queja, genera un
código (LR-AÑO-XXXXX), muestra la constancia imprimible y permite enviar copia por WhatsApp.
Los registros quedan guardados en el navegador (`localStorage`). Para recibirlos por correo
o en una base de datos necesitas un backend o un servicio de formularios.

## La plataforma de usuario (cómo funciona)

- **Registro**: datos personales → correo y contraseña → confirmación.
- **Identificación**: DNI frontal, DNI posterior y selfie (subir foto o usar la cámara).
  Queda "En revisión" hasta que tu equipo la apruebe.
- **Mis tarjetas**: banco, últimos 4 dígitos, titular, foto de la tarjeta con **editor de
  censura** (el usuario arrastra sobre los números para taparlos antes de guardar).
- **Mis cuentas**: cuenta bancaria donde recibe el dinero.
- **Nueva operación**: elige tipo (efectivizar / autopago), tarjeta, cuenta y monto; ve la
  comisión y el neto; se crea en estado *Pendiente de pago* y puede avisar por WhatsApp.
- **Historial y comprobantes**: filtros por estado, detalle con seguimiento e impresión.
- En el detalle de una operación hay un botón **"Simular pago confirmado (demo)"** para
  probar el flujo completo. Para ocultarlo pon `demoTools: false` en `platform` (config.js).

## 📥 Recibir y guardar los datos de tus clientes (IMPORTANTE)

Por defecto (`backend.provider: "local"`) todo lo que sube el cliente —DNI, selfie,
fotos de tarjeta— queda **solo en el navegador de esa persona**. Tú no lo recibes.

Para tenerlo guardado y ordenado, activa **Supabase** (gratis, ~15 minutos):

1. Entra a **https://supabase.com** → *Start your project* → crea un proyecto.
   Guarda la contraseña de la base de datos. Elige la región más cercana (São Paulo).
2. En el menú lateral abre **SQL Editor → New query**, copia y pega **todo** el
   contenido de `supabase-setup.sql` (está en esta carpeta) y presiona **Run**.
   Eso crea las tablas y la carpeta de fotos con los permisos correctos.
3. Ve a **Project Settings → API** y copia:
   - **Project URL** (ej. `https://abcdefgh.supabase.co`)
   - La llave **anon public**
4. Abre `js/config.js` → sección `backend` y pega ambos datos, cambiando
   `provider` a `"supabase"`:
   ```js
   backend: {
     provider: "supabase",
     supabaseUrl: "https://abcdefgh.supabase.co",
     supabaseAnonKey: "eyJhbGciOi...",
     bucket: "documentos"
   },
   ```
5. Guarda y sube el sitio. ¡Listo!

### Dónde ves la información
- **Table Editor** (menú lateral): seis tablas ordenadas, como hojas de Excel.
  - `clientes` — cada persona que se registra
  - `documentos` — DNI frontal, posterior y selfie (rutas de las fotos)
  - `tarjetas` — banco, últimos 4 dígitos, titular y fotos ya censuradas
  - `cuentas` — cuenta bancaria donde recibe el dinero
  - `operaciones` — cada solicitud con monto, comisión y estado
  - `reclamos` — Libro de Reclamaciones
  Puedes filtrar, ordenar y exportar a CSV/Excel con un clic.
- **Storage → documentos**: las fotos, en **una carpeta por número de DNI**:
  ```
  70123456/identidad/dni-frontal-2026-09-05....jpg
  70123456/identidad/selfie-2026-09-05....jpg
  70123456/tarjetas/BCP-4598-frontal-2026-09-05....jpg
  ```

### Seguridad
El archivo SQL deja la base configurada para que la web **solo pueda insertar**:
nadie puede leer, editar ni borrar tus datos desde fuera, aunque vea la llave
pública (que por diseño es visible en cualquier web). Solo tú, con tu cuenta de
Supabase, ves la información. El bucket de fotos es **privado**.

> Si no hay internet al momento de registrar, el envío se guarda en cola y se
> reintenta solo cuando vuelve la conexión.

**Plan gratuito de Supabase:** 500 MB de base de datos y 1 GB de fotos — alcanza
para varios miles de clientes. Si creces, el plan pago cuesta ~25 USD/mes.

### Alternativas si prefieres algo aún más simple
- **Google Sheets + Apps Script**: recibes los datos en una hoja de cálculo, pero
  las fotos hay que subirlas aparte a Drive (más trabajo de configuración).
- **Formspree / Basin**: te llegan por correo, pero sin orden ni buscador.

Recomiendo Supabase porque guarda datos *y* fotos juntos y ordenados.

### Cómo se guardan los datos hoy (modo local)
Esta versión guarda las cuentas, fotos y operaciones en el **navegador del usuario**
(localStorage). Sirve para demostrar y probar todo el flujo, pero:
- cada usuario solo ve sus datos en su propio dispositivo,
- tú (como empresa) no recibes las fotos automáticamente: el usuario te avisa por WhatsApp.

Para una operación real (que tú veas las solicitudes, apruebes identidades y tarjetas,
y los usuarios entren desde cualquier dispositivo) hace falta un **backend**. Opciones
gratuitas para empezar: **Supabase** (base de datos + login + almacenamiento de fotos)
o **Firebase**. El código está preparado para conectarlo: toda la lógica de datos está
centralizada en `js/app-core.js` (funciones `load`, `save` y el objeto `auth`).

## 🚀 Publicar en Vercel con actualizaciones automáticas

El proyecto ya es un **repositorio Git** (con el primer commit hecho) y trae
`vercel.json` configurado. Falta conectarlo, y eso solo lo puedes hacer tú porque
requiere iniciar sesión con tus cuentas:

**Paso 1 — Subir el código a GitHub** (una sola vez)
1. Entra a https://github.com/new y crea un repositorio **privado** llamado
   `impulsa-credito` (no marques "Add a README").
2. En la carpeta del proyecto abre la terminal de VS Code y pega:
   ```bash
   git remote add origin https://github.com/TU-USUARIO/impulsa-credito.git
   git push -u origin main
   ```
   Te pedirá iniciar sesión en GitHub la primera vez.

**Paso 2 — Conectar Vercel** (una sola vez)
1. Entra a https://vercel.com y regístrate con tu cuenta de GitHub.
2. *Add New… → Project* → elige el repositorio `impulsa-credito` → **Deploy**.
   No cambies nada: Vercel detecta que es un sitio estático.
3. En 1 minuto tendrás tu URL: `https://impulsa-credito.vercel.app` (con HTTPS).
4. Opcional: *Settings → Domains* para conectar tu dominio propio.

**Paso 3 — A partir de ahí, cada cambio se publica solo**
Cuando se modifique cualquier archivo, basta con:
```bash
git add -A
git commit -m "descripción del cambio"
git push
```
Vercel detecta el push y actualiza la web en menos de un minuto. No hay que
volver a subir archivos a mano nunca más.

> Con esto, los cambios que se hagan en esta carpeta (por ti o por Claude) se
> reflejan en la web publicada con solo hacer `git push`.

## Publicar gratis (otras opciones)

Opción más fácil — **Netlify Drop** (sin comandos):
1. Entra a https://app.netlify.com/drop
2. Arrastra la carpeta completa del sitio.
3. Obtienes una URL tipo `https://impulsa-credito.netlify.app` con HTTPS.
4. (Opcional) Conecta tu dominio propio desde el panel de Netlify.

Otras opciones gratuitas: **Vercel**, **Cloudflare Pages**, **GitHub Pages**.

> Nota: la cámara del navegador solo funciona en HTTPS (o en localhost). En Netlify ya
> tienes HTTPS, así que "Usar cámara" funcionará.

## Identidad de marca aplicada
- Tipografía **Montserrat** (Google Fonts) en todo el sitio.
- Colores del manual: verde `#22C55E`, negro `#111111`, blanco `#FFFFFF`.
- Logo en dos versiones (fondo oscuro / fondo claro) + avatares para redes.

## Trabajar en Visual Studio Code
1. Abre la carpeta del proyecto en VS Code (`Archivo → Abrir carpeta…`).
2. Acepta instalar las extensiones recomendadas (aparece un aviso), sobre todo **Live Server**.
3. Clic derecho en `index.html` → **Open with Live Server**. Se abrirá en el navegador
   y se recargará solo cada vez que guardes un cambio.

## Ver el sitio en tu PC (sin VS Code)
Abre `index.html` con doble clic, o usa un servidor local:
```
python -m http.server 5173
```
y entra a http://localhost:5173

> Nota: si editas `config.js` y no ves los cambios, recarga con **Ctrl + F5**
> (fuerza al navegador a no usar la versión guardada en caché).
