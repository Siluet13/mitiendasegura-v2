
-- SALES
CREATE TABLE public.sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  user_id uuid NOT NULL,
  customer_id uuid NULL, -- futuro
  comprobante_tipo text NULL, -- futuro facturación
  comprobante_numero text NULL,
  total numeric NOT NULL DEFAULT 0 CHECK (total >= 0),
  observacion text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales TO authenticated;
GRANT ALL ON public.sales TO service_role;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;

CREATE POLICY sales_select_own ON public.sales FOR SELECT TO authenticated
  USING (owner_id = public.current_owner_id());
CREATE POLICY sales_insert_own ON public.sales FOR INSERT TO authenticated
  WITH CHECK ((owner_id = public.current_owner_id() OR owner_id IS NULL)
              AND (user_id = auth.uid() OR user_id IS NULL));

CREATE TRIGGER sales_set_owner_id BEFORE INSERT ON public.sales
  FOR EACH ROW EXECUTE FUNCTION public.set_owner_id();
CREATE TRIGGER sales_set_user_id BEFORE INSERT ON public.sales
  FOR EACH ROW EXECUTE FUNCTION public.set_user_id();

CREATE INDEX sales_owner_created_idx ON public.sales(owner_id, created_at DESC);

-- SALE ITEMS
CREATE TABLE public.sale_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id),
  cantidad integer NOT NULL CHECK (cantidad > 0),
  precio_unitario numeric NOT NULL CHECK (precio_unitario >= 0),
  subtotal numeric NOT NULL CHECK (subtotal >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sale_id, product_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sale_items TO authenticated;
GRANT ALL ON public.sale_items TO service_role;
ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY sale_items_select_own ON public.sale_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.sales s WHERE s.id = sale_id AND s.owner_id = public.current_owner_id()));
CREATE POLICY sale_items_insert_own ON public.sale_items FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.sales s WHERE s.id = sale_id AND s.owner_id = public.current_owner_id()));

CREATE INDEX sale_items_sale_idx ON public.sale_items(sale_id);
CREATE INDEX sale_items_product_idx ON public.sale_items(product_id);

-- RPC: create_sale (atomic)
CREATE OR REPLACE FUNCTION public.create_sale(
  p_items jsonb,
  p_observacion text DEFAULT NULL
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

  INSERT INTO public.sales (owner_id, user_id, total, observacion)
  VALUES (v_owner, v_user, 0, p_observacion)
  RETURNING id INTO v_sale_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_product_id := (v_item->>'product_id')::uuid;
    v_cantidad := (v_item->>'cantidad')::integer;

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
    v_total := v_total + v_subtotal;

    INSERT INTO public.sale_items (sale_id, product_id, cantidad, precio_unitario, subtotal)
    VALUES (v_sale_id, v_product_id, v_cantidad, v_precio, v_subtotal);

    -- Trigger apply_stock_movement valida stock y descuenta
    INSERT INTO public.stock_movements (owner_id, user_id, product_id, tipo, cantidad, observacion, referencia_tipo, referencia_id)
    VALUES (v_owner, v_user, v_product_id, 'salida', v_cantidad, 'Venta', 'sale', v_sale_id);
  END LOOP;

  UPDATE public.sales SET total = v_total WHERE id = v_sale_id;
  RETURN v_sale_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_sale(jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_sale(jsonb, text) TO authenticated;
