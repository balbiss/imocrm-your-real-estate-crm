-- Pedido do dono (11/09): aviso urgente e bloqueante avisando dono/gerente
-- que a Meta atualizou o WhatsApp e a integração vai precisar de atualização
-- no proxy reverso, senão para de funcionar. É um aviso temporário -- ganha
-- um interruptor em Configurações -> Imobiliária pra desligar quando
-- resolver, mesmo padrão do followup_automatico_ativo.
ALTER TABLE public.imobiliarias
  ADD COLUMN IF NOT EXISTS aviso_meta_whatsapp_ativo boolean NOT NULL DEFAULT true;
