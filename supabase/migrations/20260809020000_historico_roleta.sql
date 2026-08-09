-- Pedido do dono (09/08): ver um historico de "pra quem a roleta mandou
-- cada lead", com data e hora -- separado de atribuicao manual (Encaminhar
-- para.../Ações em Massa), que ja tem seu proprio log em distribuicao_log.
--
-- A roleta automatica atribui corretor de dois jeitos, nenhum dos dois grava
-- em distribuicao_log nem em lead_historico_corretores (que so registra
-- UPDATE de corretor_id, nao o valor que ja vem setado dentro do INSERT):
--   1) distribute_lead() -- BEFORE INSERT, lead nasce ja com corretor_id
--      preenchido se a roleta achar alguem no memento da criacao.
--   2) check_lead_duplicado() -- quando o Facebook reenvia um lead antigo e
--      a roleta esta disponivel naquele instante (ver migration 09/08 00h).
-- Como nenhum dos dois grava log proprio, a forma de identificar "isso foi
-- a roleta, nao uma pessoa" e por EXCLUSAO: pega leads com corretor
-- definido que NAO tem nenhuma linha em distribuicao_log pra esse mesmo
-- corretor (que e onde as RPCs de atribuicao manual gravam).
CREATE OR REPLACE FUNCTION public.listar_historico_roleta(
  p_imobiliaria_id uuid,
  p_data_inicio timestamptz DEFAULT NULL,
  p_data_fim timestamptz DEFAULT NULL,
  p_limit integer DEFAULT 500
)
RETURNS TABLE(
  lead_id uuid,
  lead_nome text,
  lead_telefone text,
  corretor_id uuid,
  corretor_nome text,
  atribuido_em timestamptz,
  origem text
)
LANGUAGE sql
STABLE
AS $function$
  SELECT
    l.id,
    l.nome,
    l.telefone,
    l.corretor_id,
    p.nome,
    COALESCE(l.data_atribuicao, l.created_at),
    l.origem
  FROM leads l
  JOIN perfis p ON p.id = l.corretor_id
  WHERE l.imobiliaria_id = p_imobiliaria_id
    AND l.corretor_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM distribuicao_log dl
      WHERE dl.lead_id = l.id AND dl.corretor_id = l.corretor_id
    )
    AND (p_data_inicio IS NULL OR COALESCE(l.data_atribuicao, l.created_at) >= p_data_inicio)
    AND (p_data_fim IS NULL OR COALESCE(l.data_atribuicao, l.created_at) <= p_data_fim)
  ORDER BY COALESCE(l.data_atribuicao, l.created_at) DESC
  LIMIT p_limit;
$function$;
