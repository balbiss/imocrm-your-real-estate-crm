-- Feature pedida: "botao almoço" -- corretor consegue pausar o recebimento de
-- leads novos sem perder a posicao na fila nem sair do plantao (diferente de
-- ficar OFFLINE, que so volta a contar a partir do proximo embaralhar).
-- perfis_update ja permite o proprio usuario atualizar sua linha (id =
-- auth.uid()), entao o toggle e feito direto do client, sem RPC novo.
ALTER TABLE perfis ADD COLUMN IF NOT EXISTS em_almoco boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.get_next_corretor_rodizio(p_imobiliaria_id uuid)
 RETURNS TABLE(corretor_id uuid)
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_corretor_id uuid;
  v_max_posicao integer;
  v_now_local timestamp;
  v_dow int;
  v_hora time;
  v_corte time;
BEGIN
  v_now_local := now() AT TIME ZONE 'America/Sao_Paulo';
  v_dow := EXTRACT(DOW FROM v_now_local);
  v_hora := v_now_local::time;
  IF v_dow = 0 THEN
    RETURN QUERY SELECT NULL::uuid; RETURN;
  END IF;
  v_corte := CASE v_dow WHEN 4 THEN TIME '19:20' WHEN 6 THEN TIME '15:20' ELSE TIME '18:20' END;
  IF v_hora >= v_corte THEN
    RETURN QUERY SELECT NULL::uuid; RETURN;
  END IF;
  SELECT f.corretor_id INTO v_corretor_id
  FROM filas_atendimento f
  JOIN perfis p ON p.id = f.corretor_id
  WHERE p.imobiliaria_id = p_imobiliaria_id
    AND p.status_roleta = TRUE
    AND p.em_almoco = FALSE
    AND f.ativo_no_turno = TRUE
  ORDER BY f.posicao ASC LIMIT 1;
  IF v_corretor_id IS NOT NULL THEN
    SELECT COALESCE(MAX(f2.posicao), 0) INTO v_max_posicao FROM filas_atendimento f2 WHERE f2.imobiliaria_id = p_imobiliaria_id;
    UPDATE filas_atendimento f3 SET posicao = v_max_posicao + 1 WHERE f3.corretor_id = v_corretor_id AND f3.imobiliaria_id = p_imobiliaria_id;
  END IF;
  RETURN QUERY SELECT v_corretor_id;
END;
$function$;
