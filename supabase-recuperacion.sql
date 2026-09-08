-- =====================================================================
-- IMPULSA CRÉDITO — Recuperar contraseña por correo (paso 4)
-- =====================================================================
-- A partir de aquí cada cliente queda registrado en Supabase con SU
-- CORREO REAL. Eso es lo que permite que, si olvida su contraseña,
-- Supabase le envíe un enlace para cambiarla él mismo, sin molestarte.
--
-- El cliente sigue entrando con su DNI, como siempre. Esta función es
-- la que traduce el DNI al correo por detrás.
--
-- POR QUÉ PIDE LA CONTRASEÑA:
-- Si la función devolviera el correo solo con el DNI, cualquiera podría
-- probar DNIs al azar y averiguar quién es cliente tuyo y con qué correo
-- (eso sería una fuga de datos personales). Al exigir también la
-- contraseña correcta, quien no la sepa no obtiene absolutamente nada.
--
-- CÓMO USARLO:
-- 1. Supabase → SQL Editor → New query → pega TODO → Run
-- 2. Después, en Supabase → Authentication → URL Configuration:
--      Site URL:       https://impulsacredito.com
--      Redirect URLs:  https://impulsacredito.com/recuperar
--                      https://impulsa-credito.vercel.app/recuperar
-- 3. Configura un servidor de correo propio (ver README, sección
--    "Correos de recuperación"). Sin eso Supabase solo envía 2 correos
--    por hora y no llegan a los clientes.
--
-- Es seguro ejecutarlo más de una vez.
-- =====================================================================

-- pgcrypto vive en el esquema "extensions" en Supabase; lo necesitamos
-- para comparar la contraseña contra el hash guardado por Supabase Auth.
create extension if not exists pgcrypto with schema extensions;

create or replace function public.correo_de_documento(doc text, clave text)
returns text
language plpgsql
stable
security definer
set search_path = public, extensions, auth
as $$
declare
  correo text;
begin
  if doc is null or clave is null or length(trim(doc)) = 0 then
    return null;
  end if;

  select u.email
    into correo
  from public.perfiles p
  join auth.users u on u.id = p.id
  where p.documento = trim(doc)
    and u.encrypted_password = extensions.crypt(clave, u.encrypted_password)
  limit 1;

  return correo;   -- null si el documento no existe o la contraseña no coincide
end;
$$;

-- Solo la puede llamar quien visita la web (rol anon) y quien ya entró.
revoke all on function public.correo_de_documento(text, text) from public;
grant execute on function public.correo_de_documento(text, text) to anon, authenticated;

-- =====================================================================
-- LISTO.
--
-- Comprobación rápida: esto debe devolver NULL (contraseña inventada),
-- no un error:
--   select public.correo_de_documento('12345678', 'loquesea');
-- =====================================================================
