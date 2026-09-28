-- Tela de Follow-ups coerente com as janelas 10h/16h (pedido 28/09: "pra eles
-- não se confundirem"). Opções curtas ("30 min", "1h", "2h", "4h depois") não
-- valiam mais do jeito escrito -- a mensagem só sai na leva da manhã (9h30) ou
-- das 16h. Nova opção explícita "Na próxima leva" (base_atraso='proxima_leva'):
--   anterior saiu antes das 13h -> 16h do mesmo dia; a partir das 13h -> manhã do próximo
--   dia útil (9h30); sábado ou domingo -> segunda 9h30.
-- As etapas (2ª em diante) que usavam atraso < 1 dia viram "Na próxima leva".

ALTER TABLE public.followup_passos DROP CONSTRAINT IF EXISTS followup_passos_base_atraso_check;
ALTER TABLE public.followup_passos ADD CONSTRAINT followup_passos_base_atraso_check
  CHECK (base_atraso = ANY (ARRAY['inscricao'::text, 'passo_anterior'::text, 'proxima_leva'::text]));

CREATE OR REPLACE FUNCTION public.followup_proxima_leva(p_ts timestamptz DEFAULT now())
 RETURNS timestamptz
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  v_local timestamp := p_ts AT TIME ZONE 'America/Sao_Paulo';
  v_dow   int       := EXTRACT(DOW FROM v_local);
  v_hora  time      := v_local::time;
  v_dia   date      := v_local::date;
  v_alvo  timestamp;
BEGIN
  -- Referência é a hora em que a mensagem ANTERIOR saiu. Corte às 13h (não
  -- 9h30/16h) pra nunca colar duas mensagens: 1ª às 15h50 não pode ter a
  -- próxima às 16h, nem 1ª às 8h50 a próxima às 9h30.
  IF v_dow = 0 THEN
    v_alvo := (v_dia + 1) + TIME '09:30';
  ELSIF v_dow = 6 THEN
    v_alvo := (v_dia + 2) + TIME '09:30';
  ELSIF v_hora < TIME '13:00' THEN
    v_alvo := v_dia + TIME '16:00';
  ELSIF v_dow = 5 THEN
    v_alvo := (v_dia + 3) + TIME '09:30';
  ELSE
    v_alvo := (v_dia + 1) + TIME '09:30';
  END IF;
  RETURN v_alvo AT TIME ZONE 'America/Sao_Paulo';
END;
$function$;

CREATE OR REPLACE FUNCTION public.followup_calc_proximo_envio(p_base_atraso text, p_atraso_minutos integer, p_inscrito_em timestamp with time zone, p_data_hora_fixa timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS timestamp with time zone
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN p_data_hora_fixa IS NOT NULL THEN p_data_hora_fixa
    WHEN p_base_atraso = 'proxima_leva' THEN followup_proxima_leva(now())
    WHEN p_base_atraso = 'inscricao' THEN p_inscrito_em + make_interval(mins => p_atraso_minutos)
    ELSE now() + make_interval(mins => p_atraso_minutos)
  END;
$function$;

UPDATE public.followup_passos
SET base_atraso = 'proxima_leva', atraso_minutos = 0
WHERE ordem > 1 AND atraso_minutos < 1440 AND data_hora_fixa IS NULL;
