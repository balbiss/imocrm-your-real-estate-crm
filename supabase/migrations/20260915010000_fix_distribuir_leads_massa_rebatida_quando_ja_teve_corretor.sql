-- Bug real reportado pelo dono no grupo (15/09): "To transferindo leads de
-- um corretor que saiu e quando vai pra outro corretor esta indo como lead
-- novo, mas como já passou por um corretor tem que ir pra rebatida."
--
-- O fix de 20260911000000 (migration anterior) mudou distribuir_leads_massa
-- pra SEMPRE mandar o lead pra status='novo' + coluna LEAD NOVO -- certo pro
-- caso que motivou aquele fix (lead "cleudiane": corretor_id NULL, nunca
-- tinha sido atribuído, gerente atribuindo manualmente pela 1ª vez). Mas essa
-- mesma função também é usada pra REDISTRIBUIR leads de um corretor que saiu
-- da equipe pra outro -- nesse caso o lead JÁ tinha corretor_id preenchido
-- (já foi atendido antes), e virar "novo" de novo é errado: some do rastro
-- de que já passou por alguém, dono pede REBATIDA.
--
-- Fix: decide por linha, com base no corretor_id de CADA lead ANTES do
-- UPDATE (o CASE dentro do próprio SET sempre vê o valor antigo, mesmo
-- estando no mesmo statement que atualiza corretor_id) -- sem corretor
-- antes = 'novo' (comportamento de 11/09 preservado); com corretor antes =
-- 'rebatida' (pedido de hoje). Mesma lógica pra qual coluna do Kanban usar.
CREATE OR REPLACE FUNCTION public.distribuir_leads_massa(p_lead_ids uuid[], p_corretor_id uuid, p_tipo text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_imobiliaria_id uuid;
  v_coluna_lead_novo_id uuid;
  v_coluna_rebatida_id uuid;
BEGIN
  SELECT imobiliaria_id INTO v_imobiliaria_id FROM perfis WHERE id = p_corretor_id;
  SELECT id INTO v_coluna_lead_novo_id FROM colunas_kanban WHERE imobiliaria_id = v_imobiliaria_id AND nome ILIKE '%lead novo%' ORDER BY posicao LIMIT 1;
  SELECT id INTO v_coluna_rebatida_id FROM colunas_kanban WHERE imobiliaria_id = v_imobiliaria_id AND nome ILIKE '%rebatida%' ORDER BY posicao LIMIT 1;
  UPDATE leads SET
    status = (CASE WHEN corretor_id IS NULL THEN 'novo' ELSE 'rebatida' END)::lead_status,
    coluna_kanban_id = COALESCE(
      CASE WHEN corretor_id IS NULL THEN v_coluna_lead_novo_id ELSE v_coluna_rebatida_id END,
      coluna_kanban_id
    ),
    corretor_id = p_corretor_id,
    tentativas_contato = 0,
    ultima_interacao = NOW(),
    descartado_em = NULL,
    descartado_por = NULL,
    motivo_descarte = NULL,
    lembrete_follow_up = NULL,
    data_visita = NULL,
    data_atribuicao = NOW(),
    primeiro_contato_em = NULL
  WHERE id = ANY(p_lead_ids);
  INSERT INTO distribuicao_log (lead_id, corretor_id, imobiliaria_id, tipo) SELECT l.id, p_corretor_id, l.imobiliaria_id, p_tipo FROM leads l WHERE l.id = ANY(p_lead_ids);
  UPDATE perfis SET ultimo_lead_recebido_em = NOW() WHERE id = p_corretor_id;

  IF p_tipo = 'manual' THEN
    INSERT INTO notificacoes (usuario_id, imobiliaria_id, lead_id, tipo, titulo, lida)
    SELECT p_corretor_id, l.imobiliaria_id, l.id, 'lead_novo_atribuido',
      'Lead atribuído a você: ' || COALESCE(NULLIF(l.nome, ''), l.telefone, 'Sem nome'), false
    FROM leads l WHERE l.id = ANY(p_lead_ids);
  END IF;
END;
$function$;
