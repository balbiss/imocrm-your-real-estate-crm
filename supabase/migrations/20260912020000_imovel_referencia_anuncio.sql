-- Pedido do dono (12/09): em vez de subir a imagem do criativo na mão em
-- cada fluxo de follow-up, cadastrar o imóvel UMA VEZ com a mesma referência
-- do anúncio (leads.origem) e o motor de follow-up puxa foto/título/
-- descrição/preço direto do imóvel casado por essa referência.
ALTER TABLE public.imoveis
  ADD COLUMN IF NOT EXISTS referencia_anuncio text;

CREATE INDEX IF NOT EXISTS imoveis_referencia_anuncio_idx
  ON public.imoveis (imobiliaria_id, referencia_anuncio)
  WHERE referencia_anuncio IS NOT NULL;
