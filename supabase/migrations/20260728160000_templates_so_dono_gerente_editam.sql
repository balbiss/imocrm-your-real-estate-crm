-- templates_mensagem tinha uma unica policy "ALL" liberada pra qualquer
-- usuario da imobiliaria: corretor podia editar ou apagar template de
-- qualquer outro. A biblioteca continua compartilhada (todo mundo ve/usa
-- pra padronizar o atendimento), mas so dono/gerente criam, editam e apagam.
DROP POLICY IF EXISTS templates_all ON public.templates_mensagem;

CREATE POLICY templates_select ON public.templates_mensagem
  FOR SELECT
  USING (imobiliaria_id = get_auth_imobiliaria_id());

CREATE POLICY templates_insert ON public.templates_mensagem
  FOR INSERT
  WITH CHECK (
    imobiliaria_id = get_auth_imobiliaria_id()
    AND get_auth_role() = ANY (ARRAY['dono'::text, 'gerente'::text])
  );

CREATE POLICY templates_update ON public.templates_mensagem
  FOR UPDATE
  USING (
    imobiliaria_id = get_auth_imobiliaria_id()
    AND get_auth_role() = ANY (ARRAY['dono'::text, 'gerente'::text])
  );

CREATE POLICY templates_delete ON public.templates_mensagem
  FOR DELETE
  USING (
    imobiliaria_id = get_auth_imobiliaria_id()
    AND get_auth_role() = ANY (ARRAY['dono'::text, 'gerente'::text])
  );
