import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { FileText, Send, Loader2, Copy, ExternalLink, CheckCircle } from "lucide-react";

interface CreateDocumentResponse {
  document_id: string;
  signing_url: string;
}

export default function HomePage() {
  const { toast } = useToast();
  const [tenantName, setTenantName] = useState("John Doe");
  const [tenantEmail, setTenantEmail] = useState("john@example.com");
  const [propertyAddress, setPropertyAddress] = useState("123 Main Street, Apt 4B");
  const [rent, setRent] = useState("2500");
  const [result, setResult] = useState<CreateDocumentResponse | null>(null);
  const [copied, setCopied] = useState(false);

  const createDocumentMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          template_id: "lease_v1",
          data: {
            tenant_name: tenantName,
            tenant_email: tenantEmail,
            property_address: propertyAddress,
            rent: rent,
            lease_start: new Date().toISOString().split("T")[0],
            lease_end: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
            landlord_name: "Property Management Inc.",
            landlord_email: "landlord@example.com",
          },
          callback_url: `${window.location.origin}/api/webhook-test`,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create document");
      }

      return res.json();
    },
    onSuccess: (data) => {
      setResult(data);
      toast({
        title: "Document created",
        description: "The signing link has been generated.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createDocumentMutation.mutate();
  };

  const handleCopy = async () => {
    if (!result) return;
    await navigator.clipboard.writeText(result.signing_url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({
      title: "Copied",
      description: "Signing URL copied to clipboard.",
    });
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center gap-3">
          <FileText className="h-8 w-8 text-primary" />
          <h1 className="text-xl font-semibold">FairSign</h1>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="grid gap-8 lg:grid-cols-2">
          {/* Create document form */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Send className="h-5 w-5" />
                Create Signing Request
              </CardTitle>
              <CardDescription>
                Generate a new lease document for electronic signature
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="tenantName">Tenant Name</Label>
                  <Input
                    id="tenantName"
                    value={tenantName}
                    onChange={(e) => setTenantName(e.target.value)}
                    placeholder="Enter tenant name"
                    required
                    data-testid="input-tenant-name"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="tenantEmail">Tenant Email</Label>
                  <Input
                    id="tenantEmail"
                    type="email"
                    value={tenantEmail}
                    onChange={(e) => setTenantEmail(e.target.value)}
                    placeholder="Enter tenant email"
                    required
                    data-testid="input-tenant-email"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="propertyAddress">Property Address</Label>
                  <Input
                    id="propertyAddress"
                    value={propertyAddress}
                    onChange={(e) => setPropertyAddress(e.target.value)}
                    placeholder="Enter property address"
                    required
                    data-testid="input-property-address"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="rent">Monthly Rent ($)</Label>
                  <Input
                    id="rent"
                    type="number"
                    value={rent}
                    onChange={(e) => setRent(e.target.value)}
                    placeholder="Enter monthly rent"
                    required
                    data-testid="input-rent"
                  />
                </div>

                <Button
                  type="submit"
                  className="w-full"
                  disabled={createDocumentMutation.isPending}
                  data-testid="button-create-document"
                >
                  {createDocumentMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <FileText className="h-4 w-4 mr-2" />
                      Create Document
                    </>
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Result display */}
          <Card className={result ? "border-green-200 dark:border-green-800" : ""}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {result ? (
                  <CheckCircle className="h-5 w-5 text-green-500" />
                ) : (
                  <FileText className="h-5 w-5 text-muted-foreground" />
                )}
                Signing Link
              </CardTitle>
              <CardDescription>
                {result
                  ? "Share this link with the tenant to sign the lease"
                  : "Create a document to generate a signing link"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {result ? (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Document ID</Label>
                    <p className="text-sm font-mono bg-muted p-2 rounded-md break-all" data-testid="text-document-id">
                      {result.document_id}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label>Signing URL</Label>
                    <div className="flex gap-2">
                      <Input
                        readOnly
                        value={result.signing_url}
                        className="font-mono text-xs"
                        data-testid="input-signing-url"
                      />
                      <Button
                        size="icon"
                        variant="outline"
                        onClick={handleCopy}
                        data-testid="button-copy-url"
                      >
                        {copied ? (
                          <CheckCircle className="h-4 w-4 text-green-500" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>

                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => window.open(result.signing_url, "_blank")}
                    data-testid="button-open-signing"
                  >
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Open Signing Page
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
                  <FileText className="h-12 w-12 mb-4 opacity-50" />
                  <p>No document created yet</p>
                  <p className="text-sm">Fill out the form to generate a signing link</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Instructions */}
        <Card className="mt-8">
          <CardHeader>
            <CardTitle>How It Works</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="space-y-3 text-sm text-muted-foreground">
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-medium">1</span>
                <span>Fill in the tenant and property details in the form above</span>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-medium">2</span>
                <span>Click "Create Document" to generate a PDF lease and signing link</span>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-medium">3</span>
                <span>Share the signing link with the tenant via email or messaging</span>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-medium">4</span>
                <span>The tenant opens the link, reviews the lease, and signs electronically</span>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-medium">5</span>
                <span>Once completed, you receive a webhook notification with the signed PDF</span>
              </li>
            </ol>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
