-- =====================================================================
-- IMPULSA CRÉDITO — Equipo: acceso SOPORTE + estado de conexión (paso 9)
-- =====================================================================
-- QUÉ HACE
--   1. Agrega un segundo tipo de acceso para tus trabajadores. Tú eliges
--      cuál tiene cada uno en la pestaña "Equipo" del panel:
--
--        CONSULTA  ve clientes, operaciones, reportes y notas.
--                  NO ve las fotos.
--        SOPORTE   lo mismo, y ADEMÁS ve las fotos del DNI, la selfie
--                  y las tarjetas (para ayudar a validar).
--
--      En los dos casos:
--        · los números de cuenta, los celulares y los correos siguen
--          ocultos (•••• 4321);
--        · no pueden aprobar, rechazar, cambiar, borrar, subir archivos
--          ni descargar datos;
--        · no ven la auditoría ni administran al equipo.
--
--   2. La protección vive AQUÍ, en el servidor: un trabajador de
--      Consulta no puede abrir una foto aunque manipule la página, y si
--      le cambias el acceso o se lo quitas, el servidor lo aplica al
--      instante (su panel se actualiza solo en menos de un minuto).
--
--   3. ESTADO DE CONEXIÓN del equipo (puntos de color en "Equipo"):
--        ● Verde     En línea: está usando el panel ahora.
--        ● Amarillo  Ausente: tiene el panel abierto, pero lleva más de
--                    5 minutos sin usarlo o está en otra pestaña.
--        ● Rojo      Desconectado: cerró el panel o perdió la conexión.
--
-- No borra ni cambia ningún dato de clientes. Todos los trabajadores
-- que ya tienes quedan como CONSULTA (igual que hoy) hasta que tú los
-- cambies. Se puede ejecutar más de una vez.
--
-- CÓMO USARLO
--   Supabase → SQL Editor → New query → pega TODO este archivo → Run
--   Luego recarga el panel (F5).
--
-- Ejecútalo DESPUÉS de supabase-equipo-consulta.sql. Si algún día
-- vuelves a ejecutar ese archivo, ejecuta este otra vez después.
-- =====================================================================


-- ---------- 1. TIPO DE ACCESO Y CONEXIÓN DE CADA PERSONA ----------
alter table public.consultores add column if not exists rol text not null default 'consulta';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'consultores_rol_valido') then
    alter table public.consultores
      add constraint consultores_rol_valido check (rol in ('consulta', 'soporte'));
  end if;
end $$;

alter table public.consultores add column if not exists visto_en  timestamptz;
alter table public.consultores add column if not exists presencia text;
alter table public.admins      add column if not exists visto_en  timestamptz;
alter table public.admins      add column if not exists presencia text;


-- ---------- 2. ¿QUIÉN ES DE SOPORTE? ----------
-- es_consulta() sigue siendo verdadero para Consulta Y para Soporte:
-- así todas las prohibiciones de escribir (supabase-equipo-consulta.sql)
-- se aplican igual a los dos.
create or replace function public.es_soporte()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.consultores c where c.id = auth.uid() and c.rol = 'soporte')
     and not exists (select 1 from public.admins a where a.id = auth.uid());
$$;

-- 'admin', 'consulta', 'soporte' o null (cliente)
create or replace function public.mi_rol()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when exists (select 1 from public.admins a where a.id = auth.uid()) then 'admin'
    else (select c.rol from public.consultores c where c.id = auth.uid())
  end;
$$;

revoke all on function public.es_soporte() from public, anon;
revoke all on function public.mi_rol()     from public, anon;
grant execute on function public.es_soporte() to authenticated;
grant execute on function public.mi_rol()     to authenticated;


-- ---------- 3. SOPORTE PUEDE ABRIR LAS FOTOS ----------
-- Solo VER. Subir, reemplazar y borrar siguen prohibidos para todo el
-- equipo por las políticas "consulta: no sube / no cambia / no borra".
drop policy if exists "soporte: ver fotos" on storage.objects;
create policy "soporte: ver fotos"
  on storage.objects for select to authenticated
  using (bucket_id = 'documentos' and public.es_soporte());


-- ---------- 4. LO QUE VE EL EQUIPO (con lo sensible oculto) ----------
-- Igual que antes, pero a Soporte le entrega también las rutas de las
-- fotos. Cuentas, celulares y correos siguen enmascarados para los dos.
create or replace function public.consulta_datos()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  con_fotos boolean;
begin
  if not (public.es_consulta() or public.es_admin()) then
    raise exception 'Sin permiso para consultar' using errcode = '42501';
  end if;
  con_fotos := public.es_soporte() or public.es_admin();

  return jsonb_build_object(
    'perfiles', coalesce((
      select jsonb_agg(
        to_jsonb(p) || jsonb_build_object(
          'celular', public.ic_ocultar(p.celular, 3),
          'email',   public.ic_ocultar_correo(p.email))
        order by p.creado_en desc)
      from public.perfiles p), '[]'::jsonb),

    'documentos', coalesce((
      select jsonb_agg(
        (case when con_fotos then to_jsonb(d) - 'revisado_por'
              else to_jsonb(d) - 'dni_frontal' - 'dni_posterior' - 'selfie' - 'revisado_por' end)
        || jsonb_build_object(
          'tiene_dni_frontal',   d.dni_frontal   is not null,
          'tiene_dni_posterior', d.dni_posterior is not null,
          'tiene_selfie',        d.selfie        is not null,
          'fotos_ocultas',       not con_fotos)
        order by d.creado_en desc)
      from public.documentos d), '[]'::jsonb),

    'tarjetas', coalesce((
      select jsonb_agg(
        (case when con_fotos then to_jsonb(t) - 'revisado_por'
              else to_jsonb(t) - 'foto_frontal' - 'foto_posterior' - 'revisado_por' end)
        || jsonb_build_object(
          'tiene_foto_frontal',   t.foto_frontal   is not null,
          'tiene_foto_posterior', t.foto_posterior is not null,
          'fotos_ocultas',        not con_fotos)
        order by t.creado_en desc)
      from public.tarjetas t), '[]'::jsonb),

    'cuentas', coalesce((
      select jsonb_agg(
        (to_jsonb(c) - 'cci') || jsonb_build_object('numero', public.ic_ocultar(c.numero, 4))
        order by c.creado_en desc)
      from public.cuentas c), '[]'::jsonb),

    'operaciones', coalesce((
      select jsonb_agg(
        (to_jsonb(o) - 'revisado_por') || jsonb_build_object(
          'numero_cuenta', public.ic_ocultar(o.numero_cuenta, 4),
          'celular',       public.ic_ocultar(o.celular, 3))
        order by o.creado_en desc)
      from public.operaciones o), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.consulta_datos() from public, anon;
grant execute on function public.consulta_datos() to authenticated;


-- ---------- 5. ESTADO DE CONEXIÓN ----------
-- El panel avisa cada minuto si la persona está activa o ausente, y al
-- cerrar, que se desconectó. Cada uno solo puede marcar SU propio
-- estado. Devuelve el rol actual: así el panel de un trabajador se
-- entera al instante si le cambiaste el acceso o se lo quitaste.
create or replace function public.registrar_presencia(p_estado text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  e text := case when p_estado in ('activo', 'ausente', 'desconectado') then p_estado else 'activo' end;
begin
  update public.admins set visto_en = now(), presencia = e where id = auth.uid();
  if not found then
    update public.consultores set visto_en = now(), presencia = e where id = auth.uid();
  end if;
  return public.mi_rol();
end;
$$;

revoke all on function public.registrar_presencia(text) from public, anon;
grant execute on function public.registrar_presencia(text) to authenticated;

-- verde / amarillo / rojo, calculado con la hora del servidor
create or replace function public.ic_estado_conexion(p_presencia text, p_visto timestamptz)
returns text
language sql
stable
as $$
  select case
    when p_visto is null or p_presencia is null or p_presencia = 'desconectado' then 'desconectado'
    when p_presencia = 'activo'  and p_visto >= now() - interval '3 minutes' then 'en_linea'
    when p_presencia = 'ausente' and p_visto >= now() - interval '6 minutes' then 'ausente'
    else 'desconectado'
  end;
$$;
revoke all on function public.ic_estado_conexion(text, timestamptz) from public, anon;


-- ---------- 6. ADMINISTRAR EL EQUIPO (con tipo de acceso) ----------
create or replace function public.equipo_listar()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
  if not public.es_admin() then
    raise exception 'Solo el administrador puede ver el equipo' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', c.id, 'nombre', c.nombre, 'puesto', c.puesto, 'avatar', c.avatar,
             'rol', c.rol, 'email', u.email, 'desde', c.creado_en,
             'estado', public.ic_estado_conexion(c.presencia, c.visto_en),
             'visto_en', c.visto_en,
             'ultimo_ingreso', (select max(a.creado_en) from public.auditoria a
                                where a.actor = c.id and a.accion = 'ingreso_panel'))
           order by c.creado_en)
    from public.consultores c
    join auth.users u on u.id = c.id), '[]'::jsonb);
end;
$$;

drop function if exists public.equipo_agregar(text, text);
drop function if exists public.equipo_agregar(text, text, text);
create or replace function public.equipo_agregar(p_email text, p_nombre text, p_puesto text default null, p_rol text default 'consulta')
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  uid uuid;
  r   text := coalesce(nullif(trim(p_rol), ''), 'consulta');
begin
  if not public.es_admin() then
    raise exception 'Solo el administrador puede agregar personas al equipo' using errcode = '42501';
  end if;
  if r not in ('consulta', 'soporte') then
    raise exception 'Tipo de acceso no válido' using errcode = 'P0001';
  end if;
  select u.id into uid from auth.users u where lower(u.email) = lower(trim(p_email)) limit 1;
  if uid is null then
    raise exception 'No existe una cuenta con ese correo' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.admins a where a.id = uid) then
    raise exception 'Esa cuenta ya es de administrador' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.perfiles p where p.id = uid) then
    raise exception 'Ese correo es de un cliente registrado. Usa otro correo para el trabajador' using errcode = 'P0001';
  end if;
  insert into public.consultores (id, nombre, puesto, rol)
  values (uid, nullif(trim(p_nombre), ''), nullif(trim(p_puesto), ''), r)
  on conflict (id) do update set nombre = excluded.nombre, puesto = excluded.puesto, rol = excluded.rol;
  insert into public.auditoria (actor, actor_email, actor_rol, accion, registro_id, detalle)
  values (auth.uid(), auth.jwt() ->> 'email', 'admin', 'equipo_alta', uid::text,
          jsonb_build_object('email', lower(trim(p_email)), 'nombre', p_nombre, 'puesto', p_puesto, 'rol', r));
  return jsonb_build_object('id', uid);
end;
$$;

-- p_avatar null = no tocar la foto ('' = quitarla); p_rol null = no tocar el acceso
drop function if exists public.equipo_guardar(uuid, text, text, text);
create or replace function public.equipo_guardar(p_id uuid, p_nombre text, p_puesto text, p_avatar text default null, p_rol text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  rol_previo text;
begin
  if not public.es_admin() then
    raise exception 'Solo el administrador puede editar al equipo' using errcode = '42501';
  end if;
  if not public.ic_avatar_valido(p_avatar) then
    raise exception 'La foto no es válida o pesa demasiado' using errcode = 'P0001';
  end if;
  if p_rol is not null and p_rol not in ('consulta', 'soporte') then
    raise exception 'Tipo de acceso no válido' using errcode = 'P0001';
  end if;
  select rol into rol_previo from public.consultores where id = p_id;
  update public.consultores
     set nombre = coalesce(nullif(trim(p_nombre), ''), nombre),
         puesto = nullif(trim(p_puesto), ''),
         avatar = case when p_avatar is null then avatar else nullif(p_avatar, '') end,
         rol    = coalesce(p_rol, rol)
   where id = p_id;
  if not found then
    raise exception 'Esa persona ya no está en el equipo' using errcode = 'P0001';
  end if;
  insert into public.auditoria (actor, actor_email, actor_rol, accion, registro_id, detalle)
  values (auth.uid(), auth.jwt() ->> 'email', 'admin', 'equipo_edicion', p_id::text,
          jsonb_strip_nulls(jsonb_build_object('nombre', p_nombre, 'puesto', p_puesto,
            'rol', coalesce(p_rol, rol_previo), 'rol_antes', rol_previo)));
end;
$$;

revoke all on function public.equipo_listar()                              from public, anon;
revoke all on function public.equipo_agregar(text, text, text, text)       from public, anon;
revoke all on function public.equipo_guardar(uuid, text, text, text, text) from public, anon;
grant execute on function public.equipo_listar()                             to authenticated;
grant execute on function public.equipo_agregar(text, text, text, text)      to authenticated;
grant execute on function public.equipo_guardar(uuid, text, text, text, text) to authenticated;


-- ---------- 7. MI PERFIL (ahora dice si es Consulta o Soporte) ----------
create or replace function public.mi_perfil()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  r jsonb;
begin
  select jsonb_build_object('rol', 'admin', 'nombre', a.nombre, 'puesto', a.puesto, 'avatar', a.avatar)
    into r from public.admins a where a.id = auth.uid();
  if r is null then
    select jsonb_build_object('rol', c.rol, 'nombre', c.nombre, 'puesto', c.puesto, 'avatar', c.avatar)
      into r from public.consultores c where c.id = auth.uid();
  end if;
  return r;   -- null: no es del equipo
end;
$$;
revoke all on function public.mi_perfil() from public, anon;
grant execute on function public.mi_perfil() to authenticated;


-- que el panel vea los cambios de inmediato
notify pgrst, 'reload schema';


-- ---------- COMPROBACIÓN (solo lectura) ----------
select
  (select count(*) from public.consultores where rol = 'consulta') as trabajadores_consulta,
  (select count(*) from public.consultores where rol = 'soporte')  as trabajadores_soporte,
  exists (select 1 from pg_policies where policyname = 'soporte: ver fotos') as soporte_ve_fotos,
  to_regprocedure('public.registrar_presencia(text)') is not null           as estado_de_conexion;
