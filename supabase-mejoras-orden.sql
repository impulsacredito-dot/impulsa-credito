-- =====================================================================
-- IMPULSA CRÉDITO — Mejoras de orden (paso 7)
-- =====================================================================
-- Cinco arreglos para que la base de datos se mantenga limpia sola,
-- en vez de ir acumulando desorden con cada cliente nuevo.
--
-- Ninguno borra datos. Se puede ejecutar con clientes reales dentro.
--
-- CÓMO USARLO:
--   Supabase → SQL Editor → New query → pega TODO → Run
-- =====================================================================


-- ---------- 1. QUE NO SE CUELEN ESTADOS INVENTADOS ----------
-- Hoy el campo "estado" admite cualquier texto. Si por un error entra
-- "Completada" con mayúscula o "completado", esa fila desaparece de los
-- filtros del panel y deja de aparecer en las cuentas. Esto lo impide.

alter table public.operaciones drop constraint if exists estados_operacion;
alter table public.operaciones add constraint estados_operacion
  check (estado in ('activa','pend_pago','completada','cancelada'));

alter table public.documentos drop constraint if exists estados_documento;
alter table public.documentos add constraint estados_documento
  check (estado in ('en_revision','verificado','rechazado'));

alter table public.tarjetas drop constraint if exists estados_tarjeta;
alter table public.tarjetas add constraint estados_tarjeta
  check (estado in ('en_revision','verificada','rechazado'));


-- ---------- 2. QUE NADIE REGISTRE DOS VECES LA MISMA TARJETA ----------
-- Si un cliente vuelve a subir la misma tarjeta (porque se la
-- rechazaste, o por error), aparecían dos filas iguales y no se sabía
-- cuál revisar. Ahora la segunda vez actualiza en vez de duplicar.
--
-- Nota: se crea solo si no hay duplicados previos. Si falla, ejecuta
-- antes la consulta 3 de consulta-diagnostico.sql para verlos.

create unique index if not exists tarjeta_unica_por_cliente
  on public.tarjetas (user_id, banco, ultimos4);


-- ---------- 3. SABER QUIÉN APROBÓ Y QUIÉN RECHAZÓ ----------
-- Útil el día que trabajes con alguien más, y para poder responder
-- "¿quién aprobó esto y cuándo?" ante un reclamo.

alter table public.documentos add column if not exists revisado_por uuid references auth.users(id);
alter table public.tarjetas   add column if not exists revisado_por uuid references auth.users(id);
alter table public.operaciones add column if not exists revisado_por uuid references auth.users(id);
alter table public.operaciones add column if not exists completada_en timestamptz;

-- Se rellena solo cada vez que cambias un estado desde el panel.
create or replace function public.marcar_quien_reviso()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.estado is distinct from old.estado then
    new.revisado_por := auth.uid();
    if to_jsonb(new) ? 'revisado_en' then new.revisado_en := now(); end if;
    if tg_table_name = 'operaciones' and new.estado = 'completada' then
      new.completada_en := now();
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists quien_reviso on public.documentos;
create trigger quien_reviso before update on public.documentos
  for each row execute function public.marcar_quien_reviso();

drop trigger if exists quien_reviso on public.tarjetas;
create trigger quien_reviso before update on public.tarjetas
  for each row execute function public.marcar_quien_reviso();

drop trigger if exists quien_reviso on public.operaciones;
create trigger quien_reviso before update on public.operaciones
  for each row execute function public.marcar_quien_reviso();


-- ---------- 4. BÚSQUEDAS RÁPIDAS ----------
-- Para que el panel siga abriéndose al instante con cientos de clientes.

create index if not exists idx_perfiles_documento    on public.perfiles(documento);
create index if not exists idx_tarjetas_estado       on public.tarjetas(estado)    where estado = 'en_revision';
create index if not exists idx_documentos_estado     on public.documentos(estado)  where estado = 'en_revision';
create index if not exists idx_operaciones_estado    on public.operaciones(estado);
create index if not exists idx_operaciones_codigo    on public.operaciones(codigo);


-- ---------- 5. QUE EL CLIENTE PUEDA ARCHIVAR UNA TARJETA ----------
-- Hoy las tarjetas solo se acumulan: si cambia de tarjeta, la vieja se
-- queda ahí para siempre y ensucia su ficha. Con esto puede ocultarla
-- sin que se borre el historial de sus operaciones.

alter table public.tarjetas add column if not exists archivada boolean not null default false;
alter table public.cuentas  add column if not exists archivada boolean not null default false;

create index if not exists idx_tarjetas_activas on public.tarjetas(user_id) where archivada = false;


-- =====================================================================
-- LISTO. A partir de ahora:
--   · Ningún estado raro puede colarse.
--   · No hay tarjetas duplicadas.
--   · Cada aprobación queda firmada y fechada.
--   · El panel sigue rápido aunque crezcas.
--   · Las tarjetas viejas se pueden archivar en vez de acumularse.
-- =====================================================================
