-- Relato do dono (grupo, 24/09): "se cadastrou novamente dia 22/09 só que não
-- foi atribuído pra ninguém" / "esse lead entrou pela segunda vez, mas não foi
-- pra ninguém".
--
-- Causa: check_lead_duplicado() tenta a roleta quando um lead ANTIGO e SEM
-- corretor se cadastra de novo. Fora do horário da roleta (domingo, depois de
-- 18:20 / qui 19:30 / sáb 15:20, ou antes de alguém ativar o turno) ela não
-- devolve ninguém e o lead ia pra REBATIDA sem dono. Lead NOVO nessa situação
-- é distribuído de manhã (puxado/distribuído mais recente primeiro), mas o
-- recadastro tem created_at antigo: fica enterrado entre ~7.700 rebatidas
-- (puxar_mais_rebatidas ordena por created_at ASC e ainda esconde de quem já
-- foi dono dele). 16 leads assim entre 19 e 23/09.
--
-- Fix:
-- 1) Recadastro que a roleta atribui na hora agora limpa a marca de descarte
--    antiga (descartado_em/por/motivo) -- igual puxar_mais_rebatidas já faz.
--    Sem isso o card atribuído continuava "descartado": some do Kanban e o
--    follow-up automático para no minuto seguinte ("lead saiu do funil").
-- 2) distribuir_recadastros_pendentes(): a cada 5 min, recadastro dos últimos
--    7 dias ainda sem corretor entra na roleta assim que ela abrir (mais
--    antigo primeiro). Fica de fora: descadastrado/desqualificado, descarte
--    pendente de aprovação, e lead que já foi trabalhado e descartado DEPOIS
--    do recadastro.

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
  v_nome_antigo text;
  v_telefone_antigo text;
  v_coluna_lead_novo uuid;
  v_coluna_rebatida uuid;
  v_autor_sistema uuid;
  v_novo_corretor uuid;
  v_nome_exib text;
BEGIN
  IF NEW.telefone IS NULL OR NEW.telefone = '' THEN
    RETURN NEW;
  END IF;

  SELECT l.id, l.corretor_id, l.origem, l.created_at, l.nome, l.telefone
    INTO v_lead_id, v_corretor_id, v_origem_antiga, v_created_antiga, v_nome_antigo, v_telefone_antigo
  FROM leads l
  JOIN buscar_lead_por_telefone(NEW.telefone) b ON b.id = l.id
  WHERE l.imobiliaria_id = NEW.imobiliaria_id
  ORDER BY l.created_at DESC
  LIMIT 1;

  -- Genuinamente novo -> deixa criar.
  IF v_lead_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- ===== Daqui pra baixo o lead JA EXISTE. Nunca cria card duplicado. =====
  v_nome_exib := COALESCE(NULLIF(v_nome_antigo, ''), v_telefone_antigo, 'Sem nome');

  SELECT id INTO v_autor_sistema
  FROM perfis WHERE imobiliaria_id = NEW.imobiliaria_id AND role = 'dono'
  ORDER BY created_at LIMIT 1;

  IF v_autor_sistema IS NOT NULL THEN
    INSERT INTO leads_interacoes (id, lead_id, autor_id, tipo, conteudo)
    VALUES (
      gen_random_uuid(), v_lead_id, v_autor_sistema, 'novo_cadastro_campanha',
      format('Novo cadastro em campanha: %s (%s). Cadastro original: %s em %s.',
        COALESCE(NEW.origem, 'Site'), to_char(NOW(), 'DD/MM/YYYY HH24:MI'),
        COALESCE(v_origem_antiga, 'Site'), to_char(v_created_antiga, 'DD/MM/YYYY HH24:MI'))
    );
  END IF;

  -- Marca o re-cadastro (badge no card). NAO sobrescreve a origem original.
  UPDATE leads
  SET recadastro_em = NOW(),
      recadastro_origem = NEW.origem
  WHERE id = v_lead_id;

  -- ----- Ja tem corretor: mantem, so avisa (sinal de compra forte) -----
  IF v_corretor_id IS NOT NULL THEN
    INSERT INTO notificacoes (usuario_id, imobiliaria_id, lead_id, tipo, titulo, lida)
    VALUES (
      v_corretor_id, NEW.imobiliaria_id, v_lead_id, 'lead_novo_atribuido',
      'Seu lead se cadastrou de novo numa campanha: ' || v_nome_exib, false
    );
    RETURN NULL;
  END IF;

  -- ----- Sem corretor: roleta / rebatida (comportamento de antes) -----
  SELECT id INTO v_coluna_lead_novo
  FROM colunas_kanban WHERE imobiliaria_id = NEW.imobiliaria_id AND nome ILIKE '%lead novo%'
  ORDER BY posicao LIMIT 1;

  SELECT corretor_id INTO v_novo_corretor FROM get_next_corretor_rodizio(NEW.imobiliaria_id);

  IF v_novo_corretor IS NOT NULL THEN
    UPDATE leads SET
      status = 'novo',
      coluna_kanban_id = COALESCE(v_coluna_lead_novo, coluna_kanban_id),
      ultima_acao_at = NOW(),
      corretor_id = v_novo_corretor,
      data_atribuicao = NOW(),
      primeiro_contato_em = NULL,
      descartado_em = NULL,
      descartado_por = NULL,
      motivo_descarte = NULL
    WHERE id = v_lead_id;

    INSERT INTO notificacoes (usuario_id, imobiliaria_id, lead_id, tipo, titulo, lida)
    VALUES (
      v_novo_corretor, NEW.imobiliaria_id, v_lead_id, 'lead_novo_atribuido',
      'Lead reativado (novo contato via campanha): ' || v_nome_exib, false
    );
  ELSE
    SELECT id INTO v_coluna_rebatida
    FROM colunas_kanban WHERE imobiliaria_id = NEW.imobiliaria_id AND nome ILIKE '%rebatid%'
    ORDER BY posicao LIMIT 1;

    UPDATE leads SET
      status = 'rebatida',
      coluna_kanban_id = COALESCE(v_coluna_rebatida, coluna_kanban_id),
      ultima_acao_at = NOW()
    WHERE id = v_lead_id;

    INSERT INTO notificacoes (usuario_id, imobiliaria_id, lead_id, tipo, titulo, lida)
    SELECT p.id, NEW.imobiliaria_id, v_lead_id, 'possivel_duplicidade',
      'Lead antigo teve novo contato via campanha (sem corretor disponivel): ' || v_nome_exib, false
    FROM perfis p
    WHERE p.imobiliaria_id = NEW.imobiliaria_id AND p.role IN ('gerente', 'dono');
  END IF;

  RETURN NULL;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.distribuir_recadastros_pendentes()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '55s'
 SET lock_timeout TO '3s'
AS $function$
DECLARE
  v_lead          record;
  v_corretor      uuid;
  v_coluna_novo   uuid;
  v_count         integer := 0;
  v_imob_sem_fila uuid[] := '{}';
BEGIN
  FOR v_lead IN
    SELECT l.id, l.imobiliaria_id, COALESCE(NULLIF(l.nome, ''), l.telefone, 'Sem nome') AS nome_exib
    FROM leads l
    WHERE l.corretor_id IS NULL
      AND l.recadastro_em > now() - interval '7 days'
      AND COALESCE(l.descarte_pendente_aprovacao, false) = false
      AND l.status::text <> 'desqualificado'
      AND COALESCE(l.motivo_descarte, '') NOT ILIKE 'Descadastrar%'
      AND (l.descartado_em IS NULL OR l.descartado_em < l.recadastro_em)
    ORDER BY l.recadastro_em
    FOR UPDATE OF l SKIP LOCKED
  LOOP
    -- Roleta fechada pra essa imobiliária nesta passada: não insiste.
    CONTINUE WHEN v_lead.imobiliaria_id = ANY(v_imob_sem_fila);

    SELECT corretor_id INTO v_corretor FROM get_next_corretor_rodizio(v_lead.imobiliaria_id);
    IF v_corretor IS NULL THEN
      v_imob_sem_fila := v_imob_sem_fila || v_lead.imobiliaria_id;
      CONTINUE;
    END IF;

    SELECT id INTO v_coluna_novo FROM colunas_kanban
    WHERE imobiliaria_id = v_lead.imobiliaria_id AND nome ILIKE '%lead novo%'
    ORDER BY posicao LIMIT 1;

    UPDATE leads SET
      status = 'novo',
      coluna_kanban_id = COALESCE(v_coluna_novo, coluna_kanban_id),
      ultima_acao_at = now(),
      corretor_id = v_corretor,
      data_atribuicao = now(),
      primeiro_contato_em = NULL,
      lembrete_follow_up = NULL,
      data_visita = NULL,
      descartado_em = NULL,
      descartado_por = NULL,
      motivo_descarte = NULL
    WHERE id = v_lead.id AND corretor_id IS NULL;

    INSERT INTO distribuicao_log (lead_id, corretor_id, imobiliaria_id, tipo)
    VALUES (v_lead.id, v_corretor, v_lead.imobiliaria_id, 'automatico');

    INSERT INTO notificacoes (usuario_id, imobiliaria_id, lead_id, tipo, titulo, lida)
    VALUES (v_corretor, v_lead.imobiliaria_id, v_lead.id, 'lead_novo_atribuido',
            'Lead reativado (novo contato via campanha): ' || v_lead.nome_exib, false);

    INSERT INTO leads_interacoes (lead_id, autor_id, tipo, conteudo)
    VALUES (v_lead.id, v_corretor, 'auto',
            'Lead se cadastrou de novo fora do horário da roleta e foi entregue pela roleta assim que ela abriu.');

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$function$;

REVOKE ALL ON FUNCTION public.distribuir_recadastros_pendentes() FROM PUBLIC, anon, authenticated;

SELECT cron.unschedule('distribuir-recadastros-pendentes')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'distribuir-recadastros-pendentes');
SELECT cron.schedule('distribuir-recadastros-pendentes', '*/5 * * * *', 'SELECT public.distribuir_recadastros_pendentes()');
