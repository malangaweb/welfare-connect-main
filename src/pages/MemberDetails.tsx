import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from '@/components/ui/use-toast';
import { ChevronLeft, Edit, Trash2 } from 'lucide-react';
import DashboardLayout from '@/layouts/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Member } from '@/lib/types';
import { supabase } from '@/integrations/supabase/client';
import { DbMember, DbDependant, mapDbMemberToMember } from '@/lib/db-types';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { useAuth } from '@/contexts/AuthContext';

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
import { deleteMemberUserLinks } from '@/lib/adminUsersApi';
import { DEPENDANT_COLUMNS, MEMBER_DETAIL_COLUMNS } from '@/lib/supabaseSelectColumns';

const MemberDetails = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const { isSuperAdmin } = useAuth();
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
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deductDialogOpen, setDeductDialogOpen] = useState(false);
  const [deductAmount, setDeductAmount] = useState('');
  const [deductReason, setDeductReason] = useState('');
  const [deductTarget, setDeductTarget] = useState<'arrears' | 'registration' | 'case'>('arrears');
  const [deductCaseId, setDeductCaseId] = useState<string>('');
  const [isDeducting, setIsDeducting] = useState(false);
  const [availableCases, setAvailableCases] = useState<{ id: string; case_number: string; title: string }[]>([]);

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
    } as any);
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
      const { data: memberData } = await supabase
        .from('members')
        .select(MEMBER_DETAIL_COLUMNS)
        .eq('id', id)
        .maybeSingle();
      const { data: dependantsData } = await supabase
        .from('dependants')
        .select(DEPENDANT_COLUMNS)
        .eq('member_id', id);
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

  const handleTransferSuccess = async () => {
    // Refresh member data after transfer (same as funding for now)
    await handleFundingSuccess();
  };

  const handleDeductToAccount = async () => {
    if (!id || !member) return;

    const amountNum = Number(deductAmount);
    if (!amountNum || amountNum <= 0) {
      toast({
        variant: 'destructive',
        title: 'Validation Error',
        description: 'Please enter a valid amount.',
      });
      return;
    }

    if (amountNum > (member.walletBalance || 0)) {
      toast({
        variant: 'destructive',
        title: 'Insufficient funds',
        description: 'Member wallet balance is too low. Ask the member to add funds first.',
      });
      return;
    }

    if (deductTarget === 'case' && !deductCaseId) {
      toast({
        variant: 'destructive',
        title: 'Select a case',
        description: 'Choose a case to receive this deduction.',
      });
      return;
    }

    setIsDeducting(true);
    try {
      const baseDescription = deductReason?.trim()
        ? `Deducted to ${deductTarget} - ${deductReason.trim()}`
        : `Deducted to ${deductTarget}`;

      let transactionType: string = deductTarget === 'registration' ? 'registration' : 'arrears';
      let transactionPayload: any = {
        member_id: id,
        amount: Math.abs(amountNum),
        transaction_type: transactionType,
        status: 'completed',
        description: baseDescription,
        metadata: {
          source: 'deduct_to_account',
          target: deductTarget,
          case_id: deductTarget === 'case' ? deductCaseId : null,
          reason: deductReason || null,
        },
      };

      if (deductTarget === 'case') {
        // Case deductions from this screen are wallet debits, not neutral case contribution records.
        transactionType = 'case_wallet_deduction';
        transactionPayload = {
          ...transactionPayload,
          transaction_type: transactionType,
          case_id: deductCaseId,
          description: deductReason?.trim()
            ? `Case wallet deduction - ${deductReason.trim()}`
            : 'Case wallet deduction',
        };
      }

      const { error } = await supabase.from('transactions').insert(transactionPayload as any);
      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Amount deducted successfully.',
      });

      setDeductDialogOpen(false);
      setDeductAmount('');
      setDeductReason('');
      setDeductCaseId('');
      setDeductTarget('arrears');
      await handleFundingSuccess();
    } catch (error) {
      console.error('Error deducting to account:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to deduct to account.',
      });
    } finally {
      setIsDeducting(false);
    }
  };

  const handleFundingSuccess = async () => {
    // Refresh member data after funding
    try {
      setLoading(true);
      const [{ data: memberData }, { data: dependantsData }] = await Promise.all([
        supabase.from('members').select(MEMBER_DETAIL_COLUMNS).eq('id', id).maybeSingle(),
        supabase.from('dependants').select(DEPENDANT_COLUMNS).eq('member_id', id),
      ]);
        
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


  const handleDeleteMember = async () => {
    if (!id || !member) return;
    
    setIsDeleting(true);
    try {
      // Delete linked user credentials through trusted API
      await deleteMemberUserLinks(id);

      // Delete transactions
      await supabase
        .from('transactions')
        .delete()
        .eq('member_id', id);
      
      // Delete cases where member is affected
      await supabase
        .from('cases')
        .delete()
        .eq('affected_member_id', id);
      
      // Delete dependants
      await supabase
        .from('dependants')
        .delete()
        .eq('member_id', id);
      
      // Finally, delete the member
      const { error: deleteError } = await supabase
        .from('members')
        .delete()
        .eq('id', id);
      
      if (deleteError) {
        throw deleteError;
      }
      
      toast({
        title: "Member Deleted",
        description: `${member.name} (${member.memberNumber}) and all related records have been deleted.`,
      });
      
      // Navigate back to members list
      navigate('/members');
    } catch (error) {
      console.error('Error deleting member:', error);
      toast({
        variant: "destructive",
        title: "Delete Failed",
        description: error instanceof Error ? error.message : "Failed to delete member and related records.",
      });
    } finally {
      setIsDeleting(false);
      setDeleteConfirmOpen(false);
    }
  };

  const handleEditMember = async (data: any) => {
    if (!id) return;
    
    setIsSubmitting(true);
    try {
      // Get the residence name for this ID
      let residenceName = data.residence;
      if (data.residence && typeof data.residence === 'string' && data.residence.length > 0) {
        const { data: residenceData, error: residenceError } = await supabase
          .from('residences')
          .select('name')
          .eq('id', data.residence)
          .single() as { data: { name: string } | null; error: Error | null };
          
        if (residenceError) {
          console.error('Error fetching residence name:', residenceError);
          throw new Error('Failed to fetch residence information');
        }
        
        if (residenceData) {
          residenceName = residenceData.name;
        }
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

      const { data: result, error } = await supabase
        .from('members')
        // @ts-ignore
        .update(updateData)
        .eq('id', id)
        .select(MEMBER_DETAIL_COLUMNS);

      if (error) {
        console.error('Supabase update error:', error);
        
        // Try with regular client as fallback
        const { data: fallbackResult, error: fallbackError } = await supabase
          .from('members')
          // @ts-ignore
          .update(updateData)
          .eq('id', id)
          .select(MEMBER_DETAIL_COLUMNS);
        
        if (fallbackError) {
          throw fallbackError;
        }
      }

      // Verify the update by fetching the data again
      const { data: verifyData, error: verifyError } = await supabase
        .from('members')
        .select(MEMBER_DETAIL_COLUMNS)
        .eq('id', id)
        .single();
      
      if (verifyError) {
        console.error('Error verifying update:', verifyError);
      }

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
      
      // @ts-ignore - Supabase type inference issue
      return data?.id ?? null;
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
      
      const { data: memberData, error: memberError } = await supabase
        .from('members')
        .select(MEMBER_DETAIL_COLUMNS)
        .eq('id', id)
        .maybeSingle();

      if (memberError) {
        console.error('Error fetching member:', memberError);
        throw memberError;
      }
      
      if (!memberData) {
        throw new Error('Member not found');
      }
      
      const [{ data: dependantsData, error: dependantsError }, { data: transactions, error: txError }] =
        await Promise.all([
          supabase.from('dependants').select(DEPENDANT_COLUMNS).eq('member_id', id),
          supabase.from('transactions').select('amount, transaction_type').eq('member_id', id),
        ]);

      if (dependantsError) {
        console.error('Error fetching dependants:', dependantsError);
        throw dependantsError;
      }
      if (txError) {
        console.error('Error fetching transactions:', txError);
        throw txError;
      }

      const dbMember = memberData as DbMember;
      const dependants = dependantsData as DbDependant[] || [];
      const memberWithDependants = mapDbMemberToMember(dbMember, dependants);

      // Prefer stored wallet_balance maintained by DB trigger; fall back to calculated sum for safety
      const calculatedBalance = (transactions || []).reduce((sum, tx: any) => {
        const amount = Number(tx.amount) || 0;
        const type = String(tx.transaction_type || '').toLowerCase();
        const normalizedAmount = ['registration', 'renewal', 'penalty', 'contribution', 'arrears'].includes(type)
          ? -Math.abs(amount)
          : amount;
        return sum + normalizedAmount;
      }, 0);

      const walletBalance = Number.isFinite(dbMember.wallet_balance)
        ? Number(dbMember.wallet_balance)
        : calculatedBalance;

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

  useEffect(() => {
    const loadCases = async () => {
      if (!deductDialogOpen || deductTarget !== 'case') return;
      try {
        const { data, error } = await supabase
          .from('cases')
          .select('id, case_number, case_type, is_active')
          .eq('is_active', true);
        if (error) throw error;
        setAvailableCases((data || []).map((c: any) => ({
          id: c.id,
          case_number: c.case_number,
          title: c.case_type || c.case_number,
        })));
      } catch (error) {
        console.error('Error loading cases for deduction:', error);
      }
    };
    loadCases();
  }, [deductDialogOpen, deductTarget]);

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
            <Button 
              variant="destructive" 
              onClick={() => setDeleteConfirmOpen(true)}
              disabled={isDeleting}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              {isDeleting ? 'Deleting...' : 'Delete Member'}
            </Button>
            <Button onClick={handleEditClick}>
              <Edit className="h-4 w-4 mr-2" />
              Edit Member
            </Button>
          </div>
        </div>

        <div className="flex flex-col md:flex-row gap-6">
          <div className="md:w-1/3">
            <MemberProfileCard
              member={member}
              onRefresh={fetchMember}
              onEdit={handleEditClick}
            />
            <WalletCard 
              balance={member.walletBalance}
              onViewTransactions={handleViewTransactions}
              memberId={member.id}
              memberName={member.name}
              memberNumber={member.memberNumber}
              memberPhone={member.phoneNumber}
              onFundingSuccess={handleFundingSuccess}
              onTransferSuccess={handleTransferSuccess}
              showFundingOption
              isSuperAdmin={isSuperAdmin()}
              onBalanceUpdate={handleFundingSuccess}
            />
            <div className="mt-3">
              <Button
                variant="destructive"
                className="w-full"
                onClick={() => setDeductDialogOpen(true)}
              >
                Deduct to Account
              </Button>
            </div>
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

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Member</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground mb-4">
              Are you sure you want to delete <strong>{member?.name}</strong> (Member #{member?.memberNumber})?
            </p>
            <p className="text-sm text-destructive font-medium">
              This action will permanently delete:
            </p>
            <ul className="list-disc list-inside text-sm text-muted-foreground mt-2 space-y-1">
              <li>The member record</li>
              <li>All dependants</li>
              <li>All transactions</li>
              <li>All cases where this member is affected</li>
              <li>User account and credentials (if any)</li>
            </ul>
            <p className="text-sm font-semibold text-destructive mt-4">
              This action cannot be undone.
            </p>
          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setDeleteConfirmOpen(false)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleDeleteMember}
              disabled={isDeleting}
            >
              {isDeleting ? 'Deleting...' : 'Delete Member'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Deduct to Account Dialog */}
      <Dialog open={deductDialogOpen} onOpenChange={setDeductDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Deduct to Account</DialogTitle>
            <DialogDescription>
              Move funds out of this wallet into arrears, registration, or a specific case. The wallet balance will decrease immediately.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label>Amount*</label>
              <Input
                type="number"
                value={deductAmount}
                onChange={(e) => setDeductAmount(e.target.value)}
                placeholder="Enter amount"
                min={0}
              />
            </div>
            <div>
              <label>Target Account*</label>
              <Select value={deductTarget} onValueChange={(v) => setDeductTarget(v as any)}>
                <SelectTrigger><SelectValue placeholder="Select target" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="arrears">Arrears</SelectItem>
                  <SelectItem value="registration">Registration</SelectItem>
                  <SelectItem value="case">Case</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {deductTarget === 'case' && (
              <div>
                <label>Select Case*</label>
                <Select value={deductCaseId} onValueChange={setDeductCaseId}>
                  <SelectTrigger><SelectValue placeholder="Choose a case" /></SelectTrigger>
                  <SelectContent>
                    {availableCases.map(c => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.case_number} — {c.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <label>Reason (optional)</label>
              <Input
                value={deductReason}
                onChange={(e) => setDeductReason(e.target.value)}
                placeholder="e.g. Manual adjustment / re-allocation" 
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeductDialogOpen(false)}
              disabled={isDeducting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeductToAccount}
              disabled={isDeducting}
            >
              {isDeducting ? 'Saving...' : 'Deduct'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default MemberDetails;
