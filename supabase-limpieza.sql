-- =====================================================================
-- IMPULSA CRÉDITO — Ordenar Supabase (paso 7)
-- =====================================================================
-- Deja la base con lo justo y en un formato legible:
--
--   BORRA   la tabla "clientes" (sobra: era del sistema anterior, de
--           antes de que cada cliente tuviera cuenta propia)
--   BORRA   las vistas resumen_clientes, detalle_tarjetas y
--           detalle_fotos (se fusionan en una sola)
--   CREA    "clientes_resumen": UNA FILA POR PERSONA, con sus datos,
--           sus totales y sus fotos en columnas
--   MANTIENE "pendientes": lo que espera tu revisión
--
-- Después de ejecutarlo, en el Table Editor verás:
--
--   👁 clientes_resumen   <- tu vista principal: una fila por cliente
--   👁 pendientes         <- lo que hay que revisar hoy
--   📋 operaciones        <- cada efectivización
--   📋 reclamos           <- libro de reclamaciones
--   (y debajo las tablas internas: perfiles, documentos, tarjetas,
--    cuentas, avisos, admins. No las toques a mano: son las piezas
--    que alimentan las vistas de arriba.)
--
-- CÓMO USARLO:
--   Supabase → SQL Editor → New query → pega TODO → Run
-- Es seguro ejecutarlo más de una vez.
-- =====================================================================


-- ---------- 1. FUERA LO QUE SOBRA ----------
-- "clientes" la usaba el sistema antiguo, cuando los datos llegaban sin
-- cuenta de usuario. Hoy todo vive en "perfiles", ligado a cada cuenta.
drop table if exists public.clientes cascade;

-- estas tres se fusionan en clientes_resumen
drop view if exists public.resumen_clientes;
drop view if exists public.detalle_tarjetas;
drop view if exists public.detalle_fotos;


-- ---------- 2. UNA FILA POR CLIENTE, CON SUS FOTOS ----------
create view public.clientes_resumen
with (security_invoker = true) as
select
  -- quién es
  p.documento                                                     as dni,
  trim(coalesce(p.nombres,'') || ' ' || coalesce(p.apellidos,'')) as cliente,
  p.celular,
  p.email                                                         as correo,

  -- en qué punto está
  coalesce(d.estado, 'sin subir')                                 as identidad,

  -- sus fotos, cada una en su columna
  d.dni_frontal                                                   as foto_dni_frente,
  d.dni_posterior                                                 as foto_dni_reverso,
  d.selfie                                                        as foto_selfie,
  t.fotos_tarjetas,

  -- qué tiene registrado
  coalesce(t.n, 0)                                                as n_tarjetas,
  t.tarjetas,
  coalesce(c.n, 0)                                                as n_cuentas,
  c.cuentas,

  -- cuánto ha movido
  coalesce(o.n, 0)                                                as n_operaciones,
  coalesce(o.efectivizado, 0)                                     as efectivizado,
  coalesce(o.comision, 0)                                         as tu_comision,

  to_char(p.creado_en at time zone 'America/Lima', 'DD/MM/YYYY HH24:MI') as se_registro,
  p.id                                                            as carpeta_fotos

from public.perfiles p

-- su identidad más reciente
left join lateral (
  select dd.estado, dd.dni_frontal, dd.dni_posterior, dd.selfie
  from public.documentos dd
  where dd.user_id = p.id
  order by dd.creado_en desc
  limit 1
) d on true

-- sus tarjetas, resumidas en una linea
left join lateral (
  select count(*) as n,
         string_agg(tt.banco || ' ' || coalesce(tt.marca,'') || ' ····' || coalesce(tt.ultimos4,'') ||
                    case when tt.principal then ' (principal)' else '' end,
                    '  |  ' order by tt.principal desc, tt.creado_en) as tarjetas,
         string_agg(tt.foto_frontal, '  |  ' order by tt.creado_en)
           filter (where tt.foto_frontal is not null)                 as fotos_tarjetas
  from public.tarjetas tt where tt.user_id = p.id
) t on true

-- sus cuentas bancarias
left join lateral (
  select count(*) as n,
         string_agg(cc.banco || ' ' || coalesce(cc.tipo,'') || ' ' || coalesce(cc.numero,''),
                    '  |  ' order by cc.creado_en) as cuentas
  from public.cuentas cc where cc.user_id = p.id
) c on true

-- sus operaciones (solo cuenta el dinero realmente cobrado)
left join lateral (
  select count(*) as n,
         coalesce(sum(oo.monto)    filter (where oo.estado = 'completada'), 0) as efectivizado,
         coalesce(sum(oo.comision) filter (where oo.estado = 'completada'), 0) as comision
  from public.operaciones oo where oo.user_id = p.id
) o on true

order by p.creado_en desc;


-- ---------- 3. LO QUE ESPERA TU REVISIÓN ----------
drop view if exists public.pendientes;
create view public.pendientes
with (security_invoker = true) as
select
  'Identidad'                                                     as revisar,
  p.documento                                                     as dni,
  trim(coalesce(p.nombres,'') || ' ' || coalesce(p.apellidos,'')) as cliente,
  p.celular,
  ''                                                              as detalle,
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


-- ---------- 4. PERMISOS ----------
-- security_invoker: las vistas respetan las reglas de siempre.
-- Un cliente solo vería lo suyo; tú, como administrador, lo ves todo.
grant select on public.clientes_resumen, public.pendientes to authenticated;


-- =====================================================================
-- CÓMO LEER LAS COLUMNAS DE FOTOS
-- Guardan la RUTA del archivo dentro de Storage → documentos.
-- Para verlas cómodamente no hace falta buscar carpetas: entra al
-- panel, pestaña Clientes, botón "Ver ficha". Ahí salen todas juntas.
-- =====================================================================
