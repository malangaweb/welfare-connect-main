export type SmsTriggerKey =
  | 'welcome_member'
  | 'case_opened'
  | 'payment_received'
  | 'payment_failed'
  | 'case_due'
  | 'overdue_reminder'
  | 'renewal_reminder'
  | 'manual_custom';

export type SmsRecipient = {
  id?: string;
  name?: string;
  phoneNumber: string;
  memberNumber?: string;
  residence?: string;
  status?: string;
};

export type SmsTemplateContext = {
  audienceCount: number;
  memberName?: string;
  memberNumber?: string;
  caseNumber?: string;
  amount?: string;
  deadline?: string;
  balance?: string;
};

export type SmsTemplate = {
  key: SmsTriggerKey;
  label: string;
  description: string;
  category: 'member' | 'case' | 'payment' | 'renewal' | 'custom';
  message: (context: SmsTemplateContext) => string;
};

export const smsTemplates: SmsTemplate[] = [
  {
    key: 'welcome_member',
    label: 'Welcome Member',
    description: 'Send right after a member is registered.',
    category: 'member',
    message: ({ memberName, memberNumber }) =>
      `Malanga Welfare: Welcome ${memberName || 'member'}. Your member number is ${memberNumber || 'N/A'}.`,
  },
  {
    key: 'case_opened',
    label: 'Case Opened',
    description: 'Notify members when a new case has been opened.',
    category: 'case',
    message: ({ memberName, caseNumber, deadline }) =>
      [
        `Malanga Welfare: Case ${caseNumber || 'N/A'} has been opened.`,
        memberName ? `Member: ${memberName}.` : null,
        deadline ? `Deadline: ${deadline}.` : null,
      ]
        .filter(Boolean)
        .join(' '),
  },
  {
    key: 'payment_received',
    label: 'Payment Received',
    description: 'Confirm a successful contribution or wallet payment.',
    category: 'payment',
    message: ({ amount, balance }) =>
      [
        `Malanga Welfare: Payment received${amount ? ` KES ${amount}` : ''}.`,
        balance ? `Current balance: ${balance}.` : null,
      ]
        .filter(Boolean)
        .join(' '),
  },
  {
    key: 'payment_failed',
    label: 'Payment Failed',
    description: 'Let the member know a payment did not complete.',
    category: 'payment',
    message: ({ memberName }) =>
      `Malanga Welfare: Your payment could not be completed${memberName ? `, ${memberName}` : ''}. Please retry or contact support.`,
  },
  {
    key: 'case_due',
    label: 'Case Due Reminder',
    description: 'Remind members before case contribution deadlines.',
    category: 'case',
    message: ({ caseNumber, deadline, amount }) =>
      [
        `Malanga Welfare: Reminder for case ${caseNumber || 'N/A'}.`,
        amount ? `Contribution due: KES ${amount}.` : null,
        deadline ? `Deadline: ${deadline}.` : null,
      ]
        .filter(Boolean)
        .join(' '),
  },
  {
    key: 'overdue_reminder',
    label: 'Overdue Reminder',
    description: 'Follow up on unpaid case contributions.',
    category: 'case',
    message: ({ caseNumber, amount }) =>
      [
        `Malanga Welfare: Your case contribution is overdue${caseNumber ? ` for case ${caseNumber}` : ''}.`,
        amount ? `Please settle KES ${amount} as soon as possible.` : 'Please settle the pending amount as soon as possible.',
      ].join(' '),
  },
  {
    key: 'renewal_reminder',
    label: 'Renewal Reminder',
    description: 'Notify members before renewal falls due.',
    category: 'renewal',
    message: ({ deadline }) =>
      [
        'Malanga Welfare: Your membership renewal is coming up.',
        deadline ? `Due date: ${deadline}.` : null,
        'Please make your payment on time.',
      ]
        .filter(Boolean)
        .join(' '),
  },
  {
    key: 'manual_custom',
    label: 'Manual Custom',
    description: 'Write a completely custom message.',
    category: 'custom',
    message: () => '',
  },
];

export function getSmsTemplate(key: SmsTriggerKey): SmsTemplate {
  return smsTemplates.find((template) => template.key === key) || smsTemplates[0];
}

export function buildSmsPreview(
  key: SmsTriggerKey,
  context: SmsTemplateContext,
): string {
  const template = getSmsTemplate(key);
  return template.message(context).trim();
}

function normalizePhone(phone: string): string {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('254')) return digits;
  if (digits.startsWith('0')) return `254${digits.slice(1)}`;
  if (digits.length === 9 && digits.startsWith('7')) return `254${digits}`;
  return digits;
}

export function normalizeSmsRecipients(
  recipients: SmsRecipient[],
): SmsRecipient[] {
  return recipients
    .map((recipient) => ({
      ...recipient,
      phoneNumber: normalizePhone(recipient.phoneNumber),
      name: recipient.name ? String(recipient.name).trim() : undefined,
      memberNumber: recipient.memberNumber ? String(recipient.memberNumber).trim() : undefined,
    }))
    .filter((recipient) => recipient.phoneNumber.length > 0);
}

