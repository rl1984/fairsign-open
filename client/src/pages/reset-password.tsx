import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { FileText, Loader2, CheckCircle, XCircle, Lock } from "lucide-react";

type PageStatus = "form" | "submitting" | "success" | "error";

export default function ResetPasswordPage() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [status, setStatus] = useState<PageStatus>("form");
  const [errorMessage, setErrorMessage] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const token = new URLSearchParams(window.location.search).get("token");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!token) {
      setStatus("error");
      setErrorMessage("Invalid reset link. Please request a new password reset.");
      return;
    }

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

    setStatus("submitting");

    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword: password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Failed to reset password");
      }

      setStatus("success");
    } catch (error: any) {
      setStatus("error");
      setErrorMessage(error.message);
    }
  };

  if (!token) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
        <div className="flex items-center gap-2 mb-8">
          <FileText className="h-8 w-8 text-primary" />
          <span className="text-2xl font-bold">FairSign.io</span>
        </div>

        <Card className="w-full max-w-md" data-testid="reset-password-card">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <XCircle className="h-12 w-12 text-red-500" />
            </div>
            <CardTitle className="text-red-600">Invalid Reset Link</CardTitle>
            <CardDescription>
              This password reset link is invalid. Please request a new one.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              className="w-full"
              onClick={() => setLocation("/forgot-password")}
              data-testid="button-request-new"
            >
              Request New Reset Link
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <div className="flex items-center gap-2 mb-8">
        <FileText className="h-8 w-8 text-primary" />
        <span className="text-2xl font-bold">FairSign.io</span>
      </div>

      <Card className="w-full max-w-md" data-testid="reset-password-card">
        <CardHeader className="text-center">
          {status === "success" ? (
            <>
              <div className="flex justify-center mb-4">
                <CheckCircle className="h-12 w-12 text-green-500" />
              </div>
              <CardTitle className="text-green-600">Password Reset!</CardTitle>
              <CardDescription>
                Your password has been successfully reset. You can now log in with your new password.
              </CardDescription>
            </>
          ) : status === "error" ? (
            <>
              <div className="flex justify-center mb-4">
                <XCircle className="h-12 w-12 text-red-500" />
              </div>
              <CardTitle className="text-red-600">Reset Failed</CardTitle>
              <CardDescription>{errorMessage}</CardDescription>
            </>
          ) : (
            <>
              <div className="flex justify-center mb-4">
                <Lock className="h-12 w-12 text-primary" />
              </div>
              <CardTitle>Reset Your Password</CardTitle>
              <CardDescription>
                Enter your new password below.
              </CardDescription>
            </>
          )}
        </CardHeader>

        <CardContent className="space-y-4">
          {status === "success" ? (
            <Button
              className="w-full"
              onClick={() => setLocation("/")}
              data-testid="button-go-to-login"
            >
              Go to Login
            </Button>
          ) : status === "error" ? (
            <Button
              className="w-full"
              onClick={() => setLocation("/forgot-password")}
              data-testid="button-try-again"
            >
              Request New Reset Link
            </Button>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">New Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter new password"
                  required
                  autoFocus
                  disabled={status === "submitting"}
                  data-testid="input-new-password"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm Password</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm new password"
                  required
                  disabled={status === "submitting"}
                  data-testid="input-confirm-password"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Password must be at least 8 characters long.
              </p>
              <Button
                type="submit"
                className="w-full"
                disabled={status === "submitting" || password.length < 8}
                data-testid="button-reset-password"
              >
                {status === "submitting" ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Resetting...
                  </>
                ) : (
                  "Reset Password"
                )}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
