// CORS headers for Supabase Edge Functions
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Helper function to create a CORS response
export function corsResponse(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

// Helper function to create an error response
export function errorResponse(message: string, status = 400) {
  return corsResponse({ error: message }, status);
}

// Helper function to create a success response
export function successResponse(data: any) {
  return corsResponse({ success: true, data });
}
