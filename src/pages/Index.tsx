
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Users, Calendar, FileText, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const Index = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 to-primary/10">
      <div className="container mx-auto px-4 py-8">
        <header className="flex items-center justify-between py-6">
          <div className="flex items-center space-x-3">
            <div className="bg-primary/90 text-white rounded-lg p-1.5">
              <FileText className="w-6 h-6" />
            </div>
            <h1 className="text-xl font-bold">MCWG</h1>
          </div>
          <Button onClick={() => navigate('/login')}>
            Sign In
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </header>

        <main className="mt-16 mb-20">
          <div className="max-w-3xl mx-auto text-center">
            <div className="inline-block px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-medium mb-6">
              Welfare Management
            </div>
            <h1 className="text-5xl font-bold mb-6 leading-tight animate-fade-in">
              Malanga Community Welfare Group
            </h1>
            <p className="text-xl text-muted-foreground mb-10 animate-slide-up">
              A comprehensive platform for managing welfare operations, community members, and cases.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center animate-slide-up">
              <Button size="lg" onClick={() => navigate('/login')}>
                Get Started
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
              <Button size="lg" variant="outline" onClick={() => navigate('/login')}>
                Learn More
              </Button>
            </div>
          </div>

          <div className="mt-24 grid gap-8 md:grid-cols-2 lg:grid-cols-3">
            <Card className="hover-lift animate-fade-in">
              <CardHeader>
                <Users className="h-10 w-10 text-primary mb-4" />
                <CardTitle>Member Management</CardTitle>
                <CardDescription>
                  Register and manage community members and their dependants with comprehensive profiles.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="hover-lift animate-fade-in [animation-delay:100ms]">
              <CardHeader>
                <Calendar className="h-10 w-10 text-primary mb-4" />
                <CardTitle>Case Tracking</CardTitle>
                <CardDescription>
                  Create and track welfare cases, manage contributions, and handle disbursements.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="hover-lift animate-fade-in [animation-delay:200ms]">
              <CardHeader>
                <Zap className="h-10 w-10 text-primary mb-4" />
                <CardTitle>Automated Transactions</CardTitle>
                <CardDescription>
                  Capture M-PESA payments automatically and update member contributions in real-time.
                </CardDescription>
              </CardHeader>
            </Card>
          </div>

          <div className="mt-24 bg-white rounded-2xl shadow-lg overflow-hidden animate-fade-in">
            <div className="p-8 md:p-12">
              <h2 className="text-3xl font-bold mb-6">Start managing your community welfare today</h2>
              <p className="text-lg text-muted-foreground mb-8">
                Our platform simplifies the management of community welfare operations, providing tools to track contributions, manage cases, and support members effectively.
              </p>
              <Button size="lg" onClick={() => navigate('/login')}>
                Sign In
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        </main>

        <footer className="mt-12 py-12 border-t">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <div className="flex items-center space-x-3 mb-4 md:mb-0">
              <div className="bg-primary/90 text-white rounded-lg p-1.5">
                <FileText className="w-5 h-5" />
              </div>
              <h2 className="text-lg font-semibold">MCWG</h2>
            </div>
            <p className="text-sm text-muted-foreground">
              © {new Date().getFullYear()} Malanga Community Welfare Group. All rights reserved.
            </p>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default Index;
