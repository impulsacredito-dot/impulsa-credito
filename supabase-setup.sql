-- =====================================================================
-- IMPULSA CRÉDITO — Base de datos (Supabase)
-- =====================================================================
-- CÓMO USARLO:
-- 1. Entra a https://supabase.com y crea un proyecto (plan gratuito).
-- 2. En el menú lateral abre "SQL Editor" → "New query".
-- 3. Copia y pega TODO este archivo y presiona "Run".
-- 4. Ve a Storage y confirma que existe el bucket "documentos" (privado).
-- 5. En Project Settings → API copia "Project URL" y la llave "anon public",
--    y pégalas en js/config.js (sección backend).
--
-- SEGURIDAD: la web solo puede INSERTAR (nunca leer ni borrar).
-- Solo tú, desde el panel de Supabase, puedes ver la información.
-- =====================================================================

-- ---------- 1. CLIENTES REGISTRADOS ----------
create table if not exists public.clientes (
  id          bigint generated always as identity primary key,
  creado_en   timestamptz not null default now(),
  nombres     text,
  apellidos   text,
  tipo_doc    text,
  documento   text,
  celular     text,
  email       text
);

-- ---------- 2. DOCUMENTOS DE IDENTIDAD (DNI + selfie) ----------
create table if not exists public.documentos (
  id             bigint generated always as identity primary key,
  creado_en      timestamptz not null default now(),
  documento      text,
  nombre         text,
  celular        text,
  dni_frontal    text,   -- ruta del archivo dentro del bucket "documentos"
  dni_posterior  text,
  selfie         text,
  estado         text default 'en_revision'
);

-- ---------- 3. TARJETAS DE CRÉDITO ----------
create table if not exists public.tarjetas (
  id              bigint generated always as identity primary key,
  creado_en       timestamptz not null default now(),
  documento       text,
  nombre          text,
  banco           text,
  marca           text,
  ultimos4        text,
  titular         text,
  dia_pago        text,
  foto_frontal    text,   -- foto con los datos sensibles ya censurados
  foto_posterior  text,
  estado          text default 'en_revision'
);

-- ---------- 4. CUENTAS BANCARIAS ----------
create table if not exists public.cuentas (
  id         bigint generated always as identity primary key,
  creado_en  timestamptz not null default now(),
  documento  text,
  nombre     text,
  banco      text,
  tipo       text,
  moneda     text,
  numero     text,
  cci        text,
  titular    text
);

-- ---------- 5. OPERACIONES ----------
create table if not exists public.operaciones (
  id             bigint generated always as identity primary key,
  creado_en      timestamptz not null default now(),
  codigo         text,
  documento      text,
  nombre         text,
  celular        text,
  tipo           text,
  banco_tarjeta  text,
  ultimos4       text,
  banco_cuenta   text,
  numero_cuenta  text,
  monto          numeric,
  comision       numeric,
  neto           numeric,
  estado         text
);

-- ---------- 6. LIBRO DE RECLAMACIONES ----------
create table if not exists public.reclamos (
  id           bigint generated always as identity primary key,
  creado_en    timestamptz not null default now(),
  codigo       text,
  tipo         text,
  nombres      text,
  apellidos    text,
  tipo_doc     text,
  documento    text,
  domicilio    text,
  telefono     text,
  email        text,
  menor_edad   boolean,
  apoderado    text,
  bien         text,
  monto        numeric,
  descripcion  text,
  detalle      text,
  pedido       text
);

-- =====================================================================
-- SEGURIDAD: la web solo puede insertar. Nadie puede leer desde fuera.
-- =====================================================================
alter table public.clientes    enable row level security;
alter table public.documentos  enable row level security;
alter table public.tarjetas    enable row level security;
alter table public.cuentas     enable row level security;
alter table public.operaciones enable row level security;
alter table public.reclamos    enable row level security;

do $$
declare t text;
begin
  foreach t in array array['clientes','documentos','tarjetas','cuentas','operaciones','reclamos'] loop
    execute format('drop policy if exists "web puede insertar" on public.%I', t);
    execute format('create policy "web puede insertar" on public.%I for insert to anon with check (true)', t);
  end loop;
end $$;

-- =====================================================================
-- ALMACENAMIENTO DE FOTOS (bucket privado "documentos")
-- =====================================================================
insert into storage.buckets (id, name, public)
values ('documentos', 'documentos', false)
on conflict (id) do nothing;

drop policy if exists "web puede subir documentos" on storage.objects;
create policy "web puede subir documentos"
  on storage.objects for insert to anon
  with check (bucket_id = 'documentos');

-- =====================================================================
-- LISTO. Para ver la información entra a "Table Editor" (datos) y a
-- "Storage → documentos" (fotos, ordenadas en una carpeta por cada DNI).
-- =====================================================================
