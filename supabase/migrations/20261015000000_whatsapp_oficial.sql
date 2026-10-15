-- 15/10 — WhatsApp API oficial (app "Conecta Zap InoovaWeb", com Coexistência) como 3ª via de
-- WhatsApp, ao lado de WAHA e Baileys, POR CORRETOR. O número do corretor fica ao mesmo tempo no
-- WhatsApp Business do celular, na sessão não oficial (WAHA/Baileys) e na API oficial (híbrido).
-- O dono/gerente liga a oficial de cada corretor pelo Cadastro Incorporado da Meta (os números
-- ficam no portfólio da imobiliária); as mensagens chegam pelo hub InoovaWeb, que entrega cada
-- número só pro sistema dono dele.

-- ===================== Conexão oficial de cada corretor =====================
-- Só o backend acessa (service_role): RLS ligado e sem policy, nada pra anon/authenticated.
-- O token (usuário do sistema da empresa, não expira) fica cifrado (AES-256-GCM, chave no backend).
CREATE TABLE IF NOT EXISTS public.whatsapp_oficial (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES public.perfis(id) ON DELETE CASCADE,
  imobiliaria_id uuid NOT NULL REFERENCES public.imobiliarias(id) ON DELETE CASCADE,
  phone_number_id text NOT NULL UNIQUE,
  waba_id text NOT NULL,
  numero text,
  nome_verificado text,
  token_cifrado text NOT NULL,
  token_iv text NOT NULL,
  token_tag text NOT NULL,
  ativa boolean NOT NULL DEFAULT true,
  erro text,
  conectado_por uuid REFERENCES public.perfis(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS whatsapp_oficial_waba_idx ON public.whatsapp_oficial (waba_id);
CREATE INDEX IF NOT EXISTS whatsapp_oficial_imobiliaria_idx ON public.whatsapp_oficial (imobiliaria_id);
ALTER TABLE public.whatsapp_oficial ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.whatsapp_oficial FROM anon, authenticated;

DROP TRIGGER IF EXISTS set_whatsapp_oficial_updated_at ON public.whatsapp_oficial;
CREATE TRIGGER set_whatsapp_oficial_updated_at
  BEFORE UPDATE ON public.whatsapp_oficial
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ===================== Mensagens: chave, via e número =====================
-- wa_chave: ID interno da mensagem no WhatsApp. No híbrido a MESMA mensagem chega com ids
--   diferentes pela oficial ("wamid." + base64) e pela não oficial ("3EB0..." ou
--   "false_<lid>@lid_3EB0...") — a chave é igual nas duas, e é ela que impede gravar 2x.
-- via: por onde saiu/entrou ('oficial' | 'nao_oficial'); null = antes desta migração.
-- conexao_user_id: de quem é o WhatsApp (número) por onde a mensagem passou — a janela de 24h
--   da oficial é por número, então só conta o que o cliente escreveu pro número DESTE corretor.
ALTER TABLE public.mensagens_whatsapp
  ADD COLUMN IF NOT EXISTS wa_chave text,
  ADD COLUMN IF NOT EXISTS via text,
  ADD COLUMN IF NOT EXISTS conexao_user_id uuid REFERENCES public.perfis(id) ON DELETE SET NULL;

DO $$ BEGIN
  ALTER TABLE public.mensagens_whatsapp
    ADD CONSTRAINT mensagens_whatsapp_via_check CHECK (via IS NULL OR via IN ('oficial', 'nao_oficial'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS mensagens_whatsapp_wa_chave_idx
  ON public.mensagens_whatsapp (wa_chave) WHERE wa_chave IS NOT NULL;

-- Mesma regra do backend (server/src/lib/chave.js — os dois têm teste com os mesmos exemplos):
--   wamid.<base64> -> último trecho hexadecimal (16 a 64) dentro do base64 decodificado;
--   senão          -> trecho depois do último "_" (ou o id inteiro), se for todo hexadecimal.
CREATE OR REPLACE FUNCTION public.wa_chave_de(p_id text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_b64 text;
  v_fonte text;
  v_chave text;
BEGIN
  IF p_id IS NULL OR p_id = '' THEN
    RETURN NULL;
  END IF;

  IF left(p_id, 6) = 'wamid.' THEN
    v_b64 := translate(substr(p_id, 7), '-_', '+/');
    v_b64 := v_b64 || repeat('=', (4 - length(v_b64) % 4) % 4);
    BEGIN
      -- bytes não imprimíveis viram "\ooo" no escape -> troca por espaço (quebra o trecho)
      v_fonte := regexp_replace(encode(decode(v_b64, 'base64'), 'escape'), '\\[0-7]{3}', ' ', 'g');
    EXCEPTION WHEN others THEN
      RETURN NULL;
    END;
    SELECT upper(t.m[1]) INTO v_chave
      FROM regexp_matches(v_fonte, '([0-9A-Fa-f]{16,64})', 'g') WITH ORDINALITY AS t(m, n)
      ORDER BY t.n DESC
      LIMIT 1;
    RETURN v_chave;
  END IF;

  v_fonte := regexp_replace(p_id, '^.*_', '');
  IF v_fonte ~ '^[0-9A-Fa-f]{16,64}$' THEN
    RETURN upper(v_fonte);
  END IF;
  RETURN NULL;
END;
$$;

-- Quem grava primeiro ganha; a 2ª cópia (outra via, eco, ou o insert do próprio chat depois do
-- eco) é descartada em silêncio. O lock por chave serializa duas gravações simultâneas da mesma
-- mensagem (webhook da oficial e da não oficial chegando juntos).
CREATE OR REPLACE FUNCTION public.mensagens_whatsapp_dedup_chave()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
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

DROP TRIGGER IF EXISTS mensagens_whatsapp_dedup_chave ON public.mensagens_whatsapp;
CREATE TRIGGER mensagens_whatsapp_dedup_chave
  BEFORE INSERT ON public.mensagens_whatsapp
  FOR EACH ROW EXECUTE FUNCTION public.mensagens_whatsapp_dedup_chave();
