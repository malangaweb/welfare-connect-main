import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Members from "./pages/Members";
import MemberDetails from "./pages/MemberDetails";
import NewMember from "./pages/NewMember";
import Cases from "./pages/Cases";
import CaseDetails from "./pages/CaseDetails";
import NewCase from "./pages/NewCase";
import Reports from "./pages/Reports";
import Transactions from "./pages/Transactions";
import Accounts from "./pages/Accounts";
import Settings from "./pages/Settings";
import Users from "./pages/Users";
import NotFound from "./pages/NotFound";
import ProtectedRoute from "@/components/ProtectedRoute";
import MemberLogin from "./pages/MemberLogin";
import MemberDashboard from "./pages/members/MemberDashboard";
import MemberProtectedRoute from "@/components/MemberProtectedRoute";
import MemberSummary from "./pages/members/MemberSummary";
import MemberCases from "./pages/members/MemberCases";
import MemberTransactions from "./pages/members/MemberTransactions";
import MemberReport from "./pages/members/MemberReport";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
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
            path="/users"
            element={
              <ProtectedRoute>
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
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
