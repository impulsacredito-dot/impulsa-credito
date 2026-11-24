-- =====================================================================
-- IMPULSA CRÉDITO — Prueba de los accesos del equipo (no cambia nada)
-- =====================================================================
-- Comprueba, DENTRO de tu base de datos real, que:
--   · CONSULTA no puede escribir nada, no ve fotos y recibe lo sensible
--     oculto;
--   · SOPORTE ve las fotos, pero tampoco puede escribir nada y sigue
--     recibiendo cuentas, celulares y correos ocultos;
--   · el estado de conexión (puntos verde, amarillo y rojo) funciona.
--
-- ES SEGURO: todo lo que intenta se hace dentro de un bloque que al
-- final se DESHACE solo. No crea, no cambia y no borra ningún dato.
-- Con UN solo trabajador basta: durante la prueba se le pone primero
-- como Consulta y luego como Soporte, y al terminar vuelve a quedar
-- exactamente como estaba.
--
-- CÓMO USARLO (después de supabase-equipo-consulta.sql,
-- supabase-equipo-soporte.sql y de agregar al menos a un trabajador
-- desde la pestaña "Equipo" del panel):
--   Supabase → SQL Editor → New query → pega TODO → Run
--   Verás una tabla: cada fila debe decir PASA.
--   Si alguna dice FALLA o ERROR, cópiala y pásamela.
-- =====================================================================

create or replace function pg_temp.ic_probar()
returns table (n int, prueba text, resultado text)
language plpgsql
as $$
declare
  r          text[] := '{}';
  consulta   uuid;          -- el trabajador con el que se prueba
  admin      uuid;
  falso      uuid := gen_random_uuid();
  filas      int;
  cuenta     int;
  archivos   int;
  valor      text;
  datos      jsonb;
  con_roles  boolean := false;
  -- cada resultado se guarda como "prueba|resultado"
begin
  if to_regclass('public.consultores') is null or to_regprocedure('public.consulta_datos()') is null then
    r := array_append(r, 'supabase-equipo-consulta.sql ejecutado|FALTA: ejecútalo primero');
  else
    r := array_append(r, 'supabase-equipo-consulta.sql ejecutado|PASA');
    execute 'select id from public.consultores order by creado_en desc limit 1' into consulta;
    con_roles := exists (select 1 from information_schema.columns
                         where table_schema = 'public' and table_name = 'consultores' and column_name = 'rol')
             and to_regprocedure('public.registrar_presencia(text)') is not null;
    r := array_append(r, 'supabase-equipo-soporte.sql ejecutado|' ||
      case when con_roles then 'PASA' else 'FALTA: ejecútalo para activar Soporte y el estado de conexión' end);
  end if;
  select a.id into admin from public.admins a order by a.creado_en asc limit 1;
  select count(*) into archivos from storage.objects where bucket_id = 'documentos';

  if consulta is null then
    r := array_append(r, 'Hay al menos un trabajador en el equipo|FALTA: agrégalo desde la pestaña Equipo del panel y vuelve a ejecutar esta prueba');
  end if;

  if consulta is not null then
  begin  -- todo lo de aquí dentro se deshace al final
    -- cuántas fotos ve el administrador (para compararlo con Soporte)
    if admin is not null then
      perform set_config('request.jwt.claims',
        json_build_object('sub', admin, 'role', 'authenticated')::text, true);
      set local role authenticated;
      select count(*) into archivos from storage.objects where bucket_id = 'documentos';
      reset role;
    end if;
    -- ================= como CONSULTA =================
    if con_roles then
      execute 'update public.consultores set rol = ''consulta'' where id = $1' using consulta;
    end if;
    perform set_config('request.jwt.claims',
      json_build_object('sub', consulta, 'role', 'authenticated', 'email', 'prueba@consulta')::text, true);
    set local role authenticated;

    r := array_append(r, 'Consulta: su rol es "consulta"|' || case when public.mi_rol() = 'consulta' then 'PASA' else 'FALLA (' || coalesce(public.mi_rol(), 'sin rol') || ')' end);

    -- lectura a través de la función protegida
    begin
      datos := public.consulta_datos();
      r := array_append(r, 'Consulta: puede ver clientes y operaciones|PASA');
      r := array_append(r, 'Consulta: no recibe fotos de DNI ni selfie|' ||
        case when exists (select 1 from jsonb_array_elements(datos->'documentos') e
                          where e ? 'dni_frontal' or e ? 'dni_posterior' or e ? 'selfie')
             then 'FALLA' else 'PASA' end);
      r := array_append(r, 'Consulta: no recibe fotos de tarjetas|' ||
        case when exists (select 1 from jsonb_array_elements(datos->'tarjetas') e
                          where e ? 'foto_frontal' or e ? 'foto_posterior')
             then 'FALLA' else 'PASA' end);
      r := array_append(r, 'Consulta: números de cuenta ocultos|' ||
        case when exists (select 1 from jsonb_array_elements(datos->'cuentas') e
                          where length(e->>'numero') > 4 and left(e->>'numero', 1) <> '•')
               or exists (select 1 from jsonb_array_elements(datos->'cuentas') e where e ? 'cci')
             then 'FALLA' else 'PASA' end);
    exception when others then
      r := array_append(r, 'Consulta: puede ver clientes y operaciones|ERROR ' || sqlstate || ' ' || sqlerrm);
    end;

    -- no lee las tablas directamente
    select count(*) into cuenta from public.operaciones;
    r := array_append(r, 'Consulta: no lee la tabla de operaciones directamente|' || case when cuenta = 0 then 'PASA' else 'FALLA (ve ' || cuenta || ')' end);
    select count(*) into cuenta from public.perfiles;
    r := array_append(r, 'Consulta: no lee la tabla de clientes directamente|' || case when cuenta = 0 then 'PASA' else 'FALLA (ve ' || cuenta || ')' end);
    select count(*) into cuenta from storage.objects where bucket_id = 'documentos';
    r := array_append(r, 'Consulta: no puede abrir fotos (DNI, selfie, tarjetas)|' || case when cuenta = 0 then 'PASA' else 'FALLA (ve ' || cuenta || ')' end);
    select count(*) into cuenta from public.auditoria;
    r := array_append(r, 'Consulta: no lee el historial de auditoría|' || case when cuenta = 0 then 'PASA' else 'FALLA (ve ' || cuenta || ')' end);

    -- no puede cambiar ni borrar
    update public.operaciones set estado = 'completada' where estado in ('pend_pago', 'activa');
    get diagnostics filas = row_count;
    r := array_append(r, 'Consulta: no puede completar operaciones|' || case when filas = 0 then 'PASA' else 'FALLA (cambió ' || filas || ')' end);
    update public.operaciones set monto = monto;
    get diagnostics filas = row_count;
    r := array_append(r, 'Consulta: no puede cambiar montos|' || case when filas = 0 then 'PASA' else 'FALLA (cambió ' || filas || ')' end);
    update public.documentos set estado = 'verificado' where estado = 'en_revision';
    get diagnostics filas = row_count;
    r := array_append(r, 'Consulta: no puede aprobar documentos|' || case when filas = 0 then 'PASA' else 'FALLA (cambió ' || filas || ')' end);
    update public.tarjetas set estado = 'rechazado';
    get diagnostics filas = row_count;
    r := array_append(r, 'Consulta: no puede rechazar tarjetas|' || case when filas = 0 then 'PASA' else 'FALLA (cambió ' || filas || ')' end);
    update public.perfiles set celular = celular;
    get diagnostics filas = row_count;
    r := array_append(r, 'Consulta: no puede editar clientes|' || case when filas = 0 then 'PASA' else 'FALLA (cambió ' || filas || ')' end);
    delete from public.operaciones;
    get diagnostics filas = row_count;
    r := array_append(r, 'Consulta: no puede borrar operaciones|' || case when filas = 0 then 'PASA' else 'FALLA (borró ' || filas || ')' end);

    -- no puede crear (ni siquiera datos "suyos" como si fuera cliente)
    begin
      insert into public.operaciones (user_id, codigo, monto, comision, neto, estado)
      values (consulta, 'IC-PRUEBA', 1, 0, 1, 'pend_pago');
      r := array_append(r, 'Consulta: no puede crear operaciones|FALLA');
    exception when insufficient_privilege then r := array_append(r, 'Consulta: no puede crear operaciones|PASA');
              when others then r := array_append(r, 'Consulta: no puede crear operaciones|ERROR ' || sqlstate || ' ' || sqlerrm);
    end;
    begin
      insert into public.perfiles (id, nombres, documento) values (consulta, 'Prueba', '00000000');
      r := array_append(r, 'Consulta: no puede crear clientes|FALLA');
    exception when insufficient_privilege then r := array_append(r, 'Consulta: no puede crear clientes|PASA');
              when others then r := array_append(r, 'Consulta: no puede crear clientes|ERROR ' || sqlstate || ' ' || sqlerrm);
    end;
    begin
      insert into public.documentos (user_id, estado) values (consulta, 'en_revision');
      r := array_append(r, 'Consulta: no puede agregar documentos|FALLA');
    exception when insufficient_privilege then r := array_append(r, 'Consulta: no puede agregar documentos|PASA');
              when others then r := array_append(r, 'Consulta: no puede agregar documentos|ERROR ' || sqlstate || ' ' || sqlerrm);
    end;
    begin
      insert into public.avisos (user_id, titulo) values (consulta, 'Prueba');
      r := array_append(r, 'Consulta: no puede enviar avisos a clientes|FALLA');
    exception when insufficient_privilege then r := array_append(r, 'Consulta: no puede enviar avisos a clientes|PASA');
              when others then r := array_append(r, 'Consulta: no puede enviar avisos a clientes|ERROR ' || sqlstate || ' ' || sqlerrm);
    end;
    begin
      insert into public.notas_cliente (cliente_id, texto) values (consulta, 'Prueba');
      r := array_append(r, 'Consulta: no puede escribir notas internas|FALLA');
    exception when insufficient_privilege then r := array_append(r, 'Consulta: no puede escribir notas internas|PASA');
              when others then r := array_append(r, 'Consulta: no puede escribir notas internas|ERROR ' || sqlstate || ' ' || sqlerrm);
    end;
    begin
      insert into storage.objects (bucket_id, name) values ('documentos', consulta::text || '/prueba.jpg');
      r := array_append(r, 'Consulta: no puede subir archivos|FALLA');
    exception when insufficient_privilege then r := array_append(r, 'Consulta: no puede subir archivos|PASA');
              when others then r := array_append(r, 'Consulta: no puede subir archivos|ERROR ' || sqlstate || ' ' || sqlerrm);
    end;

    -- no puede darse más permisos
    begin
      insert into public.admins (id, nombre) values (consulta, 'Prueba');
      r := array_append(r, 'Consulta: no puede volverse administrador|FALLA');
    exception when insufficient_privilege then r := array_append(r, 'Consulta: no puede volverse administrador|PASA');
              when others then r := array_append(r, 'Consulta: no puede volverse administrador|ERROR ' || sqlstate || ' ' || sqlerrm);
    end;
    begin
      perform public.equipo_agregar('prueba@impulsa.test', 'Prueba');
      r := array_append(r, 'Consulta: no puede agregar trabajadores|FALLA');
    exception when insufficient_privilege then r := array_append(r, 'Consulta: no puede agregar trabajadores|PASA');
              when others then r := array_append(r, 'Consulta: no puede agregar trabajadores|ERROR ' || sqlstate || ' ' || sqlerrm);
    end;
    begin
      perform public.equipo_quitar(consulta);
      r := array_append(r, 'Consulta: no puede quitar accesos|FALLA');
    exception when insufficient_privilege then r := array_append(r, 'Consulta: no puede quitar accesos|PASA');
              when others then r := array_append(r, 'Consulta: no puede quitar accesos|ERROR ' || sqlstate || ' ' || sqlerrm);
    end;
    begin
      perform public.equipo_guardar(consulta, 'Prueba', 'Gerente', null);
      r := array_append(r, 'Consulta: no puede editar al equipo|FALLA');
    exception when insufficient_privilege then r := array_append(r, 'Consulta: no puede editar al equipo|PASA');
              when others then r := array_append(r, 'Consulta: no puede editar al equipo|ERROR ' || sqlstate || ' ' || sqlerrm);
    end;
    begin
      perform public.mi_perfil_guardar(null, 'Puesto inventado por la prueba', null);
      r := array_append(r, 'Consulta: no puede cambiarse su propio puesto|' ||
        case when coalesce(public.mi_perfil() ->> 'puesto', '') = 'Puesto inventado por la prueba' then 'FALLA' else 'PASA' end);
    exception when others then r := array_append(r, 'Consulta: no puede cambiarse su propio puesto|ERROR ' || sqlstate || ' ' || sqlerrm);
    end;
    begin
      insert into public.consultores (id, nombre) values (falso, 'Prueba');
      r := array_append(r, 'Consulta: no puede dar acceso a otras personas|FALLA');
    exception when insufficient_privilege then r := array_append(r, 'Consulta: no puede dar acceso a otras personas|PASA');
              when others then r := array_append(r, 'Consulta: no puede dar acceso a otras personas|PASA (rechazado: ' || sqlstate || ')');
    end;

    -- ================= como SOPORTE (el mismo trabajador, solo durante la prueba) =================
    if con_roles then
      reset role;
      execute 'update public.consultores set rol = ''soporte'' where id = $1' using consulta;
      perform set_config('request.jwt.claims',
        json_build_object('sub', consulta, 'role', 'authenticated', 'email', 'prueba@soporte')::text, true);
      set local role authenticated;

      r := array_append(r, 'Soporte: su rol es "soporte"|' || case when public.mi_rol() = 'soporte' then 'PASA' else 'FALLA (' || coalesce(public.mi_rol(), 'sin rol') || ')' end);
      begin
        datos := public.consulta_datos();
        r := array_append(r, 'Soporte: recibe las fotos de DNI y selfie|' ||
          case when exists (select 1 from jsonb_array_elements(datos->'documentos') e where not (e ? 'selfie'))
               then 'FALLA' else 'PASA' end);
        r := array_append(r, 'Soporte: recibe las fotos de tarjetas|' ||
          case when exists (select 1 from jsonb_array_elements(datos->'tarjetas') e where not (e ? 'foto_frontal'))
               then 'FALLA' else 'PASA' end);
        r := array_append(r, 'Soporte: números de cuenta ocultos|' ||
          case when exists (select 1 from jsonb_array_elements(datos->'cuentas') e
                            where length(e->>'numero') > 4 and left(e->>'numero', 1) <> '•')
                 or exists (select 1 from jsonb_array_elements(datos->'cuentas') e where e ? 'cci')
               then 'FALLA' else 'PASA' end);
        r := array_append(r, 'Soporte: celulares y correos ocultos|' ||
          case when exists (select 1 from jsonb_array_elements(datos->'perfiles') e
                            where (length(e->>'celular') > 3 and left(e->>'celular', 1) <> '•')
                               or (position('@' in coalesce(e->>'email', '')) > 0 and position('•' in e->>'email') = 0))
                 or exists (select 1 from jsonb_array_elements(datos->'operaciones') e
                            where length(e->>'numero_cuenta') > 4 and left(e->>'numero_cuenta', 1) <> '•')
               then 'FALLA' else 'PASA' end);
      exception when others then
        r := array_append(r, 'Soporte: puede ver clientes y operaciones|ERROR ' || sqlstate || ' ' || sqlerrm);
      end;

      select count(*) into cuenta from storage.objects where bucket_id = 'documentos';
      r := array_append(r, 'Soporte: puede abrir las fotos|' ||
        case when cuenta = archivos then 'PASA (' || cuenta || ' archivos)' else 'FALLA (abre ' || cuenta || ' de ' || archivos || ')' end);
      select count(*) into cuenta from public.perfiles;
      r := array_append(r, 'Soporte: no lee la tabla de clientes directamente|' || case when cuenta = 0 then 'PASA' else 'FALLA (ve ' || cuenta || ')' end);
      select count(*) into cuenta from public.auditoria;
      r := array_append(r, 'Soporte: no lee el historial de auditoría|' || case when cuenta = 0 then 'PASA' else 'FALLA (ve ' || cuenta || ')' end);

      update public.documentos set estado = 'verificado' where estado = 'en_revision';
      get diagnostics filas = row_count;
      r := array_append(r, 'Soporte: no puede aprobar documentos|' || case when filas = 0 then 'PASA' else 'FALLA (cambió ' || filas || ')' end);
      update public.tarjetas set estado = 'rechazado';
      get diagnostics filas = row_count;
      r := array_append(r, 'Soporte: no puede rechazar tarjetas|' || case when filas = 0 then 'PASA' else 'FALLA (cambió ' || filas || ')' end);
      update public.operaciones set estado = 'completada' where estado in ('pend_pago', 'activa');
      get diagnostics filas = row_count;
      r := array_append(r, 'Soporte: no puede completar operaciones|' || case when filas = 0 then 'PASA' else 'FALLA (cambió ' || filas || ')' end);
      begin
        update storage.objects set name = name where bucket_id = 'documentos';
        get diagnostics filas = row_count;
        r := array_append(r, 'Soporte: no puede cambiar las fotos|' || case when filas = 0 then 'PASA' else 'FALLA (cambió ' || filas || ')' end);
      exception when others then r := array_append(r, 'Soporte: no puede cambiar las fotos|PASA (rechazado: ' || sqlstate || ')');
      end;
      begin
        insert into storage.objects (bucket_id, name) values ('documentos', consulta::text || '/prueba.jpg');
        r := array_append(r, 'Soporte: no puede subir archivos|FALLA');
      exception when insufficient_privilege then r := array_append(r, 'Soporte: no puede subir archivos|PASA');
                when others then r := array_append(r, 'Soporte: no puede subir archivos|ERROR ' || sqlstate || ' ' || sqlerrm);
      end;
      begin
        insert into public.notas_cliente (cliente_id, texto) values (consulta, 'Prueba');
        r := array_append(r, 'Soporte: no puede escribir notas internas|FALLA');
      exception when insufficient_privilege then r := array_append(r, 'Soporte: no puede escribir notas internas|PASA');
                when others then r := array_append(r, 'Soporte: no puede escribir notas internas|ERROR ' || sqlstate || ' ' || sqlerrm);
      end;
      begin
        perform public.equipo_guardar(consulta, null, null, null, 'soporte');
        r := array_append(r, 'Soporte: no puede cambiar accesos del equipo|FALLA');
      exception when insufficient_privilege then r := array_append(r, 'Soporte: no puede cambiar accesos del equipo|PASA');
                when others then r := array_append(r, 'Soporte: no puede cambiar accesos del equipo|ERROR ' || sqlstate || ' ' || sqlerrm);
      end;
      begin
        perform public.equipo_listar();
        r := array_append(r, 'Soporte: no puede ver la lista del equipo|FALLA');
      exception when insufficient_privilege then r := array_append(r, 'Soporte: no puede ver la lista del equipo|PASA');
                when others then r := array_append(r, 'Soporte: no puede ver la lista del equipo|ERROR ' || sqlstate || ' ' || sqlerrm);
      end;

      -- estado de conexión
      begin
        valor := public.registrar_presencia('activo');
        r := array_append(r, 'Estado de conexión: se registra|' || case when valor = 'soporte' then 'PASA' else 'FALLA (' || coalesce(valor, 'sin rol') || ')' end);
      exception when others then r := array_append(r, 'Estado de conexión: se registra|ERROR ' || sqlstate || ' ' || sqlerrm);
      end;
      reset role;
      execute 'select public.ic_estado_conexion(presencia, visto_en) from public.consultores where id = $1' into valor using consulta;
      r := array_append(r, 'Estado de conexión: aparece "En línea" (verde)|' || case when valor = 'en_linea' then 'PASA' else 'FALLA (' || coalesce(valor, 'vacío') || ')' end);
    end if;

    -- ================= como CLIENTE cualquiera =================
    reset role;
    perform set_config('request.jwt.claims',
      json_build_object('sub', falso, 'role', 'authenticated')::text, true);
    set local role authenticated;
    r := array_append(r, 'Un cliente no tiene rol de equipo|' || case when public.mi_rol() is null then 'PASA' else 'FALLA' end);
    begin
      datos := public.consulta_datos();
      r := array_append(r, 'Un cliente no puede usar la consulta del equipo|FALLA');
    exception when insufficient_privilege then r := array_append(r, 'Un cliente no puede usar la consulta del equipo|PASA');
              when others then r := array_append(r, 'Un cliente no puede usar la consulta del equipo|ERROR ' || sqlstate || ' ' || sqlerrm);
    end;
    select count(*) into cuenta from storage.objects where bucket_id = 'documentos';
    r := array_append(r, 'Un cliente no puede abrir fotos de otros clientes|' || case when cuenta = 0 then 'PASA' else 'FALLA (abre ' || cuenta || ')' end);

    -- ================= como VISITANTE sin sesión =================
    reset role;
    perform set_config('request.jwt.claims', '', true);
    set local role anon;
    begin
      datos := public.consulta_datos();
      r := array_append(r, 'Un visitante sin sesión no puede usar la consulta|FALLA');
    exception when insufficient_privilege then r := array_append(r, 'Un visitante sin sesión no puede usar la consulta|PASA');
              when others then r := array_append(r, 'Un visitante sin sesión no puede usar la consulta|ERROR ' || sqlstate || ' ' || sqlerrm);
    end;

    -- ================= como ADMINISTRADOR =================
    reset role;
    if admin is not null then
      perform set_config('request.jwt.claims',
        json_build_object('sub', admin, 'role', 'authenticated')::text, true);
      set local role authenticated;
      r := array_append(r, 'El administrador sigue siendo "admin"|' || case when public.mi_rol() = 'admin' then 'PASA' else 'FALLA' end);
      select count(*) into cuenta from public.perfiles;
      r := array_append(r, 'El administrador sigue viendo todos los clientes|PASA (' || cuenta || ' clientes)');
      select count(*) into cuenta from storage.objects where bucket_id = 'documentos';
      r := array_append(r, 'El administrador sigue viendo todas las fotos|' || case when cuenta = archivos then 'PASA (' || cuenta || ' archivos)' else 'FALLA (ve ' || cuenta || ' de ' || archivos || ')' end);
      reset role;
    end if;

    raise exception 'ic_fin_de_prueba';   -- deshace todo lo de arriba
  exception when others then
    if sqlerrm <> 'ic_fin_de_prueba' then
      r := array_append(r, 'Prueba interrumpida|ERROR ' || sqlstate || ' ' || sqlerrm);
    end if;
  end;
  end if;

  -- comprobaciones de estructura (solo lectura)
  r := array_append(r, 'Historial: disparadores instalados|' ||
    case when (select count(*) from pg_trigger where tgname = 'auditar_estado' and not tgisinternal) = 3
         then 'PASA' else 'FALLA' end);
  r := array_append(r, 'Permisos anónimos viejos cerrados (supabase-cerrar-anonimo.sql)|' ||
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
