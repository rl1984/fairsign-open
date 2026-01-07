import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { 
  ArrowLeft, 
  FileText, 
  Download, 
  ExternalLink, 
  CreditCard, 
  CheckCircle, 
  Clock, 
  AlertCircle,
  Loader2,
  Receipt
} from "lucide-react";

interface Invoice {
  id: string;
  number: string | null;
  status: string | null;
  amountDue: number;
  amountPaid: number;
  currency: string;
  created: number;
  periodStart: number;
  periodEnd: number;
  hostedInvoiceUrl: string | null;
  invoicePdf: string | null;
}

interface UserData {
  id: string;
  email: string;
  accountType: string;
  stripeSubscriptionStatus?: string;
}

const formatCurrency = (amount: number, currency: string) => {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amount / 100);
};

const formatDate = (timestamp: number) => {
  return new Date(timestamp * 1000).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

const getStatusBadge = (status: string | null) => {
  switch (status) {
    case "paid":
      return (
        <Badge variant="default" className="bg-green-600">
          <CheckCircle className="h-3 w-3 mr-1" />
          Paid
        </Badge>
      );
    case "open":
      return (
        <Badge variant="outline">
          <Clock className="h-3 w-3 mr-1" />
          Open
        </Badge>
      );
    case "void":
      return (
        <Badge variant="secondary">
          Void
        </Badge>
      );
    case "uncollectible":
      return (
        <Badge variant="destructive">
          <AlertCircle className="h-3 w-3 mr-1" />
          Uncollectible
        </Badge>
      );
    default:
      return (
        <Badge variant="outline">
          {status || "Unknown"}
        </Badge>
      );
  }
};

export default function Billing() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const { data: user, isLoading: userLoading } = useQuery<UserData>({
    queryKey: ["/api/auth/user"],
  });

  const { data: invoicesData, isLoading: invoicesLoading } = useQuery<{ invoices: Invoice[] }>({
    queryKey: ["/api/subscription/invoices"],
    enabled: !!user,
  });

  const portalMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/subscription/portal");
      const contentType = response.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        throw new Error("Billing portal is not available. Stripe payments may not be configured.");
      }
      return response.json();
    },
    onSuccess: (data) => {
      if (data.url) {
        window.open(data.url, "_blank");
      } else if (data.error) {
        toast({
          title: "Error",
          description: data.error,
          variant: "destructive",
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Could not open billing portal",
        variant: "destructive",
      });
    },
  });

  const invoices = invoicesData?.invoices || [];
  const isPro = user?.accountType === "pro";

  if (userLoading) {
    return (
      <div className="container max-w-4xl mx-auto py-8 px-4">
        <Skeleton className="h-8 w-48 mb-6" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="container max-w-4xl mx-auto py-8 px-4">
      <div className="flex items-center gap-4 mb-6">
        <Link href="/">
          <Button variant="ghost" size="icon" data-testid="button-back">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Billing & Invoices</h1>
          <p className="text-muted-foreground">View and download your invoices</p>
        </div>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Subscription Status
            </CardTitle>
            <CardDescription>
              Your current plan and billing information
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">Current Plan:</span>
                  <Badge variant={isPro ? "default" : "secondary"}>
                    {isPro ? "Pro" : "Free"}
                  </Badge>
                </div>
                {isPro && user?.stripeSubscriptionStatus && (
                  <div className="text-sm text-muted-foreground">
                    Status: {user.stripeSubscriptionStatus}
                  </div>
                )}
              </div>
              {isPro && (
                <Button 
                  variant="outline" 
                  onClick={() => portalMutation.mutate()}
                  disabled={portalMutation.isPending}
                  data-testid="button-manage-subscription"
                >
                  {portalMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Opening...
                    </>
                  ) : (
                    <>
                      <ExternalLink className="h-4 w-4 mr-2" />
                      Manage Subscription
                    </>
                  )}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5" />
              Invoices
            </CardTitle>
            <CardDescription>
              Your billing history and downloadable invoices
            </CardDescription>
          </CardHeader>
          <CardContent>
            {invoicesLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : invoices.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <FileText className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>No invoices yet</p>
                <p className="text-sm mt-1">
                  {isPro 
                    ? "Your first invoice will appear after your next billing cycle."
                    : "Upgrade to Pro to access premium features and see your invoices here."
                  }
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {invoices.map((invoice) => (
                  <div
                    key={invoice.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between p-4 border rounded-md gap-3"
                    data-testid={`invoice-row-${invoice.id}`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium truncate">
                          {invoice.number || `Invoice ${invoice.id.slice(-8)}`}
                        </span>
                        {getStatusBadge(invoice.status)}
                      </div>
                      <div className="text-sm text-muted-foreground mt-1">
                        {formatDate(invoice.created)} • {formatCurrency(invoice.amountPaid || invoice.amountDue, invoice.currency)}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {invoice.hostedInvoiceUrl && (
                        <Button
                          variant="outline"
                          size="sm"
                          asChild
                          data-testid={`button-view-invoice-${invoice.id}`}
                        >
                          <a href={invoice.hostedInvoiceUrl} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="h-4 w-4 mr-1" />
                            View
                          </a>
                        </Button>
                      )}
                      {invoice.invoicePdf && (
                        <Button
                          variant="outline"
                          size="sm"
                          asChild
                          data-testid={`button-download-invoice-${invoice.id}`}
                        >
                          <a href={invoice.invoicePdf} target="_blank" rel="noopener noreferrer">
                            <Download className="h-4 w-4 mr-1" />
                            PDF
                          </a>
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
