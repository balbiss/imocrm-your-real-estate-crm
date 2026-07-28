-- A policy de SELECT de mensagens_whatsapp so checava a imobiliaria, entao
-- qualquer corretor conseguia ler a conversa de qualquer outro corretor da
-- mesma imobiliaria. Agora corretor so ve as proprias mensagens; dono/gerente
-- continuam vendo tudo. O INSERT tambem passa a exigir que o corretor_id da
-- mensagem seja o do proprio usuario autenticado (e o que o app ja faz).
DROP POLICY IF EXISTS "Corretores podem ver mensagens de suas imobiliárias" ON public.mensagens_whatsapp;
DROP POLICY IF EXISTS "Corretores podem inserir mensagens de saída" ON public.mensagens_whatsapp;

CREATE POLICY mensagens_select_por_papel ON public.mensagens_whatsapp
  FOR SELECT
  USING (
    imobiliaria_id = get_auth_imobiliaria_id()
    AND (
      get_auth_role() = ANY (ARRAY['dono'::text, 'gerente'::text])
      OR corretor_id = auth.uid()
    )
  );

CREATE POLICY mensagens_insert_propria ON public.mensagens_whatsapp
  FOR INSERT
  WITH CHECK (
    imobiliaria_id = get_auth_imobiliaria_id()
    AND corretor_id = auth.uid()
  );
