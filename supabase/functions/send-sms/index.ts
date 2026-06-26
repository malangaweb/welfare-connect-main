import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { corsHeaders } from "../_shared/cors.ts"
import { requirePrivilegedRole, verifyAppJwtFromRequest } from "../_shared/app_jwt.ts"
import { isSmsFailure, sendSmsMessage, summarizeSmsFailure } from "../_shared/sms.ts"

type RecipientData = {
  phoneNumber: string;
  name?: string;
  memberNumber?: string;
  memberId?: string;
  amount?: string;
  caseNumber?: string;
  deadline?: string;
  ref?: string;
  senderName?: string;
};

function resolveTags(text: string, data: Record<string, string>): string {
  let result = text;
  for (const [key, value] of Object.entries(data)) {
    result = result.replaceAll(`{${key}}`, value || '');
  }
  return result;
}

async function buildRecipientContext(
  supabase: ReturnType<typeof createClient>,
  recipient: RecipientData,
): Promise<Record<string, string>> {
  const ctx: Record<string, string> = {
    name: recipient.name || 'Member',
    memberNumber: recipient.memberNumber || '',
    amount: recipient.amount || '',
    caseNumber: recipient.caseNumber || '',
    deadline: recipient.deadline || '',
    ref: recipient.ref || '',
    senderName: recipient.senderName || '',
    balance: '',
  };

  if (recipient.memberId && (!recipient.name || !recipient.memberNumber)) {
    const { data: member } = await supabase
      .from('members')
      .select('name, member_number, wallet_balance')
      .eq('id', recipient.memberId)
      .single();
    if (member) {
      if (!recipient.name) ctx.name = member.name || 'Member';
      if (!recipient.memberNumber) ctx.memberNumber = member.member_number || '';
      ctx.balance = String(member.wallet_balance ?? '');
    }
  } else if (recipient.memberId) {
    const { data: member } = await supabase
      .from('members')
      .select('wallet_balance')
      .eq('id', recipient.memberId)
      .single();
    if (member) {
      ctx.balance = String(member.wallet_balance ?? '');
    }
  }

  return ctx;
}

function toRecipient(input: unknown): RecipientData | null {
  if (!input) return null;
  if (typeof input === 'string') {
    const trimmed = input.trim();
    return trimmed ? { phoneNumber: trimmed } : null;
  }
  if (typeof input === 'object') {
    const obj = input as Record<string, unknown>;
    const phoneNumber = String(obj.phoneNumber || obj.phone_number || '').trim();
    if (!phoneNumber) return null;
    return {
      phoneNumber,
      name: String(obj.name || '').trim() || undefined,
      memberNumber: String(obj.memberNumber || obj.member_number || '').trim() || undefined,
      memberId: String(obj.memberId || obj.member_id || '').trim() || undefined,
      amount: String(obj.amount || '').trim() || undefined,
      caseNumber: String(obj.caseNumber || obj.case_number || '').trim() || undefined,
      deadline: String(obj.deadline || '').trim() || undefined,
      ref: String(obj.ref || obj.mpesaRef || obj.mpesa_reference || obj.receipt || '').trim() || undefined,
      senderName: String(obj.senderName || obj.sender_name || obj.sender || '').trim() || undefined,
    };
  }
  return null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const claims = await verifyAppJwtFromRequest(req)
    requirePrivilegedRole(claims.role)

    const body = await req.json();
    const rawRecipients = Array.isArray(body?.recipients)
      ? body.recipients
      : body?.phoneNumbers
        ? body.phoneNumbers
        : body?.phoneNumber
          ? [body.phoneNumber]
          : [];
    const message = String(body?.message || '').trim();
    const triggerKey = String(body?.triggerKey || body?.trigger_key || 'manual_custom').trim();
    const source = String(body?.source || body?.origin || 'admin_dashboard').trim();
    const tableName = String(body?.tableName || body?.table_name || 'sms').trim();

    if (!rawRecipients.length || !message) {
      return new Response(
        JSON.stringify({ error: 'At least one recipient and a message are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const recipients = rawRecipients.map(toRecipient).filter(Boolean) as RecipientData[];

    if (!recipients.length) {
      return new Response(
        JSON.stringify({ error: 'At least one valid recipient phone number is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const allResults: Array<{ phoneNumber: string; message: string; result: Awaited<ReturnType<typeof sendSmsMessage>>[0] }> = [];

    for (const recipient of recipients) {
      const context = await buildRecipientContext(supabase, recipient);
      const personalMessage = resolveTags(message, context);
      const results = await sendSmsMessage([recipient.phoneNumber], personalMessage);
      allResults.push({ phoneNumber: recipient.phoneNumber, message: personalMessage, result: results[0] });
    }

    await Promise.all(allResults.map(async ({ phoneNumber, message: personalMessage, result }, index) => {
      const recipient = recipients[index];
      const action = isSmsFailure(result) ? 'SMS_FAILED' : result.status === 'delivered' ? 'SMS_DELIVERED' : 'SMS_SENT';
      const isSuccess = !isSmsFailure(result);

      await supabase.from("audit_logs").insert({
        action,
        table_name: tableName,
        status: isSuccess ? 'success' : 'error',
        user_id: claims.sub || null,
        metadata: {
          source,
          trigger_key: triggerKey,
          provider: result.provider,
          recipient_index: index,
          recipient_count: allResults.length,
          phone_number: phoneNumber,
          message: personalMessage,
          provider_message_id: result.providerMessageId,
          provider_response: result.raw,
        },
      });

      if (isSuccess && recipient?.memberId) {
        await supabase.from("notifications").insert({
          member_id: recipient.memberId,
          user_id: claims.sub || null,
          role: 'member',
          title: triggerKey === 'overdue_reminder' ? 'Malipo Yamechelewa' : triggerKey === 'case_due' ? 'Malipo Yanakaribia' : triggerKey === 'welcome_member' ? 'Karibu' : triggerKey === 'payment_received' ? 'Malipo Yamepokelewa' : triggerKey === 'payment_failed' ? 'Malipo Yameshindikana' : 'Ujumbe',
          message: personalMessage,
          category: triggerKey,
          data: { sms: true, phone: phoneNumber, trigger_key: triggerKey },
        });
      }
    }));

    const results = allResults.map(r => r.result);
    const delivered = results.filter((r) => r.status === 'delivered').length;
    const failed = results.filter(isSmsFailure).length;
    const sent = results.length - failed;
    const success = failed === 0;
    const errorMessage = summarizeSmsFailure(results);

    return new Response(
      JSON.stringify({
        success,
        sent,
        delivered,
        failed,
        recipients: results.length,
        results,
        ...(success ? {} : { error: errorMessage || 'One or more SMS messages failed' }),
      }),
      {
        status: success ? 200 : 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  } catch (error) {
    console.error('Error in send-sms function:', error);

    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'An error occurred while sending SMS',
        details: String(error)
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
