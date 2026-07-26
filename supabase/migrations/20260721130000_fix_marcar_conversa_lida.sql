-- marcar_conversa_lida rodava com o privilegio do usuario chamador (padrao
-- SQL function) e mensagens_whatsapp nao tem nenhuma politica de RLS pra
-- UPDATE — o UPDATE sempre afetava 0 linhas, sem erro, e o contador de nao
-- lidas nunca zerava. SECURITY DEFINER roda a funcao com o privilegio de
-- quem criou ela (mesmo padrao ja usado em buscar_lead_por_telefone).
-- SECURITY DEFINER bypassa RLS, entao o WHERE trava explicitamente no
-- mesmo criterio da politica de SELECT (mesma imobiliaria de quem chama) —
-- sem isso, qualquer usuario logado poderia marcar como lida a conversa de
-- outra imobiliaria so sabendo o lead_id.
CREATE OR REPLACE FUNCTION public.marcar_conversa_lida(p_lead_id UUID)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    UPDATE public.mensagens_whatsapp m
    SET lida = true
    WHERE m.lead_id = p_lead_id
      AND m.direcao = 'inbound'
      AND m.lida = false
      AND m.imobiliaria_id IN (
        SELECT p.imobiliaria_id FROM public.perfis p WHERE p.id = auth.uid()
      );
$$;
