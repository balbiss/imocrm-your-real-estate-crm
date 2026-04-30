-- Tabela de imobiliárias
CREATE TABLE public.imobiliarias (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  cnpj TEXT,
  telefone TEXT,
  email TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX imobiliarias_owner_id_unique ON public.imobiliarias(owner_id);

ALTER TABLE public.imobiliarias ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can view their imobiliaria"
  ON public.imobiliarias FOR SELECT
  TO authenticated
  USING (auth.uid() = owner_id);

CREATE POLICY "Owners can insert their imobiliaria"
  ON public.imobiliarias FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Owners can update their imobiliaria"
  ON public.imobiliarias FOR UPDATE
  TO authenticated
  USING (auth.uid() = owner_id);

CREATE POLICY "Owners can delete their imobiliaria"
  ON public.imobiliarias FOR DELETE
  TO authenticated
  USING (auth.uid() = owner_id);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER imobiliarias_set_updated_at
BEFORE UPDATE ON public.imobiliarias
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Trigger: ao criar usuário, cria registro de imobiliária a partir do metadata
CREATE OR REPLACE FUNCTION public.handle_new_imobiliaria_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.raw_user_meta_data ? 'imobiliaria_nome' THEN
    INSERT INTO public.imobiliarias (owner_id, nome, cnpj, telefone, email)
    VALUES (
      NEW.id,
      NEW.raw_user_meta_data->>'imobiliaria_nome',
      NEW.raw_user_meta_data->>'imobiliaria_cnpj',
      NEW.raw_user_meta_data->>'imobiliaria_telefone',
      COALESCE(NEW.raw_user_meta_data->>'imobiliaria_email', NEW.email)
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created_imobiliaria
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_imobiliaria_user();