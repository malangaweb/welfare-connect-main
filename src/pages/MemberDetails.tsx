import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from '@/components/ui/use-toast';
import { ChevronLeft, Edit } from 'lucide-react';
import DashboardLayout from '@/layouts/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Member } from '@/lib/types';
import { supabase, supabaseAdmin } from '@/integrations/supabase/client';
import { DbMember, DbDependant, mapDbMemberToMember } from '@/lib/db-types';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';

// Import refactored components
import MemberProfileCard from '@/components/member/MemberProfileCard';
import WalletCard from '@/components/member/WalletCard';
import PersonalDetailsCard from '@/components/member/PersonalDetailsCard';
import NextOfKinCard from '@/components/member/NextOfKinCard';
import DependantsList from '@/components/member/DependantsList';
import CasesTab from '@/components/member/CasesTab';
import MemberDetailsLoading from '@/components/member/MemberDetailsLoading';
import MemberDetailsError from '@/components/member/MemberDetailsError';
import MemberForm from '@/components/forms/MemberForm';

const MemberDetails = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [member, setMember] = useState<Member | null>(null);
  const [addDependantOpen, setAddDependantOpen] = useState(false);
  const [editMemberOpen, setEditMemberOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newDependant, setNewDependant] = useState({
    name: '',
    gender: 'male',
    relationship: '',
    dateOfBirth: new Date(),
    isDisabled: false,
    isEligible: true,
  });
  const [addingDependant, setAddingDependant] = useState(false);
  const [editInitialData, setEditInitialData] = useState<any>(null);

  const handleAddDependant = () => {
    setAddDependantOpen(true);
  };

  const handleDependantField = (field: string, value: any) => {
    setNewDependant(prev => ({ ...prev, [field]: value }));
  };

  const handleDependantSubmit = async () => {
    if (!id) return;
    if (!newDependant.name.trim() || !newDependant.relationship.trim()) {
      toast({ title: 'Validation Error', description: 'Name and relationship are required', variant: 'destructive' });
      return;
    }
    setAddingDependant(true);
    const { error } = await supabase.from('dependants').insert({
      member_id: id,
      name: newDependant.name,
      gender: newDependant.gender,
      relationship: newDependant.relationship,
      date_of_birth: newDependant.dateOfBirth.toISOString(),
      is_disabled: newDependant.isDisabled,
      is_eligible: newDependant.isEligible,
    });
    setAddingDependant(false);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }
    setAddDependantOpen(false);
    setNewDependant({ name: '', gender: 'male', relationship: '', dateOfBirth: new Date(), isDisabled: false, isEligible: true });
    // Refresh member data
    try {
      setLoading(true);
      const { data: memberData } = await supabase.from('members').select('*').eq('id', id).maybeSingle();
      const { data: dependantsData } = await supabase.from('dependants').select('*').eq('member_id', id);
      if (memberData) {
        const dbMember = memberData as DbMember;
        const dependants = dependantsData as DbDependant[] || [];
        const updatedMember = mapDbMemberToMember(dbMember, dependants);
        setMember(updatedMember);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleViewTransactions = () => {
    // Navigate to transactions view filtered for this member
    navigate(`/transactions?memberId=${id}`);
  };

  const handleFundingSuccess = async () => {
    // Refresh member data after funding
    try {
      setLoading(true);
      const { data: memberData } = await supabase
        .from('members')
        .select('*')
        .eq('id', id)
        .maybeSingle();
        
      const { data: dependantsData } = await supabase
        .from('dependants')
        .select('*')
        .eq('member_id', id);
        
      if (memberData) {
        const dbMember = memberData as DbMember;
        const dependants = dependantsData as DbDependant[] || [];
        const updatedMember = mapDbMemberToMember(dbMember, dependants);
        setMember(updatedMember);
      }
    } catch (error) {
      console.error('Error refreshing member data:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to refresh member data.",
      });
    } finally {
      setLoading(false);
    }
  };

  const checkUserPermissions = async () => {
    console.log('=== CHECKING USER PERMISSIONS ===');
    try {
      // Check current session
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      console.log('Session data:', sessionData);
      console.log('Session error:', sessionError);
      
      // Check current user
      const { data: userData, error: userError } = await supabase.auth.getUser();
      console.log('User data:', userData);
      console.log('User error:', userError);
      
      // Test if we can access the members table
      const { data: testData, error: testError } = await supabase
        .from('members')
        .select('count')
        .limit(1);
      
      console.log('Table access test:', { testData, testError });
      
    } catch (error) {
      console.error('Permission check failed:', error);
    }
    console.log('=== END PERMISSION CHECK ===');
  };

  const testUpdate = async () => {
    alert('Test Update button clicked! Check console for details.');
    console.log('Test Update button clicked!');
    if (!id) {
      console.log('No member ID available');
      alert('No member ID available');
      return;
    }
    
    console.log('=== TESTING SIMPLE UPDATE ===');
    console.log('Member ID for testing:', id);
    
    // First check permissions
    await checkUserPermissions();
    
    try {
      // Test 1: Can we read the current data?
      console.log('Attempting to read current member data...');
      const { data: currentData, error: readError } = await supabase
        .from('members')
        .select('*')
        .eq('id', id)
        .single();
      
      console.log('Current data:', currentData);
      console.log('Read error:', readError);
      
      if (readError) {
        console.error('Cannot read member data:', readError);
        alert('Cannot read member data: ' + readError.message);
        return;
      }
      
      // Test 2: Try a simple update with just the name
      const testName = currentData.name + ' (TEST)';
      console.log('Attempting to update name to:', testName);
      
      const { data: updateResult, error: updateError } = await supabase
        .from('members')
        .update({ name: testName })
        .eq('id', id)
        .select();
      
      console.log('Update result:', updateResult);
      console.log('Update error:', updateError);
      
      if (updateError) {
        console.error('Update failed:', updateError);
        alert('Update failed: ' + updateError.message);
        
        // Test 3: Check if it's a permissions issue
        console.log('Testing with admin client...');
        const { data: adminResult, error: adminError } = await supabaseAdmin
          .from('members')
          .update({ name: testName })
          .eq('id', id)
          .select();
        
        console.log('Admin update result:', adminResult);
        console.log('Admin update error:', adminError);
        
        if (adminError) {
          alert('Admin update also failed: ' + adminError.message);
        } else {
          alert('Admin update succeeded!');
        }
      } else {
        console.log('Update successful!');
        alert('Update successful!');
        
        // Test 4: Verify the update
        const { data: verifyData, error: verifyError } = await supabase
          .from('members')
          .select('*')
          .eq('id', id)
          .single();
        
        console.log('Verification data:', verifyData);
        console.log('Verification error:', verifyError);
      }
      
    } catch (error) {
      console.error('Test update failed:', error);
      alert('Test update failed: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
    console.log('=== END TEST ===');
  };

  const handleEditMember = async (data: any) => {
    if (!id) return;
    
    setIsSubmitting(true);
    try {
      console.log('=== EDIT MEMBER DEBUG START ===');
      console.log('Edit member data received:', data);
      console.log('Member ID:', id);
      console.log('Current member data:', member);
      
      // Run the test first
      await testUpdate();
      
      // Get the residence name for this ID
      let residenceName = data.residence;
      if (data.residence && typeof data.residence === 'string' && data.residence.length > 0) {
        console.log('Fetching residence name for ID:', data.residence);
        const { data: residenceData, error: residenceError } = await supabase
          .from('residences')
          .select('name')
          .eq('id', data.residence)
          .single();
          
        if (residenceError) {
          console.error('Error fetching residence name:', residenceError);
          throw new Error('Failed to fetch residence information');
        }
        
        residenceName = residenceData.name;
        console.log('Residence name resolved:', residenceName);
      }
      
      // Prepare the data for update
      const updateData = {
        name: data.name,
        gender: data.gender,
        date_of_birth: data.dateOfBirth.toISOString().split('T')[0],
        national_id_number: data.nationalIdNumber,
        phone_number: data.phoneNumber || null,
        email_address: data.emailAddress || null,
        residence: residenceName,
        next_of_kin: data.nextOfKin,
      };

      console.log('Update data being sent to database:', updateData);
      console.log('Member ID being updated:', id);

      // Try using admin client for update
      const { data: result, error } = await supabaseAdmin
        .from('members')
        .update(updateData)
        .eq('id', id)
        .select();

      console.log('Update result:', { result, error });

      if (error) {
        console.error('Supabase update error:', error);
        
        // Try with regular client as fallback
        console.log('Trying with regular client...');
        const { data: fallbackResult, error: fallbackError } = await supabase
          .from('members')
          .update(updateData)
          .eq('id', id)
          .select();
          
        console.log('Fallback update result:', { fallbackResult, fallbackError });
        
        if (fallbackError) {
          throw fallbackError;
        }
      }

      // Verify the update by fetching the data again
      const { data: verifyData, error: verifyError } = await supabase
        .from('members')
        .select('*')
        .eq('id', id)
        .single();
      
      console.log('Verification data after update:', verifyData);
      if (verifyError) {
        console.error('Error verifying update:', verifyError);
      }

      console.log('=== EDIT MEMBER DEBUG END ===');

      toast({
        title: "Success",
        description: "Member information updated successfully.",
      });

      setEditMemberOpen(false);
      
      // Refresh member data
      await fetchMember();
    } catch (error) {
      console.error('Error updating member:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to update member information.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const getResidenceId = async (residenceName: string) => {
    try {
      const { data, error } = await supabase
        .from('residences')
        .select('id')
        .eq('name', residenceName)
        .single();
        
      if (error) {
        console.error('Error fetching residence ID:', error);
        return null;
      }
      
      return data?.id || null;
    } catch (error) {
      console.error('Error in getResidenceId:', error);
      return null;
    }
  };

  const handleEditClick = async () => {
    if (!member) return;
    
    try {
      // Get residence ID for the form
      const residenceId = await getResidenceId(member.residence);
      
      setEditInitialData({
        memberNumber: member.memberNumber,
        name: member.name,
        gender: member.gender,
        dateOfBirth: member.dateOfBirth,
        nationalIdNumber: member.nationalIdNumber,
        phoneNumber: member.phoneNumber,
        emailAddress: member.emailAddress,
        residence: residenceId,
        nextOfKin: member.nextOfKin,
        dependants: member.dependants,
      });
      
      setEditMemberOpen(true);
    } catch (error) {
      console.error('Error preparing edit data:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to prepare edit form data.",
      });
    }
  };

  const fetchMember = async () => {
    if (!id) {
      setError("Member ID is required");
      setLoading(false);
      return;
    }
    
    try {
      setLoading(true);
      setError(null);
      
      console.log('Fetching member with ID:', id);
      
      const { data: memberData, error: memberError } = await supabase
        .from('members')
        .select(`
          id,
          member_number,
          name,
          gender,
          date_of_birth,
          national_id_number,
          phone_number,
          email_address,
          residence,
          next_of_kin,
          registration_date,
          is_active
        `)
        .eq('id', id)
        .maybeSingle();

      if (memberError) {
        console.error('Error fetching member:', memberError);
        throw memberError;
      }
      
      if (!memberData) {
        throw new Error('Member not found');
      }
      
      const { data: dependantsData, error: dependantsError } = await supabase
        .from('dependants')
        .select('*');

      if (dependantsError) {
        console.error('Error fetching dependants:', dependantsError);
        throw dependantsError;
      }
      
      console.log('Member data:', memberData);
      console.log('Dependants data:', dependantsData);
      
      const dbMember = memberData as DbMember;
      const dependants = dependantsData as DbDependant[] || [];
      const memberWithDependants = mapDbMemberToMember(dbMember, dependants);

      // Fetch all transactions for this member and sum the amount
      const { data: transactions, error: txError } = await supabase
        .from('transactions')
        .select('amount')
        .eq('member_id', id);
      if (txError) {
        console.error('Error fetching transactions:', txError);
        throw txError;
      }
      const walletBalance = (transactions || []).reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0);
      setMember({ ...memberWithDependants, walletBalance });
    } catch (error) {
      console.error('Error in fetchMember:', error);
      setError(error instanceof Error ? error.message : 'Failed to load member details');
      toast({
        variant: "destructive",
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to load member details.",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMember();
  }, [id, navigate]);

  if (loading) {
    return (
      <DashboardLayout>
        <MemberDetailsLoading onBack={() => navigate('/members')} />
      </DashboardLayout>
    );
  }

  if (error || !member) {
    return (
      <DashboardLayout>
        <MemberDetailsError error={error} onBack={() => navigate('/members')} />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center">
          <Button variant="ghost" onClick={() => navigate('/members')} className="mr-4">
            <ChevronLeft className="h-4 w-4 mr-2" />
            Back to Members
          </Button>
          <div className="flex-1">
            <h1 className="text-3xl font-bold mb-1">Member Details</h1>
            <p className="text-muted-foreground">View and manage member information</p>
          </div>
          <div className="flex space-x-2">
            <Button variant="outline" onClick={testUpdate}>
              Test Update
            </Button>
            <Button onClick={handleEditClick}>
              <Edit className="h-4 w-4 mr-2" />
              Edit Member
            </Button>
          </div>
        </div>

        <div className="flex flex-col md:flex-row gap-6">
          <div className="md:w-1/3">
            <MemberProfileCard member={member} />
            <WalletCard 
              balance={member.walletBalance} 
              onViewTransactions={handleViewTransactions}
              memberId={member.id}
              memberName={member.name}
              onFundingSuccess={handleFundingSuccess}
              showFundingOption={true}
            />
          </div>
          
          <div className="md:w-2/3">
            <Tabs defaultValue="details">
              <TabsList>
                <TabsTrigger value="details">Personal Details</TabsTrigger>
                <TabsTrigger value="dependants">Dependants</TabsTrigger>
                <TabsTrigger value="cases">Cases</TabsTrigger>
              </TabsList>
              
              <TabsContent value="details" className="space-y-6">
                <PersonalDetailsCard member={member} onEdit={handleEditClick} />
                <NextOfKinCard nextOfKin={member.nextOfKin} />
              </TabsContent>
              
              <TabsContent value="dependants">
                <DependantsList 
                  dependants={member.dependants}
                  onAddDependant={handleAddDependant}
                />
                <Dialog open={addDependantOpen} onOpenChange={setAddDependantOpen}>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Add Dependant</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div>
                        <label>Name*</label>
                        <Input value={newDependant.name} onChange={e => handleDependantField('name', e.target.value)} placeholder="Dependant name" />
                      </div>
                      <div>
                        <label>Gender*</label>
                        <Select value={newDependant.gender} onValueChange={v => handleDependantField('gender', v)}>
                          <SelectTrigger><SelectValue placeholder="Select gender" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="male">Male</SelectItem>
                            <SelectItem value="female">Female</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <label>Relationship*</label>
                        <Input value={newDependant.relationship} onChange={e => handleDependantField('relationship', e.target.value)} placeholder="E.g. Spouse, Child" />
                      </div>
                      <div>
                        <label>Date of Birth*</label>
                        <DatePicker 
                          selected={newDependant.dateOfBirth} 
                          onChange={(date: Date) => handleDependantField('dateOfBirth', date)} 
                          dateFormat="yyyy-MM-dd" 
                          maxDate={new Date()} 
                          className="w-full border rounded px-3 py-2" 
                        />
                      </div>
                      <div className="flex items-center space-x-2">
                        <input type="checkbox" id="isDisabled" checked={newDependant.isDisabled} onChange={e => handleDependantField('isDisabled', e.target.checked)} />
                        <label htmlFor="isDisabled">Has disability</label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <input type="checkbox" id="isEligible" checked={newDependant.isEligible} onChange={e => handleDependantField('isEligible', e.target.checked)} />
                        <label htmlFor="isEligible">Eligible</label>
                      </div>
                    </div>
                    <DialogFooter>
                      <Button onClick={handleDependantSubmit} disabled={addingDependant}>{addingDependant ? 'Saving...' : 'Save'}</Button>
                      <DialogClose asChild>
                        <Button variant="outline">Cancel</Button>
                      </DialogClose>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </TabsContent>
              
              <TabsContent value="cases">
                <CasesTab />
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>

      {/* Edit Member Dialog */}
      <Dialog open={editMemberOpen} onOpenChange={setEditMemberOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Member Information</DialogTitle>
          </DialogHeader>
          {member && (
            <MemberForm
              onSubmit={handleEditMember}
              initialData={editInitialData}
              isSubmitting={isSubmitting}
              isEditMode={true}
            />
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default MemberDetails;
