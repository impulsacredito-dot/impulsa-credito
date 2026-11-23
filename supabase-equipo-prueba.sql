-- =====================================================================
-- IMPULSA CRÉDITO — Prueba del usuario de CONSULTA (no cambia nada)
-- =====================================================================
-- Comprueba, DENTRO de tu base de datos real, que el usuario de
-- consulta no puede escribir nada y que solo ve datos enmascarados.
--
-- ES SEGURO: todo lo que intenta se hace dentro de un bloque que al
-- final se DESHACE solo. No crea, no cambia y no borra ningún dato.
-- Las escrituras que prueba son justamente las que deben ser RECHAZADAS.
--
-- CÓMO USARLO (después de supabase-equipo-consulta.sql y de inscribir
-- al menos a una persona en public.consultores):
--   Supabase → SQL Editor → New query → pega TODO → Run
--   Verás una tabla: cada fila debe decir PASA.
--   Si alguna dice FALLA o ERROR, cópiala y pásamela.
-- =====================================================================

create or replace function pg_temp.ic_probar()
returns table (n int, prueba text, resultado text)
language plpgsql
as $$
declare
  r         text[] := '{}';
  consulta  uuid;
  admin     uuid;
  falso     uuid := gen_random_uuid();
  filas     int;
  cuenta    int;
  datos     jsonb;
  -- cada resultado se guarda como "prueba|resultado"
begin
  if to_regclass('public.consultores') is null or to_regprocedure('public.consulta_datos()') is null then
    r := r || ('supabase-equipo-consulta.sql ejecutado|FALTA: ejecútalo primero');
  else
    r := r || ('supabase-equipo-consulta.sql ejecutado|PASA');
    execute 'select id from public.consultores order by creado_en desc limit 1' into consulta;
  end if;
  select a.id into admin from public.admins a order by a.creado_en asc limit 1;

  if consulta is null then
    r := r || ('Hay un usuario de consulta inscrito|FALTA: créalo en Authentication y ejecuta el último bloque de supabase-equipo-consulta.sql');
  end if;

  if consulta is not null then
  begin  -- todo lo de aquí dentro se deshace al final
    -- ================= como USUARIO DE CONSULTA =================
    perform set_config('request.jwt.claims',
      json_build_object('sub', consulta, 'role', 'authenticated', 'email', 'prueba@consulta')::text, true);
    set local role authenticated;

    r := r || ('Su rol es "consulta"|' || case when public.mi_rol() = 'consulta' then 'PASA' else 'FALLA (' || coalesce(public.mi_rol(), 'sin rol') || ')' end);

    -- lectura a través de la función protegida
    begin
      datos := public.consulta_datos();
      r := r || ('Puede consultar clientes y operaciones|PASA');
      r := r || ('No recibe rutas de fotos de DNI ni selfie|' ||
        case when exists (select 1 from jsonb_array_elements(datos->'documentos') e
                          where e ? 'dni_frontal' or e ? 'dni_posterior' or e ? 'selfie')
             then 'FALLA' else 'PASA' end);
      r := r || ('No recibe rutas de fotos de tarjetas|' ||
        case when exists (select 1 from jsonb_array_elements(datos->'tarjetas') e
                          where e ? 'foto_frontal' or e ? 'foto_posterior')
             then 'FALLA' else 'PASA' end);
      r := r || ('Números de cuenta enmascarados|' ||
        case when exists (select 1 from jsonb_array_elements(datos->'cuentas') e
                          where length(e->>'numero') > 4 and left(e->>'numero', 1) <> '•')
               or exists (select 1 from jsonb_array_elements(datos->'cuentas') e where e ? 'cci')
             then 'FALLA' else 'PASA' end);
    exception when others then
      r := r || ('Puede consultar clientes y operaciones|ERROR ' || sqlstate || ' ' || sqlerrm);
    end;

    -- no lee las tablas directamente
    select count(*) into cuenta from public.operaciones;
    r := r || ('No lee la tabla de operaciones directamente|' || case when cuenta = 0 then 'PASA' else 'FALLA (ve ' || cuenta || ')' end);
    select count(*) into cuenta from public.perfiles;
    r := r || ('No lee la tabla de clientes directamente|' || case when cuenta = 0 then 'PASA' else 'FALLA (ve ' || cuenta || ')' end);
    select count(*) into cuenta from storage.objects where bucket_id = 'documentos';
    r := r || ('No ve archivos (DNI, selfie, tarjetas)|' || case when cuenta = 0 then 'PASA' else 'FALLA (ve ' || cuenta || ')' end);
    select count(*) into cuenta from public.auditoria;
    r := r || ('No lee el historial de auditoría|' || case when cuenta = 0 then 'PASA' else 'FALLA (ve ' || cuenta || ')' end);

    -- no puede cambiar ni borrar
    update public.operaciones set estado = 'completada' where estado in ('pend_pago', 'activa');
    get diagnostics filas = row_count;
    r := r || ('No puede completar operaciones|' || case when filas = 0 then 'PASA' else 'FALLA (cambió ' || filas || ')' end);
    update public.operaciones set monto = monto;
    get diagnostics filas = row_count;
    r := r || ('No puede cambiar montos|' || case when filas = 0 then 'PASA' else 'FALLA (cambió ' || filas || ')' end);
    update public.documentos set estado = 'verificado' where estado = 'en_revision';
    get diagnostics filas = row_count;
    r := r || ('No puede aprobar documentos|' || case when filas = 0 then 'PASA' else 'FALLA (cambió ' || filas || ')' end);
    update public.tarjetas set estado = 'rechazado';
    get diagnostics filas = row_count;
    r := r || ('No puede rechazar tarjetas|' || case when filas = 0 then 'PASA' else 'FALLA (cambió ' || filas || ')' end);
    update public.perfiles set celular = celular;
    get diagnostics filas = row_count;
    r := r || ('No puede editar clientes|' || case when filas = 0 then 'PASA' else 'FALLA (cambió ' || filas || ')' end);
    delete from public.operaciones;
    get diagnostics filas = row_count;
    r := r || ('No puede borrar operaciones|' || case when filas = 0 then 'PASA' else 'FALLA (borró ' || filas || ')' end);

    -- no puede crear (ni siquiera datos "suyos" como si fuera cliente)
    begin
      insert into public.operaciones (user_id, codigo, monto, comision, neto, estado)
      values (consulta, 'IC-PRUEBA', 1, 0, 1, 'pend_pago');
      r := r || ('No puede crear operaciones|FALLA');
    exception when insufficient_privilege then r := r || ('No puede crear operaciones|PASA');
              when others then r := r || ('No puede crear operaciones|ERROR ' || sqlstate || ' ' || sqlerrm);
    end;
    begin
      insert into public.perfiles (id, nombres, documento) values (consulta, 'Prueba', '00000000');
      r := r || ('No puede crear clientes|FALLA');
    exception when insufficient_privilege then r := r || ('No puede crear clientes|PASA');
              when others then r := r || ('No puede crear clientes|ERROR ' || sqlstate || ' ' || sqlerrm);
    end;
    begin
      insert into public.documentos (user_id, estado) values (consulta, 'en_revision');
      r := r || ('No puede agregar documentos|FALLA');
    exception when insufficient_privilege then r := r || ('No puede agregar documentos|PASA');
              when others then r := r || ('No puede agregar documentos|ERROR ' || sqlstate || ' ' || sqlerrm);
    end;
    begin
      insert into public.avisos (user_id, titulo) values (consulta, 'Prueba');
      r := r || ('No puede enviar avisos a clientes|FALLA');
    exception when insufficient_privilege then r := r || ('No puede enviar avisos a clientes|PASA');
              when others then r := r || ('No puede enviar avisos a clientes|ERROR ' || sqlstate || ' ' || sqlerrm);
    end;
    begin
      insert into public.notas_cliente (cliente_id, texto) values (consulta, 'Prueba');
      r := r || ('No puede escribir notas internas|FALLA');
    exception when insufficient_privilege then r := r || ('No puede escribir notas internas|PASA');
              when others then r := r || ('No puede escribir notas internas|ERROR ' || sqlstate || ' ' || sqlerrm);
    end;
    begin
      insert into storage.objects (bucket_id, name) values ('documentos', consulta::text || '/prueba.jpg');
      r := r || ('No puede subir archivos|FALLA');
    exception when insufficient_privilege then r := r || ('No puede subir archivos|PASA');
              when others then r := r || ('No puede subir archivos|ERROR ' || sqlstate || ' ' || sqlerrm);
    end;

    -- no puede darse más permisos
    begin
      insert into public.admins (id, nombre) values (consulta, 'Prueba');
      r := r || ('No puede volverse administrador|FALLA');
    exception when insufficient_privilege then r := r || ('No puede volverse administrador|PASA');
              when others then r := r || ('No puede volverse administrador|ERROR ' || sqlstate || ' ' || sqlerrm);
    end;
    begin
      insert into public.consultores (id, nombre) values (falso, 'Prueba');
      r := r || ('No puede dar acceso a otras personas|FALLA');
    exception when insufficient_privilege then r := r || ('No puede dar acceso a otras personas|PASA');
              when others then r := r || ('No puede dar acceso a otras personas|PASA (rechazado: ' || sqlstate || ')');
    end;

    -- ================= como CLIENTE cualquiera =================
    reset role;
    perform set_config('request.jwt.claims',
      json_build_object('sub', falso, 'role', 'authenticated')::text, true);
    set local role authenticated;
    r := r || ('Un cliente no tiene rol de equipo|' || case when public.mi_rol() is null then 'PASA' else 'FALLA' end);
    begin
      datos := public.consulta_datos();
      r := r || ('Un cliente no puede usar la consulta del equipo|FALLA');
    exception when insufficient_privilege then r := r || ('Un cliente no puede usar la consulta del equipo|PASA');
              when others then r := r || ('Un cliente no puede usar la consulta del equipo|ERROR ' || sqlstate || ' ' || sqlerrm);
    end;

    -- ================= como VISITANTE sin sesión =================
    reset role;
    perform set_config('request.jwt.claims', '', true);
    set local role anon;
    begin
      datos := public.consulta_datos();
      r := r || ('Un visitante sin sesión no puede usar la consulta|FALLA');
    exception when insufficient_privilege then r := r || ('Un visitante sin sesión no puede usar la consulta|PASA');
              when others then r := r || ('Un visitante sin sesión no puede usar la consulta|ERROR ' || sqlstate || ' ' || sqlerrm);
    end;

    -- ================= como ADMINISTRADOR =================
    reset role;
    if admin is not null then
      perform set_config('request.jwt.claims',
        json_build_object('sub', admin, 'role', 'authenticated')::text, true);
      set local role authenticated;
      r := r || ('El administrador sigue siendo "admin"|' || case when public.mi_rol() = 'admin' then 'PASA' else 'FALLA' end);
      select count(*) into cuenta from public.perfiles;
      r := r || ('El administrador sigue viendo todos los clientes|PASA (' || cuenta || ' clientes)');
      reset role;
    end if;

    raise exception 'ic_fin_de_prueba';   -- deshace todo lo de arriba
  exception when others then
    if sqlerrm <> 'ic_fin_de_prueba' then
      r := r || ('Prueba interrumpida|ERROR ' || sqlstate || ' ' || sqlerrm);
    end if;
  end;
  end if;

  -- comprobaciones de estructura (solo lectura)
  r := r || ('Historial: disparadores instalados|' ||
    case when (select count(*) from pg_trigger where tgname = 'auditar_estado' and not tgisinternal) = 3
         then 'PASA' else 'FALLA' end);
  r := r || ('Permisos anónimos viejos cerrados (supabase-cerrar-anonimo.sql)|' ||
    case when exists (select 1 from pg_policies
                      where 'anon' = any(roles) and policyname = 'web puede insertar'
                        and tablename in ('documentos','tarjetas','cuentas','operaciones'))
           or exists (select 1 from pg_policies where policyname = 'web puede subir documentos')
         then 'FALLA: ejecuta supabase-cerrar-anonimo.sql' else 'PASA' end);

  return query select i::int, split_part(x, '|', 1), split_part(x, '|', 2)
               from unnest(r) with ordinality as t(x, i);
end;
$$;

select * from pg_temp.ic_probar();
