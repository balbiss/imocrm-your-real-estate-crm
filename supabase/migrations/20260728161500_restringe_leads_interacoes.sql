-- leads_interacoes tinha uma unica policy "ALL" que so checava se o lead_id
-- existia (EXISTS ... FROM leads WHERE leads.id = leads_interacoes.lead_id),
-- sem nem olhar imobiliaria_id — qualquer usuario autenticado, de qualquer
-- imobiliaria, conseguia ler/editar/apagar o historico de qualquer lead do
-- sistema inteiro. Agora: leitura por imobiliaria; edicao/exclusao livre
-- pra dono/gerente, e restrita ao proprio autor no mesmo dia pra corretor.
DROP POLICY IF EXISTS interacoes_all ON public.leads_interacoes;

CREATE POLICY interacoes_select ON public.leads_interacoes
  FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM leads l WHERE l.id = leads_interacoes.lead_id AND l.imobiliaria_id = get_auth_imobiliaria_id())
  );

CREATE POLICY interacoes_insert ON public.leads_interacoes
  FOR INSERT
  WITH CHECK (
    autor_id = auth.uid()
    AND EXISTS (SELECT 1 FROM leads l WHERE l.id = leads_interacoes.lead_id AND l.imobiliaria_id = get_auth_imobiliaria_id())
  );

CREATE POLICY interacoes_update ON public.leads_interacoes
  FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM leads l WHERE l.id = leads_interacoes.lead_id AND l.imobiliaria_id = get_auth_imobiliaria_id())
    AND (
      get_auth_role() = ANY (ARRAY['dono'::text, 'gerente'::text])
      OR (autor_id = auth.uid() AND created_at >= date_trunc('day', now()))
    )
  );

CREATE POLICY interacoes_delete ON public.leads_interacoes
  FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM leads l WHERE l.id = leads_interacoes.lead_id AND l.imobiliaria_id = get_auth_imobiliaria_id())
    AND (
      get_auth_role() = ANY (ARRAY['dono'::text, 'gerente'::text])
      OR (autor_id = auth.uid() AND created_at >= date_trunc('day', now()))
    )
  );
