--
-- PostgreSQL database dump
--

\restrict Ei99eoe9YOAqGbGSgYQ5ouey0C3w2MeHyIimhGdYn3SQJevxKQrJ7iGY862AMwH

-- Dumped from database version 16.10
-- Dumped by pg_dump version 16.10

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: license_status; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.license_status AS ENUM (
    'activa',
    'pendiente',
    'suspendida',
    'vencida'
);


ALTER TYPE public.license_status OWNER TO postgres;

--
-- Name: profile_role; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.profile_role AS ENUM (
    'owner',
    'admin',
    'user'
);


ALTER TYPE public.profile_role OWNER TO postgres;

--
-- Name: stock_movement_type; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.stock_movement_type AS ENUM (
    'entrada',
    'salida'
);


ALTER TYPE public.stock_movement_type OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: admin_logs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.admin_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    tenant_id uuid,
    owner_id character varying,
    user_id character varying,
    level text DEFAULT 'info'::text NOT NULL,
    module character varying(64) NOT NULL,
    event character varying(128) NOT NULL,
    message text NOT NULL,
    details jsonb
);


ALTER TABLE public.admin_logs OWNER TO postgres;

--
-- Name: business_settings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.business_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    owner_id character varying NOT NULL,
    nombre_negocio text NOT NULL,
    razon_social text,
    telefono text,
    email text,
    direccion text,
    ciudad text,
    provincia text,
    pais text,
    moneda text DEFAULT 'ARS'::text NOT NULL,
    simbolo_moneda text DEFAULT '$'::text NOT NULL,
    decimales integer DEFAULT 2 NOT NULL,
    logo_url text,
    mensaje_tickets text,
    observaciones text,
    subscription_status text DEFAULT 'active'::text NOT NULL,
    billing_cycle_start timestamp without time zone DEFAULT now() NOT NULL,
    billing_cycle_end timestamp without time zone DEFAULT (now() + '30 days'::interval) NOT NULL,
    last_payment_date timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.business_settings OWNER TO postgres;

--
-- Name: cash_register_sessions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.cash_register_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    user_id character varying NOT NULL,
    opened_at timestamp without time zone DEFAULT now() NOT NULL,
    closed_at timestamp without time zone,
    initial_amount numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    final_amount numeric(12,2),
    total_sales numeric(12,2),
    status text DEFAULT 'open'::text NOT NULL
);


ALTER TABLE public.cash_register_sessions OWNER TO postgres;

--
-- Name: categories; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    owner_id character varying NOT NULL,
    tenant_id uuid NOT NULL,
    nombre text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.categories OWNER TO postgres;

--
-- Name: customers; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.customers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    owner_id character varying NOT NULL,
    tenant_id uuid NOT NULL,
    nombre text NOT NULL,
    telefono text,
    email text,
    direccion text,
    observaciones text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.customers OWNER TO postgres;

--
-- Name: licenses; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.licenses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    owner_id character varying NOT NULL,
    status public.license_status DEFAULT 'pendiente'::public.license_status NOT NULL,
    activated_at timestamp without time zone,
    expires_at timestamp without time zone,
    suspended_at timestamp without time zone,
    notes text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.licenses OWNER TO postgres;

--
-- Name: products; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.products (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    owner_id character varying NOT NULL,
    tenant_id uuid NOT NULL,
    category_id uuid,
    nombre text NOT NULL,
    descripcion text,
    sku text,
    codigo_barras text,
    precio numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    costo numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    stock integer DEFAULT 0 NOT NULL,
    initial_stock integer DEFAULT 0 NOT NULL,
    stock_minimo integer DEFAULT 0 NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.products OWNER TO postgres;

--
-- Name: profiles; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.profiles (
    id character varying NOT NULL,
    tenant_id uuid,
    role public.profile_role DEFAULT 'owner'::public.profile_role NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.profiles OWNER TO postgres;

--
-- Name: receipt_settings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.receipt_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    owner_id character varying NOT NULL,
    habilitado boolean DEFAULT false NOT NULL,
    mostrar_dialogo boolean DEFAULT true NOT NULL,
    impresion_automatica boolean DEFAULT false NOT NULL,
    descarga_automatica boolean DEFAULT false NOT NULL,
    tipo_comprobante text DEFAULT 'ticket_80mm'::text NOT NULL,
    prefijo_numeracion text DEFAULT 'V'::text NOT NULL,
    proximo_numero integer DEFAULT 1 NOT NULL,
    logo_url text,
    nombre_comercial text,
    razon_social text,
    cuit text,
    domicilio text,
    telefono text,
    email text,
    sitio_web text,
    mensaje_pie text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.receipt_settings OWNER TO postgres;

--
-- Name: sale_items; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.sale_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    sale_id uuid NOT NULL,
    product_id uuid NOT NULL,
    cantidad integer NOT NULL,
    precio_unitario numeric(12,2) NOT NULL,
    subtotal numeric(12,2) NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.sale_items OWNER TO postgres;

--
-- Name: sales; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.sales (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    owner_id character varying NOT NULL,
    tenant_id uuid NOT NULL,
    user_id character varying NOT NULL,
    customer_id uuid,
    client_id text,
    receipt_number text,
    total numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    observacion text,
    cash_session_id uuid,
    status text DEFAULT 'active'::text NOT NULL,
    deleted_at timestamp without time zone,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    payment_method text,
    paid_amount numeric(12,2),
    credit_amount numeric(12,2),
    transfer_amount numeric(12,2),
    cash_amount numeric(12,2)
);


ALTER TABLE public.sales OWNER TO postgres;

--
-- Name: sessions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.sessions (
    sid character varying NOT NULL,
    sess jsonb NOT NULL,
    expire timestamp without time zone NOT NULL
);


ALTER TABLE public.sessions OWNER TO postgres;

--
-- Name: stock_movements; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.stock_movements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    owner_id character varying NOT NULL,
    tenant_id uuid NOT NULL,
    user_id character varying NOT NULL,
    product_id uuid NOT NULL,
    tipo public.stock_movement_type NOT NULL,
    cantidad integer NOT NULL,
    observacion text,
    referencia_tipo text,
    referencia_id uuid,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    voided_at timestamp without time zone,
    voided_by character varying,
    void_reason text
);


ALTER TABLE public.stock_movements OWNER TO postgres;

--
-- Name: tenants; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.tenants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    owner_id character varying NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.tenants OWNER TO postgres;

--
-- Name: users; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.users (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    email character varying,
    first_name character varying,
    last_name character varying,
    profile_image_url character varying,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.users OWNER TO postgres;

--
-- Data for Name: admin_logs; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.admin_logs (id, created_at, tenant_id, owner_id, user_id, level, module, event, message, details) FROM stdin;
6be5876b-d4d9-4195-b401-e5e47b2e86a4	2026-07-03 19:38:13.553788	\N	60287485	60287485	info	auth	LOGIN_SUCCESS	Login exitoso	\N
17506ebd-66b0-4a32-932c-e6362c424165	2026-07-03 20:42:53.489243	0ac1abd0-a56e-4584-98fc-5cbbdfe9d684	60287485	60287485	info	cash	CASH_OPENED	Caja abierta	{"sessionId": "9fbf3768-5132-4b82-bb82-68e3d7c0239d", "initialAmount": 0}
\.


--
-- Data for Name: business_settings; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.business_settings (id, owner_id, nombre_negocio, razon_social, telefono, email, direccion, ciudad, provincia, pais, moneda, simbolo_moneda, decimales, logo_url, mensaje_tickets, observaciones, subscription_status, billing_cycle_start, billing_cycle_end, last_payment_date, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: cash_register_sessions; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.cash_register_sessions (id, tenant_id, user_id, opened_at, closed_at, initial_amount, final_amount, total_sales, status) FROM stdin;
9fbf3768-5132-4b82-bb82-68e3d7c0239d	0ac1abd0-a56e-4584-98fc-5cbbdfe9d684	60287485	2026-07-03 20:42:53.482779	\N	0.00	\N	\N	open
\.


--
-- Data for Name: categories; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.categories (id, owner_id, tenant_id, nombre, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: customers; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.customers (id, owner_id, tenant_id, nombre, telefono, email, direccion, observaciones, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: licenses; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.licenses (id, owner_id, status, activated_at, expires_at, suspended_at, notes, created_at, updated_at) FROM stdin;
24340fbc-90ab-4f6e-923b-58f3602c9a9f	60287485	activa	\N	\N	\N	\N	2026-07-03 19:38:13.537939	2026-07-03 19:38:13.537939
\.


--
-- Data for Name: products; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.products (id, owner_id, tenant_id, category_id, nombre, descripcion, sku, codigo_barras, precio, costo, stock, initial_stock, stock_minimo, activo, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: profiles; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.profiles (id, tenant_id, role, created_at, updated_at) FROM stdin;
60287485	0ac1abd0-a56e-4584-98fc-5cbbdfe9d684	owner	2026-07-03 19:38:13.548585	2026-07-03 19:38:13.548585
\.


--
-- Data for Name: receipt_settings; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.receipt_settings (id, tenant_id, owner_id, habilitado, mostrar_dialogo, impresion_automatica, descarga_automatica, tipo_comprobante, prefijo_numeracion, proximo_numero, logo_url, nombre_comercial, razon_social, cuit, domicilio, telefono, email, sitio_web, mensaje_pie, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: sale_items; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.sale_items (id, sale_id, product_id, cantidad, precio_unitario, subtotal, created_at) FROM stdin;
\.


--
-- Data for Name: sales; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.sales (id, owner_id, tenant_id, user_id, customer_id, client_id, receipt_number, total, observacion, cash_session_id, status, deleted_at, updated_at, created_at, payment_method, paid_amount, credit_amount, transfer_amount, cash_amount) FROM stdin;
\.


--
-- Data for Name: sessions; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.sessions (sid, sess, expire) FROM stdin;
7S9Opwi-3HtXpvJiJynqH1udra2OP9C6	{"cookie": {"path": "/", "secure": true, "expires": "2026-07-11T00:26:40.612Z", "httpOnly": true, "originalMaxAge": 604800000}, "passport": {"user": {"claims": {"aud": "24dab70f-5795-4fca-b2b0-3deeb23654c0", "exp": 1783128400, "iat": 1783124800, "iss": "https://replit.com/oidc", "sub": "60287485", "email": "hamsterdhef@gmail.com", "at_hash": "-2N3ZOlGfBTFLwDPd2qkMw", "username": "hamsterdhef", "auth_time": 1783107493, "last_name": null, "first_name": "Trece", "email_verified": true, "profile_image_url": "https://lh3.googleusercontent.com/a/ACg8ocKLhH_eogWMSEomu4ooM4z7k1zAptgXIjCfth8HrTX7sZMCXbEJ=s96-c"}, "expires_at": 1783128400, "access_token": "i4UoZkqcj0Qrcw54LukrQGbnstze_fOnNZ1h2sxXdh-", "refresh_token": "bb9hibflN7XvM0BeNxO_AtZtOcdcv7M8rZ2bz1eCd4e"}}}	2026-07-11 00:27:14
\.


--
-- Data for Name: stock_movements; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.stock_movements (id, owner_id, tenant_id, user_id, product_id, tipo, cantidad, observacion, referencia_tipo, referencia_id, created_at, voided_at, voided_by, void_reason) FROM stdin;
\.


--
-- Data for Name: tenants; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.tenants (id, name, owner_id, created_at) FROM stdin;
0ac1abd0-a56e-4584-98fc-5cbbdfe9d684	Trece	60287485	2026-07-03 19:38:13.545075
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.users (id, email, first_name, last_name, profile_image_url, created_at, updated_at) FROM stdin;
60287485	hamsterdhef@gmail.com	Trece	\N	https://lh3.googleusercontent.com/a/ACg8ocKLhH_eogWMSEomu4ooM4z7k1zAptgXIjCfth8HrTX7sZMCXbEJ=s96-c	2026-07-03 19:38:13.52788	2026-07-03 19:38:13.52788
\.


--
-- Name: admin_logs admin_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.admin_logs
    ADD CONSTRAINT admin_logs_pkey PRIMARY KEY (id);


--
-- Name: business_settings business_settings_owner_id_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.business_settings
    ADD CONSTRAINT business_settings_owner_id_unique UNIQUE (owner_id);


--
-- Name: business_settings business_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.business_settings
    ADD CONSTRAINT business_settings_pkey PRIMARY KEY (id);


--
-- Name: cash_register_sessions cash_register_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.cash_register_sessions
    ADD CONSTRAINT cash_register_sessions_pkey PRIMARY KEY (id);


--
-- Name: categories categories_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_pkey PRIMARY KEY (id);


--
-- Name: customers customers_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_pkey PRIMARY KEY (id);


--
-- Name: licenses licenses_owner_id_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.licenses
    ADD CONSTRAINT licenses_owner_id_unique UNIQUE (owner_id);


--
-- Name: licenses licenses_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.licenses
    ADD CONSTRAINT licenses_pkey PRIMARY KEY (id);


--
-- Name: products products_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: receipt_settings receipt_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.receipt_settings
    ADD CONSTRAINT receipt_settings_pkey PRIMARY KEY (id);


--
-- Name: sale_items sale_items_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sale_items
    ADD CONSTRAINT sale_items_pkey PRIMARY KEY (id);


--
-- Name: sales sales_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sales
    ADD CONSTRAINT sales_pkey PRIMARY KEY (id);


--
-- Name: sessions sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (sid);


--
-- Name: stock_movements stock_movements_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.stock_movements
    ADD CONSTRAINT stock_movements_pkey PRIMARY KEY (id);


--
-- Name: tenants tenants_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tenants
    ADD CONSTRAINT tenants_pkey PRIMARY KEY (id);


--
-- Name: users users_email_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_unique UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: IDX_session_expire; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IDX_session_expire" ON public.sessions USING btree (expire);


--
-- Name: admin_logs_created_at_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX admin_logs_created_at_idx ON public.admin_logs USING btree (created_at);


--
-- Name: admin_logs_level_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX admin_logs_level_idx ON public.admin_logs USING btree (level);


--
-- Name: admin_logs_owner_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX admin_logs_owner_id_idx ON public.admin_logs USING btree (owner_id);


--
-- Name: admin_logs_tenant_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX admin_logs_tenant_id_idx ON public.admin_logs USING btree (tenant_id);


--
-- Name: cash_register_sessions_tenant_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX cash_register_sessions_tenant_id_idx ON public.cash_register_sessions USING btree (tenant_id);


--
-- Name: cash_sessions_one_open_per_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX cash_sessions_one_open_per_user ON public.cash_register_sessions USING btree (tenant_id, user_id) WHERE (status = 'open'::text);


--
-- Name: categories_tenant_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX categories_tenant_id_idx ON public.categories USING btree (tenant_id);


--
-- Name: customers_tenant_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX customers_tenant_id_idx ON public.customers USING btree (tenant_id);


--
-- Name: products_tenant_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX products_tenant_id_idx ON public.products USING btree (tenant_id);


--
-- Name: receipt_settings_tenant_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX receipt_settings_tenant_id_idx ON public.receipt_settings USING btree (tenant_id);


--
-- Name: sales_cash_session_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX sales_cash_session_id_idx ON public.sales USING btree (cash_session_id);


--
-- Name: sales_tenant_client_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX sales_tenant_client_id_idx ON public.sales USING btree (tenant_id, client_id);


--
-- Name: sales_tenant_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX sales_tenant_id_idx ON public.sales USING btree (tenant_id);


--
-- Name: stock_movements_tenant_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX stock_movements_tenant_id_idx ON public.stock_movements USING btree (tenant_id);


--
-- Name: products products_category_id_categories_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_category_id_categories_id_fk FOREIGN KEY (category_id) REFERENCES public.categories(id) ON DELETE SET NULL;


--
-- Name: profiles profiles_tenant_id_tenants_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_tenant_id_tenants_id_fk FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE SET NULL;


--
-- Name: sale_items sale_items_product_id_products_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sale_items
    ADD CONSTRAINT sale_items_product_id_products_id_fk FOREIGN KEY (product_id) REFERENCES public.products(id);


--
-- Name: sale_items sale_items_sale_id_sales_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sale_items
    ADD CONSTRAINT sale_items_sale_id_sales_id_fk FOREIGN KEY (sale_id) REFERENCES public.sales(id) ON DELETE CASCADE;


--
-- Name: sales sales_customer_id_customers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sales
    ADD CONSTRAINT sales_customer_id_customers_id_fk FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE SET NULL;


--
-- Name: stock_movements stock_movements_product_id_products_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.stock_movements
    ADD CONSTRAINT stock_movements_product_id_products_id_fk FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE RESTRICT;


--
-- PostgreSQL database dump complete
--

\unrestrict Ei99eoe9YOAqGbGSgYQ5ouey0C3w2MeHyIimhGdYn3SQJevxKQrJ7iGY862AMwH

