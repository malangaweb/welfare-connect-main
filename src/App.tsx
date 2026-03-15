import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import ErrorBoundary from "@/components/ErrorBoundary";
import ProtectedRoute from "@/components/ProtectedRoute";
import MemberProtectedRoute from "@/components/MemberProtectedRoute";
import { UserRole } from "@/lib/types";
import { Skeleton } from "@/components/ui/skeleton";

// Lazy-load all pages for route-level code splitting.
// Each page only downloads when the user navigates to it.
const Login = lazy(() => import("./pages/Login"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Members = lazy(() => import("./pages/Members"));
const MemberDetails = lazy(() => import("./pages/MemberDetails"));
const NewMember = lazy(() => import("./pages/NewMember"));
const Cases = lazy(() => import("./pages/Cases"));
const CaseDetails = lazy(() => import("./pages/CaseDetails"));
const NewCase = lazy(() => import("./pages/NewCase"));
const Reports = lazy(() => import("./pages/Reports"));
const FiscalReports = lazy(() => import("./pages/FiscalReports"));
const ComplianceReports = lazy(() => import("./pages/ComplianceReports"));
const Transactions = lazy(() => import("./pages/Transactions"));
const Accounts = lazy(() => import("./pages/Accounts"));
const Settings = lazy(() => import("./pages/Settings"));
const Users = lazy(() => import("./pages/Users"));
const SuspenseAccount = lazy(() => import("./pages/SuspenseAccount"));
const NotFound = lazy(() => import("./pages/NotFound"));
const MemberLogin = lazy(() => import("./pages/MemberLogin"));
const MemberDashboard = lazy(() => import("./pages/members/MemberDashboard"));
const MemberSummary = lazy(() => import("./pages/members/MemberSummary"));
const MemberCases = lazy(() => import("./pages/members/MemberCases"));
const MemberTransactions = lazy(() => import("./pages/members/MemberTransactions"));
const MemberReport = lazy(() => import("./pages/members/MemberReport"));

const PageLoader = () => (
  <div className="flex items-center justify-center min-h-screen bg-background">
    <div className="space-y-4 w-64">
      <Skeleton className="h-8 w-full rounded-lg" />
      <Skeleton className="h-4 w-3/4 rounded" />
      <Skeleton className="h-4 w-1/2 rounded" />
    </div>
  </div>
);

const App = () => (
  <ErrorBoundary>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <Suspense fallback={<PageLoader />}>
          <Routes>
          <Route path="/" element={<MemberLogin />} />
          <Route path="/login" element={<Login />} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/members"
            element={
              <ProtectedRoute>
                <Members />
              </ProtectedRoute>
            }
          />
          <Route
            path="/members/:id"
            element={
              <ProtectedRoute>
                <MemberDetails />
              </ProtectedRoute>
            }
          />
          <Route
            path="/members/new"
            element={
              <ProtectedRoute>
                <NewMember />
              </ProtectedRoute>
            }
          />
          <Route
            path="/cases"
            element={
              <ProtectedRoute>
                <Cases />
              </ProtectedRoute>
            }
          />
          <Route
            path="/cases/:id"
            element={
              <ProtectedRoute>
                <CaseDetails />
              </ProtectedRoute>
            }
          />
          <Route
            path="/cases/new"
            element={
              <ProtectedRoute>
                <NewCase />
              </ProtectedRoute>
            }
          />
          <Route
            path="/transactions"
            element={
              <ProtectedRoute>
                <Transactions />
              </ProtectedRoute>
            }
          />
          <Route
            path="/accounts"
            element={
              <ProtectedRoute>
                <Accounts />
              </ProtectedRoute>
            }
          />
          <Route
            path="/reports"
            element={
              <ProtectedRoute>
                <Reports />
              </ProtectedRoute>
            }
          />
          <Route
            path="/reports/fiscal"
            element={
              <ProtectedRoute>
                <FiscalReports />
              </ProtectedRoute>
            }
          />
          <Route
            path="/reports/compliance"
            element={
              <ProtectedRoute>
                <ComplianceReports />
              </ProtectedRoute>
            }
          />
          <Route
            path="/users"
            element={
              <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN]}>
                <Users />
              </ProtectedRoute>
            }
          />
          <Route
            path="/settings"
            element={
              <ProtectedRoute>
                <Settings />
              </ProtectedRoute>
            }
          />
          <Route
            path="/suspense"
            element={
              <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN, UserRole.CHAIRPERSON, UserRole.TREASURER]}>
                <SuspenseAccount />
              </ProtectedRoute>
            }
          />
          <Route path="/member/login" element={<MemberLogin />} />
          <Route
            path="/member/dashboard"
            element={
              <MemberProtectedRoute>
                <MemberDashboard />
              </MemberProtectedRoute>
            }
          />
          <Route
            path="/member/summary"
            element={
              <MemberProtectedRoute>
                <MemberSummary />
              </MemberProtectedRoute>
            }
          />
          <Route
            path="/member/cases"
            element={
              <MemberProtectedRoute>
                <MemberCases />
              </MemberProtectedRoute>
            }
          />
          <Route
            path="/member/transactions"
            element={
              <MemberProtectedRoute>
                <MemberTransactions />
              </MemberProtectedRoute>
            }
          />
          <Route
            path="/member/report"
            element={
              <MemberProtectedRoute>
                <MemberReport />
              </MemberProtectedRoute>
            }
          />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </Suspense>
      </TooltipProvider>
    </AuthProvider>
  </ErrorBoundary>
);

export default App;
