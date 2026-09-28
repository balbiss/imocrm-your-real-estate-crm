-- Regras de envio do follow-up definidas pelo dono (PDF "Especificação
-- Técnica: Regras de Envio e Automação de Follow-up", 28/09):
--
-- * 1ª mensagem: na hora que o lead chega no corretor (roleta, transferência
--   manual ou rebatida) -- já era assim, não muda.
-- * 2ª em diante: não sai quando vence; entra na fila das janelas fixas:
--     Seg-Sex: vence até 13h -> janela da manhã (fila a partir de 9h30);
--              13h01-18h -> janela das 16h; depois de 18h -> 9h30 do próximo
--              dia útil (sexta à noite -> segunda).
--     Sábado:  vence até 15h -> sai no sábado (a partir de 9h30);
--              depois -> segunda 9h30.  Domingo: nada, vai pra segunda 9h30.
--   (confirmado com o dono: "se vencer antes das 13h manda às 10h, se vencer
--   depois das 13h manda às 16h"). Feriado não é tratado.
-- * Anti-bloqueio: sai o teto de 8/h e o de 40/dia; fica só o intervalo
--   sorteado de 40-60s entre mensagens do mesmo corretor.
-- * 1ª mensagem que não saiu em 24h é cancelada e o corretor é avisado (não
--   manda "oi" atrasado de dias quando o WhatsApp reconectar).
--
-- O motor do n8n (MAN5EQfr7FNn5K42) muda junto: roda a cada 20s e não
-- espera mais 30-90s entre envios -- o ritmo agora é todo decidido aqui.

CREATE TABLE IF NOT EXISTS public.followup_ritmo_corretor (
  corretor_id uuid PRIMARY KEY REFERENCES public.perfis(id) ON DELETE CASCADE,
  liberado_em timestamptz NOT NULL
);
ALTER TABLE public.followup_ritmo_corretor ENABLE ROW LEVEL SECURITY;
-- sem policy: só as funções SECURITY DEFINER (motor) mexem.

CREATE OR REPLACE FUNCTION public.followup_janela_envio(p_vencimento timestamptz)
 RETURNS timestamptz
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  v_local timestamp := p_vencimento AT TIME ZONE 'America/Sao_Paulo';
  v_dow   int       := EXTRACT(DOW FROM v_local);
  v_hora  time      := v_local::time;
  v_dia   date      := v_local::date;
  v_alvo  timestamp;
BEGIN
  IF v_dow = 0 THEN                                   -- domingo
    v_alvo := (v_dia + 1) + TIME '09:30';
  ELSIF v_dow = 6 THEN                                -- sábado
    IF v_hora <= TIME '15:00' THEN
      v_alvo := GREATEST(v_local, v_dia + TIME '09:30');
    ELSE
      v_alvo := (v_dia + 2) + TIME '09:30';
    END IF;
  ELSE                                                -- segunda a sexta
    IF v_hora <= TIME '13:00' THEN
      v_alvo := GREATEST(v_local, v_dia + TIME '09:30');
    ELSIF v_hora <= TIME '18:00' THEN
      v_alvo := GREATEST(v_local, v_dia + TIME '16:00');
    ELSIF v_dow = 5 THEN
      v_alvo := (v_dia + 3) + TIME '09:30';
    ELSE
      v_alvo := (v_dia + 1) + TIME '09:30';
    END IF;
  END IF;
  RETURN v_alvo AT TIME ZONE 'America/Sao_Paulo';
END;
$function$;

-- Janela aberta AGORA pra 2ª mensagem em diante (com 30min de folga pra fila
-- escoar): Seg-Sex 9h30-13h30 e 16h-18h30; Sábado 9h30-15h30. Sem isso uma
-- mensagem que venceu de manhã e ficou pra trás (fila/WhatsApp desconectado)
-- sairia às 19h. O que não escoar espera a próxima janela.
CREATE OR REPLACE FUNCTION public.followup_janela_aberta(p_ts timestamptz DEFAULT now())
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT CASE EXTRACT(DOW FROM (p_ts AT TIME ZONE 'America/Sao_Paulo'))
    WHEN 0 THEN false
    WHEN 6 THEN (p_ts AT TIME ZONE 'America/Sao_Paulo')::time BETWEEN TIME '09:30' AND TIME '15:30'
    ELSE (p_ts AT TIME ZONE 'America/Sao_Paulo')::time BETWEEN TIME '09:30' AND TIME '13:30'
      OR (p_ts AT TIME ZONE 'America/Sao_Paulo')::time BETWEEN TIME '16:00' AND TIME '18:30'
  END;
$function$;

CREATE OR REPLACE FUNCTION public.followup_proximo_lote(p_limite integer DEFAULT 25)
 RETURNS TABLE(execucao_id uuid, lead_id uuid, corretor_id uuid, imobiliaria_id uuid, telefone text, telefone_alternativo text, passo_ordem integer, conteudo text, lead_nome text, lead_origem text, corretor_nome text, anexo_url text, anexo_tipo text, anexo_nome text, anexo_mimetype text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '55s'
 SET lock_timeout TO '3s'
AS $function$
DECLARE
  v_resp uuid[];
  v_paus uuid[];
  v_par  uuid[];
  v_cand uuid[];
  v_ids  uuid[];
BEGIN
  -- 1ª mensagem que não saiu em 24h (quase sempre WhatsApp do corretor
  -- desconectado): cancela em vez de mandar "oi, vi seu cadastro" dias
  -- depois quando ele reconectar (regra do dono, 28/09). Avisa o corretor.
  WITH r AS (
    UPDATE followup_execucoes e
    SET status = 'encerrado_manual', finalizado_em = now(),
        motivo_parada = 'cancelado: 1ª mensagem não saiu em 24h (WhatsApp do corretor desconectado?)',
        reservado_em = NULL, enviando_passo = NULL, enviando_desde = NULL
    WHERE e.status = 'ativo' AND e.passo_atual = 0
      AND e.inscrito_em < now() - interval '24 hours'
    RETURNING e.id, e.lead_id, e.corretor_id, e.imobiliaria_id
  ), log AS (
    INSERT INTO leads_interacoes (lead_id, autor_id, tipo, conteudo)
    SELECT r.lead_id, r.corretor_id, 'auto',
      'Follow-up automático cancelado: a 1ª mensagem não saiu em 24h (WhatsApp do corretor estava desconectado). Faça o contato manualmente.'
    FROM r WHERE r.corretor_id IS NOT NULL
  )
  INSERT INTO notificacoes (usuario_id, imobiliaria_id, lead_id, tipo, titulo, lida)
  SELECT r.corretor_id, r.imobiliaria_id, r.lead_id, 'followup_erro',
    'Follow-up cancelado (WhatsApp desconectado) — faça contato manual com ' || COALESCE(NULLIF(l.nome, ''), l.telefone, 'o lead'), false
  FROM r JOIN leads l ON l.id = r.lead_id
  WHERE r.corretor_id IS NOT NULL;

  WITH r AS (
    UPDATE followup_execucoes e
    SET status = 'respondeu', finalizado_em = now(), motivo_parada = 'cliente respondeu'
    WHERE e.status = 'ativo'
      AND EXISTS (
        SELECT 1 FROM mensagens_whatsapp m
        WHERE m.lead_id = e.lead_id AND m.direcao = 'inbound'
          AND m.created_at > e.inscrito_em
      )
    RETURNING e.id
  ) SELECT COALESCE(array_agg(id), '{}') INTO v_resp FROM r;

  UPDATE followup_envios ev
  SET respondeu_apos = true
  WHERE ev.execucao_id = ANY(v_resp)
    AND ev.enviado_em = (SELECT MAX(ev2.enviado_em) FROM followup_envios ev2 WHERE ev2.execucao_id = ev.execucao_id);

  INSERT INTO notificacoes (usuario_id, imobiliaria_id, lead_id, tipo, titulo, lida)
  SELECT e.corretor_id, e.imobiliaria_id, e.lead_id, 'followup_respondido',
         COALESCE(l.nome, l.telefone, 'Lead') || ' respondeu o follow-up', false
  FROM followup_execucoes e JOIN leads l ON l.id = e.lead_id
  WHERE e.id = ANY(v_resp);

  WITH r AS (
    UPDATE followup_execucoes e
    SET status = 'pausado_corretor', finalizado_em = now(), motivo_parada = 'corretor assumiu a conversa'
    WHERE e.status = 'ativo'
      AND EXISTS (
        SELECT 1 FROM mensagens_whatsapp m
        WHERE m.lead_id = e.lead_id AND m.direcao = 'outbound'
          AND m.canal IS DISTINCT FROM 'followup'
          AND m.created_at > e.inscrito_em
      )
    RETURNING e.id
  ) SELECT COALESCE(array_agg(id), '{}') INTO v_paus FROM r;

  WITH r AS (
    UPDATE followup_execucoes e
    SET status = 'parado_lead', finalizado_em = now(),
        motivo_parada = CASE
          WHEN l.descartado_em IS NOT NULL THEN 'lead descartado'
          WHEN l.corretor_id IS DISTINCT FROM e.corretor_id THEN 'lead transferido para outro corretor'
          ELSE 'lead vendido'
        END
    FROM leads l
    WHERE e.lead_id = l.id AND e.status = 'ativo'
      AND (
        l.descartado_em IS NOT NULL
        OR l.venda_pendente_aprovacao IS TRUE
        OR l.data_fechamento IS NOT NULL
        OR l.status = 'venda_concluida'
        OR l.corretor_id IS DISTINCT FROM e.corretor_id
      )
    RETURNING e.id
  ) SELECT COALESCE(array_agg(id), '{}') INTO v_par FROM r;

  INSERT INTO leads_interacoes (lead_id, autor_id, tipo, conteudo)
  SELECT e.lead_id, e.corretor_id, 'auto',
    'Follow-up "' || f.nome || '" encerrado: ' ||
    CASE e.motivo_parada
      WHEN 'cliente respondeu'           THEN 'cliente respondeu.'
      WHEN 'corretor assumiu a conversa' THEN 'corretor assumiu a conversa.'
      ELSE e.motivo_parada || '.'
    END
  FROM followup_execucoes e
  JOIN followup_fluxos f ON f.id = e.fluxo_id
  WHERE e.id = ANY(v_resp || v_paus || v_par)
    AND e.corretor_id IS NOT NULL;

  -- Candidatos: no máximo 1 por corretor por passada, 1º contato (passo 1)
  -- primeiro. Regra do dono (28/09): sem teto por hora/dia -- a única trava
  -- é o intervalo sorteado de 40-60s entre mensagens do MESMO corretor
  -- (followup_ritmo_corretor.liberado_em, gravado a cada envio) + nada em voo.
  WITH cand AS (
    SELECT e.id, e.corretor_id, p.ordem, e.proximo_envio_em
    FROM followup_execucoes e
    JOIN leads l           ON l.id = e.lead_id
    JOIN perfis c          ON c.id = e.corretor_id
    JOIN imobiliarias i    ON i.id = e.imobiliaria_id
    JOIN followup_passos p ON p.fluxo_id = e.fluxo_id AND p.ordem = e.passo_atual + 1
    WHERE e.status = 'ativo'
      AND e.proximo_envio_em <= now()
      AND (e.iniciado_por = 'manual' OR i.followup_automatico_ativo)
      AND (NOT p.so_horario_comercial OR followup_em_horario_comercial())
      AND (p.ordem = 1 OR followup_janela_aberta())
      AND EXISTS (SELECT 1 FROM whatsapp_instances w WHERE w.user_id = e.corretor_id AND w.connected)
  ),
  voando AS (
    SELECT e3.corretor_id, count(*) AS n
    FROM followup_execucoes e3
    WHERE e3.status = 'ativo' AND e3.reservado_em > now() - interval '15 minutes'
    GROUP BY e3.corretor_id
  ),
  ranqueado AS (
    SELECT c.id, c.ordem, c.proximo_envio_em,
           row_number() OVER (PARTITION BY c.corretor_id ORDER BY (c.ordem = 1) DESC, c.proximo_envio_em) AS rn,
           COALESCE(v.n, 0) AS em_voo,
           rc.liberado_em
    FROM cand c
    LEFT JOIN voando v ON v.corretor_id = c.corretor_id
    LEFT JOIN followup_ritmo_corretor rc ON rc.corretor_id = c.corretor_id
  )
  SELECT array_agg(x.id) INTO v_cand
  FROM (
    SELECT r.id FROM ranqueado r
    WHERE r.rn = 1
      AND r.em_voo = 0
      AND (r.liberado_em IS NULL OR r.liberado_em <= now())
    ORDER BY (r.ordem = 1) DESC, r.proximo_envio_em
    LIMIT p_limite
  ) x;

  IF v_cand IS NULL THEN
    RETURN;
  END IF;

  -- Trava + reconfere sob lock: se outra passada concorrente já reservou
  -- (proximo_envio_em empurrado), a linha sai daqui.
  SELECT array_agg(s.id) INTO v_ids
  FROM (
    SELECT e.id FROM followup_execucoes e
    WHERE e.id = ANY(v_cand) AND e.status = 'ativo' AND e.proximo_envio_em <= now()
    FOR UPDATE OF e SKIP LOCKED
  ) s;

  IF v_ids IS NULL THEN
    RETURN;
  END IF;

  -- RESERVA: 30min (uma passada do n8n pode durar isso). Se o envio der
  -- certo, registrar_envio sobrescreve com o horário do próximo passo; se
  -- falhar, registrar_erro devolve em 5min. E mesmo que a reserva vença no
  -- meio, followup_reivindicar_envio impede o 2º envio do mesmo passo.
  UPDATE followup_execucoes
  SET proximo_envio_em = now() + interval '30 minutes',
      reservado_em = now()
  WHERE id = ANY(v_ids);

  RETURN QUERY
  SELECT
    e.id, e.lead_id, e.corretor_id, e.imobiliaria_id,
    l.telefone, l.telefone_alternativo,
    p.ordem, p.conteudo,
    l.nome, COALESCE(l.referencia, l.origem), c.nome,
    p.anexo_url, p.anexo_tipo, p.anexo_nome, p.anexo_mimetype
  FROM followup_execucoes e
  JOIN leads l           ON l.id = e.lead_id
  JOIN perfis c          ON c.id = e.corretor_id
  JOIN followup_passos p ON p.fluxo_id = e.fluxo_id AND p.ordem = e.passo_atual + 1
  WHERE e.id = ANY(v_ids)
  ORDER BY array_position(v_ids, e.id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.followup_registrar_envio(p_execucao_id uuid, p_whatsapp_message_id text, p_conteudo text, p_mensagem_whatsapp_id uuid DEFAULT NULL::uuid, p_passo_ordem integer DEFAULT NULL::integer)
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

  -- Mesmo passo registrado 2x (envio duplicado que escapou): não avança de
  -- novo -- era isso que transformava o passo 4 repetido em "passo 5" e
  -- descartava o lead.
  IF p_passo_ordem IS NOT NULL AND p_passo_ordem <> v_exec.passo_atual + 1 THEN
    RAISE WARNING 'followup_registrar_envio: passo % ignorado (execução % já está no passo %)',
      p_passo_ordem, p_execucao_id, v_exec.passo_atual;
    RETURN;
  END IF;

  SELECT ordem INTO v_passo_atual
  FROM followup_passos WHERE fluxo_id = v_exec.fluxo_id AND ordem = v_exec.passo_atual + 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'Passo % não existe no fluxo.', v_exec.passo_atual + 1; END IF;

  INSERT INTO followup_envios (execucao_id, passo_ordem, conteudo_enviado, whatsapp_message_id, mensagem_whatsapp_id)
  VALUES (p_execucao_id, v_passo_atual.ordem, p_conteudo, p_whatsapp_message_id, p_mensagem_whatsapp_id);

  -- Próxima mensagem desse corretor só depois de 40-60s (sorteado).
  INSERT INTO followup_ritmo_corretor (corretor_id, liberado_em)
  VALUES (v_exec.corretor_id, now() + make_interval(secs => 40 + floor(random() * 21)))
  ON CONFLICT (corretor_id) DO UPDATE SET liberado_em = EXCLUDED.liberado_em;

  UPDATE leads
  SET cadencia_chamada = LEAST(COALESCE(cadencia_chamada, 0) + 1, 5),
      data_ultima_chamada = now()
  WHERE id = v_exec.lead_id;

  SELECT ordem, atraso_minutos, base_atraso, data_hora_fixa INTO v_proximo
  FROM followup_passos WHERE fluxo_id = v_exec.fluxo_id AND ordem = v_exec.passo_atual + 2;

  IF FOUND THEN
    UPDATE followup_execucoes
    SET passo_atual = passo_atual + 1,
        proximo_envio_em = followup_janela_envio(followup_calc_proximo_envio(v_proximo.base_atraso, v_proximo.atraso_minutos, inscrito_em, v_proximo.data_hora_fixa)),
        tentativas_erro = 0,
        enviando_passo = NULL, enviando_desde = NULL, reservado_em = NULL
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
    WHERE id = v_exec.lead_id AND descartado_em IS NULL
      AND corretor_id IS NOT DISTINCT FROM v_exec.corretor_id;

    PERFORM followup_log(v_exec.lead_id, v_exec.corretor_id,
      'Follow-up "' || v_fluxo.nome || '": ' || v_npassos || ' de ' || v_npassos ||
      ' passo(s) enviado(s) sem resposta. Lead descartado automaticamente (motivo: ' ||
      v_fluxo.motivo_descarte_esgotar || ').');

    UPDATE followup_execucoes
    SET passo_atual = passo_atual + 1, status = 'concluido', finalizado_em = now(),
        motivo_parada = 'esgotado sem resposta -> lead descartado',
        enviando_passo = NULL, enviando_desde = NULL, reservado_em = NULL
    WHERE id = p_execucao_id;
  ELSE
    PERFORM followup_log(v_exec.lead_id, v_exec.corretor_id,
      'Follow-up "' || v_fluxo.nome || '" concluído: ' || v_npassos ||
      ' passo(s) enviado(s), sem resposta do cliente.');

    UPDATE followup_execucoes
    SET passo_atual = passo_atual + 1, status = 'concluido', finalizado_em = now(),
        motivo_parada = 'concluído sem resposta',
        enviando_passo = NULL, enviando_desde = NULL, reservado_em = NULL
    WHERE id = p_execucao_id;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.followup_retomar(p_execucao_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM followup_assert_posse(p_execucao_id);
  UPDATE followup_execucoes
  SET status = 'ativo', motivo_parada = NULL, proximo_envio_em = CASE WHEN passo_atual = 0 THEN now() ELSE followup_janela_envio(now()) END, tentativas_erro = 0
  WHERE id = p_execucao_id AND status IN ('pausado_corretor','erro');
END;
$function$;

-- Quem já está no meio da sequência passa a respeitar as janelas.
UPDATE followup_execucoes
SET proximo_envio_em = followup_janela_envio(proximo_envio_em)
WHERE status = 'ativo' AND passo_atual >= 1;
