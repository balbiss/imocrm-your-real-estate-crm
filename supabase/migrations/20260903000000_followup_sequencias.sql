-- ============================================================================
-- FOLLOW-UP AUTOMÁTICO -- Fase 1 (inscrição manual apenas)
-- ============================================================================
-- Pedido do dono: o corretor monta uma sequência de mensagens de WhatsApp
-- ("um campo pra eles criarem o fluxo") e o CRM manda sozinho pro lead --
-- mensagem inicial + follow-ups -- com histórico de o que foi enviado / se o
-- cliente respondeu, sem se misturar com as conversas que o corretor já tinha.
--
-- Motor = n8n (workflow novo "FOLLOW-UP - MOTOR DE ENVIO" em n8n.inoovaweb.cloud):
--   a cada 10 min -> SELECT * FROM followup_proximo_lote(25)
--                 -> POST /backend/automacao/followup/enviar (envia + grava +
--                    chama followup_registrar_envio)
--
-- Fase 1: SÓ inscrição manual (RPC followup_iniciar_manual, botão "Iniciar
-- follow-up" no card). NENHUM trigger em `leads` -- o disparo automático na
-- roleta fica pra Fase 2 (gated por imobiliarias.followup_automatico_ativo,
-- criada aqui já pra o RPC poder ler).
--
-- Tudo aditivo. Nada nesta migração pode travar a atribuição de lead.
-- Kill switch operacional = desativar o workflow no n8n.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. TABELAS
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.followup_fluxos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  imobiliaria_id uuid NOT NULL REFERENCES public.imobiliarias(id) ON DELETE CASCADE,
  corretor_id uuid REFERENCES public.perfis(id) ON DELETE CASCADE, -- NULL = modelo da imobiliária
  nome text NOT NULL,
  ativo boolean NOT NULL DEFAULT false,
  e_geral boolean NOT NULL DEFAULT false, -- Fase 2: todo lead novo do corretor entra aqui
  criado_por uuid REFERENCES public.perfis(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.followup_passos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fluxo_id uuid NOT NULL REFERENCES public.followup_fluxos(id) ON DELETE CASCADE,
  ordem integer NOT NULL,
  atraso_minutos integer NOT NULL DEFAULT 0,
  base_atraso text NOT NULL DEFAULT 'passo_anterior'
    CHECK (base_atraso IN ('inscricao', 'passo_anterior')),
  conteudo text NOT NULL,
  so_horario_comercial boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (fluxo_id, ordem)
);

CREATE TABLE IF NOT EXISTS public.followup_execucoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  fluxo_id uuid NOT NULL REFERENCES public.followup_fluxos(id) ON DELETE CASCADE,
  corretor_id uuid NOT NULL REFERENCES public.perfis(id) ON DELETE CASCADE,
  imobiliaria_id uuid NOT NULL REFERENCES public.imobiliarias(id) ON DELETE CASCADE,
  passo_atual integer NOT NULL DEFAULT 0, -- último passo já enviado (0 = nada ainda)
  proximo_envio_em timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'ativo'
    CHECK (status IN ('ativo','respondeu','pausado_corretor','parado_lead','concluido','encerrado_manual','erro')),
  inscrito_em timestamptz NOT NULL DEFAULT now(),
  finalizado_em timestamptz,
  motivo_parada text,
  iniciado_por text NOT NULL DEFAULT 'manual' CHECK (iniciado_por IN ('manual','automatico')),
  tentativas_erro integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.followup_envios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  execucao_id uuid NOT NULL REFERENCES public.followup_execucoes(id) ON DELETE CASCADE,
  passo_ordem integer NOT NULL,
  conteudo_enviado text NOT NULL,
  enviado_em timestamptz NOT NULL DEFAULT now(),
  whatsapp_message_id text,
  mensagem_whatsapp_id uuid,
  respondeu_apos boolean NOT NULL DEFAULT false
);

-- Uma execução ATIVA por lead (evita fluxo duplicado no mesmo card).
CREATE UNIQUE INDEX IF NOT EXISTS followup_execucoes_lead_ativa
  ON public.followup_execucoes (lead_id) WHERE status = 'ativo';
CREATE INDEX IF NOT EXISTS followup_execucoes_due
  ON public.followup_execucoes (proximo_envio_em) WHERE status = 'ativo';
CREATE INDEX IF NOT EXISTS followup_envios_execucao
  ON public.followup_envios (execucao_id);
CREATE INDEX IF NOT EXISTS followup_fluxos_corretor
  ON public.followup_fluxos (imobiliaria_id, corretor_id);

CREATE TRIGGER set_followup_fluxos_updated_at
  BEFORE UPDATE ON public.followup_fluxos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 2. COLUNAS EM TABELAS EXISTENTES
-- ---------------------------------------------------------------------------

-- Marca a mensagem automática -- o chat separa por aqui (selo 🤖) e o
-- followup_proximo_lote usa pra saber se o CORRETOR assumiu a conversa
-- (mensagem outbound com canal != 'followup').
ALTER TABLE public.mensagens_whatsapp
  ADD COLUMN IF NOT EXISTS canal text,
  ADD COLUMN IF NOT EXISTS followup_envio_id uuid;

-- Gate da inscrição AUTOMÁTICA (Fase 2). Fase 1 não usa pra execução manual.
ALTER TABLE public.imobiliarias
  ADD COLUMN IF NOT EXISTS followup_automatico_ativo boolean NOT NULL DEFAULT false;

-- ---------------------------------------------------------------------------
-- 3. RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.followup_fluxos    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.followup_passos    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.followup_execucoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.followup_envios    ENABLE ROW LEVEL SECURITY;

-- fluxos: corretor mexe nos seus; dono/gerente mexem em tudo (inclui modelos
-- da imobiliária, corretor_id IS NULL); todo mundo lê os modelos.
CREATE POLICY followup_fluxos_select ON public.followup_fluxos FOR SELECT
  USING (
    imobiliaria_id = get_auth_imobiliaria_id()
    AND (
      corretor_id = auth.uid()
      OR corretor_id IS NULL
      OR get_auth_role() = ANY (ARRAY['dono'::text, 'gerente'::text])
    )
  );
CREATE POLICY followup_fluxos_insert ON public.followup_fluxos FOR INSERT
  WITH CHECK (
    imobiliaria_id = get_auth_imobiliaria_id()
    AND (
      corretor_id = auth.uid()
      OR get_auth_role() = ANY (ARRAY['dono'::text, 'gerente'::text])
    )
  );
CREATE POLICY followup_fluxos_update ON public.followup_fluxos FOR UPDATE
  USING (
    imobiliaria_id = get_auth_imobiliaria_id()
    AND (corretor_id = auth.uid() OR get_auth_role() = ANY (ARRAY['dono'::text, 'gerente'::text]))
  )
  WITH CHECK (
    imobiliaria_id = get_auth_imobiliaria_id()
    AND (corretor_id = auth.uid() OR get_auth_role() = ANY (ARRAY['dono'::text, 'gerente'::text]))
  );
CREATE POLICY followup_fluxos_delete ON public.followup_fluxos FOR DELETE
  USING (
    imobiliaria_id = get_auth_imobiliaria_id()
    AND (corretor_id = auth.uid() OR get_auth_role() = ANY (ARRAY['dono'::text, 'gerente'::text]))
  );

-- passos: seguem a permissão do fluxo pai.
CREATE POLICY followup_passos_all ON public.followup_passos FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.followup_fluxos f
    WHERE f.id = followup_passos.fluxo_id
      AND f.imobiliaria_id = get_auth_imobiliaria_id()
      AND (f.corretor_id = auth.uid() OR f.corretor_id IS NULL
           OR get_auth_role() = ANY (ARRAY['dono'::text, 'gerente'::text]))
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.followup_fluxos f
    WHERE f.id = followup_passos.fluxo_id
      AND f.imobiliaria_id = get_auth_imobiliaria_id()
      AND (f.corretor_id = auth.uid()
           OR get_auth_role() = ANY (ARRAY['dono'::text, 'gerente'::text]))
  ));

-- execuções / envios: só leitura pelo app (mutação é via RPC SECURITY DEFINER
-- e pelo service role do backend). Escopo = dono do lead ou dono/gerente.
CREATE POLICY followup_execucoes_select ON public.followup_execucoes FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.leads l
    WHERE l.id = followup_execucoes.lead_id
      AND l.imobiliaria_id = get_auth_imobiliaria_id()
      AND (get_auth_role() = ANY (ARRAY['dono'::text, 'gerente'::text]) OR l.corretor_id = auth.uid())
  ));
CREATE POLICY followup_envios_select ON public.followup_envios FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.followup_execucoes e
    JOIN public.leads l ON l.id = e.lead_id
    WHERE e.id = followup_envios.execucao_id
      AND l.imobiliaria_id = get_auth_imobiliaria_id()
      AND (get_auth_role() = ANY (ARRAY['dono'::text, 'gerente'::text]) OR l.corretor_id = auth.uid())
  ));

-- ---------------------------------------------------------------------------
-- 4. HELPER: horário comercial (Seg-Sáb 08:00-20:00, America/Sao_Paulo)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.followup_em_horario_comercial(p_ts timestamptz DEFAULT now())
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT
    EXTRACT(DOW FROM (p_ts AT TIME ZONE 'America/Sao_Paulo')) BETWEEN 1 AND 6
    AND (p_ts AT TIME ZONE 'America/Sao_Paulo')::time >= TIME '08:00'
    AND (p_ts AT TIME ZONE 'America/Sao_Paulo')::time <  TIME '20:00';
$$;

-- ---------------------------------------------------------------------------
-- 5. HELPER interno: calcula proximo_envio_em de um passo
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.followup_calc_proximo_envio(
  p_base_atraso text,
  p_atraso_minutos integer,
  p_inscrito_em timestamptz
) RETURNS timestamptz
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_base_atraso = 'inscricao' THEN p_inscrito_em + make_interval(mins => p_atraso_minutos)
    ELSE now() + make_interval(mins => p_atraso_minutos)
  END;
$$;

-- ---------------------------------------------------------------------------
-- 6. RPC: iniciar follow-up manualmente (botão no card)
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

  SELECT id, imobiliaria_id, ativo INTO v_fluxo FROM followup_fluxos WHERE id = p_fluxo_id;
  IF NOT FOUND OR v_fluxo.imobiliaria_id IS DISTINCT FROM v_lead.imobiliaria_id THEN
    RAISE EXCEPTION 'Fluxo inválido.';
  END IF;
  IF NOT v_fluxo.ativo THEN RAISE EXCEPTION 'Fluxo está desativado.'; END IF;

  SELECT ordem, atraso_minutos, base_atraso INTO v_passo1
  FROM followup_passos WHERE fluxo_id = p_fluxo_id ORDER BY ordem LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'Fluxo não tem nenhum passo.'; END IF;

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

  RETURN v_execucao_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.followup_iniciar_manual(uuid, uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 7. RPCs de controle (botões Pausar / Retomar / Encerrar / Trocar fluxo)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.followup_assert_posse(p_execucao_id uuid)
RETURNS public.followup_execucoes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_exec public.followup_execucoes;
  v_lead_corretor uuid;
BEGIN
  SELECT * INTO v_exec FROM followup_execucoes WHERE id = p_execucao_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Execução não encontrada.'; END IF;
  SELECT corretor_id INTO v_lead_corretor FROM leads WHERE id = v_exec.lead_id;
  IF get_auth_role() NOT IN ('dono','gerente') AND v_lead_corretor IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Sem permissão.';
  END IF;
  RETURN v_exec;
END;
$$;

CREATE OR REPLACE FUNCTION public.followup_pausar(p_execucao_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM followup_assert_posse(p_execucao_id);
  UPDATE followup_execucoes
  SET status = 'pausado_corretor', motivo_parada = 'pausado manualmente'
  WHERE id = p_execucao_id AND status = 'ativo';
END;
$$;

CREATE OR REPLACE FUNCTION public.followup_retomar(p_execucao_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM followup_assert_posse(p_execucao_id);
  UPDATE followup_execucoes
  SET status = 'ativo', motivo_parada = NULL, proximo_envio_em = now(), tentativas_erro = 0
  WHERE id = p_execucao_id AND status IN ('pausado_corretor','erro');
END;
$$;

CREATE OR REPLACE FUNCTION public.followup_encerrar(p_execucao_id uuid, p_motivo text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM followup_assert_posse(p_execucao_id);
  UPDATE followup_execucoes
  SET status = 'encerrado_manual', finalizado_em = now(),
      motivo_parada = COALESCE(p_motivo, 'encerrado manualmente')
  WHERE id = p_execucao_id AND status NOT IN ('concluido','encerrado_manual');
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
  UPDATE followup_execucoes
  SET status = 'encerrado_manual', finalizado_em = now(), motivo_parada = 'troca de fluxo'
  WHERE id = p_execucao_id;
  RETURN followup_iniciar_manual(v_exec.lead_id, p_novo_fluxo_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.followup_pausar(uuid)             TO authenticated;
GRANT EXECUTE ON FUNCTION public.followup_retomar(uuid)            TO authenticated;
GRANT EXECUTE ON FUNCTION public.followup_encerrar(uuid, text)     TO authenticated;
GRANT EXECUTE ON FUNCTION public.followup_trocar_fluxo(uuid, uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 8. RPC: próximo lote pronto pra enviar (chamado pelo n8n a cada 10 min)
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
  -- 8a. Housekeeping: para as execuções que já não devem mais rodar.
  -- Cliente respondeu (inbound depois da inscrição).
  WITH respondidas AS (
    SELECT e.id
    FROM followup_execucoes e
    WHERE e.status = 'ativo'
      AND EXISTS (
        SELECT 1 FROM mensagens_whatsapp m
        WHERE m.lead_id = e.lead_id AND m.direcao = 'inbound'
          AND m.created_at > e.inscrito_em
      )
  )
  UPDATE followup_execucoes e
  SET status = 'respondeu', finalizado_em = now(), motivo_parada = 'cliente respondeu'
  FROM respondidas r WHERE e.id = r.id;

  -- Marca "respondeu_apos" no último envio das que acabaram de parar por resposta
  -- e avisa o corretor.
  UPDATE followup_envios ev
  SET respondeu_apos = true
  FROM followup_execucoes e
  WHERE ev.execucao_id = e.id AND e.status = 'respondeu' AND e.finalizado_em > now() - interval '1 minute'
    AND ev.enviado_em = (SELECT MAX(ev2.enviado_em) FROM followup_envios ev2 WHERE ev2.execucao_id = e.id);

  INSERT INTO notificacoes (usuario_id, imobiliaria_id, lead_id, tipo, titulo, lida)
  SELECT e.corretor_id, e.imobiliaria_id, e.lead_id, 'followup_respondido',
         COALESCE(l.nome, l.telefone, 'Lead') || ' respondeu o follow-up', false
  FROM followup_execucoes e JOIN leads l ON l.id = e.lead_id
  WHERE e.status = 'respondeu' AND e.finalizado_em > now() - interval '1 minute';

  -- Corretor assumiu (mandou mensagem manual depois da inscrição).
  UPDATE followup_execucoes e
  SET status = 'pausado_corretor', finalizado_em = now(), motivo_parada = 'corretor assumiu a conversa'
  WHERE e.status = 'ativo'
    AND EXISTS (
      SELECT 1 FROM mensagens_whatsapp m
      WHERE m.lead_id = e.lead_id AND m.direcao = 'outbound'
        AND m.canal IS DISTINCT FROM 'followup'
        AND m.created_at > e.inscrito_em
    );

  -- Lead saiu de cena (descartado / vendido / trocou de corretor).
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

  -- 8b. Devolve as que estão prontas pra enviar AGORA.
  RETURN QUERY
  SELECT
    e.id,
    e.lead_id,
    e.corretor_id,
    e.imobiliaria_id,
    l.telefone,
    l.telefone_alternativo,
    p.ordem,
    p.conteudo,
    l.nome,
    COALESCE(l.referencia, l.origem),
    c.nome
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

-- Sem GRANT pra authenticated: só o service role (n8n / backend) chama.
-- (REVOKE das 3 funções de motor no fim do arquivo, depois de todas definidas.)

-- ---------------------------------------------------------------------------
-- 9. RPC: registrar envio (chamado pelo BACKEND após mandar a mensagem)
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
    UPDATE followup_execucoes
    SET passo_atual = passo_atual + 1,
        proximo_envio_em = followup_calc_proximo_envio(v_proximo.base_atraso, v_proximo.atraso_minutos, inscrito_em),
        tentativas_erro = 0
    WHERE id = p_execucao_id;
  ELSE
    UPDATE followup_execucoes
    SET passo_atual = passo_atual + 1, status = 'concluido', finalizado_em = now()
    WHERE id = p_execucao_id;
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 10. RPC: registrar erro de envio (chamado pelo n8n após 3 falhas)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.followup_registrar_erro(p_execucao_id uuid, p_erro text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE followup_execucoes
  SET tentativas_erro = tentativas_erro + 1,
      status = CASE WHEN tentativas_erro + 1 >= 3 THEN 'erro' ELSE status END,
      finalizado_em = CASE WHEN tentativas_erro + 1 >= 3 THEN now() ELSE finalizado_em END,
      motivo_parada = p_erro
  WHERE id = p_execucao_id AND status = 'ativo';
END;
$$;

-- ---------------------------------------------------------------------------
-- 11. Só o service role (n8n / backend) chama as funções do motor.
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.followup_proximo_lote(integer)                    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.followup_registrar_envio(uuid, text, text, uuid)  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.followup_registrar_erro(uuid, text)              FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 12. Realtime (aba Follow-up atualiza sozinha)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.followup_execucoes;
EXCEPTION WHEN duplicate_object OR undefined_object THEN NULL;
END $$;
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.followup_envios;
EXCEPTION WHEN duplicate_object OR undefined_object THEN NULL;
END $$;
