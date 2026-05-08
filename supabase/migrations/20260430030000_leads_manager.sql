-- 1. Enums para Status e Funções
DO $$ BEGIN
    CREATE TYPE public.user_role AS ENUM ('dono', 'gerente', 'corretor');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE public.lead_status AS ENUM ('novo', 'em_atendimento', 'qualificado', 'desqualificado', 'venda_concluida');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Tabela de Perfis (Extensão de auth.users)
CREATE TABLE IF NOT EXISTS public.perfis (
    id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    imobiliaria_id UUID REFERENCES public.imobiliarias(id) ON DELETE CASCADE,
    nome TEXT NOT NULL,
    role public.user_role NOT NULL DEFAULT 'corretor',
    telefone TEXT,
    avatar_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Tabela de Imóveis
CREATE TABLE IF NOT EXISTS public.imoveis (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    imobiliaria_id UUID NOT NULL REFERENCES public.imobiliarias(id) ON DELETE CASCADE,
    titulo TEXT NOT NULL,
    descricao TEXT,
    tipo TEXT, -- Casa, Apartamento, Terreno
    finalidade TEXT, -- Venda, Aluguel
    preco NUMERIC,
    endereco TEXT,
    cidade TEXT,
    estado TEXT,
    fotos TEXT[], -- Array de URLs
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Tabela de Leads
CREATE TABLE IF NOT EXISTS public.leads (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    imobiliaria_id UUID NOT NULL REFERENCES public.imobiliarias(id) ON DELETE CASCADE,
    corretor_id UUID REFERENCES public.perfis(id) ON DELETE SET NULL,
    imovel_id UUID REFERENCES public.imoveis(id) ON DELETE SET NULL,
    nome TEXT NOT NULL,
    email TEXT,
    telefone TEXT NOT NULL,
    origem TEXT, -- Site, Zap, VivaReal, Facebook
    status public.lead_status NOT NULL DEFAULT 'novo',
    score INTEGER DEFAULT 0,
    ultima_interacao TIMESTAMPTZ DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. Histórico de Interações
CREATE TABLE IF NOT EXISTS public.leads_interacoes (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
    autor_id UUID NOT NULL REFERENCES public.perfis(id) ON DELETE CASCADE,
    tipo TEXT NOT NULL, -- nota, whatsapp, ligacao, email, visita
    conteudo TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. Templates de Mensagem
CREATE TABLE IF NOT EXISTS public.templates_mensagem (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    imobiliaria_id UUID NOT NULL REFERENCES public.imobiliarias(id) ON DELETE CASCADE,
    titulo TEXT NOT NULL,
    conteudo TEXT NOT NULL,
    tipo TEXT DEFAULT 'whatsapp',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7. Configurações de Distribuição
CREATE TABLE IF NOT EXISTS public.configuracoes_distribuicao (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    imobiliaria_id UUID NOT NULL REFERENCES public.imobiliarias(id) ON DELETE CASCADE UNIQUE,
    modo TEXT NOT NULL DEFAULT 'manual', -- manual, round_robin, primeiro_a_pegar
    tempo_limite_atendimento INTEGER DEFAULT 300, -- segundos para o corretor aceitar
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 8. RLS (Row Level Security)
ALTER TABLE public.perfis ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.imoveis ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads_interacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.templates_mensagem ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.configuracoes_distribuicao ENABLE ROW LEVEL SECURITY;

-- Políticas para Perfis
CREATE POLICY "Users can view profiles in their imobiliaria" ON public.perfis
    FOR SELECT TO authenticated USING (
        imobiliaria_id IN (SELECT imobiliaria_id FROM public.perfis WHERE id = auth.uid())
    );

-- Políticas para Leads
CREATE POLICY "Managers can see all leads in imobiliaria" ON public.leads
    FOR SELECT TO authenticated USING (
        EXISTS (SELECT 1 FROM public.perfis WHERE id = auth.uid() AND (role = 'dono' OR role = 'gerente'))
        AND imobiliaria_id IN (SELECT imobiliaria_id FROM public.perfis WHERE id = auth.uid())
    );

CREATE POLICY "Brokers can see their own leads" ON public.leads
    FOR SELECT TO authenticated USING (
        corretor_id = auth.uid()
    );

-- 9. Triggers para updated_at
CREATE TRIGGER set_perfis_updated_at BEFORE UPDATE ON public.perfis FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_imoveis_updated_at BEFORE UPDATE ON public.imoveis FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_leads_updated_at BEFORE UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
