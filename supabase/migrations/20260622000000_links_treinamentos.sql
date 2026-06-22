-- Tabela de Links Úteis
CREATE TABLE IF NOT EXISTS public.links_uteis (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    imobiliaria_id UUID NOT NULL REFERENCES public.imobiliarias(id) ON DELETE CASCADE,
    titulo TEXT NOT NULL,
    url TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tabela de Treinamentos
CREATE TABLE IF NOT EXISTS public.treinamentos (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    imobiliaria_id UUID NOT NULL REFERENCES public.imobiliarias(id) ON DELETE CASCADE,
    titulo TEXT NOT NULL,
    url TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Habilitar RLS nas novas tabelas
ALTER TABLE public.links_uteis ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.treinamentos ENABLE ROW LEVEL SECURITY;

-- Políticas de segurança baseadas na imobiliária do usuário autenticado
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'links_uteis_all' AND tablename = 'links_uteis'
    ) THEN
        CREATE POLICY "links_uteis_all" ON public.links_uteis
            FOR ALL TO authenticated
            USING (imobiliaria_id = get_auth_imobiliaria_id())
            WITH CHECK (imobiliaria_id = get_auth_imobiliaria_id());
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'treinamentos_all' AND tablename = 'treinamentos'
    ) THEN
        CREATE POLICY "treinamentos_all" ON public.treinamentos
            FOR ALL TO authenticated
            USING (imobiliaria_id = get_auth_imobiliaria_id())
            WITH CHECK (imobiliaria_id = get_auth_imobiliaria_id());
    END IF;
END $$;
