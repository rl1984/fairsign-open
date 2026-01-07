import { Switch, Route, useRoute } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Footer } from "@/components/footer";
import NotFound from "@/pages/not-found";
import LandingPage from "@/pages/landing-page";
import AdminDashboard from "@/pages/admin-dashboard";
import TemplatesPage from "@/pages/templates-page";
import SigningPage from "@/pages/signing-page";
import OneOffDocument from "@/pages/one-off-document";
import MobileSignature from "@/pages/mobile-signature";
import VerifyEmailPage from "@/pages/verify-email";
import ForgotPasswordPage from "@/pages/forgot-password";
import ResetPasswordPage from "@/pages/reset-password";
import StorageSettingsPage from "@/pages/storage-settings";
import TeamSettingsPage from "@/pages/team-settings";
import TeamInvitePage from "@/pages/team-invite";
import BillingPage from "@/pages/billing";
import BulkSendPage from "@/pages/bulk-send";
import TermsOfService from "@/pages/terms-of-service";
import PrivacyPolicy from "@/pages/privacy-policy";
import UserGuidePage from "@/pages/user-guide";

function Router() {
  return (
    <Switch>
      <Route path="/" component={LandingPage} />
      <Route path="/verify-email" component={VerifyEmailPage} />
      <Route path="/forgot-password" component={ForgotPasswordPage} />
      <Route path="/reset-password" component={ResetPasswordPage} />
      <Route path="/dashboard" component={AdminDashboard} />
      <Route path="/templates" component={TemplatesPage} />
      <Route path="/documents/new" component={OneOffDocument} />
      <Route path="/storage-settings" component={StorageSettingsPage} />
      <Route path="/team-settings" component={TeamSettingsPage} />
      <Route path="/team/invite" component={TeamInvitePage} />
      <Route path="/billing" component={BillingPage} />
      <Route path="/bulk-send" component={BulkSendPage} />
      <Route path="/terms" component={TermsOfService} />
      <Route path="/privacy" component={PrivacyPolicy} />
      <Route path="/guides/:slug?" component={UserGuidePage} />
      <Route path="/d/:id" component={SigningPage} />
      <Route path="/sign-mobile/:sessionToken" component={MobileSignature} />
      <Route component={NotFound} />
    </Switch>
  );
}

function AppLayout() {
  const [isLandingPage] = useRoute("/");
  const [isSigningPage] = useRoute("/d/:id");
  const [isMobileSignature] = useRoute("/sign-mobile/:sessionToken");
  
  const hideGlobalFooter = isLandingPage || isSigningPage || isMobileSignature;
  
  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex-1">
        <Router />
      </div>
      {!hideGlobalFooter && <Footer />}
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <AppLayout />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
