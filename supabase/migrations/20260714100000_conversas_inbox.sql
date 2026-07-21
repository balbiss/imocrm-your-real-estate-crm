-- Suporte a uma tela de "Conversas" (inbox) agregando o WhatsApp de cada
-- corretor, parecido com o chat ao vivo do CRM VisitaIA.

ALTER TABLE public.mensagens_whatsapp
    ADD COLUMN IF NOT EXISTS lida BOOLEAN NOT NULL DEFAULT true;

-- Mensagens antigas viram "lidas" (nao da pra saber o estado real, e assim
-- o contador de nao lidas nao nasce inflado com todo o historico).
UPDATE public.mensagens_whatsapp SET lida = true WHERE lida IS DISTINCT FROM true;

-- Lista as conversas (1 por lead com pelo menos 1 mensagem), com preview da
-- ultima mensagem e contagem de nao lidas. p_corretor_id nulo = todas
-- (uso do dono/gerente); passado = so as conversas daquele corretor.
CREATE OR REPLACE FUNCTION public.get_conversas(p_corretor_id UUID DEFAULT NULL)
RETURNS TABLE (
    lead_id UUID,
    lead_nome TEXT,
    lead_telefone TEXT,
    corretor_id UUID,
    corretor_nome TEXT,
    imobiliaria_id UUID,
    ultima_mensagem TEXT,
    ultima_mensagem_em TIMESTAMPTZ,
    ultima_direcao TEXT,
    nao_lidas BIGINT
)
LANGUAGE sql
STABLE
AS $$
    SELECT
        l.id,
        l.nome,
        l.telefone,
        l.corretor_id,
        p.nome,
        l.imobiliaria_id,
        lm.conteudo,
        lm.created_at,
        lm.direcao,
        COALESCE(nl.count, 0)
    FROM public.leads l
    JOIN LATERAL (
        SELECT conteudo, created_at, direcao
        FROM public.mensagens_whatsapp m
        WHERE m.lead_id = l.id
        ORDER BY m.created_at DESC
        LIMIT 1
    ) lm ON true
    LEFT JOIN public.perfis p ON p.id = l.corretor_id
    LEFT JOIN LATERAL (
        SELECT count(*) AS count
        FROM public.mensagens_whatsapp m2
        WHERE m2.lead_id = l.id AND m2.direcao = 'inbound' AND m2.lida = false
    ) nl ON true
    WHERE (p_corretor_id IS NULL OR l.corretor_id = p_corretor_id)
    ORDER BY lm.created_at DESC;
$$;

-- Marca como lidas todas as mensagens inbound de uma conversa.
CREATE OR REPLACE FUNCTION public.marcar_conversa_lida(p_lead_id UUID)
RETURNS void
LANGUAGE sql
AS $$
    UPDATE public.mensagens_whatsapp
    SET lida = true
    WHERE lead_id = p_lead_id AND direcao = 'inbound' AND lida = false;
$$;
