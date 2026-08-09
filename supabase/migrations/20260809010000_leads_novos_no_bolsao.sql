-- Pedido do dono (09/08): a aba "Rebatidas Geral" mistura leads genuinamente
-- novos (nunca tiveram corretor) com anos de importacao antiga parada na
-- fila (achado caso com 18244h na fila = mais de 2 anos), sem nenhuma forma
-- de separar os dois. Isso e' provavelmente causa real do dono achar que
-- "lead novo nao aparece" -- ele aparece, so que soterrado em milhares de
-- linhas antigas.
--
-- "Lead novo de verdade" = esta no Bolsao (sem corretor, nao descartado) E
-- nunca teve NENHUM corretor atribuido antes (sem linha em
-- lead_historico_corretores). Um lead que ja foi de algum corretor e foi
-- devolvido NAO conta como novo aqui, mesmo que o status seja 'rebatida'
-- (status nao serve pra diferenciar isso -- todo lead que cai no Bolsao,
-- novo ou nao, vira 'rebatida' via distribute_lead()).
CREATE OR REPLACE FUNCTION public.listar_leads_novos_bolsao(
  p_imobiliaria_id uuid,
  p_data_inicio timestamptz DEFAULT NULL,
  p_data_fim timestamptz DEFAULT NULL,
  p_limit integer DEFAULT 500
)
RETURNS SETOF leads
LANGUAGE sql
STABLE
AS $function$
  SELECT l.*
  FROM leads l
  WHERE l.imobiliaria_id = p_imobiliaria_id
    AND l.corretor_id IS NULL
    AND l.descartado_em IS NULL
    AND (p_data_inicio IS NULL OR l.created_at >= p_data_inicio)
    AND (p_data_fim IS NULL OR l.created_at <= p_data_fim)
    AND NOT EXISTS (SELECT 1 FROM lead_historico_corretores h WHERE h.lead_id = l.id)
  ORDER BY l.created_at DESC
  LIMIT p_limit;
$function$;

CREATE OR REPLACE FUNCTION public.contar_leads_novos_bolsao(
  p_imobiliaria_id uuid,
  p_data_inicio timestamptz DEFAULT NULL,
  p_data_fim timestamptz DEFAULT NULL
)
RETURNS integer
LANGUAGE sql
STABLE
AS $function$
  SELECT COUNT(*)::integer
  FROM leads l
  WHERE l.imobiliaria_id = p_imobiliaria_id
    AND l.corretor_id IS NULL
    AND l.descartado_em IS NULL
    AND (p_data_inicio IS NULL OR l.created_at >= p_data_inicio)
    AND (p_data_fim IS NULL OR l.created_at <= p_data_fim)
    AND NOT EXISTS (SELECT 1 FROM lead_historico_corretores h WHERE h.lead_id = l.id);
$function$;
