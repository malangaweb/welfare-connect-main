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
  ('welcome_member', 'Welcome Member', 'Send right after a member is registered.', 'member',
   'Malanga Welfare: Welcome {name}. Your member number is {memberNumber}.'),
  ('case_opened', 'Case Opened', 'Notify members when a new case has been opened.', 'case',
   'Malanga Welfare: Case {caseNumber} has been opened. Member: {name}. Deadline: {deadline}.'),
  ('payment_received', 'Payment Received', 'Confirm a successful contribution or wallet payment.', 'payment',
   'Malanga Welfare: Payment received KES {amount}. Current balance: {balance}.'),
  ('payment_failed', 'Payment Failed', 'Let the member know a payment did not complete.', 'payment',
   'Malanga Welfare: Your payment could not be completed, {name}. Please retry or contact support.'),
  ('case_due', 'Case Due Reminder', 'Remind members before case contribution deadlines.', 'case',
   'Malanga Welfare: Reminder for case {caseNumber}. Contribution due: KES {amount}. Deadline: {deadline}.'),
  ('overdue_reminder', 'Overdue Reminder', 'Follow up on unpaid case contributions.', 'case',
   'Malanga Welfare: Your case contribution is overdue for case {caseNumber}. Please settle KES {amount} as soon as possible.'),
  ('renewal_reminder', 'Renewal Reminder', 'Notify members before renewal falls due.', 'renewal',
   'Malanga Welfare: Your membership renewal is coming up. Due date: {deadline}. Please make your payment on time.')
ON CONFLICT (trigger_key) DO NOTHING;
