-- 13/10 — Conector do Claude (MCP) pro dono consultar o CRM pelo claude.ai.
-- Login com o e-mail/senha do CRM (OAuth feito pelo backend em /backend/oauth/*),
-- só dono e gerente, SOMENTE LEITURA. Tudo aqui é acessado só pelo backend
-- (service_role): tabelas com RLS ligado e sem policy, funções sem EXECUTE pra
-- anon/authenticated.

-- ===================== OAuth (clientes, códigos, tokens) =====================
CREATE TABLE IF NOT EXISTS public.mcp_oauth_clientes (
  id text PRIMARY KEY,
  secret_hash text,
  redirect_uris text[] NOT NULL,
  nome text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.mcp_oauth_codigos (
  codigo_hash text PRIMARY KEY,
  cliente_id text NOT NULL REFERENCES public.mcp_oauth_clientes(id) ON DELETE CASCADE,
  usuario_id uuid NOT NULL REFERENCES public.perfis(id) ON DELETE CASCADE,
  redirect_uri text NOT NULL,
  code_challenge text NOT NULL,
  expira_em timestamptz NOT NULL,
  usado_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.mcp_oauth_tokens (
  token_hash text PRIMARY KEY,
  tipo text NOT NULL CHECK (tipo IN ('access', 'refresh')),
  cliente_id text NOT NULL REFERENCES public.mcp_oauth_clientes(id) ON DELETE CASCADE,
  usuario_id uuid NOT NULL REFERENCES public.perfis(id) ON DELETE CASCADE,
  expira_em timestamptz NOT NULL,
  revogado_em timestamptz,
  ultimo_uso_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mcp_oauth_tokens_usuario_idx ON public.mcp_oauth_tokens (usuario_id);

ALTER TABLE public.mcp_oauth_clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mcp_oauth_codigos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mcp_oauth_tokens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mcp_oauth_clientes, public.mcp_oauth_codigos, public.mcp_oauth_tokens FROM anon, authenticated;

-- ===================== "Agir como" o usuário logado =====================
-- As funções do Dashboard usam auth.uid() (get_auth_imobiliaria_id/get_auth_role).
-- O backend chama como service_role, então aqui assumimos o usuário do token
-- só dentro da transação (set_config local) e revalidamos o papel a cada chamada
-- — bloquear/remover o usuário no CRM corta o acesso na hora.
CREATE OR REPLACE FUNCTION public.mcp_assumir_usuario(p_usuario uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_imob uuid;
BEGIN
  SELECT imobiliaria_id INTO v_imob FROM perfis
  WHERE id = p_usuario AND role::text IN ('dono', 'gerente')
    AND bloqueado IS NOT TRUE AND removido_em IS NULL;
  IF v_imob IS NULL THEN
    RAISE EXCEPTION 'Sem permissão: só dono e gerente ativos usam o conector.';
  END IF;
  PERFORM set_config('request.jwt.claim.sub', p_usuario::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', p_usuario, 'role', 'authenticated')::text, true);
  RETURN v_imob;
END;
$function$;

CREATE OR REPLACE FUNCTION public.mcp_dashboard(p_usuario uuid, p_inicio date, p_fim date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM mcp_assumir_usuario(p_usuario);
  RETURN get_dashboard_analitico(p_inicio, p_fim);
END;
$function$;

CREATE OR REPLACE FUNCTION public.mcp_followup(p_usuario uuid, p_inicio date, p_fim date, p_corretor uuid DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM mcp_assumir_usuario(p_usuario);
  RETURN to_jsonb(get_followup_desempenho(p_inicio, p_fim, p_corretor));
END;
$function$;

-- Foto de agora: cards em atendimento por corretor e por coluna do Kanban.
CREATE OR REPLACE FUNCTION public.mcp_carteira(p_usuario uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_imob uuid := mcp_assumir_usuario(p_usuario);
  v_res jsonb;
BEGIN
  SELECT jsonb_build_object(
    'corretores', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'corretor', p.nome,
        'papel', p.role,
        'na_roleta', p.status_roleta,
        'whatsapp_conectado', COALESCE((SELECT w.connected FROM whatsapp_instances w WHERE w.user_id = p.id LIMIT 1), false),
        'total_cards', (SELECT count(*) FROM leads l WHERE l.corretor_id = p.id AND l.descartado_em IS NULL),
        'por_coluna', (SELECT COALESCE(jsonb_object_agg(z.coluna, z.n), '{}'::jsonb) FROM (
            SELECT COALESCE(c.nome, 'Sem coluna') coluna, count(*) n
            FROM leads l LEFT JOIN colunas_kanban c ON c.id = l.coluna_kanban_id
            WHERE l.corretor_id = p.id AND l.descartado_em IS NULL GROUP BY 1) z),
        'tarefas_atrasadas', (SELECT count(*) FROM leads l LEFT JOIN colunas_kanban c ON c.id = l.coluna_kanban_id
            WHERE l.corretor_id = p.id AND l.descartado_em IS NULL
              AND l.lembrete_follow_up < date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo'
              AND COALESCE(c.nome, '') <> 'FOLLOW-UP AUTOMÁTICO')
      ) ORDER BY p.nome)
      FROM perfis p
      WHERE p.imobiliaria_id = v_imob AND p.removido_em IS NULL AND p.bloqueado IS NOT TRUE), '[]'::jsonb),
    'sem_corretor', jsonb_build_object(
      'rebatidas_no_bolsao', (SELECT count(*) FROM leads l WHERE l.imobiliaria_id = v_imob AND l.corretor_id IS NULL AND l.descartado_em IS NULL),
      'descartes_aguardando_aprovacao', (SELECT count(*) FROM leads l WHERE l.imobiliaria_id = v_imob AND l.descarte_pendente_aprovacao IS TRUE),
      'vendas_aguardando_aprovacao', (SELECT count(*) FROM leads l WHERE l.imobiliaria_id = v_imob AND l.venda_pendente_aprovacao IS TRUE))
  ) INTO v_res;
  RETURN v_res;
END;
$function$;

-- Busca de lead por nome ou telefone (até 10), com histórico e últimas mensagens.
CREATE OR REPLACE FUNCTION public.mcp_buscar_lead(p_usuario uuid, p_busca text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_imob uuid := mcp_assumir_usuario(p_usuario);
  v_busca text := btrim(COALESCE(p_busca, ''));
  v_digitos text := regexp_replace(COALESCE(p_busca, ''), '\D', '', 'g');
BEGIN
  IF length(v_busca) < 3 THEN
    RAISE EXCEPTION 'Digite pelo menos 3 letras do nome ou números do telefone.';
  END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(x ORDER BY x->>'ultima_acao' DESC NULLS LAST)
    FROM (
      SELECT jsonb_build_object(
        'nome', l.nome,
        'telefone', l.telefone,
        'corretor', p.nome,
        'coluna', c.nome,
        'status', l.status,
        'origem', l.origem,
        'entrou_em', l.created_at,
        'recadastro_em', l.recadastro_em,
        'ultima_acao', l.ultima_acao_at,
        'proximo_contato', l.lembrete_follow_up,
        'visita', l.data_visita,
        'status_visita', l.status_visita,
        'renda_familiar', l.renda_familiar,
        'cidade_bairro', l.bairro_interesse,
        'descartado_em', l.descartado_em,
        'motivo_descarte', l.motivo_descarte,
        'credito_aprovado_em', l.credito_aprovado_em,
        'venda', CASE WHEN l.data_fechamento IS NOT NULL THEN jsonb_build_object('data', l.data_fechamento, 'valor', l.valor_venda, 'empreendimento', l.empreendimento) END,
        'historico_recente', (SELECT COALESCE(jsonb_agg(jsonb_build_object('quando', h.created_at, 'quem', a.nome, 'o_que', left(h.conteudo, 300)) ORDER BY h.created_at DESC), '[]'::jsonb)
            FROM (SELECT * FROM leads_interacoes i WHERE i.lead_id = l.id ORDER BY i.created_at DESC LIMIT 10) h
            LEFT JOIN perfis a ON a.id = h.autor_id),
        'mensagens_recentes', (SELECT COALESCE(jsonb_agg(jsonb_build_object('quando', m.created_at,
              'de', CASE WHEN m.direcao = 'inbound' THEN 'cliente' WHEN m.canal = 'followup' THEN 'robô de follow-up' ELSE 'corretor' END,
              'texto', left(m.conteudo, 300)) ORDER BY m.created_at DESC), '[]'::jsonb)
            FROM (SELECT * FROM mensagens_whatsapp mw WHERE mw.lead_id = l.id ORDER BY mw.created_at DESC LIMIT 8) m)
      ) x
      FROM leads l
      LEFT JOIN perfis p ON p.id = l.corretor_id
      LEFT JOIN colunas_kanban c ON c.id = l.coluna_kanban_id
      WHERE l.imobiliaria_id = v_imob
        AND (l.nome ILIKE '%' || v_busca || '%'
             OR (length(v_digitos) >= 6 AND (regexp_replace(COALESCE(l.telefone, ''), '\D', '', 'g') LIKE '%' || v_digitos || '%'
                                           OR regexp_replace(COALESCE(l.telefone_alternativo, ''), '\D', '', 'g') LIKE '%' || v_digitos || '%')))
      ORDER BY l.ultima_acao_at DESC NULLS LAST
      LIMIT 10
    ) z
  ), '[]'::jsonb);
END;
$function$;

CREATE OR REPLACE FUNCTION public.mcp_corretor_por_nome(p_usuario uuid, p_nome text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_imob uuid := mcp_assumir_usuario(p_usuario);
  v_id uuid;
BEGIN
  SELECT id INTO v_id FROM perfis
  WHERE imobiliaria_id = v_imob AND nome ILIKE '%' || btrim(p_nome) || '%'
  ORDER BY (removido_em IS NULL) DESC, length(nome) LIMIT 1;
  RETURN v_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.mcp_assumir_usuario(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mcp_dashboard(uuid, date, date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mcp_followup(uuid, date, date, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mcp_carteira(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mcp_buscar_lead(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mcp_corretor_por_nome(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mcp_assumir_usuario(uuid), public.mcp_dashboard(uuid, date, date),
  public.mcp_followup(uuid, date, date, uuid), public.mcp_carteira(uuid), public.mcp_buscar_lead(uuid, text),
  public.mcp_corretor_por_nome(uuid, text) TO service_role;
