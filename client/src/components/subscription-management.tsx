import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Loader2, Crown, FileText, CreditCard, Check, Zap, Gift, Tag, CheckCircle, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type BillingPeriod = "monthly" | "annual";

interface SubscriptionStatus {
  accountType: string;
  subscriptionStatus: string | null;
  currentPeriodEnd: string | null;
  documentsUsed: number;
  documentLimit: number;
  canCreateDocument: boolean;
}

interface PromoValidation {
  valid: boolean;
  percentOff?: number;
  code?: string;
  error?: string;
}

export function SubscriptionManagement() {
  const { toast } = useToast();
  const [isUpgrading, setIsUpgrading] = useState(false);
  const [isManaging, setIsManaging] = useState(false);
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>("annual");
  const [promoCode, setPromoCode] = useState("");
  const [promoValidation, setPromoValidation] = useState<PromoValidation | null>(null);
  const [isValidating, setIsValidating] = useState(false);

  const { data: subscription, isLoading, error } = useQuery<SubscriptionStatus>({
    queryKey: ["/api/subscription/status"],
  });

  const validatePromoCode = async () => {
    if (!promoCode.trim()) {
      setPromoValidation(null);
      return;
    }
    
    setIsValidating(true);
    try {
      const res = await fetch(`/api/subscription/validate-promo?code=${encodeURIComponent(promoCode.toUpperCase())}`, {
        credentials: "include",
      });
      const data = await res.json();
      setPromoValidation(data);
      if (!data.valid) {
        toast({
          title: "Invalid promo code",
          description: data.error || "This code is not valid",
          variant: "destructive",
        });
      }
    } catch (error) {
      setPromoValidation({ valid: false, error: "Failed to validate code" });
    } finally {
      setIsValidating(false);
    }
  };

  const clearPromoCode = () => {
    setPromoCode("");
    setPromoValidation(null);
  };

  const handleUpgrade = async (period: BillingPeriod = billingPeriod) => {
    setIsUpgrading(true);
    try {
      const body: { billingPeriod: string; promoCode?: string } = { billingPeriod: period };
      if (promoValidation?.valid && promoCode) {
        body.promoCode = promoCode.toUpperCase();
      }
      
      const res = await fetch("/api/subscription/checkout", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
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
          <Card className="border-primary/50 bg-gradient-to-br from-primary/5 to-primary/10">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-primary" />
                Upgrade to Pro
              </CardTitle>
              <CardDescription>
                Unlock unlimited documents and premium features
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Billing Period Toggle */}
              <div className="flex rounded-lg border p-1 bg-muted/50">
                <button
                  onClick={() => setBillingPeriod("monthly")}
                  className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors ${
                    billingPeriod === "monthly" 
                      ? "bg-background shadow-sm" 
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  data-testid="button-billing-monthly"
                >
                  Monthly
                </button>
                <button
                  onClick={() => setBillingPeriod("annual")}
                  className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors ${
                    billingPeriod === "annual" 
                      ? "bg-background shadow-sm" 
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  data-testid="button-billing-annual"
                >
                  Annual
                </button>
              </div>

              {/* Pricing Display */}
              <div className="text-center py-2">
                {billingPeriod === "monthly" ? (
                  <div>
                    <div className="flex items-baseline justify-center gap-1">
                      <span className="text-4xl font-bold">€5</span>
                      <span className="text-muted-foreground">/month</span>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">Billed monthly</p>
                  </div>
                ) : (
                  <div>
                    <div className="flex items-center justify-center gap-2 mb-1">
                      <Badge variant="secondary" className="bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">
                        <Gift className="h-3 w-3 mr-1" />
                        1 Month Free
                      </Badge>
                    </div>
                    <div className="flex items-baseline justify-center gap-1">
                      <span className="text-4xl font-bold">€55</span>
                      <span className="text-muted-foreground">/year</span>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      <span className="line-through">€60</span> - Save €5 per year
                    </p>
                  </div>
                )}
              </div>
              
              <ul className="space-y-2">
                <li className="flex items-center gap-2 text-sm">
                  <Check className="h-4 w-4 text-green-500" />
                  Unlimited documents
                </li>
                <li className="flex items-center gap-2 text-sm">
                  <Check className="h-4 w-4 text-green-500" />
                  Bulk import
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
                  Private cloud storage
                </li>
              </ul>

              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Tag className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Have a promo code?</span>
                </div>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Input
                      placeholder="Enter promo code"
                      value={promoCode}
                      onChange={(e) => {
                        setPromoCode(e.target.value.toUpperCase());
                        setPromoValidation(null);
                      }}
                      className={promoValidation?.valid ? "pr-8 border-green-500" : ""}
                      data-testid="input-promo-code"
                    />
                    {promoValidation?.valid && (
                      <CheckCircle className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-green-500" />
                    )}
                  </div>
                  {promoCode && !promoValidation?.valid && (
                    <Button
                      variant="outline"
                      size="default"
                      onClick={validatePromoCode}
                      disabled={isValidating || !promoCode.trim()}
                      data-testid="button-apply-promo"
                    >
                      {isValidating ? <Loader2 className="h-4 w-4 animate-spin" /> : "Apply"}
                    </Button>
                  )}
                  {promoValidation?.valid && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={clearPromoCode}
                      data-testid="button-clear-promo"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                {promoValidation?.valid && (
                  <p className="text-sm text-green-600">
                    {promoValidation.percentOff}% discount will be applied
                  </p>
                )}
              </div>

              <Button
                className="w-full"
                size="lg"
                onClick={() => handleUpgrade(billingPeriod)}
                disabled={isUpgrading}
                data-testid="button-upgrade-pro"
              >
                {isUpgrading ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Crown className="h-4 w-4 mr-2" />
                )}
                {billingPeriod === "annual" ? "Subscribe Annually" : "Subscribe Monthly"}
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
