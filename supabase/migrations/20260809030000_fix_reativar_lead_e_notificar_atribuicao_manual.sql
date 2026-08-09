-- Bug real reportado (09/08): dono clicou "Reativar" num lead descadastrado
-- (12991075102) e o card continuou exatamente igual -- descartado_em e
-- status nunca mudaram. Causa: reactivateMutation (redistribuicao.tsx)
-- fazia um update direto sem checar {error} nem confirmar linhas afetadas
-- -- mesmo padrao do bug ja corrigido em descartar_lead_normal (05/08).
-- Fix: RPC SECURITY DEFINER que confirma a mudanca de verdade (RAISE
-- EXCEPTION se nao afetar nenhuma linha) e tambem reseta coluna_kanban_id
-- (o update antigo nao mexia nisso -- o lead reativado ficava com
-- status='novo' mas preso visualmente na coluna antiga, tipo LEAD
-- DESCADASTRAR, contribuindo pro "sumico").
CREATE OR REPLACE FUNCTION public.reativar_lead(p_lead_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_imobiliaria_id uuid;
  v_coluna_rebatida uuid;
  v_rows_affected integer;
BEGIN
  IF get_auth_role() NOT IN ('dono', 'gerente') THEN
    RAISE EXCEPTION 'Sem permissão para reativar leads.';
  END IF;

  SELECT imobiliaria_id INTO v_imobiliaria_id FROM leads WHERE id = p_lead_id;
  SELECT id INTO v_coluna_rebatida FROM colunas_kanban WHERE imobiliaria_id = v_imobiliaria_id AND nome ILIKE '%rebatid%' ORDER BY posicao LIMIT 1;

  UPDATE leads SET
    corretor_id = NULL,
    descartado_em = NULL,
    descartado_por = NULL,
    motivo_descarte = NULL,
    status = 'rebatida',
    coluna_kanban_id = COALESCE(v_coluna_rebatida, coluna_kanban_id),
    tentativas_contato = 0,
    lembrete_follow_up = NULL,
    data_visita = NULL,
    ultima_acao_at = NOW()
  WHERE id = p_lead_id;

  GET DIAGNOSTICS v_rows_affected = ROW_COUNT;
  IF v_rows_affected = 0 THEN
    RAISE EXCEPTION 'Lead não encontrado.';
  END IF;
END;
$function$;

-- Bug real reportado (09/08): "quando eu transfiro pra eles no kanban lead
-- novo" o popup+som de lead novo (LeadNovoAlertProvider, sessao 06/08) nao
-- dispara. Causa: distribuir_leads_massa() -- usada por "Transferir" no
-- card e "Encaminhar para..." em Rebatidas -- nunca inseria notificacao,
-- só a roleta automatica e o reenvio duplicado faziam isso. Fix: notifica
-- só quando p_tipo='manual' (sempre 1 lead por vez, é como "Transferir" e
-- "Encaminhar para..." individual chamam essa RPC) -- NAO quando
-- p_tipo='massa' (Ações em Massa pode mover dezenas de leads de uma vez,
-- gerar uma notificacao+popup por lead viraria spam).
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
  SELECT id INTO v_coluna_rebatida_id FROM colunas_kanban WHERE imobiliaria_id = v_imobiliaria_id AND nome ILIKE '%rebatid%' ORDER BY posicao LIMIT 1;
  UPDATE leads SET corretor_id = p_corretor_id, status = 'rebatida', coluna_kanban_id = COALESCE(v_coluna_rebatida_id, coluna_kanban_id), tentativas_contato = 0, ultima_interacao = NOW(), descartado_em = NULL, descartado_por = NULL, motivo_descarte = NULL, lembrete_follow_up = NULL, data_visita = NULL, data_atribuicao = NOW(), primeiro_contato_em = NULL WHERE id = ANY(p_lead_ids);
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
