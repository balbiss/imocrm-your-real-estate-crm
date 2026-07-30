-- Item do dono: "TIRAR A FUNÇÃO DE COLOCAR CORRETOR OFF DEPOIS DE 30 MINUTOS
-- SE NAO ESTIVER MEXENDO, SÓ DEIXAR ATIVO O TEMPORIZADOR DO LEAD NOVO, SE ELE
-- NAO PEGAR EM 5 MINUTOS TRANSFERIR PARA OUTRO CORRETOR."
--
-- Isso mexe em 3 coisas:
-- 1) get_next_corretor_rodizio (usada pelo webhook.js pra distribuir lead
--    novo que chega via WhatsApp) parava de considerar um corretor elegível
--    se ele não desse "check-in" de novo a cada 30min, mesmo estando
--    marcado como online (status_roleta=true) — é essa regra que o dono
--    quer tirar. Agora só exige status_roleta = true.
-- 2) primeiro_contato_em nunca era preenchido em lugar nenhum do sistema
--    (0 de 1944 leads tinham valor) — sem isso, o timer de 5min não teria
--    como saber se o corretor já atendeu ou não. Criamos um trigger que
--    preenche automaticamente na primeira vez que o corretor mexe no card
--    (mesmo sinal que já atualiza ultima_acao_at no LeadDetailsModal).
-- 3) reassign_overdue_leads(): nova função que reaproveita
--    get_next_corretor_rodizio (mesma lógica/efeito colateral de mover
--    quem pegou o lead pro fim da fila) pra leads status='novo' com
--    corretor mas sem primeiro_contato_em há mais de 5min. Agendada via
--    pg_cron, de minuto
--    em minuto — não depende de ninguém estar com o CRM aberto no
--    navegador (diferente do SlaMonitor.tsx, que nunca chegou a ser
--    plugado no app e tinha bug de nome de tabela errado).
--
-- Salvaguarda: antes de ligar a regra, "aposentamos" (preenchemos
-- primeiro_contato_em) os leads que JÁ estavam parados há mais de 5min,
-- pra não disparar uma reatribuição em massa de leads antigos no primeiro
-- tick do cron. A regra passa a valer só pra atribuições feitas daqui pra
-- frente.

-- 1) Remove a exigencia de check-in fresco de 30min
CREATE OR REPLACE FUNCTION public.get_next_corretor_rodizio(p_imobiliaria_id uuid)
 RETURNS TABLE(corretor_id uuid)
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_corretor_id uuid;
  v_max_posicao integer;
BEGIN
  SELECT f.corretor_id INTO v_corretor_id
  FROM filas_atendimento f
  JOIN perfis p ON p.id = f.corretor_id
  WHERE p.imobiliaria_id = p_imobiliaria_id
    AND p.status_roleta = TRUE
  ORDER BY f.posicao ASC
  LIMIT 1;

  IF v_corretor_id IS NOT NULL THEN
    SELECT COALESCE(MAX(f2.posicao), 0) INTO v_max_posicao
    FROM filas_atendimento f2
    WHERE f2.imobiliaria_id = p_imobiliaria_id;

    UPDATE filas_atendimento
    SET posicao = v_max_posicao + 1
    WHERE corretor_id = v_corretor_id AND imobiliaria_id = p_imobiliaria_id;
  END IF;

  RETURN QUERY SELECT v_corretor_id;
END;
$function$;

-- 2) Backfill de seguranca: leads 'novo' com corretor ha mais de 5min e sem
-- primeiro_contato_em ficam "aposentados" da regra (nao viram alvo do cron).
UPDATE leads
SET primeiro_contato_em = COALESCE(ultima_acao_at, created_at)
WHERE corretor_id IS NOT NULL
  AND status = 'novo'
  AND primeiro_contato_em IS NULL
  AND descartado_em IS NULL;

-- 3) Trigger que preenche primeiro_contato_em na primeira acao real do
-- corretor no card (mesmo gatilho que ja atualiza ultima_acao_at).
CREATE OR REPLACE FUNCTION public.set_primeiro_contato_em()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.primeiro_contato_em IS NULL AND NEW.ultima_acao_at IS DISTINCT FROM OLD.ultima_acao_at THEN
    NEW.primeiro_contato_em := NOW();
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_set_primeiro_contato_em ON leads;
CREATE TRIGGER trg_set_primeiro_contato_em
BEFORE UPDATE ON leads
FOR EACH ROW
EXECUTE FUNCTION set_primeiro_contato_em();

-- 4) Reatribuicao automatica apos 5min sem primeiro contato.
CREATE OR REPLACE FUNCTION public.reassign_overdue_leads()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_lead RECORD;
  v_next_corretor uuid;
BEGIN
  FOR v_lead IN
    SELECT id, imobiliaria_id
    FROM leads
    WHERE corretor_id IS NOT NULL
      AND status = 'novo'
      AND primeiro_contato_em IS NULL
      AND descartado_em IS NULL
      AND data_atribuicao <= NOW() - INTERVAL '5 minutes'
  LOOP
    SELECT corretor_id INTO v_next_corretor
    FROM get_next_corretor_rodizio(v_lead.imobiliaria_id);

    IF v_next_corretor IS NOT NULL THEN
      UPDATE leads
      SET corretor_id = v_next_corretor,
          data_atribuicao = NOW()
      WHERE id = v_lead.id;

      INSERT INTO distribuicao_log (lead_id, corretor_id, imobiliaria_id, tipo)
      VALUES (v_lead.id, v_next_corretor, v_lead.imobiliaria_id, 'sla_5min_sem_contato');
    END IF;
  END LOOP;
END;
$function$;

-- 5) Agenda a checagem pra rodar sozinha, de minuto em minuto, direto no
-- Postgres — nao depende de ninguem estar com o CRM aberto no navegador.
-- pg_cron sempre cria seu proprio schema "cron" pros jobs, independente
-- de onde a extensao em si e instalada.
CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'reassign-overdue-leads-5min';
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'reassign-overdue-leads-5min',
  '* * * * *',
  $$SELECT public.reassign_overdue_leads()$$
);

-- 6) distribuir_leads_massa (transferencia manual e distribuicao em massa
-- feita por dono/gerente) tambem precisa resetar data_atribuicao e
-- primeiro_contato_em — senao um lead passado manualmente pra um corretor
-- ja chegaria "vencido" pro timer de 5min (herdando o primeiro_contato_em
-- nulo antigo mas com data_atribuicao antiga tambem, ou pior, herdando um
-- primeiro_contato_em de um atendimento anterior que nao faz sentido pro
-- novo responsavel).
CREATE OR REPLACE FUNCTION public.distribuir_leads_massa(p_lead_ids uuid[], p_corretor_id uuid, p_tipo text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_imobiliaria_id uuid;
  v_coluna_rebatida_id uuid;
BEGIN
  SELECT imobiliaria_id INTO v_imobiliaria_id FROM perfis WHERE id = p_corretor_id;

  SELECT id INTO v_coluna_rebatida_id
  FROM colunas_kanban
  WHERE imobiliaria_id = v_imobiliaria_id AND nome ILIKE '%rebatid%'
  ORDER BY posicao
  LIMIT 1;

  UPDATE leads
  SET
    corretor_id = p_corretor_id,
    status = 'rebatida',
    coluna_kanban_id = COALESCE(v_coluna_rebatida_id, coluna_kanban_id),
    tentativas_contato = 0,
    ultima_interacao = NOW(),
    descartado_em = NULL,
    descartado_por = NULL,
    motivo_descarte = NULL,
    lembrete_follow_up = NULL,
    data_visita = NULL,
    data_atribuicao = NOW(),
    primeiro_contato_em = NULL
  WHERE id = ANY(p_lead_ids);

  INSERT INTO distribuicao_log (lead_id, corretor_id, imobiliaria_id, tipo)
  SELECT l.id, p_corretor_id, l.imobiliaria_id, p_tipo
  FROM leads l
  WHERE l.id = ANY(p_lead_ids);

  UPDATE perfis
  SET ultimo_lead_recebido_em = NOW()
  WHERE id = p_corretor_id;
END;
$function$;
