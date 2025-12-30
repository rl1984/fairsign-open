import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import LandingPage from "@/pages/landing-page";
import AdminDashboard from "@/pages/admin-dashboard";
import TemplatesPage from "@/pages/templates-page";
import BulkImportPage from "@/pages/bulk-import";
import SigningPage from "@/pages/signing-page";
import OneOffDocument from "@/pages/one-off-document";
import MobileSignature from "@/pages/mobile-signature";
import VerifyEmailPage from "@/pages/verify-email";

function Router() {
  return (
    <Switch>
      <Route path="/" component={LandingPage} />
      <Route path="/verify-email" component={VerifyEmailPage} />
      <Route path="/dashboard" component={AdminDashboard} />
      <Route path="/templates" component={TemplatesPage} />
      <Route path="/bulk-import" component={BulkImportPage} />
      <Route path="/documents/new" component={OneOffDocument} />
      <Route path="/d/:id" component={SigningPage} />
      <Route path="/sign-mobile/:sessionToken" component={MobileSignature} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
