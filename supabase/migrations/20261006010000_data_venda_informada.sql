-- 06/10 — pedido do dono: campo DATA DA VENDA no "Enviar Venda para Aprovação".
-- Antes, data_fechamento = momento da APROVAÇÃO; as vendas antigas que os
-- corretores vão registrar agora (11 cards que estavam na coluna VENDA sem
-- venda) entrariam todas como venda deste mês. O corretor informa a data
-- real aqui e a aprovação usa ela em data_fechamento.
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS data_venda_informada date;
