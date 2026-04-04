
import { useNavigate } from 'react-router-dom';
import { ArrowRight, CalendarClock, HandHeart, Landmark, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const Index = () => {
  const navigate = useNavigate();

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <div className="pointer-events-none absolute inset-0 opacity-60">
        <div className="absolute -top-24 -left-24 h-72 w-72 rounded-full bg-primary/20 blur-3xl" />
        <div className="absolute top-40 right-0 h-72 w-72 rounded-full bg-accent/20 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />
      </div>

      <div className="relative container mx-auto px-4 py-6 sm:py-8">
        <header className="flex items-center justify-between rounded-2xl border border-primary/15 bg-card/85 p-3 shadow-sm backdrop-blur-sm sm:p-4">
          <img
            src="/malanga-logo.png"
            alt="Malanga Welfare Connect"
            className="h-12 w-auto object-contain sm:h-14"
            loading="eager"
          />

          <div className="flex items-center gap-2 sm:gap-3">
            <Button variant="outline" className="border-primary/40" onClick={() => navigate('/member/login')}>
              Member Portal
            </Button>
            <Button onClick={() => navigate('/login')}>
              Admin Sign In
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </header>

        <main className="mt-10 space-y-10 sm:mt-14 sm:space-y-14">
          <section className="grid gap-8 lg:grid-cols-2 lg:items-center">
            <div className="space-y-6">
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-4 py-1.5 text-sm font-semibold text-primary">
                <ShieldCheck className="h-4 w-4" />
                Trusted Community Welfare Platform
              </div>

              <h1 className="text-balance text-4xl font-extrabold leading-tight text-foreground sm:text-5xl lg:text-6xl">
                Malanga Welfare Connect
              </h1>

              <p className="max-w-xl text-base text-muted-foreground sm:text-lg">
                Manage members, track contributions, and coordinate case support from one secure and transparent system built for welfare groups.
              </p>

              <div className="flex flex-wrap items-center gap-3">
                <Button size="lg" onClick={() => navigate('/login')}>
                  Launch Dashboard
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
                <Button size="lg" variant="outline" className="border-primary/40" onClick={() => navigate('/member/login')}>
                  Member Login
                </Button>
              </div>
            </div>

            <Card className="overflow-hidden border-primary/20 bg-card/90 shadow-xl">
              <CardContent className="p-0">
                <div className="bg-primary p-6 text-primary-foreground sm:p-8">
                  <p className="text-sm font-semibold uppercase tracking-wider opacity-90">Operations Snapshot</p>
                  <div className="mt-4 grid grid-cols-2 gap-4">
                    <div className="rounded-xl bg-white/15 p-4">
                      <p className="text-xs uppercase opacity-80">Member Care</p>
                      <p className="mt-1 text-2xl font-bold">24/7</p>
                    </div>
                    <div className="rounded-xl bg-white/15 p-4">
                      <p className="text-xs uppercase opacity-80">Digital Records</p>
                      <p className="mt-1 text-2xl font-bold">100%</p>
                    </div>
                  </div>
                </div>
                <div className="grid gap-4 p-5 sm:p-6">
                  <div className="rounded-xl border border-primary/15 bg-background p-4">
                    <p className="text-sm font-semibold text-foreground">Automated Finance Tracking</p>
                    <p className="mt-1 text-sm text-muted-foreground">M-PESA collections and account updates recorded in real time.</p>
                  </div>
                  <div className="rounded-xl border border-primary/15 bg-background p-4">
                    <p className="text-sm font-semibold text-foreground">Transparent Case Workflow</p>
                    <p className="mt-1 text-sm text-muted-foreground">Track requests from approval to support disbursement with confidence.</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </section>

          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="border-primary/20 bg-card/90">
              <CardHeader>
                <Landmark className="h-8 w-8 text-primary" />
                <CardTitle>Financial Oversight</CardTitle>
                <CardDescription>Maintain clear contributions, balances, and accountability.</CardDescription>
              </CardHeader>
            </Card>

            <Card className="border-primary/20 bg-card/90">
              <CardHeader>
                <HandHeart className="h-8 w-8 text-primary" />
                <CardTitle>Member Support</CardTitle>
                <CardDescription>Keep member records, kin details, and support history organized.</CardDescription>
              </CardHeader>
            </Card>

            <Card className="border-primary/20 bg-card/90">
              <CardHeader>
                <CalendarClock className="h-8 w-8 text-primary" />
                <CardTitle>Case Coordination</CardTitle>
                <CardDescription>Manage deadlines, contributions, and progress with less manual work.</CardDescription>
              </CardHeader>
            </Card>

            <Card className="border-primary/20 bg-card/90">
              <CardHeader>
                <ShieldCheck className="h-8 w-8 text-primary" />
                <CardTitle>Role-Based Access</CardTitle>
                <CardDescription>Support admins and members with secure, dedicated login flows.</CardDescription>
              </CardHeader>
            </Card>
          </section>
        </main>

        <footer className="mt-12 border-t border-primary/20 py-8 text-center text-sm text-muted-foreground">
          © {new Date().getFullYear()} Malanga Community Welfare Group. All rights reserved.<br /> | Powered by <a href="https://mobiwave.co.ke" target="_blank" rel="noopener noreferrer">MOBIWAVE INNOVATIONS LTD.</a>
        </footer>
      </div>
    </div>
  );
};

export default Index;
