ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS costo numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS codigo_barras text;

CREATE UNIQUE INDEX IF NOT EXISTS products_owner_codigo_barras_unique
  ON public.products(owner_id, codigo_barras)
  WHERE codigo_barras IS NOT NULL;