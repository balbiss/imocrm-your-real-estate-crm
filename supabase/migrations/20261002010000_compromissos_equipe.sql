-- Compromissos da equipe que não são de lead (pedido do dono, 02/10:
-- "em tarefas tem como agendar compromisso que não tenham a ver com leads?
-- Tipo treinamento, reunião"). Respostas do dono: TODOS podem criar e o
-- compromisso aparece pra TODOS. Aviso no sino 1h antes; sem repetição.

CREATE TABLE IF NOT EXISTS public.compromissos_equipe (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  imobiliaria_id  uuid NOT NULL REFERENCES public.imobiliarias(id) ON DELETE CASCADE,
  titulo          text NOT NULL CHECK (btrim(titulo) <> ''),
  tipo            text NOT NULL DEFAULT 'reuniao' CHECK (tipo IN ('reuniao', 'treinamento', 'outro')),
  inicio          timestamptz NOT NULL,
  fim             timestamptz,
  local           text,
  observacao      text,
  criado_por      uuid NOT NULL REFERENCES public.perfis(id),
  cancelado_em    timestamptz,
  aviso_enviado_em timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CHECK (fim IS NULL OR fim > inicio)
);

CREATE INDEX IF NOT EXISTS idx_compromissos_equipe_imob_inicio ON public.compromissos_equipe (imobiliaria_id, inicio);

ALTER TABLE public.compromissos_equipe ENABLE ROW LEVEL SECURITY;

-- Todo mundo da imobiliária vê.
DROP POLICY IF EXISTS compromissos_select ON public.compromissos_equipe;
CREATE POLICY compromissos_select ON public.compromissos_equipe FOR SELECT TO authenticated
  USING (imobiliaria_id = get_auth_imobiliaria_id());

-- Todo mundo da imobiliária cria (em nome próprio).
DROP POLICY IF EXISTS compromissos_insert ON public.compromissos_equipe;
CREATE POLICY compromissos_insert ON public.compromissos_equipe FOR INSERT TO authenticated
  WITH CHECK (imobiliaria_id = get_auth_imobiliaria_id() AND criado_por = auth.uid());

-- Edita/cancela: quem criou, ou dono/gerente.
DROP POLICY IF EXISTS compromissos_update ON public.compromissos_equipe;
CREATE POLICY compromissos_update ON public.compromissos_equipe FOR UPDATE TO authenticated
  USING (imobiliaria_id = get_auth_imobiliaria_id()
         AND (criado_por = auth.uid() OR get_auth_role() = ANY (ARRAY['dono'::text, 'gerente'::text])))
  WITH CHECK (imobiliaria_id = get_auth_imobiliaria_id());

-- Aviso no sino 1h antes, pra toda a equipe (quem não foi removido nem está
-- bloqueado). Roda a cada 5 min; aviso_enviado_em garante 1 aviso só. Se o
-- compromisso for criado com menos de 1h de antecedência, avisa na próxima
-- passada. Se mudarem o horário, o front zera aviso_enviado_em.
CREATE OR REPLACE FUNCTION public.avisar_compromissos_equipe()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_n integer := 0;
BEGIN
  WITH alvo AS (
    UPDATE compromissos_equipe c
    SET aviso_enviado_em = now()
    WHERE c.cancelado_em IS NULL AND c.aviso_enviado_em IS NULL
      AND c.inicio > now() AND c.inicio <= now() + interval '1 hour'
    RETURNING c.id, c.imobiliaria_id, c.titulo, c.inicio, c.local
  ), ins AS (
    INSERT INTO notificacoes (usuario_id, imobiliaria_id, tipo, titulo, lida)
    SELECT p.id, a.imobiliaria_id, 'compromisso',
      '📅 ' || a.titulo || ' às ' || to_char(a.inicio AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI')
        || COALESCE(' — ' || NULLIF(btrim(a.local), ''), ''),
      false
    FROM alvo a
    JOIN perfis p ON p.imobiliaria_id = a.imobiliaria_id
    WHERE p.removido_em IS NULL AND COALESCE(p.bloqueado, false) = false
    RETURNING 1
  )
  SELECT count(*) INTO v_n FROM alvo;
  RETURN v_n;
END;
$function$;

REVOKE ALL ON FUNCTION public.avisar_compromissos_equipe() FROM PUBLIC, anon, authenticated;

SELECT cron.unschedule('avisar-compromissos-equipe')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'avisar-compromissos-equipe');
SELECT cron.schedule('avisar-compromissos-equipe', '*/5 * * * *', 'SELECT public.avisar_compromissos_equipe()');
