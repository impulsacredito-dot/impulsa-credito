// =====================================================================
// IMPULSA CRÉDITO — Función "enviar-reclamo" (Supabase Edge Function)
// =====================================================================
// Envía al consumidor la copia de su reclamo o queja del Libro de
// Reclamaciones, y una copia oculta a la empresa.
//
// SEGURIDAD
// · La página solo manda el CÓDIGO del reclamo. Los datos se leen aquí,
//   en el servidor: nadie puede usar esta función para mandar textos
//   inventados a cualquier correo.
// · Solo envía reclamos creados en los últimos 30 minutos y una sola vez.
// · Máximo 3 copias por correo cada 24 horas (evita abusos).
// · Las claves viven en los "Secrets" de Supabase, nunca en la web.
//
// Instalación paso a paso: LEEME.txt (en esta misma carpeta).
// =====================================================================

const EMPRESA = {
  marca: "Impulsa Crédito",
  razon: "PRIMEVISION CONSULTANCY S.A.C.",
  ruc: "20611536195",
  direccion: "CAL. FRANCISCO DEL CASTILLO NRO. 506, LIMA - LIMA - MIRAFLORES",
  web: "https://impulsacredito.com",
};
const ORIGENES = ["https://impulsacredito.com", "https://www.impulsacredito.com"];

const URL_DB = Deno.env.get("SUPABASE_URL") ?? "";
const LLAVE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const RESEND = Deno.env.get("RESEND_API_KEY") ?? "";
const REMITENTE = Deno.env.get("CORREO_REMITENTE") ?? "";      // ej. Impulsa Crédito <reclamos@impulsacredito.com>
const COPIA_EMPRESA = Deno.env.get("CORREO_EMPRESA") ?? "";    // ej. contacto@impulsacredito.com

function cabecerasCors(origen: string) {
  return {
    "Access-Control-Allow-Origin": ORIGENES.includes(origen) ? origen : ORIGENES[0],
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}
function responder(cuerpo: unknown, estado: number, cors: Record<string, string>) {
  return new Response(JSON.stringify(cuerpo), { status: estado, headers: { ...cors, "Content-Type": "application/json" } });
}
function esc(s: unknown) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}
async function db(ruta: string, init: RequestInit = {}) {
  return fetch(URL_DB + "/rest/v1/" + ruta, {
    ...init,
    headers: { apikey: LLAVE, Authorization: "Bearer " + LLAVE, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
}

function plantilla(r: Record<string, unknown>) {
  const fila = (k: string, v: unknown) =>
    `<tr><td style="padding:6px 0;color:#6b7a72;font-size:13px;width:170px;vertical-align:top">${esc(k)}</td><td style="padding:6px 0;font-size:13px;color:#111">${esc(v || "—")}</td></tr>`;
  const fecha = new Date(String(r.creado_en)).toLocaleString("es-PE", { timeZone: "America/Lima", dateStyle: "long", timeStyle: "short" });
  return `<div style="background:#f4f6f5;padding:24px 12px;font-family:Segoe UI,Roboto,Arial,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden">
    <tr><td style="background:#111;padding:20px 26px;color:#fff;font-size:18px;font-weight:800">Impulsa <span style="color:#22c55e">Crédito</span></td></tr>
    <tr><td style="padding:24px 26px">
      <h1 style="margin:0 0 6px;font-size:19px;color:#111">Libro de Reclamaciones — copia de tu ${esc(String(r.tipo || "reclamo").toLowerCase())}</h1>
      <p style="margin:0 0 16px;font-size:14px;color:#3d4a44;line-height:1.6">Recibimos tu ${esc(String(r.tipo || "reclamo").toLowerCase())}. Guarda este correo: es tu constancia.</p>
      <p style="margin:0 0 18px;font-size:22px;font-weight:800;letter-spacing:.04em;color:#15803d">${esc(r.codigo)}</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        ${fila("Fecha", fecha)}
        ${fila("Proveedor", `${EMPRESA.razon} (${EMPRESA.marca})`)}
        ${fila("RUC", EMPRESA.ruc)}
        ${fila("Domicilio", EMPRESA.direccion)}
        ${fila("Consumidor", `${r.nombres ?? ""} ${r.apellidos ?? ""}`)}
        ${fila("Documento", `${r.tipo_doc ?? ""} ${r.documento ?? ""}`)}
        ${fila("Domicilio del consumidor", r.domicilio)}
        ${fila("Teléfono", r.telefono)}
        ${fila("Correo", r.email)}
        ${r.menor_edad ? fila("Padre, madre o apoderado", r.apoderado) : ""}
        ${fila("Bien contratado", r.bien)}
        ${fila("Monto reclamado", r.monto ? "S/ " + r.monto : "")}
        ${fila("Descripción", r.descripcion)}
        ${fila("Tipo", r.tipo)}
        ${fila("Detalle", r.detalle)}
        ${fila("Pedido", r.pedido)}
      </table>
      <p style="margin:18px 0 0;padding:12px 14px;background:#fffbeb;border-radius:10px;font-size:12.5px;color:#78350f;line-height:1.6">
        El proveedor debe responder en un plazo no mayor a quince (15) días hábiles, que puede ampliarse hasta por quince (15) días más previa comunicación al consumidor.
        La formulación del reclamo no impide acudir a otras vías de solución de controversias ni es requisito previo para interponer una denuncia ante el INDECOPI.
      </p>
    </td></tr>
    <tr><td style="background:#f7faf8;padding:14px 26px;font-size:11px;color:#8a978f;line-height:1.6">
      ${esc(EMPRESA.razon)} · RUC ${esc(EMPRESA.ruc)} · ${esc(EMPRESA.direccion)}<br>${esc(EMPRESA.web)}
    </td></tr>
  </table></div>`;
}

Deno.serve(async (req) => {
  const cors = cabecerasCors(req.headers.get("origin") ?? "");
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return responder({ ok: false, error: "metodo" }, 405, cors);
  if (!URL_DB || !LLAVE || !RESEND || !REMITENTE) return responder({ ok: false, error: "sin_configurar" }, 503, cors);

  try {
    const { codigo } = await req.json();
    if (!/^LR-\d{4}-[A-Z0-9]{3,12}$/.test(String(codigo ?? ""))) return responder({ ok: false, error: "codigo" }, 400, cors);

    const hace30min = new Date(Date.now() - 30 * 60e3).toISOString();
    const rr = await db(`reclamos?select=*&codigo=eq.${encodeURIComponent(codigo)}&correo_enviado_en=is.null&creado_en=gte.${encodeURIComponent(hace30min)}&limit=1`);
    const r = (await rr.json())?.[0];
    if (!r || !r.email) return responder({ ok: false, error: "no_encontrado" }, 404, cors);

    const hace24h = new Date(Date.now() - 864e5).toISOString();
    const rc = await db(`reclamos?select=id&email=eq.${encodeURIComponent(r.email)}&correo_enviado_en=gte.${encodeURIComponent(hace24h)}`);
    if (((await rc.json()) ?? []).length >= 3) return responder({ ok: false, error: "limite" }, 429, cors);

    const envio = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: "Bearer " + RESEND, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: REMITENTE,
        to: [r.email],
        ...(COPIA_EMPRESA ? { bcc: [COPIA_EMPRESA], reply_to: COPIA_EMPRESA } : {}),
        subject: `Copia de tu ${String(r.tipo || "reclamo").toLowerCase()} ${r.codigo} — Libro de Reclamaciones`,
        html: plantilla(r),
      }),
    });
    if (!envio.ok) {
      await db(`reclamos?id=eq.${r.id}`, { method: "PATCH", body: JSON.stringify({ correo_estado: "error " + envio.status }) });
      return responder({ ok: false, error: "envio" }, 502, cors);
    }
    await db(`reclamos?id=eq.${r.id}`, { method: "PATCH", body: JSON.stringify({ correo_enviado_en: new Date().toISOString(), correo_estado: "enviado" }) });
    return responder({ ok: true }, 200, cors);
  } catch (_e) {
    return responder({ ok: false, error: "interno" }, 500, cors);
  }
});
