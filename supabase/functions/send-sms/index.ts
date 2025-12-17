// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { corsHeaders } from "../_shared/cors.ts"

const SMS_CONFIG = {
  apiKey: 'b8fc0c4dd1215f5e21d0569157594d9e',
  partnerID: '10332',
  shortcode: 'WELFARE',
  baseUrl: 'https://sms.textsms.co.ke/api/services'
};

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { phoneNumber, message } = await req.json();

    if (!phoneNumber || !message) {
      return new Response(
        JSON.stringify({ error: 'Phone number and message are required' }),
        { 
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Format phone number to ensure it starts with 254
    const formattedNumber = phoneNumber.replace(/^0/, '254').replace(/^\+/, '');
    console.log('Formatted phone number:', formattedNumber);

    const requestBody = {
      apikey: SMS_CONFIG.apiKey,
      partnerID: SMS_CONFIG.partnerID,
      mobile: formattedNumber,
      message: message,
      shortcode: SMS_CONFIG.shortcode,
      pass_type: 'plain'
    };

    console.log('Sending SMS request:', requestBody);

    const response = await fetch(`${SMS_CONFIG.baseUrl}/sendsms/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody)
    });

    const data = await response.json();
    console.log('SMS API Response:', data);

    // Check for specific error codes
    if (data.responses && data.responses[0]) {
      const response = data.responses[0];
      const responseCode = response['respose-code'];
      
      switch(responseCode) {
        case 200:
          return new Response(
            JSON.stringify({ success: true, data }),
            { 
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            }
          );
        case 1001:
          throw new Error('Invalid sender ID');
        case 1002:
          throw new Error('Network not allowed');
        case 1003:
          throw new Error('Invalid mobile number');
        case 1004:
          throw new Error('Low bulk credits');
        case 1005:
        case 1007:
          throw new Error('System error occurred');
        case 1006:
          throw new Error('Invalid API credentials');
        case 1008:
          throw new Error('No delivery report available');
        case 1009:
          throw new Error('Unsupported data type');
        case 1010:
          throw new Error('Unsupported request type');
        case 4090:
          throw new Error('Internal error. Please try again after 5 minutes');
        case 4091:
          throw new Error('No Partner ID is set');
        case 4092:
          throw new Error('No API KEY provided');
        case 4093:
          throw new Error('Details not found');
        default:
          throw new Error(`Unknown error: ${response['response-description']}`);
      }
    } else {
      throw new Error('Invalid response from SMS API');
    }
  } catch (error) {
    console.error('Error in send-sms function:', error);
    
    return new Response(
      JSON.stringify({ 
        error: error.message || 'An error occurred while sending SMS',
        details: error.toString()
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
