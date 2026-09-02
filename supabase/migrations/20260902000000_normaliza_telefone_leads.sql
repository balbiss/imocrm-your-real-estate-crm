-- Bug reportado pelo dono (02/09): alerta de visita mostrando telefone
-- "11 99363-3874" (com espaço e traço). Lead criado manualmente
-- (NewLeadDialog) gravava o telefone exatamente como digitado -- o resto do
-- sistema (leads do Facebook, webhook do WhatsApp) usa só dígitos sem DDI 55.
-- Telefone formatado quebra o envio pelo WhatsApp e a busca por duplicata
-- (que até funciona via regexp, mas fica inconsistente).
--
-- Fix da entrada: NewLeadDialog.tsx passa a limpar antes de gravar (ver
-- commit). Este backfill limpa os ~45 leads já gravados assim.

-- 1) Leads com DOIS números no campo (digitados como "X // Y" -- caso comum
--    de "confirme o telefone" preenchido na mão): 1o vira telefone, 2o vira
--    telefone_alternativo.
UPDATE public.leads
SET telefone_alternativo = COALESCE(NULLIF(telefone_alternativo, ''),
      regexp_replace(split_part(telefone, '//', 2), '\D', '', 'g')),
    telefone = regexp_replace(split_part(telefone, '//', 1), '\D', '', 'g')
WHERE telefone LIKE '%//%';

-- 2) Telefone só com formatação (espaço/traço/parênteses/+): deixa só
--    dígitos e tira o DDI 55 quando sobra um número BR de 10-11 dígitos.
UPDATE public.leads
SET telefone = regexp_replace(
      regexp_replace(telefone, '\D', '', 'g'),
      '^55(?=[0-9]{10,11}$)', ''
    )
WHERE telefone ~ '[^0-9]'
  AND telefone NOT LIKE '%//%';
