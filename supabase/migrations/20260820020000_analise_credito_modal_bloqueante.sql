-- Especificação técnica formal do dono (20/08) -- Módulo Análise de Crédito.
-- Os três avisos já existiam como notificação de sino/toast
-- (notificar_entrada_analise_credito, notificar_leads_analise_credito) --
-- a peça que faltava era exibi-los como MODAL BLOQUEANTE no meio da tela
-- (ver AnaliseCreditoAlertProvider.tsx, novo). Esta migration só ajusta o
-- tipo/texto da notificação horária pra bater com o texto exato pedido e
-- pra ficar distinguível no frontend (usava 'sla_vencido', tipo genérico
-- demais pra acionar um modal específico).
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
      VALUES (gen_random_uuid(), v_lead.corretor_id, v_lead.imobiliaria_id, v_lead.id, 'analise_credito_lembrete',
        'Verificar se houve retorno da Análise de Crédito do cliente ' || COALESCE(NULLIF(v_lead.nome, ''), 'sem nome'), false);
    END IF;
    INSERT INTO notificacoes (id, usuario_id, imobiliaria_id, lead_id, tipo, titulo, lida)
    SELECT gen_random_uuid(), p.id, v_lead.imobiliaria_id, v_lead.id, 'analise_credito_lembrete',
      'Verificar se houve retorno da Análise de Crédito do cliente ' || COALESCE(NULLIF(v_lead.nome, ''), 'sem nome'), false
    FROM perfis p WHERE p.imobiliaria_id = v_lead.imobiliaria_id AND p.role IN ('gerente', 'dono');
  END LOOP;
END;
$function$;
