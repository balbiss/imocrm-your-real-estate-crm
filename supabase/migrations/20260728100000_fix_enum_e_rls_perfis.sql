-- Adiciona valores faltantes no enum lead_status (o front tentava gravar
-- 'cobrar_doc' e 'reprovado' mas o enum nao tinha esses valores, fazendo o
-- UPDATE falhar silenciosamente ao mover um lead pra essas colunas do kanban)
ALTER TYPE lead_status ADD VALUE IF NOT EXISTS 'cobrar_doc';
ALTER TYPE lead_status ADD VALUE IF NOT EXISTS 'reprovado';

-- Corrige a policy de UPDATE em perfis: antes so permitia o proprio usuario
-- se atualizar (id = auth.uid()), o que quebrava dono/gerente tentando
-- ativar/desativar plantao de outros corretores, fazer check-in por eles
-- ou reordenar a roleta.
DROP POLICY IF EXISTS perfis_update ON public.perfis;
CREATE POLICY perfis_update ON public.perfis
  FOR UPDATE
  USING (
    id = auth.uid()
    OR (imobiliaria_id = get_auth_imobiliaria_id() AND get_auth_role() = ANY (ARRAY['dono'::text, 'gerente'::text]))
  )
  WITH CHECK (
    id = auth.uid()
    OR (imobiliaria_id = get_auth_imobiliaria_id() AND get_auth_role() = ANY (ARRAY['dono'::text, 'gerente'::text]))
  );
