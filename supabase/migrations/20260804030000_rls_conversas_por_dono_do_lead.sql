-- Investigacao do item "corretores estao vendo as conversas dos outros" (recorrente).
-- A policy de SELECT de mensagens_whatsapp (desde 28/07) checava
-- mensagens_whatsapp.corretor_id = auth.uid() -- mas essa coluna e' gravada
-- POR MENSAGEM no momento em que ela chega/e enviada, com o dono do lead
-- NAQUELE instante. Quando um lead muda de corretor (redistribuicao, resgate
-- do bolsao, rebatida, SLA), as mensagens ANTIGAS continuam com o corretor_id
-- do dono anterior: o novo dono do lead nao via o historico completo (ficava
-- faltando pedaco), e o historico de um lead que já passou por mais de um
-- corretor podia parecer inconsistente. Trocado para checar o dono ATUAL do
-- lead (leads.corretor_id) em vez do corretor_id congelado da mensagem --
-- assim quem tem o lead hoje ve a conversa inteira, e quem nao tem mais
-- perde o acesso.
-- Mesma logica aplicada em leads_interacoes (historico/notas do lead), que
-- so checava a imobiliaria (sem checar dono do lead) -- corretor podia ler
-- notas de um lead de outro colega SE conseguisse o id do lead por algum
-- outro caminho (na pratica dificil, pois leads.leads_select ja restringe
-- por dono, mas e' defesa em profundidade mesmo assim).
DROP POLICY IF EXISTS mensagens_select_por_papel ON public.mensagens_whatsapp;
CREATE POLICY mensagens_select_por_papel ON public.mensagens_whatsapp
  FOR SELECT
  USING (
    imobiliaria_id = get_auth_imobiliaria_id()
    AND (
      get_auth_role() = ANY (ARRAY['dono'::text, 'gerente'::text])
      OR EXISTS (
        SELECT 1 FROM leads l
        WHERE l.id = mensagens_whatsapp.lead_id AND l.corretor_id = auth.uid()
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
          OR l.corretor_id = auth.uid()
        )
    )
  );

-- NAO aplicado nesta migration (fica registrado pra decisao futura): a policy
-- leads_update hoje so checa imobiliaria_id, sem checar dono do lead -- ou
-- seja, em tese um corretor autenticado consegue dar UPDATE em QUALQUER lead
-- da imobiliaria (nao so nos seus) se conseguir o id de outro jeito. Nao da
-- pra simplesmente exigir corretor_id=auth.uid() porque "Resgatar do Bolsao"
-- (BolsaoResgateDialog.tsx) faz update direto do client num lead que AINDA
-- NAO e' do corretor (corretor_id estava NULL antes do pull) -- precisa de
-- regra tipo "dono/gerente OU corretor_id atual = auth.uid() OU corretor_id
-- atual IS NULL", testada com calma contra todos os fluxos de update direto
-- (kanban drag-drop, transferencia, fechamento de venda, etc.) antes de valer.
