-- Configure le bucket prive pour les PDF de cours uploades par les professeurs.
-- Les fichiers suivent le chemin user_id/course_id/filename.pdf afin que chaque prof
-- puisse acceder uniquement a ses propres documents via les policies RLS.

INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
VALUES (
  'course-pdfs',
  'course-pdfs',
  false,
  52428800,
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'course_pdfs_select_own_files'
  ) THEN
    CREATE POLICY course_pdfs_select_own_files
      ON storage.objects
      FOR SELECT
      TO authenticated
      USING (
        bucket_id = 'course-pdfs'
        AND (storage.foldername(name))[1] = auth.uid()::text
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'course_pdfs_insert_own_files'
  ) THEN
    CREATE POLICY course_pdfs_insert_own_files
      ON storage.objects
      FOR INSERT
      TO authenticated
      WITH CHECK (
        bucket_id = 'course-pdfs'
        AND (storage.foldername(name))[1] = auth.uid()::text
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'course_pdfs_update_own_files'
  ) THEN
    CREATE POLICY course_pdfs_update_own_files
      ON storage.objects
      FOR UPDATE
      TO authenticated
      USING (
        bucket_id = 'course-pdfs'
        AND (storage.foldername(name))[1] = auth.uid()::text
      )
      WITH CHECK (
        bucket_id = 'course-pdfs'
        AND (storage.foldername(name))[1] = auth.uid()::text
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'course_pdfs_delete_own_files'
  ) THEN
    CREATE POLICY course_pdfs_delete_own_files
      ON storage.objects
      FOR DELETE
      TO authenticated
      USING (
        bucket_id = 'course-pdfs'
        AND (storage.foldername(name))[1] = auth.uid()::text
      );
  END IF;
END $$;
