-- "Remover da equipe" (relato do dono 30/09: Farah, Julia, Leonardo e Michael
-- "eu já tinha deletado mas continuam aqui" + "Erro ao remover membro: Edge
-- Function returned a non-2xx status code").
--
-- A exclusão definitiva (edge function delete-member) não tem como dar certo:
-- o perfil é referenciado por mensagens, histórico do card, follow-ups etc.
-- Pior: a função rodava sem checar quem chamava (verify_jwt=false, sem
-- checagem de papel) e, antes de falhar, já soltava os leads da pessoa e
-- apagava o histórico de distribuição dela.
--
-- Agora remover = desligar a pessoa sem apagar história:
--   * perfil bloqueado (get_auth_imobiliaria_id() já corta todo acesso),
--     fora da roleta/plantão, marcado removido_em (some da Equipe e das
--     listas de escolher corretor; continua aparecendo no histórico);
--   * WhatsApp desvinculado da conta (linha em whatsapp_instances apagada --
--     não derruba a sessão, que pode ser a mesma de outra conta com o mesmo
--     número, caso real Michael/Barbara e Farah/Mariaan);
--   * sai da fila da roleta e da escala;
--   * leads dela vão pra Rebatida (não ficam "sem dono" fora de coluna);
--   * follow-ups ativos dela são encerrados.

ALTER TABLE public.perfis ADD COLUMN IF NOT EXISTS removido_em timestamptz;

CREATE OR REPLACE FUNCTION public.remover_membro(p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_alvo           record;
  v_imob           uuid := get_auth_imobiliaria_id();
  v_coluna_rebatida uuid;
  v_leads          integer;
  v_followups      integer;
BEGIN
  IF get_auth_role() NOT IN ('dono', 'gerente') OR v_imob IS NULL THEN
    RAISE EXCEPTION 'Só o dono ou gerente pode remover alguém da equipe.';
  END IF;
  IF p_id = auth.uid() THEN
    RAISE EXCEPTION 'Você não pode remover a si mesmo.';
  END IF;

  SELECT id, nome, role, imobiliaria_id INTO v_alvo FROM perfis WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR v_alvo.imobiliaria_id IS DISTINCT FROM v_imob THEN
    RAISE EXCEPTION 'Membro não encontrado nesta imobiliária.';
  END IF;
  IF v_alvo.role = 'dono' THEN
    RAISE EXCEPTION 'O dono da imobiliária não pode ser removido.';
  END IF;

  UPDATE perfis
  SET bloqueado = true, status_roleta = false, em_plantao = false, removido_em = now()
  WHERE id = p_id;

  DELETE FROM whatsapp_instances WHERE user_id = p_id;
  DELETE FROM filas_atendimento WHERE corretor_id = p_id;
  DELETE FROM escala_plantao WHERE corretor_id = p_id;

  WITH r AS (
    UPDATE followup_execucoes
    SET status = 'encerrado_manual', finalizado_em = now(),
        motivo_parada = 'corretor removido da equipe',
        reservado_em = NULL, enviando_passo = NULL, enviando_desde = NULL
    WHERE corretor_id = p_id AND status = 'ativo'
    RETURNING 1
  ) SELECT count(*) INTO v_followups FROM r;

  SELECT id INTO v_coluna_rebatida FROM colunas_kanban
  WHERE imobiliaria_id = v_imob AND nome ILIKE '%rebatid%' ORDER BY posicao LIMIT 1;

  WITH r AS (
    UPDATE leads
    SET corretor_id = NULL, status = 'rebatida',
        coluna_kanban_id = COALESCE(v_coluna_rebatida, coluna_kanban_id),
        lembrete_follow_up = NULL, ultima_acao_at = now()
    WHERE corretor_id = p_id
    RETURNING 1
  ) SELECT count(*) INTO v_leads FROM r;

  RETURN jsonb_build_object('nome', v_alvo.nome, 'leads_para_rebatida', v_leads, 'followups_encerrados', v_followups);
END;
$function$;

REVOKE ALL ON FUNCTION public.remover_membro(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remover_membro(uuid) TO authenticated;
