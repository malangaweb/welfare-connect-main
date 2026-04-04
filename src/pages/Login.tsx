import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { z } from 'zod';
import { ArrowRight, Loader2, ShieldCheck } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import bcryptjs from 'bcryptjs';
import { supabase } from '@/integrations/supabase/client';

// Define explicit types for the user row
interface UserRow {
  id: string;
  username: string;
  name: string;
  email: string | null;
  password: string;
  role: string;
  member_id: string | null;
  is_active: boolean;
}

import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/use-toast';

// Define form validation schema
const loginSchema = z.object({
  username: z.string().min(4, 'Username must be at least 4 characters'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

// Infer the type from the schema
type LoginFormValues = z.infer<typeof loginSchema>;

const Login = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [adminLoading, setAdminLoading] = useState(false);
  const [memberLoading, setMemberLoading] = useState(false);
  const [memberNumber, setMemberNumber] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [loginMode, setLoginMode] = useState<'admin' | 'member'>(
    searchParams.get('role') === 'member' ? 'member' : 'admin'
  );

  // Check if user is already logged in (only on mount)
  useEffect(() => {
    const roleFromUrl = searchParams.get('role') === 'member' ? 'member' : 'admin';
    setLoginMode(roleFromUrl);
  }, [searchParams]);

  useEffect(() => {
    const checkSession = async () => {
      const memberId = localStorage.getItem('member_member_id');
      const token = localStorage.getItem('token');
      const currentUser = localStorage.getItem('currentUser');

      if (loginMode === 'member') {
        if (memberId) {
          navigate('/member/dashboard', { replace: true });
          return;
        }
      } else {
        if (token && currentUser) {
          navigate('/dashboard', { replace: true });
          return;
        }
      }

      // Check Supabase session first
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        navigate('/dashboard', { replace: true });
        return;
      }
    };

    checkSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loginMode]);

  // Initialize form with react-hook-form
  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      username: '',
      password: '',
    },
  });

  // Handle form submission
  const onSubmit = async (values: LoginFormValues) => {
    setAdminLoading(true);
    
    try {
      // Database-backed admin login (admins are members linked via users.member_id)
      const result = await supabase
        .from('users')
        .select('id, username, name, email, password, role, member_id, is_active')
        .eq('username', values.username)
        .maybeSingle() as unknown as { data: UserRow | null; error: Error | null };
      
      const userRow = result?.data;
      const userError = result?.error;

      if (userError) throw userError;
      if (!userRow) {
        throw new Error('Invalid credentials. Please try again.');
      }

      if (!userRow.is_active) {
        throw new Error('Account is inactive. Please contact support.');
      }

      // Verify password - support both bcrypt hashes ($2a/$2b) and plain-text (legacy)
      const storedPassword = userRow.password || '';
      let isValidPassword = false;

      if (storedPassword.startsWith('$2')) {
        // Bcrypt hash — use bcryptjs.compare
        isValidPassword = await bcryptjs.compare(values.password, storedPassword);
      } else {
        // Plain-text (legacy, before hashing was in place) — direct comparison
        isValidPassword = values.password === storedPassword;
      }
      
      if (!isValidPassword) {
        // Log failed login attempt to audit trail
        const auditResult = await supabase.from('audit_logs').insert({
          action: 'LOGIN_FAILED',
          table_name: 'users',
          record_id: userRow.id,
          status: 'failed',
          timestamp: new Date().toISOString()
        } as any);
        if (auditResult.error) {
          console.error('Audit log error:', auditResult.error);
        }
        
        throw new Error('Invalid credentials. Please try again.');
      }

      // Enforce that only admin roles can log in through this page
      const role = (userRow.role || '').toLowerCase();
      const isAdminRole = role === 'super_admin' || 
                         role === 'chairperson' || 
                         role === 'treasurer' || 
                         role === 'secretary';
      if (!isAdminRole) {
        throw new Error('This account does not have admin access. Please use the Member Login page.');
      }

      // Set token for our app
      localStorage.setItem('token', 'authenticated');

      localStorage.setItem(
        'currentUser',
        JSON.stringify({
          id: userRow.id,
          username: userRow.username,
          name: userRow.name,
          email: userRow.email || undefined,
          role: userRow.role,
          memberId: userRow.member_id,
          isActive: userRow.is_active,
        })
      );
      
      // Toast notification for successful login
      toast({
        title: "Login successful",
        description: `Welcome, ${userRow.name}!`,
      });
      
      // Navigate immediately
      setAdminLoading(false);
      navigate("/dashboard", { replace: true });
      
    } catch (error: any) {
      console.error('Login error:', error);
      toast({
        variant: "destructive",
        title: "Login failed",
        description: error.message || "Invalid credentials. Please try again.",
      });
      setAdminLoading(false);
    }
  };

  const onMemberSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMemberLoading(true);

    try {
      const { data: member, error: memberError } = await (supabase as any)
        .from('members')
        .select('id, member_number, name, is_active, phone_number')
        .eq('member_number', memberNumber)
        .maybeSingle();

      if (memberError || !member) {
        toast({
          variant: 'destructive',
          title: 'Login failed',
          description: 'Invalid Member Number. Please try again.'
        });
        return;
      }

      if (!member.is_active) {
        toast({
          variant: 'destructive',
          title: 'Account inactive',
          description: 'Your account is not active. Please contact support.'
        });
        return;
      }

      const cleanEnteredPhone = phoneNumber.replace(/[\s\-\(\)]/g, '');
      const cleanStoredPhone = (member.phone_number || '').replace(/[\s\-\(\)]/g, '');

      if (cleanEnteredPhone !== cleanStoredPhone || cleanStoredPhone === '') {
        toast({
          variant: 'destructive',
          title: 'Login failed',
          description: 'Invalid phone number. Please try again.'
        });
        return;
      }

      await (supabase as any).from('audit_logs').insert({
        action: 'LOGIN',
        table_name: 'members',
        record_id: member.id,
        status: 'success'
      });

      localStorage.setItem('member_member_id', member.id);
      localStorage.setItem('member_name', member.name);
      localStorage.setItem('member_phone_number', member.phone_number || '');
      localStorage.setItem('member_login_time', new Date().toISOString());

      toast({
        title: 'Login successful',
        description: `Welcome back, ${member.name}!`,
      });

      navigate('/member/dashboard', { replace: true });
    } catch (error) {
      console.error('Member login error:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'An unexpected error occurred. Please try again.',
      });
    } finally {
      setMemberLoading(false);
    }
  };

  const switchMode = (mode: 'admin' | 'member') => {
    setLoginMode(mode);
    const next = new URLSearchParams(searchParams);
    if (mode === 'member') {
      next.set('role', 'member');
    } else {
      next.delete('role');
    }
    setSearchParams(next, { replace: true });
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-background px-3 py-6 sm:px-4 sm:py-8">
      <div className="pointer-events-none absolute inset-0 opacity-70">
        <div className="absolute -top-16 left-8 h-56 w-56 rounded-full bg-primary/20 blur-3xl" />
        <div className="absolute right-0 top-1/3 h-64 w-64 rounded-full bg-accent/20 blur-3xl" />
      </div>

      <div className="relative mx-auto grid w-full max-w-5xl overflow-hidden rounded-3xl border border-primary/20 bg-card shadow-2xl md:grid-cols-5">
        <aside className="bg-primary p-6 text-primary-foreground md:col-span-2 md:p-8">
          <img
            src="/malanga-logo.png"
            alt="Malanga Welfare Connect"
            className="h-20 w-auto rounded-xl bg-white/85 p-2 object-contain"
            loading="eager"
          />

          <div className="mt-6 space-y-3">
            <p className="inline-flex items-center gap-2 rounded-full border border-white/40 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide">
              <ShieldCheck className="h-3.5 w-3.5" />
              {loginMode === 'admin' ? 'Admin Access' : 'Member Access'}
            </p>
            <h1 className="text-3xl font-extrabold leading-tight">
              Welcome back
            </h1>
            <p className="text-sm text-primary-foreground/90">
              {loginMode === 'admin'
                ? 'Manage members, monitor contributions, and coordinate support with confidence.'
                : 'Access your account to view your profile, cases, contributions, and reports.'}
            </p>
          </div>

          <div className="mt-8 hidden space-y-3 text-sm md:block">
            <div className="rounded-xl border border-white/30 bg-white/10 p-3">
              Live account and transaction visibility.
            </div>
            <div className="rounded-xl border border-white/30 bg-white/10 p-3">
              Secure role-based workflows for leadership teams.
            </div>
          </div>
        </aside>

        <section className="p-5 sm:p-6 md:col-span-3 md:p-10">
          <div className="mb-6 flex items-center justify-between gap-3">
            <h2 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">Sign in to dashboard</h2>
            <Button variant="ghost" className="text-primary" onClick={() => navigate('/')}>
              Back Home
            </Button>
          </div>

          <div className="mb-6 grid grid-cols-2 rounded-xl border border-primary/20 bg-muted/60 p-1">
            <Button
              type="button"
              variant={loginMode === 'admin' ? 'default' : 'ghost'}
              className="h-9"
              onClick={() => switchMode('admin')}
            >
              Admin
            </Button>
            <Button
              type="button"
              variant={loginMode === 'member' ? 'default' : 'ghost'}
              className="h-9"
              onClick={() => switchMode('member')}
            >
              Member
            </Button>
          </div>

          {loginMode === 'admin' ? (
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
                <FormField
                  control={form.control}
                  name="username"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-medium">Username</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Enter your username"
                          {...field}
                          disabled={adminLoading}
                          className="h-11 border-primary/20 bg-background text-sm"
                          style={{ fontSize: '16px' }}
                        />
                      </FormControl>
                      <FormMessage className="text-xs" />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-medium">Password</FormLabel>
                      <FormControl>
                        <Input
                          type="password"
                          placeholder="Enter your password"
                          {...field}
                          disabled={adminLoading}
                          className="h-11 border-primary/20 bg-background text-sm"
                          style={{ fontSize: '16px' }}
                        />
                      </FormControl>
                      <FormMessage className="text-xs" />
                    </FormItem>
                  )}
                />

                <Button type="submit" className="h-11 w-full text-sm font-semibold sm:text-base" disabled={adminLoading}>
                  {adminLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Logging in...
                    </>
                  ) : (
                    <>
                      Login
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </>
                  )}
                </Button>
              </form>
            </Form>
          ) : (
            <form onSubmit={onMemberSubmit} className="space-y-5">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Member Number</label>
                <Input
                  type="text"
                  placeholder="e.g. 1"
                  value={memberNumber}
                  onChange={(e) => setMemberNumber(e.target.value)}
                  disabled={memberLoading}
                  required
                  className="h-11 border-primary/20 bg-background text-sm"
                  style={{ fontSize: '16px' }}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Phone Number</label>
                <Input
                  type="tel"
                  placeholder="e.g. 0712345678"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  disabled={memberLoading}
                  required
                  className="h-11 border-primary/20 bg-background text-sm"
                  style={{ fontSize: '16px' }}
                />
                <p className="text-xs text-muted-foreground">Use the number registered on your account.</p>
              </div>

              <Button type="submit" className="h-11 w-full text-sm font-semibold sm:text-base" disabled={memberLoading}>
                {memberLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Logging in...
                  </>
                ) : (
                  <>
                    Login
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </>
                )}
              </Button>
            </form>
          )}
        </section>
      </div>
    </div>
  );
};

export default Login;
