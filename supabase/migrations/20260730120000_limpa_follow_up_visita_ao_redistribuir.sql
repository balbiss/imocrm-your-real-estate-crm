-- Lead reatribuido/redistribuido carregava lembrete_follow_up e data_visita
-- antigos, entao chegava pro novo corretor ja "atrasado" na tela de Tarefas
-- mesmo sem ele ter feito nada ainda. distribuir_leads_massa agora zera os
-- dois campos junto com o resto do reset (descarte, tentativas_contato).
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
    motivo_descarte = NULL,
    lembrete_follow_up = NULL,
    data_visita = NULL
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
