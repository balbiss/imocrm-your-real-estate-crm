-- Bug real urgente reportado pelo dono (20/08, via WhatsApp do cliente):
-- "Rebatida geral só está aparecendo de Taubaté, mas a de São José que
-- vocês subiram não aparece" -- confirmado no banco: a tela
-- "Rebatidas Geral" (/redistribuicao, aba bolsao) busca só os 500 leads
-- mais antigos sem corretor (FIFO, pra não baixar os 8mil+ acumulados) e
-- filtra por cidade DEPOIS, no navegador. Os 500 mais antigos são 100%
-- Taubaté (São José é um lote mais recente) -- então filtrar por São José
-- nessa tela sempre dava zero resultado, e a lista sem filtro nenhum
-- também nunca mostrava São José. Corrigido em 17/08 pra "+ Mais
-- Rebatidas" (usado pelos corretores), mas não pra essa tela de gestão
-- (usada por dono/gerente).
--
-- Fix: filtro de cidade agora roda no banco ANTES do corte de 500 (RPC
-- dedicada), igual já tinha sido feito pra puxar_mais_rebatidas.
CREATE OR REPLACE FUNCTION public.listar_bolsao(
  p_imobiliaria_id uuid,
  p_cidade text DEFAULT NULL,
  p_limit integer DEFAULT 500
)
RETURNS SETOF leads
LANGUAGE sql
STABLE
AS $function$
  SELECT * FROM leads
  WHERE imobiliaria_id = p_imobiliaria_id
    AND corretor_id IS NULL
    AND descartado_em IS NULL
    AND (p_cidade IS NULL OR normalizar_texto(bairro_interesse) = normalizar_texto(p_cidade))
  ORDER BY created_at ASC
  LIMIT p_limit;
$function$;
