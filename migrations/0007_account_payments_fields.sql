-- Forma de pago para movimientos de cuenta corriente (tipo "payment")
ALTER TABLE customer_account_movements
  ADD COLUMN IF NOT EXISTS payment_method VARCHAR;

-- Cobros de cuenta corriente recibidos en caja, separados por método
ALTER TABLE cash_register_sessions
  ADD COLUMN IF NOT EXISTS account_payments_cash     NUMERIC(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS account_payments_transfer NUMERIC(12, 2) NOT NULL DEFAULT 0;
