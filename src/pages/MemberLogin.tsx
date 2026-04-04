import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/use-toast";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Loader2, User, Phone } from "lucide-react";

const MemberLogin = () => {
  const [memberNumber, setMemberNumber] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // 1. Find the member by member_number
      const { data: member, error: memberError } = await (supabase as any)
        .from("members")
        .select("id, member_number, name, is_active, phone_number")
        .eq("member_number", memberNumber)
        .maybeSingle();

      if (memberError || !member) {
        console.error('Member lookup error:', memberError);
        toast({
          variant: "destructive",
          title: "Login failed",
          description: "Invalid Member Number. Please try again."
        });
        return;
      }

      if (!member.is_active) {
        toast({
          variant: "destructive",
          title: "Account inactive",
          description: "Your account is not active. Please contact support."
        });
        return;
      }

      // 2. Verify phone number (clean both inputs for comparison)
      const cleanEnteredPhone = phoneNumber.replace(/[\s\-\(\)]/g, '');
      const cleanStoredPhone = (member.phone_number || '').replace(/[\s\-\(\)]/g, '');

      if (cleanEnteredPhone !== cleanStoredPhone || cleanStoredPhone === '') {
        toast({
          variant: "destructive",
          title: "Login failed",
          description: "Invalid phone number. Please try again."
        });
        return;
      }

      // 3. Log successful login to audit trail
      await (supabase as any)
        .from('audit_logs')
        .insert({
          action: 'LOGIN',
          table_name: 'members',
          record_id: member.id,
          status: 'success'
        });

      // 4. Store member info in localStorage
      localStorage.setItem("member_member_id", member.id);
      localStorage.setItem("member_name", member.name);
      localStorage.setItem("member_phone_number", member.phone_number || '');
      localStorage.setItem("member_login_time", new Date().toISOString());

      toast({
        title: "Login successful",
        description: `Welcome back, ${member.name}!`,
      });

      navigate("/member/dashboard");
    } catch (error) {
      console.error('Login error:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "An unexpected error occurred. Please try again.",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-blue-100">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="text-center">
          <User className="mx-auto h-10 w-10 text-blue-600 mb-2" />
          <CardTitle className="text-2xl font-bold">Member Login</CardTitle>
          <CardDescription>Access your member dashboard with your phone number</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-6">
            <div>
              <label className="block text-sm font-medium mb-1" htmlFor="memberNumber">
                Member Number
              </label>
              <div className="relative">
                <User className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="memberNumber"
                  type="text"
                  placeholder="e.g. 1"
                  className="pl-10"
                  value={memberNumber}
                  onChange={e => setMemberNumber(e.target.value)}
                  required
                  autoFocus
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1" htmlFor="phoneNumber">
                Phone Number
              </label>
              <div className="relative">
                <Phone className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="phoneNumber"
                  type="tel"
                  placeholder="e.g. 0712345678"
                  className="pl-10"
                  value={phoneNumber}
                  onChange={e => setPhoneNumber(e.target.value)}
                  required
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Enter the phone number registered with your account
              </p>
            </div>
            <Button
              type="submit"
              className="w-full"
              disabled={loading}
              size="lg"
            >
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {loading ? "Logging in..." : "Login"}
            </Button>

            <div className="text-center">
              <span className="text-sm text-muted-foreground">Are you an admin? </span>
              <Link
                to="/admin/login"
                className="text-blue-600 hover:underline font-medium"
              >
                Admin Login
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default MemberLogin;
