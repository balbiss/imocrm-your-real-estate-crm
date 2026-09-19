-- Pedido do dono (18/09, grupo): "Tem como criar uma coluna FOLLOW UP pra os
-- que estiverem sendo trabalhados automáticos ficarem lá pra não misturar
-- com as tarefas. Quando é feito follow up mudar as cadências tb."
--
-- Já existia uma coluna "FOLLOW-UP" no Kanban, mas SEM nenhuma lógica ligada
-- a ela -- 6 leads estavam lá só porque um corretor (Vitor) moveu na mão pra
-- organização própria, sem relação com o motor de follow-up automático. Pra
-- não bagunçar esse uso já existente, a coluna nova tem nome diferente:
-- "FOLLOW-UP AUTOMÁTICO".
--
-- Implementado como TRIGGER separado em followup_execucoes, em vez de mexer
-- direto em followup_proximo_lote/followup_registrar_envio/followup_encerrar/
-- followup_registrar_erro (4 lugares diferentes onde uma execução começa ou
-- termina) -- essas funções já estão sob investigação ativa do bug de envio
-- duplicado (15-18/09), então preferi um mecanismo isolado que reage à
-- MUDANÇA DE STATUS da execução, sem tocar na lógica de envio em si.

INSERT INTO colunas_kanban (imobiliaria_id, nome, cor, posicao)
SELECT i.id, 'FOLLOW-UP AUTOMÁTICO', 'bg-teal-500',
       COALESCE((SELECT max(posicao) FROM colunas_kanban WHERE imobiliaria_id = i.id), 0) + 1
FROM imobiliarias i
WHERE NOT EXISTS (
  SELECT 1 FROM colunas_kanban c WHERE c.imobiliaria_id = i.id AND c.nome = 'FOLLOW-UP AUTOMÁTICO'
);

CREATE OR REPLACE FUNCTION public.followup_sincroniza_coluna_kanban()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_coluna_followup_id uuid;
  v_coluna_tarefas_id  uuid;
BEGIN
  -- Execução nova entrando em 'ativo' -> card vai pra coluna de follow-up
  -- automático (tanto disparo automático quanto "Iniciar Follow-up" manual
  -- passam por aqui, os dois inserem em followup_execucoes com status='ativo').
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'ativo' THEN
      SELECT id INTO v_coluna_followup_id FROM colunas_kanban
      WHERE imobiliaria_id = NEW.imobiliaria_id AND nome = 'FOLLOW-UP AUTOMÁTICO' LIMIT 1;
      IF v_coluna_followup_id IS NOT NULL THEN
        UPDATE leads SET coluna_kanban_id = v_coluna_followup_id WHERE id = NEW.lead_id;
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  -- Execução saiu de 'ativo' (respondeu, pausado_corretor, concluido, erro,
  -- encerrado_manual) -> devolve pra Tarefas, SÓ SE o card ainda estiver na
  -- coluna de follow-up (não mexe se descarte/venda/outro fluxo já moveu o
  -- card pra outro lugar nesse meio tempo). 'parado_lead' fica de fora de
  -- propósito -- esse caso (descartado/vendido/trocou de corretor) já é
  -- tratado por quem descartou/vendeu/transferiu, não é follow-up terminando
  -- "sem querer".
  IF TG_OP = 'UPDATE' AND OLD.status = 'ativo' AND NEW.status <> 'ativo' AND NEW.status <> 'parado_lead' THEN
    SELECT id INTO v_coluna_followup_id FROM colunas_kanban
    WHERE imobiliaria_id = NEW.imobiliaria_id AND nome = 'FOLLOW-UP AUTOMÁTICO' LIMIT 1;
    SELECT id INTO v_coluna_tarefas_id FROM colunas_kanban
    WHERE imobiliaria_id = NEW.imobiliaria_id AND nome ILIKE '%tarefas%' ORDER BY posicao LIMIT 1;
    IF v_coluna_followup_id IS NOT NULL AND v_coluna_tarefas_id IS NOT NULL THEN
      UPDATE leads SET coluna_kanban_id = v_coluna_tarefas_id
      WHERE id = NEW.lead_id AND coluna_kanban_id = v_coluna_followup_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_followup_sincroniza_coluna ON followup_execucoes;
CREATE TRIGGER trg_followup_sincroniza_coluna
AFTER INSERT OR UPDATE OF status ON followup_execucoes
FOR EACH ROW EXECUTE FUNCTION followup_sincroniza_coluna_kanban();

-- "mudar as cadências tb" -- cada mensagem de follow-up realmente enviada
-- também avança a Cadência de Chamada (1 a 5, mesmo campo que o corretor
-- mexe na mão), pra ficar coerente com quantas tentativas de contato já
-- rolaram, seja manual ou automático. Cap em 5 (maior valor que a cadência
-- manual já usa).
CREATE OR REPLACE FUNCTION public.followup_registrar_envio(p_execucao_id uuid, p_whatsapp_message_id text, p_conteudo text, p_mensagem_whatsapp_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_exec        public.followup_execucoes;
  v_passo_atual record;
  v_proximo     record;
  v_fluxo       record;
  v_npassos     integer;
BEGIN
  SELECT * INTO v_exec FROM followup_execucoes WHERE id = p_execucao_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Execução não encontrada.'; END IF;

  SELECT ordem INTO v_passo_atual
  FROM followup_passos WHERE fluxo_id = v_exec.fluxo_id AND ordem = v_exec.passo_atual + 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'Passo % não existe no fluxo.', v_exec.passo_atual + 1; END IF;

  INSERT INTO followup_envios (execucao_id, passo_ordem, conteudo_enviado, whatsapp_message_id, mensagem_whatsapp_id)
  VALUES (p_execucao_id, v_passo_atual.ordem, p_conteudo, p_whatsapp_message_id, p_mensagem_whatsapp_id);

  UPDATE leads
  SET cadencia_chamada = LEAST(COALESCE(cadencia_chamada, 0) + 1, 5),
      data_ultima_chamada = now()
  WHERE id = v_exec.lead_id;

  SELECT ordem, atraso_minutos, base_atraso, data_hora_fixa INTO v_proximo
  FROM followup_passos WHERE fluxo_id = v_exec.fluxo_id AND ordem = v_exec.passo_atual + 2;

  IF FOUND THEN
    UPDATE followup_execucoes
    SET passo_atual = passo_atual + 1,
        proximo_envio_em = followup_calc_proximo_envio(v_proximo.base_atraso, v_proximo.atraso_minutos, inscrito_em, v_proximo.data_hora_fixa),
        tentativas_erro = 0
    WHERE id = p_execucao_id;
    RETURN;
  END IF;

  SELECT nome, ao_esgotar, motivo_descarte_esgotar INTO v_fluxo
  FROM followup_fluxos WHERE id = v_exec.fluxo_id;
  SELECT count(*) INTO v_npassos FROM followup_passos WHERE fluxo_id = v_exec.fluxo_id;

  IF v_fluxo.ao_esgotar = 'descartar' THEN
    UPDATE leads SET
      corretor_id = NULL,
      coluna_kanban_id = NULL,
      motivo_descarte = v_fluxo.motivo_descarte_esgotar,
      descartado_por = v_exec.corretor_id,
      descartado_em = now(),
      status = 'novo',
      lembrete_follow_up = NULL,
      data_visita = NULL,
      ultima_acao_at = now()
    WHERE id = v_exec.lead_id AND descartado_em IS NULL;

    PERFORM followup_log(v_exec.lead_id, v_exec.corretor_id,
      'Follow-up "' || v_fluxo.nome || '": ' || v_npassos || ' de ' || v_npassos ||
      ' passo(s) enviado(s) sem resposta. Lead descartado automaticamente (motivo: ' ||
      v_fluxo.motivo_descarte_esgotar || ').');

    UPDATE followup_execucoes
    SET passo_atual = passo_atual + 1, status = 'concluido', finalizado_em = now(),
        motivo_parada = 'esgotado sem resposta -> lead descartado'
    WHERE id = p_execucao_id;
  ELSE
    PERFORM followup_log(v_exec.lead_id, v_exec.corretor_id,
      'Follow-up "' || v_fluxo.nome || '" concluído: ' || v_npassos ||
      ' passo(s) enviado(s), sem resposta do cliente.');

    UPDATE followup_execucoes
    SET passo_atual = passo_atual + 1, status = 'concluido', finalizado_em = now(),
        motivo_parada = 'concluído sem resposta'
    WHERE id = p_execucao_id;
  END IF;
END;
$function$;
