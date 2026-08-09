-- Bug real reportado (09/08): dono seguia dizendo "nao chega lead do Facebook"
-- mesmo com o n8n rodando sem erro nenhum. Investigando execucao por execucao
-- (07-09/08), achado: cerca de 1 em cada 7 webhooks do Facebook sao REENVIOS
-- de leads antigos (de meses atras -- achados casos de ate 10 meses) do mesmo
-- anuncio/formulario, nao leads novos de verdade. check_lead_duplicado() ja
-- tratava isso certo (nao duplicava, so atualizava o registro existente) --
-- mas SEM disparar nenhuma notificacao, porque o UPDATE nao passa pelo INSERT
-- que trg_notificar_novo_lead escuta. Resultado: o lead reaparecia sem
-- ninguem ser avisado, e como o created_at continua sendo o antigo, ele nunca
-- aparecia em filtro nenhum de "leads recentes" -- ficava efetivamente
-- invisivel, mesmo tendo corretor_id NULL em varios dos casos.
--
-- Fix: mesma logica, mas agora insere em notificacoes nos dois caminhos:
-- se achou corretor pra roleta, usa o MESMO tipo 'lead_novo_atribuido' que
-- ja dispara o popup+som+notificacao do navegador (LeadNovoAlertProvider,
-- sessao 06/08); se nao achou (caiu em rebatida sem dono), avisa dono/gerente
-- com tipo 'possivel_duplicidade' pra saberem que precisa puxar manualmente.
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
BEGIN
  IF NEW.telefone IS NULL OR NEW.telefone = '' THEN RETURN NEW; END IF;
  SELECT l.id, l.corretor_id, l.origem, l.created_at, l.nome, l.telefone
    INTO v_lead_id, v_corretor_id, v_origem_antiga, v_created_antiga, v_nome_antigo, v_telefone_antigo
  FROM leads l JOIN buscar_lead_por_telefone(NEW.telefone) b ON b.id = l.id
  WHERE l.imobiliaria_id = NEW.imobiliaria_id ORDER BY l.created_at DESC LIMIT 1;
  IF v_lead_id IS NULL THEN RETURN NEW; END IF;
  IF v_corretor_id IS NOT NULL THEN RETURN NEW; END IF;

  SELECT id INTO v_coluna_lead_novo FROM colunas_kanban WHERE imobiliaria_id = NEW.imobiliaria_id AND nome ILIKE '%lead novo%' ORDER BY posicao LIMIT 1;
  SELECT id INTO v_autor_sistema FROM perfis WHERE imobiliaria_id = NEW.imobiliaria_id AND role = 'dono' ORDER BY created_at LIMIT 1;
  IF v_autor_sistema IS NOT NULL THEN
    INSERT INTO leads_interacoes (id, lead_id, autor_id, tipo, conteudo)
    VALUES (gen_random_uuid(), v_lead_id, v_autor_sistema, 'novo_cadastro_campanha', format('Novo cadastro em campanha: %s (%s). Cadastro original: %s em %s.', COALESCE(NEW.origem, 'Site'), to_char(NOW(), 'DD/MM/YYYY HH24:MI'), COALESCE(v_origem_antiga, 'Site'), to_char(v_created_antiga, 'DD/MM/YYYY HH24:MI')));
  END IF;

  SELECT corretor_id INTO v_novo_corretor FROM get_next_corretor_rodizio(NEW.imobiliaria_id);
  IF v_novo_corretor IS NOT NULL THEN
    UPDATE leads SET status = 'novo', coluna_kanban_id = COALESCE(v_coluna_lead_novo, coluna_kanban_id), ultima_acao_at = NOW(), origem = NEW.origem, corretor_id = v_novo_corretor, data_atribuicao = NOW(), primeiro_contato_em = NULL WHERE id = v_lead_id;
    INSERT INTO notificacoes (usuario_id, imobiliaria_id, lead_id, tipo, titulo, lida)
    VALUES (v_novo_corretor, NEW.imobiliaria_id, v_lead_id, 'lead_novo_atribuido',
      'Lead reativado (novo contato via campanha): ' || COALESCE(NULLIF(v_nome_antigo, ''), v_telefone_antigo, 'Sem nome'), false);
  ELSE
    SELECT id INTO v_coluna_rebatida FROM colunas_kanban WHERE imobiliaria_id = NEW.imobiliaria_id AND nome ILIKE '%rebatid%' ORDER BY posicao LIMIT 1;
    UPDATE leads SET status = 'rebatida', coluna_kanban_id = COALESCE(v_coluna_rebatida, coluna_kanban_id), ultima_acao_at = NOW(), origem = NEW.origem WHERE id = v_lead_id;
    INSERT INTO notificacoes (usuario_id, imobiliaria_id, lead_id, tipo, titulo, lida)
    SELECT p.id, NEW.imobiliaria_id, v_lead_id, 'possivel_duplicidade',
      'Lead antigo teve novo contato via campanha (sem corretor disponível): ' || COALESCE(NULLIF(v_nome_antigo, ''), v_telefone_antigo, 'Sem nome'), false
    FROM perfis p WHERE p.imobiliaria_id = NEW.imobiliaria_id AND p.role IN ('gerente', 'dono');
  END IF;
  RETURN NULL;
END;
$function$;
