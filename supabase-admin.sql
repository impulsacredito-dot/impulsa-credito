-- =====================================================================
-- IMPULSA CRÉDITO — Panel de administración (paso 3)
-- =====================================================================
-- Habilita TU panel privado para revisar registros, ver las fotos y
-- aprobar o rechazar clientes.
--
-- CÓMO USARLO:
-- 1. Supabase → SQL Editor → New query → pega TODO → Run
-- 2. Supabase → Authentication → Users → "Add user" → "Create new user"
--    Correo: contacto@impulsacredito.com   Contraseña: (una fuerte, tuya)
--    Marca "Auto Confirm User".
-- 3. Vuelve al SQL Editor y ejecuta la ÚLTIMA línea de este archivo
--    (la que dice INSERT INTO public.admins), cambiando el correo si usaste otro.
--
-- Ejecútalo DESPUÉS de supabase-setup.sql y supabase-cuentas.sql.
-- Es seguro ejecutarlo más de una vez.
-- =====================================================================

-- ---------- 1. QUIÉN ES ADMINISTRADOR ----------
create table if not exists public.admins (
  id        uuid primary key references auth.users(id) on delete cascade,
  creado_en timestamptz not null default now(),
  nombre    text
);
alter table public.admins enable row level security;

-- Nadie puede leer ni modificar esta tabla desde la web.
-- Solo se toca desde el SQL Editor (tú). Sin políticas = acceso cerrado.

-- Función que responde "¿el que pregunta es administrador?".
-- SECURITY DEFINER para que pueda leer la tabla admins sin exponerla,
-- y para evitar recursión infinita dentro de las políticas.
create or replace function public.es_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.admins a where a.id = auth.uid());
$$;

revoke all on function public.es_admin() from public;
grant execute on function public.es_admin() to authenticated;

-- ---------- 2. EL ADMIN VE Y GESTIONA TODO ----------
-- Estas políticas se SUMAN a las del cliente (Postgres las combina con OR):
-- el cliente sigue viendo solo lo suyo; el admin ve todo.
do $$
declare t text;
begin
  foreach t in array array['perfiles','documentos','tarjetas','cuentas','operaciones'] loop
    execute format('drop policy if exists "admin: ver todo" on public.%I', t);
    execute format('drop policy if exists "admin: actualizar todo" on public.%I', t);
    execute format('create policy "admin: ver todo" on public.%I for select to authenticated using (public.es_admin())', t);
    execute format('create policy "admin: actualizar todo" on public.%I for update to authenticated using (public.es_admin()) with check (public.es_admin())', t);
  end loop;
end $$;

-- ---------- 3. EL ADMIN VE LAS FOTOS DE TODOS ----------
drop policy if exists "admin: ver todas las fotos" on storage.objects;
create policy "admin: ver todas las fotos"
  on storage.objects for select to authenticated
  using (bucket_id = 'documentos' and public.es_admin());

-- ---------- 4. AVISOS PARA EL CLIENTE ----------
-- Cuando apruebas o rechazas algo, el cliente lo ve en su campana.
create table if not exists public.avisos (
  id        bigserial primary key,
  creado_en timestamptz not null default now(),
  user_id   uuid not null references auth.users(id) on delete cascade,
  titulo    text not null,
  texto     text,
  tipo      text default 'info',   -- info | ok | alerta
  leido     boolean not null default false
);
create index if not exists idx_avisos_user on public.avisos(user_id, creado_en desc);

alter table public.avisos enable row level security;

drop policy if exists "cliente: ver sus avisos"    on public.avisos;
drop policy if exists "cliente: marcar leido"      on public.avisos;
drop policy if exists "admin: crear avisos"        on public.avisos;
drop policy if exists "admin: ver todos los avisos" on public.avisos;

create policy "cliente: ver sus avisos"     on public.avisos for select to authenticated using (auth.uid() = user_id);
create policy "cliente: marcar leido"       on public.avisos for update to authenticated using (auth.uid() = user_id);
create policy "admin: crear avisos"         on public.avisos for insert to authenticated with check (public.es_admin());
create policy "admin: ver todos los avisos" on public.avisos for select to authenticated using (public.es_admin());

-- ---------- 5. MOTIVO DEL RECHAZO ----------
alter table public.documentos add column if not exists motivo text;
alter table public.tarjetas   add column if not exists motivo text;
alter table public.documentos add column if not exists revisado_en timestamptz;
alter table public.tarjetas   add column if not exists revisado_en timestamptz;

-- =====================================================================
-- ÚLTIMO PASO — ejecútalo SOLO después de crear tu usuario en
-- Authentication → Users. Cambia el correo si usaste otro.
-- =====================================================================
-- insert into public.admins (id, nombre)
-- select id, 'Administrador' from auth.users where email = 'contacto@impulsacredito.com'
-- on conflict (id) do nothing;
