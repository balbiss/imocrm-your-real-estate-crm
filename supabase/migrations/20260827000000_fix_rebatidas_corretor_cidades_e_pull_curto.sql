-- Dois bugs reportados pelo dono (27/08, print de WhatsApp do cliente):
--  (1) "Pros corretores nao aparece a opcao de escolher cidade no + Mais
--      Rebatidas" -- dropdown de cidade vem sempre vazio (so "Todas").
--  (2) "Quando puxou mais rebatidas veio so 2 em vez de 10".
--
-- ============================================================================
-- BUG (1) -- dropdown de cidade vazio SO pra corretor
-- ============================================================================
-- Causa raiz: get_cidades_rebatidas() era LANGUAGE sql STABLE, SEM
-- SECURITY DEFINER -- rodava com os privilegios de quem chamou. A policy de
-- RLS leads_select so deixa role='corretor' enxergar leads onde
-- corretor_id = auth.uid(); a Rebatida (corretor_id IS NULL) e invisivel
-- pra ele. Entao pro corretor o SELECT interno da funcao devolvia ZERO
-- linhas e o <Select> so mostrava "Todas as cidades/bairros". Pra dono/
-- gerente funcionava (a policy deixa esses papeis verem tudo da imobiliaria).
-- puxar_mais_rebatidas() nunca sofreu disso porque ja e SECURITY DEFINER.
-- Fix: get_cidades_rebatidas() vira SECURITY DEFINER (mesmo padrao de
-- listar_agenda_visitas, get_equipe_metricas etc). Continua escopada por
-- imobiliaria via parametro.
CREATE OR REPLACE FUNCTION public.get_cidades_rebatidas(p_imobiliaria_id uuid)
 RETURNS TABLE(cidade text)
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path = public
AS $function$
  WITH contagem AS (
    SELECT bairro_interesse, normalizar_texto(bairro_interesse) AS norm, count(*) AS qtd
    FROM leads
    WHERE imobiliaria_id = p_imobiliaria_id
      AND corretor_id IS NULL
      AND bairro_interesse IS NOT NULL
      AND btrim(bairro_interesse) <> ''
    GROUP BY bairro_interesse
  ),
  ranked AS (
    SELECT bairro_interesse, norm,
      row_number() OVER (PARTITION BY norm ORDER BY qtd DESC, bairro_interesse) AS rn
    FROM contagem
  )
  SELECT bairro_interesse FROM ranked WHERE rn = 1 ORDER BY bairro_interesse;
$function$;

GRANT EXECUTE ON FUNCTION public.get_cidades_rebatidas(uuid) TO authenticated;

-- ============================================================================
-- BUG (2) -- "+ Mais Rebatidas" as vezes traz menos de 10 (1, 2, 3...)
-- ============================================================================
-- A funcao em si esta correta e, chamada isolada, sempre devolve 10 (medido:
-- ~1,7-2,0s numa conexao ociosa, so pra atribuir 10 linhas -- a tabela leads
-- tem ~12,5 mil linhas, varios indices e um punhado de triggers por UPDATE).
-- O problema e o ambiente da chamada real (corretor logado, via PostgREST):
--
--  a) O papel `authenticated` tem statement_timeout = 8s e lock_timeout = 8s.
--     puxar_mais_rebatidas() NAO tinha SET statement_timeout proprio, entao
--     herdava esse teto de 8s -- mesmo sendo uma acao de lote deliberada.
--     Num horario de pico (varios corretores puxando + cron reassign a cada
--     minuto), o loop passa de 8s e o pull e cortado / falha.
--
--  b) O SELECT do loop ordena por created_at ASC e NAO usava
--     FOR UPDATE ... SKIP LOCKED. Ou seja, TODO corretor que clica mira
--     exatamente os mesmos leads (os mais antigos). Dois cliques
--     simultaneos disputam as mesmas linhas: um segura o lock, o outro
--     espera (ate estourar lock_timeout) ou rouba o lead do primeiro (o
--     UPDATE nao rechecava corretor_id IS NULL). Confirmado no
--     distribuicao_log: pulls no mesmo minuto de dois corretores saindo
--     partidos (9+1, 5+4, 3+3...).
--
-- Fix:
--  - SET statement_timeout = '55s' e lock_timeout = '3s' na propria funcao
--    (SECURITY DEFINER + SET sobrepoe o teto do papel `authenticated`).
--  - FOR UPDATE OF l SKIP LOCKED no cursor: cada corretor que puxa ao mesmo
--    tempo pega o SEU proprio bloco de 10 (o segundo pula os que o primeiro
--    ja travou), sem espera e sem roubo.
--  - Reforco AND corretor_id IS NULL no UPDATE (defesa dupla) + CONTINUE se
--    a linha ja nao estava livre.
--  - v_limite calculado uma vez (era LEAST/GREATEST inline no LIMIT).
CREATE OR REPLACE FUNCTION public.puxar_mais_rebatidas(p_corretor_id uuid, p_cidade text DEFAULT NULL)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET statement_timeout TO '55s'
 SET lock_timeout TO '3s'
AS $function$
DECLARE
  v_imobiliaria_id uuid;
  v_puxadas_hoje integer;
  v_coluna_rebatida uuid;
  v_limite integer;
  v_count integer := 0;
  v_lead RECORD;
BEGIN
  SELECT imobiliaria_id INTO v_imobiliaria_id FROM perfis WHERE id = p_corretor_id;

  SELECT COUNT(*) INTO v_puxadas_hoje FROM distribuicao_log
  WHERE corretor_id = p_corretor_id AND tipo = 'manual' AND created_at >= date_trunc('day', now());
  IF v_puxadas_hoje >= 50 THEN
    RAISE EXCEPTION 'Limite diário de 50 rebatidas atingido.';
  END IF;

  v_limite := LEAST(10, GREATEST(0, 50 - v_puxadas_hoje));

  SELECT id INTO v_coluna_rebatida FROM colunas_kanban
    WHERE imobiliaria_id = v_imobiliaria_id AND nome ILIKE '%rebatid%' ORDER BY posicao LIMIT 1;

  FOR v_lead IN
    SELECT l.id FROM leads l
    WHERE l.imobiliaria_id = v_imobiliaria_id
      AND l.corretor_id IS NULL
      AND COALESCE(l.descarte_pendente_aprovacao, false) = false
      AND (p_cidade IS NULL OR normalizar_texto(l.bairro_interesse) = normalizar_texto(p_cidade))
      AND NOT EXISTS (SELECT 1 FROM lead_historico_corretores h WHERE h.lead_id = l.id AND h.corretor_id = p_corretor_id)
      AND (
        l.descartado_em IS NULL
        OR (l.motivo_descarte = 'Sem Resposta' AND l.descartado_em <= now() - interval '3 days')
        OR (l.motivo_descarte = 'Parou de Responder' AND l.descartado_em <= now() - interval '5 days')
        OR (l.motivo_descarte = 'Sem Interesse' AND l.descartado_em <= now() - interval '20 days')
        OR (l.motivo_descarte = 'Aprovado/Desistiu' AND l.descartado_em <= now() - interval '20 days')
      )
    ORDER BY l.created_at ASC
    LIMIT v_limite
    FOR UPDATE OF l SKIP LOCKED
  LOOP
    UPDATE leads SET
      corretor_id = p_corretor_id, status = 'rebatida',
      coluna_kanban_id = COALESCE(v_coluna_rebatida, coluna_kanban_id),
      lembrete_follow_up = NULL, data_visita = NULL,
      data_atribuicao = NOW(), primeiro_contato_em = NULL
    WHERE id = v_lead.id AND corretor_id IS NULL;

    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    INSERT INTO distribuicao_log (lead_id, corretor_id, imobiliaria_id, tipo)
    VALUES (v_lead.id, p_corretor_id, v_imobiliaria_id, 'manual');
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.puxar_mais_rebatidas(uuid, text) TO authenticated;
