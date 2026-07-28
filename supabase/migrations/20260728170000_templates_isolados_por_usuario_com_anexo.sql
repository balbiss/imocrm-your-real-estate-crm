-- Templates deixam de ser biblioteca compartilhada (dono/gerente editam,
-- todo mundo ve): agora cada usuario (dono, gerente ou corretor) cria e ve
-- SO os proprios templates, isolado dos demais mesmo dentro da mesma
-- imobiliaria. Tambem adiciona suporte a anexar 1 arquivo (imagem, video ou
-- documento) por template, enviado junto quando o template e usado no chat.

ALTER TABLE public.templates_mensagem
  ADD COLUMN criado_por uuid REFERENCES auth.users(id),
  ADD COLUMN anexo_url text,
  ADD COLUMN anexo_tipo text CHECK (anexo_tipo IN ('imagem', 'video', 'documento')),
  ADD COLUMN anexo_nome text;

-- Backfill: templates existentes (sem autor) ficam com o dono da
-- imobiliaria; se nao houver usuario com role 'dono', cai pro primeiro
-- usuario que achar naquela imobiliaria.
UPDATE public.templates_mensagem t
SET criado_por = COALESCE(
  (SELECT p.id FROM public.perfis p WHERE p.imobiliaria_id = t.imobiliaria_id AND p.role = 'dono' LIMIT 1),
  (SELECT p.id FROM public.perfis p WHERE p.imobiliaria_id = t.imobiliaria_id LIMIT 1)
)
WHERE criado_por IS NULL;

ALTER TABLE public.templates_mensagem
  ALTER COLUMN criado_por SET NOT NULL;

DROP POLICY IF EXISTS templates_select ON public.templates_mensagem;
DROP POLICY IF EXISTS templates_insert ON public.templates_mensagem;
DROP POLICY IF EXISTS templates_update ON public.templates_mensagem;
DROP POLICY IF EXISTS templates_delete ON public.templates_mensagem;

CREATE POLICY templates_select ON public.templates_mensagem
  FOR SELECT
  USING (imobiliaria_id = get_auth_imobiliaria_id() AND criado_por = auth.uid());

CREATE POLICY templates_insert ON public.templates_mensagem
  FOR INSERT
  WITH CHECK (imobiliaria_id = get_auth_imobiliaria_id() AND criado_por = auth.uid());

CREATE POLICY templates_update ON public.templates_mensagem
  FOR UPDATE
  USING (imobiliaria_id = get_auth_imobiliaria_id() AND criado_por = auth.uid());

CREATE POLICY templates_delete ON public.templates_mensagem
  FOR DELETE
  USING (imobiliaria_id = get_auth_imobiliaria_id() AND criado_por = auth.uid());

-- Bucket de storage pros anexos de template, mesmo padrao usado em
-- whatsapp_media/imoveis_fotos: publico pra leitura, upload/edicao/remocao
-- livre pra qualquer usuario autenticado (isolamento fica por conta da
-- policy da tabela, que so deixa o autor linkar o anexo ao proprio template).
INSERT INTO storage.buckets (id, name, public)
VALUES ('templates_anexos', 'templates_anexos', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public Access for Template Anexos" ON storage.objects
  FOR SELECT USING (bucket_id = 'templates_anexos');

CREATE POLICY "Allow Auth Upload for Template Anexos" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'templates_anexos' AND auth.role() = 'authenticated');

CREATE POLICY "Allow Auth Update for Template Anexos" ON storage.objects
  FOR UPDATE USING (bucket_id = 'templates_anexos' AND auth.role() = 'authenticated');

CREATE POLICY "Allow Auth Delete for Template Anexos" ON storage.objects
  FOR DELETE USING (bucket_id = 'templates_anexos' AND auth.role() = 'authenticated');
