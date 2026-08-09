-- Fase 3 (passo 1 de 2) do pedido de relatórios (09/08): tabela nova pro
-- dono registrar quanto gastou em cada campanha por mês -- não mexe em
-- nenhuma tabela existente, é só uma peça nova pro cálculo de CAC que vem
-- no passo seguinte.
CREATE TABLE IF NOT EXISTS public.gastos_campanha (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  imobiliaria_id uuid NOT NULL REFERENCES public.imobiliarias(id),
  origem text NOT NULL,
  mes text NOT NULL,
  valor numeric NOT NULL DEFAULT 0,
  atualizado_por uuid REFERENCES public.perfis(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(imobiliaria_id, origem, mes)
);

ALTER TABLE public.gastos_campanha ENABLE ROW LEVEL SECURITY;

-- Todo mundo da imobiliária pode ver (relatório é lido por dono/gerente,
-- mas não custa deixar consistente com o resto do sistema).
CREATE POLICY gastos_campanha_select ON public.gastos_campanha FOR SELECT
  USING (imobiliaria_id = get_auth_imobiliaria_id());

-- Só dono/gerente edita gasto (dado financeiro sensível).
CREATE POLICY gastos_campanha_insert ON public.gastos_campanha FOR INSERT
  WITH CHECK (imobiliaria_id = get_auth_imobiliaria_id() AND get_auth_role() IN ('dono', 'gerente'));

CREATE POLICY gastos_campanha_update ON public.gastos_campanha FOR UPDATE
  USING (imobiliaria_id = get_auth_imobiliaria_id() AND get_auth_role() IN ('dono', 'gerente'))
  WITH CHECK (imobiliaria_id = get_auth_imobiliaria_id() AND get_auth_role() IN ('dono', 'gerente'));

CREATE TRIGGER set_gastos_campanha_updated_at
  BEFORE UPDATE ON public.gastos_campanha
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
