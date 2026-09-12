-- ============================================================================
-- FOLLOW-UP -- fluxo por CAMPANHA (compartilhado, imobiliária inteira) + passo
-- com IMAGEM/anexo (o "criativo" do anúncio)
-- ============================================================================
-- Pedido do dono (12/09): cada campanha tem seu próprio criativo/anúncio, e a
-- sequência de follow-up precisa manter esse contexto -- ex: no 2º follow-up
-- de quem veio da Campanha A, mandar a própria imagem do anúncio A, pra o
-- lead lembrar de onde veio o contato.
--
-- Decisão confirmada com o dono: fluxo de campanha é ÚNICO e COMPARTILHADO
-- pela imobiliária inteira (dono/gerente cadastra 1x, vale pra qualquer
-- corretor que receber um lead daquela campanha) -- não é por corretor.
-- Prioridade: campanha (se existir uma pra origem do lead) vence o fluxo
-- "Geral" pessoal do corretor.
--
-- "Campanha" aqui = leads.origem (mesmo campo já usado em todo o resto do
-- sistema pra agrupar por campanha/anúncio -- relatórios, dashboard). Casa
-- por igualdade exata; como o origem hoje carrega o ID do anúncio dentro do
-- texto (ex: "[ANUNCIO][10][SETE SÓIS]"), cada variação de anúncio vira uma
-- "campanha" própria pra fins de follow-up -- se o dono quiser agrupar por
-- algo mais amplo no futuro, precisa de um campo normalizado à parte.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Fluxo pode ser amarrado a uma campanha (compartilhado, corretor_id NULL
--    nesse caso -- mesmo modelo dos fluxos "Modelo" que já existiam).
-- ---------------------------------------------------------------------------
ALTER TABLE public.followup_fluxos
  ADD COLUMN IF NOT EXISTS campanha text;

-- Só uma campanha ativa por nome, por imobiliária (senão qual delas o
-- trigger escolheria?).
CREATE UNIQUE INDEX IF NOT EXISTS followup_fluxos_campanha_ativa_unica
  ON public.followup_fluxos (imobiliaria_id, campanha)
  WHERE campanha IS NOT NULL AND ativo;

-- ---------------------------------------------------------------------------
-- 2. Passo pode ter um anexo (o criativo/imagem do anúncio, ou vídeo/pdf).
--    Mesmo modelo de anexo já usado em templates_mensagem.
-- ---------------------------------------------------------------------------
ALTER TABLE public.followup_passos
  ADD COLUMN IF NOT EXISTS anexo_url text,
  ADD COLUMN IF NOT EXISTS anexo_tipo text CHECK (anexo_tipo IN ('imagem','video','documento')),
  ADD COLUMN IF NOT EXISTS anexo_nome text,
  ADD COLUMN IF NOT EXISTS anexo_mimetype text;

-- ---------------------------------------------------------------------------
-- 3. Disparo automático: campanha (compartilhada) tem prioridade sobre o
--    fluxo "Geral" pessoal do corretor. Resto do comportamento idêntico ao
--    que já estava (20260911020000) -- nunca trava a atribuição do lead.
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
$$;

-- ---------------------------------------------------------------------------
-- 4. followup_proximo_lote: passa a devolver também o anexo do passo, pro
--    backend saber se manda imagem/vídeo/documento em vez de só texto.
--    Resto (housekeeping, rate limit, filtros) idêntico ao de
--    20260903010000.
-- ---------------------------------------------------------------------------
-- RETURNS TABLE ganhou colunas novas (anexo_*) -- Postgres não deixa mudar o
-- shape de saída com CREATE OR REPLACE, precisa dropar antes.
DROP FUNCTION IF EXISTS public.followup_proximo_lote(integer);

CREATE FUNCTION public.followup_proximo_lote(p_limite integer DEFAULT 25)
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
  corretor_nome text,
  anexo_url text,
  anexo_tipo text,
  anexo_nome text,
  anexo_mimetype text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout TO '55s'
SET lock_timeout TO '3s'
AS $$
BEGIN
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

  UPDATE followup_execucoes e
  SET status = 'pausado_corretor', finalizado_em = now(), motivo_parada = 'corretor assumiu a conversa'
  WHERE e.status = 'ativo'
    AND EXISTS (
      SELECT 1 FROM mensagens_whatsapp m
      WHERE m.lead_id = e.lead_id AND m.direcao = 'outbound'
        AND m.canal IS DISTINCT FROM 'followup'
        AND m.created_at > e.inscrito_em
    );

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

REVOKE ALL ON FUNCTION public.followup_proximo_lote(integer) FROM PUBLIC, anon, authenticated;
