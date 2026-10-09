-- Follow-up: "remover" vira ARQUIVAR (pedido do dono 09/10).
-- O botão de lixeira apagava o fluxo de vez com 1 clique, e o ON DELETE
-- CASCADE levava junto passos, execuções e o histórico de envios -- foi
-- assim que o "Modelo Vitor" (7 passos, ~950 envios) sumiu em 08/10.
-- Agora o front só marca arquivado_em (+ desativa); dá pra restaurar.
ALTER TABLE public.followup_fluxos
  ADD COLUMN IF NOT EXISTS arquivado_em timestamptz;
