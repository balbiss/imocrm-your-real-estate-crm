-- Bug real reportado (05/08): corretor descarta o lead ("Sem Resposta" etc),
-- ve o toast de sucesso, mas o lead nao some -- continua com ele, e alguns
-- reaparecem em Tarefas depois. Causa raiz: handleDescarte (LeadDetailsModal)
-- fazia um UPDATE direto em leads tentando zerar corretor_id -- e esse
-- update e bloqueado pela RLS quando executado pelo proprio corretor
-- (confirmado testando via SET LOCAL ROLE authenticated + request.jwt.claims:
-- qualquer UPDATE que toca corretor_id falha com 42501 pro papel corretor,
-- mesmo com WITH CHECK identico ao USING da policy leads_update -- o
-- mecanismo exato nao ficou 100% claro, mas o padrao ja usado em outros
-- lugares do app pra mudar corretor_id -- RPC SECURITY DEFINER, ver
-- distribuir_leads_massa -- comprovadamente funciona). Como o codigo cliente
-- nao checava {error} do .update()/.insert(), a falha ficava invisivel: o
-- corretor via "Lead devolvido ao bolsao" mesmo com o UPDATE tendo falhado.
--
-- Fix: descarte normal (motivos != Descadastrar/Ja Comprou) passa a usar
-- essa RPC SECURITY DEFINER em vez de update direto -- mesmo padrao que ja
-- funciona pra "+ Mais Rebatidas"/Transferir.
CREATE OR REPLACE FUNCTION public.descartar_lead_normal(p_lead_id uuid, p_motivo text, p_observacao text DEFAULT NULL)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_corretor_id uuid;
BEGIN
  SELECT corretor_id INTO v_corretor_id FROM leads WHERE id = p_lead_id;

  IF v_corretor_id IS DISTINCT FROM auth.uid() AND get_auth_role() NOT IN ('dono', 'gerente') THEN
    RAISE EXCEPTION 'Sem permissão para descartar este lead.';
  END IF;

  UPDATE leads SET
    corretor_id = NULL,
    coluna_kanban_id = NULL,
    motivo_descarte = p_motivo,
    descartado_por = auth.uid(),
    descartado_em = NOW(),
    status = 'novo',
    ultima_acao_at = NOW()
  WHERE id = p_lead_id;

  INSERT INTO leads_interacoes (lead_id, autor_id, tipo, conteudo)
  VALUES (
    p_lead_id, auth.uid(), 'descarte',
    'Lead devolvido: ' || p_motivo || COALESCE(' - ' || p_observacao, '')
  );
END;
$function$;
