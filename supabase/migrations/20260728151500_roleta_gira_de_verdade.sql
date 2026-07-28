-- get_next_corretor_rodizio so lia quem estava na posicao mais baixa e nunca
-- avancava a fila, entao o mesmo corretor (o de posicao mais baixa) recebia
-- praticamente todo lead novo pra sempre. Agora, depois de escolher o
-- proximo corretor, ele e movido pro fim da fila daquela imobiliaria.
CREATE OR REPLACE FUNCTION public.get_next_corretor_rodizio(p_imobiliaria_id uuid)
 RETURNS TABLE(corretor_id uuid)
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_corretor_id uuid;
  v_max_posicao integer;
BEGIN
    SELECT f.corretor_id INTO v_corretor_id
    FROM filas_atendimento f
    JOIN perfis p ON p.id = f.corretor_id
    WHERE p.imobiliaria_id = p_imobiliaria_id
      AND p.status_roleta = TRUE
      AND p.ultimo_checkin_roleta >= NOW() - INTERVAL '30 minutes'
    ORDER BY f.posicao ASC
    LIMIT 1;

    IF v_corretor_id IS NOT NULL THEN
      SELECT COALESCE(MAX(f2.posicao), 0) INTO v_max_posicao
      FROM filas_atendimento f2
      WHERE f2.imobiliaria_id = p_imobiliaria_id;

      UPDATE filas_atendimento
      SET posicao = v_max_posicao + 1
      WHERE corretor_id = v_corretor_id AND imobiliaria_id = p_imobiliaria_id;
    END IF;

    RETURN QUERY SELECT v_corretor_id;
END;
$function$;
