import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Crown, FileText, CreditCard, Check, Zap } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface SubscriptionStatus {
  accountType: string;
  subscriptionStatus: string | null;
  currentPeriodEnd: string | null;
  documentsUsed: number;
  documentLimit: number;
  canCreateDocument: boolean;
}

export function SubscriptionManagement() {
  const { toast } = useToast();
  const [isUpgrading, setIsUpgrading] = useState(false);
  const [isManaging, setIsManaging] = useState(false);

  const { data: subscription, isLoading, error } = useQuery<SubscriptionStatus>({
    queryKey: ["/api/subscription/status"],
  });

  const handleUpgrade = async () => {
    setIsUpgrading(true);
    try {
      const res = await fetch("/api/subscription/checkout", {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      
      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error(data.error || "Failed to start checkout");
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to start upgrade process",
        variant: "destructive",
      });
    } finally {
      setIsUpgrading(false);
    }
  };

  const handleManageBilling = async () => {
    setIsManaging(true);
    try {
      const res = await fetch("/api/subscription/portal", {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      
      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error(data.error || "Failed to open billing portal");
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to open billing portal",
        variant: "destructive",
      });
    } finally {
      setIsManaging(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <p className="text-muted-foreground">Unable to load subscription information</p>
        </CardContent>
      </Card>
    );
  }

  const isPro = subscription?.accountType === "pro";
  const documentsUsed = subscription?.documentsUsed ?? 0;
  const docsRemaining = Math.max(0, 5 - documentsUsed);
  const documentsRemaining = subscription ? 
    (isPro ? "Unlimited" : `${docsRemaining} of 5 remaining`) : 
    "5 remaining";

  return (
    <div className="space-y-6">
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Current Plan
              </CardTitle>
              <Badge variant={isPro ? "default" : "secondary"} className="text-sm">
                {isPro ? (
                  <><Crown className="h-3 w-3 mr-1" /> Pro</>
                ) : (
                  "Free"
                )}
              </Badge>
            </div>
            <CardDescription>
              {isPro ? "Unlimited documents and all features" : "5 documents per month"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Documents this month</span>
                <span className="font-medium">{documentsRemaining}</span>
              </div>
              
              {isPro && subscription?.currentPeriodEnd && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Next billing date</span>
                  <span className="font-medium">
                    {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
                  </span>
                </div>
              )}

              {isPro && (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={handleManageBilling}
                  disabled={isManaging}
                  data-testid="button-manage-billing"
                >
                  {isManaging ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <CreditCard className="h-4 w-4 mr-2" />
                  )}
                  Manage Billing
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {!isPro && (
          <Card className="border-primary/50 bg-primary/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-primary" />
                Upgrade to Pro
              </CardTitle>
              <CardDescription>
                Unlock unlimited documents and premium features
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="mb-4">
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-bold">$6</span>
                  <span className="text-muted-foreground">/month</span>
                </div>
                <p className="text-sm text-muted-foreground mt-1">or €5/month</p>
              </div>
              
              <ul className="space-y-2 mb-6">
                <li className="flex items-center gap-2 text-sm">
                  <Check className="h-4 w-4 text-green-500" />
                  Unlimited documents
                </li>
                <li className="flex items-center gap-2 text-sm">
                  <Check className="h-4 w-4 text-green-500" />
                  No watermarks
                </li>
                <li className="flex items-center gap-2 text-sm">
                  <Check className="h-4 w-4 text-green-500" />
                  Unlimited signers
                </li>
                <li className="flex items-center gap-2 text-sm">
                  <Check className="h-4 w-4 text-green-500" />
                  Full audit trail
                </li>
                <li className="flex items-center gap-2 text-sm">
                  <Check className="h-4 w-4 text-green-500" />
                  Invite team members
                </li>
              </ul>

              <Button
                className="w-full"
                onClick={handleUpgrade}
                disabled={isUpgrading}
                data-testid="button-upgrade-pro"
              >
                {isUpgrading ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Crown className="h-4 w-4 mr-2" />
                )}
                Upgrade Now
              </Button>
            </CardContent>
          </Card>
        )}

        {isPro && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Crown className="h-5 w-5 text-primary" />
                Pro Benefits
              </CardTitle>
              <CardDescription>
                You're enjoying all premium features
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                <li className="flex items-center gap-2 text-sm">
                  <Check className="h-4 w-4 text-green-500" />
                  Unlimited documents
                </li>
                <li className="flex items-center gap-2 text-sm">
                  <Check className="h-4 w-4 text-green-500" />
                  No watermarks
                </li>
                <li className="flex items-center gap-2 text-sm">
                  <Check className="h-4 w-4 text-green-500" />
                  Unlimited signers
                </li>
                <li className="flex items-center gap-2 text-sm">
                  <Check className="h-4 w-4 text-green-500" />
                  Full audit trail
                </li>
                <li className="flex items-center gap-2 text-sm">
                  <Check className="h-4 w-4 text-green-500" />
                  Team collaboration
                </li>
                <li className="flex items-center gap-2 text-sm">
                  <Check className="h-4 w-4 text-green-500" />
                  Priority support
                </li>
              </ul>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
