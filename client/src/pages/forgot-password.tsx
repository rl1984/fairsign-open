import { useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { FileText, Loader2, CheckCircle, ArrowLeft, Mail } from "lucide-react";

type PageStatus = "form" | "submitting" | "sent";

export default function ForgotPasswordPage() {
  const { toast } = useToast();
  const [status, setStatus] = useState<PageStatus>("form");
  const [email, setEmail] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("email") || "";
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    setStatus("submitting");

    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Failed to send reset email");
      }

      setStatus("sent");
    } catch (error: any) {
      setStatus("form");
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <div className="flex items-center gap-2 mb-8">
        <FileText className="h-8 w-8 text-primary" />
        <span className="text-2xl font-bold">FairSign.io</span>
      </div>

      <Card className="w-full max-w-md" data-testid="forgot-password-card">
        <CardHeader className="text-center">
          {status === "sent" ? (
            <>
              <div className="flex justify-center mb-4">
                <CheckCircle className="h-12 w-12 text-green-500" />
              </div>
              <CardTitle>Check Your Email</CardTitle>
              <CardDescription>
                If an account exists with that email, we've sent a password reset link.
                Please check your inbox and spam folder.
              </CardDescription>
            </>
          ) : (
            <>
              <div className="flex justify-center mb-4">
                <Mail className="h-12 w-12 text-primary" />
              </div>
              <CardTitle>Forgot Password?</CardTitle>
              <CardDescription>
                Enter your email address and we'll send you a link to reset your password.
              </CardDescription>
            </>
          )}
        </CardHeader>

        <CardContent className="space-y-4">
          {status !== "sent" ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  autoFocus
                  disabled={status === "submitting"}
                  data-testid="input-forgot-email"
                />
              </div>
              <Button
                type="submit"
                className="w-full"
                disabled={status === "submitting"}
                data-testid="button-send-reset"
              >
                {status === "submitting" ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Sending...
                  </>
                ) : (
                  "Send Reset Link"
                )}
              </Button>
              <div className="text-center">
                <Link href="/" className="text-sm text-muted-foreground hover:underline inline-flex items-center gap-1">
                  <ArrowLeft className="h-3 w-3" />
                  Back to login
                </Link>
              </div>
            </form>
          ) : (
            <div className="space-y-4">
              <Button
                className="w-full"
                variant="outline"
                onClick={() => setStatus("form")}
                data-testid="button-try-again"
              >
                Try another email
              </Button>
              <div className="text-center">
                <Link href="/" className="text-sm text-primary hover:underline" data-testid="link-back-to-login">
                  Back to login
                </Link>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
