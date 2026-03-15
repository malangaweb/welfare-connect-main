import { supabase } from "@/integrations/supabase/client";

export async function generateMemberId(): Promise<string> {
  try {
    // Get all member numbers from database
    const { data: membersData, error } = await supabase
      .from('members')
      .select('member_number');
      
    if (error) throw error;
    
    let nextNumber = 1;
    
    if (membersData && membersData.length > 0) {
      // Filter member numbers that don't start with 'M' and parse them
      const numbers = membersData
        .map(m => {
          if (!m.member_number) return null;
          const memberNumber = String(m.member_number).trim();
          
          // Skip if it starts with 'M'
          if (memberNumber.toUpperCase().startsWith('M')) {
            return null;
          }
          
          // Parse as integer
          const num = parseInt(memberNumber, 10);
          return isNaN(num) || num <= 0 ? null : num;
        })
        .filter((num): num is number => num !== null && !isNaN(num));
      
      if (numbers.length > 0) {
        // Find the highest number and increment by 1
        const maxNumber = Math.max(...numbers);
        nextNumber = maxNumber + 1;
      }
    }
    
    // Return just the number as string
    return String(nextNumber);
  } catch (error) {
    console.error('Error generating member ID:', error);
    // Return a safe default
    return '1';
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

