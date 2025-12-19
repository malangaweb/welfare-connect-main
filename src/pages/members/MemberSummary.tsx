import { useEffect, useState } from "react";
import DashboardLayout from "@/layouts/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { memberLinks, memberLogout } from "./memberLinks";
import { Badge } from "@/components/ui/badge";
import { User, Mail, Phone, Home, FileText, CreditCard } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';

const MemberSummary = () => {
  const [member, setMember] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [walletBalance, setWalletBalance] = useState<number>(0);
  const navigate = useNavigate();
  const [editOpen, setEditOpen] = useState(false);
  const [editData, setEditData] = useState<any>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const member_id = localStorage.getItem("member_member_id");
    if (!member_id) {
      navigate("/member/login");
      return;
    }
    supabase
      .from("members")
      .select("*")
      .eq("id", member_id)
      .single()
      .then(({ data }) => {
        setMember(data);
        setLoading(false);
      });
    // Fetch all transactions and calculate wallet balance
    supabase
      .from("transactions")
      .select("*")
      .eq("member_id", member_id)
      .then(({ data }) => {
        setTransactions(data || []);
        const balance = (data || []).reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
        setWalletBalance(balance);
      });
  }, [navigate]);


  const handleEdit = () => {
    setEditData({
      name: member.name,
      email_address: member.email_address,
      phone_number: member.phone_number,
      residence: member.residence,
      national_id_number: member.national_id_number || ''
    });
    setEditOpen(true);
  };

  const handleEditSave = async () => {
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('members')
        .update({
          name: editData.name,
          email_address: editData.email_address,
          phone_number: editData.phone_number,
          residence: editData.residence,
          national_id_number: editData.national_id_number
        })
        .eq('id', member.id);
      if (error) throw error;
      toast({ title: 'Profile updated', description: 'Your details have been updated.' });
      setEditOpen(false);
      // Add a short delay before refetching
      setTimeout(async () => {
        const { data } = await supabase.from('members').select('*').eq('id', member.id).single();
        console.log('Refetched member after update:', data);
        setMember(data);
      }, 500);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Update failed', description: err.message });
    } finally {
      setIsSaving(false);
    }
  };


  if (loading) return (
    <DashboardLayout
      customLinks={memberLinks}
      customLogout={() => memberLogout(navigate)}
    >
      <div className="space-y-6">
        <div>
          <Skeleton className="h-10 w-64 mb-2" />
          <Skeleton className="h-4 w-48" />
        </div>
        
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-32" />
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-3/4" />
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-48" />
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-full" />
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
  
  if (!member) return (
    <DashboardLayout
      customLinks={memberLinks}
      customLogout={() => memberLogout(navigate)}
    >
      <div className="flex flex-col items-center justify-center py-12 space-y-4">
        <div className="h-20 w-20 rounded-full bg-red-100 flex items-center justify-center">
          <User className="h-10 w-10 text-red-600" />
        </div>
        <p className="text-xl font-medium">Member not found</p>
        <p className="text-muted-foreground text-center max-w-md">
          We couldn't find your member information. Please contact an administrator if this problem persists.
        </p>
      </div>
    </DashboardLayout>
  );

  return (
    <DashboardLayout
      customLinks={memberLinks}
      customLogout={() => memberLogout(navigate)}
    >
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold mb-1">My Profile</h1>
          <p className="text-muted-foreground">View your personal information and account details</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="overflow-hidden">
            <CardHeader className="bg-primary/5 pb-2">
              <div className="flex justify-between items-center">
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5 text-primary" />
                  Personal Information
                </CardTitle>
                <Badge variant={member.is_active ? "outline" : "destructive"}>
                  {member.is_active ? "Active" : "Inactive"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="space-y-4">
                <div className="flex items-start gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground mt-1" />
                  <div>
                    <div className="text-sm text-muted-foreground">Member Number</div>
                    <div className="font-medium">{member.member_number}</div>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Mail className="h-4 w-4 text-muted-foreground mt-1" />
                  <div>
                    <div className="text-sm text-muted-foreground">Email</div>
                    <div className="font-medium">{member.email_address || "Not provided"}</div>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Phone className="h-4 w-4 text-muted-foreground mt-1" />
                  <div>
                    <div className="text-sm text-muted-foreground">Phone</div>
                    <div className="font-medium">{member.phone_number || "Not provided"}</div>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground mt-1" />
                  <div>
                    <div className="text-sm text-muted-foreground">National ID</div>
                    <div className="font-medium">{member.national_id_number || "Not provided"}</div>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Home className="h-4 w-4 text-muted-foreground mt-1" />
                  <div>
                    <div className="text-sm text-muted-foreground">Residence</div>
                    <div className="font-medium">{member.residence || "Not provided"}</div>
                  </div>
                </div>
              </div>
              <div className="flex gap-2 mt-4">
                <Button size="sm" variant="outline" onClick={handleEdit}>Edit Details</Button>
              </div>
            </CardContent>
          </Card>

          <Card className="overflow-hidden">
            <CardHeader className="bg-primary/5 pb-2">
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-primary" />
                Account Information
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="space-y-4">
                <div>
                  <div className="text-sm text-muted-foreground">Wallet Balance</div>
                  <div className="text-2xl font-bold text-green-600">
                    KES {walletBalance.toLocaleString()}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Join Date</div>
                  <div className="font-medium">
                    {member.created_at 
                      ? new Date(member.created_at).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric'
                        })
                      : "Unknown"
                    }
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
      {/* Edit Details Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Personal Details</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Full Name</label>
              <Input value={editData?.name || ''} onChange={e => setEditData({ ...editData, name: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Email</label>
              <Input value={editData?.email_address || ''} onChange={e => setEditData({ ...editData, email_address: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Phone</label>
              <Input value={editData?.phone_number || ''} onChange={e => setEditData({ ...editData, phone_number: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Residence</label>
              <Input value={editData?.residence || ''} onChange={e => setEditData({ ...editData, residence: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">National ID Number</label>
              <Input 
                value={editData?.national_id_number || ''} 
                onChange={e => setEditData({ ...editData, national_id_number: e.target.value })} 
                placeholder="Enter ID number"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={handleEditSave} disabled={isSaving}>{isSaving ? 'Saving...' : 'Save'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default MemberSummary;
