import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { FileText, LogIn, Loader2, ArrowLeft, Shield, Check, FileSignature, Users, Eye, Lock, Globe, UserPlus, Mail, Code, ChevronDown, HelpCircle } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import heroBackground from "../assets/hero-background.png";

type AuthMode = "none" | "login" | "signup" | "verification-sent";
type LoginStep = "email" | "password" | "2fa";

const SSO_ERROR_MESSAGES: Record<string, { title: string; description: string }> = {
  sso_tier_required: {
    title: "Enterprise Plan Required",
    description: "Single Sign-On is only available for Enterprise and Organisation plans. Please upgrade your account to use this feature.",
  },
  sso_signup_disabled: {
    title: "Sign Up Required",
    description: "Please create an account with email first, then upgrade to Enterprise or Organisation to enable Single Sign-On.",
  },
  "2fa_required": {
    title: "Password Login Required",
    description: "Please log in with your password first to link your SSO account (2FA is enabled).",
  },
  account_suspended: {
    title: "Account Suspended",
    description: "Your account has been suspended. Please contact support for assistance.",
  },
  no_email: {
    title: "Email Required",
    description: "The identity provider did not provide an email address. Please try again or use email login.",
  },
  no_microsoft_id: {
    title: "Microsoft ID Required",
    description: "Microsoft did not provide a user ID. Please try again.",
  },
  invalid_state: {
    title: "Session Expired",
    description: "Your login session has expired. Please try again.",
  },
  authentication_failed: {
    title: "Authentication Failed",
    description: "Unable to sign in. Please try again.",
  },
};

export default function LandingPage() {
  const { isLoading, isAuthenticated } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [authMode, setAuthMode] = useState<AuthMode>("none");
  const [step, setStep] = useState<LoginStep>("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [requires2FA, setRequires2FA] = useState(false);
  const [pendingVerificationEmail, setPendingVerificationEmail] = useState("");

  // Handle OAuth error codes in URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const error = params.get('error');
    
    if (error) {
      const errorInfo = SSO_ERROR_MESSAGES[error] || {
        title: "Sign In Error",
        description: decodeURIComponent(error),
      };
      
      toast({
        title: errorInfo.title,
        description: errorInfo.description,
        variant: "destructive",
      });
      
      // Clear the error from URL
      window.history.replaceState({}, '', '/');
    }
  }, [toast]);

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setStep("password");
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      toast({
        title: "Passwords don't match",
        description: "Please ensure both passwords are the same",
        variant: "destructive",
      });
      return;
    }
    if (password.length < 8) {
      toast({
        title: "Password too short",
        description: "Password must be at least 8 characters",
        variant: "destructive",
      });
      return;
    }
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Registration failed");
      }

      setPendingVerificationEmail(email);
      setAuthMode("verification-sent");
    } catch (error: any) {
      toast({
        title: "Registration Failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (data.requires2FA) {
        setRequires2FA(true);
        setStep("2fa");
        return;
      }

      if (data.requiresVerification) {
        setPendingVerificationEmail(data.email || email);
        setAuthMode("verification-sent");
        return;
      }

      if (!response.ok) {
        throw new Error(data.message || "Login failed");
      }

      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      window.location.href = "/dashboard";
    } catch (error: any) {
      toast({
        title: "Login Failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handle2FASubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/login/2fa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password, totpCode }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || "Invalid code");
      }

      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      window.location.href = "/dashboard";
    } catch (error: any) {
      toast({
        title: "Verification Failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const goBack = () => {
    if (step === "password") {
      setStep("email");
      setPassword("");
    } else if (step === "2fa") {
      setStep("password");
      setTotpCode("");
      setRequires2FA(false);
    }
  };

  const resetAuth = () => {
    setAuthMode("none");
    setStep("email");
    setEmail("");
    setPassword("");
    setConfirmPassword("");
    setTotpCode("");
    setRequires2FA(false);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isAuthenticated) {
    window.location.href = "/dashboard";
    return null;
  }

  const features = [
    {
      icon: FileSignature,
      title: "Easy Document Signing",
      description: "Upload, sign, and send documents in minutes with our intuitive interface"
    },
    {
      icon: Lock,
      title: "Bank-Level Security",
      description: "Your documents are encrypted and protected with enterprise-grade security"
    },
    {
      icon: Users,
      title: "Multi-Party Signing",
      description: "Send documents to multiple signers with custom signing order"
    },
    {
      icon: Eye,
      title: "Completely Private",
      description: "End-to-end encryption as standard, or store documents on your own private cloud"
    },
    {
      icon: Globe,
      title: "Legally Binding",
      description: "eSignatures valid across EU, UK, US, and 180+ countries"
    },
    {
      icon: Code,
      title: "Open Source",
      description: <>Our software is open source, install and use it for free forever by <a href="https://github.com/rl1984/fairsign-open" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">visiting our Git</a></>
    }
  ];

  return (
    <div className="min-h-screen bg-background flex flex-col w-full">
      <header className="w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-5 flex items-center justify-between">
          <div className="flex items-center">
            <img src="/logo.png" alt="FairSign" className="h-8 w-8 sm:h-10 sm:w-10" />
          </div>
          <div className="flex items-center gap-2 sm:gap-4">
            <Button variant="ghost" onClick={() => setAuthMode("login")} className="text-sm sm:text-base" data-testid="header-login-button">
              Log In
            </Button>
            <Button onClick={() => setAuthMode("signup")} className="text-sm sm:text-base" data-testid="header-signup-button">
              <UserPlus className="h-4 w-4 mr-2 hidden sm:block" />
              Sign Up Free
            </Button>
          </div>
        </div>
      </header>
      <section 
        className="relative w-full py-16 sm:py-24 lg:py-32 overflow-hidden"
        style={{
          backgroundImage: `url(${heroBackground})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        <div className="absolute inset-0 bg-gradient-to-r from-background/95 via-background/80 to-background/60" />
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="max-w-3xl">
            <p className="text-2xl sm:text-3xl font-bold text-foreground mb-2">FairSign.io</p>
            <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight mb-4 sm:mb-6">
              Document Signing Made 
              <span className="text-primary"> Simple & Affordable</span>
            </h1>
            <p className="text-lg sm:text-xl md:text-2xl text-muted-foreground mb-6 sm:mb-8 max-w-2xl">
              Sign documents online legally and securely. Start free with 5 documents per month. 
              No hidden fees, no complicated pricing.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
              <Button size="lg" onClick={() => setAuthMode("signup")} className="text-base sm:text-lg px-6 sm:px-8" data-testid="hero-signup-button">
                <UserPlus className="h-5 w-5 mr-2" />
                Get Started Free
              </Button>
              <Button size="lg" variant="outline" onClick={() => setAuthMode("login")} className="text-base sm:text-lg px-6 sm:px-8" data-testid="hero-login-button">
                <LogIn className="h-5 w-5 mr-2" />
                Log In
              </Button>
            </div>
          </div>
        </div>
      </section>
      <section className="w-full py-12 sm:py-16 lg:py-20 bg-muted/50">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-10 sm:mb-12 lg:mb-16">
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold mb-3 sm:mb-4">Why Choose FairSign.io?</h2>
            <p className="text-muted-foreground text-base sm:text-lg max-w-2xl mx-auto">
              We believe document signing should be accessible to everyone. That's why we're up to 80% cheaper than the competition.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 lg:gap-8">
            {features.map((feature, index) => (
              <Card key={index} className="border-0 shadow-sm hover:shadow-md transition-shadow">
                <CardContent className="pt-6">
                  <feature.icon className="h-10 w-10 sm:h-12 sm:w-12 text-primary mb-4" />
                  <h3 className="text-lg sm:text-xl font-semibold mb-2">{feature.title}</h3>
                  <p className="text-muted-foreground text-sm sm:text-base">{feature.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>
      <section className="w-full py-12 sm:py-16 lg:py-20" id="pricing">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-10 sm:mb-12 lg:mb-16">
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold mb-3 sm:mb-4">Simple, Fair Pricing</h2>
            <p className="text-muted-foreground text-base sm:text-lg max-w-2xl mx-auto">
              Start free, pay only when you need more. No surprises, no hidden fees.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 sm:gap-8 max-w-7xl mx-auto">
            <Card className="border-2 relative flex flex-col">
              <CardHeader className="pb-4">
                <CardTitle className="text-xl sm:text-2xl">Free</CardTitle>
                <CardDescription className="text-base sm:text-lg">Perfect for personal use</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col flex-1 gap-4">
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl sm:text-5xl font-bold">€0</span>
                  <span className="text-muted-foreground">/user/month</span>
                </div>
                <ul className="space-y-2 sm:space-y-3 flex-1">
                  <li className="flex items-center gap-2 text-sm sm:text-base">
                    <Check className="h-4 w-4 sm:h-5 sm:w-5 text-green-500 flex-shrink-0" />
                    5 documents per month
                  </li>
                  <li className="flex items-center gap-2 text-sm sm:text-base">
                    <Check className="h-4 w-4 sm:h-5 sm:w-5 text-green-500 flex-shrink-0" />
                    No document length limits
                  </li>
                  <li className="flex items-center gap-2 text-sm sm:text-base">
                    <Check className="h-4 w-4 sm:h-5 sm:w-5 text-green-500 flex-shrink-0" />
                    No watermarks
                  </li>
                  <li className="flex items-center gap-2 text-sm sm:text-base">
                    <Check className="h-4 w-4 sm:h-5 sm:w-5 text-green-500 flex-shrink-0" />
                    10 signers per document
                  </li>
                  <li className="flex items-center gap-2 text-sm sm:text-base">
                    <Check className="h-4 w-4 sm:h-5 sm:w-5 text-green-500 flex-shrink-0" />
                    Audit trail
                  </li>
                  <li className="flex items-center gap-2 text-sm sm:text-base">
                    <Check className="h-4 w-4 sm:h-5 sm:w-5 text-green-500 flex-shrink-0" />
                    Encrypted document storage
                  </li>
                </ul>
                <Button variant="outline" className="w-full" onClick={() => setAuthMode("signup")} data-testid="pricing-free-signup-button">
                  Get Started Free
                </Button>
              </CardContent>
            </Card>

            <Card className="border-2 border-primary relative overflow-hidden flex flex-col">
              <div className="absolute top-0 right-0 bg-primary text-primary-foreground px-3 py-1 text-xs sm:text-sm font-medium">
                Best Value
              </div>
              <CardHeader className="pb-4">
                <CardTitle className="text-xl sm:text-2xl">Pro</CardTitle>
                <CardDescription className="text-base sm:text-lg">For growing businesses</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col flex-1 gap-4">
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl sm:text-5xl font-bold">€5</span>
                  <span className="text-muted-foreground">/user/month + VAT</span>
                </div>
                <ul className="space-y-2 sm:space-y-3 flex-1">
                  <li className="flex items-center gap-2 text-sm sm:text-base">
                    <Check className="h-4 w-4 sm:h-5 sm:w-5 text-green-500 flex-shrink-0" />
                    Unlimited documents
                  </li>
                  <li className="flex items-center gap-2 text-sm sm:text-base">
                    <Check className="h-4 w-4 sm:h-5 sm:w-5 text-green-500 flex-shrink-0" />
                    No watermarks
                  </li>
                  <li className="flex items-center gap-2 text-sm sm:text-base">
                    <Check className="h-4 w-4 sm:h-5 sm:w-5 text-green-500 flex-shrink-0" />
                    Unlimited signers
                  </li>
                  <li className="flex items-center gap-2 text-sm sm:text-base">
                    <Check className="h-4 w-4 sm:h-5 sm:w-5 text-green-500 flex-shrink-0" />
                    Audit trail
                  </li>
                  <li className="flex items-center gap-2 text-sm sm:text-base">
                    <Check className="h-4 w-4 sm:h-5 sm:w-5 text-green-500 flex-shrink-0" />
                    Invite team
                  </li>
                  <li className="flex items-center gap-2 text-sm sm:text-base">
                    <Check className="h-4 w-4 sm:h-5 sm:w-5 text-green-500 flex-shrink-0" />
                    Encrypted document storage
                  </li>
                  <li className="flex items-center gap-2 text-sm sm:text-base">
                    <Check className="h-4 w-4 sm:h-5 sm:w-5 text-green-500 flex-shrink-0" />
                    Private cloud storage
                  </li>
                </ul>
                <Button className="w-full" onClick={() => setAuthMode("signup")} data-testid="pricing-pro-signup-button">
                  Get Pro
                </Button>
              </CardContent>
            </Card>

            <Card className="border-2 relative flex flex-col">
              <CardHeader className="pb-4">
                <CardTitle className="text-xl sm:text-2xl">Enterprise</CardTitle>
                <CardDescription className="text-base sm:text-lg">For advanced compliance</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col flex-1 gap-4">
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl sm:text-5xl font-bold">€8</span>
                  <span className="text-muted-foreground">/user/month + VAT</span>
                </div>
                <p className="text-sm text-muted-foreground -mt-2">Everything in Pro, plus:</p>
                <ul className="space-y-2 sm:space-y-3 flex-1">
                  <li className="flex items-center gap-2 text-sm sm:text-base">
                    <Check className="h-4 w-4 sm:h-5 sm:w-5 text-green-500 flex-shrink-0" />
                    Identity Verification
                  </li>
                  <li className="flex items-center gap-2 text-sm sm:text-base">
                    <Check className="h-4 w-4 sm:h-5 sm:w-5 text-green-500 flex-shrink-0" />
                    Bulk Send
                  </li>
                  <li className="flex items-center gap-2 text-sm sm:text-base">
                    <Check className="h-4 w-4 sm:h-5 sm:w-5 text-green-500 flex-shrink-0" />
                    Data Residency (EU/US)
                  </li>
                  <li className="flex items-center gap-2 text-sm sm:text-base">
                    <Check className="h-4 w-4 sm:h-5 sm:w-5 text-green-500 flex-shrink-0" />
                    API Access (200 calls/month)
                  </li>
                  <li className="flex items-center gap-2 text-sm sm:text-base">
                    <Check className="h-4 w-4 sm:h-5 sm:w-5 text-green-500 flex-shrink-0" />
                    Single Sign-On (SSO)
                  </li>
                </ul>
                <Button variant="outline" className="w-full" onClick={() => setAuthMode("signup")} data-testid="pricing-enterprise-signup-button">
                  Get Enterprise
                </Button>
              </CardContent>
            </Card>

            <Card className="border-2 relative flex flex-col">
              <CardHeader className="pb-4">
                <CardTitle className="text-xl sm:text-2xl">Organisation</CardTitle>
                <CardDescription className="text-base sm:text-lg">For large firms</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col flex-1 gap-4">
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl sm:text-5xl font-bold">€475</span>
                  <span className="text-muted-foreground">/org/month + VAT</span>
                </div>
                <p className="text-sm text-muted-foreground -mt-2">Everything in Enterprise, plus:</p>
                <ul className="space-y-2 sm:space-y-3 flex-1">
                  <li className="flex items-center gap-2 text-sm sm:text-base">
                    <Check className="h-4 w-4 sm:h-5 sm:w-5 text-green-500 flex-shrink-0" />
                    API Access (500 calls/month)
                  </li>
                  <li className="flex items-center gap-2 text-sm sm:text-base">
                    <Check className="h-4 w-4 sm:h-5 sm:w-5 text-green-500 flex-shrink-0" />
                    Custom Domain
                  </li>
                  <li className="flex items-center gap-2 text-sm sm:text-base">
                    <Check className="h-4 w-4 sm:h-5 sm:w-5 text-green-500 flex-shrink-0" />
                    Org. wide access (limit 100 users)
                  </li>
                </ul>
                <Button variant="outline" className="w-full" onClick={() => setAuthMode("signup")} data-testid="pricing-org-signup-button">
                  Contact Sales
                </Button>
              </CardContent>
            </Card>
          </div>
          <p className="text-center text-muted-foreground mt-6 sm:mt-8 text-sm sm:text-base">Our prices are up to 80% cheaper than our competitors because instead of charging you for AI features you don't need, we use AI to reduce our operating costs, passing the savings directly to you.</p>
        </div>
      </section>
      <section className="w-full py-12 sm:py-16 lg:py-20 bg-muted/50">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold mb-4 sm:mb-6">Ready to Get Started?</h2>
          <p className="text-muted-foreground text-base sm:text-lg mb-6 sm:mb-8 max-w-2xl mx-auto">
            Join thousands of users who trust FairSign.io for their document signing needs.
          </p>
          <Button size="lg" onClick={() => setAuthMode("signup")} className="text-base sm:text-lg px-8" data-testid="cta-signup-button">
            <UserPlus className="h-5 w-5 mr-2" />
            Create Free Account
          </Button>
        </div>
      </section>
      <section className="w-full py-12 sm:py-16 lg:py-20" id="faq">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-10 sm:mb-12 lg:mb-16">
            <div className="flex justify-center mb-4">
              <HelpCircle className="h-10 w-10 sm:h-12 sm:w-12 text-primary" />
            </div>
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold mb-3 sm:mb-4">Frequently Asked Questions</h2>
            <p className="text-muted-foreground text-base sm:text-lg max-w-2xl mx-auto">
              Everything you need to know about FairSign.io
            </p>
          </div>
          <div className="max-w-3xl mx-auto">
            <Accordion type="single" collapsible className="w-full space-y-4">
              <AccordionItem value="features" className="border rounded-lg px-4 sm:px-6">
                <AccordionTrigger className="text-left text-base sm:text-lg font-medium py-4" data-testid="faq-features">
                  What features are included with FairSign.io?
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground pb-4 text-sm sm:text-base">
                  <p className="mb-3">FairSign.io includes everything you need for professional document signing:</p>
                  <ul className="list-disc list-inside space-y-2 ml-2">
                    <li><strong>Document Creation:</strong> Upload PDFs or create documents from HTML templates with drag-and-drop field placement</li>
                    <li><strong>E-Signatures:</strong> Legally binding electronic signatures with smooth canvas-based capture</li>
                    <li><strong>Multi-Signer Support:</strong> Send documents to multiple parties with customizable signing order</li>
                    <li><strong>Template Library:</strong> Save and reuse document templates for recurring workflows</li>
                    <li><strong>Audit Trail:</strong> Complete logging of IP addresses, timestamps, and signing events for compliance</li>
                    <li><strong>Automatic Reminders:</strong> Keep your documents moving with email notifications</li>
                    <li><strong>Two-Factor Authentication:</strong> Secure your account with TOTP-based 2FA</li>
                    <li><strong>API Access:</strong> Integrate with your existing systems (Enterprise tier)</li>
                  </ul>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="privacy" className="border rounded-lg px-4 sm:px-6">
                <AccordionTrigger className="text-left text-base sm:text-lg font-medium py-4" data-testid="faq-privacy">
                  How does FairSign.io protect my documents and privacy?
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground pb-4 text-sm sm:text-base">
                  <p className="mb-3">Privacy and security are at the core of everything we do. Our approach is different from competitors:</p>
                  <ul className="list-disc list-inside space-y-2 ml-2">
                    <li><strong>End-to-End Encryption:</strong> All documents are encrypted in transit and at rest using industry-standard AES-256 encryption</li>
                    <li><strong>No Document Mining:</strong> We never read, analyse, or use your documents for any purpose other than providing our service</li>
                    <li><strong>Private Cloud Storage:</strong> Pro users can connect their own S3-compatible storage (AWS, Cloudflare R2, etc.) so documents never touch our servers</li>
                    <li><strong>Data Residency:</strong> Enterprise users can choose EU or US data centres for compliance with GDPR and other regulations</li>
                    <li><strong>Zero Data Selling:</strong> We will never sell your data to third parties. Your documents are yours alone.</li>
                    <li><strong>Minimal Data Collection:</strong> We only collect what's necessary to provide the service - no tracking, no profiling</li>
                    <li><strong>Secure Token-Based Signing:</strong> Signers access documents via unique cryptographic tokens - no account creation required</li>
                  </ul>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="opensource" className="border rounded-lg px-4 sm:px-6">
                <AccordionTrigger className="text-left text-base sm:text-lg font-medium py-4" data-testid="faq-opensource">
                  Why is FairSign.io open source?
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground pb-4 text-sm sm:text-base">
                  <p className="mb-3">We believe transparency builds trust. Here's why we chose to open source FairSign:</p>
                  <ul className="list-disc list-inside space-y-2 ml-2">
                    <li><strong>Transparency:</strong> Anyone can inspect our code to verify we do exactly what we say. No hidden backdoors, no secret data collection.</li>
                    <li><strong>Security Through Visibility:</strong> Open source software is scrutinised by the global developer community, making it more secure than closed alternatives.</li>
                    <li><strong>Self-Hosting Freedom:</strong> If you prefer complete control, you can run FairSign on your own servers at no cost.</li>
                    <li><strong>No Vendor Lock-In:</strong> Your data and workflows are never held hostage. Export, migrate, or self-host whenever you want.</li>
                    <li><strong>Community Innovation:</strong> Developers worldwide can contribute improvements, ensuring the platform evolves with real user needs.</li>
                    <li><strong>Fair Pricing:</strong> By sharing our code openly, we're committed to fair pricing - we can't hide behind proprietary claims to justify inflated costs.</li>
                  </ul>
                  <p className="mt-3">
                    Visit our <a href="https://github.com/rl1984/fairsign-open" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">GitHub repository</a> to explore the code, report issues, or contribute.
                  </p>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="legal" className="border rounded-lg px-4 sm:px-6">
                <AccordionTrigger className="text-left text-base sm:text-lg font-medium py-4" data-testid="faq-legal">
                  Are electronic signatures legally binding?
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground pb-4 text-sm sm:text-base">
                  <p className="mb-3">Yes! Electronic signatures created with FairSign.io are legally binding for most business and personal transactions worldwide:</p>
                  <ul className="list-disc list-inside space-y-2 ml-2">
                    <li><strong>European Union:</strong> Compliant with eIDAS Regulation for electronic signatures</li>
                    <li><strong>United Kingdom:</strong> Valid under the Electronic Communications Act 2000</li>
                    <li><strong>United States:</strong> Compliant with ESIGN Act and UETA</li>
                    <li><strong>180+ Countries:</strong> Electronic signatures are recognised in most countries with modern commerce laws</li>
                  </ul>
                  <p className="mt-3">Our comprehensive audit trail captures signer intent, identity verification, and timestamps to provide strong legal evidence of agreement.</p>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="pricing" className="border rounded-lg px-4 sm:px-6">
                <AccordionTrigger className="text-left text-base sm:text-lg font-medium py-4" data-testid="faq-pricing">
                  Why is FairSign.io so much cheaper than competitors?
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground pb-4 text-sm sm:text-base">
                  <p className="mb-3">We're up to 80% cheaper than DocuSign, HelloSign, and similar services because:</p>
                  <ul className="list-disc list-inside space-y-2 ml-2">
                    <li><strong>No Unnecessary AI Fees:</strong> We don't charge extra for AI features most users never need</li>
                    <li><strong>Efficient Infrastructure:</strong> We use AI to optimise our own operations, passing savings directly to you</li>
                    <li><strong>Open Source Foundation:</strong> Our open source model means lower development costs and faster innovation</li>
                    <li><strong>No Sales Teams:</strong> Our product sells itself - we don't need expensive enterprise sales operations</li>
                    <li><strong>Fair Business Model:</strong> We believe document signing is a utility, not a luxury. It should be priced accordingly.</li>
                  </ul>
                  <p className="mt-3">Our free tier gives you 5 documents per month with no watermarks - more than enough for personal use. Pro starts at just 5 per user per month.</p>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="storage" className="border rounded-lg px-4 sm:px-6">
                <AccordionTrigger className="text-left text-base sm:text-lg font-medium py-4" data-testid="faq-storage">
                  Where are my documents stored?
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground pb-4 text-sm sm:text-base">
                  <p className="mb-3">You have full control over where your documents are stored:</p>
                  <ul className="list-disc list-inside space-y-2 ml-2">
                    <li><strong>Free & Pro (Default):</strong> Encrypted storage on our secure EU-based servers (Cloudflare R2)</li>
                    <li><strong>Pro (Private Cloud):</strong> Connect your own S3-compatible storage - AWS S3, Cloudflare R2, Google Cloud Storage, or any S3-compatible provider</li>
                    <li><strong>Enterprise:</strong> Choose between EU and US data centres for regulatory compliance</li>
                    <li><strong>Self-Hosted:</strong> Run FairSign on your own infrastructure for complete data sovereignty</li>
                  </ul>
                  <p className="mt-3">With private cloud storage, your documents never pass through our servers - they go directly between your signers and your storage.</p>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="api" className="border rounded-lg px-4 sm:px-6">
                <AccordionTrigger className="text-left text-base sm:text-lg font-medium py-4" data-testid="faq-api">
                  Can I integrate FairSign.io with my existing software?
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground pb-4 text-sm sm:text-base">
                  <p className="mb-3">Yes! Enterprise users get full API access to automate document workflows:</p>
                  <ul className="list-disc list-inside space-y-2 ml-2">
                    <li><strong>RESTful API:</strong> Simple, well-documented endpoints for all operations</li>
                    <li><strong>Template-Based Creation:</strong> Create documents programmatically from saved templates</li>
                    <li><strong>Webhooks:</strong> Get instant notifications when documents are signed or completed</li>
                    <li><strong>Embedded Signing:</strong> Embed signing experiences directly in your application</li>
                  </ul>
                  <p className="mt-3">Enterprise tier includes 200 API calls per month. Organisation tier includes 500 calls per month with additional features.</p>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>
        </div>
      </section>
      <footer className="py-6 sm:py-8 px-4 text-center border-t bg-background">
        <div className="container mx-auto">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <img src="/logo.png" alt="FairSign" className="h-5 w-5" />
              <span className="font-semibold">FairSign.io</span>
            </div>
            <div className="flex items-center gap-4 flex-wrap">
              <Link href="/terms">
                <span className="text-sm text-muted-foreground hover:text-foreground cursor-pointer" data-testid="link-terms-of-service">
                  Terms of Service
                </span>
              </Link>
              <Link href="/privacy">
                <span className="text-sm text-muted-foreground hover:text-foreground cursor-pointer" data-testid="link-privacy-policy">
                  Privacy Policy
                </span>
              </Link>
              <p className="text-sm text-muted-foreground">
                &copy; {new Date().getFullYear()} FairSign.io. All Rights Reserved.
              </p>
            </div>
          </div>
        </div>
      </footer>
      {authMode !== "none" && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={(e) => e.target === e.currentTarget && resetAuth()}>
          <Card className="w-full max-w-md relative animate-in fade-in zoom-in-95 duration-200">
            <button 
              onClick={resetAuth}
              className="absolute right-4 top-4 text-muted-foreground hover:text-foreground"
              data-testid="modal-close-button"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <CardHeader className="text-center pt-8">
              <div className="flex justify-center mb-4">
                {authMode === "verification-sent" ? (
                  <Mail className="h-10 w-10 text-green-500" />
                ) : (
                  <img src="/logo.png" alt="FairSign" className="h-10 w-10" />
                )}
              </div>
              <CardTitle className="text-xl sm:text-2xl">
                {authMode === "signup" && "Create Your Account"}
                {authMode === "verification-sent" && "Check Your Email"}
                {authMode === "login" && step === "email" && "Welcome Back"}
                {authMode === "login" && step === "password" && "Enter Password"}
                {authMode === "login" && step === "2fa" && "Two-Factor Authentication"}
              </CardTitle>
              <CardDescription>
                {authMode === "signup" && "Start signing documents for free"}
                {authMode === "verification-sent" && `We've sent a verification link to ${pendingVerificationEmail}`}
                {authMode === "login" && step === "email" && "Enter your email to continue"}
                {authMode === "login" && step === "password" && email}
                {authMode === "login" && step === "2fa" && "Enter the code from your authenticator app"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {authMode === "verification-sent" && (
                <div className="space-y-4 text-center">
                  <p className="text-sm text-muted-foreground">
                    Click the link in the email to verify your account and start signing documents. 
                    The link will expire in 24 hours.
                  </p>
                  <div className="bg-muted p-4 rounded-lg">
                    <p className="text-sm text-muted-foreground">
                      Didn't receive the email? Check your spam folder or{" "}
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            const response = await fetch("/api/auth/resend-verification", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ email: pendingVerificationEmail }),
                            });
                            if (response.ok) {
                              toast({
                                title: "Email sent",
                                description: "We've sent another verification email",
                              });
                            } else {
                              const data = await response.json();
                              toast({
                                title: "Error",
                                description: data.message || "Failed to resend email",
                                variant: "destructive",
                              });
                            }
                          } catch (error) {
                            toast({
                              title: "Error",
                              description: "Failed to resend email",
                              variant: "destructive",
                            });
                          }
                        }}
                        className="text-primary hover:underline"
                        data-testid="resend-verification-button"
                      >
                        resend it
                      </button>
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={resetAuth}
                    data-testid="back-to-home-button"
                  >
                    Back to Home
                  </Button>
                </div>
              )}

              {authMode === "signup" && (
                <form onSubmit={handleSignup} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="signup-email">Email</Label>
                    <Input
                      id="signup-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="Enter your email"
                      required
                      autoFocus
                      data-testid="signup-input-email"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-password">Password</Label>
                    <Input
                      id="signup-password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Create a password"
                      required
                      data-testid="signup-input-password"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-confirm">Confirm Password</Label>
                    <Input
                      id="signup-confirm"
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Confirm your password"
                      required
                      data-testid="signup-input-confirm-password"
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={isSubmitting} data-testid="signup-submit-button">
                    {isSubmitting ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <UserPlus className="h-4 w-4 mr-2" />
                    )}
                    Create Account
                  </Button>
                  <div className="relative my-4">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-card px-2 text-muted-foreground">Or continue with</span>
                    </div>
                  </div>
                  <Button 
                    type="button" 
                    variant="outline" 
                    className="w-full" 
                    onClick={() => window.location.href = '/auth/google'}
                    data-testid="button-google-signup"
                  >
                    <svg className="h-4 w-4 mr-2" viewBox="0 0 24 24">
                      <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                      <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                      <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                      <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                    </svg>
                    Continue with Google
                  </Button>
                  <div className="space-y-2">
                    <p className="text-center text-xs text-muted-foreground">Enterprise SSO (Enterprise/Org plans only)</p>
                    <Button 
                      type="button" 
                      variant="outline" 
                      className="w-full" 
                      onClick={() => window.location.href = '/auth/microsoft'}
                      data-testid="button-microsoft-signup"
                    >
                      <svg className="h-4 w-4 mr-2" viewBox="0 0 23 23">
                        <rect fill="#f25022" x="1" y="1" width="10" height="10"/>
                        <rect fill="#00a4ef" x="1" y="12" width="10" height="10"/>
                        <rect fill="#7fba00" x="12" y="1" width="10" height="10"/>
                        <rect fill="#ffb900" x="12" y="12" width="10" height="10"/>
                      </svg>
                      Microsoft
                    </Button>
                  </div>
                  <p className="text-center text-sm text-muted-foreground">
                    Already have an account?{" "}
                    <button 
                      type="button"
                      onClick={() => { setAuthMode("login"); setStep("email"); }}
                      className="text-primary hover:underline"
                      data-testid="signup-switch-to-login"
                    >
                      Log in
                    </button>
                  </p>
                </form>
              )}

              {authMode === "login" && step === "email" && (
                <form onSubmit={handleEmailSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="Enter your email"
                      required
                      autoFocus
                      data-testid="input-email"
                    />
                  </div>
                  <Button type="submit" className="w-full" data-testid="button-continue">
                    Continue
                  </Button>
                  <div className="relative my-4">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-card px-2 text-muted-foreground">Or continue with</span>
                    </div>
                  </div>
                  <Button 
                    type="button" 
                    variant="outline" 
                    className="w-full" 
                    onClick={() => window.location.href = '/auth/google'}
                    data-testid="button-google-signin"
                  >
                    <svg className="h-4 w-4 mr-2" viewBox="0 0 24 24">
                      <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                      <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                      <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                      <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                    </svg>
                    Continue with Google
                  </Button>
                  <div className="space-y-2">
                    <p className="text-center text-xs text-muted-foreground">Enterprise SSO (Enterprise/Org plans only)</p>
                    <Button 
                      type="button" 
                      variant="outline" 
                      className="w-full" 
                      onClick={() => window.location.href = '/auth/microsoft'}
                      data-testid="button-microsoft-signin"
                    >
                      <svg className="h-4 w-4 mr-2" viewBox="0 0 23 23">
                        <rect fill="#f25022" x="1" y="1" width="10" height="10"/>
                        <rect fill="#00a4ef" x="1" y="12" width="10" height="10"/>
                        <rect fill="#7fba00" x="12" y="1" width="10" height="10"/>
                        <rect fill="#ffb900" x="12" y="12" width="10" height="10"/>
                      </svg>
                      Microsoft
                    </Button>
                  </div>
                  <p className="text-center text-sm text-muted-foreground">
                    Don't have an account?{" "}
                    <button 
                      type="button"
                      onClick={() => setAuthMode("signup")}
                      className="text-primary hover:underline"
                      data-testid="login-switch-to-signup"
                    >
                      Sign up free
                    </button>
                  </p>
                </form>
              )}

              {authMode === "login" && step === "password" && (
                <form onSubmit={handlePasswordSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="password">Password</Label>
                    <Input
                      id="password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter your password"
                      required
                      autoFocus
                      data-testid="input-password"
                    />
                  </div>
                  <div className="text-right">
                    <Link
                      href={`/forgot-password?email=${encodeURIComponent(email)}`}
                      className="text-sm text-primary hover:underline"
                      data-testid="link-forgot-password"
                    >
                      Forgot password?
                    </Link>
                  </div>
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" onClick={goBack} data-testid="button-back">
                      <ArrowLeft className="h-4 w-4" />
                    </Button>
                    <Button type="submit" className="flex-1" disabled={isSubmitting} data-testid="button-signin">
                      {isSubmitting ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <LogIn className="h-4 w-4 mr-2" />
                      )}
                      Sign In
                    </Button>
                  </div>
                </form>
              )}

              {authMode === "login" && step === "2fa" && (
                <form onSubmit={handle2FASubmit} className="space-y-4">
                  <div className="flex justify-center mb-4">
                    <Shield className="h-12 w-12 text-primary" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="totp">Verification Code</Label>
                    <Input
                      id="totp"
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={6}
                      value={totpCode}
                      onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ""))}
                      placeholder="000000"
                      required
                      autoFocus
                      className="text-center text-2xl tracking-widest"
                      data-testid="input-totp"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" onClick={goBack} data-testid="button-back-2fa">
                      <ArrowLeft className="h-4 w-4" />
                    </Button>
                    <Button type="submit" className="flex-1" disabled={isSubmitting || totpCode.length !== 6} data-testid="button-verify">
                      {isSubmitting ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Shield className="h-4 w-4 mr-2" />
                      )}
                      Verify
                    </Button>
                  </div>
                </form>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
