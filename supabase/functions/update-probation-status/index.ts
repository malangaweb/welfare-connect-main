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

    // Update members whose probation period has ended
    const { data, error } = await supabase.rpc(`
      UPDATE members
      SET 
        status = 'active',
        updated_at = NOW()
      WHERE 
        status = 'probation'
        AND probation_end_date <= CURRENT_DATE
      RETURNING id, member_number, name
    `)

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

    const updatedMembers = data || []

    // Log the updates
    if (updatedMembers.length > 0) {
      await supabase.from('audit_logs').insert({
        action: 'PROBATION_STATUS_AUTO_UPDATE',
        table_name: 'members',
        status: 'success',
        metadata: {
          updated_count: updatedMembers.length,
          updated_members: updatedMembers.map((m: any) => ({
            id: m.id,
            member_number: m.member_number,
            name: m.name,
          })),
          executed_at: new Date().toISOString(),
        },
      })
    }

    console.log(`Updated ${updatedMembers.length} members from probation to active`)

    return new Response(
      JSON.stringify({ 
        success: true, 
        updated_count: updatedMembers.length,
        updated_members: updatedMembers,
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
