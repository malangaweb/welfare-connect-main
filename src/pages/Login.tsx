import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { Loader2 } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import bcryptjs from 'bcryptjs';
import { supabase } from '@/integrations/supabase/client';
import { UserRole } from '@/lib/types';

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

// Define explicit type for audit log insert
interface AuditLogInsert {
  action: string;
  table_name: string;
  record_id: string;
  status: string;
  timestamp: string;
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
  const [isLoading, setIsLoading] = useState(false);

  // Check if user is already logged in (only on mount)
  useEffect(() => {
    const checkSession = async () => {
      // Check Supabase session first
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        navigate('/dashboard', { replace: true });
        return;
      }
      
      // Fallback to token check
      const token = localStorage.getItem('token');
      const currentUser = localStorage.getItem('currentUser');
      if (token && currentUser) {
        navigate('/dashboard', { replace: true });
      }
    };
    
    checkSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    setIsLoading(true);
    
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
      setIsLoading(false);
      navigate("/dashboard", { replace: true });
      
    } catch (error: any) {
      console.error('Login error:', error);
      toast({
        variant: "destructive",
        title: "Login failed",
        description: error.message || "Invalid credentials. Please try again.",
      });
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-md p-8 space-y-8 bg-card rounded-lg shadow-lg border">
        <div className="text-center">
          <h1 className="text-2xl font-bold tracking-tight">Welfare Society System</h1>
          <p className="text-muted-foreground mt-2">Login to your account</p>
        </div>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="username"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Username</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder="Enter your username" 
                      {...field} 
                      disabled={isLoading}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Password</FormLabel>
                  <FormControl>
                    <Input 
                      type="password" 
                      placeholder="Enter your password" 
                      {...field} 
                      disabled={isLoading}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Logging in...
                </>
              ) : (
                'Login'
              )}
            </Button>
            
            <div className="text-center mt-4 text-sm">
              <p className="text-muted-foreground">
                Are you a member?{' '}
                <a 
                  href="/member/login" 
                  className="text-primary hover:underline font-medium"
                >
                  Member Login
                </a>
              </p>
            </div>
          </form>
        </Form>
        
     
      </div>
    </div>
  );
};

export default Login;
