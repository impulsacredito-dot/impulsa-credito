-- =====================================================================
-- IMPULSA CRÉDITO — Vistas de orden (paso 6)
-- =====================================================================
-- Crea tres "tablas de resumen" que puedes abrir en Supabase igual que
-- cualquier tabla, pero que juntan la información ya ordenada:
--
--   resumen_clientes     una fila por cliente, con sus totales
--   detalle_tarjetas     qué tarjetas tiene cada uno y de qué tipo
--   detalle_fotos        qué fotos subió cada uno y dónde están
--
-- Dónde verlas: Supabase → Table Editor → arriba, cambia de "tables"
-- a "views". También aparecen en el SQL Editor.
--
-- CÓMO USARLO:
--   Supabase → SQL Editor → New query → pega TODO → Run
--
-- Solo tú (administrador) puedes leerlas. Es seguro ejecutarlo más de
-- una vez.
-- =====================================================================

-- ---------- 1. UN CLIENTE POR FILA, CON TODO SUMADO ----------
drop view if exists public.resumen_clientes;
create view public.resumen_clientes
with (security_invoker = true) as
select
  p.documento                                            as dni,
  trim(coalesce(p.nombres,'') || ' ' || coalesce(p.apellidos,'')) as cliente,
  p.celular,
  p.email                                                as correo,
  coalesce(d.estado, 'sin subir')                        as identidad,
  count(distinct t.id)                                   as tarjetas,
  string_agg(distinct (t.banco || ' ' || coalesce(t.marca,'') || ' ····' || coalesce(t.ultimos4,'')), ' / ')
                                                         as detalle_tarjetas,
  count(distinct c.id)                                   as cuentas,
  count(distinct o.id)                                   as operaciones,
  coalesce(sum(distinct case when o.estado = 'completada' then o.monto end), 0)   as total_efectivizado,
  coalesce(sum(distinct case when o.estado = 'completada' then o.comision end), 0) as comisiones_ganadas,
  p.creado_en                                            as se_registro,
  p.id                                                   as carpeta_de_fotos
from public.perfiles p
left join lateral (
  select estado from public.documentos dd
  where dd.user_id = p.id order by dd.creado_en desc limit 1
) d on true
left join public.tarjetas    t on t.user_id = p.id
left join public.cuentas     c on c.user_id = p.id
left join public.operaciones o on o.user_id = p.id
group by p.id, p.documento, p.nombres, p.apellidos, p.celular, p.email, d.estado, p.creado_en
order by p.creado_en desc;

-- ---------- 2. QUÉ TARJETA USA CADA CLIENTE ----------
drop view if exists public.detalle_tarjetas;
create view public.detalle_tarjetas
with (security_invoker = true) as
select
  p.documento  as dni,
  trim(coalesce(p.nombres,'') || ' ' || coalesce(p.apellidos,'')) as cliente,
  t.banco,
  t.marca      as tipo_de_tarjeta,     -- Visa, Mastercard, Amex...
  t.ultimos4,
  t.titular,
  t.dia_pago,
  t.estado,
  case when t.principal then 'principal' else 'secundaria' end as uso,
  t.foto_frontal,
  t.foto_posterior,
  t.creado_en  as registrada_el
from public.tarjetas t
join public.perfiles p on p.id = t.user_id
order by p.documento, t.principal desc, t.creado_en desc;

-- ---------- 3. LAS FOTOS DE CADA CLIENTE ----------
drop view if exists public.detalle_fotos;
create view public.detalle_fotos
with (security_invoker = true) as
select dni, cliente, tipo, archivo, subida_el from (
  select p.documento as dni,
         trim(coalesce(p.nombres,'') || ' ' || coalesce(p.apellidos,'')) as cliente,
         'DNI frente'   as tipo, d.dni_frontal   as archivo, d.creado_en as subida_el
  from public.documentos d join public.perfiles p on p.id = d.user_id where d.dni_frontal is not null
  union all
  select p.documento,
         trim(coalesce(p.nombres,'') || ' ' || coalesce(p.apellidos,'')),
         'DNI reverso', d.dni_posterior, d.creado_en
  from public.documentos d join public.perfiles p on p.id = d.user_id where d.dni_posterior is not null
  union all
  select p.documento,
         trim(coalesce(p.nombres,'') || ' ' || coalesce(p.apellidos,'')),
         'Selfie', d.selfie, d.creado_en
  from public.documentos d join public.perfiles p on p.id = d.user_id where d.selfie is not null
  union all
  select p.documento,
         trim(coalesce(p.nombres,'') || ' ' || coalesce(p.apellidos,'')),
         'Tarjeta ' || t.banco || ' ····' || coalesce(t.ultimos4,'') || ' (frente)', t.foto_frontal, t.creado_en
  from public.tarjetas t join public.perfiles p on p.id = t.user_id where t.foto_frontal is not null
  union all
  select p.documento,
         trim(coalesce(p.nombres,'') || ' ' || coalesce(p.apellidos,'')),
         'Tarjeta ' || t.banco || ' ····' || coalesce(t.ultimos4,'') || ' (reverso)', t.foto_posterior, t.creado_en
  from public.tarjetas t join public.perfiles p on p.id = t.user_id where t.foto_posterior is not null
) f
order by dni, subida_el desc;

-- ---------- 4. PERMISOS ----------
-- security_invoker = las vistas respetan las reglas de siempre:
-- un cliente solo vería lo suyo; tú, como administrador, lo ves todo.
grant select on public.resumen_clientes, public.detalle_tarjetas, public.detalle_fotos to authenticated;

-- =====================================================================
-- CÓMO LEER "carpeta_de_fotos"
-- Es el nombre de la carpeta del cliente dentro de Storage → documentos.
-- Copia ese valor y pégalo en el buscador del bucket para ver sus fotos.
-- Más cómodo todavía: ábrelas desde el panel, en Clientes → Ver ficha.
-- =====================================================================
