-- Adiciona colunas de especificações na tabela imoveis
ALTER TABLE public.imoveis 
ADD COLUMN IF NOT EXISTS area INTEGER,
ADD COLUMN IF NOT EXISTS quartos INTEGER,
ADD COLUMN IF NOT EXISTS banheiros INTEGER;
