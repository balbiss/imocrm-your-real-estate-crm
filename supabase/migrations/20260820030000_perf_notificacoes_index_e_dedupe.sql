-- Investigação de lentidão reportada pelo dono (20/08). Achados reais:
--
-- 1) notificacoes NUNCA teve índice em usuario_id -- toda busca de
--    notificação (sino, no login, a cada navegação) fazia sequential scan
--    da tabela inteira. Ainda pequena hoje (3.3k linhas), mas cresce sem
--    limite (ver item 2) e só tende a piorar.
CREATE INDEX IF NOT EXISTS idx_notificacoes_usuario_lida ON public.notificacoes (usuario_id, lida);

-- 2) notificar_leads_analise_credito() (lembrete horário) nunca marcava a
--    notificação anterior como lida antes de inserir uma nova -- rodando
--    a cada hora, sem parar, pra todo lead parado em Análise de Crédito,
--    isso acumulou 1926 notificações NÃO LIDAS (tipo antigo 'sla_vencido')
--    desde 05/08, só nessa imobiliária. Fix: marca a anterior (mesmo tipo
--    + lead + destinatário) como lida antes de inserir a nova -- mantém o
--    aviso "de hora em hora enquanto o lead ficar parado" (spec do dono),
--    sem empilhar histórico infinito de quem não clicou OK a tempo.
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
    UPDATE notificacoes SET lida = true
    WHERE lead_id = v_lead.id AND tipo = 'analise_credito_lembrete' AND lida = false;

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

-- Limpeza pontual do backlog acumulado pelo tipo antigo ('sla_vencido' foi
-- usado SÓ por essa função, antes da migration de 20/08 renomear o tipo --
-- confirmado via grep no repo, nenhum outro lugar cria ou lê esse tipo).
-- Não mexe em 'possivel_duplicidade' nem outros tipos, que continuam
-- válidos e precisam de revisão de verdade pela gestão.
UPDATE notificacoes SET lida = true WHERE tipo = 'sla_vencido' AND lida = false;
