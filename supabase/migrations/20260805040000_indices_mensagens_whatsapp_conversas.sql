-- Bug real reportado (05/08): tela de Conversas ficava travada em
-- "Carregando..." pra sempre. Causa raiz: mensagens_whatsapp nao tinha
-- NENHUM indice em lead_id -- get_conversas() faz, pra cada lead da
-- imobiliaria (9.529 no caso do Hinode), um LATERAL JOIN buscando a
-- ultima mensagem e a contagem de nao lidas, e sem indice isso vira um
-- Seq Scan da tabela inteira REPETIDO por lead (9.529 loops, confirmado
-- via EXPLAIN ANALYZE: 8.9 segundos, ~100 milhoes de comparacoes de linha
-- so nesses dois LATERAL). Provavelmente o Supabase mata a query antes
-- dela terminar (timeout do PostgREST), por isso a tela nunca saia do
-- loading.
CREATE INDEX IF NOT EXISTS idx_mensagens_whatsapp_lead_created
  ON public.mensagens_whatsapp (lead_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_mensagens_whatsapp_nao_lidas
  ON public.mensagens_whatsapp (lead_id)
  WHERE direcao = 'inbound' AND lida = false;
