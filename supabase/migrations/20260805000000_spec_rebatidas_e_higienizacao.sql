-- Especificacao formal do dono (planilha, 04/08) -- Modulo 3 (Rebatidas).
-- Aplicado direto em producao via Management API; este arquivo documenta as
-- mudancas no repo.

-- Regra de Ouro: nunca redistribuir um lead pro mesmo corretor que ja
-- atendeu ou descartou ele. Higienizacao: corretor novo nao ve historico de
-- mensagens/interacoes anterior a quando ELE assumiu o lead (data_atribuicao);
-- dono/gerente continuam vendo tudo.
DROP POLICY IF EXISTS mensagens_select_por_papel ON public.mensagens_whatsapp;
CREATE POLICY mensagens_select_por_papel ON public.mensagens_whatsapp
  FOR SELECT
  USING (
    imobiliaria_id = get_auth_imobiliaria_id()
    AND (
      get_auth_role() = ANY (ARRAY['dono'::text, 'gerente'::text])
      OR EXISTS (
        SELECT 1 FROM leads l
        WHERE l.id = mensagens_whatsapp.lead_id
          AND l.corretor_id = auth.uid()
          AND mensagens_whatsapp.created_at >= COALESCE(l.data_atribuicao, l.created_at)
      )
    )
  );

DROP POLICY IF EXISTS interacoes_select ON public.leads_interacoes;
CREATE POLICY interacoes_select ON public.leads_interacoes
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM leads l
      WHERE l.id = leads_interacoes.lead_id
        AND l.imobiliaria_id = get_auth_imobiliaria_id()
        AND (
          get_auth_role() = ANY (ARRAY['dono'::text, 'gerente'::text])
          OR (l.corretor_id = auth.uid() AND leads_interacoes.created_at >= COALESCE(l.data_atribuicao, l.created_at))
        )
    )
  );

-- LEAD DESCADASTRAR: coluna dedicada pra descarte extremo (Descadastrar/Já
-- Comprou) aprovado pelo dono -- antes coluna_kanban_id ficava NULL, agora
-- fica visivel numa coluna propria, permanentemente fora da roleta/rebatidas.
INSERT INTO colunas_kanban (id, imobiliaria_id, nome, posicao)
SELECT gen_random_uuid(), imobiliaria_id, 'LEAD DESCADASTRAR',
  (SELECT COALESCE(MAX(posicao), 0) + 1 FROM colunas_kanban c2 WHERE c2.imobiliaria_id = c.imobiliaria_id)
FROM (SELECT DISTINCT imobiliaria_id FROM colunas_kanban) c
WHERE NOT EXISTS (SELECT 1 FROM colunas_kanban c3 WHERE c3.imobiliaria_id = c.imobiliaria_id AND c3.nome ILIKE '%descadastrar%');

-- "+ Mais Rebatidas": puxa ate 10 leads por clique da Rebatidas Geral,
-- limite de 50/dia (contado via distribuicao_log, nao created_at do lead),
-- nunca repete corretor que ja atendeu (lead_historico_corretores), respeita
-- quarentena por motivo de descarte, filtro de cidade opcional. Consolida
-- (e corrige) duas implementacoes client-side duplicadas e com bug real
-- (BolsaoResgateDialog.tsx e loteRebatidaMutation em leads.tsx): ambas
-- checavam leads.historico_corretores, coluna que NUNCA existiu na tabela
-- leads -- o filtro sempre dava undefined?.includes(...) e nunca excluia
-- ninguem, entao um corretor podia puxar de volta um lead que ele mesmo ja
-- tinha descartado.
CREATE OR REPLACE FUNCTION public.puxar_mais_rebatidas(p_corretor_id uuid, p_cidade text DEFAULT NULL)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_imobiliaria_id uuid;
  v_puxadas_hoje integer;
  v_coluna_rebatida uuid;
  v_count integer := 0;
  v_lead RECORD;
BEGIN
  SELECT imobiliaria_id INTO v_imobiliaria_id FROM perfis WHERE id = p_corretor_id;

  SELECT COUNT(*) INTO v_puxadas_hoje FROM distribuicao_log
  WHERE corretor_id = p_corretor_id AND tipo = 'manual' AND created_at >= date_trunc('day', now());
  IF v_puxadas_hoje >= 50 THEN
    RAISE EXCEPTION 'Limite diário de 50 rebatidas atingido.';
  END IF;

  SELECT id INTO v_coluna_rebatida FROM colunas_kanban WHERE imobiliaria_id = v_imobiliaria_id AND nome ILIKE '%rebatid%' ORDER BY posicao LIMIT 1;

  FOR v_lead IN
    SELECT l.id FROM leads l
    WHERE l.imobiliaria_id = v_imobiliaria_id
      AND l.corretor_id IS NULL
      AND COALESCE(l.descarte_pendente_aprovacao, false) = false
      AND (p_cidade IS NULL OR l.bairro_interesse = p_cidade)
      AND NOT EXISTS (SELECT 1 FROM lead_historico_corretores h WHERE h.lead_id = l.id AND h.corretor_id = p_corretor_id)
      AND (
        l.descartado_em IS NULL
        OR (l.motivo_descarte = 'Sem Resposta' AND l.descartado_em <= now() - interval '3 days')
        OR (l.motivo_descarte = 'Parou de Responder' AND l.descartado_em <= now() - interval '5 days')
        OR (l.motivo_descarte = 'Sem Interesse' AND l.descartado_em <= now() - interval '20 days')
        OR (l.motivo_descarte = 'Aprovado/Desistiu' AND l.descartado_em <= now() - interval '20 days')
      )
    ORDER BY l.created_at ASC
    LIMIT LEAST(10, GREATEST(0, 50 - v_puxadas_hoje))
  LOOP
    UPDATE leads SET
      corretor_id = p_corretor_id, status = 'rebatida',
      coluna_kanban_id = COALESCE(v_coluna_rebatida, coluna_kanban_id),
      lembrete_follow_up = NULL, data_visita = NULL,
      data_atribuicao = NOW(), primeiro_contato_em = NULL
    WHERE id = v_lead.id;
    INSERT INTO distribuicao_log (lead_id, corretor_id, imobiliaria_id, tipo) VALUES (v_lead.id, p_corretor_id, v_imobiliaria_id, 'manual');
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$function$;

-- Testado em producao (04/08): puxou 10 leads reais elegiveis pra um
-- corretor de teste; identificado 1 bug na 1a versao da funcao (zerava
-- descartado_em/motivo_descarte, que o comportamento antigo preservava) --
-- corrigido e os 10 leads reais afetados foram restaurados ao estado
-- original usando o historico de leads_interacoes (tipo='descarte').
