-- Bug real reportado pelo dono (11/09, grupo do WhatsApp): lead "cleudiane"
-- se recadastrou (12996522021), o sistema avisou dono/gerente que não tinha
-- corretor disponível pra roleta pegar (comportamento correto), o gerente
-- transferiu manualmente pra Melissa via "Transferir para" no card -- mas o
-- card continuou com a etiqueta REBATIDA e preso na coluna REBATIDA do
-- Kanban mesmo já tendo dono, dando a impressão de que "não foi pra
-- ninguém".
--
-- Causa raiz: distribuir_leads_massa() -- usada por "Transferir para" no
-- card (transferência individual), "Encaminhar para..." em Rebatidas e
-- "Ações em Massa" em Distribuição de Leads -- sempre jogava o lead pra
-- status='rebatida' + coluna REBATIDA, mesmo quando o que a função está
-- fazendo é literalmente atribuir um corretor. Isso contraria o que o
-- próprio Manual do sistema documenta ("Transferir um lead ... move o lead
-- na hora e avisa o corretor, do mesmo jeito que um lead novo da roleta")
-- e o que a roleta automática faz de verdade (check_lead_duplicado, "Lead
-- reativado": status='novo' + coluna "LEAD NOVO").
--
-- Fix: ao distribuir (individual ou em massa), o lead vai pra status='novo'
-- e pra coluna "LEAD NOVO" -- mesmo padrão já usado em check_lead_duplicado
-- -- em vez de ficar preso em REBATIDA. Mantém tudo mais que a função já
-- fazia (zera tentativas, limpa descarte, registra distribuicao_log,
-- notifica em p_tipo='manual').
CREATE OR REPLACE FUNCTION public.distribuir_leads_massa(p_lead_ids uuid[], p_corretor_id uuid, p_tipo text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_imobiliaria_id uuid;
  v_coluna_lead_novo_id uuid;
BEGIN
  SELECT imobiliaria_id INTO v_imobiliaria_id FROM perfis WHERE id = p_corretor_id;
  SELECT id INTO v_coluna_lead_novo_id FROM colunas_kanban WHERE imobiliaria_id = v_imobiliaria_id AND nome ILIKE '%lead novo%' ORDER BY posicao LIMIT 1;
  UPDATE leads SET
    corretor_id = p_corretor_id,
    status = 'novo',
    coluna_kanban_id = COALESCE(v_coluna_lead_novo_id, coluna_kanban_id),
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
