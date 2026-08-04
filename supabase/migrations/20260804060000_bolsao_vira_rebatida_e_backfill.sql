-- Feature pedida (planilha, item REDISTRIBUICAO): leads que caem no Bolsão
-- (corretor_id fica NULL porque ninguem estava online na roleta) ficavam com
-- status='novo' pra sempre, presos na coluna LEAD NOVO ate alguem redistribuir
-- manualmente. Isso e' exatamente o oposto do que o dono pediu: ele quer que
-- esses leads virem REBATIDA na hora (base geral pra qualquer corretor puxar
-- em "Resgatar do Bolsao" -- ja existe e ja aceita qualquer lead sem
-- corretor, so a classificacao visual estava errada).
CREATE OR REPLACE FUNCTION public.distribute_lead()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_coluna_rebatida uuid;
BEGIN
  IF NEW.corretor_id IS NULL THEN
    SELECT corretor_id INTO NEW.corretor_id FROM get_next_corretor_rodizio(NEW.imobiliaria_id);
    IF NEW.corretor_id IS NULL THEN
      SELECT id INTO v_coluna_rebatida FROM colunas_kanban
      WHERE imobiliaria_id = NEW.imobiliaria_id AND nome ILIKE '%rebatid%'
      ORDER BY posicao LIMIT 1;
      NEW.status := 'rebatida';
      IF v_coluna_rebatida IS NOT NULL THEN
        NEW.coluna_kanban_id := v_coluna_rebatida;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- Backfill de leads ja presos no bolsao (nenhum encontrado em 04/08, mas
-- mantido pra proteger contra regressao futura).
UPDATE leads SET
  status = 'rebatida',
  coluna_kanban_id = (SELECT id FROM colunas_kanban c WHERE c.imobiliaria_id = leads.imobiliaria_id AND c.nome ILIKE '%rebatid%' ORDER BY c.posicao LIMIT 1)
WHERE corretor_id IS NULL
  AND status = 'novo'
  AND descartado_em IS NULL
  AND COALESCE(descarte_pendente_aprovacao, false) = false;
