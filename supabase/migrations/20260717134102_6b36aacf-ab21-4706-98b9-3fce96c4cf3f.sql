
-- Admin full access
CREATE POLICY "admin storage all" ON storage.objects FOR ALL TO authenticated
USING (bucket_id = 'project-files' AND public.is_admin(auth.uid()))
WITH CHECK (bucket_id = 'project-files' AND public.is_admin(auth.uid()));

-- Clients read files in their workspaces. Path pattern: {workspace_id}/{filename}
CREATE POLICY "client read own workspace files" ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'project-files'
  AND EXISTS (
    SELECT 1 FROM public.workspaces w
    WHERE w.client_user_id = auth.uid()
      AND (storage.foldername(storage.objects.name))[1] = w.id::text
  )
);

-- Grant execute on is_admin to authenticated (needed by policies above)
GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO authenticated;
