-- ============================================================================
-- FOLLOW-UP -- opção "descartar ao esgotar" + histórico completo no card
-- ============================================================================
-- Pedido do dono: "tem como colocar tentativas: quando atingir e não for
-- respondido, descarta ele? mas tudo com histórico de tudo o que aconteceu".
--
-- As "tentativas" são os próprios passos do fluxo. Nova opção por fluxo:
--   ao_esgotar = 'nada'      -> hoje (marca concluído e para)
--   ao_esgotar = 'descartar' -> ao mandar o último passo sem nenhuma resposta,
--                               descarta o lead (mesmo efeito do botão Devolver,
--                               motivo 'Sem Resposta' -> volta pro bolsão de
--                               rebatidas depois de 3 dias, regra já existente).
--
-- Histórico: além do que já existe (aba Follow-up = cada passo; Chat = as msgs),
-- passa a gravar os MARCOS em leads_interacoes (Bloco 5 "Histórico" do card):
-- início, resposta do cliente, corretor assumiu, esgotou/descartou, concluído,
-- encerrado manual. As execuções nunca são apagadas.
--
-- Aditivo. Aplicado via Management API.
-- ============================================================================

ALTER TABLE public.followup_fluxos
  ADD COLUMN IF NOT EXISTS ao_esgotar text NOT NULL DEFAULT 'nada'
    CHECK (ao_esgotar IN ('nada','descartar')),
  ADD COLUMN IF NOT EXISTS motivo_descarte_esgotar text NOT NULL DEFAULT 'Sem Resposta';

-- ---------------------------------------------------------------------------
-- Helper: grava um marco no histórico do lead (leads_interacoes tipo 'auto').
-- autor_id é NOT NULL na tabela -> se não houver corretor, não loga (silencioso).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.followup_log(p_lead_id uuid, p_autor uuid, p_texto text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_autor IS NULL OR p_lead_id IS NULL THEN RETURN; END IF;
  INSERT INTO leads_interacoes (lead_id, autor_id, tipo, conteudo)
  VALUES (p_lead_id, p_autor, 'auto', p_texto);
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'followup_log falhou: %', SQLERRM;
END;
$$;

-- ---------------------------------------------------------------------------
-- followup_iniciar_manual: + marco "iniciado" no histórico
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.followup_iniciar_manual(p_lead_id uuid, p_fluxo_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead        record;
  v_fluxo       record;
  v_passo1      record;
  v_npassos     integer;
  v_role        text := get_auth_role();
  v_execucao_id uuid;
BEGIN
  SELECT id, corretor_id, imobiliaria_id INTO v_lead FROM leads WHERE id = p_lead_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lead não encontrado.'; END IF;

  IF v_role NOT IN ('dono','gerente') AND v_lead.corretor_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Sem permissão para iniciar follow-up neste lead.';
  END IF;
  IF v_lead.corretor_id IS NULL THEN
    RAISE EXCEPTION 'Lead sem corretor -- não dá pra iniciar follow-up.';
  END IF;

  SELECT id, imobiliaria_id, ativo, nome INTO v_fluxo FROM followup_fluxos WHERE id = p_fluxo_id;
  IF NOT FOUND OR v_fluxo.imobiliaria_id IS DISTINCT FROM v_lead.imobiliaria_id THEN
    RAISE EXCEPTION 'Fluxo inválido.';
  END IF;
  IF NOT v_fluxo.ativo THEN RAISE EXCEPTION 'Fluxo está desativado.'; END IF;

  SELECT ordem, atraso_minutos, base_atraso INTO v_passo1
  FROM followup_passos WHERE fluxo_id = p_fluxo_id ORDER BY ordem LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'Fluxo não tem nenhum passo.'; END IF;
  SELECT count(*) INTO v_npassos FROM followup_passos WHERE fluxo_id = p_fluxo_id;

  IF EXISTS (SELECT 1 FROM followup_execucoes WHERE lead_id = p_lead_id AND status = 'ativo') THEN
    RAISE EXCEPTION 'Este lead já tem um follow-up rodando.';
  END IF;

  INSERT INTO followup_execucoes (
    lead_id, fluxo_id, corretor_id, imobiliaria_id,
    passo_atual, proximo_envio_em, status, inscrito_em, iniciado_por
  ) VALUES (
    p_lead_id, p_fluxo_id, v_lead.corretor_id, v_lead.imobiliaria_id,
    0,
    followup_calc_proximo_envio(v_passo1.base_atraso, v_passo1.atraso_minutos, now()),
    'ativo', now(), 'manual'
  ) RETURNING id INTO v_execucao_id;

  PERFORM followup_log(p_lead_id, v_lead.corretor_id,
    'Follow-up "' || v_fluxo.nome || '" iniciado (' || v_npassos || ' passo(s)).');

  RETURN v_execucao_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- followup_registrar_envio: no ÚLTIMO passo, se ao_esgotar='descartar' e o
-- cliente nunca respondeu -> descarta o lead + marco no histórico.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.followup_registrar_envio(
  p_execucao_id uuid,
  p_whatsapp_message_id text,
  p_conteudo text,
  p_mensagem_whatsapp_id uuid DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  SELECT ordem, atraso_minutos, base_atraso INTO v_proximo
  FROM followup_passos WHERE fluxo_id = v_exec.fluxo_id AND ordem = v_exec.passo_atual + 2;

  IF FOUND THEN
    -- ainda tem passo -> agenda o próximo
    UPDATE followup_execucoes
    SET passo_atual = passo_atual + 1,
        proximo_envio_em = followup_calc_proximo_envio(v_proximo.base_atraso, v_proximo.atraso_minutos, inscrito_em),
        tentativas_erro = 0
    WHERE id = p_execucao_id;
    RETURN;
  END IF;

  -- ÚLTIMO passo enviado, cliente nunca respondeu (senão já teria parado antes).
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
$$;

-- ---------------------------------------------------------------------------
-- followup_proximo_lote: mesmos filtros de antes + grava marco no histórico
-- pra cada execução que parou nesta passada.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.followup_proximo_lote(p_limite integer DEFAULT 25)
RETURNS TABLE (
  execucao_id uuid,
  lead_id uuid,
  corretor_id uuid,
  imobiliaria_id uuid,
  telefone text,
  telefone_alternativo text,
  passo_ordem integer,
  conteudo text,
  lead_nome text,
  lead_origem text,
  corretor_nome text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout TO '55s'
SET lock_timeout TO '3s'
AS $$
BEGIN
  -- Cliente respondeu (inbound depois da inscrição).
  UPDATE followup_execucoes e
  SET status = 'respondeu', finalizado_em = now(), motivo_parada = 'cliente respondeu'
  WHERE e.status = 'ativo'
    AND EXISTS (
      SELECT 1 FROM mensagens_whatsapp m
      WHERE m.lead_id = e.lead_id AND m.direcao = 'inbound'
        AND m.created_at > e.inscrito_em
    );

  UPDATE followup_envios ev
  SET respondeu_apos = true
  FROM followup_execucoes e
  WHERE ev.execucao_id = e.id AND e.status = 'respondeu' AND e.finalizado_em > now() - interval '90 seconds'
    AND ev.enviado_em = (SELECT MAX(ev2.enviado_em) FROM followup_envios ev2 WHERE ev2.execucao_id = e.id);

  INSERT INTO notificacoes (usuario_id, imobiliaria_id, lead_id, tipo, titulo, lida)
  SELECT e.corretor_id, e.imobiliaria_id, e.lead_id, 'followup_respondido',
         COALESCE(l.nome, l.telefone, 'Lead') || ' respondeu o follow-up', false
  FROM followup_execucoes e JOIN leads l ON l.id = e.lead_id
  WHERE e.status = 'respondeu' AND e.finalizado_em > now() - interval '90 seconds';

  -- Corretor assumiu.
  UPDATE followup_execucoes e
  SET status = 'pausado_corretor', finalizado_em = now(), motivo_parada = 'corretor assumiu a conversa'
  WHERE e.status = 'ativo'
    AND EXISTS (
      SELECT 1 FROM mensagens_whatsapp m
      WHERE m.lead_id = e.lead_id AND m.direcao = 'outbound'
        AND m.canal IS DISTINCT FROM 'followup'
        AND m.created_at > e.inscrito_em
    );

  -- Lead saiu de cena.
  UPDATE followup_execucoes e
  SET status = 'parado_lead', finalizado_em = now(),
      motivo_parada = 'lead descartado / vendido / trocou de corretor'
  FROM leads l
  WHERE e.lead_id = l.id AND e.status = 'ativo'
    AND (
      l.descartado_em IS NOT NULL
      OR l.venda_pendente_aprovacao IS TRUE
      OR l.data_fechamento IS NOT NULL
      OR l.status = 'venda_concluida'
      OR l.corretor_id IS DISTINCT FROM e.corretor_id
    );

  -- Marco no histórico do card pra tudo que parou nesta passada.
  INSERT INTO leads_interacoes (lead_id, autor_id, tipo, conteudo)
  SELECT e.lead_id, e.corretor_id, 'auto',
    'Follow-up "' || f.nome || '" encerrado: ' ||
    CASE e.motivo_parada
      WHEN 'cliente respondeu'          THEN 'cliente respondeu.'
      WHEN 'corretor assumiu a conversa' THEN 'corretor assumiu a conversa.'
      ELSE 'lead saiu do funil (descartado, vendido ou trocou de corretor).'
    END
  FROM followup_execucoes e
  JOIN followup_fluxos f ON f.id = e.fluxo_id
  WHERE e.finalizado_em > now() - interval '90 seconds'
    AND e.status IN ('respondeu','pausado_corretor','parado_lead')
    AND e.corretor_id IS NOT NULL;

  -- Devolve as prontas pra enviar agora.
  RETURN QUERY
  SELECT
    e.id, e.lead_id, e.corretor_id, e.imobiliaria_id,
    l.telefone, l.telefone_alternativo,
    p.ordem, p.conteudo,
    l.nome, COALESCE(l.referencia, l.origem), c.nome
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
    AND (
      SELECT count(*) FROM followup_envios ev
      JOIN followup_execucoes e2 ON e2.id = ev.execucao_id
      WHERE e2.corretor_id = e.corretor_id AND ev.enviado_em > now() - interval '1 hour'
    ) < 8
    AND (
      SELECT count(*) FROM followup_envios ev
      JOIN followup_execucoes e2 ON e2.id = ev.execucao_id
      WHERE e2.corretor_id = e.corretor_id AND ev.enviado_em > now() - interval '24 hours'
    ) < 40
  ORDER BY e.proximo_envio_em
  LIMIT p_limite
  FOR UPDATE OF e SKIP LOCKED;
END;
$$;

-- ---------------------------------------------------------------------------
-- Controles manuais: + marco no histórico
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.followup_encerrar(p_execucao_id uuid, p_motivo text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_exec  public.followup_execucoes;
  v_fnome text;
BEGIN
  v_exec := followup_assert_posse(p_execucao_id);
  UPDATE followup_execucoes
  SET status = 'encerrado_manual', finalizado_em = now(),
      motivo_parada = COALESCE(p_motivo, 'encerrado manualmente')
  WHERE id = p_execucao_id AND status NOT IN ('concluido','encerrado_manual');

  SELECT nome INTO v_fnome FROM followup_fluxos WHERE id = v_exec.fluxo_id;
  PERFORM followup_log(v_exec.lead_id, v_exec.corretor_id,
    'Follow-up "' || COALESCE(v_fnome,'') || '" ' ||
    COALESCE(NULLIF(p_motivo,''), 'encerrado manualmente') || '.');
END;
$$;

CREATE OR REPLACE FUNCTION public.followup_trocar_fluxo(p_execucao_id uuid, p_novo_fluxo_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_exec public.followup_execucoes;
BEGIN
  v_exec := followup_assert_posse(p_execucao_id);
  PERFORM followup_encerrar(p_execucao_id, 'trocado por outro fluxo');
  RETURN followup_iniciar_manual(v_exec.lead_id, p_novo_fluxo_id);
END;
$$;
