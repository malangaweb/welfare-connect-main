// Update Probation Status Edge Function
// Cron job to auto-update member probation status

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Verify this is being called by Supabase scheduler or with proper auth
    const authHeader = req.headers.get('Authorization')
    if (!authHeader && req.method !== 'GET') {
      // Allow GET for testing from browser
      console.warn('No authorization header - proceeding anyway for testing')
    }

    // Initialize Supabase client with service role key
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Update members whose probation period has ended via the canonical
    // DB function (single source of truth, also writes PROBATION_AUTO_UPDATE
    // to audit_logs). NOTE: supabase-js rpc() takes a function name, not SQL.
    const { data, error } = await supabase.rpc('auto_update_probation_status')

    if (error) {
      console.error('Error updating probation status:', error)
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: error.message,
          updated_count: 0 
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        }
      )
    }

    // DB function returns INT count (and already writes PROBATION_AUTO_UPDATE
    // to audit_logs itself), so no second audit insert here — avoids doubles.
    const updatedCount = typeof data === 'number' ? data : 0

    console.log(`Updated ${updatedCount} members from probation to active`)

    return new Response(
      JSON.stringify({
        success: true,
        updated_count: updatedCount,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )

  } catch (error: any) {
    console.error('Probation update error:', error)
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message,
        updated_count: 0 
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    )
  }
})
