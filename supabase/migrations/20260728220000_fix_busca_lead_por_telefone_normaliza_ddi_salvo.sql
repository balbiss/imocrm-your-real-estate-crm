-- buscar_lead_por_telefone normalizava (removia DDI 55) so o numero
-- BUSCADO, nunca o leads.telefone JA SALVO. Como 87% dos leads (763/872)
-- estao salvos COM o "55" na frente (vem de varios formularios de anuncio
-- diferentes ao longo do tempo, alem de leads antigos criados via WhatsApp
-- antes do telefoneSemDDI existir no webhook.js), a busca praticamente nao
-- encontrava a maioria dos leads existentes -- toda mensagem nova de um
-- contato (mesmo de um lead ja descartado) criava um lead duplicado em vez
-- de reabrir o card certo.
CREATE OR REPLACE FUNCTION public.buscar_lead_por_telefone(telefone_busca text)
 RETURNS TABLE(id uuid, imobiliaria_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  tel_busca_limpo text;
  tel_busca_sem_ddi text;
  tel_busca_ddd text;
  tel_busca_sufixo text;
BEGIN
  tel_busca_limpo := regexp_replace(telefone_busca, '[^\d]', '', 'g');

  IF (substring(tel_busca_limpo from 1 for 2) = '55' AND length(tel_busca_limpo) >= 12) THEN
    tel_busca_sem_ddi := substring(tel_busca_limpo from 3);
  ELSE
    tel_busca_sem_ddi := tel_busca_limpo;
  END IF;

  IF length(tel_busca_sem_ddi) >= 10 THEN
    tel_busca_ddd := substring(tel_busca_sem_ddi from 1 for 2);
    tel_busca_sufixo := substring(tel_busca_sem_ddi from length(tel_busca_sem_ddi) - 7);
  ELSE
    tel_busca_ddd := '';
    tel_busca_sufixo := tel_busca_sem_ddi;
  END IF;

  RETURN QUERY
  SELECT l.id, l.imobiliaria_id
  FROM leads l
  CROSS JOIN LATERAL (
    SELECT
      CASE
        WHEN substring(regexp_replace(l.telefone, '[^\d]', '', 'g') from 1 for 2) = '55'
             AND length(regexp_replace(l.telefone, '[^\d]', '', 'g')) >= 12
        THEN substring(regexp_replace(l.telefone, '[^\d]', '', 'g') from 3)
        ELSE regexp_replace(l.telefone, '[^\d]', '', 'g')
      END AS lead_tel_sem_ddi
  ) t
  WHERE
    t.lead_tel_sem_ddi = tel_busca_sem_ddi
    OR
    (
      tel_busca_ddd <> ''
      AND length(t.lead_tel_sem_ddi) >= 10
      AND substring(t.lead_tel_sem_ddi from 1 for 2) = tel_busca_ddd
      AND substring(t.lead_tel_sem_ddi from length(t.lead_tel_sem_ddi) - 7) = tel_busca_sufixo
    );
END;
$function$;
