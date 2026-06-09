-- Enum tipo de movimiento
DO $$ BEGIN
  CREATE TYPE public.stock_movement_type AS ENUM ('entrada', 'salida');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE public.stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  user_id uuid NOT NULL,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  tipo public.stock_movement_type NOT NULL,
  cantidad integer NOT NULL,
  observacion text,
  -- Hooks para futuras fases (ventas, lotes, ajustes) sin reestructurar:
  referencia_tipo text,   -- ej: 'venta' | 'lote' | 'ajuste' (libre por ahora)
  referencia_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX stock_movements_owner_created_idx
  ON public.stock_movements(owner_id, created_at DESC);
CREATE INDEX stock_movements_product_created_idx
  ON public.stock_movements(product_id, created_at DESC);
CREATE INDEX stock_movements_referencia_idx
  ON public.stock_movements(referencia_tipo, referencia_id);

GRANT SELECT, INSERT ON public.stock_movements TO authenticated;
GRANT ALL ON public.stock_movements TO service_role;

ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY stock_movements_select_own ON public.stock_movements
  FOR SELECT TO authenticated
  USING (owner_id = public.current_owner_id());

CREATE POLICY stock_movements_insert_own ON public.stock_movements
  FOR INSERT TO authenticated
  WITH CHECK (
    (owner_id = public.current_owner_id() OR owner_id IS NULL)
    AND (user_id = auth.uid() OR user_id IS NULL)
  );

-- Reutiliza trigger genérico de owner_id
CREATE TRIGGER stock_movements_set_owner_id
  BEFORE INSERT ON public.stock_movements
  FOR EACH ROW EXECUTE FUNCTION public.set_owner_id();

-- Auto-set user_id
CREATE OR REPLACE FUNCTION public.set_user_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.user_id IS NULL THEN
    NEW.user_id := auth.uid();
  END IF;
  IF NEW.user_id IS NULL THEN
    RAISE EXCEPTION 'user_id cannot be null (no authenticated user)';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER stock_movements_set_user_id
  BEFORE INSERT ON public.stock_movements
  FOR EACH ROW EXECUTE FUNCTION public.set_user_id();

-- Validación + aplicación atómica al stock del producto
CREATE OR REPLACE FUNCTION public.apply_stock_movement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_stock integer;
  prod_owner uuid;
BEGIN
  IF NEW.cantidad IS NULL OR NEW.cantidad <= 0 THEN
    RAISE EXCEPTION 'La cantidad debe ser mayor a 0';
  END IF;

  SELECT stock, owner_id INTO current_stock, prod_owner
  FROM public.products
  WHERE id = NEW.product_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Producto no encontrado';
  END IF;

  IF prod_owner <> NEW.owner_id THEN
    RAISE EXCEPTION 'El producto no pertenece al usuario';
  END IF;

  IF NEW.tipo = 'entrada' THEN
    UPDATE public.products
       SET stock = stock + NEW.cantidad, updated_at = now()
     WHERE id = NEW.product_id;
  ELSIF NEW.tipo = 'salida' THEN
    IF current_stock - NEW.cantidad < 0 THEN
      RAISE EXCEPTION 'Stock insuficiente (disponible: %, solicitado: %)', current_stock, NEW.cantidad;
    END IF;
    UPDATE public.products
       SET stock = stock - NEW.cantidad, updated_at = now()
     WHERE id = NEW.product_id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER stock_movements_apply
  BEFORE INSERT ON public.stock_movements
  FOR EACH ROW EXECUTE FUNCTION public.apply_stock_movement();
