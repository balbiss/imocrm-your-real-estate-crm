-- notificar_leads_analise_credito() (criada numa sessao anterior, nunca
-- versionada em migration) foi salva com os acentos corrompidos ("An�lise de
-- Cr�dito") -- gotcha conhecido de escrever texto acentuado via curl -d
-- inline no Bash deste ambiente. A notificacao horaria (cron
-- notificar-analise-credito-horaria, 0 * * * *) já funcionava, só mostrava
-- esse texto quebrado pra gerente/dono/corretor toda hora. Recriada aqui só
-- com o texto corrigido, mesma logica.
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
    WHERE c.nome ILIKE '%analise%credit%' AND l.descartado_em IS NULL
  LOOP
    IF v_lead.corretor_id IS NOT NULL THEN
      INSERT INTO notificacoes (id, usuario_id, imobiliaria_id, lead_id, tipo, titulo, lida)
      VALUES (gen_random_uuid(), v_lead.corretor_id, v_lead.imobiliaria_id, v_lead.id, 'sla_vencido', 'Lead "' || v_lead.nome || '" parado em Análise de Crédito', false);
    END IF;
    INSERT INTO notificacoes (id, usuario_id, imobiliaria_id, lead_id, tipo, titulo, lida)
    SELECT gen_random_uuid(), p.id, v_lead.imobiliaria_id, v_lead.id, 'sla_vencido', 'Lead "' || v_lead.nome || '" parado em Análise de Crédito', false
    FROM perfis p
    WHERE p.imobiliaria_id = v_lead.imobiliaria_id AND p.role IN ('gerente','dono');
  END LOOP;
END;
$function$;
