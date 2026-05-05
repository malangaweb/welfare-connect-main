import { supabase } from "@/integrations/supabase/client";
import { fetchSafeSettings } from "@/lib/settingsClient";

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
    const settingsData = await fetchSafeSettings();
    const startFrom = settingsData?.case_id_start || 1;
    
    let nextNumber = startFrom;

    // Fetch all case numbers (paged) and compute the highest numeric value.
    const pageSize = 1000;
    let from = 0;
    let maxNumber = 0;

    while (true) {
      const { data, error } = await supabase
        .from('cases')
        .select('case_number')
        .range(from, from + pageSize - 1);

      if (error) throw error;

      const rows = data || [];
      for (const row of rows) {
        const raw = String(row?.case_number || '').trim();
        if (!raw) continue;

        // Prefer explicit C### pattern, else fall back to the first digit group.
        const cMatch = raw.match(/^C(\d+)$/i);
        const digitMatch = raw.match(/(\d+)/);
        const parsed = cMatch?.[1] ?? digitMatch?.[1];
        const num = parsed ? parseInt(parsed, 10) : NaN;
        if (!isNaN(num) && num > maxNumber) {
          maxNumber = num;
        }
      }

      if (rows.length < pageSize) break;
      from += pageSize;
    }

    if (maxNumber > 0) {
      nextNumber = Math.max(maxNumber + 1, startFrom);
    }
    
    return `C${String(nextNumber).padStart(3, '0')}`;
  } catch (error) {
    console.error('Error generating case ID:', error);
    return `C${String(Math.floor(Math.random() * 1000)).padStart(3, '0')}`;
  }
}
