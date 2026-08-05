-- Bug real reportado pelo dono (05/08): ao clicar EMBARALHAR, os 7.247 leads
-- represados na REBATIDA (historico acumulado desde 2024, corretor_id NULL)
-- foram despejados de uma vez so nos 2 corretores online (Vitor e Farah,
-- 4mil+ cada) -- REBATIDA so pode mudar de corretor via clique manual em
-- "+ Mais Rebatidas" (max 10/clique, 50/dia, ver puxar_mais_rebatidas() em
-- 20260805000000_spec_rebatidas_e_higienizacao.sql). Aplicado direto em
-- producao via Management API; este arquivo documenta a mudanca no repo.

-- CAUSA RAIZ #1 (a principal, bate com o relato): distribuir_bolsao(),
-- chamada pelo EMBARALHAR via registrar_embaralhamento(), varria QUALQUER
-- lead com corretor_id IS NULL, sem filtrar por status -- misturando o
-- comportamento CORRETO e desejado (Lead Novo sem corretor, backlog antigo
-- de antes do trigger de rodizio automatico existir, deve sim ser dividido
-- entre os corretores ao embaralhar) com o ERRADO (Rebatida sem corretor,
-- que so pode sair de la via clique manual). Fix: distribuir_bolsao() agora
-- só pega status = 'novo' -- Rebatida nunca mais e tocada pelo EMBARALHAR.
CREATE OR REPLACE FUNCTION public.distribuir_bolsao(p_imobiliaria_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_lead RECORD;
  v_corretor uuid;
  v_count integer := 0;
BEGIN
  FOR v_lead IN
    SELECT id FROM leads
    WHERE imobiliaria_id = p_imobiliaria_id
      AND corretor_id IS NULL
      AND status = 'novo'
      AND descartado_em IS NULL
      AND COALESCE(descarte_pendente_aprovacao, false) = false
    ORDER BY created_at ASC
  LOOP
    SELECT corretor_id INTO v_corretor FROM get_next_corretor_rodizio(p_imobiliaria_id);
    IF v_corretor IS NULL THEN
      EXIT;
    END IF;
    UPDATE leads SET corretor_id = v_corretor, data_atribuicao = NOW(), primeiro_contato_em = NULL WHERE id = v_lead.id;
    INSERT INTO distribuicao_log (lead_id, corretor_id, imobiliaria_id, tipo) VALUES (v_lead.id, v_corretor, p_imobiliaria_id, 'automatico');
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$function$;

-- CAUSA RAIZ #2 (achada durante a investigacao, mesma familia de bug --
-- distribuicao automatica descontrolada): reassign_overdue_leads() (cron
-- "reassign-overdue-leads-5min", roda a cada minuto) reatribui lead 'novo'
-- sem primeiro_contato_em pro proximo da roleta quando estoura o SLA, mas
-- nunca marcava nada que impedisse o MESMO lead de estourar o SLA de novo 5
-- minutos depois -- pra lead antigo/morto que ninguem nunca vai contatar,
-- isso vira um pingue-pongue infinito. Confirmado em producao: leads
-- reatribuidos 160 vezes em 30h, alternando entre 5 corretores diferentes
-- -- parte dos 4mil+ leads acumulados em Vitor/Farah tambem veio disso.
-- Fix: depois de 3 reatribuicoes automaticas sem contato, o lead para de
-- ficar pingue-pongando e cai na REBATIDA (status='rebatida', corretor_id
-- NULL) -- mesmo destino que um lead novo ja cai quando ninguem esta
-- disponivel na roleta (distribute_lead()) -- daqui pra frente so sai de la
-- via "+ Mais Rebatidas", nunca mais automatico.
CREATE OR REPLACE FUNCTION public.reassign_overdue_leads()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_lead RECORD;
  v_next_corretor uuid;
  v_tentativas integer;
  v_coluna_rebatida uuid;
BEGIN
  FOR v_lead IN
    SELECT l.id, l.imobiliaria_id, l.corretor_id, l.data_atribuicao
    FROM leads l
    LEFT JOIN configuracoes_distribuicao cd ON cd.imobiliaria_id = l.imobiliaria_id
    WHERE l.corretor_id IS NOT NULL
      AND l.status = 'novo'
      AND l.primeiro_contato_em IS NULL
      AND l.descartado_em IS NULL
      AND l.data_atribuicao <= NOW() - (COALESCE(cd.tempo_limite_atendimento, 300) || ' seconds')::interval
  LOOP
    SELECT COUNT(*) INTO v_tentativas FROM distribuicao_log WHERE lead_id = v_lead.id AND tipo = 'automatico';

    IF v_tentativas >= 3 THEN
      SELECT id INTO v_coluna_rebatida FROM colunas_kanban
      WHERE imobiliaria_id = v_lead.imobiliaria_id AND nome ILIKE '%rebatid%'
      ORDER BY posicao LIMIT 1;

      UPDATE leads SET
        corretor_id = NULL, status = 'rebatida',
        coluna_kanban_id = COALESCE(v_coluna_rebatida, coluna_kanban_id)
      WHERE id = v_lead.id;

      CONTINUE;
    END IF;

    SELECT corretor_id INTO v_next_corretor FROM get_next_corretor_rodizio(v_lead.imobiliaria_id);
    IF v_next_corretor IS NOT NULL AND v_next_corretor <> v_lead.corretor_id THEN
      UPDATE leads SET corretor_id = v_next_corretor, data_atribuicao = NOW() WHERE id = v_lead.id;
      INSERT INTO distribuicao_log (lead_id, corretor_id, imobiliaria_id, tipo)
      VALUES (v_lead.id, v_next_corretor, v_lead.imobiliaria_id, 'automatico');
    END IF;
  END LOOP;
END;
$function$;
