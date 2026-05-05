export function normalizeMemberNumber(value: unknown): string {
  let raw = String(value ?? '').trim().toUpperCase();
  if (!raw) return '';

  if (raw.startsWith('M')) {
    raw = raw.slice(1).trim();
  }

  const digits = raw.replace(/[^0-9]/g, '');
  if (digits.length > 0) {
    const noLeading = digits.replace(/^0+/, '');
    return noLeading || '0';
  }

  return raw;
}
