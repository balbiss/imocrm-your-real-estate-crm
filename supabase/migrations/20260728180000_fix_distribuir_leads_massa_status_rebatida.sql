-- distribuir_leads_massa (chamada em toda redistribuicao/transferencia de
-- lead ja existente, tanto manual quanto em massa) marcava o lead como
-- status='novo', fazendo ele reaparecer como "Lead Novo" em vez de
-- "Rebatida" -- mesmo quando o card ficava fisicamente na coluna antiga,
-- ja que a funcao tambem nunca tocava coluna_kanban_id. Todas as 4
-- chamadas desta funcao no app sao de reatribuicao (nunca de criacao de
-- lead novo), entao 'rebatida' e o status correto em todos os casos.
CREATE OR REPLACE FUNCTION public.distribuir_leads_massa(p_lead_ids uuid[], p_corretor_id uuid, p_tipo text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_imobiliaria_id uuid;
  v_coluna_rebatida_id uuid;
BEGIN
  SELECT imobiliaria_id INTO v_imobiliaria_id FROM perfis WHERE id = p_corretor_id;

  -- Acha a coluna de kanban dessa imobiliaria cujo nome bate com "rebatida"
  -- (mesmo criterio usado no heuristico do front, getRetrocompatibleStatus).
  SELECT id INTO v_coluna_rebatida_id
  FROM colunas_kanban
  WHERE imobiliaria_id = v_imobiliaria_id AND nome ILIKE '%rebatid%'
  ORDER BY posicao
  LIMIT 1;

  UPDATE leads
  SET
    corretor_id = p_corretor_id,
    status = 'rebatida',
    coluna_kanban_id = COALESCE(v_coluna_rebatida_id, coluna_kanban_id),
    tentativas_contato = 0,
    ultima_interacao = NOW(),
    descartado_em = NULL,
    descartado_por = NULL,
    motivo_descarte = NULL
  WHERE id = ANY(p_lead_ids);

  INSERT INTO distribuicao_log (lead_id, corretor_id, imobiliaria_id, tipo)
  SELECT l.id, p_corretor_id, l.imobiliaria_id, p_tipo
  FROM leads l
  WHERE l.id = ANY(p_lead_ids);

  UPDATE perfis
  SET ultimo_lead_recebido_em = NOW()
  WHERE id = p_corretor_id;
END;
$function$;
