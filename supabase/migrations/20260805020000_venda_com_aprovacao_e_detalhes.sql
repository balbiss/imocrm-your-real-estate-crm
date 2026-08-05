-- Especificacao do dono (05/08) - VENDA: ao clicar no botao VENDA (que ja
-- existe do lado dos botoes de temperatura no card do lead), abrir janela
-- pra preencher Valor da Venda + Empreendimento + Unidade + Torre, e SEMPRE
-- exigir aprovacao do dono/gerente antes de fechar de verdade. Tambem
-- corrige o bug relatado: handleFechamento so mudava `status` pra
-- 'venda_concluida' e nunca `coluna_kanban_id`, entao o card ficava
-- visualmente "preso" na coluna antiga (ex: TAREFAS) mesmo com a venda
-- registrada por baixo dos panos.
--
-- Fix: enquanto pendente de aprovacao, nem status nem coluna_kanban_id sao
-- tocados (mesmo padrao ja usado pro descarte extremo em
-- descarte_pendente_aprovacao) -- o lead so some do Kanban via filtro
-- client-side. So na APROVACAO, status e coluna_kanban_id mudam JUNTOS,
-- atomicamente, pra uma coluna VENDA dedicada -- elimina de vez a
-- possibilidade do desync que gerou o bug.

ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS empreendimento text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS unidade text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS torre text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS venda_pendente_aprovacao boolean NOT NULL DEFAULT false;

-- Coluna VENDA dedicada por imobiliaria (mesmo padrao da LEAD DESCADASTRAR
-- em 20260805000000_spec_rebatidas_e_higienizacao.sql) -- so recebe o lead
-- quando a venda e aprovada.
INSERT INTO colunas_kanban (id, imobiliaria_id, nome, posicao)
SELECT gen_random_uuid(), imobiliaria_id, 'VENDA',
  (SELECT COALESCE(MAX(posicao), 0) + 1 FROM colunas_kanban c2 WHERE c2.imobiliaria_id = c.imobiliaria_id)
FROM (SELECT DISTINCT imobiliaria_id FROM colunas_kanban) c
WHERE NOT EXISTS (SELECT 1 FROM colunas_kanban c3 WHERE c3.imobiliaria_id = c.imobiliaria_id AND c3.nome ILIKE '%venda%');
