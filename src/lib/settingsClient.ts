import { invokeWithAppToken } from '@/lib/appAuth';

export interface SafeSettings {
  registration_fee: number;
  renewal_fee: number;
  penalty_amount: number;
  paybill_number: string | null;
  organization_name: string;
  organization_email: string | null;
  organization_phone: string | null;
  member_id_start: number;
  case_id_start: number;
  mpesa_shortcode: string | null;
  mpesa_initiator_name: string | null;
  mpesa_env: 'sandbox' | 'production';
}

export async function fetchSafeSettings(): Promise<SafeSettings | null> {
  const res = await invokeWithAppToken<{ settings: SafeSettings | null }>('api-settings', {
    action: 'get',
  });
  return res.settings;
}
