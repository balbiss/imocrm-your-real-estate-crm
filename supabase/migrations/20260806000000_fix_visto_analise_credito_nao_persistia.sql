-- Bug real reportado (06/08): dono/gerente clica "Visto" na Analise de
-- Credito, mas o card continua vermelho como se nao tivesse dado OK.
-- Causa raiz: o card so ficava vermelho com base em "esta na coluna
-- Analise de Credito" (LeadsKanban.tsx, emAnaliseCredito) -- nao existia
-- NENHUM campo persistido marcando que a auditoria ja foi feita. O botao
-- "Visto" so atualizava ultima_acao_at, entao a proxima renderizacao via
-- o card na mesma coluna e pintava vermelho de novo, sempre.
--
-- Fix: novo campo credito_aprovado_em. "Visto" grava o timestamp; o card
-- so fica vermelho se emAnaliseCredito E credito_aprovado_em IS NULL. Se o
-- lead sair e voltar pra Analise de Credito (reaberto), o trigger de
-- entrada zera o campo de novo pra reativar o alerta.
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS credito_aprovado_em timestamptz;

CREATE OR REPLACE FUNCTION public.notificar_entrada_analise_credito()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_coluna_nome_nova text;
BEGIN
  IF NEW.coluna_kanban_id IS DISTINCT FROM OLD.coluna_kanban_id THEN
    SELECT nome INTO v_coluna_nome_nova FROM colunas_kanban WHERE id = NEW.coluna_kanban_id;
    IF (v_coluna_nome_nova ILIKE '%analise%' OR v_coluna_nome_nova ILIKE '%análise%')
       AND (v_coluna_nome_nova ILIKE '%credito%' OR v_coluna_nome_nova ILIKE '%crédito%') THEN
      NEW.credito_aprovado_em := NULL;
      INSERT INTO notificacoes (usuario_id, imobiliaria_id, lead_id, tipo, titulo, lida)
      SELECT p.id, NEW.imobiliaria_id, NEW.id, 'nova_analise_credito',
        'Nova pasta enviada para Análise de Crédito: ' || COALESCE(NEW.nome, NEW.telefone), false
      FROM perfis p WHERE p.imobiliaria_id = NEW.imobiliaria_id AND p.role IN ('gerente', 'dono');
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_notificar_entrada_analise_credito ON leads;
CREATE TRIGGER trg_notificar_entrada_analise_credito
  BEFORE UPDATE OF coluna_kanban_id ON public.leads
  FOR EACH ROW EXECUTE FUNCTION notificar_entrada_analise_credito();
