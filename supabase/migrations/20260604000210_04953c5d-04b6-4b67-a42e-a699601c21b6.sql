
-- =========================================================
-- Tenancy scope function (today = auth.uid(); tomorrow can return organization_id)
-- =========================================================
CREATE OR REPLACE FUNCTION public.current_owner_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid()
$$;

-- =========================================================
-- Generic updated_at trigger
-- =========================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- =========================================================
-- Generic owner_id auto-fill trigger
-- =========================================================
CREATE OR REPLACE FUNCTION public.set_owner_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.owner_id IS NULL THEN
    NEW.owner_id = public.current_owner_id();
  END IF;
  IF NEW.owner_id IS NULL THEN
    RAISE EXCEPTION 'owner_id cannot be null (no authenticated user)';
  END IF;
  RETURN NEW;
END;
$$;

-- =========================================================
-- categories
-- =========================================================
CREATE TABLE public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL,
  nombre TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT categories_nombre_owner_unique UNIQUE (owner_id, nombre)
);
CREATE INDEX categories_owner_id_idx ON public.categories(owner_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.categories TO authenticated;
GRANT ALL ON public.categories TO service_role;

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "categories_select_own" ON public.categories
  FOR SELECT TO authenticated
  USING (owner_id = public.current_owner_id());

CREATE POLICY "categories_insert_own" ON public.categories
  FOR INSERT TO authenticated
  WITH CHECK (owner_id = public.current_owner_id() OR owner_id IS NULL);

CREATE POLICY "categories_update_own" ON public.categories
  FOR UPDATE TO authenticated
  USING (owner_id = public.current_owner_id())
  WITH CHECK (owner_id = public.current_owner_id());

CREATE POLICY "categories_delete_own" ON public.categories
  FOR DELETE TO authenticated
  USING (owner_id = public.current_owner_id());

CREATE TRIGGER categories_set_owner_id
  BEFORE INSERT ON public.categories
  FOR EACH ROW EXECUTE FUNCTION public.set_owner_id();

CREATE TRIGGER categories_set_updated_at
  BEFORE UPDATE ON public.categories
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================================
-- products
-- =========================================================
CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL,
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  nombre TEXT NOT NULL,
  descripcion TEXT,
  sku TEXT,
  precio NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (precio >= 0),
  stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  stock_minimo INTEGER NOT NULL DEFAULT 0 CHECK (stock_minimo >= 0),
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT products_sku_owner_unique UNIQUE (owner_id, sku)
);
CREATE INDEX products_owner_id_idx ON public.products(owner_id);
CREATE INDEX products_category_id_idx ON public.products(category_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "products_select_own" ON public.products
  FOR SELECT TO authenticated
  USING (owner_id = public.current_owner_id());

CREATE POLICY "products_insert_own" ON public.products
  FOR INSERT TO authenticated
  WITH CHECK (owner_id = public.current_owner_id() OR owner_id IS NULL);

CREATE POLICY "products_update_own" ON public.products
  FOR UPDATE TO authenticated
  USING (owner_id = public.current_owner_id())
  WITH CHECK (owner_id = public.current_owner_id());

CREATE POLICY "products_delete_own" ON public.products
  FOR DELETE TO authenticated
  USING (owner_id = public.current_owner_id());

CREATE TRIGGER products_set_owner_id
  BEFORE INSERT ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.set_owner_id();

CREATE TRIGGER products_set_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
