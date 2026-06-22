-- Criar a tabela de colunas de kanban
CREATE TABLE IF NOT EXISTS public.colunas_kanban (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    imobiliaria_id UUID REFERENCES public.imobiliarias(id) ON DELETE CASCADE NOT NULL,
    nome TEXT NOT NULL,
    cor TEXT NOT NULL DEFAULT 'bg-blue-500',
    posicao INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Adicionar coluna coluna_kanban_id na tabela de leads
ALTER TABLE public.leads 
ADD COLUMN IF NOT EXISTS coluna_kanban_id UUID REFERENCES public.colunas_kanban(id) ON DELETE SET NULL;

-- Ativar RLS
ALTER TABLE public.colunas_kanban ENABLE ROW LEVEL SECURITY;

-- Criar política de RLS para colunas_kanban
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'colunas_kanban_all' AND tablename = 'colunas_kanban'
    ) THEN
        CREATE POLICY "colunas_kanban_all" ON public.colunas_kanban
            FOR ALL TO authenticated
            USING (imobiliaria_id = get_auth_imobiliaria_id())
            WITH CHECK (imobiliaria_id = get_auth_imobiliaria_id());
    END IF;
END $$;

-- Trigger para novas imobiliárias terem colunas padrão
CREATE OR REPLACE FUNCTION public.handle_new_imobiliaria_kanban()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    INSERT INTO public.colunas_kanban (imobiliaria_id, nome, cor, posicao) VALUES
    (NEW.id, 'LEAD NOVO', 'bg-blue-500', 0),
    (NEW.id, 'REBATIDA', 'bg-orange-500', 1),
    (NEW.id, 'TAREFAS', 'bg-red-500', 2),
    (NEW.id, 'AGENDADO', 'bg-purple-500', 3),
    (NEW.id, 'VISITOU', 'bg-amber-500', 4),
    (NEW.id, 'COBRAR DOC', 'bg-cyan-500', 5),
    (NEW.id, 'PENDENTE', 'bg-slate-500', 6),
    (NEW.id, 'APROVADO', 'bg-emerald-500', 7),
    (NEW.id, 'REPROVADO', 'bg-rose-600', 8),
    (NEW.id, 'FUTUROS', 'bg-indigo-500', 9);
    RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER on_imobiliaria_created_kanban
AFTER INSERT ON public.imobiliarias
FOR EACH ROW EXECUTE FUNCTION public.handle_new_imobiliaria_kanban();

-- Trigger para mover leads de colunas excluídas para outra coluna ativa
CREATE OR REPLACE FUNCTION public.handle_delete_coluna_kanban()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_substituta_id UUID;
BEGIN
    -- Encontrar a primeira coluna restante da mesma imobiliária que não seja a deletada
    SELECT id INTO v_substituta_id 
    FROM public.colunas_kanban 
    WHERE imobiliaria_id = OLD.imobiliaria_id AND id != OLD.id
    ORDER BY posicao ASC 
    LIMIT 1;

    -- Se houver outra coluna, redireciona os leads
    IF v_substituta_id IS NOT NULL THEN
        UPDATE public.leads SET coluna_kanban_id = v_substituta_id WHERE coluna_kanban_id = OLD.id;
    END IF;
    
    RETURN OLD;
END;
$$;

CREATE OR REPLACE TRIGGER on_coluna_kanban_deleted
BEFORE DELETE ON public.colunas_kanban
FOR EACH ROW EXECUTE FUNCTION public.handle_delete_coluna_kanban();

-- Migrar as imobiliárias existentes (criar as colunas padrão e atualizar leads)
DO $$
DECLARE
    r_imobiliaria RECORD;
    v_id_novo UUID;
    v_id_rebatida UUID;
    v_id_tarefas UUID;
    v_id_agendado UUID;
    v_id_visitou UUID;
    v_id_cobrar_doc UUID;
    v_id_pendente UUID;
    v_id_aprovado UUID;
    v_id_reprovado UUID;
    v_id_futuros UUID;
BEGIN
    FOR r_imobiliaria IN SELECT id FROM public.imobiliarias LOOP
        -- Verificar se a imobiliaria já tem colunas criadas (para evitar duplicações)
        IF NOT EXISTS (SELECT 1 FROM public.colunas_kanban WHERE imobiliaria_id = r_imobiliaria.id) THEN
            -- Criar as colunas
            INSERT INTO public.colunas_kanban (imobiliaria_id, nome, cor, posicao) 
            VALUES (r_imobiliaria.id, 'LEAD NOVO', 'bg-blue-500', 0) RETURNING id INTO v_id_novo;
            
            INSERT INTO public.colunas_kanban (imobiliaria_id, nome, cor, posicao) 
            VALUES (r_imobiliaria.id, 'REBATIDA', 'bg-orange-500', 1) RETURNING id INTO v_id_rebatida;
            
            INSERT INTO public.colunas_kanban (imobiliaria_id, nome, cor, posicao) 
            VALUES (r_imobiliaria.id, 'TAREFAS', 'bg-red-500', 2) RETURNING id INTO v_id_tarefas;
            
            INSERT INTO public.colunas_kanban (imobiliaria_id, nome, cor, posicao) 
            VALUES (r_imobiliaria.id, 'AGENDADO', 'bg-purple-500', 3) RETURNING id INTO v_id_agendado;
            
            INSERT INTO public.colunas_kanban (imobiliaria_id, nome, cor, posicao) 
            VALUES (r_imobiliaria.id, 'VISITOU', 'bg-amber-500', 4) RETURNING id INTO v_id_visitou;
            
            INSERT INTO public.colunas_kanban (imobiliaria_id, nome, cor, posicao) 
            VALUES (r_imobiliaria.id, 'COBRAR DOC', 'bg-cyan-500', 5) RETURNING id INTO v_id_cobrar_doc;
            
            INSERT INTO public.colunas_kanban (imobiliaria_id, nome, cor, posicao) 
            VALUES (r_imobiliaria.id, 'PENDENTE', 'bg-slate-500', 6) RETURNING id INTO v_id_pendente;
            
            INSERT INTO public.colunas_kanban (imobiliaria_id, nome, cor, posicao) 
            VALUES (r_imobiliaria.id, 'APROVADO', 'bg-emerald-500', 7) RETURNING id INTO v_id_aprovado;
            
            INSERT INTO public.colunas_kanban (imobiliaria_id, nome, cor, posicao) 
            VALUES (r_imobiliaria.id, 'REPROVADO', 'bg-rose-600', 8) RETURNING id INTO v_id_reprovado;
            
            INSERT INTO public.colunas_kanban (imobiliaria_id, nome, cor, posicao) 
            VALUES (r_imobiliaria.id, 'FUTUROS', 'bg-indigo-500', 9) RETURNING id INTO v_id_futuros;
            
            -- Atualizar leads correspondentes da imobiliaria
            UPDATE public.leads SET coluna_kanban_id = v_id_novo WHERE imobiliaria_id = r_imobiliaria.id AND (status::text = 'novo' OR status IS NULL);
            UPDATE public.leads SET coluna_kanban_id = v_id_rebatida WHERE imobiliaria_id = r_imobiliaria.id AND status::text = 'rebatida';
            UPDATE public.leads SET coluna_kanban_id = v_id_tarefas WHERE imobiliaria_id = r_imobiliaria.id AND status::text = 'tarefas';
            UPDATE public.leads SET coluna_kanban_id = v_id_agendado WHERE imobiliaria_id = r_imobiliaria.id AND status::text = 'agendado';
            UPDATE public.leads SET coluna_kanban_id = v_id_visitou WHERE imobiliaria_id = r_imobiliaria.id AND status::text = 'visitou';
            UPDATE public.leads SET coluna_kanban_id = v_id_cobrar_doc WHERE imobiliaria_id = r_imobiliaria.id AND status::text = 'cobrar_doc';
            UPDATE public.leads SET coluna_kanban_id = v_id_pendente WHERE imobiliaria_id = r_imobiliaria.id AND status::text = 'pendente';
            UPDATE public.leads SET coluna_kanban_id = v_id_aprovado WHERE imobiliaria_id = r_imobiliaria.id AND status::text = 'aprovado';
            UPDATE public.leads SET coluna_kanban_id = v_id_reprovado WHERE imobiliaria_id = r_imobiliaria.id AND status::text = 'reprovado';
            UPDATE public.leads SET coluna_kanban_id = v_id_futuros WHERE imobiliaria_id = r_imobiliaria.id AND status::text = 'futuros';
        END IF;
    END LOOP;
END $$;
