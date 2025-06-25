import { supabase } from "@/integrations/supabase/client";

export async function generateMemberId(): Promise<string> {
  try {
    // Get the starting number from settings
    const { data: settingsData, error: settingsError } = await supabase
      .from('settings')
      .select('member_id_start')
      .limit(1)
      .maybeSingle();
      
    if (settingsError) throw settingsError;
    
    const startFrom = settingsData?.member_id_start || 1;
    
    // Get the current highest member number
    const { data, error } = await supabase
      .from('members')
      .select('member_number')
      .order('member_number', { ascending: false })
      .limit(1)
      .maybeSingle();
      
    if (error) throw error;
    
    let nextNumber = startFrom;
    
    if (data && data.member_number) {
      const currentNumber = parseInt(data.member_number.replace('M', ''));
      nextNumber = Math.max(currentNumber + 1, startFrom);
    }
    
    return `M${String(nextNumber).padStart(3, '0')}`;
  } catch (error) {
    console.error('Error generating member ID:', error);
    return `M${String(Math.floor(Math.random() * 1000)).padStart(3, '0')}`;
  }
}

export async function generateCaseId(): Promise<string> {
  try {
    // Get the starting number from settings
    const { data: settingsData, error: settingsError } = await supabase
      .from('settings')
      .select('case_id_start')
      .limit(1)
      .maybeSingle();
      
    if (settingsError) throw settingsError;
    
    const startFrom = settingsData?.case_id_start || 1;
    
    // Get the current highest case number
    const { data, error } = await supabase
      .from('cases')
      .select('case_number')
      .order('case_number', { ascending: false })
      .limit(1)
      .maybeSingle();
      
    if (error) throw error;
    
    let nextNumber = startFrom;
    
    if (data && typeof data.case_number === 'string') {
      // Only parse if it matches the expected format (e.g., C001, C123)
      const match = data.case_number.match(/^C(\d+)$/);
      if (match && match[1]) {
        const currentNumber = parseInt(match[1], 10);
        if (!isNaN(currentNumber)) {
          nextNumber = Math.max(currentNumber + 1, startFrom);
        }
      }
    }
    
    return `C${String(nextNumber).padStart(3, '0')}`;
  } catch (error) {
    console.error('Error generating case ID:', error);
    return `C${String(Math.floor(Math.random() * 1000)).padStart(3, '0')}`;
  }
}
