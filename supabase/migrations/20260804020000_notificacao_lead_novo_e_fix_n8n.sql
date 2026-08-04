-- Investigacao do item "lead esta demorando quase 10 minutos pra chegar no CRM":
-- medido nas ultimas execucoes reais do workflow n8n (FACEBOOK FORM - CAPTACAO
-- LEADS) -- o tempo entre o Facebook mandar o webhook e o lead ser criado no
-- Supabase e de 1 a 2 segundos, sempre. Nao ha atraso nenhum no nosso pipeline.
-- O que de fato nao existia era qualquer notificacao/push quando um lead do
-- Facebook cai pra um corretor -- diferente de mensagem de WhatsApp (que dispara
-- push via server/src/routes/webhook.js), lead novo de anuncio so aparecia
-- quando o corretor abria a tela de Leads (refetch de 60s). Isso explica a
-- sensacao de demora: o lead ja estava la, só ninguem era avisado.
-- Fix: trigger AFTER INSERT em leads que cria uma notificacao (mesmo mecanismo
-- ja usado por notificar_leads_analise_credito, com realtime via useNotifications)
-- pro corretor que a roleta atribuiu, sempre que a origem nao for WhatsApp
-- (mensagem de WhatsApp ja tem seu proprio aviso, nao duplicar).
CREATE OR REPLACE FUNCTION public.notificar_novo_lead_atribuido()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  IF NEW.corretor_id IS NOT NULL AND COALESCE(NEW.origem, '') NOT ILIKE 'whatsapp%' THEN
    INSERT INTO notificacoes (usuario_id, imobiliaria_id, lead_id, tipo, titulo, lida)
    VALUES (
      NEW.corretor_id,
      NEW.imobiliaria_id,
      NEW.id,
      'lead_novo_atribuido',
      'Novo lead recebido: ' || COALESCE(NULLIF(NEW.nome, ''), NEW.telefone, 'Sem nome'),
      false
    );
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_notificar_novo_lead ON leads;
CREATE TRIGGER trg_notificar_novo_lead
  AFTER INSERT ON public.leads
  FOR EACH ROW EXECUTE FUNCTION notificar_novo_lead_atribuido();

-- Nota separada (sem SQL): o workflow n8n "FACEBOOK FORM - CAPTACAO LEADS"
-- (i9u30zrBt4FLGvIs) tinha o node "ANUNCIO" com o ID do anuncio HARDCODED
-- (sempre o mesmo, de um teste antigo) em vez de usar o ad_id real de cada
-- lead (ja extraido em "DADOS - WB" a partir do webhook) -- por isso ~36% dos
-- leads recentes vinham com origem "[ANUNCIO][10][SETE SOIS]" fixo, errado.
-- Corrigido direto no n8n (nao versionado em migration por nao ser deste repo).
-- Alem disso, o worker do n8n estava rodando uma versao EM CACHE do workflow
-- (activeVersionId desatualizado em relacao ao versionId salvo) -- por isso o
-- fix de 14/07 pra nome/telefone/email trocados nunca tinha entrado em vigor
-- de verdade, mesmo estando correto no editor. Corrigido desativando e
-- reativando o workflow (forca o n8n a recarregar a versao atual).
