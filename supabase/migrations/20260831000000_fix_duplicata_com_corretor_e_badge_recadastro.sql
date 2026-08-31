-- Bug real reportado pelo dono (grupo do WhatsApp, ~30/08):
-- "Ela se cadastrou duas vezes mas criou dois cards, isso nao pode acontecer"
-- + "@Ballbis isso tem que ajustar. Lead se cadastrou em janeiro e voltou a
--    se cadastrar hoje. So que ela estava parada em rebatida sem corretor.
--    Quando lead se cadastra pela 2a vez E estiver com algum corretor, mantem
--    nele mas mostra que se cadastrou novamente."
--
-- Causa raiz: check_lead_duplicado() (trigger BEFORE INSERT em leads) so
-- bloqueava a duplicata quando o lead existente NAO tinha corretor. Se o lead
-- ja estava com alguem, o trigger fazia `RETURN NEW` -> criava um segundo
-- card. Resultado: varios contatos com 2-3 cards ativos, as vezes com 2
-- corretores diferentes atendendo a mesma pessoa (confirmado no banco: 7
-- telefones com card duplicado ativo).
--
-- Fix:
--  1. check_lead_duplicado NUNCA MAIS cria card duplicado. Se ja existe lead
--     com o mesmo telefone (com ou sem corretor), o INSERT novo e' descartado
--     (RETURN NULL) e o lead existente e' atualizado.
--  2. Com corretor: mantem no corretor, registra o re-cadastro no historico e
--     notifica o corretor (sinal de compra forte -- preencheu form de novo).
--  3. Sem corretor: comportamento de antes (roleta / rebatida + aviso gestao).
--  4. Campos novos leads.recadastro_em / recadastro_origem alimentam o badge
--     "SEGUNDO CADASTRO" no card (ver LeadDetailsModal.tsx). A origem ORIGINAL
--     da campanha para de ser sobrescrita -- a nova vai pro recadastro_origem.

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS recadastro_em timestamptz,
  ADD COLUMN IF NOT EXISTS recadastro_origem text;

-- Telefone alternativo: o formulario da Meta ganhou um campo "confirme o seu
-- telefone". Quando o numero digitado la for DIFERENTE do phone_number (em
-- ~22% dos casos que tem o campo, e as vezes o principal e' que veio
-- quebrado), guarda os dois -- o corretor tenta o alternativo se o principal
-- nao atender. Preenchido pelo n8n (workflow "FACEBOOK FORM - CAPTACAO
-- LEADS") e exibido no card (LeadDetailsModal).
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS telefone_alternativo text;

-- ===========================================================================
-- PERF (bug real: "CRM carregando infinitamente" / "Melissa nao consegue
-- entrar"): get_auth_imobiliaria_id() e get_auth_role() -- as duas funcoes
-- choke-point usadas em quase toda policy de RLS do banco -- estavam
-- marcadas VOLATILE. Numa policy, funcao VOLATILE e' re-executada PARA CADA
-- LINHA que a query retorna (o planner nao pode cachear). A policy de `leads`
-- e' `imobiliaria_id = get_auth_imobiliaria_id() AND (get_auth_role() = ANY
-- (...) OR corretor_id = auth.uid())` -> pra dono/gerente abrindo o Kanban
-- (centenas de linhas) ou Relatorios (milhares), sao centenas/milhares de
-- subconsultas em `perfis` por request. Elas SAO estaveis dentro de uma
-- mesma query (auth.uid() nao muda, o perfil nao muda no meio da query) ->
-- STABLE e' correto e faz o planner chamar 1x por query em vez de 1x por
-- linha. Efeito em TODAS as tabelas com RLS.
ALTER FUNCTION public.get_auth_imobiliaria_id() STABLE;
ALTER FUNCTION public.get_auth_role() STABLE;
-- buscar_lead_por_telefone faz regex scan na tabela leads inteira; nos
-- triggers de INSERT em massa (n8n) ela e' chamada 1x por linha inserida.
-- STABLE deixa o planner reusar o resultado quando o mesmo telefone e'
-- consultado 2x na mesma query. (O fix de fundo -- coluna de telefone
-- normalizado + indice -- fica pra outra migration.)
ALTER FUNCTION public.buscar_lead_por_telefone(text) STABLE;

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
      primeiro_contato_em = NULL
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
$function$;
