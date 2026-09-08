-- =====================================================================
-- IMPULSA CRÉDITO — Vistas de orden (paso 6)
-- =====================================================================
-- Crea cuatro "tablas de consulta" que se abren en Supabase igual que
-- cualquier tabla, pero con la información ya ordenada y legible:
--
--   resumen_clientes     una fila por cliente, con sus totales
--   detalle_tarjetas     qué tarjetas tiene cada uno y de qué tipo
--   detalle_fotos        qué fotos subió cada uno y dónde están
--   pendientes           lo que espera tu revisión ahora mismo
--
-- Dónde verlas: Supabase → Table Editor → menú de la izquierda.
-- Aparecen con un icono de "ojo" (son vistas, no tablas).
--
-- CÓMO USARLO:
--   Supabase → SQL Editor → New query → pega TODO → Run
--
-- Solo tú (administrador) puedes leerlas. Es seguro ejecutarlo más de
-- una vez: reemplaza las anteriores.
-- =====================================================================

-- ---------- 1. UN CLIENTE POR FILA, CON TODO SUMADO ----------
drop view if exists public.resumen_clientes;
create view public.resumen_clientes
with (security_invoker = true) as
select
  p.documento                                                     as dni,
  trim(coalesce(p.nombres,'') || ' ' || coalesce(p.apellidos,'')) as cliente,
  p.celular,
  coalesce(d.estado, 'sin subir')                                 as dni_y_selfie,
  count(distinct t.id)                                            as n_tarjetas,
  string_agg(distinct (t.banco || ' ' || coalesce(t.marca,'') || ' ····' || coalesce(t.ultimos4,'')), ' | ')
                                                                  as tarjetas,
  count(distinct c.id)                                            as n_cuentas,
  count(distinct o.id)                                            as n_operaciones,
  coalesce(sum(distinct case when o.estado = 'completada' then o.monto    end), 0) as efectivizado,
  coalesce(sum(distinct case when o.estado = 'completada' then o.comision end), 0) as tu_comision,
  p.email                                                         as correo,
  to_char(p.creado_en at time zone 'America/Lima', 'DD/MM/YYYY HH24:MI') as se_registro,
  p.id                                                            as carpeta_fotos
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
  row_number() over (partition by p.documento order by t.principal desc, t.creado_en) as n,
  p.documento                                                     as dni,
  trim(coalesce(p.nombres,'') || ' ' || coalesce(p.apellidos,'')) as cliente,
  t.banco,
  t.marca                                                         as tipo,      -- Visa, Mastercard...
  t.ultimos4,
  case when t.principal then 'principal' else 'secundaria' end    as uso,
  t.estado,
  t.titular,
  t.dia_pago                                                      as paga_el_dia,
  case when t.foto_frontal   is not null then 'sí' else 'NO' end  as foto_frente,
  case when t.foto_posterior is not null then 'sí' else 'no' end  as foto_reverso,
  to_char(t.creado_en at time zone 'America/Lima', 'DD/MM/YYYY HH24:MI') as registrada
from public.tarjetas t
join public.perfiles p on p.id = t.user_id
order by p.documento, t.principal desc, t.creado_en;

-- ---------- 3. LAS FOTOS DE CADA CLIENTE ----------
-- "archivo" es la ruta dentro de Storage → documentos.
-- Copia el valor de "carpeta" y pégalo en el buscador del bucket.
drop view if exists public.detalle_fotos;
create view public.detalle_fotos
with (security_invoker = true) as
select
  dni, cliente, grupo, foto,
  to_char(subida_el at time zone 'America/Lima', 'DD/MM/YYYY HH24:MI') as subida,
  split_part(archivo, '/', 1) as carpeta,
  archivo
from (
  select p.documento as dni,
         trim(coalesce(p.nombres,'') || ' ' || coalesce(p.apellidos,'')) as cliente,
         '1. Identidad' as grupo, 'DNI frente' as foto, d.dni_frontal as archivo, d.creado_en as subida_el
  from public.documentos d join public.perfiles p on p.id = d.user_id where d.dni_frontal is not null
  union all
  select p.documento, trim(coalesce(p.nombres,'') || ' ' || coalesce(p.apellidos,'')),
         '1. Identidad', 'DNI reverso', d.dni_posterior, d.creado_en
  from public.documentos d join public.perfiles p on p.id = d.user_id where d.dni_posterior is not null
  union all
  select p.documento, trim(coalesce(p.nombres,'') || ' ' || coalesce(p.apellidos,'')),
         '1. Identidad', 'Selfie', d.selfie, d.creado_en
  from public.documentos d join public.perfiles p on p.id = d.user_id where d.selfie is not null
  union all
  select p.documento, trim(coalesce(p.nombres,'') || ' ' || coalesce(p.apellidos,'')),
         '2. Tarjetas', t.banco || ' ····' || coalesce(t.ultimos4,'') || ' frente', t.foto_frontal, t.creado_en
  from public.tarjetas t join public.perfiles p on p.id = t.user_id where t.foto_frontal is not null
  union all
  select p.documento, trim(coalesce(p.nombres,'') || ' ' || coalesce(p.apellidos,'')),
         '2. Tarjetas', t.banco || ' ····' || coalesce(t.ultimos4,'') || ' reverso', t.foto_posterior, t.creado_en
  from public.tarjetas t join public.perfiles p on p.id = t.user_id where t.foto_posterior is not null
) f
order by dni, grupo, subida_el desc;

-- ---------- 4. LO QUE ESPERA TU REVISIÓN ----------
drop view if exists public.pendientes;
create view public.pendientes
with (security_invoker = true) as
select
  'Identidad' as que_revisar,
  p.documento as dni,
  trim(coalesce(p.nombres,'') || ' ' || coalesce(p.apellidos,'')) as cliente,
  p.celular,
  '' as detalle,
  to_char(d.creado_en at time zone 'America/Lima', 'DD/MM/YYYY HH24:MI') as esperando_desde
from public.documentos d join public.perfiles p on p.id = d.user_id
where d.estado = 'en_revision'
union all
select
  'Tarjeta',
  p.documento,
  trim(coalesce(p.nombres,'') || ' ' || coalesce(p.apellidos,'')),
  p.celular,
  t.banco || ' ' || coalesce(t.marca,'') || ' ····' || coalesce(t.ultimos4,''),
  to_char(t.creado_en at time zone 'America/Lima', 'DD/MM/YYYY HH24:MI')
from public.tarjetas t join public.perfiles p on p.id = t.user_id
where t.estado = 'en_revision'
order by esperando_desde;

-- ---------- 5. PERMISOS ----------
-- security_invoker = las vistas respetan las reglas de siempre:
-- un cliente solo vería lo suyo; tú, como administrador, lo ves todo.
grant select on public.resumen_clientes, public.detalle_tarjetas,
                public.detalle_fotos, public.pendientes to authenticated;

-- =====================================================================
-- Las fechas salen en hora de Perú y con formato DD/MM/AAAA.
-- Para ver las fotos de un cliente sin buscar carpetas: entra al panel
-- de administración, pestaña Clientes, botón "Ver ficha".
-- =====================================================================
