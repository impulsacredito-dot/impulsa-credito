-- =====================================================================
-- IMPULSA CRÉDITO — Cerrar los permisos que ya no se usan (seguridad)
-- =====================================================================
-- POR QUÉ:
--   supabase-setup.sql (el paso 1, de cuando aún no había cuentas)
--   dejó que CUALQUIERA, sin iniciar sesión, pudiera:
--     · crear filas en documentos, tarjetas, cuentas y operaciones
--     · subir archivos a la carpeta privada "documentos"
--   Desde que cada cliente tiene cuenta (supabase-cuentas.sql), la web
--   ya no usa esos permisos: todo se guarda con la sesión del cliente.
--   Pero siguen abiertos, y alguien podría llenarte el panel de
--   operaciones falsas o subir archivos basura a tu almacenamiento.
--
-- QUÉ HACE:
--   QUITA  el permiso anónimo de insertar en documentos, tarjetas,
--          cuentas y operaciones
--   QUITA  el permiso anónimo de subir archivos
--   DEJA   el permiso anónimo del Libro de Reclamaciones (lo necesita:
--          cualquiera puede reclamar sin tener cuenta)
--   No borra ningún dato.
--
-- CÓMO USARLO:
--   Supabase → SQL Editor → New query → pega TODO → Run
--   Es seguro ejecutarlo más de una vez.
--
-- SI ALGO DEJA DE FUNCIONAR: vuelve a ejecutar supabase-setup.sql y
-- todo queda como estaba.
-- =====================================================================

do $$
declare t text;
begin
  foreach t in array array['documentos','tarjetas','cuentas','operaciones'] loop
    execute format('drop policy if exists "web puede insertar" on public.%I', t);
  end loop;
end $$;

drop policy if exists "web puede subir documentos" on storage.objects;


-- ---------- COMPROBACIÓN ----------
-- Muestra los permisos que quedan para visitantes sin sesión.
-- Lo esperado es una sola fila: reclamos / "web puede insertar".
-- Si aparece otra, pásamela antes de tocar nada.
select schemaname, tablename, policyname
from pg_policies
where 'anon' = any(roles)
order by tablename;
