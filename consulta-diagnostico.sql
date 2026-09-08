-- =====================================================================
-- IMPULSA CRÉDITO — Comprobación de integridad
-- =====================================================================
-- Responde a la pregunta: ¿hay alguna foto o algún dato colocado en el
-- cliente equivocado?
--
-- Cómo funciona: cada archivo se guarda en una carpeta que lleva el
-- identificador de su dueño. Si el dueño del registro y la carpeta del
-- archivo no coinciden, hay un cruce.
--
-- Pégala en Supabase → SQL Editor → Run.
-- =====================================================================


-- ---------- 1. LA PRUEBA IMPORTANTE: ¿ALGÚN ARCHIVO MAL COLOCADO? ----------
-- Si esta consulta no devuelve NINGUNA fila, no hay cruces. Todo correcto.
select 'TARJETA' as origen,
       p.documento as dni_del_registro,
       trim(p.nombres || ' ' || p.apellidos) as cliente,
       t.banco || ' ····' || t.ultimos4 as detalle,
       t.foto_frontal as archivo,
       split_part(t.foto_frontal, '/', 1) as carpeta_del_archivo,
       t.user_id::text as dueno_del_registro
from public.tarjetas t
join public.perfiles p on p.id = t.user_id
where t.foto_frontal is not null
  and split_part(t.foto_frontal, '/', 1) <> t.user_id::text

union all

select 'TARJETA (reverso)',
       p.documento,
       trim(p.nombres || ' ' || p.apellidos),
       t.banco || ' ····' || t.ultimos4,
       t.foto_posterior,
       split_part(t.foto_posterior, '/', 1),
       t.user_id::text
from public.tarjetas t
join public.perfiles p on p.id = t.user_id
where t.foto_posterior is not null
  and split_part(t.foto_posterior, '/', 1) <> t.user_id::text

union all

select 'IDENTIDAD',
       p.documento,
       trim(p.nombres || ' ' || p.apellidos),
       'DNI / selfie',
       coalesce(d.dni_frontal, d.dni_posterior, d.selfie),
       split_part(coalesce(d.dni_frontal, d.dni_posterior, d.selfie), '/', 1),
       d.user_id::text
from public.documentos d
join public.perfiles p on p.id = d.user_id
where coalesce(d.dni_frontal, d.dni_posterior, d.selfie) is not null
  and split_part(coalesce(d.dni_frontal, d.dni_posterior, d.selfie), '/', 1) <> d.user_id::text;


-- ---------- 2. ¿HAY REGISTROS SIN DUEÑO? ----------
-- Filas antiguas, de antes de que existieran las cuentas.
-- Si aparecen, no salen en el panel y conviene borrarlas.
select 'tarjetas'    as tabla, count(*) as sin_dueno from public.tarjetas    where user_id is null
union all select 'documentos',  count(*) from public.documentos  where user_id is null
union all select 'cuentas',     count(*) from public.cuentas     where user_id is null
union all select 'operaciones', count(*) from public.operaciones where user_id is null;


-- ---------- 3. ¿LA MISMA TARJETA EN DOS CLIENTES? ----------
-- Puede ser legítimo (una pareja compartiendo tarjeta) o un error.
select t.banco, t.ultimos4,
       count(distinct t.user_id) as cuantos_clientes,
       string_agg(distinct trim(p.nombres || ' ' || p.apellidos), ' | ') as clientes
from public.tarjetas t
join public.perfiles p on p.id = t.user_id
group by t.banco, t.ultimos4
having count(distinct t.user_id) > 1;


-- ---------- 4. FOTO POR FOTO, CON SU DUEÑO ----------
-- Para revisar a mano. La columna "coincide" debe decir 'ok' en todas.
select p.documento as dni,
       trim(p.nombres || ' ' || p.apellidos) as cliente,
       'Tarjeta ' || t.banco || ' ····' || t.ultimos4 as que_es,
       t.foto_frontal as archivo,
       case when split_part(t.foto_frontal, '/', 1) = t.user_id::text
            then 'ok' else 'CRUCE' end as coincide
from public.tarjetas t
join public.perfiles p on p.id = t.user_id
where t.foto_frontal is not null
order by p.documento;
