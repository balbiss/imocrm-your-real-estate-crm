-- Tabela para armazenar as instâncias do WUZAPI de forma individual
CREATE TABLE IF NOT EXISTS public.whatsapp_instances (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES public.perfis(id) ON DELETE CASCADE UNIQUE,
    wuzapi_token TEXT NOT NULL,
    wuzapi_user_id TEXT,
    jid TEXT,
    connected BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Habilitar RLS (Row Level Security)
ALTER TABLE public.whatsapp_instances ENABLE ROW LEVEL SECURITY;

-- Políticas para whatsapp_instances
-- O usuário pode ver a própria instância
CREATE POLICY "Users can view their own whatsapp instance"
    ON public.whatsapp_instances FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());

-- O usuário pode inserir sua própria instância
CREATE POLICY "Users can insert their own whatsapp instance"
    ON public.whatsapp_instances FOR INSERT
    TO authenticated
    WITH CHECK (user_id = auth.uid());

-- O usuário pode atualizar sua própria instância
CREATE POLICY "Users can update their own whatsapp instance"
    ON public.whatsapp_instances FOR UPDATE
    TO authenticated
    USING (user_id = auth.uid());

-- O usuário pode deletar sua própria instância
CREATE POLICY "Users can delete their own whatsapp instance"
    ON public.whatsapp_instances FOR DELETE
    TO authenticated
    USING (user_id = auth.uid());

-- Trigger para updated_at
CREATE TRIGGER set_whatsapp_instances_updated_at 
    BEFORE UPDATE ON public.whatsapp_instances 
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
