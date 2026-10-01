-- Opção A escolhida pelo dono (01/10): o corretor tirou o card da coluna
-- FOLLOW-UP AUTOMÁTICO (moveu de coluna, mudou a cadência de chamada, etc.)
-- = assumiu o lead -> o follow-up automático PARA sozinho, igual já acontece
-- quando ele manda mensagem pelo WhatsApp.
-- Caso real: Lucineia (Melissa) -- 12s depois do follow-up começar a corretora
-- mudou a cadência, o card foi pra TAREFAS e o robô continuou mandando
-- mensagem (18 leads nessa situação em 01/10).
--
-- Só vale pra mudança de coluna com o MESMO corretor e lead ativo:
-- transferência/descarte já encerram como 'parado_lead' pelo motor, e o
-- próprio fim do follow-up (que devolve o card pra TAREFAS) acontece depois
-- da execução já ter saído de 'ativo', então não cai aqui.

CREATE OR REPLACE FUNCTION public.followup_para_ao_tirar_da_coluna()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_coluna_followup uuid;
BEGIN
  IF NEW.coluna_kanban_id IS NULL
     OR OLD.coluna_kanban_id IS NOT DISTINCT FROM NEW.coluna_kanban_id
     OR NEW.descartado_em IS NOT NULL
     OR NEW.corretor_id IS NULL
     OR OLD.corretor_id IS DISTINCT FROM NEW.corretor_id THEN
    RETURN NEW;
  END IF;

  SELECT id INTO v_coluna_followup FROM colunas_kanban
  WHERE imobiliaria_id = NEW.imobiliaria_id AND nome = 'FOLLOW-UP AUTOMÁTICO' LIMIT 1;
  IF v_coluna_followup IS NULL OR OLD.coluna_kanban_id IS DISTINCT FROM v_coluna_followup THEN
    RETURN NEW;
  END IF;

  WITH r AS (
    UPDATE followup_execucoes e
    SET status = 'pausado_corretor', finalizado_em = now(),
        motivo_parada = 'corretor tirou o card do follow-up automático',
        reservado_em = NULL, enviando_passo = NULL, enviando_desde = NULL
    WHERE e.lead_id = NEW.id AND e.status = 'ativo' AND e.corretor_id = NEW.corretor_id
    RETURNING e.fluxo_id
  )
  INSERT INTO leads_interacoes (lead_id, autor_id, tipo, conteudo)
  SELECT NEW.id, NEW.corretor_id, 'auto',
    'Follow-up "' || f.nome || '" pausado: o corretor tirou o card da coluna Follow-up Automático (assumiu o lead).'
  FROM r JOIN followup_fluxos f ON f.id = r.fluxo_id;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_followup_para_ao_tirar_da_coluna ON public.leads;
CREATE TRIGGER trg_followup_para_ao_tirar_da_coluna
AFTER UPDATE OF coluna_kanban_id ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.followup_para_ao_tirar_da_coluna();

-- Os que já estão nessa situação: follow-up ativo com o card fora da coluna.
WITH r AS (
  UPDATE followup_execucoes e
  SET status = 'pausado_corretor', finalizado_em = now(),
      motivo_parada = 'corretor tirou o card do follow-up automático',
      reservado_em = NULL, enviando_passo = NULL, enviando_desde = NULL
  FROM leads l
  WHERE l.id = e.lead_id AND e.status = 'ativo' AND l.corretor_id = e.corretor_id
    AND l.descartado_em IS NULL AND l.coluna_kanban_id IS NOT NULL
    AND l.coluna_kanban_id IS DISTINCT FROM (
      SELECT c.id FROM colunas_kanban c
      WHERE c.imobiliaria_id = l.imobiliaria_id AND c.nome = 'FOLLOW-UP AUTOMÁTICO' LIMIT 1)
  RETURNING e.lead_id, e.corretor_id, e.fluxo_id
)
INSERT INTO leads_interacoes (lead_id, autor_id, tipo, conteudo)
SELECT r.lead_id, r.corretor_id, 'auto',
  'Follow-up "' || f.nome || '" pausado: o card estava fora da coluna Follow-up Automático (o corretor já tinha assumido o lead).'
FROM r JOIN followup_fluxos f ON f.id = r.fluxo_id;
