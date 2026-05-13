-- Sprint 1 — syllabi storage bucket (private, RLS by school_id)
-- PDFs live at storage://syllabi/{school_id}/{program_id}/{filename}.
-- Path scheme makes RLS prefix-match straightforward via storage.foldername(name)[1].

BEGIN;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'syllabi',
  'syllabi',
  FALSE,
  52428800,
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- Read : teacher of the school can read PDFs in their school folder.
CREATE POLICY "syllabi_tenant_read"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'syllabi'
    AND (storage.foldername(name))[1] = public.current_user_school_id()::text
  );

-- Write : teacher of the school can upload to their school folder.
CREATE POLICY "syllabi_tenant_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'syllabi'
    AND (storage.foldername(name))[1] = public.current_user_school_id()::text
  );

-- Delete : teacher can delete their own school's files (used for re-upload).
CREATE POLICY "syllabi_tenant_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'syllabi'
    AND (storage.foldername(name))[1] = public.current_user_school_id()::text
  );

COMMIT;
