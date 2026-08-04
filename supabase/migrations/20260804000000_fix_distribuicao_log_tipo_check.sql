-- Corrige bug real: distribuir_bolsao() e reassign_overdue_leads() (adicionadas em
-- 2026-07-31/08-01 direto em producao, sem migration commitada) inseriam tipo=
-- 'bolsao_pos_embaralhar' / 'sla_timeout_sem_contato' em distribuicao_log, mas o check
-- constraint da tabela so permite 'automatico'/'manual'/'massa'. Cada chamada estourava
-- excecao e dava rollback da funcao inteira -- quebrava o botao "Embaralhar" (erro visivel
-- pro usuario) E o timer de 5min de SLA silenciosamente (nenhum lead do bolsao/atrasado
-- era redistribuido desde que essas funcoes foram criadas).
-- Fix: em vez de alterar o constraint da tabela em producao, as duas funcoes passam a
-- gravar tipo='automatico' (valor ja aceito), preservando o historico normal de logs.
CREATE OR REPLACE FUNCTION public.distribuir_bolsao(p_imobiliaria_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_lead RECORD;
  v_corretor uuid;
  v_count integer := 0;
BEGIN
  FOR v_lead IN
    SELECT id FROM leads
    WHERE imobiliaria_id = p_imobiliaria_id
      AND corretor_id IS NULL
      AND descartado_em IS NULL
      AND COALESCE(descarte_pendente_aprovacao, false) = false
    ORDER BY created_at ASC
  LOOP
    SELECT corretor_id INTO v_corretor FROM get_next_corretor_rodizio(p_imobiliaria_id);
    IF v_corretor IS NULL THEN
      EXIT;
    END IF;
    UPDATE leads SET corretor_id = v_corretor, data_atribuicao = NOW(), primeiro_contato_em = NULL WHERE id = v_lead.id;
    INSERT INTO distribuicao_log (lead_id, corretor_id, imobiliaria_id, tipo) VALUES (v_lead.id, v_corretor, p_imobiliaria_id, 'automatico');
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.reassign_overdue_leads()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_lead RECORD;
  v_next_corretor uuid;
BEGIN
  FOR v_lead IN
    SELECT l.id, l.imobiliaria_id, l.data_atribuicao, COALESCE(cd.tempo_limite_atendimento, 300) as limite_seg
    FROM leads l
    LEFT JOIN configuracoes_distribuicao cd ON cd.imobiliaria_id = l.imobiliaria_id
    WHERE l.corretor_id IS NOT NULL
      AND l.status = 'novo'
      AND l.primeiro_contato_em IS NULL
      AND l.descartado_em IS NULL
      AND l.data_atribuicao <= NOW() - (COALESCE(cd.tempo_limite_atendimento, 300) || ' seconds')::interval
  LOOP
    SELECT corretor_id INTO v_next_corretor FROM get_next_corretor_rodizio(v_lead.imobiliaria_id);
    IF v_next_corretor IS NOT NULL AND v_next_corretor <> (SELECT corretor_id FROM leads WHERE id = v_lead.id) THEN
      UPDATE leads SET corretor_id = v_next_corretor, data_atribuicao = NOW() WHERE id = v_lead.id;
      INSERT INTO distribuicao_log (lead_id, corretor_id, imobiliaria_id, tipo) VALUES (v_lead.id, v_next_corretor, v_lead.imobiliaria_id, 'automatico');
    END IF;
  END LOOP;
END;
$function$;
