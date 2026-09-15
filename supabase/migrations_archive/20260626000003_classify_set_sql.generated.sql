-- !!! GENERATED FILE - DO NOT EDIT. Source: scripts/codegen/set-classification.spec.ts
-- Regenerate with: npm run codegen
CREATE OR REPLACE FUNCTION public.classify_set_sql(p_g1 int, p_g2 int)
RETURNS TABLE (is_completed boolean, is_void boolean, winner int)
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT
    comp,
    (NOT comp) AND (p_g1 + p_g2) < 6,
    CASE WHEN p_g1 > p_g2 THEN 1 WHEN p_g2 > p_g1 THEN 2 ELSE 0 END
  FROM (
    SELECT (GREATEST(p_g1, p_g2) >= 6 AND ABS(p_g1 - p_g2) >= 2)
        OR (GREATEST(p_g1, p_g2) = 7 AND LEAST(p_g1, p_g2) = 6) AS comp
  ) c;
$$;
