-- Especificacao formal do dono (planilha, 04/08) -- Modulo 5 (Agendado/FID)
-- e Modulo 7 (Analise de Credito). Aplicado direto em producao via
-- Management API; este arquivo documenta as mudancas no repo.

-- Bug real achado e corrigido: VisitaAlertProvider.tsx (o pop-up bloqueante
-- de visita, ja existente) tentava gravar confirmacao numa tabela
-- "interacoes" que NUNCA existiu (a tabela real e' leads_interacoes, e
-- ainda faltava o autor_id obrigatorio) -- todo clique em "Estou Ciente"
-- dava erro e o alerta podia ficar travado na tela pro corretor. Trocado
-- o botao pra "Enviar Mensagem de Lembrete" (abre o chat do WhatsApp do
-- lead direto), como pede a especificacao, e corrigida a tabela/autor_id.

-- Analise de Credito: notificacao pra gestao quando um lead ENTRA na coluna
-- (antes so existia o lembrete horario recorrente).
CREATE OR REPLACE FUNCTION public.notificar_entrada_analise_credito()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_coluna_nome_nova text;
BEGIN
  IF NEW.coluna_kanban_id IS DISTINCT FROM OLD.coluna_kanban_id THEN
    SELECT nome INTO v_coluna_nome_nova FROM colunas_kanban WHERE id = NEW.coluna_kanban_id;
    IF (v_coluna_nome_nova ILIKE '%analise%' OR v_coluna_nome_nova ILIKE '%análise%')
       AND (v_coluna_nome_nova ILIKE '%credito%' OR v_coluna_nome_nova ILIKE '%crédito%') THEN
      INSERT INTO notificacoes (usuario_id, imobiliaria_id, lead_id, tipo, titulo, lida)
      SELECT p.id, NEW.imobiliaria_id, NEW.id, 'nova_analise_credito',
        'Nova pasta enviada para Análise de Crédito: ' || COALESCE(NEW.nome, NEW.telefone), false
      FROM perfis p WHERE p.imobiliaria_id = NEW.imobiliaria_id AND p.role IN ('gerente', 'dono');
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_notificar_entrada_analise_credito ON leads;
CREATE TRIGGER trg_notificar_entrada_analise_credito
  AFTER UPDATE OF coluna_kanban_id ON public.leads
  FOR EACH ROW EXECUTE FUNCTION notificar_entrada_analise_credito();

-- Bug real achado e corrigido: notificar_leads_analise_credito() (lembrete
-- horario ja existente, encoding corrigido numa sessao anterior) usava
-- ILIKE '%analise%credit%' -- mas a coluna real da imobiliaria se chama
-- "ANÁLISE DE CRÉDITO" com acento, e ILIKE do Postgres NÃO ignora acento.
-- Ou seja, esse lembrete NUNCA disparou de verdade pra Hinode Imoveis desde
-- que foi criado -- testado agora e confirmado funcionando pros dois
-- gestores (dono e gerente) depois do fix.
CREATE OR REPLACE FUNCTION public.notificar_leads_analise_credito()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_lead RECORD;
BEGIN
  FOR v_lead IN
    SELECT l.id, l.nome, l.corretor_id, l.imobiliaria_id
    FROM leads l
    JOIN colunas_kanban c ON c.id = l.coluna_kanban_id
    WHERE (c.nome ILIKE '%analise%' OR c.nome ILIKE '%análise%')
      AND (c.nome ILIKE '%credito%' OR c.nome ILIKE '%crédito%')
      AND l.descartado_em IS NULL
  LOOP
    IF v_lead.corretor_id IS NOT NULL THEN
      INSERT INTO notificacoes (id, usuario_id, imobiliaria_id, lead_id, tipo, titulo, lida)
      VALUES (gen_random_uuid(), v_lead.corretor_id, v_lead.imobiliaria_id, v_lead.id, 'sla_vencido', 'Lead "' || v_lead.nome || '" parado em Análise de Crédito', false);
    END IF;
    INSERT INTO notificacoes (id, usuario_id, imobiliaria_id, lead_id, tipo, titulo, lida)
    SELECT gen_random_uuid(), p.id, v_lead.imobiliaria_id, v_lead.id, 'sla_vencido', 'Lead "' || v_lead.nome || '" parado em Análise de Crédito', false
    FROM perfis p WHERE p.imobiliaria_id = v_lead.imobiliaria_id AND p.role IN ('gerente', 'dono');
  END LOOP;
END;
$function$;
