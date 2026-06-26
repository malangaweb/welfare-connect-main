-- SMS templates table for admin-customizable messages.
-- Falls back to hardcoded templates in smsMessaging.ts when DB is empty.

CREATE TABLE IF NOT EXISTS public.sms_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger_key TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'custom',
  raw_template TEXT NOT NULL DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.sms_templates ENABLE ROW LEVEL SECURITY;

GRANT ALL ON public.sms_templates TO service_role;
GRANT SELECT ON public.sms_templates TO anon, authenticated;

COMMENT ON TABLE public.sms_templates IS 'Editable SMS message templates used by trigger keys.';

-- Seed current templates
INSERT INTO public.sms_templates (trigger_key, label, description, category, raw_template) VALUES
  ('welcome_member', 'Karibu Mwanachama', 'Tumwa mwanachama anaposajiliwa.', 'member',
   'Malanga Welfare: Karibu {name}. Nambari yako ya mwanachama ni {memberNumber}.'),
  ('case_opened', 'Kesi Imefunguliwa', 'Wajulishe wanachama kesi mpya inapofunguliwa.', 'case',
   'Malanga Welfare: Kesi {caseNumber} imefunguliwa. Mwanachama: {name}. Tarehe: {deadline}.'),
  ('payment_received', 'Malipo Yamepokelewa', 'Thibitisha malipo ya mchango au wallet.', 'payment',
   'Malanga Welfare: Malipo KES {amount} yamepokelewa. Salio: KES {balance}.'),
  ('payment_failed', 'Malipo Yameshindikana', 'Mjulishe mwanachama malipo hayajakamilika.', 'payment',
   'Malanga Welfare: Malipo yako hayajakamilika, {name}. Tafadhali jaribu tena au wasiliana nasi.'),
  ('case_due', 'Kesi Inakaribia', 'Wakumbushe wanachama kabla ya tarehe ya mwisho.', 'case',
   'Mwanachama mpendwa, hujalipa case {caseNumber}. Tafadhali lipa KES {amount} kwa paybill 4164179 account {memberNumber} kabla {deadline}.'),
  ('overdue_reminder', 'Kesi Imechelewa', 'Fuata malipo ya kesi yaliyochelewa.', 'case',
   'Mwanachama mpendwa, malipo ya case {caseNumber} yamechelewa. Tafadhali lipa KES {amount} haraka iwezekanavyo.'),
  ('renewal_reminder', 'Ukumbusho wa Usajili', 'Wajulishe wanachama usajili unakaribia.', 'renewal',
   'Malanga Welfare: Usajili wako unakaribia kufikia mwisho. Tafadhali lipa kabla ya {deadline}.')
ON CONFLICT (trigger_key) DO NOTHING;
