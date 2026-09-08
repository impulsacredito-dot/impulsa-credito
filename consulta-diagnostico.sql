-- =====================================================================
-- CONSULTA DE COMPROBACIÓN — ¿de quién es cada tarjeta?
-- =====================================================================
-- Pégala en Supabase → SQL Editor → Run.
-- Te dice, para cada tarjeta: a qué cliente pertenece, cuándo se
-- registró, en qué estado está y si tiene foto o no.
-- =====================================================================

select
  p.documento                         as dni,
  trim(p.nombres || ' ' || p.apellidos) as cliente,
  t.banco,
  t.marca                             as tipo,
  t.ultimos4,
  t.titular                           as titular_impreso,
  t.estado,
  case when t.foto_frontal is not null then 'sí' else 'NO' end   as tiene_foto_frente,
  case when t.foto_posterior is not null then 'sí' else 'no'     end as tiene_foto_reverso,
  t.creado_en                         as registrada_el,
  case when d.id is null then 'NO subió DNI ni selfie' else 'DNI: ' || d.estado end as identificacion
from public.tarjetas t
join public.perfiles p on p.id = t.user_id
left join lateral (
  select id, estado from public.documentos dd
  where dd.user_id = p.id order by dd.creado_en desc limit 1
) d on true
order by t.creado_en desc;
