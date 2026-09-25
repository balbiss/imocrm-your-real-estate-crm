-- Aba "Campanhas" (pedido 25/09): lista cada campanha (o texto de leads.origem
-- que vem do formulário/anúncio) com quantos leads trouxe, e deixa dono/gerente
-- colar o link do Google Drive do criativo -- a tela mostra a prévia da imagem.
-- A campanha "existe" pelos leads; esta tabela só guarda o que é digitado à mão
-- (link do Drive, observação) e campanhas cadastradas antes de ter lead.

CREATE TABLE IF NOT EXISTS public.campanhas (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  imobiliaria_id uuid NOT NULL REFERENCES public.imobiliarias(id) ON DELETE CASCADE,
  nome           text NOT NULL,
  drive_url      text,
  observacao     text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (imobiliaria_id, nome)
);

ALTER TABLE public.campanhas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS campanhas_select ON public.campanhas;
CREATE POLICY campanhas_select ON public.campanhas FOR SELECT TO authenticated
  USING (imobiliaria_id = get_auth_imobiliaria_id());

DROP POLICY IF EXISTS campanhas_insert ON public.campanhas;
CREATE POLICY campanhas_insert ON public.campanhas FOR INSERT TO authenticated
  WITH CHECK (imobiliaria_id = get_auth_imobiliaria_id()
              AND get_auth_role() = ANY (ARRAY['dono'::text, 'gerente'::text]));

DROP POLICY IF EXISTS campanhas_update ON public.campanhas;
CREATE POLICY campanhas_update ON public.campanhas FOR UPDATE TO authenticated
  USING (imobiliaria_id = get_auth_imobiliaria_id()
         AND get_auth_role() = ANY (ARRAY['dono'::text, 'gerente'::text]))
  WITH CHECK (imobiliaria_id = get_auth_imobiliaria_id()
              AND get_auth_role() = ANY (ARRAY['dono'::text, 'gerente'::text]));

DROP POLICY IF EXISTS campanhas_delete ON public.campanhas;
CREATE POLICY campanhas_delete ON public.campanhas FOR DELETE TO authenticated
  USING (imobiliaria_id = get_auth_imobiliaria_id()
         AND get_auth_role() = ANY (ARRAY['dono'::text, 'gerente'::text]));

-- Resumo por campanha da imobiliária de quem chama (conta TODOS os leads da
-- imobiliária, não só os do corretor -- é número da campanha, não da carteira).
-- Fica de fora o que não é anúncio: cadastro manual, WhatsApp, site, importação.
CREATE OR REPLACE FUNCTION public.get_campanhas_resumo()
 RETURNS TABLE(nome text, total_leads bigint, leads_7d bigint, leads_30d bigint, ultimo_lead timestamptz,
               campanha_id uuid, drive_url text, observacao text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH imob AS (SELECT get_auth_imobiliaria_id() AS id),
  por_origem AS (
    SELECT l.origem AS nome,
           count(*) AS total_leads,
           count(*) FILTER (WHERE l.created_at > now() - interval '7 days')  AS leads_7d,
           count(*) FILTER (WHERE l.created_at > now() - interval '30 days') AS leads_30d,
           max(l.created_at) AS ultimo_lead
    FROM leads l, imob
    WHERE l.imobiliaria_id = imob.id
      AND l.origem IS NOT NULL AND btrim(l.origem) <> ''
      AND l.origem NOT IN ('Manual', 'WhatsApp', 'Site')
      AND l.origem NOT ILIKE 'Importa%'
    GROUP BY l.origem
  )
  SELECT COALESCE(p.nome, c.nome),
         COALESCE(p.total_leads, 0), COALESCE(p.leads_7d, 0), COALESCE(p.leads_30d, 0),
         p.ultimo_lead, c.id, c.drive_url, c.observacao
  FROM por_origem p
  FULL JOIN (SELECT cc.* FROM campanhas cc, imob WHERE cc.imobiliaria_id = imob.id) c ON c.nome = p.nome
  ORDER BY p.ultimo_lead DESC NULLS FIRST, COALESCE(p.nome, c.nome);
$function$;

REVOKE ALL ON FUNCTION public.get_campanhas_resumo() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_campanhas_resumo() TO authenticated;
