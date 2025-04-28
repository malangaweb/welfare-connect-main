import { useEffect, useState } from "react";
import DashboardLayout from "@/layouts/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { memberLinks, memberLogout } from "./memberLinks";
import { Badge } from "@/components/ui/badge";
import { User, Mail, Phone, Home, FileText, CreditCard, Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

const MemberSummary = () => {
  const [member, setMember] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

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
  }, [navigate]);

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
                    KES {member.wallet_balance?.toLocaleString() || "0"}
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
    </DashboardLayout>
  );
};

export default MemberSummary;
