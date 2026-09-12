-- Pedido do dono (12/09): achado durante o teste real que uma falha de envio
-- (ex: bug conhecido do WAHA/GOWS "no LID found", ver
-- https://github.com/devlikeapro/waha/issues/1714 -- upstream, sem fix) fica
-- tentando de novo PRA SEMPRE, sem limite -- ninguém nunca chamava
-- followup_registrar_erro (nem automacao.js, nem o workflow n8n).
--
-- Fix: followup_registrar_erro passa a avisar o corretor (e dono/gerente)
-- quando desiste na 3ª tentativa, e registrar no Histórico do card -- mesmo
-- padrão já usado pros outros encerramentos de follow-up
-- (leads_interacoes tipo 'auto', notificacoes tipo dedicado).
CREATE OR REPLACE FUNCTION public.followup_registrar_erro(p_execucao_id uuid, p_erro text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
      motivo_parada = p_erro
  WHERE id = p_execucao_id;

  IF v_desistiu THEN
    SELECT nome INTO v_fluxo_nome FROM followup_fluxos WHERE id = v_exec.fluxo_id;
    SELECT nome INTO v_lead_nome FROM leads WHERE id = v_exec.lead_id;

    PERFORM followup_log(v_exec.lead_id, v_exec.corretor_id,
      'Follow-up "' || COALESCE(v_fluxo_nome, '') || '" travado após 3 tentativas de envio sem sucesso (' ||
      p_erro || '). Mande mensagem manual pra esse lead.');

    -- Avisa o corretor dono do lead.
    INSERT INTO notificacoes (usuario_id, imobiliaria_id, lead_id, tipo, titulo, lida)
    VALUES (
      v_exec.corretor_id, v_exec.imobiliaria_id, v_exec.lead_id, 'followup_erro',
      'Follow-up travado — mande mensagem manual pra ' || COALESCE(NULLIF(v_lead_nome, ''), 'esse lead'),
      false
    );

    -- Avisa dono/gerente também, pra não ficar escondido (ex: descobrir só quando o dono olhar o card).
    INSERT INTO notificacoes (usuario_id, imobiliaria_id, lead_id, tipo, titulo, lida)
    SELECT p.id, v_exec.imobiliaria_id, v_exec.lead_id, 'followup_erro',
      'Follow-up travado (falha de envio) — lead: ' || COALESCE(NULLIF(v_lead_nome, ''), 'sem nome'), false
    FROM perfis p
    WHERE p.imobiliaria_id = v_exec.imobiliaria_id AND p.role IN ('dono', 'gerente');
  END IF;
END;
$$;
