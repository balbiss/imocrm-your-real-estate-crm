-- BUG REAL (15/09): follow-up mandando a mesma mensagem varias vezes em
-- segundos, sempre com o texto do passo 1, mesmo followup_envios registrando
-- passo_ordem 1, 2, 3 corretamente (systemico -- confirmado em ~15 leads).
--
-- Causa raiz: followup_proximo_lote() so trava a linha (FOR UPDATE OF e
-- SKIP LOCKED) durante a PROPRIA consulta. O envio de verdade acontece
-- minutos depois, numa chamada HTTP separada do motor n8n pro backend
-- (automacao.js). Desde que o intervalo do motor caiu de 10min pra 1min
-- (13/09), execucoes concorrentes do n8n conseguiam buscar a MESMA linha
-- (passo_atual ainda não avançado) antes da anterior terminar de enviar +
-- chamar followup_registrar_envio. Cada uma dessas buscas concorrentes
-- disparava um envio de WhatsApp de verdade (por isso IDs de mensagem
-- diferentes) com o MESMO conteudo (o do passo ainda não avançado), e o
-- registrar_envio (que trava certo e sempre lê passo_atual fresco do banco)
-- ia empilhando o avanço 1->2->3 mesmo cada envio tendo mandado o texto do
-- passo 1.
--
-- Fix: "visibility timeout" (mesmo padrão de fila tipo SQS) -- ao selecionar
-- o lote, já empurra proximo_envio_em pra frente ANTES de devolver pro n8n.
-- Se o envio funcionar, followup_registrar_envio sobrescreve com o valor
-- certo (baseado no atraso do PRÓXIMO passo). Se o envio falhar de verdade
-- (followup_registrar_erro NÃO toca proximo_envio_em hoje) ou o n8n cair no
-- meio, a linha volta a aparecer sozinha depois da reserva -- autocura, sem
-- precisar de coluna nova nem mudar o n8n.

DROP FUNCTION IF EXISTS public.followup_proximo_lote(integer);

CREATE FUNCTION public.followup_proximo_lote(p_limite integer DEFAULT 25)
 RETURNS TABLE(execucao_id uuid, lead_id uuid, corretor_id uuid, imobiliaria_id uuid, telefone text, telefone_alternativo text, passo_ordem integer, conteudo text, lead_nome text, lead_origem text, corretor_nome text, anexo_url text, anexo_tipo text, anexo_nome text, anexo_mimetype text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '55s'
 SET lock_timeout TO '3s'
AS $function$
DECLARE
  v_ids uuid[];
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

  -- Escolhe o lote (com o mesmo filtro/trava de antes), mas SÓ os ids --
  -- agregar direto travaria o LIMIT (agregado sem GROUP BY ignora LIMIT
  -- aplicado fora da subquery), por isso o LIMIT+FOR UPDATE ficam dentro.
  SELECT array_agg(sub.id) INTO v_ids
  FROM (
    SELECT e.id
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
    FOR UPDATE OF e SKIP LOCKED
  ) sub;

  IF v_ids IS NULL THEN
    RETURN;
  END IF;

  -- RESERVA: empurra proximo_envio_em pra frente ANTES de devolver pro n8n,
  -- pra nenhuma outra passada do motor (concorrente ou 1min depois) pegar
  -- essa mesma linha enquanto o envio de verdade ainda ta em andamento.
  UPDATE followup_execucoes
  SET proximo_envio_em = now() + interval '5 minutes'
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
