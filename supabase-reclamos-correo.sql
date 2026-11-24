-- =====================================================================
-- IMPULSA CRÉDITO — Copia del reclamo por correo (paso 9)
-- =====================================================================
-- La ley pide que el consumidor reciba una copia de su reclamo o queja.
-- Este archivo prepara la tabla para saber a quién ya se le envió.
-- El envío lo hace la función "enviar-reclamo" (carpeta
-- supabase/functions/enviar-reclamo). Instrucciones completas en
-- supabase/functions/enviar-reclamo/LEEME.txt
--
-- CÓMO USARLO:  Supabase → SQL Editor → New query → pega TODO → Run
-- No borra ni cambia datos. Se puede ejecutar más de una vez.
-- =====================================================================

alter table public.reclamos add column if not exists correo_enviado_en timestamptz;
alter table public.reclamos add column if not exists correo_estado     text;

create index if not exists idx_reclamos_codigo on public.reclamos (codigo);
create index if not exists idx_reclamos_email  on public.reclamos (email, correo_enviado_en);
