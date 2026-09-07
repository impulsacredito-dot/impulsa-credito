-- =====================================================================
-- IMPULSA CRÉDITO — Cuentas de cliente (paso 2)
-- =====================================================================
-- Este archivo habilita que cada cliente tenga una CUENTA REAL:
-- puede entrar desde cualquier dispositivo (celular, laptop) y ver
-- su historial, sus tarjetas y sus operaciones.
--
-- CÓMO USARLO:
-- 1. Entra a tu proyecto en https://supabase.com
-- 2. Menú lateral → SQL Editor → New query
-- 3. Copia y pega TODO este archivo → botón Run
-- 4. Luego ve a Authentication → Sign In / Providers → Email
--    y DESACTIVA "Confirm email" (los clientes entran con su DNI,
--    no con correo, así que no hay email que confirmar).
--
-- Ejecútalo DESPUÉS de supabase-setup.sql.
-- Es seguro ejecutarlo más de una vez.
-- =====================================================================

-- ---------- 1. PERFIL DE CADA CLIENTE ----------
create table if not exists public.perfiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  creado_en  timestamptz not null default now(),
  nombres    text,
  apellidos  text,
  tipo_doc   text,
  documento  text unique,
  celular    text,
  email      text
);

-- ---------- 2. VINCULAR LAS TABLAS AL CLIENTE ----------
alter table public.documentos  add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.tarjetas    add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.cuentas     add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.operaciones add column if not exists user_id uuid references auth.users(id) on delete cascade;

-- columnas de apoyo para el panel del cliente
alter table public.tarjetas    add column if not exists principal boolean default false;
alter table public.cuentas     add column if not exists principal boolean default false;
alter table public.operaciones add column if not exists tarjeta_id bigint;
alter table public.operaciones add column if not exists cuenta_id  bigint;

create index if not exists idx_documentos_user  on public.documentos(user_id);
create index if not exists idx_tarjetas_user    on public.tarjetas(user_id);
create index if not exists idx_cuentas_user     on public.cuentas(user_id);
create index if not exists idx_operaciones_user on public.operaciones(user_id);

-- ---------- 3. SEGURIDAD: cada cliente solo ve LO SUYO ----------
alter table public.perfiles enable row level security;

-- perfiles
drop policy if exists "perfil propio: leer"     on public.perfiles;
drop policy if exists "perfil propio: crear"    on public.perfiles;
drop policy if exists "perfil propio: editar"   on public.perfiles;
create policy "perfil propio: leer"   on public.perfiles for select to authenticated using (auth.uid() = id);
create policy "perfil propio: crear"  on public.perfiles for insert to authenticated with check (auth.uid() = id);
create policy "perfil propio: editar" on public.perfiles for update to authenticated using (auth.uid() = id);

-- documentos, tarjetas, cuentas y operaciones
do $$
declare t text;
begin
  foreach t in array array['documentos','tarjetas','cuentas','operaciones'] loop
    execute format('drop policy if exists "cliente: leer lo suyo" on public.%I', t);
    execute format('drop policy if exists "cliente: crear lo suyo" on public.%I', t);
    execute format('create policy "cliente: leer lo suyo" on public.%I for select to authenticated using (auth.uid() = user_id)', t);
    execute format('create policy "cliente: crear lo suyo" on public.%I for insert to authenticated with check (auth.uid() = user_id)', t);
  end loop;
end $$;

-- el cliente puede cancelar sus propias operaciones
drop policy if exists "cliente: actualizar lo suyo" on public.operaciones;
create policy "cliente: actualizar lo suyo" on public.operaciones
  for update to authenticated using (auth.uid() = user_id);

-- ---------- 4. FOTOS: cada cliente en su propia carpeta ----------
drop policy if exists "cliente: subir sus fotos" on storage.objects;
create policy "cliente: subir sus fotos"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'documentos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "cliente: ver sus fotos" on storage.objects;
create policy "cliente: ver sus fotos"
  on storage.objects for select to authenticated
  using (bucket_id = 'documentos' and (storage.foldername(name))[1] = auth.uid()::text);

-- =====================================================================
-- LISTO.
-- Recuerda: Authentication → Sign In / Providers → Email → "Confirm email" OFF
--
-- Para ver los datos de un cliente en tu panel, cruza por "documento"
-- en la tabla "perfiles" (ahí está el DNI junto a su identificador).
-- =====================================================================
