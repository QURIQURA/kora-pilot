-- 2026-11-06: Customer care steps + message templates (SETTINGS > CUSTOMER CARE).
-- null = use the app's built-in defaults (src/lib/customer-care.ts).
alter table public.pilot_settings add column if not exists customer_care_steps jsonb;
