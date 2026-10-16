-- 16/10 — Pedido do dono: o GERENTE não vê as mensagens que passaram pelo WhatsApp do DONO
-- (o dono conectou o WhatsApp dele no CRM em 15/10). Mensagens dos corretores: o gerente
-- continua vendo tudo, como antes. O dono vê tudo. Corretor: regra de sempre (leads dele).
-- "Passou pelo WhatsApp do dono" = mensagens_whatsapp.conexao_user_id é o dono (coluna criada em
-- 20261015000000_whatsapp_oficial.sql; o webhook grava o dono do número que recebeu/enviou).

-- Ids cujas mensagens o usuário logado NÃO pode ver: pro gerente, os donos da imobiliária dele;
-- pra qualquer outro papel, nenhum. Na policy vai como COALESCE((SELECT ...)) -> calculado uma vez
-- por consulta (InitPlan), não por linha. (Um = ANY ((SELECT ...)) puro viraria subconsulta de
-- arrays e daria "uuid = uuid[]".)
CREATE OR REPLACE FUNCTION public.ids_ocultos_do_gerente()
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT CASE WHEN get_auth_role() = 'gerente' THEN COALESCE((
    SELECT array_agg(p.id) FROM perfis p
    WHERE p.role::text = 'dono' AND p.imobiliaria_id = get_auth_imobiliaria_id()
  ), '{}'::uuid[]) ELSE '{}'::uuid[] END;
$$;
REVOKE ALL ON FUNCTION public.ids_ocultos_do_gerente() FROM anon;

DROP POLICY IF EXISTS mensagens_select_por_papel ON public.mensagens_whatsapp;
CREATE POLICY mensagens_select_por_papel ON public.mensagens_whatsapp
  FOR SELECT
  USING (
    (imobiliaria_id = get_auth_imobiliaria_id())
    AND NOT COALESCE(conexao_user_id = ANY (COALESCE((SELECT public.ids_ocultos_do_gerente()), '{}'::uuid[])), false)
    AND (
      (get_auth_role() = ANY (ARRAY['dono'::text, 'gerente'::text]))
      OR (EXISTS (
        SELECT 1 FROM leads l
        WHERE l.id = mensagens_whatsapp.lead_id
          AND l.corretor_id = auth.uid()
          AND mensagens_whatsapp.created_at >= COALESCE(l.data_atribuicao, l.created_at)
      ))
    )
  );

-- Mensagem enviada pelo chat do CRM (insert com o login de quem enviou): sai pelo WhatsApp de
-- quem está logado, então conexao_user_id = ele. O backend (service_role, sem login) já preenche.
CREATE OR REPLACE FUNCTION public.mensagens_whatsapp_dedup_chave()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.conexao_user_id IS NULL AND auth.uid() IS NOT NULL THEN
    NEW.conexao_user_id := auth.uid();
  END IF;
  IF NEW.wa_chave IS NULL THEN
    NEW.wa_chave := public.wa_chave_de(NEW.whatsapp_message_id);
  END IF;
  IF NEW.wa_chave IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('mensagens_whatsapp:' || NEW.wa_chave, 0));
    IF EXISTS (SELECT 1 FROM public.mensagens_whatsapp WHERE wa_chave = NEW.wa_chave) THEN
      RETURN NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Conector do Claude (busca de lead): mesma regra nas "mensagens_recentes".
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
            FROM (SELECT * FROM mensagens_whatsapp mw WHERE mw.lead_id = l.id
                    AND NOT COALESCE(mw.conexao_user_id = ANY (ids_ocultos_do_gerente()), false)
                  ORDER BY mw.created_at DESC LIMIT 8) m)
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
