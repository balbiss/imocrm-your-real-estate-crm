-- Corretores só enxergavam os próprios agendamentos na Agenda (RLS de
-- "leads" restringe SELECT a corretor_id = auth.uid() pra quem tem
-- role='corretor'), causando choque de horário: dois corretores agendavam
-- visita/FID pro mesmo cliente/horário sem saber que já existia outro
-- compromisso marcado. Esta função devolve só o necessário pro calendário
-- (nome do cliente, corretor responsável, data/tipo/status da visita) pra
-- TODOS os corretores da mesma imobiliária, sem expor telefone/histórico
-- do lead de quem não é dono do lead.
CREATE OR REPLACE FUNCTION public.listar_agenda_visitas()
RETURNS TABLE (
    lead_id UUID,
    nome TEXT,
    corretor_id UUID,
    corretor_nome TEXT,
    data_visita TIMESTAMPTZ,
    tipo_visita TEXT,
    status_visita TEXT,
    favorito BOOLEAN
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        l.id,
        l.nome,
        l.corretor_id,
        p.nome,
        l.data_visita,
        l.tipo_visita,
        l.status_visita,
        l.favorito
    FROM public.leads l
    LEFT JOIN public.perfis p ON p.id = l.corretor_id
    WHERE l.imobiliaria_id = (SELECT imobiliaria_id FROM public.perfis WHERE id = auth.uid())
      AND l.data_visita IS NOT NULL
      AND l.descartado_em IS NULL
      AND l.descarte_pendente_aprovacao = false
      AND l.venda_pendente_aprovacao = false
      AND l.data_fechamento IS NULL;
$$;

GRANT EXECUTE ON FUNCTION public.listar_agenda_visitas() TO authenticated;
