-- Lote de correções pedido pelo dono (planilha 17/08). Este arquivo cobre os
-- itens que exigiram mudança de função/dado no banco; os demais itens da
-- planilha foram só front-end (ver commit).

-- ===== GERAL #1 + REBATIDA #4: cidades duplicadas / São José dos Campos
-- sumindo do filtro =====
-- Causa raiz dupla:
--  1) "Taubate" e "Taubaté" (variação de acento/caixa) contam como cidades
--     diferentes em TODOS os filtros de cidade do sistema, porque o dado
--     em leads.bairro_interesse nunca foi normalizado na entrada (vem de
--     cadastro manual, WhatsApp, Facebook -- cada um digita diferente).
--  2) O dropdown de "+ Mais Rebatidas" (BolsaoResgateDialog) buscava só as
--     primeiras 500 linhas cruas de leads sem corretor, SEM ORDER BY --
--     como a Rebatida tem milhares de leads acumulados (majoritariamente
--     Taubaté), São José dos Campos podia nunca aparecer nesse recorte.
-- Fix: função de normalização (remove acento/caixa/espaço) usada tanto pra
-- montar a lista de cidades (uma linha por cidade normalizada, com a grafia
-- mais frequente como rótulo) quanto pro filtro de fato em
-- puxar_mais_rebatidas -- resolve os dois bugs de uma vez. O front (leads.tsx
-- e redistribuicao.tsx, que já tinham a lista completa carregada em memória)
-- ganhou o mesmo dedup em JS (normalizarCidade/dedupCidades em lib/utils.ts).
CREATE OR REPLACE FUNCTION public.normalizar_texto(p text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT lower(trim(regexp_replace(
    translate(
      coalesce(p, ''),
      'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇç',
      'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCc'
    ),
    '\s+', ' ', 'g'
  )));
$function$;

CREATE OR REPLACE FUNCTION public.get_cidades_rebatidas(p_imobiliaria_id uuid)
 RETURNS TABLE(cidade text)
 LANGUAGE sql
 STABLE
AS $function$
  WITH contagem AS (
    SELECT bairro_interesse, normalizar_texto(bairro_interesse) AS norm, count(*) AS qtd
    FROM leads
    WHERE imobiliaria_id = p_imobiliaria_id
      AND corretor_id IS NULL
      AND bairro_interesse IS NOT NULL
      AND btrim(bairro_interesse) <> ''
    GROUP BY bairro_interesse
  ),
  ranked AS (
    SELECT bairro_interesse, norm,
      row_number() OVER (PARTITION BY norm ORDER BY qtd DESC, bairro_interesse) AS rn
    FROM contagem
  )
  SELECT bairro_interesse FROM ranked WHERE rn = 1 ORDER BY bairro_interesse;
$function$;

CREATE OR REPLACE FUNCTION public.puxar_mais_rebatidas(p_corretor_id uuid, p_cidade text DEFAULT NULL)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_imobiliaria_id uuid;
  v_puxadas_hoje integer;
  v_coluna_rebatida uuid;
  v_count integer := 0;
  v_lead RECORD;
BEGIN
  SELECT imobiliaria_id INTO v_imobiliaria_id FROM perfis WHERE id = p_corretor_id;

  SELECT COUNT(*) INTO v_puxadas_hoje FROM distribuicao_log
  WHERE corretor_id = p_corretor_id AND tipo = 'manual' AND created_at >= date_trunc('day', now());
  IF v_puxadas_hoje >= 50 THEN
    RAISE EXCEPTION 'Limite diário de 50 rebatidas atingido.';
  END IF;

  SELECT id INTO v_coluna_rebatida FROM colunas_kanban WHERE imobiliaria_id = v_imobiliaria_id AND nome ILIKE '%rebatid%' ORDER BY posicao LIMIT 1;

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
    LIMIT LEAST(10, GREATEST(0, 50 - v_puxadas_hoje))
  LOOP
    UPDATE leads SET
      corretor_id = p_corretor_id, status = 'rebatida',
      coluna_kanban_id = COALESCE(v_coluna_rebatida, coluna_kanban_id),
      lembrete_follow_up = NULL, data_visita = NULL,
      data_atribuicao = NOW(), primeiro_contato_em = NULL
    WHERE id = v_lead.id;
    INSERT INTO distribuicao_log (lead_id, corretor_id, imobiliaria_id, tipo) VALUES (v_lead.id, p_corretor_id, v_imobiliaria_id, 'manual');
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$function$;

-- ===== ROLETA #3: Histórico da Roleta não mostrava todos os corretores =====
-- Causa raiz: a exclusão "já apareceu em distribuicao_log" não filtrava por
-- tipo, mas reassign_overdue_leads() (timer de 5min) e distribuir_bolsao()
-- (EMBARALHAR) TAMBÉM gravam em distribuicao_log com tipo='automatico' --
-- então qualquer lead que chegou ao corretor por um desses dois caminhos
-- automáticos ficava de fora do "Histórico da Roleta" (era tratado como se
-- fosse atribuição manual). Fix: só exclui quando existe log tipo='manual'
-- de verdade (Encaminhar para.../Ações em Massa/+Mais Rebatidas) -- os
-- automáticos (timer 5min, embaralhar, distribuição na criação do lead)
-- agora aparecem todos.
CREATE OR REPLACE FUNCTION public.listar_historico_roleta(
  p_imobiliaria_id uuid,
  p_data_inicio timestamptz DEFAULT NULL,
  p_data_fim timestamptz DEFAULT NULL,
  p_limit integer DEFAULT 500
)
RETURNS TABLE(
  lead_id uuid,
  lead_nome text,
  lead_telefone text,
  corretor_id uuid,
  corretor_nome text,
  atribuido_em timestamptz,
  origem text
)
LANGUAGE sql
STABLE
AS $function$
  SELECT
    l.id,
    l.nome,
    l.telefone,
    l.corretor_id,
    p.nome,
    COALESCE(l.data_atribuicao, l.created_at),
    l.origem
  FROM leads l
  JOIN perfis p ON p.id = l.corretor_id
  WHERE l.imobiliaria_id = p_imobiliaria_id
    AND l.corretor_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM distribuicao_log dl
      WHERE dl.lead_id = l.id AND dl.corretor_id = l.corretor_id AND dl.tipo = 'manual'
    )
    AND (p_data_inicio IS NULL OR COALESCE(l.data_atribuicao, l.created_at) >= p_data_inicio)
    AND (p_data_fim IS NULL OR COALESCE(l.data_atribuicao, l.created_at) <= p_data_fim)
  ORDER BY COALESCE(l.data_atribuicao, l.created_at) DESC
  LIMIT p_limit;
$function$;

-- ===== REBATIDA #6: Lead Novo distribuído manualmente ia pra coluna
-- REBATIDA em vez de LEAD NOVO =====
-- Causa raiz: distribuir_leads_massa() -- usada por "Transferir" no card,
-- "Encaminhar para..." e "Ações em Massa" na aba Leads Novos/Rebatidas de
-- /redistribuicao -- forçava status='rebatida' + coluna REBATIDA pra
-- QUALQUER lead, mesmo quando é um Lead Novo genuíno (nunca teve corretor
-- antes) sendo distribuído pela primeira vez na aba "Leads Novos". Isso
-- também impedia a barra de SLA de 5min de aparecer no card do corretor
-- (só aparece com status='novo', ver LeadDetailsModal) e fazia o relatório
-- não contar como "recebeu lead novo".
-- Fix: por lead, checa se é genuinamente novo (status='novo' e nunca teve
-- linha em lead_historico_corretores) -- se for, manda pra coluna LEAD NOVO
-- mantendo status='novo' e SEMPRE notifica (abre o popup+SLA de 5min no
-- corretor, mesmo em distribuição de Ações em Massa); senão, mantém o
-- comportamento antigo (rebatida, notifica só se tipo='manual', pra não
-- gerar spam de notificação numa rebatida em massa).
CREATE OR REPLACE FUNCTION public.distribuir_leads_massa(p_lead_ids uuid[], p_corretor_id uuid, p_tipo text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_imobiliaria_id uuid;
  v_coluna_rebatida_id uuid;
  v_coluna_lead_novo_id uuid;
  v_lead_id uuid;
  v_e_novo boolean;
BEGIN
  SELECT imobiliaria_id INTO v_imobiliaria_id FROM perfis WHERE id = p_corretor_id;
  SELECT id INTO v_coluna_rebatida_id FROM colunas_kanban WHERE imobiliaria_id = v_imobiliaria_id AND nome ILIKE '%rebatid%' ORDER BY posicao LIMIT 1;
  SELECT id INTO v_coluna_lead_novo_id FROM colunas_kanban WHERE imobiliaria_id = v_imobiliaria_id AND nome ILIKE '%lead novo%' ORDER BY posicao LIMIT 1;

  FOREACH v_lead_id IN ARRAY p_lead_ids LOOP
    SELECT (l.status = 'novo' AND NOT EXISTS (SELECT 1 FROM lead_historico_corretores h WHERE h.lead_id = l.id))
    INTO v_e_novo FROM leads l WHERE l.id = v_lead_id;

    IF v_e_novo THEN
      UPDATE leads SET
        corretor_id = p_corretor_id, status = 'novo',
        coluna_kanban_id = COALESCE(v_coluna_lead_novo_id, coluna_kanban_id),
        tentativas_contato = 0, ultima_interacao = NOW(), ultima_acao_at = NOW(),
        descartado_em = NULL, descartado_por = NULL, motivo_descarte = NULL,
        lembrete_follow_up = NULL, data_visita = NULL,
        data_atribuicao = NOW(), primeiro_contato_em = NULL
      WHERE id = v_lead_id;
    ELSE
      UPDATE leads SET
        corretor_id = p_corretor_id, status = 'rebatida',
        coluna_kanban_id = COALESCE(v_coluna_rebatida_id, coluna_kanban_id),
        tentativas_contato = 0, ultima_interacao = NOW(),
        descartado_em = NULL, descartado_por = NULL, motivo_descarte = NULL,
        lembrete_follow_up = NULL, data_visita = NULL,
        data_atribuicao = NOW(), primeiro_contato_em = NULL
      WHERE id = v_lead_id;
    END IF;

    INSERT INTO distribuicao_log (lead_id, corretor_id, imobiliaria_id, tipo) VALUES (v_lead_id, p_corretor_id, v_imobiliaria_id, p_tipo);

    IF p_tipo = 'manual' OR v_e_novo THEN
      INSERT INTO notificacoes (usuario_id, imobiliaria_id, lead_id, tipo, titulo, lida)
      SELECT p_corretor_id, l.imobiliaria_id, l.id, 'lead_novo_atribuido',
        'Lead atribuído a você: ' || COALESCE(NULLIF(l.nome, ''), l.telefone, 'Sem nome'), false
      FROM leads l WHERE l.id = v_lead_id;
    END IF;
  END LOOP;

  UPDATE perfis SET ultimo_lead_recebido_em = NOW() WHERE id = p_corretor_id;
END;
$function$;

-- ===== CARD CLIENTE #12: "Devolver" às vezes não tirava o lead do
-- Kanban/Tarefas =====
-- Dois problemas reais em descartar_lead_normal (usada pelo botão DEVOLVER
-- no card, motivos != Descadastrar/Já Comprou):
--  1) Não zerava lembrete_follow_up/data_visita -- inconsistente com todo o
--     resto do sistema (puxar_mais_rebatidas, reativar_lead,
--     distribuir_leads_massa todos zeram esses campos ao tirar o lead do
--     corretor). Um follow-up antigo ficava "fantasma" no lead devolvido.
--  2) A função não conferia quantas linhas o UPDATE afetou -- se por
--     qualquer motivo (ex: corrida com o timer de 5min reatribuindo o lead
--     bem no instante do clique) o UPDATE não encontrasse a linha esperada,
--     a função retornava sucesso do mesmo jeito, e o corretor via o toast
--     de sucesso com o card intacto na tela (mesma classe de bug já
--     corrigida em reativar_lead, 09/08).
CREATE OR REPLACE FUNCTION public.descartar_lead_normal(p_lead_id uuid, p_motivo text, p_observacao text DEFAULT NULL)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_corretor_id uuid;
  v_rows_affected integer;
BEGIN
  SELECT corretor_id INTO v_corretor_id FROM leads WHERE id = p_lead_id;

  IF v_corretor_id IS DISTINCT FROM auth.uid() AND get_auth_role() NOT IN ('dono', 'gerente') THEN
    RAISE EXCEPTION 'Sem permissão para descartar este lead.';
  END IF;

  UPDATE leads SET
    corretor_id = NULL,
    coluna_kanban_id = NULL,
    motivo_descarte = p_motivo,
    descartado_por = auth.uid(),
    descartado_em = NOW(),
    status = 'novo',
    lembrete_follow_up = NULL,
    data_visita = NULL,
    ultima_acao_at = NOW()
  WHERE id = p_lead_id;

  GET DIAGNOSTICS v_rows_affected = ROW_COUNT;
  IF v_rows_affected = 0 THEN
    RAISE EXCEPTION 'Lead não encontrado.';
  END IF;

  INSERT INTO leads_interacoes (lead_id, autor_id, tipo, conteudo)
  VALUES (
    p_lead_id, auth.uid(), 'descarte',
    'Lead devolvido: ' || p_motivo || COALESCE(' - ' || p_observacao, '')
  );
END;
$function$;

-- ===== EQUIPE #9: página demorando pra carregar =====
-- Causa raiz: a tela buscava a tabela leads INTEIRA (paginada de 1000 em
-- 1000) pro navegador só pra calcular contagem/SLA médio por corretor em
-- JS -- com a base na casa de vários milhares de leads (Rebatida sozinha
-- já tinha 7mil+ em agosto), isso baixava megabytes de dados a cada
-- visita/refetch (refetchInterval de 60s). Fix: agregação feita no
-- Postgres (GROUP BY corretor_id), devolve só 1 linha por corretor.
CREATE OR REPLACE FUNCTION public.get_equipe_metricas(p_imobiliaria_id uuid)
 RETURNS TABLE(corretor_id uuid, leads_count integer, sales_count integer, avg_sla_minutos numeric)
 LANGUAGE sql
 STABLE
AS $function$
  SELECT
    l.corretor_id,
    COUNT(*)::integer AS leads_count,
    COUNT(*) FILTER (WHERE l.status = 'venda_concluida')::integer AS sales_count,
    AVG(EXTRACT(EPOCH FROM (l.primeiro_contato_em - l.created_at)) / 60) FILTER (WHERE l.primeiro_contato_em IS NOT NULL) AS avg_sla_minutos
  FROM leads l
  WHERE l.imobiliaria_id = p_imobiliaria_id AND l.corretor_id IS NOT NULL
  GROUP BY l.corretor_id;
$function$;

-- ===== CARD CLIENTE #15: lembrete pro corretor mandar mensagem 30 dias
-- após a venda =====
-- Pedido do dono: NÃO é envio automático (a mensagem pede avaliação/
-- indicação, precisa ser o corretor mandando de próprio punho) -- é um
-- LEMBRETE (notificação, mesmo mecanismo já usado por
-- notificar_leads_analise_credito) com o texto pronto pro corretor copiar
-- e mandar no chat do WhatsApp do CRM.
ALTER TABLE leads ADD COLUMN IF NOT EXISTS lembrete_pos_venda_enviado_em timestamptz;

CREATE OR REPLACE FUNCTION public.notificar_pos_venda_30_dias()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_lead RECORD;
  v_mensagem text;
BEGIN
  FOR v_lead IN
    SELECT id, imobiliaria_id, corretor_id, nome
    FROM leads
    WHERE status = 'venda_concluida'
      AND corretor_id IS NOT NULL
      AND lembrete_pos_venda_enviado_em IS NULL
      AND data_fechamento IS NOT NULL
      AND data_fechamento <= NOW() - interval '30 days'
      AND data_fechamento > NOW() - interval '31 days'
  LOOP
    v_mensagem := format(
      'Oi, %s, tudo bem?' || E'\n\n' ||
      'Faz 30 dias que realizou seu sonho da compra do seu apartamento! Passando para saber se ficou alguma dúvida sobre o processo e se você gostou do meu atendimento.' || E'\n\n' ||
      'Se deu tudo certo e você gostou do suporte, poderia me dar uma ajuda deixando uma avaliação, é muito importante para meu trabalho? É bem rapidinho.' || E'\n\n' ||
      'E se souber de alguém que também esteja procurando imóvel e puder me indicar agradeço imensamente e lembrando que ganha uma bonificação por indicação que comprar!',
      COALESCE(NULLIF(split_part(v_lead.nome, ' ', 1), ''), 'tudo bem')
    );

    INSERT INTO notificacoes (usuario_id, imobiliaria_id, lead_id, tipo, titulo, mensagem, lida)
    VALUES (
      v_lead.corretor_id, v_lead.imobiliaria_id, v_lead.id, 'pos_venda_30_dias',
      'Lembrete: mande a mensagem de pós-venda pra ' || COALESCE(NULLIF(v_lead.nome, ''), 'este cliente'),
      v_mensagem, false
    );

    UPDATE leads SET lembrete_pos_venda_enviado_em = NOW() WHERE id = v_lead.id;
  END LOOP;
END;
$function$;

SELECT cron.schedule('notificar-pos-venda-30-dias', '0 13 * * *', 'SELECT public.notificar_pos_venda_30_dias()');

-- ===== CARD CLIENTE #16: lembrete pro corretor mandar ÁUDIO de aniversário
-- =====
-- O CRM não tinha campo de data de nascimento em lugar nenhum (não vem de
-- Facebook/WhatsApp) -- dono confirmou (17/08) que o corretor preenche
-- manualmente no card quando souber (campo novo em Bloco 1, ver
-- LeadDetailsModal.tsx). O lembrete só dispara pra quem tiver o campo
-- preenchido; dedupe por ANO (não por dia, pra não reenviar se o cron
-- rodar mais de uma vez no mesmo dia por qualquer motivo).
ALTER TABLE leads ADD COLUMN IF NOT EXISTS data_nascimento date;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS lembrete_aniversario_ano_enviado integer;

CREATE OR REPLACE FUNCTION public.notificar_aniversario_hoje()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_lead RECORD;
  v_hoje date;
  v_ano_atual integer;
BEGIN
  v_hoje := (NOW() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_ano_atual := EXTRACT(YEAR FROM v_hoje);

  FOR v_lead IN
    SELECT id, imobiliaria_id, corretor_id, nome
    FROM leads
    WHERE corretor_id IS NOT NULL
      AND data_nascimento IS NOT NULL
      AND EXTRACT(MONTH FROM data_nascimento) = EXTRACT(MONTH FROM v_hoje)
      AND EXTRACT(DAY FROM data_nascimento) = EXTRACT(DAY FROM v_hoje)
      AND COALESCE(lembrete_aniversario_ano_enviado, 0) < v_ano_atual
  LOOP
    INSERT INTO notificacoes (usuario_id, imobiliaria_id, lead_id, tipo, titulo, mensagem, lida)
    VALUES (
      v_lead.corretor_id, v_lead.imobiliaria_id, v_lead.id, 'aniversario_cliente',
      'Hoje é aniversário de ' || COALESCE(NULLIF(v_lead.nome, ''), 'um cliente seu') || '! 🎂',
      'Manda um ÁUDIO parabenizando ' || COALESCE(NULLIF(split_part(v_lead.nome, ' ', 1), ''), 'o cliente') || ' pelo aniversário.',
      false
    );

    UPDATE leads SET lembrete_aniversario_ano_enviado = v_ano_atual WHERE id = v_lead.id;
  END LOOP;
END;
$function$;

SELECT cron.schedule('notificar-aniversario-cliente', '0 12 * * *', 'SELECT public.notificar_aniversario_hoje()');

-- ===== TAREFAS #19: lead que comprou continuava em "Tarefa Atrasada" =====
-- handleFechamento/aprovarMutation (front) nunca limpavam lembrete_follow_up
-- /data_visita ao vender -- corrigido no front pra vendas futuras (ver
-- AprovacoesVendaDialog.tsx). Este backfill limpa quem já foi vendido antes
-- do fix e ficou "preso" em Tarefas.
UPDATE leads
SET lembrete_follow_up = NULL, data_visita = NULL
WHERE status = 'venda_concluida'
  AND (lembrete_follow_up IS NOT NULL OR data_visita IS NOT NULL);
