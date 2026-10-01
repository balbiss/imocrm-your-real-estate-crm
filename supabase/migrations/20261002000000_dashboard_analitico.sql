-- Dashboard analítico (pedido do dono, 01/10: "mais detalhes das métricas,
-- como se fosse um analista"). Uma função só, SOMENTE LEITURA, que devolve
-- tudo pronto pro Dashboard: resumo, funil, corretores, campanhas,
-- follow-up, motivos de devolução e alertas por regra (sem IA).
--
-- Período = datas do filtro do Dashboard (inclusivo), fuso de São Paulo.
-- Funil e campanhas usam a "safra": leads que ENTRARAM no período, e seguem
-- até onde cada um chegou (mesmo que a etapa tenha acontecido depois).
-- Corretores/follow-up/devoluções contam o que ACONTECEU no período.
-- Só dono/gerente.

CREATE OR REPLACE FUNCTION public.get_dashboard_analitico(p_inicio date, p_fim date)
 RETURNS jsonb
 LANGUAGE plpgsql
 VOLATILE SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '30s'
AS $function$
DECLARE
  v_imob uuid := get_auth_imobiliaria_id();
  v_ini  timestamptz := (p_inicio::timestamp) AT TIME ZONE 'America/Sao_Paulo';
  v_fim  timestamptz := ((p_fim + 1)::timestamp) AT TIME ZONE 'America/Sao_Paulo';
  v_hoje timestamptz := date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo';
  v_col_fu uuid;
  v_resumo jsonb; v_funil jsonb; v_corretores jsonb; v_campanhas jsonb;
  v_followup jsonb; v_motivos jsonb; v_alertas jsonb := '[]'::jsonb;
BEGIN
  IF v_imob IS NULL OR get_auth_role() NOT IN ('dono', 'gerente') THEN
    RAISE EXCEPTION 'Sem permissão.';
  END IF;

  SELECT id INTO v_col_fu FROM colunas_kanban WHERE imobiliaria_id = v_imob AND nome = 'FOLLOW-UP AUTOMÁTICO' LIMIT 1;

  -- ===================== SAFRA (funil + campanhas) =====================
  CREATE TEMP TABLE IF NOT EXISTS _safra (
    id uuid, origem text, corretor_id uuid, inicio timestamptz,
    com_corretor bool, contatado bool, respondeu bool, agendou bool, visitou bool,
    documentacao bool, aprovado bool, vendeu bool, valor_venda numeric,
    primeiro_contato_min numeric, motivo_descarte text
  ) ON COMMIT DROP;
  TRUNCATE _safra;

  INSERT INTO _safra
  SELECT l.id, COALESCE(NULLIF(btrim(l.origem), ''), 'Sem origem'), l.corretor_id, x.inicio,
    (l.corretor_id IS NOT NULL OR l.descartado_por IS NOT NULL OR x.inicio_hist IS NOT NULL),
    EXISTS (SELECT 1 FROM mensagens_whatsapp m WHERE m.lead_id = l.id AND m.direcao = 'outbound'),
    EXISTS (SELECT 1 FROM mensagens_whatsapp m WHERE m.lead_id = l.id AND m.direcao = 'inbound'),
    (l.data_visita IS NOT NULL OR l.status::text IN ('agendado', 'visitou')
      OR EXISTS (SELECT 1 FROM leads_interacoes i WHERE i.lead_id = l.id
                 AND (i.conteudo LIKE 'Moveu o card para a coluna "AGENDADO"%' OR i.conteudo LIKE 'Moveu o card para a coluna "FID"%'
                      OR i.conteudo LIKE 'Moveu o card para a coluna "VISITOU"%' OR i.conteudo LIKE 'Data da visita alterado%'))),
    (l.status_visita = 'REALIZADA' OR l.status::text = 'visitou'
      OR EXISTS (SELECT 1 FROM leads_interacoes i WHERE i.lead_id = l.id AND i.conteudo LIKE 'Moveu o card para a coluna "VISITOU"%')),
    (l.credito_aprovado_em IS NOT NULL OR l.status::text IN ('cobrar_doc', 'pendente', 'aprovado', 'reprovado', 'venda_concluida')
      OR EXISTS (SELECT 1 FROM leads_interacoes i WHERE i.lead_id = l.id
                 AND (i.conteudo LIKE 'Moveu o card para a coluna "COBRAR DOC"%' OR i.conteudo LIKE 'Moveu o card para a coluna "PENDENTE"%'
                      OR i.conteudo LIKE 'Moveu o card para a coluna "ANÁLISE DE CRÉDITO"%' OR i.conteudo LIKE 'Moveu o card para a coluna "APROVADO"%'
                      OR i.conteudo LIKE 'Moveu o card para a coluna "REPROVADO"%'))),
    (l.credito_aprovado_em IS NOT NULL OR l.status::text IN ('aprovado', 'venda_concluida')
      OR EXISTS (SELECT 1 FROM leads_interacoes i WHERE i.lead_id = l.id AND i.conteudo LIKE 'Moveu o card para a coluna "APROVADO"%')),
    (l.status::text = 'venda_concluida' OR l.data_fechamento IS NOT NULL),
    l.valor_venda,
    (SELECT EXTRACT(EPOCH FROM (min(m.created_at) - x.inicio)) / 60
       FROM mensagens_whatsapp m WHERE m.lead_id = l.id AND m.direcao = 'outbound' AND m.created_at >= x.inicio),
    l.motivo_descarte
  FROM leads l
  CROSS JOIN LATERAL (
    SELECT h.inicio_hist,
           GREATEST(l.created_at, COALESCE(h.inicio_hist, l.data_atribuicao, l.created_at)) AS inicio
    FROM (SELECT min(h2.atribuido_em) AS inicio_hist FROM lead_historico_corretores h2
          WHERE h2.lead_id = l.id AND h2.atribuido_em >= l.created_at) h
  ) x
  WHERE l.imobiliaria_id = v_imob AND l.created_at >= v_ini AND l.created_at < v_fim;

  SELECT jsonb_build_object(
    'entraram', count(*),
    'recadastros', (SELECT count(*) FROM leads WHERE imobiliaria_id = v_imob AND recadastro_em >= v_ini AND recadastro_em < v_fim),
    'com_corretor', count(*) FILTER (WHERE com_corretor),
    'contatados', count(*) FILTER (WHERE contatado),
    'responderam', count(*) FILTER (WHERE respondeu),
    'agendaram', count(*) FILTER (WHERE agendou),
    'visitaram', count(*) FILTER (WHERE visitou),
    'documentacao', count(*) FILTER (WHERE documentacao),
    'aprovados', count(*) FILTER (WHERE aprovado),
    'vendas_safra', count(*) FILTER (WHERE vendeu),
    'primeiro_contato_mediana_min', round((percentile_cont(0.5) WITHIN GROUP (ORDER BY primeiro_contato_min))::numeric, 1),
    'pct_contato_5min', round(100.0 * count(*) FILTER (WHERE primeiro_contato_min <= 5) / NULLIF(count(*) FILTER (WHERE com_corretor), 0)),
    'vendas_fechadas', (SELECT count(*) FROM leads WHERE imobiliaria_id = v_imob AND data_fechamento >= v_ini AND data_fechamento < v_fim),
    'valor_vendido', (SELECT COALESCE(sum(valor_venda), 0) FROM leads WHERE imobiliaria_id = v_imob AND data_fechamento >= v_ini AND data_fechamento < v_fim),
    'devolvidos', (SELECT count(*) FROM descartes_leads d JOIN perfis p ON p.id = d.usuario_id WHERE p.imobiliaria_id = v_imob AND d.created_at >= v_ini AND d.created_at < v_fim),
    'em_aberto_agora', (SELECT count(*) FROM leads l WHERE l.imobiliaria_id = v_imob AND l.corretor_id IS NOT NULL AND l.descartado_em IS NULL
                          AND l.data_fechamento IS NULL AND l.status::text NOT IN ('venda_concluida', 'desqualificado')),
    'sem_corretor_agora', (SELECT count(*) FROM leads l WHERE l.imobiliaria_id = v_imob AND l.corretor_id IS NULL AND l.descartado_em IS NULL
                             AND l.status::text <> 'desqualificado' AND l.created_at >= v_ini AND l.created_at < v_fim)
  ) INTO v_resumo FROM _safra;

  SELECT jsonb_agg(jsonb_build_object('etapa', e.etapa, 'qtd', e.qtd) ORDER BY e.ordem) INTO v_funil
  FROM (
    SELECT 1 ordem, 'Entraram' etapa, count(*) qtd FROM _safra
    UNION ALL SELECT 2, 'Receberam corretor', count(*) FILTER (WHERE com_corretor) FROM _safra
    UNION ALL SELECT 3, 'Receberam mensagem', count(*) FILTER (WHERE contatado) FROM _safra
    UNION ALL SELECT 4, 'Responderam', count(*) FILTER (WHERE respondeu) FROM _safra
    UNION ALL SELECT 5, 'Documentação / crédito', count(*) FILTER (WHERE documentacao) FROM _safra
    UNION ALL SELECT 6, 'Crédito aprovado', count(*) FILTER (WHERE aprovado) FROM _safra
    UNION ALL SELECT 7, 'Agendaram visita', count(*) FILTER (WHERE agendou) FROM _safra
    UNION ALL SELECT 8, 'Visitaram', count(*) FILTER (WHERE visitou) FROM _safra
    UNION ALL SELECT 9, 'Venda', count(*) FILTER (WHERE vendeu) FROM _safra
  ) e;

  -- ===================== CAMPANHAS (safra por origem) =====================
  SELECT COALESCE(jsonb_agg(c ORDER BY (c->>'leads')::int DESC), '[]'::jsonb) INTO v_campanhas
  FROM (
    SELECT jsonb_build_object(
      'origem', s.origem,
      'leads', count(*),
      'responderam', count(*) FILTER (WHERE s.respondeu),
      'agendaram', count(*) FILTER (WHERE s.agendou),
      'documentacao', count(*) FILTER (WHERE s.documentacao),
      'vendas', count(*) FILTER (WHERE s.vendeu),
      'numero_errado', count(*) FILTER (WHERE s.motivo_descarte ILIKE '%Número Errado%' OR s.motivo_descarte ILIKE '%Contato Errado%'),
      'renda_baixa', count(*) FILTER (WHERE s.motivo_descarte ILIKE '%Renda Baixa%'),
      'outra_regiao', count(*) FILTER (WHERE s.motivo_descarte ILIKE '%Outra Região%'),
      'sem_resposta', count(*) FILTER (WHERE s.motivo_descarte IN ('Sem Resposta', 'Parou de Responder')),
      'gasto', (SELECT sum(g.valor) FROM gastos_campanha g WHERE g.imobiliaria_id = v_imob AND g.origem = s.origem
                AND g.mes BETWEEN to_char(p_inicio, 'YYYY-MM') AND to_char(p_fim, 'YYYY-MM'))
    ) c
    FROM _safra s GROUP BY s.origem
  ) z;

  -- ===================== CORRETORES (o que aconteceu no período) =====================
  WITH ativos AS (
    SELECT p.id, p.nome FROM perfis p
    WHERE p.imobiliaria_id = v_imob AND p.removido_em IS NULL AND COALESCE(p.bloqueado, false) = false
  ),
  recebidos AS (
    SELECT corretor_id, count(DISTINCT lead_id) n FROM (
      SELECT h.corretor_id, h.lead_id FROM lead_historico_corretores h JOIN leads l ON l.id = h.lead_id
        WHERE l.imobiliaria_id = v_imob AND h.atribuido_em >= v_ini AND h.atribuido_em < v_fim
      UNION ALL
      SELECT l.corretor_id, l.id FROM leads l
        WHERE l.imobiliaria_id = v_imob AND l.corretor_id IS NOT NULL AND l.data_atribuicao >= v_ini AND l.data_atribuicao < v_fim
      UNION ALL
      SELECT d.corretor_id, d.lead_id FROM distribuicao_log d
        WHERE d.imobiliaria_id = v_imob AND d.created_at >= v_ini AND d.created_at < v_fim
    ) u GROUP BY corretor_id
  ),
  devolvidos AS (
    SELECT d.usuario_id corretor_id, count(*) n,

           mode() WITHIN GROUP (ORDER BY d.motivo) AS motivo_top
    FROM descartes_leads d WHERE d.created_at >= v_ini AND d.created_at < v_fim GROUP BY d.usuario_id
  ),
  msgs AS (
    SELECT m.corretor_id,
           count(*) FILTER (WHERE m.direcao = 'outbound' AND m.canal IS DISTINCT FROM 'followup') enviadas,
           count(DISTINCT m.lead_id) FILTER (WHERE m.direcao = 'inbound') leads_conversaram
    FROM mensagens_whatsapp m
    WHERE m.imobiliaria_id = v_imob AND m.created_at >= v_ini AND m.created_at < v_fim
    GROUP BY m.corretor_id
  ),
  seq AS (
    SELECT m.corretor_id, m.lead_id, m.created_at, m.direcao, m.canal,
           lag(m.direcao) OVER (PARTITION BY m.lead_id ORDER BY m.created_at) dir_anterior
    FROM mensagens_whatsapp m
    WHERE m.imobiliaria_id = v_imob AND m.created_at >= v_ini AND m.created_at < v_fim
  ),
  respostas AS (
    SELECT s.corretor_id,
           percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (r.created_at - s.created_at)) / 60) mediana_min
    FROM seq s
    CROSS JOIN LATERAL (
      SELECT m2.created_at FROM mensagens_whatsapp m2
      WHERE m2.lead_id = s.lead_id AND m2.direcao = 'outbound' AND m2.canal IS DISTINCT FROM 'followup' AND m2.created_at > s.created_at
      ORDER BY m2.created_at LIMIT 1
    ) r
    WHERE s.direcao = 'inbound' AND s.dir_anterior IS DISTINCT FROM 'inbound'
      AND r.created_at < s.created_at + interval '2 days'
    GROUP BY s.corretor_id
  ),
  visitas AS (
    SELECT l.corretor_id,
           count(*) FILTER (WHERE l.data_visita >= v_ini AND l.data_visita < v_fim) marcadas,
           count(*) FILTER (WHERE l.data_visita >= v_ini AND l.data_visita < v_fim AND l.status_visita = 'REALIZADA') realizadas,
           count(*) FILTER (WHERE l.data_fechamento >= v_ini AND l.data_fechamento < v_fim) vendas
    FROM leads l WHERE l.imobiliaria_id = v_imob AND l.corretor_id IS NOT NULL GROUP BY l.corretor_id
  ),
  agora AS (
    SELECT l.corretor_id,
           count(*) FILTER (WHERE l.lembrete_follow_up < v_hoje AND l.coluna_kanban_id IS DISTINCT FROM v_col_fu) atrasadas,
           count(*) FILTER (WHERE l.ultima_acao_at < now() - interval '3 days' AND l.coluna_kanban_id IS DISTINCT FROM v_col_fu
                            AND COALESCE(l.lembrete_follow_up, now()) <= now()) parados,
           count(*) carteira
    FROM leads l
    WHERE l.imobiliaria_id = v_imob AND l.corretor_id IS NOT NULL AND l.descartado_em IS NULL AND l.data_fechamento IS NULL
      AND l.status::text NOT IN ('venda_concluida', 'desqualificado', 'futuros')
    GROUP BY l.corretor_id
  ),
  fu AS (
    SELECT corretor_id, count(*) n FROM followup_execucoes WHERE imobiliaria_id = v_imob AND status = 'ativo' GROUP BY corretor_id
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', a.id, 'nome', a.nome,
      'recebidos', COALESCE(r.n, 0),
      'devolvidos', COALESCE(d.n, 0),
      'motivo_top', d.motivo_top,
      'mensagens_enviadas', COALESCE(m.enviadas, 0),
      'leads_conversaram', COALESCE(m.leads_conversaram, 0),
      'tempo_resposta_min', round(rp.mediana_min::numeric, 1),
      'visitas_marcadas', COALESCE(v.marcadas, 0),
      'visitas_realizadas', COALESCE(v.realizadas, 0),
      'vendas', COALESCE(v.vendas, 0),
      'carteira', COALESCE(g.carteira, 0),
      'atrasadas', COALESCE(g.atrasadas, 0),
      'parados', COALESCE(g.parados, 0),
      'em_followup', COALESCE(f.n, 0),
      'whatsapp_conectado', COALESCE((SELECT w.connected FROM whatsapp_instances w WHERE w.user_id = a.id LIMIT 1), false)
    ) ORDER BY COALESCE(r.n, 0) DESC, a.nome), '[]'::jsonb)
  INTO v_corretores
  FROM ativos a
  LEFT JOIN recebidos r ON r.corretor_id = a.id
  LEFT JOIN devolvidos d ON d.corretor_id = a.id
  LEFT JOIN msgs m ON m.corretor_id = a.id
  LEFT JOIN respostas rp ON rp.corretor_id = a.id
  LEFT JOIN visitas v ON v.corretor_id = a.id
  LEFT JOIN agora g ON g.corretor_id = a.id
  LEFT JOIN fu f ON f.corretor_id = a.id
  WHERE COALESCE(r.n, 0) + COALESCE(d.n, 0) + COALESCE(m.enviadas, 0) + COALESCE(g.carteira, 0) + COALESCE(v.vendas, 0) > 0;

  -- ===================== FOLLOW-UP AUTOMÁTICO =====================
  SELECT jsonb_build_object(
    'iniciados', count(*),
    'respondeu', count(*) FILTER (WHERE e.status = 'respondeu'),
    'corretor_assumiu', count(*) FILTER (WHERE e.status = 'pausado_corretor'),
    'descartados', count(*) FILTER (WHERE e.motivo_parada LIKE 'esgotado%descartado%'),
    'concluidos_sem_resposta', count(*) FILTER (WHERE e.status = 'concluido' AND e.motivo_parada NOT LIKE 'esgotado%'),
    'erros', count(*) FILTER (WHERE e.status = 'erro'),
    'rodando', count(*) FILTER (WHERE e.status = 'ativo'),
    'mensagens', (SELECT count(*) FROM followup_envios ev JOIN followup_execucoes e2 ON e2.id = ev.execucao_id
                  WHERE e2.imobiliaria_id = v_imob AND ev.enviado_em >= v_ini AND ev.enviado_em < v_fim),
    'por_passo', (SELECT COALESCE(jsonb_agg(jsonb_build_object('passo', z.passo_ordem, 'enviados', z.enviados, 'responderam', z.resp) ORDER BY z.passo_ordem), '[]'::jsonb)
                  FROM (SELECT ev.passo_ordem, count(*) enviados, count(*) FILTER (WHERE ev.respondeu_apos) resp
                        FROM followup_envios ev JOIN followup_execucoes e2 ON e2.id = ev.execucao_id
                        WHERE e2.imobiliaria_id = v_imob AND ev.enviado_em >= v_ini AND ev.enviado_em < v_fim
                        GROUP BY ev.passo_ordem) z)
  ) INTO v_followup
  FROM followup_execucoes e
  WHERE e.imobiliaria_id = v_imob AND e.inscrito_em >= v_ini AND e.inscrito_em < v_fim;

  -- ===================== MOTIVOS DE DEVOLUÇÃO =====================
  SELECT COALESCE(jsonb_agg(jsonb_build_object('motivo', z.motivo, 'qtd', z.n) ORDER BY z.n DESC), '[]'::jsonb) INTO v_motivos
  FROM (
    SELECT d.motivo, count(*) n FROM descartes_leads d JOIN perfis p ON p.id = d.usuario_id
    WHERE p.imobiliaria_id = v_imob AND d.created_at >= v_ini AND d.created_at < v_fim GROUP BY d.motivo
    UNION ALL
    SELECT 'Sem Resposta (follow-up automático)', count(*) FROM followup_execucoes e
    WHERE e.imobiliaria_id = v_imob AND e.finalizado_em >= v_ini AND e.finalizado_em < v_fim AND e.motivo_parada LIKE 'esgotado%descartado%'
    HAVING count(*) > 0
  ) z;

  -- ===================== ALERTAS (regras fixas, foto de agora) =====================
  -- 1) WhatsApp desconectado com leads na carteira
  v_alertas := v_alertas || COALESCE((
    SELECT jsonb_agg(jsonb_build_object('nivel', 'alto', 'texto',
      c->>'nome' || ' está com o WhatsApp desconectado do CRM e tem ' || (c->>'carteira') || ' lead(s) na carteira — mensagens e follow-up dele(a) não estão saindo.'))
    FROM jsonb_array_elements(v_corretores) c
    WHERE (c->>'whatsapp_conectado')::bool = false AND (c->>'carteira')::int > 0), '[]'::jsonb);

  -- 2) Devolução hoje bem acima da média dos últimos 14 dias
  v_alertas := v_alertas || COALESCE((
    SELECT jsonb_agg(jsonb_build_object('nivel', 'alto', 'texto',
      p.nome || ' devolveu ' || h.hoje || ' leads hoje — a média dele(a) é ' || round(h.media, 1) || ' por dia.'))
    FROM (
      SELECT d.usuario_id,
             count(*) FILTER (WHERE d.created_at >= v_hoje) hoje,
             count(*) FILTER (WHERE d.created_at < v_hoje AND d.created_at >= v_hoje - interval '14 days') / 14.0 media
      FROM descartes_leads d WHERE d.created_at >= v_hoje - interval '14 days' GROUP BY d.usuario_id
    ) h JOIN perfis p ON p.id = h.usuario_id
    WHERE p.imobiliaria_id = v_imob AND h.hoje >= 10 AND h.hoje > 2 * GREATEST(h.media, 1)), '[]'::jsonb);

  -- 3) Muitas tarefas atrasadas
  v_alertas := v_alertas || COALESCE((
    SELECT jsonb_agg(jsonb_build_object('nivel', 'medio', 'texto',
      c->>'nome' || ' tem ' || (c->>'atrasadas') || ' tarefas atrasadas.'))
    FROM jsonb_array_elements(v_corretores) c WHERE (c->>'atrasadas')::int >= 20), '[]'::jsonb);

  -- 4) Lead que entrou hoje e ninguém mandou mensagem ainda (mais de 30 min)
  v_alertas := v_alertas || COALESCE((
    SELECT jsonb_build_array(jsonb_build_object('nivel', 'alto', 'texto',
      count(*) || ' lead(s) que entraram hoje ainda não receberam nenhuma mensagem (mais de 30 minutos).'))
    FROM leads l
    WHERE l.imobiliaria_id = v_imob AND l.created_at >= v_hoje AND l.created_at < now() - interval '30 minutes'
      AND l.corretor_id IS NOT NULL AND l.descartado_em IS NULL
      AND NOT EXISTS (SELECT 1 FROM mensagens_whatsapp m WHERE m.lead_id = l.id AND m.direcao = 'outbound')
    HAVING count(*) > 0), '[]'::jsonb);

  -- 5) Leads de hoje parados sem corretor
  v_alertas := v_alertas || COALESCE((
    SELECT jsonb_build_array(jsonb_build_object('nivel', 'medio', 'texto',
      count(*) || ' lead(s) que entraram hoje estão sem corretor (na Rebatida).'))
    FROM leads l
    WHERE l.imobiliaria_id = v_imob AND l.created_at >= v_hoje AND l.corretor_id IS NULL AND l.descartado_em IS NULL
      AND l.status::text <> 'desqualificado'
    HAVING count(*) > 0), '[]'::jsonb);

  -- 6) Campanha com volume e qualidade ruim no período
  v_alertas := v_alertas || COALESCE((
    SELECT jsonb_agg(jsonb_build_object('nivel', 'medio', 'texto', t))
    FROM (
      SELECT 'Campanha ' || (c->>'origem') || ': ' || (c->>'leads') || ' leads no período e nenhum respondeu.' t
      FROM jsonb_array_elements(v_campanhas) c
      WHERE (c->>'leads')::int >= 5 AND (c->>'responderam')::int = 0
      UNION ALL
      SELECT 'Campanha ' || (c->>'origem') || ': ' ||
             round(100.0 * ((c->>'numero_errado')::int + (c->>'renda_baixa')::int + (c->>'outra_regiao')::int) / (c->>'leads')::int) ||
             '% dos leads descartados por número errado, renda baixa ou outra região.'
      FROM jsonb_array_elements(v_campanhas) c
      WHERE (c->>'leads')::int >= 10
        AND ((c->>'numero_errado')::int + (c->>'renda_baixa')::int + (c->>'outra_regiao')::int) * 100 >= 30 * (c->>'leads')::int
    ) z), '[]'::jsonb);

  -- 7) Follow-up travado por erro de envio nos últimos 7 dias
  v_alertas := v_alertas || COALESCE((
    SELECT jsonb_build_array(jsonb_build_object('nivel', 'medio', 'texto',
      count(*) || ' follow-up(s) automático(s) travaram por erro de envio nos últimos 7 dias — esses leads precisam de contato manual.'))
    FROM followup_execucoes e WHERE e.imobiliaria_id = v_imob AND e.status = 'erro' AND e.finalizado_em > now() - interval '7 days'
    HAVING count(*) > 0), '[]'::jsonb);

  RETURN jsonb_build_object(
    'periodo', jsonb_build_object('inicio', p_inicio, 'fim', p_fim),
    'resumo', v_resumo,
    'funil', COALESCE(v_funil, '[]'::jsonb),
    'corretores', v_corretores,
    'campanhas', v_campanhas,
    'followup', v_followup,
    'motivos', v_motivos,
    'alertas', v_alertas
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_dashboard_analitico(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_dashboard_analitico(date, date) TO authenticated;
