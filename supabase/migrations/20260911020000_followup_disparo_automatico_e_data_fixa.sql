-- ============================================================================
-- FOLLOW-UP -- Fase 2 (disparo automático ao atribuir o lead) + passo com
-- data/hora fixa
-- ============================================================================
-- Pedido do dono (11/09, grupo do WhatsApp): "o followup não está funcionando,
-- faz igual do [CRM] Hinode: quando a roleta atribui pra um corretor, e esse
-- corretor aceita, já dispara um followup inicial". Investigação (sem tocar em
-- nada antes): o motor (n8n, a cada 10 min) está saudável, mas
-- `followup_execucoes` está zerada desde sempre -- a Fase 1 (20260903000000)
-- deixou a coluna `imobiliarias.followup_automatico_ativo` pronta pra ser lida
-- por `followup_proximo_lote`, mas NENHUM código nunca escreve `true` nela, e
-- não existe nenhum trigger que inicie um fluxo sozinho -- só o botão manual
-- "Iniciar follow-up" no card, que na prática nunca foi usado. CRM Hinode
-- também não tem "aceite" de verdade no backend (é cosmético lá também) --
-- o disparo de lá acontece na ATRIBUIÇÃO (roleta OU transferência manual).
-- Replicando esse comportamento aqui, com a régua que já existe (não muda
-- nada da Cadência de Chamada, que é outro sistema, intocado).
--
-- Escopo do gatilho (confirmado com o dono): dispara tanto na roleta quanto
-- em qualquer transferência manual ("Transferir para", "Encaminhar para...",
-- Ações em Massa) -- qualquer jeito do lead ganhar um corretor_id novo.
--
-- Segunda peça (mesma conversa): permitir passo com DATA E HORA EXATAS do
-- calendário, além do atraso relativo (30min/1h/1dia/...) que já existia.
--
-- Aditivo, sem tocar em cadencia_chamada/lembrete_follow_up. Nada aqui pode
-- travar a atribuição de lead (todo o disparo automático é best-effort, com
-- EXCEPTION WHEN OTHERS silencioso).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Passo pode ter uma data/hora EXATA em vez de atraso relativo.
-- ---------------------------------------------------------------------------
ALTER TABLE public.followup_passos
  ADD COLUMN IF NOT EXISTS data_hora_fixa timestamptz;

-- ---------------------------------------------------------------------------
-- 2. followup_calc_proximo_envio: se o passo tiver data_hora_fixa, usa ela
--    direto (ignora atraso_minutos/base_atraso). Parâmetro novo com DEFAULT
--    NULL -- não quebra nenhum call site existente.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.followup_calc_proximo_envio(
  p_base_atraso text,
  p_atraso_minutos integer,
  p_inscrito_em timestamptz,
  p_data_hora_fixa timestamptz DEFAULT NULL
) RETURNS timestamptz
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_data_hora_fixa IS NOT NULL THEN p_data_hora_fixa
    WHEN p_base_atraso = 'inscricao' THEN p_inscrito_em + make_interval(mins => p_atraso_minutos)
    ELSE now() + make_interval(mins => p_atraso_minutos)
  END;
$$;

-- ---------------------------------------------------------------------------
-- 3. followup_iniciar_interno: mesmo corpo que followup_iniciar_manual já
--    tinha, só sem a checagem de permissão (get_auth_role()/auth.uid() não
--    fazem sentido dentro de um trigger) -- extraído pra poder ser chamado
--    tanto pelo botão manual quanto pelo disparo automático.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.followup_iniciar_interno(
  p_lead_id uuid,
  p_fluxo_id uuid,
  p_iniciado_por text DEFAULT 'manual'
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead        record;
  v_fluxo       record;
  v_passo1      record;
  v_npassos     integer;
  v_execucao_id uuid;
BEGIN
  SELECT id, corretor_id, imobiliaria_id INTO v_lead FROM leads WHERE id = p_lead_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lead não encontrado.'; END IF;
  IF v_lead.corretor_id IS NULL THEN
    RAISE EXCEPTION 'Lead sem corretor -- não dá pra iniciar follow-up.';
  END IF;

  SELECT id, imobiliaria_id, ativo, nome INTO v_fluxo FROM followup_fluxos WHERE id = p_fluxo_id;
  IF NOT FOUND OR v_fluxo.imobiliaria_id IS DISTINCT FROM v_lead.imobiliaria_id THEN
    RAISE EXCEPTION 'Fluxo inválido.';
  END IF;
  IF NOT v_fluxo.ativo THEN RAISE EXCEPTION 'Fluxo está desativado.'; END IF;

  SELECT ordem, atraso_minutos, base_atraso, data_hora_fixa INTO v_passo1
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
    followup_calc_proximo_envio(v_passo1.base_atraso, v_passo1.atraso_minutos, now(), v_passo1.data_hora_fixa),
    'ativo', now(), p_iniciado_por
  ) RETURNING id INTO v_execucao_id;

  PERFORM followup_log(p_lead_id, v_lead.corretor_id,
    'Follow-up "' || v_fluxo.nome || '" iniciado' ||
    (CASE WHEN p_iniciado_por = 'automatico' THEN ' automaticamente' ELSE '' END) ||
    ' (' || v_npassos || ' passo(s)).');

  RETURN v_execucao_id;
END;
$$;

-- followup_iniciar_manual passa a ser só a casca com permissão, delegando
-- pro interno -- comportamento pro botão do card 100% igual a antes.
CREATE OR REPLACE FUNCTION public.followup_iniciar_manual(p_lead_id uuid, p_fluxo_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_corretor_id uuid;
  v_role        text := get_auth_role();
BEGIN
  SELECT corretor_id INTO v_corretor_id FROM leads WHERE id = p_lead_id;
  IF v_role NOT IN ('dono','gerente') AND v_corretor_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Sem permissão para iniciar follow-up neste lead.';
  END IF;
  RETURN followup_iniciar_interno(p_lead_id, p_fluxo_id, 'manual');
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. followup_registrar_envio: passa data_hora_fixa do próximo passo pro
--    cálculo (resto idêntico ao que já estava em 20260903010000).
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
$$;

-- ---------------------------------------------------------------------------
-- 5. Disparo automático: qualquer lead que ganha corretor_id (roleta OU
--    transferência manual) entra sozinho no fluxo "Geral" ativo desse
--    corretor, se existir e se a imobiliária tiver ligado a automática.
--    Nunca lança exceção pra fora -- não pode travar a atribuição do lead.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.followup_disparo_automatico()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fluxo_id uuid;
  v_ativo    boolean;
BEGIN
  IF NEW.corretor_id IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.corretor_id IS NOT DISTINCT FROM NEW.corretor_id THEN RETURN NEW; END IF;

  IF EXISTS (SELECT 1 FROM followup_execucoes WHERE lead_id = NEW.id AND status = 'ativo') THEN
    RETURN NEW;
  END IF;

  SELECT followup_automatico_ativo INTO v_ativo FROM imobiliarias WHERE id = NEW.imobiliaria_id;
  IF NOT COALESCE(v_ativo, false) THEN RETURN NEW; END IF;

  SELECT id INTO v_fluxo_id FROM followup_fluxos
  WHERE corretor_id = NEW.corretor_id AND ativo AND e_geral
  LIMIT 1;
  IF v_fluxo_id IS NULL THEN RETURN NEW; END IF;

  PERFORM followup_iniciar_interno(NEW.id, v_fluxo_id, 'automatico');

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'followup_disparo_automatico falhou pro lead %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_followup_disparo_automatico ON public.leads;
CREATE TRIGGER trg_followup_disparo_automatico
  AFTER INSERT OR UPDATE OF corretor_id ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.followup_disparo_automatico();

-- ---------------------------------------------------------------------------
-- 6. Liga a automática pra Hinode Imóveis -- é a única imobiliária hoje e é
--    exatamente o que o dono pediu. Sem efeito prático até algum corretor
--    marcar um fluxo como "Geral" E "Ativo" ao mesmo tempo (hoje nenhum
--    fluxo real dos corretores está nos dois estados juntos -- avisar o
--    dono disso separadamente, fora desta migration).
-- ---------------------------------------------------------------------------
UPDATE public.imobiliarias SET followup_automatico_ativo = true;
