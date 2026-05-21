-- Allow league creators to delete their own leagues.
-- Previously no DELETE policy existed, so .delete() was silently blocked by RLS.

CREATE POLICY "Creator can delete league"
  ON leagues FOR DELETE
  USING (created_by = auth.uid());
