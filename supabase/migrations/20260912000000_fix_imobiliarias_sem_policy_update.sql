-- Bug real reportado pelo dono/gerente (12/09): o toggle "Aviso: Atualização
-- WhatsApp (Meta)" em Configurações não desligava ao clicar (e o toggle de
-- Follow-up Automático, criado no dia anterior, tinha o mesmo problema).
--
-- Causa raiz: a tabela `imobiliarias` tem RLS ativado mas só existe UMA
-- policy live no banco -- `imobiliarias_select` (SELECT). As policies de
-- INSERT/UPDATE/DELETE da migration original (20260430025040, baseadas em
-- `owner_id = auth.uid()`) foram substituídas em algum momento direto em
-- produção (mesmo padrão de "aplicado via Management API, nunca commitado"
-- já visto no trigger distribute_lead) -- só a de SELECT foi recriada com o
-- nome novo (`imobiliarias_select`, usando get_auth_imobiliaria_id()), as
-- outras nunca voltaram. Com RLS ligado e NENHUMA policy de UPDATE, o
-- Postgres nega toda atualização por padrão -- sem erro visível (o UPDATE
-- roda, casa 0 linhas, PostgREST devolve sucesso vazio), por isso o toggle
-- "não fazia nada" em vez de dar erro.
--
-- Fix: recria a policy de UPDATE usando o mesmo padrão de permissão (role
-- dono/gerente escopado pela própria imobiliária) já usado em todo o resto
-- do sistema, em vez do owner_id antigo.
CREATE POLICY imobiliarias_update ON public.imobiliarias FOR UPDATE
  USING (
    id = get_auth_imobiliaria_id()
    AND get_auth_role() = ANY (ARRAY['dono'::text, 'gerente'::text])
  )
  WITH CHECK (
    id = get_auth_imobiliaria_id()
    AND get_auth_role() = ANY (ARRAY['dono'::text, 'gerente'::text])
  );
