-- Bug reportado pelo dono (01/09): "tinha uns leads que só ficavam em Lista,
-- quando puxava mais rebatidas eles não apareciam em Kanban".
--
-- Causa: puxar_mais_rebatidas() puxa leads que estavam DESCARTADOS (pelas
-- travas de tempo: Sem Resposta > 3 dias, etc.), atribui um corretor e muda
-- status/coluna -- mas NUNCA limpava descartado_em/descartado_por/
-- motivo_descarte. O LeadsKanban esconde qualquer lead com descartado_em
-- setado (`if (lead.descartado_em) return false`), mas o LeadsTable (Lista)
-- não -- então o lead aparecia só na Lista. distribuir_leads_massa() já
-- limpava esses campos; puxar_mais_rebatidas ficou de fora.
--
-- Fix: o UPDATE do loop de puxar_mais_rebatidas passa a zerar
-- descartado_em/descartado_por/motivo_descarte (puxar de volta = "des-
-- descartar"). + backfill dos leads já nesse estado (com corretor E
-- descartado_em setado, fora do fluxo de aprovação).

CREATE OR REPLACE FUNCTION public.puxar_mais_rebatidas(p_corretor_id uuid, p_cidade text DEFAULT NULL)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET statement_timeout TO '55s'
 SET lock_timeout TO '3s'
AS $function$
DECLARE
  v_imobiliaria_id uuid;
  v_puxadas_hoje integer;
  v_coluna_rebatida uuid;
  v_limite integer;
  v_count integer := 0;
  v_lead RECORD;
BEGIN
  SELECT imobiliaria_id INTO v_imobiliaria_id FROM perfis WHERE id = p_corretor_id;

  SELECT COUNT(*) INTO v_puxadas_hoje FROM distribuicao_log
  WHERE corretor_id = p_corretor_id AND tipo = 'manual' AND created_at >= date_trunc('day', now());
  IF v_puxadas_hoje >= 50 THEN
    RAISE EXCEPTION 'Limite diário de 50 rebatidas atingido.';
  END IF;

  v_limite := LEAST(10, GREATEST(0, 50 - v_puxadas_hoje));

  SELECT id INTO v_coluna_rebatida FROM colunas_kanban
    WHERE imobiliaria_id = v_imobiliaria_id AND nome ILIKE '%rebatid%' ORDER BY posicao LIMIT 1;

  FOR v_lead IN
    SELECT l.id FROM leads l
    WHERE l.imobiliaria_id = v_imobiliaria_id
      AND l.corretor_id IS NULL
      AND COALESCE(l.descarte_pendente_aprovacao, false) = false
      AND (p_cidade IS NULL OR normalizar_texto(l.bairro_interesse) = normalizar_texto(p_cidade))
      AND NOT EXISTS (SELECT 1 FROM lead_historico_corretores h WHERE h.lead_id = l.id AND h.corretor_id = p_corretor_id)
      AND (
        l.descartado_em IS NULL
        OR (l.motivo_descarte = 'Sem Resposta' AND l.descartado_em <= now() - interval '3 days')
        OR (l.motivo_descarte = 'Parou de Responder' AND l.descartado_em <= now() - interval '5 days')
        OR (l.motivo_descarte = 'Sem Interesse' AND l.descartado_em <= now() - interval '20 days')
        OR (l.motivo_descarte = 'Aprovado/Desistiu' AND l.descartado_em <= now() - interval '20 days')
      )
    ORDER BY l.created_at ASC
    LIMIT v_limite
    FOR UPDATE OF l SKIP LOCKED
  LOOP
    UPDATE leads SET
      corretor_id = p_corretor_id, status = 'rebatida',
      coluna_kanban_id = COALESCE(v_coluna_rebatida, coluna_kanban_id),
      lembrete_follow_up = NULL, data_visita = NULL,
      data_atribuicao = NOW(), primeiro_contato_em = NULL,
      descartado_em = NULL, descartado_por = NULL, motivo_descarte = NULL
    WHERE id = v_lead.id AND corretor_id IS NULL;

    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    INSERT INTO distribuicao_log (lead_id, corretor_id, imobiliaria_id, tipo)
    VALUES (v_lead.id, p_corretor_id, v_imobiliaria_id, 'manual');
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$function$;

-- Backfill: leads que já foram puxados/atribuídos mas ficaram com
-- descartado_em setado (invisíveis no Kanban). Não toca em quem está no
-- fluxo de aprovação de descarte extremo.
UPDATE leads
SET descartado_em = NULL, descartado_por = NULL, motivo_descarte = NULL
WHERE corretor_id IS NOT NULL
  AND descartado_em IS NOT NULL
  AND COALESCE(descarte_pendente_aprovacao, false) = false;
