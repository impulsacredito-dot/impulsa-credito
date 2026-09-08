-- =====================================================================
-- IMPULSA CRÉDITO — Candado en las operaciones (paso 5)
-- =====================================================================
-- POR QUÉ ESTE ARCHIVO:
-- Hasta ahora un cliente podía cambiar el estado de SU operación a
-- cualquier valor, incluido "completada". Es decir, podía darse a sí
-- mismo por pagado y generar un comprobante sin que tú hubieras
-- depositado nada.
--
-- Con esto, el cliente solo puede CANCELAR. Marcar una operación como
-- completada queda reservado para ti, desde el panel de administración.
--
-- CÓMO USARLO:
--   Supabase → SQL Editor → New query → pega TODO → Run
--
-- Ejecútalo después de supabase-admin.sql.
-- Es seguro ejecutarlo más de una vez.
-- =====================================================================

-- ---------- OPERACIONES: el cliente solo puede cancelar ----------
drop policy if exists "cliente: actualizar lo suyo" on public.operaciones;
drop policy if exists "cliente: cancelar lo suyo"   on public.operaciones;

create policy "cliente: cancelar lo suyo"
  on public.operaciones for update to authenticated
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id and estado = 'cancelada');

-- La política del administrador sigue intacta y se suma a esta:
-- tú puedes dejar la operación en cualquier estado.

-- ---------- AVISOS: el cliente solo puede marcarlos como leídos ----------
-- Antes podía reescribir el título o el texto de sus propios avisos.
drop policy if exists "cliente: marcar leido" on public.avisos;

create policy "cliente: marcar leido"
  on public.avisos for update to authenticated
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id and leido = true);

-- =====================================================================
-- COMPROBACIÓN
-- Después de ejecutarlo, un cliente que intente marcar su operación
-- como "completada" recibirá un error de permisos. Cancelarla seguirá
-- funcionando con normalidad.
-- =====================================================================
