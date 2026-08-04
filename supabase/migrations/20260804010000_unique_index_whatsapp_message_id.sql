-- Corrige bug real: mensagens enviadas pelo CRM duplicavam no chat (confirmado em
-- producao: 178 mensagens com o mesmo whatsapp_message_id duplicadas entre
-- 01/08 e 03/08, desde que o "sync de mensagens do celular" foi ao ar).
-- Causa: dois caminhos gravam a mesma mensagem outbound -- o insert explicito em
-- WhatsAppChat.tsx (logo apos enviar) e o eco fromMe=true que chega no webhook do
-- Baileys -- e os dois faziam "SELECT existe? -> INSERT" sem nenhuma garantia
-- atomica. Quando o webhook processava o eco antes do insert do frontend commitar
-- (ou vice-versa), nenhum dos dois via o registro do outro no SELECT e ambos
-- inseriam, gerando linha duplicada.
-- Fix: indice unico de verdade em whatsapp_message_id (Postgres permite varios
-- NULL sem conflito, entao nao afeta mensagens sem esse campo) + os dois pontos de
-- insert (webhook.js e WhatsAppChat.tsx) passaram a usar upsert com
-- ignoreDuplicates, tornando o "quem chega primeiro grava" atomico de verdade.
-- Limpeza: apagadas as 178 linhas duplicadas ja existentes, mantendo sempre a mais
-- antiga de cada par (mesmo texto/mesmo whatsapp_message_id, a diferenca era so
-- de alguns milissegundos entre as duas).
CREATE UNIQUE INDEX IF NOT EXISTS mensagens_whatsapp_wa_message_id_unique
  ON mensagens_whatsapp (whatsapp_message_id);
