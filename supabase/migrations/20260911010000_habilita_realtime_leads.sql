-- Dashboard novo (pedido do dono, 11/09): "Leads Novos, com nome, campanha e
-- horário (quantidade de leads que entraram em tempo real)" precisa que o
-- frontend receba um evento quando um lead é inserido/atualizado, pra
-- atualizar os widgets sem precisar de F5. `leads` não estava na publicação
-- supabase_realtime (só notificacoes/mensagens_whatsapp/followup_* estavam)
-- -- sem isso, .on('postgres_changes', {table: 'leads'}) nunca dispara.
ALTER PUBLICATION supabase_realtime ADD TABLE public.leads;
