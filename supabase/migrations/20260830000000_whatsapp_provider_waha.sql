-- WhatsApp: suporte a duas engines por corretor (Baileys OU WAHA).
--
-- Até aqui todo corretor conecta via ghcr.io/fazer-ai/baileys-api (serviço
-- crm_oka_baileys). O dono pediu o WAHA (waha.devlike.pro, instância própria
-- em waha-oka.inoovaweb.cloud) como alternativa -- na tela de conexão o
-- corretor escolhe qual usar (padrão passa a ser WAHA).
--
--  * provider     -- 'baileys' | 'waha'. Default 'baileys' aqui de propósito:
--                    é o valor seguro pra qualquer linha criada antes do
--                    backend novo entrar no ar. O backend passa a gravar o
--                    provider explicitamente em todo /connect (default 'waha'
--                    na rota), então o default da coluna é só rede de proteção.
--  * session_name -- id da sessão no WAHA (= user_id do corretor). NULL pro
--                    Baileys, que se identifica por phone_number.
ALTER TABLE public.whatsapp_instances
  ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'baileys',
  ADD COLUMN IF NOT EXISTS session_name text;

-- Garantia explícita pras linhas que já existem (todas Baileys hoje).
UPDATE public.whatsapp_instances SET provider = 'baileys' WHERE provider IS NULL;
