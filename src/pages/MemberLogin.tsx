import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/use-toast";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Loader2, User, Lock } from "lucide-react";

const MemberLogin = () => {
  const [memberId, setMemberId] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    // 1. Find the user by memberId (username)
    const { data: user, error: userError } = await supabase
      .from("users")
      .select("id, member_id, is_active")
      .eq("username", memberId)
      .eq("role", "member")
      .maybeSingle();

    if (userError || !user) {
      setLoading(false);
      toast({ variant: "destructive", title: "Login failed", description: "Invalid Member ID or password." });
      return;
    }
    if (!user.is_active) {
      setLoading(false);
      toast({ variant: "destructive", title: "Account inactive", description: "Your account is not active." });
      return;
    }

    // 2. Check password in user_credentials
    const { data: cred, error: credError } = await supabase
      .from("user_credentials")
      .select("password")
      .eq("user_id", user.id)
      .maybeSingle();

    if (credError || !cred) {
      setLoading(false);
      toast({ variant: "destructive", title: "Login failed", description: "Invalid Member ID or password." });
      return;
    }

    // NOTE: In production, passwords should be hashed and compared securely!
    if (cred.password !== password) {
      setLoading(false);
      toast({ variant: "destructive", title: "Login failed", description: "Invalid Member ID or password." });
      return;
    }

    // 3. Store session info (for example, in localStorage)
    localStorage.setItem("member_user_id", user.id);
    localStorage.setItem("member_member_id", user.member_id);

    setLoading(false);
    navigate("/member/dashboard");
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
              <label className="block text-sm font-medium mb-1" htmlFor="memberId">
                Member ID
              </label>
              <div className="relative">
                <User className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="memberId"
                  type="text"
                  placeholder="e.g. M001"
                  className="pl-10"
                  value={memberId}
                  onChange={e => setMemberId(e.target.value)}
                  required
                  autoFocus
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1" htmlFor="password">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="password"
                  type="password"
                  placeholder="Your password"
                  className="pl-10"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                />
              </div>
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

            <div className="mt-6 text-center">
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
