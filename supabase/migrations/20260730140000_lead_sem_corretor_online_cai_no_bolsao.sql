-- Pedido do dono: lead que chega fora do horario (ninguem online) deve cair
-- no Bolsao de Leads (sem corretor) pra ele distribuir manualmente depois,
-- em vez de acumular tudo na conta do dono.
--
-- O gatilho distribute_lead (dispara em qualquer INSERT em leads com
-- corretor_id nulo) usava get_next_broker_on_duty(), uma implementacao
-- separada e mais simples (so perfis.em_plantao=true, sem olhar
-- imobiliaria_id nem a posicao real da fila) — diferente da
-- get_next_corretor_rodizio usada pelo webhook do WhatsApp. Unificamos as
-- duas pra usar sempre get_next_corretor_rodizio: mesma regra de
-- elegibilidade (status_roleta=true, escopada por imobiliaria, respeitando
-- a posicao da fila) pra QUALQUER canal de entrada de lead (WhatsApp,
-- Facebook Ads via n8n, etc). Se ninguem estiver disponivel, corretor_id
-- fica NULL e o lead cai no Bolsao — nao mais tem fallback pro dono.
CREATE OR REPLACE FUNCTION public.distribute_lead()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    IF NEW.corretor_id IS NULL THEN
        SELECT corretor_id INTO NEW.corretor_id
        FROM get_next_corretor_rodizio(NEW.imobiliaria_id);
    END IF;
    RETURN NEW;
END;
$function$;
