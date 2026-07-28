-- get_next_corretor_rodizio nunca expirava o check-in: um corretor que fez
-- check-in e esqueceu de sair continuava recebendo leads novos indefinidamente,
-- mesmo horas depois, porque so olhava status_roleta = true (nunca vira false
-- sozinho). Agora tambem exige check-in nos ultimos 30 minutos.
CREATE OR REPLACE FUNCTION public.get_next_corretor_rodizio(p_imobiliaria_id uuid)
 RETURNS TABLE(corretor_id uuid)
 LANGUAGE plpgsql
AS $function$
BEGIN
    RETURN QUERY
    SELECT f.corretor_id
    FROM filas_atendimento f
    JOIN perfis p ON p.id = f.corretor_id
    WHERE p.imobiliaria_id = p_imobiliaria_id
      AND p.status_roleta = TRUE
      AND p.ultimo_checkin_roleta >= NOW() - INTERVAL '30 minutes'
    ORDER BY f.posicao ASC
    LIMIT 1;
END;
$function$;
