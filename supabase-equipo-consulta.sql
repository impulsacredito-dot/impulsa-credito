-- =====================================================================
-- IMPULSA CRÉDITO — Equipo: usuario de CONSULTA + historial (paso 8)
-- =====================================================================
-- QUÉ HACE
--   1. Crea el rol CONSULTA: una persona del equipo que entra al panel
--      (impulsacredito.com/admin) y puede VER clientes y operaciones,
--      pero NO puede aprobar, rechazar, completar, cancelar, crear,
--      editar, borrar, subir archivos ni descargar Excel.
--   2. La protección vive AQUÍ, en el servidor. Aunque esa persona
--      manipule la página o llame a la base de datos por su cuenta,
--      Supabase rechaza cualquier escritura.
--   3. Lo que ve llega con lo sensible oculto: sin fotos del DNI ni
--      selfie ni fotos de tarjeta, con el número de cuenta, el celular
--      y el correo enmascarados (•••• 4321).
--   4. HISTORIAL (auditoría): cada aprobación, rechazo, cancelación o
--      depósito marcado queda registrado con quién, cuándo, y el estado
--      anterior y el nuevo. Nadie puede editarlo ni borrarlo desde la web.
--   5. NOTAS INTERNAS por cliente: el administrador escribe, el equipo
--      de consulta las lee. No se editan ni se borran (quedan como
--      historial).
--
-- No borra ni cambia ningún dato existente. Se puede ejecutar con
-- clientes reales dentro y más de una vez.
--
-- CÓMO USARLO
--   1. Supabase → SQL Editor → New query → pega TODO este archivo → Run
--   2. Entra al panel (impulsacredito.com/admin) con tu cuenta de
--      administrador → pestaña "Equipo" → "Agregar trabajador".
--      Ahí escribes su nombre, su correo y una contraseña temporal.
--   3. Ejecuta supabase-equipo-prueba.sql para comprobar que todo quedó
--      cerrado (no cambia nada: todo lo que prueba se deshace solo).
--   4. Pásale a esa persona su correo y la contraseña temporal. Al
--      entrar, que la cambie en "Mi cuenta → Cambiar contraseña".
--
-- Ejecútalo DESPUÉS de supabase-admin.sql y supabase-mejoras-orden.sql.
-- =====================================================================


-- ---------- 1. QUIÉN ES DEL EQUIPO DE CONSULTA ----------
create table if not exists public.consultores (
  id        uuid primary key references auth.users(id) on delete cascade,
  creado_en timestamptz not null default now(),
  nombre    text
);
alter table public.consultores enable row level security;
-- Sin políticas = nadie la lee ni la cambia desde la web. Solo tú, aquí.

-- ¿El que pregunta es de consulta? (un administrador nunca lo es)
create or replace function public.es_consulta()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.consultores c where c.id = auth.uid())
     and not exists (select 1 from public.admins a where a.id = auth.uid());
$$;

-- Qué rol tiene el que pregunta: 'admin', 'consulta' o null (cliente)
create or replace function public.mi_rol()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when exists (select 1 from public.admins a where a.id = auth.uid()) then 'admin'
    when exists (select 1 from public.consultores c where c.id = auth.uid()) then 'consulta'
    else null
  end;
$$;

revoke all on function public.es_consulta() from public;
revoke all on function public.mi_rol()      from public;
grant execute on function public.es_consulta() to authenticated;
grant execute on function public.mi_rol()      to authenticated;


-- ---------- 2. CONSULTA NO PUEDE ESCRIBIR NADA ----------
-- Políticas RESTRICTIVAS: se suman a todas las demás con un "Y ADEMÁS".
-- Aunque otra regla le permitiera algo (por ejemplo, la que deja a
-- cualquier usuario crear SUS propios datos de cliente), esta lo bloquea.
-- Para clientes y administradores no cambia absolutamente nada.
do $$
declare t text;
begin
  foreach t in array array['perfiles','documentos','tarjetas','cuentas','operaciones','avisos'] loop
    execute format('drop policy if exists "consulta: no puede crear"  on public.%I', t);
    execute format('drop policy if exists "consulta: no puede cambiar" on public.%I', t);
    execute format('drop policy if exists "consulta: no puede borrar" on public.%I', t);
    execute format('create policy "consulta: no puede crear"  on public.%I as restrictive for insert to authenticated with check (not public.es_consulta())', t);
    execute format('create policy "consulta: no puede cambiar" on public.%I as restrictive for update to authenticated using (not public.es_consulta()) with check (not public.es_consulta())', t);
    execute format('create policy "consulta: no puede borrar" on public.%I as restrictive for delete to authenticated using (not public.es_consulta())', t);
  end loop;
end $$;

-- ni subir, ni reemplazar, ni borrar archivos
drop policy if exists "consulta: no sube archivos"    on storage.objects;
drop policy if exists "consulta: no cambia archivos"  on storage.objects;
drop policy if exists "consulta: no borra archivos"   on storage.objects;
create policy "consulta: no sube archivos"   on storage.objects as restrictive for insert to authenticated with check (not public.es_consulta());
create policy "consulta: no cambia archivos" on storage.objects as restrictive for update to authenticated using (not public.es_consulta()) with check (not public.es_consulta());
create policy "consulta: no borra archivos"  on storage.objects as restrictive for delete to authenticated using (not public.es_consulta());

-- Las fotos (DNI, selfie, tarjetas) siguen siendo SOLO para administradores:
-- la política "admin: ver todas las fotos" usa es_admin(), y consulta no lo es.


-- ---------- 3. LO QUE VE CONSULTA, CON LO SENSIBLE OCULTO ----------
-- Consulta NO lee las tablas directamente (las reglas actuales solo dejan
-- ver todo a los administradores). Lee a través de esta función, que
-- comprueba el rol en el servidor y entrega los datos ya enmascarados.

create or replace function public.ic_ocultar(t text, visibles int default 4)
returns text
language sql
immutable
as $$
  select case
    when t is null or t = '' then t
    when length(t) <= visibles then t
    else repeat('•', least(length(t) - visibles, 6)) || right(t, visibles)
  end;
$$;

create or replace function public.ic_ocultar_correo(t text)
returns text
language sql
immutable
as $$
  select case
    when t is null or position('@' in t) = 0 then public.ic_ocultar(t, 3)
    else left(split_part(t, '@', 1), 2) || '•••@' || split_part(t, '@', 2)
  end;
$$;

revoke all on function public.ic_ocultar(text, int)    from public;
revoke all on function public.ic_ocultar_correo(text)  from public;

create or replace function public.consulta_datos()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not (public.es_consulta() or public.es_admin()) then
    raise exception 'Sin permiso para consultar' using errcode = '42501';
  end if;

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
        (to_jsonb(d) - 'dni_frontal' - 'dni_posterior' - 'selfie' - 'revisado_por') || jsonb_build_object(
          'tiene_dni_frontal',   d.dni_frontal   is not null,
          'tiene_dni_posterior', d.dni_posterior is not null,
          'tiene_selfie',        d.selfie        is not null,
          'fotos_ocultas',       true)
        order by d.creado_en desc)
      from public.documentos d), '[]'::jsonb),

    'tarjetas', coalesce((
      select jsonb_agg(
        (to_jsonb(t) - 'foto_frontal' - 'foto_posterior' - 'revisado_por') || jsonb_build_object(
          'tiene_foto_frontal',   t.foto_frontal   is not null,
          'tiene_foto_posterior', t.foto_posterior is not null,
          'fotos_ocultas',        true)
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

revoke all on function public.consulta_datos() from public;
grant execute on function public.consulta_datos() to authenticated;


-- ---------- 4. HISTORIAL (AUDITORÍA) ----------
create table if not exists public.auditoria (
  id          bigint generated always as identity primary key,
  creado_en   timestamptz not null default now(),
  actor       uuid,        -- quién lo hizo
  actor_email text,
  actor_rol   text,        -- admin | consulta | cliente | sistema
  accion      text not null,
  tabla       text,
  registro_id text,
  cliente_id  uuid,
  antes       text,        -- estado anterior
  despues     text,        -- estado nuevo
  detalle     jsonb        -- código, monto, banco... (nunca contraseñas ni tokens)
);
create index if not exists idx_auditoria_fecha   on public.auditoria (creado_en desc);
create index if not exists idx_auditoria_cliente on public.auditoria (cliente_id, creado_en desc);

alter table public.auditoria enable row level security;
drop policy if exists "admin: ver historial" on public.auditoria;
create policy "admin: ver historial" on public.auditoria
  for select to authenticated using (public.es_admin());
-- Sin políticas de crear, cambiar ni borrar: desde la web NADIE puede
-- tocar el historial, ni siquiera el administrador. Solo lo escriben
-- los disparadores de abajo, que corren dentro del servidor.

create or replace function public.ic_rol_actual()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when auth.uid() is null then 'sistema'
    else coalesce(public.mi_rol(), 'cliente')
  end;
$$;
revoke all on function public.ic_rol_actual() from public;

-- Cada vez que cambia un "estado" (aprobar, rechazar, completar, cancelar)
create or replace function public.ic_auditar_estado()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  n jsonb := to_jsonb(new);
begin
  if new.estado is distinct from old.estado then
    insert into public.auditoria
      (actor, actor_email, actor_rol, accion, tabla, registro_id, cliente_id, antes, despues, detalle)
    values
      (auth.uid(), auth.jwt() ->> 'email', public.ic_rol_actual(), 'cambio_estado', tg_table_name,
       n ->> 'id', nullif(n ->> 'user_id', '')::uuid, old.estado, new.estado,
       jsonb_strip_nulls(jsonb_build_object(
         'codigo',   n ->> 'codigo',
         'monto',    n -> 'monto',
         'comision', n -> 'comision',
         'neto',     n -> 'neto',
         'banco',    n ->> 'banco',
         'ultimos4', n ->> 'ultimos4',
         'motivo',   n ->> 'motivo')));
  end if;
  return null;
end;
$$;

drop trigger if exists auditar_estado on public.documentos;
create trigger auditar_estado after update on public.documentos
  for each row execute function public.ic_auditar_estado();
drop trigger if exists auditar_estado on public.tarjetas;
create trigger auditar_estado after update on public.tarjetas
  for each row execute function public.ic_auditar_estado();
drop trigger if exists auditar_estado on public.operaciones;
create trigger auditar_estado after update on public.operaciones
  for each row execute function public.ic_auditar_estado();

-- Ingresos al panel (lo llama el panel al entrar; solo cuenta para el equipo)
create or replace function public.registrar_ingreso()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.es_admin() or public.es_consulta() then
    insert into public.auditoria (actor, actor_email, actor_rol, accion)
    values (auth.uid(), auth.jwt() ->> 'email', public.mi_rol(), 'ingreso_panel');
  end if;
end;
$$;
revoke all on function public.registrar_ingreso() from public;
grant execute on function public.registrar_ingreso() to authenticated;


-- ---------- 5. NOTAS INTERNAS POR CLIENTE ----------
create table if not exists public.notas_cliente (
  id          bigint generated always as identity primary key,
  creado_en   timestamptz not null default now(),
  cliente_id  uuid not null references auth.users(id) on delete cascade,
  autor       uuid references auth.users(id) on delete set null,
  autor_email text,
  texto       text not null check (char_length(texto) between 1 and 2000)
);
create index if not exists idx_notas_cliente on public.notas_cliente (cliente_id, creado_en desc);

-- el autor y su correo los pone el servidor, no la página (no se pueden falsear)
create or replace function public.ic_firmar_nota()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.autor       := auth.uid();
  new.autor_email := auth.jwt() ->> 'email';
  new.creado_en   := now();
  return new;
end;
$$;
drop trigger if exists firmar_nota on public.notas_cliente;
create trigger firmar_nota before insert on public.notas_cliente
  for each row execute function public.ic_firmar_nota();

alter table public.notas_cliente enable row level security;
drop policy if exists "equipo: leer notas"  on public.notas_cliente;
drop policy if exists "admin: escribir notas" on public.notas_cliente;
create policy "equipo: leer notas" on public.notas_cliente
  for select to authenticated using (public.es_admin() or public.es_consulta());
create policy "admin: escribir notas" on public.notas_cliente
  for insert to authenticated with check (public.es_admin());
-- Sin cambiar ni borrar: las notas quedan como historial.


-- ---------- 6. ADMINISTRAR EL EQUIPO DESDE EL PANEL ----------
-- Con esto el administrador agrega y quita trabajadores desde la
-- pestaña "Equipo" del panel, sin entrar a Supabase. Cada función
-- comprueba en el servidor que quien la llama es administrador.

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
             'id', c.id, 'nombre', c.nombre, 'email', u.email, 'desde', c.creado_en,
             'ultimo_ingreso', (select max(a.creado_en) from public.auditoria a
                                where a.actor = c.id and a.accion = 'ingreso_panel'))
           order by c.creado_en)
    from public.consultores c
    join auth.users u on u.id = c.id), '[]'::jsonb);
end;
$$;

create or replace function public.equipo_agregar(p_email text, p_nombre text)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  uid uuid;
begin
  if not public.es_admin() then
    raise exception 'Solo el administrador puede agregar personas al equipo' using errcode = '42501';
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
  insert into public.consultores (id, nombre)
  values (uid, nullif(trim(p_nombre), ''))
  on conflict (id) do update set nombre = excluded.nombre;
  insert into public.auditoria (actor, actor_email, actor_rol, accion, registro_id, detalle)
  values (auth.uid(), auth.jwt() ->> 'email', 'admin', 'equipo_alta', uid::text,
          jsonb_build_object('email', lower(trim(p_email)), 'nombre', p_nombre));
  return jsonb_build_object('id', uid);
end;
$$;

create or replace function public.equipo_quitar(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  quien text;
begin
  if not public.es_admin() then
    raise exception 'Solo el administrador puede quitar accesos' using errcode = '42501';
  end if;
  select nombre into quien from public.consultores where id = p_id;
  delete from public.consultores where id = p_id;
  insert into public.auditoria (actor, actor_email, actor_rol, accion, registro_id, detalle)
  values (auth.uid(), auth.jwt() ->> 'email', 'admin', 'equipo_baja', p_id::text,
          jsonb_build_object('nombre', quien));
end;
$$;

revoke all on function public.equipo_listar()             from public;
revoke all on function public.equipo_agregar(text, text)  from public;
revoke all on function public.equipo_quitar(uuid)         from public;
grant execute on function public.equipo_listar()            to authenticated;
grant execute on function public.equipo_agregar(text, text) to authenticated;
grant execute on function public.equipo_quitar(uuid)        to authenticated;


-- =====================================================================
-- OPCIONAL — dar acceso a mano desde aquí (lo normal es hacerlo desde
-- la pestaña "Equipo" del panel). Primero crea el usuario en
-- Authentication → Users y luego cambia el correo y el nombre.
-- =====================================================================
-- insert into public.consultores (id, nombre)
-- select id, 'Nombre de la persona' from auth.users where email = 'correo.de.la.persona@ejemplo.com'
-- on conflict (id) do update set nombre = excluded.nombre;
--
-- Para QUITARLE el acceso más adelante:
-- delete from public.consultores where id = (select id from auth.users where email = 'correo.de.la.persona@ejemplo.com');
-- =====================================================================
