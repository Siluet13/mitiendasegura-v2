
-- set_updated_at: fijar search_path
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- current_owner_id: SECURITY INVOKER (auth.uid() no requiere privilegios elevados)
CREATE OR REPLACE FUNCTION public.current_owner_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT auth.uid()
$$;

-- set_owner_id: solo trigger interno; revocar EXECUTE público
REVOKE EXECUTE ON FUNCTION public.set_owner_id() FROM PUBLIC, anon, authenticated;
