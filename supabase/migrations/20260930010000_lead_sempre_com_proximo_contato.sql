-- Relato do dono (30/09): "JULIO está 43 dias parado ... no card não tem data
-- do próximo contato, que desde sempre foi algo que o CRM criava automático"
-- e "em tarefas atrasadas não aparece". A tela de Tarefas só enxerga lead com
-- lembrete_follow_up (ou visita). ~480 leads ativos estavam sem nenhum dos
-- dois, por dois caminhos:
--   1) follow-up automático terminava (cliente respondeu / corretor assumiu /
--      esgotou sem descartar) e o trigger devolvia o card pra TAREFAS sem data;
--   2) lead atribuído por puxar_mais_rebatidas / distribuir_recadastros /
--      transferência chegava com lembrete_follow_up = NULL.
--
-- Fix:
--   * trigger BEFORE em leads: ganhou corretor (INSERT ou troca) sem próximo
--     contato -> próximo contato = agora (vira tarefa "a fazer" na hora).
--     Nome tr_lembrete_* roda DEPOIS de tr_distribute_lead (ordem alfabética),
--     então pega também o corretor que a roleta acabou de escolher.
--   * fim do follow-up devolvendo pra TAREFAS: próximo contato = agora (se não
--     houver um futuro já marcado pelo corretor).
--   * acerto dos leads que já estão sem data: próximo contato = quando o lead
--     parou (ultima_acao_at) -- lead parado há 43 dias aparece em Atrasadas.
--     Fica de fora quem está no follow-up automático (o robô cuida) e colunas
--     que não são de trabalho ativo (Futuros, Trabalho, Venda, Descarte,
--     Descadastrar, Rebatida).

CREATE OR REPLACE FUNCTION public.lead_lembrete_ao_atribuir()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.corretor_id IS NOT NULL
     AND NEW.lembrete_follow_up IS NULL
     AND (TG_OP = 'INSERT' OR OLD.corretor_id IS DISTINCT FROM NEW.corretor_id) THEN
    NEW.lembrete_follow_up := now();
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS tr_lembrete_ao_atribuir ON public.leads;
CREATE TRIGGER tr_lembrete_ao_atribuir
BEFORE INSERT OR UPDATE OF corretor_id ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.lead_lembrete_ao_atribuir();

CREATE OR REPLACE FUNCTION public.followup_sincroniza_coluna_kanban()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_coluna_followup_id uuid;
  v_coluna_tarefas_id  uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'ativo' THEN
      SELECT id INTO v_coluna_followup_id FROM colunas_kanban
      WHERE imobiliaria_id = NEW.imobiliaria_id AND nome = 'FOLLOW-UP AUTOMÁTICO' LIMIT 1;
      IF v_coluna_followup_id IS NOT NULL THEN
        UPDATE leads SET coluna_kanban_id = v_coluna_followup_id WHERE id = NEW.lead_id;
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  -- Execução saiu de 'ativo' -> devolve pra Tarefas (só se o card ainda
  -- estiver na coluna de follow-up) e já com próximo contato pra hoje, pra
  -- aparecer na lista de Tarefas do corretor (antes voltava sem data e ficava
  -- invisível). Mantém data futura que o corretor já tenha marcado.
  IF TG_OP = 'UPDATE' AND OLD.status = 'ativo' AND NEW.status <> 'ativo' AND NEW.status <> 'parado_lead' THEN
    SELECT id INTO v_coluna_followup_id FROM colunas_kanban
    WHERE imobiliaria_id = NEW.imobiliaria_id AND nome = 'FOLLOW-UP AUTOMÁTICO' LIMIT 1;
    SELECT id INTO v_coluna_tarefas_id FROM colunas_kanban
    WHERE imobiliaria_id = NEW.imobiliaria_id AND nome ILIKE '%tarefas%' ORDER BY posicao LIMIT 1;
    IF v_coluna_followup_id IS NOT NULL AND v_coluna_tarefas_id IS NOT NULL THEN
      UPDATE leads
      SET coluna_kanban_id = v_coluna_tarefas_id,
          lembrete_follow_up = CASE
            WHEN lembrete_follow_up IS NULL OR lembrete_follow_up < now() THEN now()
            ELSE lembrete_follow_up END
      WHERE id = NEW.lead_id AND coluna_kanban_id = v_coluna_followup_id
        AND corretor_id IS NOT NULL;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- Acerto dos que já estão sem data.
UPDATE leads l
SET lembrete_follow_up = COALESCE(l.ultima_acao_at, l.data_atribuicao, l.created_at)
FROM perfis p
WHERE p.id = l.corretor_id
  AND l.lembrete_follow_up IS NULL
  AND l.data_visita IS NULL
  AND l.descartado_em IS NULL
  AND l.data_fechamento IS NULL
  AND l.status::text NOT IN ('venda_concluida', 'desqualificado')
  AND p.removido_em IS NULL
  AND NOT EXISTS (SELECT 1 FROM followup_execucoes e WHERE e.lead_id = l.id AND e.status = 'ativo')
  AND NOT EXISTS (
    SELECT 1 FROM colunas_kanban c
    WHERE c.id = l.coluna_kanban_id
      AND (c.nome IN ('FUTUROS', 'TRABALHO', 'VENDA', 'DESCARTE', 'LEAD DESCADASTRAR', 'FOLLOW-UP AUTOMÁTICO')
           OR c.nome ILIKE '%rebatid%')
  );
