import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { Loader2 } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { supabase } from '@/integrations/supabase/client';

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

  // Check if user is already logged in
  useEffect(() => {
    const checkSession = async () => {
      // Check Supabase session first
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        navigate('/dashboard');
        return;
      }
      
      // Fallback to token check
      const token = localStorage.getItem('token');
      if (token) {
        navigate('/dashboard');
      }
    };
    
    checkSession();
  }, [navigate]);

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
      console.log('Login attempt:', values.username);
      
      // For demo credentials: maintain a list of demo users
      const demoUsers: Array<{ username: string; password: string; email: string }> = [
        { username: 'admin', password: 'password', email: 'admin@example.com' },
        { username: 'nguma', password: 'Ngum@2030', email: 'ngumanyiro@gmail.com' },
        { username: 'kitti', password: 'Kitti@2025', email: 'kitti@gmail.com' },

        // Add more demo users here as needed
      ];

      const matchedDemo = demoUsers.find(
        (u) => u.username === values.username && u.password === values.password
      );

      if (matchedDemo) {
        // Special handling for demo users
        // First try to sign in with Supabase (if configured)
        try {
          const { error } = await supabase.auth.signInWithPassword({
            email: matchedDemo.email,
            password: values.password,
          });

          if (!error) {
            // Set token for our app
            localStorage.setItem('token', `demo-${matchedDemo.username}-token`);

            // Add small delay to allow state to update
            setTimeout(() => {
              navigate("/dashboard");
            }, 100);

            return;
          }
        } catch (authError) {
          console.warn('Supabase auth failed, using fallback:', authError);
        }

        // Fallback for demo if Supabase auth fails
        localStorage.setItem('token', `demo-${matchedDemo.username}-token`);

        // Toast notification for successful login
        toast({
          title: "Login successful",
          description: `Welcome, ${matchedDemo.username}!`,
        });

        // Add small delay to allow state to update
        setTimeout(() => {
          navigate("/dashboard");
        }, 100);

        return;
      }
      
      // Regular Supabase login for non-demo users
      const { error } = await supabase.auth.signInWithPassword({ 
        email: values.username, 
        password: values.password 
      });
      
      if (error) {
        throw error;
      }
      
      // Set token for our app
      localStorage.setItem('token', 'authenticated');
      
      // Toast notification for successful login
      toast({
        title: "Login successful",
        description: "Welcome to the admin dashboard!",
      });
      
      // Add small delay to allow state to update
      setTimeout(() => {
        navigate("/dashboard");
      }, 100);
      
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
          </form>
        </Form>
        
     
      </div>
    </div>
  );
};

export default Login;
