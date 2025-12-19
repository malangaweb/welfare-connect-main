import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/use-toast";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Loader2, User, Lock } from "lucide-react";

const MemberLogin = () => {
  const [memberNumber, setMemberNumber] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      console.log('Login attempt for member:', memberNumber);

      // 1. Find the member by member_number and verify phone number
      const { data: member, error: memberError } = await supabase
        .from("members")
        .select("id, member_number, name, is_active, phone_number")
        .eq("member_number", memberNumber)
        .single();

      console.log('Member lookup result:', { member, memberError });

      if (memberError || !member) {
        console.error('Member lookup error:', memberError);
        toast({ 
          variant: "destructive", 
          title: "Login failed", 
          description: "Invalid Member Number or phone number." 
        });
        return;
      }

      if (!member.is_active) {
        console.log('Member account inactive:', memberNumber);
        toast({ 
          variant: "destructive", 
          title: "Account inactive", 
          description: "Your account is not active. Please contact support." 
        });
        return;
      }

      // 2. Verify the phone number (password) matches
      // Remove any non-digit characters from the input and stored phone number for comparison
      const cleanInputPhone = password.replace(/\D/g, '');
      const cleanStoredPhone = member.phone_number.replace(/\D/g, '');
      
      if (cleanInputPhone !== cleanStoredPhone) {
        console.log('Phone number does not match for member:', memberNumber);
        toast({ 
          variant: "destructive", 
          title: "Login failed", 
          description: "Invalid Member Number or phone number." 
        });
        return;
      }

      // 4. Store member info in localStorage
      localStorage.setItem("member_member_id", member.id);
      localStorage.setItem("member_name", member.name);

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
          <CardDescription>Access your member dashboard</CardDescription>
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
              <label className="block text-sm font-medium mb-1" htmlFor="password">
                Phone Number
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="password"
                  type="tel"
                  placeholder="Your registered phone number"
                  className="pl-10"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Enter the phone number associated with your account
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
