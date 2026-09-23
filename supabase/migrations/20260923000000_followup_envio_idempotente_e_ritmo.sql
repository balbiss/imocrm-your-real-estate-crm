-- Relatos do dono (grupo, 22/09) + dados reais de produção:
--
-- 1) DUPLICAÇÃO QUE DESCARTA ANTES DA HORA. O fix de 15/09 (reserva de 5min)
--    não bastou: o n8n pega até 25 execuções por lote e espera 30-90s entre
--    cada envio, então uma passada dura até ~35min. Os itens do fim do lote
--    saíam da reserva e eram pegos DE NOVO por outra passada (o motor roda a
--    cada 1min, passadas se sobrepõem). followup_registrar_envio avançava
--    passo_atual+1 às cegas, então o mesmo texto contava como passo 4 E 5 e,
--    sendo o último, descartava o lead. 40 leads descartados assim em 21-22/09.
--    Fix: (a) o backend REIVINDICA (execução, passo) antes de mandar -- só um
--    envio por passo passa; (b) registrar_envio recebe o passo enviado e
--    ignora se não for o passo pendente; (c) reserva vira 30min.
--
-- 2) "NÃO MANDA NO HORÁRIO". Teto anti-ban (8/h, 40/dia) era conferido por
--    linha ANTES do lote, então 25 do mesmo corretor passavam juntos: Barbara
--    mandou 60 msgs às 8h de 21/09 e 51 às 8h de 22/09. Estourado o 40/dia, o
--    1º contato de lead novo da tarde só saía no dia seguinte. Fix: no máximo
--    1 envio por corretor por passada, espaçamento mínimo de 3min por
--    corretor, teto/hora contando o que está em voo, e 1º contato (passo 1)
--    tem prioridade e não conta pro teto diário.
--
-- 3) "BARBARA CONVERSANDO E O FOLLOW-UP MANDOU". Lead cadastrado À MÃO pelo
--    corretor (origem 'Manual') depois de já ter conversado fora do CRM
--    disparava o fluxo Geral. Agora cadastro manual não dispara automático
--    (botão "Iniciar follow-up" continua existindo). E a reivindicação do (1)
--    confere na hora do envio se o cliente respondeu / corretor falou.
--
-- 4) Motivo 'parado_lead' separado (transferido x descartado x vendido) --
--    antes era um texto só com a palavra "descartado", e a aba Follow-up
--    mostrava "todos os passos foram enviados" em lead que só trocou de
--    corretor. Histórico/notificação do encerramento saíam 2x (janela de 90s
--    com motor a cada 1min) -- agora só pra quem foi encerrado NESTA passada.

ALTER TABLE public.followup_execucoes
  ADD COLUMN IF NOT EXISTS reservado_em   timestamptz,
  ADD COLUMN IF NOT EXISTS enviando_passo integer,
  ADD COLUMN IF NOT EXISTS enviando_desde timestamptz;

-- ---------------------------------------------------------------------------
-- followup_proximo_lote
-- ---------------------------------------------------------------------------
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

  -- Candidatos: no máximo 1 por corretor por passada (o n8n espera 30-90s
  -- entre envios, e passadas se sobrepõem -- isso já espalha os envios).
  -- 1º contato (passo 1) primeiro. Tetos contam o que já está em voo.
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
      AND EXISTS (SELECT 1 FROM whatsapp_instances w WHERE w.user_id = e.corretor_id AND w.connected)
  ),
  uso AS (
    SELECT e2.corretor_id,
           count(*) FILTER (WHERE ev.enviado_em > now() - interval '1 hour') AS na_hora,
           count(*) AS no_dia,
           max(ev.enviado_em) AS ultimo
    FROM followup_envios ev
    JOIN followup_execucoes e2 ON e2.id = ev.execucao_id
    WHERE ev.enviado_em > now() - interval '24 hours'
    GROUP BY e2.corretor_id
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
           COALESCE(u.na_hora, 0) + COALESCE(v.n, 0) AS na_hora,
           COALESCE(u.no_dia, 0) AS no_dia,
           u.ultimo,
           COALESCE(v.n, 0) AS em_voo
    FROM cand c
    LEFT JOIN uso u    ON u.corretor_id = c.corretor_id
    LEFT JOIN voando v ON v.corretor_id = c.corretor_id
  )
  SELECT array_agg(x.id) INTO v_cand
  FROM (
    SELECT r.id FROM ranqueado r
    WHERE r.rn = 1
      AND r.em_voo = 0
      AND (r.ultimo IS NULL OR r.ultimo < now() - interval '3 minutes')
      AND r.na_hora < 8
      AND (r.ordem = 1 OR r.no_dia < 40)
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

-- ---------------------------------------------------------------------------
-- followup_reivindicar_envio: chamado pelo backend IMEDIATAMENTE antes de
-- mandar. Só um chamador por (execução, passo) recebe 'ok'. Também reconfere
-- na hora do envio o que o housekeeping do lote confere (pode ter mudado
-- nos minutos entre o lote e o envio).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.followup_reivindicar_envio(p_execucao_id uuid, p_passo_ordem integer)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_exec public.followup_execucoes;
  v_lead record;
BEGIN
  SELECT * INTO v_exec FROM followup_execucoes WHERE id = p_execucao_id FOR UPDATE;
  IF NOT FOUND OR v_exec.status <> 'ativo' THEN RETURN 'inativo'; END IF;
  IF v_exec.passo_atual + 1 <> p_passo_ordem THEN RETURN 'passo_ja_enviado'; END IF;
  IF v_exec.enviando_passo = p_passo_ordem AND v_exec.enviando_desde > now() - interval '10 minutes' THEN
    RETURN 'ja_enviando';
  END IF;

  SELECT corretor_id, descartado_em INTO v_lead FROM leads WHERE id = v_exec.lead_id;
  IF v_lead.descartado_em IS NOT NULL OR v_lead.corretor_id IS DISTINCT FROM v_exec.corretor_id THEN
    RETURN 'lead_mudou';
  END IF;

  IF EXISTS (
    SELECT 1 FROM mensagens_whatsapp m
    WHERE m.lead_id = v_exec.lead_id AND m.created_at > v_exec.inscrito_em
      AND (m.direcao = 'inbound' OR (m.direcao = 'outbound' AND m.canal IS DISTINCT FROM 'followup'))
  ) THEN
    RETURN 'conversa_em_andamento';
  END IF;

  UPDATE followup_execucoes
  SET enviando_passo = p_passo_ordem, enviando_desde = now()
  WHERE id = p_execucao_id;
  RETURN 'ok';
END;
$function$;

REVOKE ALL ON FUNCTION public.followup_reivindicar_envio(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.followup_reivindicar_envio(uuid, integer) TO service_role;

-- ---------------------------------------------------------------------------
-- followup_registrar_envio: + p_passo_ordem (idempotente), limpa a
-- reivindicação, descarte só se o lead ainda for do corretor da execução.
-- Assinatura muda -> DROP antes (um overload com default deixaria a chamada
-- de 4 argumentos ambígua).
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.followup_registrar_envio(uuid, text, text, uuid);

CREATE FUNCTION public.followup_registrar_envio(
  p_execucao_id uuid,
  p_whatsapp_message_id text,
  p_conteudo text,
  p_mensagem_whatsapp_id uuid DEFAULT NULL::uuid,
  p_passo_ordem integer DEFAULT NULL
)
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

REVOKE ALL ON FUNCTION public.followup_registrar_envio(uuid, text, text, uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.followup_registrar_envio(uuid, text, text, uuid, integer) TO service_role;

-- ---------------------------------------------------------------------------
-- followup_registrar_erro: libera a reivindicação e agenda nova tentativa em
-- 5min (antes dependia da reserva do lote, que agora é 30min).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.followup_registrar_erro(p_execucao_id uuid, p_erro text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_exec      public.followup_execucoes;
  v_fluxo_nome text;
  v_lead_nome  text;
  v_desistiu   boolean;
BEGIN
  SELECT * INTO v_exec FROM followup_execucoes WHERE id = p_execucao_id AND status = 'ativo' FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;

  v_desistiu := (v_exec.tentativas_erro + 1) >= 3;

  UPDATE followup_execucoes
  SET tentativas_erro = tentativas_erro + 1,
      status = CASE WHEN v_desistiu THEN 'erro' ELSE status END,
      finalizado_em = CASE WHEN v_desistiu THEN now() ELSE finalizado_em END,
      motivo_parada = p_erro,
      proximo_envio_em = now() + interval '5 minutes',
      enviando_passo = NULL, enviando_desde = NULL, reservado_em = NULL
  WHERE id = p_execucao_id;

  IF v_desistiu THEN
    SELECT nome INTO v_fluxo_nome FROM followup_fluxos WHERE id = v_exec.fluxo_id;
    SELECT nome INTO v_lead_nome FROM leads WHERE id = v_exec.lead_id;

    PERFORM followup_log(v_exec.lead_id, v_exec.corretor_id,
      'Follow-up "' || COALESCE(v_fluxo_nome, '') || '" travado após 3 tentativas de envio sem sucesso (' ||
      p_erro || '). Mande mensagem manual pra esse lead.');

    INSERT INTO notificacoes (usuario_id, imobiliaria_id, lead_id, tipo, titulo, lida)
    VALUES (
      v_exec.corretor_id, v_exec.imobiliaria_id, v_exec.lead_id, 'followup_erro',
      'Follow-up travado — mande mensagem manual pra ' || COALESCE(NULLIF(v_lead_nome, ''), 'esse lead'),
      false
    );

    INSERT INTO notificacoes (usuario_id, imobiliaria_id, lead_id, tipo, titulo, lida)
    SELECT p.id, v_exec.imobiliaria_id, v_exec.lead_id, 'followup_erro',
      'Follow-up travado (falha de envio) — lead: ' || COALESCE(NULLIF(v_lead_nome, ''), 'sem nome'), false
    FROM perfis p
    WHERE p.imobiliaria_id = v_exec.imobiliaria_id AND p.role IN ('dono', 'gerente');
  END IF;
END;
$function$;

-- ---------------------------------------------------------------------------
-- followup_disparo_automatico: lead cadastrado À MÃO pelo corretor não
-- dispara (ele já está em contato -- caso real Vitória/Barbara 21/09).
-- Transferência posterior pra outro corretor continua disparando.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.followup_disparo_automatico()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_fluxo_id uuid;
  v_ativo    boolean;
BEGIN
  IF NEW.corretor_id IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.corretor_id IS NOT DISTINCT FROM NEW.corretor_id THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' AND NEW.origem = 'Manual' THEN RETURN NEW; END IF;

  IF EXISTS (SELECT 1 FROM followup_execucoes WHERE lead_id = NEW.id AND status = 'ativo') THEN
    RETURN NEW;
  END IF;

  SELECT followup_automatico_ativo INTO v_ativo FROM imobiliarias WHERE id = NEW.imobiliaria_id;
  IF NOT COALESCE(v_ativo, false) THEN RETURN NEW; END IF;

  -- 1ª prioridade: fluxo compartilhado da campanha (origem) desse lead.
  IF NEW.origem IS NOT NULL THEN
    SELECT id INTO v_fluxo_id FROM followup_fluxos
    WHERE imobiliaria_id = NEW.imobiliaria_id AND campanha = NEW.origem AND ativo
    LIMIT 1;
  END IF;

  -- Sem campanha correspondente: cai pro fluxo "Geral" pessoal do corretor.
  IF v_fluxo_id IS NULL THEN
    SELECT id INTO v_fluxo_id FROM followup_fluxos
    WHERE corretor_id = NEW.corretor_id AND ativo AND e_geral
    LIMIT 1;
  END IF;

  IF v_fluxo_id IS NULL THEN RETURN NEW; END IF;

  PERFORM followup_iniciar_interno(NEW.id, v_fluxo_id, 'automatico');

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'followup_disparo_automatico falhou pro lead %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$function$;
