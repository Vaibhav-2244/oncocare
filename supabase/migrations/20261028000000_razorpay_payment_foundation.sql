CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS payment_orders (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL,
    kind text NOT NULL CHECK (kind IN ('medicine', 'insurance', 'tele-oncology', 'booking', 'donation')),
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'authorized', 'paid', 'failed', 'cancelled', 'refunded')),
    amount_in_paise bigint NOT NULL CHECK (amount_in_paise >= 0),
    currency text NOT NULL DEFAULT 'INR' CHECK (currency = 'INR'),
    provider_order_id text,
    provider_payment_id text,
    provider_refund_id text,
    notes jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    captured_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_orders_provider_order_id
    ON payment_orders (provider_order_id)
    WHERE provider_order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payment_orders_user_id
    ON payment_orders (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_payment_orders_status
    ON payment_orders (status, created_at DESC);

CREATE TABLE IF NOT EXISTS payment_webhook_events (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    provider_event_id text NOT NULL UNIQUE,
    event_type text NOT NULL,
    payload jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tele_oncology_entitlements (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL,
    entitlement_type text NOT NULL CHECK (entitlement_type IN ('one-time', 'monthly')),
    valid_from timestamptz NOT NULL DEFAULT now(),
    valid_until timestamptz,
    remaining_calls integer NOT NULL DEFAULT 0 CHECK (remaining_calls >= 0),
    order_id uuid REFERENCES payment_orders(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (user_id, entitlement_type, valid_from)
);

CREATE INDEX IF NOT EXISTS idx_tele_oncology_entitlements_user_id
    ON tele_oncology_entitlements (user_id, valid_until);

CREATE TABLE IF NOT EXISTS payment_refunds (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id uuid NOT NULL REFERENCES payment_orders(id) ON DELETE CASCADE,
    amount_in_paise bigint NOT NULL CHECK (amount_in_paise >= 0),
    reason text NOT NULL,
    status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'approved', 'processed', 'failed')),
    provider_refund_id text,
    created_by uuid NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS payment_audit_log (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_user_id uuid,
    action text NOT NULL,
    order_id uuid,
    details jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);

NOTIFY pgrst, 'reload schema';
