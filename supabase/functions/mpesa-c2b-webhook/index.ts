// M-Pesa C2B Webhook - v5 (COMPOUND REFERENCE SUPPORT)
// Supports: Member#Case, Member only, Case only, Phone#Member formats
// Captures all incoming data for manual review when auto-matching fails

/// <reference lib="deno.window" />

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { parseBillReference, ParsedReference } from './reference-parser.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  try {
    const rawBody = await req.text()
    const url = new URL(req.url)
    const queryParams = Object.fromEntries(url.searchParams.entries())

    console.log('========== C2B WEBHOOK v5 (COMPOUND REF) ==========')
    console.log('Time:', new Date().toISOString())

    let callback: any = { ...queryParams }
    if (rawBody.length > 0) {
      try {
        callback = JSON.parse(rawBody)
      } catch (e) {
        console.log('JSON parse failed, will store raw body')
      }
    }

    const keys = Object.keys(callback)
    if (keys.length === 0) {
      console.warn('⚠️ Received an empty callback. Storing for review.')
    }

    // Lenient extraction: try multiple fields, use fallbacks
    let transID = String(
      callback.TransID ||
      callback.transID ||
      callback.TransactionID ||
      callback.receipt_number ||
      callback.ReceiptNumber ||
      callback.MpesaReceiptNumber ||
      callback.ThirdPartyTransID ||
      ""
    ).trim()
    const transAmount = Number(callback.TransAmount || callback.transAmount || callback.Amount || callback.amount || 0)
    const msisdn = String(callback.MSISDN || callback.msisdn || callback.PhoneNumber || callback.phone_number || '').trim()
    
    if (!transID) {
      transID = `SUSPENSE_${Date.now()}`
      console.warn(`⚠️ No transaction ID found. Generated temporary ID: ${transID}`)
    }

    const transTime = String(callback.TransTime || callback.transTime || callback.TransactionTime || callback.transaction_time || '')
    const firstName = String(callback.FirstName || callback.firstName || callback.SenderName || callback.sender_name || '')
    const middleName = String(callback.MiddleName || callback.middleName || '')
    const lastName = String(callback.LastName || callback.lastName || '')
    const billRefNumber = String(callback.BillRefNumber || callback.billRefNumber || callback.AccountNumber || transID)

    const senderName = [firstName, middleName, lastName].filter(Boolean).join(' ').trim() || 'Unknown'
    const normalizedPhone = normalizePhoneNumber(msisdn)
    const transactionDate = parseMpesaTimestamp(transTime)

    // === NEW: Parse compound reference ===
    const parsed = parseBillReference(billRefNumber)
    console.log('--- Parsed Reference ---')
    console.log('Raw:', billRefNumber)
    console.log('Format:', parsed.format)
    console.log('Member:', parsed.memberNumber, '| Case:', parsed.caseNumber, '| Phone:', parsed.phoneNumber)
    console.log('------------------------')

    // Persist a small breadcrumb
    await supabase.from('audit_logs').insert({
      action: 'INSERT',
      table_name: 'mpesa-c2b-webhook',
      status: 'success',
      new_values: {
        custom_action: 'C2B_WEBHOOK_RECEIVED',
        mpesa_receipt_number: transID,
        amount: transAmount,
        phone_number: normalizedPhone || null,
        reference: billRefNumber || null,
        reference_format: parsed.format,
        trans_time_raw: transTime || null,
        generated_receipt: String(transID).startsWith('SUSPENSE_'),
      },
    })
    
    // === Resolution Phase ===
    let memberId: string | null = null
    let caseId: string | null = null
    let matchType: string = 'none'
    let phoneMatchedMemberId: string | null = null
    let caseActive: boolean = false
    let caseContributionAmount: number | null = null

    // 1. Resolve member number if present in reference
    if (parsed.memberNumber) {
      const { data: member } = await supabase
        .from('members')
        .select('id')
        .eq('member_number', parsed.memberNumber)
        .single()
      if (member) {
        memberId = member.id
        console.log('✅ Member resolved by number:', parsed.memberNumber)
      } else {
        console.log('⚠️ Member number not found:', parsed.memberNumber)
      }
    }

    // 2. Resolve case number if present in reference
    if (parsed.caseNumber) {
      const { data: caseData } = await supabase
        .from('cases')
        .select('id, contribution_per_member, is_active, is_finalized')
        .eq('case_number', parsed.caseNumber)
        .single()
      if (caseData) {
        if (caseData.is_active && !caseData.is_finalized) {
          caseId = caseData.id
          caseActive = true
          caseContributionAmount = caseData.contribution_per_member
          console.log('✅ Case resolved and active:', parsed.caseNumber, '| Contribution:', caseContributionAmount)
        } else {
          console.log('⚠️ Case found but not active/finalized:', parsed.caseNumber)
        }
      } else {
        console.log('⚠️ Case number not found:', parsed.caseNumber)
      }
    }

    // 3. Fallback: try phone number from reference (legacy Phone#Member format)
    if (!memberId && parsed.phoneNumber) {
      const normalizedRefPhone = normalizePhoneNumber(parsed.phoneNumber)
      const { data: phoneMember } = await supabase
        .from('members')
        .select('id')
        .eq('phone_number', normalizedRefPhone)
        .single()
      if (phoneMember) {
        memberId = phoneMember.id
        console.log('✅ Member resolved by reference phone:', parsed.phoneNumber)
      }
    }

    // 4. Fallback: try payer's phone number (only when no member was specified in reference)
    if (!memberId && normalizedPhone && parsed.format !== 'member_and_case' && parsed.format !== 'phone_and_member') {
      const { data: phoneMember } = await supabase
        .from('members')
        .select('id')
        .eq('phone_number', normalizedPhone)
        .single()
      if (phoneMember) {
        phoneMatchedMemberId = phoneMember.id
        console.log('ℹ️ Phone suggestion (not auto-crediting):', normalizedPhone)
      }
    }

    // Determine match type for logging
    if (memberId && caseId) {
      matchType = 'member_and_case'
    } else if (memberId) {
      matchType = parsed.format === 'phone_and_member' ? 'phone_and_member' : 'member_number'
    } else if (caseId) {
      matchType = 'case_only'
    } else if (phoneMatchedMemberId) {
      matchType = 'phone_suggestion'
    }

    console.log('=== Resolution Summary ===')
    console.log('Member ID:', memberId, '| Case ID:', caseId, '| Match Type:', matchType)
    console.log('===========================')

    // === Transaction Creation Phase ===

    // SCENARIO 1: Member + Case → Credit member wallet AND link to case contribution
    if (memberId && caseId && transAmount > 0) {
      console.log('✅ Member + Case: Creating case contribution transaction')
      
      const { error: txError } = await supabase.from('transactions').insert({
        member_id: memberId,
        case_id: caseId,
        amount: transAmount,
        transaction_type: 'contribution',
        payment_method: 'mpesa',
        mpesa_reference: transID,
        reference: billRefNumber,
        description: `M-Pesa Case Payment - Case ${parsed.caseNumber} for Member ${parsed.memberNumber} - ${senderName}`,
        status: 'completed',
        created_at: transactionDate.toISOString(),
        metadata: { 
          webhook_source: 'c2b_v5',
          payment_for: 'case',
          payer_phone: normalizedPhone,
          target_member_id: memberId,
          case_number: parsed.caseNumber,
          expected_contribution: caseContributionAmount,
        },
      })

      if (txError) throw txError

      console.log('✅ Case contribution created successfully for member:', memberId, 'case:', caseId)

    // SCENARIO 2: Member only → Regular wallet funding
    } else if (memberId && !caseId && transAmount > 0) {
      console.log('✅ Member only: Creating wallet funding transaction')
      
      const { error: txError } = await supabase.from('transactions').insert({
        member_id: memberId,
        amount: transAmount,
        transaction_type: 'wallet_funding',
        payment_method: 'mpesa',
        mpesa_reference: transID,
        reference: billRefNumber,
        description: `M-Pesa C2B - ${senderName}`,
        status: 'completed',
        created_at: transactionDate.toISOString(),
        metadata: { webhook_source: 'c2b_v5', raw_payload: callback },
      })

      if (txError) throw txError

      console.log('✅ Wallet funding created successfully for member:', memberId)

    // SCENARIO 3: No member resolved → Save to suspense for manual review
    } else {
      console.log('⚠️ Payment could not be mapped safely. Saving to suspense.')

      const phoneSuggestionNote = phoneMatchedMemberId ? ' (phone match suggestion recorded)' : ''
      
      let fallbackReason = 'Account reference missing; manual review required'
      if (parsed.format === 'member_and_case') {
        fallbackReason = `Member ${parsed.memberNumber} not found${phoneSuggestionNote}`
        if (!caseActive && parsed.caseNumber) {
          fallbackReason = `Case ${parsed.caseNumber} not found or inactive; Member ${parsed.memberNumber} not found`
        }
      } else if (parsed.format === 'case_only') {
        fallbackReason = `Case-only payment (${parsed.caseNumber}); cannot identify which member to credit${phoneSuggestionNote}`
      } else if (parsed.format === 'phone_and_member') {
        fallbackReason = `Phone/member reference not resolved${phoneSuggestionNote}`
      } else if (parsed.memberNumber) {
        fallbackReason = `Member number ${parsed.memberNumber} not found${phoneSuggestionNote}`
      } else if (parsed.caseNumber) {
        fallbackReason = `Case ${parsed.caseNumber} not found or inactive${phoneSuggestionNote}`
      }

      const suspenseData = {
        mpesa_receipt_number: transID,
        phone_number: normalizedPhone || 'MISSING',
        amount: transAmount,
        sender_name: senderName,
        transaction_date: transactionDate.toISOString(),
        status: 'pending',
        reference: billRefNumber || null,
        source: 'c2b',
        notes: `M-Pesa C2B - ${senderName} - Account: ${billRefNumber || 'N/A'} [${parsed.format}]`,
        // NEW: Structured intent fields
        intended_member_id: memberId,
        intended_case_id: caseId,
        reference_type: parsed.format,
        metadata: { 
          webhook_source: 'c2b_v5',
          raw_payload: callback,
          raw_body: rawBody,
          reason: fallbackReason,
          match_type: matchType,
          phone_matched_member_id: phoneMatchedMemberId,
          parsed_reference: {
            member_number: parsed.memberNumber,
            case_number: parsed.caseNumber,
            phone: parsed.phoneNumber,
            format: parsed.format,
          },
          case_active: caseActive,
          expected_case_contribution: caseContributionAmount,
        },
      }

      const { data: result, error: insertError } = await supabase
        .from('wrong_mpesa_transactions')
        .insert(suspenseData)
        .select()
        .single()

      if (insertError) {
        console.error('❌ Suspense insert error:', insertError.message)
        await supabase.from('audit_logs').insert({
          action: 'INSERT',
          table_name: 'wrong_mpesa_transactions',
          status: 'error',
          new_values: {
            custom_action: 'C2B_SUSPENSE_INSERT_FAILED',
            error: insertError.message,
            mpesa_receipt_number: suspenseData.mpesa_receipt_number,
            phone_number: suspenseData.phone_number,
            amount: suspenseData.amount,
            reference: suspenseData.reference,
            source: suspenseData.source,
            reference_type: suspenseData.reference_type,
            reason: suspenseData.metadata?.reason,
          },
        })
      } else {
        console.log('✅ SUCCESS: Inserted to suspense for manual review.', result.id)
      }
    }

    // Always accept the webhook to prevent M-Pesa from resending
    return new Response(JSON.stringify({ ResultCode: 0, ResultDesc: 'Accepted' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error: any) {
    console.error('========== C2B WEBHOOK GLOBAL ERROR ==========')
    console.error('Error:', error.message)
    
    await supabase.from('audit_logs').insert({
      action: 'INSERT',
      table_name: 'mpesa-c2b-webhook',
      status: 'error',
      new_values: { custom_action: 'C2B_WEBHOOK_ERROR', error: error.message, body: await req.text() },
    })

    return new Response(JSON.stringify({ ResultCode: 0, ResultDesc: 'Accepted despite error' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

function normalizePhoneNumber(phone: string): string {
  if (!phone || phone.trim() === '') return ''
  let cleaned = phone.replace(/\D/g, '')
  if (cleaned.startsWith('254')) return '+' + cleaned
  if (cleaned.startsWith('0')) return '+254' + cleaned.substring(1)
  if (!cleaned.startsWith('+')) return '+' + cleaned
  return phone
}

function parseMpesaTimestamp(value: string): Date {
  const cleaned = value.replace(/\D/g, '')
  if (cleaned.length === 14) {
    const isoLike = `${cleaned.slice(0, 4)}-${cleaned.slice(4, 6)}-${cleaned.slice(6, 8)}T${cleaned.slice(8, 10)}:${cleaned.slice(10, 12)}:${cleaned.slice(12, 14)}+03:00`
    const parsed = new Date(isoLike)
    if (!Number.isNaN(parsed.getTime())) {
      return parsed
    }
  }

  const fallback = new Date(value)
  if (!Number.isNaN(fallback.getTime())) {
    return fallback
  }

  return new Date()
}
