-- Allow event creators to delete their own events.
-- Mirrors the existing UPDATE policy (auth.uid() = created_by).
-- event_attendees cascades on delete (FK ON DELETE CASCADE) so no manual cleanup.
CREATE POLICY "Event creators can delete events"
  ON public.events
  FOR DELETE
  USING (auth.uid() = created_by);
