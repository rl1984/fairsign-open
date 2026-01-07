import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, ShieldCheck, AlertCircle, CheckCircle, ExternalLink, Crown } from "lucide-react";

interface IdentityEligibility {
  eligible: boolean;
  reason?: string;
  requirements?: {
    isPro: boolean;
    has2FA: boolean;
    hasName: boolean;
    hasProfilePhoto: boolean;
  };
}

interface IdentityStatus {
  status: string | null;
  verifiedAt: string | null;
  isVerified: boolean;
}

export function IdentityVerification() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isRedirecting, setIsRedirecting] = useState(false);

  const { data: eligibility, isLoading: eligibilityLoading } = useQuery<IdentityEligibility>({
    queryKey: ["/api/ee/identity/eligibility"],
    enabled: !!user,
  });

  const { data: status, isLoading: statusLoading } = useQuery<IdentityStatus>({
    queryKey: ["/api/ee/identity/status"],
    enabled: !!user,
  });

  const startVerificationMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/ee/identity/start", {});
      return res.json();
    },
    onSuccess: (data: { url: string }) => {
      setIsRedirecting(true);
      window.location.href = data.url;
    },
    onError: (error: Error) => {
      toast({
        title: "Verification Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleStartVerification = () => {
    startVerificationMutation.mutate();
  };

  const isLoading = eligibilityLoading || statusLoading;

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" />
            Identity Verification
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (status?.isVerified) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" />
            Identity Verification
          </CardTitle>
          <CardDescription>
            Verified accounts display a badge when sending documents
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3 p-4 rounded-md bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900">
            <CheckCircle className="h-8 w-8 text-green-600 dark:text-green-400" />
            <div>
              <p className="font-medium text-green-900 dark:text-green-100">Identity Verified</p>
              <p className="text-sm text-green-700 dark:text-green-300">
                Your identity has been verified. Recipients will see a verified badge on documents you send.
              </p>
              {status.verifiedAt && (
                <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                  Verified on {new Date(status.verifiedAt).toLocaleDateString()}
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!eligibility?.eligible) {
    const requirements = eligibility?.requirements;
    // Always show the requirements checklist, using defaults if requirements are missing
    const isPro = requirements?.isPro ?? false;
    const has2FA = requirements?.has2FA ?? false;
    const hasName = requirements?.hasName ?? false;
    const hasProfilePhoto = requirements?.hasProfilePhoto ?? false;
    
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" />
            Identity Verification
            <Crown className="h-4 w-4 text-yellow-500" />
          </CardTitle>
          <CardDescription>
            Verify your identity to display a trusted badge when sending documents
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start gap-3 p-4 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900">
            <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5" />
            <div>
              <p className="font-medium text-amber-900 dark:text-amber-100">Requirements Not Met</p>
              <p className="text-sm text-amber-700 dark:text-amber-300">
                Complete the requirements below to verify your identity.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">Requirements:</p>
            <ul className="space-y-1 text-sm">
              <li className="flex items-center gap-2">
                {isPro ? (
                  <CheckCircle className="h-4 w-4 text-green-600" />
                ) : (
                  <AlertCircle className="h-4 w-4 text-muted-foreground" />
                )}
                <span className={isPro ? "" : "text-muted-foreground"}>
                  Enterprise subscription
                </span>
              </li>
              <li className="flex items-center gap-2">
                {has2FA ? (
                  <CheckCircle className="h-4 w-4 text-green-600" />
                ) : (
                  <AlertCircle className="h-4 w-4 text-muted-foreground" />
                )}
                <span className={has2FA ? "" : "text-muted-foreground"}>
                  Two-factor authentication enabled
                </span>
              </li>
              <li className="flex items-center gap-2">
                {hasName ? (
                  <CheckCircle className="h-4 w-4 text-green-600" />
                ) : (
                  <AlertCircle className="h-4 w-4 text-muted-foreground" />
                )}
                <span className={hasName ? "" : "text-muted-foreground"}>
                  First and last name added
                </span>
              </li>
              <li className="flex items-center gap-2">
                {hasProfilePhoto ? (
                  <CheckCircle className="h-4 w-4 text-green-600" />
                ) : (
                  <AlertCircle className="h-4 w-4 text-muted-foreground" />
                )}
                <span className={hasProfilePhoto ? "" : "text-muted-foreground"}>
                  Profile photo uploaded
                </span>
              </li>
            </ul>
          </div>
        </CardContent>
      </Card>
    );
  }

  const isPending = status?.status === "pending" || status?.status === "requires_input";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5" />
          Identity Verification
          <Crown className="h-4 w-4 text-yellow-500" />
        </CardTitle>
        <CardDescription>
          Verify your identity with a government-issued ID to display a trusted badge
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="p-4 rounded-md bg-muted/50 border">
          <p className="text-sm">
            When you verify your identity, recipients of your documents will see a "Verified Sender" 
            badge. This builds trust and confirms that you are who you say you are.
          </p>
        </div>

        {isPending && (
          <div className="flex items-start gap-3 p-4 rounded-md bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900">
            <Loader2 className="h-5 w-5 text-blue-600 dark:text-blue-400 animate-spin mt-0.5" />
            <div>
              <p className="font-medium text-blue-900 dark:text-blue-100">Verification In Progress</p>
              <p className="text-sm text-blue-700 dark:text-blue-300">
                {status?.status === "requires_input" 
                  ? "Additional information is required. Please continue your verification."
                  : "Your verification is being processed. This usually takes a few minutes."}
              </p>
            </div>
          </div>
        )}

        <Button
          onClick={handleStartVerification}
          disabled={startVerificationMutation.isPending || isRedirecting}
          data-testid="button-start-identity-verification"
        >
          {startVerificationMutation.isPending || isRedirecting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              {isRedirecting ? "Redirecting..." : "Starting..."}
            </>
          ) : (
            <>
              <ExternalLink className="h-4 w-4 mr-2" />
              {isPending ? "Continue Verification" : "Start Verification"}
            </>
          )}
        </Button>

        <p className="text-xs text-muted-foreground">
          You will be redirected to our secure verification partner (Stripe Identity) to complete 
          the process. You will need a valid government-issued ID and may be asked to take a selfie.
        </p>
      </CardContent>
    </Card>
  );
}
