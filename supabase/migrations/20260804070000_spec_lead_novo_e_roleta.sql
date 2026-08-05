-- Especificacao formal do dono (planilha, 04/08) -- Modulo 1 (Lead Novo) e
-- Modulo 2 (Roleta). Aplicado direto em producao via Management API; este
-- arquivo documenta as mudancas no repo.

-- ===== MODULO 1: dedup de Lead Novo (Fluxo A/B/C) =====
-- Fluxo A (lead 100% novo): segue o insert normal.
-- Fluxo B (lead existente COM corretor): cria novo card, manda pro corretor
--   da vez na roleta (NAO reatribui pro corretor antigo) -- ja e' o
--   comportamento padrao do trigger tr_distribute_lead, nada a mudar aqui.
-- Fluxo C (lead existente SEM corretor): NAO cria novo card -- reabre o
--   antigo, registra nota de historico com campanha antiga x nova, manda pra
--   roleta de novo.
CREATE OR REPLACE FUNCTION public.check_lead_duplicado()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_lead_id uuid;
  v_corretor_id uuid;
  v_origem_antiga text;
  v_created_antiga timestamptz;
  v_coluna_lead_novo uuid;
  v_coluna_rebatida uuid;
  v_autor_sistema uuid;
  v_novo_corretor uuid;
BEGIN
  IF NEW.telefone IS NULL OR NEW.telefone = '' THEN
    RETURN NEW;
  END IF;

  SELECT l.id, l.corretor_id, l.origem, l.created_at
  INTO v_lead_id, v_corretor_id, v_origem_antiga, v_created_antiga
  FROM leads l
  JOIN buscar_lead_por_telefone(NEW.telefone) b ON b.id = l.id
  WHERE l.imobiliaria_id = NEW.imobiliaria_id
  ORDER BY l.created_at DESC LIMIT 1;

  IF v_lead_id IS NULL THEN
    RETURN NEW; -- Fluxo A
  END IF;

  IF v_corretor_id IS NOT NULL THEN
    RETURN NEW; -- Fluxo B
  END IF;

  -- Fluxo C
  SELECT id INTO v_coluna_lead_novo FROM colunas_kanban WHERE imobiliaria_id = NEW.imobiliaria_id AND nome ILIKE '%lead novo%' ORDER BY posicao LIMIT 1;
  SELECT id INTO v_autor_sistema FROM perfis WHERE imobiliaria_id = NEW.imobiliaria_id AND role = 'dono' ORDER BY created_at LIMIT 1;

  IF v_autor_sistema IS NOT NULL THEN
    INSERT INTO leads_interacoes (id, lead_id, autor_id, tipo, conteudo)
    VALUES (
      gen_random_uuid(), v_lead_id, v_autor_sistema, 'novo_cadastro_campanha',
      format('Novo cadastro em campanha: %s (%s). Cadastro original: %s em %s.',
        COALESCE(NEW.origem, 'Site'), to_char(NOW(), 'DD/MM/YYYY HH24:MI'),
        COALESCE(v_origem_antiga, 'Site'), to_char(v_created_antiga, 'DD/MM/YYYY HH24:MI'))
    );
  END IF;

  SELECT corretor_id INTO v_novo_corretor FROM get_next_corretor_rodizio(NEW.imobiliaria_id);
  IF v_novo_corretor IS NOT NULL THEN
    UPDATE leads SET status = 'novo', coluna_kanban_id = COALESCE(v_coluna_lead_novo, coluna_kanban_id),
      ultima_acao_at = NOW(), origem = NEW.origem, corretor_id = v_novo_corretor,
      data_atribuicao = NOW(), primeiro_contato_em = NULL
    WHERE id = v_lead_id;
  ELSE
    SELECT id INTO v_coluna_rebatida FROM colunas_kanban WHERE imobiliaria_id = NEW.imobiliaria_id AND nome ILIKE '%rebatid%' ORDER BY posicao LIMIT 1;
    UPDATE leads SET status = 'rebatida', coluna_kanban_id = COALESCE(v_coluna_rebatida, coluna_kanban_id),
      ultima_acao_at = NOW(), origem = NEW.origem
    WHERE id = v_lead_id;
  END IF;

  RETURN NULL; -- cancela o insert do card novo
END;
$function$;

-- Nome escolhido de proposito pra rodar ANTES de handle_insert_lead_kanban e
-- tr_distribute_lead (ordem alfabetica de trigger no Postgres) -- se cair no
-- Fluxo C e devolver NULL, os outros triggers nem chegam a rodar pra essa
-- linha (o insert e cancelado ali mesmo).
DROP TRIGGER IF EXISTS check_lead_duplicado ON leads;
CREATE TRIGGER check_lead_duplicado
  BEFORE INSERT ON public.leads
  FOR EACH ROW EXECUTE FUNCTION check_lead_duplicado();

-- Testado em producao (04/08): insert de lead com telefone repetido de um
-- lead sem corretor NAO criou linha nova, atualizou o lead existente
-- (origem/status/coluna) e tentou mandar pra roleta -- depois revertido.

-- ===== MODULO 2: janelas de tolerancia de login + advertencias =====
ALTER TABLE perfis ADD COLUMN IF NOT EXISTS advertencias_semana integer NOT NULL DEFAULT 0;
ALTER TABLE perfis ADD COLUMN IF NOT EXISTS advertencia_semana_inicio date;

-- Substitui o modelo antigo ("10 min pos-embaralhar") por janelas fixas de
-- horario: manha ate 09:30 (tolerancia ate 09:45), tarde ate 13:45
-- (tolerancia ate 14:00). Login fora dessas janelas fica bloqueado pro
-- turno (ativo_no_turno=false) e conta uma advertencia na semana; 3
-- advertencias na semana = bloqueado de receber lead (get_next_corretor_rodizio
-- ja filtra por isso).
CREATE OR REPLACE FUNCTION public.entrar_na_roleta(p_corretor_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_imobiliaria_id uuid;
  v_now_local timestamp;
  v_hora time;
  v_ativo boolean;
  v_atrasado boolean := false;
  v_max_posicao integer;
  v_semana_atual date;
  v_semana_registrada date;
  v_advertencias integer;
BEGIN
  SELECT imobiliaria_id INTO v_imobiliaria_id FROM perfis WHERE id = p_corretor_id;
  v_now_local := now() AT TIME ZONE 'America/Sao_Paulo';
  v_hora := v_now_local::time;
  v_semana_atual := date_trunc('week', v_now_local)::date;

  IF v_hora <= TIME '09:30' THEN v_ativo := true;
  ELSIF v_hora <= TIME '09:45' THEN v_ativo := true;
  ELSIF v_hora <= TIME '13:45' THEN v_ativo := true;
  ELSIF v_hora <= TIME '14:00' THEN v_ativo := true;
  ELSE v_ativo := false; v_atrasado := true;
  END IF;

  SELECT advertencias_semana, advertencia_semana_inicio INTO v_advertencias, v_semana_registrada FROM perfis WHERE id = p_corretor_id;
  IF v_semana_registrada IS NULL OR v_semana_registrada <> v_semana_atual THEN v_advertencias := 0; END IF;
  IF v_atrasado THEN v_advertencias := v_advertencias + 1; END IF;
  IF v_advertencias >= 3 THEN v_ativo := false; END IF;

  UPDATE perfis SET status_roleta = TRUE, ultimo_checkin_roleta = NOW(), em_plantao = TRUE,
    advertencias_semana = v_advertencias, advertencia_semana_inicio = v_semana_atual
  WHERE id = p_corretor_id;

  IF NOT EXISTS (SELECT 1 FROM filas_atendimento WHERE corretor_id = p_corretor_id) THEN
    SELECT COALESCE(MAX(posicao), 0) + 1 INTO v_max_posicao FROM filas_atendimento WHERE imobiliaria_id = v_imobiliaria_id;
    INSERT INTO filas_atendimento (corretor_id, imobiliaria_id, posicao, ativo_no_turno) VALUES (p_corretor_id, v_imobiliaria_id, v_max_posicao, v_ativo);
  ELSIF v_ativo THEN
    SELECT COALESCE(MAX(posicao), 0) + 1 INTO v_max_posicao FROM filas_atendimento WHERE imobiliaria_id = v_imobiliaria_id;
    UPDATE filas_atendimento SET posicao = v_max_posicao, ativo_no_turno = TRUE WHERE corretor_id = p_corretor_id;
  ELSE
    UPDATE filas_atendimento SET ativo_no_turno = FALSE WHERE corretor_id = p_corretor_id;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_next_corretor_rodizio(p_imobiliaria_id uuid)
 RETURNS TABLE(corretor_id uuid)
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_corretor_id uuid;
  v_max_posicao integer;
  v_now_local timestamp;
  v_dow int;
  v_hora time;
  v_corte time;
BEGIN
  v_now_local := now() AT TIME ZONE 'America/Sao_Paulo';
  v_dow := EXTRACT(DOW FROM v_now_local);
  v_hora := v_now_local::time;
  IF v_dow = 0 THEN RETURN QUERY SELECT NULL::uuid; RETURN; END IF;
  v_corte := CASE v_dow WHEN 4 THEN TIME '19:30' WHEN 6 THEN TIME '15:20' ELSE TIME '18:20' END;
  IF v_hora >= v_corte THEN RETURN QUERY SELECT NULL::uuid; RETURN; END IF;
  SELECT f.corretor_id INTO v_corretor_id
  FROM filas_atendimento f JOIN perfis p ON p.id = f.corretor_id
  WHERE p.imobiliaria_id = p_imobiliaria_id AND p.status_roleta = TRUE AND p.em_almoco = FALSE
    AND p.advertencias_semana < 3 AND f.ativo_no_turno = TRUE
  ORDER BY f.posicao ASC LIMIT 1;
  IF v_corretor_id IS NOT NULL THEN
    SELECT COALESCE(MAX(f2.posicao), 0) INTO v_max_posicao FROM filas_atendimento f2 WHERE f2.imobiliaria_id = p_imobiliaria_id;
    UPDATE filas_atendimento f3 SET posicao = v_max_posicao + 1 WHERE f3.corretor_id = v_corretor_id AND f3.imobiliaria_id = p_imobiliaria_id;
  END IF;
  RETURN QUERY SELECT v_corretor_id;
END;
$function$;

-- Auto-offline no fim do expediente: 18:20 (seg/ter/qua/sex), 19:30 (qui),
-- 15:20 (sab). Roda a cada 5min via pg_cron -- so o get_next_corretor_rodizio
-- ja bloqueava a DISTRIBUICAO apos o corte, mas o status_roleta continuava
-- true visualmente; agora fica offline de verdade.
CREATE OR REPLACE FUNCTION public.auto_offline_fim_de_expediente()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_now_local timestamp;
  v_dow int;
  v_hora time;
  v_corte time;
BEGIN
  v_now_local := now() AT TIME ZONE 'America/Sao_Paulo';
  v_dow := EXTRACT(DOW FROM v_now_local);
  v_hora := v_now_local::time;
  IF v_dow = 0 THEN RETURN; END IF;
  v_corte := CASE v_dow WHEN 4 THEN TIME '19:30' WHEN 6 THEN TIME '15:20' ELSE TIME '18:20' END;
  IF v_hora >= v_corte THEN
    UPDATE perfis SET status_roleta = false WHERE status_roleta = true;
  END IF;
END;
$function$;

SELECT cron.schedule('auto-offline-fim-expediente', '*/5 * * * *', 'SELECT public.auto_offline_fim_de_expediente()');

-- Botao "Almoco" ja implementado numa migration anterior (em_almoco) ja
-- preserva a posicao na fila ao voltar, porque so mexe em em_almoco, nunca
-- em posicao -- nenhuma mudanca adicional necessaria pra "voltar no mesmo
-- lugar".
