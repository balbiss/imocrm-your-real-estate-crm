-- Troca a integracao de WhatsApp de WUZAPI para Baileys (mesma solucao usada
-- no CRM VisitaIA). As conexoes antigas da Wuzapi deixam de existir, entao
-- resetamos o estado de conexao e trocamos as colunas especificas da wuzapi
-- por um numero de telefone, que e a chave que o baileys-api usa.

ALTER TABLE public.whatsapp_instances
    ADD COLUMN IF NOT EXISTS phone_number TEXT,
    ADD COLUMN IF NOT EXISTS qr_code TEXT;

UPDATE public.whatsapp_instances
    SET connected = false,
        jid = NULL,
        qr_code = NULL;

ALTER TABLE public.whatsapp_instances
    DROP COLUMN IF EXISTS wuzapi_token,
    DROP COLUMN IF EXISTS wuzapi_user_id;
