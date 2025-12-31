import { useState } from "react";
import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { FileText, LogIn, Loader2, ArrowLeft, Shield, Check, FileSignature, Users, Eye, Lock, Globe, UserPlus, Mail, Code } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import heroBackground from "@assets/generated_images/professional_signature_hero_background.png";

type AuthMode = "none" | "login" | "signup" | "verification-sent";
type LoginStep = "email" | "password" | "2fa";

export default function LandingPage() {
  const { isLoading, isAuthenticated } = useAuth();
  const { toast } = useToast();
  const [authMode, setAuthMode] = useState<AuthMode>("none");
  const [step, setStep] = useState<LoginStep>("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [requires2FA, setRequires2FA] = useState(false);
  const [pendingVerificationEmail, setPendingVerificationEmail] = useState("");

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
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-3">
            <FileText className="h-6 w-6 sm:h-8 sm:w-8 text-primary" />
            <span className="text-xl sm:text-2xl font-bold">FairSign.io</span>
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
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8 max-w-6xl mx-auto">
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
                    <span><strong>5 documents</strong> per month</span>
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
                    <span><strong>Unlimited documents</strong></span>
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
                  Start Pro Trial
                </Button>
              </CardContent>
            </Card>

            <Card className="border-2 relative flex flex-col">
              <CardHeader className="pb-4">
                <CardTitle className="text-xl sm:text-2xl">Enterprise</CardTitle>
                <CardDescription className="text-base sm:text-lg">For Professional Services Firms</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col flex-1 gap-4">
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl sm:text-5xl font-bold">€275</span>
                  <span className="text-muted-foreground">/org/month + VAT</span>
                </div>
                <ul className="space-y-2 sm:space-y-3 flex-1">
                  <li className="flex items-center gap-2 text-sm sm:text-base">
                    <Check className="h-4 w-4 sm:h-5 sm:w-5 text-green-500 flex-shrink-0" />
                    <span><strong>Unlimited documents</strong></span>
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
                    Use your domain
                  </li>
                  <li className="flex items-center gap-2 text-sm sm:text-base">
                    <Check className="h-4 w-4 sm:h-5 sm:w-5 text-green-500 flex-shrink-0" />
                    Encrypted document storage
                  </li>
                  <li className="flex items-center gap-2 text-sm sm:text-base">
                    <Check className="h-4 w-4 sm:h-5 sm:w-5 text-green-500 flex-shrink-0" />
                    Private cloud storage
                  </li>
                  <li className="flex items-center gap-2 text-sm sm:text-base">
                    <Check className="h-4 w-4 sm:h-5 sm:w-5 text-green-500 flex-shrink-0" />
                    <span><strong>Org. wide access (limit 100 users)</strong></span>
                  </li>
                  <li className="flex items-center gap-2 text-sm sm:text-base">
                    <Check className="h-4 w-4 sm:h-5 sm:w-5 text-green-500 flex-shrink-0" />
                    <span><strong>API access</strong></span>
                  </li>
                </ul>
                <Button variant="outline" className="w-full" onClick={() => setAuthMode("signup")} data-testid="pricing-enterprise-signup-button">
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
      <footer className="py-6 sm:py-8 px-4 text-center border-t bg-background">
        <div className="container mx-auto">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
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
                  <FileText className="h-10 w-10 text-primary" />
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
