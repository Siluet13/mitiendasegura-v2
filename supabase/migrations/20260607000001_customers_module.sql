
-- =========================================================
-- CUSTOMERS TABLE
-- =========================================================
CREATE TABLE public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL,
  nombre TEXT NOT NULL,
  telefono TEXT,
  email TEXT,
  direccion TEXT,
  observaciones TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT customers_email_check CHECK (
    email IS NULL OR email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'
  ),
  CONSTRAINT customers_nombre_telefono_owner_unique UNIQUE (owner_id, nombre, telefono)
);

CREATE INDEX customers_owner_id_idx ON public.customers(owner_id);
CREATE INDEX customers_nombre_idx ON public.customers(owner_id, lower(nombre));
CREATE INDEX customers_telefono_idx ON public.customers(owner_id, telefono) WHERE telefono IS NOT NULL;
CREATE INDEX customers_email_idx ON public.customers(owner_id, lower(email)) WHERE email IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.customers TO authenticated;
GRANT ALL ON public.customers TO service_role;

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "customers_select_own" ON public.customers
  FOR SELECT TO authenticated
  USING (owner_id = public.current_owner_id());

CREATE POLICY "customers_insert_own" ON public.customers
  FOR INSERT TO authenticated
  WITH CHECK (owner_id = public.current_owner_id() OR owner_id IS NULL);

CREATE POLICY "customers_update_own" ON public.customers
  FOR UPDATE TO authenticated
  USING (owner_id = public.current_owner_id())
  WITH CHECK (owner_id = public.current_owner_id());

CREATE POLICY "customers_delete_own" ON public.customers
  FOR DELETE TO authenticated
  USING (owner_id = public.current_owner_id());

CREATE TRIGGER customers_set_owner_id
  BEFORE INSERT ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.set_owner_id();

-- =========================================================
-- FK: sales → customers
-- =========================================================
ALTER TABLE public.sales
  ADD CONSTRAINT sales_customer_id_fkey
  FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE SET NULL;

-- =========================================================
-- UPDATE create_sale RPC to accept p_customer_id
-- =========================================================
DROP FUNCTION IF EXISTS public.create_sale(jsonb, text);

CREATE OR REPLACE FUNCTION public.create_sale(
  p_items jsonb,
  p_observacion text DEFAULT NULL,
  p_customer_id uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid := public.current_owner_id();
  v_user uuid := auth.uid();
  v_sale_id uuid;
  v_total numeric := 0;
  v_item jsonb;
  v_product_id uuid;
  v_cantidad integer;
  v_precio numeric;
  v_subtotal numeric;
  v_seen uuid[] := ARRAY[]::uuid[];
  v_count integer;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'No autenticado'; END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'Items inválidos';
  END IF;
  v_count := jsonb_array_length(p_items);
  IF v_count = 0 THEN RAISE EXCEPTION 'La venta no puede estar vacía'; END IF;

  IF p_customer_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.customers WHERE id = p_customer_id AND owner_id = v_owner
    ) THEN
      RAISE EXCEPTION 'Cliente no encontrado';
    END IF;
  END IF;

  INSERT INTO public.sales (owner_id, user_id, total, observacion, customer_id)
  VALUES (v_owner, v_user, 0, p_observacion, p_customer_id)
  RETURNING id INTO v_sale_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_product_id := (v_item->>'product_id')::uuid;
    v_cantidad   := (v_item->>'cantidad')::integer;

    IF v_product_id IS NULL THEN RAISE EXCEPTION 'product_id requerido'; END IF;
    IF v_cantidad IS NULL OR v_cantidad <= 0 THEN
      RAISE EXCEPTION 'Cantidad inválida para producto %', v_product_id;
    END IF;
    IF v_product_id = ANY(v_seen) THEN
      RAISE EXCEPTION 'Producto duplicado en la venta: %', v_product_id;
    END IF;
    v_seen := array_append(v_seen, v_product_id);

    SELECT precio INTO v_precio FROM public.products
      WHERE id = v_product_id AND owner_id = v_owner;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Producto no encontrado: %', v_product_id;
    END IF;

    v_subtotal := v_precio * v_cantidad;
    v_total    := v_total + v_subtotal;

    INSERT INTO public.sale_items (sale_id, product_id, cantidad, precio_unitario, subtotal)
    VALUES (v_sale_id, v_product_id, v_cantidad, v_precio, v_subtotal);

    INSERT INTO public.stock_movements
      (owner_id, user_id, product_id, tipo, cantidad, observacion, referencia_tipo, referencia_id)
    VALUES
      (v_owner, v_user, v_product_id, 'salida', v_cantidad, 'Venta', 'sale', v_sale_id);
  END LOOP;

  UPDATE public.sales SET total = v_total WHERE id = v_sale_id;
  RETURN v_sale_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_sale(jsonb, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_sale(jsonb, text, uuid) TO authenticated;
