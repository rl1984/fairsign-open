import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/auth-utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  FileText,
  FileCode,
  Send,
  Loader2,
  Copy,
  ExternalLink,
  CheckCircle,
  Clock,
  AlertCircle,
  LogOut,
  Plus,
  RefreshCw,
  Eye,
  LayoutDashboard,
  Upload,
  Users,
  Settings,
  Archive,
  ArchiveRestore,
  Download,
  FileCheck,
  Search,
} from "lucide-react";
import UserManagement from "@/components/user-management";
import TwoFactorSetup from "@/components/two-factor-setup";
import { StorageSettings } from "@/components/storage-settings";
import { TemplatesManagement } from "@/components/templates-management";
import { ProfileSettings } from "@/components/profile-settings";
import { SubscriptionManagement } from "@/components/subscription-management";
import { HardDrive, CreditCard, Crown } from "lucide-react";
import type { Document, AuditEvent, SignatureAsset } from "@shared/schema";

interface DocumentWithDetails extends Document {
  signatureAssets?: SignatureAsset[];
  auditEvents?: AuditEvent[];
}

interface CreateDocumentResponse {
  document_id: string;
  signing_url: string;
  status: string;
}

function getStatusBadge(status: string) {
  switch (status) {
    case "completed":
      return <Badge variant="default" className="bg-green-500"><CheckCircle className="h-3 w-3 mr-1" />Completed</Badge>;
    case "sent":
      return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" />Sent</Badge>;
    case "created":
      return <Badge variant="outline"><AlertCircle className="h-3 w-3 mr-1" />Created</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function formatDate(date: string | Date) {
  return new Date(date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AdminDashboard() {
  const [, setLocation] = useLocation();
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("documents");
  const [selectedDocument, setSelectedDocument] = useState<DocumentWithDetails | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [documentFilter, setDocumentFilter] = useState<"active" | "completed" | "archived">("active");
  const [searchQuery, setSearchQuery] = useState("");

  // Form state for new document
  const [tenantName, setTenantName] = useState("");
  const [tenantEmail, setTenantEmail] = useState("");
  const [propertyAddress, setPropertyAddress] = useState("");
  const [rent, setRent] = useState("");
  const [createdResult, setCreatedResult] = useState<CreateDocumentResponse | null>(null);

  // Email form state
  const [emailRecipient, setEmailRecipient] = useState("");
  const [emailRecipientName, setEmailRecipientName] = useState("");
  const [isSendingEmail, setIsSendingEmail] = useState(false);

  // Fetch documents for the authenticated user
  const { data: documents, isLoading: docsLoading, refetch: refetchDocs } = useQuery<Document[]>({
    queryKey: ["/api/admin/documents"],
    enabled: isAuthenticated,
  });

  // Create document mutation
  const createDocumentMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/admin/documents", data);
      return res.json();
    },
    onSuccess: (data) => {
      setCreatedResult(data);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/documents"] });
      toast({
        title: "Document created",
        description: "The signing link has been generated.",
      });
    },
    onError: (error: Error) => {
      if (isUnauthorizedError(error)) {
        toast({ title: "Session expired", description: "Please log in again.", variant: "destructive" });
        setTimeout(() => { window.location.href = "/"; }, 500);
        return;
      }
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Archive document mutation
  const archiveMutation = useMutation({
    mutationFn: async ({ docId, archive }: { docId: string; archive: boolean }) => {
      const endpoint = archive 
        ? `/api/admin/documents/${docId}/archive`
        : `/api/admin/documents/${docId}/unarchive`;
      const res = await apiRequest("POST", endpoint);
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/documents"] });
      toast({
        title: variables.archive ? "Document archived" : "Document restored",
        description: variables.archive 
          ? "The document has been moved to archives." 
          : "The document has been restored.",
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

  // Fetch document details
  const fetchDocumentDetails = async (docId: string) => {
    const res = await fetch(`/api/admin/documents/${docId}`, { credentials: "include" });
    if (!res.ok) {
      throw new Error("Failed to fetch document details");
    }
    return res.json();
  };

  const handleViewDocument = async (doc: Document) => {
    try {
      const details = await fetchDocumentDetails(doc.id);
      setSelectedDocument(details);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to load document details",
        variant: "destructive",
      });
    }
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createDocumentMutation.mutate({
      template_id: "lease_v1",
      data: {
        tenant_name: tenantName,
        tenant_email: tenantEmail,
        property_address: propertyAddress,
        rent: rent,
        lease_start: new Date().toISOString().split("T")[0],
        lease_end: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
        landlord_name: user?.firstName && user?.lastName ? `${user.firstName} ${user.lastName}` : "Property Management",
        landlord_email: user?.email || "landlord@example.com",
      },
      callback_url: `${window.location.origin}/api/webhook-test`,
    });
  };

  const handleCopyUrl = async (url: string) => {
    await navigator.clipboard.writeText(url);
    toast({ title: "Copied", description: "Signing URL copied to clipboard." });
  };

  // Send email functions
  const handleSendEmail = async (documentId: string, emailType: "signature_request" | "reminder") => {
    if (!emailRecipient) {
      toast({ title: "Error", description: "Please enter a recipient email address.", variant: "destructive" });
      return;
    }
    
    setIsSendingEmail(true);
    try {
      const endpoint = emailType === "signature_request" 
        ? `/api/admin/documents/${documentId}/send-email`
        : `/api/admin/documents/${documentId}/send-reminder`;
        
      const res = await apiRequest("POST", endpoint, {
        signerEmail: emailRecipient,
        signerName: emailRecipientName || undefined,
      });
      
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to send email");
      }
      
      toast({ 
        title: "Email Sent", 
        description: emailType === "signature_request" 
          ? "Signature request email has been sent." 
          : "Reminder email has been sent." 
      });
      
      setEmailRecipient("");
      setEmailRecipientName("");
      refetchDocs();
      
      if (selectedDocument) {
        const details = await fetchDocumentDetails(selectedDocument.id);
        setSelectedDocument(details);
      }
    } catch (error: any) {
      if (isUnauthorizedError(error)) {
        toast({ title: "Session expired", description: "Please log in again.", variant: "destructive" });
        setTimeout(() => { window.location.href = "/"; }, 500);
        return;
      }
      toast({ title: "Error", description: error.message || "Failed to send email", variant: "destructive" });
    } finally {
      setIsSendingEmail(false);
    }
  };

  const resetCreateDialog = () => {
    setTenantName("");
    setTenantEmail("");
    setPropertyAddress("");
    setRent("");
    setCreatedResult(null);
    setIsCreateDialogOpen(false);
  };

  // If not authenticated, redirect to login
  if (!authLoading && !isAuthenticated) {
    window.location.href = "/";
    return null;
  }

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <LayoutDashboard className="h-6 w-6 text-primary" />
            <h1 className="text-lg font-semibold">FairSign</h1>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => window.location.href = "/bulk-import"}
              data-testid="button-nav-bulk-import"
            >
              <Upload className="h-4 w-4 mr-1" />
              Bulk Import
            </Button>
            {user?.isAdmin && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => window.location.href = "/admin"}
                data-testid="button-nav-admin"
              >
                <Crown className="h-4 w-4 mr-1" />
                Admin Panel
              </Button>
            )}
            {user && (
              <div className="flex items-center gap-2">
                <Avatar className="h-8 w-8">
                  <AvatarFallback>
                    {user.firstName?.[0]}{user.lastName?.[0]}
                  </AvatarFallback>
                </Avatar>
                <span className="text-sm hidden sm:inline" data-testid="text-user-name">
                  {user.firstName} {user.lastName}
                </span>
              </div>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={async () => {
                await fetch("/api/logout", { method: "POST", credentials: "include" });
                window.location.href = "/";
              }}
              data-testid="button-logout"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-6xl mx-auto px-4 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
            <TabsList>
              <TabsTrigger value="documents" data-testid="tab-documents">
                <FileText className="h-4 w-4 mr-2" />
                Documents
              </TabsTrigger>
              <TabsTrigger value="templates" data-testid="tab-templates">
                <FileCode className="h-4 w-4 mr-2" />
                Templates
              </TabsTrigger>
              {user?.isAdmin && (
                <TabsTrigger value="users" data-testid="tab-users">
                  <Users className="h-4 w-4 mr-2" />
                  Users
                </TabsTrigger>
              )}
              <TabsTrigger value="subscription" data-testid="tab-subscription">
                <CreditCard className="h-4 w-4 mr-2" />
                Account
              </TabsTrigger>
              <TabsTrigger value="settings" data-testid="tab-settings">
                <Settings className="h-4 w-4 mr-2" />
                Settings
              </TabsTrigger>
              {user?.isAdmin && (
                <TabsTrigger value="storage" data-testid="tab-storage">
                  <HardDrive className="h-4 w-4 mr-2" />
                  Storage
                </TabsTrigger>
              )}
            </TabsList>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetchDocs()}
                data-testid="button-refresh"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
              <Button
                size="sm"
                onClick={() => setLocation("/documents/new")}
                data-testid="button-new-document"
              >
                <Plus className="h-4 w-4 mr-2" />
                New Document
              </Button>
            </div>
          </div>

          <TabsContent value="documents">
            {docsLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : !documents || documents.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <FileText className="h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground mb-4">No documents yet</p>
                  <Button onClick={() => setLocation("/documents/new")} data-testid="button-create-first">
                    <Plus className="h-4 w-4 mr-2" />
                    Create Your First Document
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-4 flex-wrap">
                  <div className="relative flex-1 min-w-[200px] max-w-sm">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search by title, name, or email..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9"
                      data-testid="input-search-documents"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant={documentFilter === "active" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setDocumentFilter("active")}
                      data-testid="button-show-active"
                    >
                      Active
                    </Button>
                    <Button
                      variant={documentFilter === "completed" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setDocumentFilter("completed")}
                      data-testid="button-show-completed"
                    >
                      <CheckCircle className="h-4 w-4 mr-1" />
                      Completed
                    </Button>
                    <Button
                      variant={documentFilter === "archived" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setDocumentFilter("archived")}
                      data-testid="button-show-archived"
                    >
                      <Archive className="h-4 w-4 mr-1" />
                      Archived
                    </Button>
                  </div>
                </div>
                {documents.filter((doc) => {
                  // Status filter
                  if (documentFilter === "archived" && !doc.archivedAt) return false;
                  if (documentFilter === "completed" && (doc.status !== "completed" || doc.archivedAt)) return false;
                  if (documentFilter === "active" && (doc.status === "completed" || doc.archivedAt)) return false;
                  // Search filter
                  if (searchQuery.trim()) {
                    const query = searchQuery.toLowerCase();
                    const dataJson = doc.dataJson as Record<string, unknown> | null;
                    const title = dataJson?.title ? String(dataJson.title).toLowerCase() : "";
                    const tenantName = dataJson?.tenant_name ? String(dataJson.tenant_name).toLowerCase() : "";
                    const signers = (dataJson?.signers as Array<{name: string; email: string}>) || [];
                    const signerNames = signers.map(s => s.name.toLowerCase()).join(" ");
                    const signerEmails = signers.map(s => s.email.toLowerCase()).join(" ");
                    const searchableText = `${title} ${tenantName} ${signerNames} ${signerEmails} ${doc.id.toLowerCase()}`;
                    if (!searchableText.includes(query)) return false;
                  }
                  return true;
                }).length === 0 ? (
                  <Card>
                    <CardContent className="flex flex-col items-center justify-center py-8">
                      {searchQuery.trim() ? (
                        <>
                          <Search className="h-10 w-10 text-muted-foreground mb-3" />
                          <p className="text-muted-foreground">No documents match "{searchQuery}"</p>
                        </>
                      ) : documentFilter === "archived" ? (
                        <>
                          <Archive className="h-10 w-10 text-muted-foreground mb-3" />
                          <p className="text-muted-foreground">No archived documents</p>
                        </>
                      ) : documentFilter === "completed" ? (
                        <>
                          <CheckCircle className="h-10 w-10 text-muted-foreground mb-3" />
                          <p className="text-muted-foreground">No completed documents</p>
                        </>
                      ) : (
                        <>
                          <FileText className="h-10 w-10 text-muted-foreground mb-3" />
                          <p className="text-muted-foreground mb-4">No active documents</p>
                          <Button onClick={() => setLocation("/documents/new")} data-testid="button-create-new">
                            <Plus className="h-4 w-4 mr-2" />
                            Create Document
                          </Button>
                        </>
                      )}
                    </CardContent>
                  </Card>
                ) : documents
                  .filter((doc) => {
                    // Status filter
                    if (documentFilter === "archived" && !doc.archivedAt) return false;
                    if (documentFilter === "completed" && (doc.status !== "completed" || doc.archivedAt)) return false;
                    if (documentFilter === "active" && (doc.status === "completed" || doc.archivedAt)) return false;
                    // Search filter
                    if (searchQuery.trim()) {
                      const query = searchQuery.toLowerCase();
                      const dataJson = doc.dataJson as Record<string, unknown> | null;
                      const title = dataJson?.title ? String(dataJson.title).toLowerCase() : "";
                      const tenantName = dataJson?.tenant_name ? String(dataJson.tenant_name).toLowerCase() : "";
                      const signers = (dataJson?.signers as Array<{name: string; email: string}>) || [];
                      const signerNames = signers.map(s => s.name.toLowerCase()).join(" ");
                      const signerEmails = signers.map(s => s.email.toLowerCase()).join(" ");
                      const searchableText = `${title} ${tenantName} ${signerNames} ${signerEmails} ${doc.id.toLowerCase()}`;
                      if (!searchableText.includes(query)) return false;
                    }
                    return true;
                  })
                  .map((doc) => (
                  <Card key={doc.id} className="hover-elevate" data-testid={`card-document-${doc.id}`}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-4 flex-wrap">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            {getStatusBadge(doc.status)}
                            <span className="text-xs text-muted-foreground">
                              {formatDate(doc.createdAt)}
                            </span>
                          </div>
                          <p className="text-sm font-medium truncate" data-testid={`text-doc-id-${doc.id}`}>
                            {doc.dataJson && typeof doc.dataJson === 'object' && (doc.dataJson as Record<string, unknown>).title
                              ? String((doc.dataJson as Record<string, unknown>).title)
                              : doc.id}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {doc.templateId 
                              ? `Template: ${doc.templateId}` 
                              : "One-off document"}
                          </p>
                          {doc.dataJson && typeof doc.dataJson === 'object' && (
                            <>
                              {(doc.dataJson as Record<string, unknown>).oneOffDocument ? (
                                <p className="text-sm text-muted-foreground mt-1">
                                  {((doc.dataJson as Record<string, unknown>).signers as Array<{name: string; email: string}>)?.map(s => s.name).join(", ") || ""}
                                </p>
                              ) : (
                                <p className="text-sm text-muted-foreground mt-1">
                                  {String((doc.dataJson as Record<string, unknown>).tenant_name || "")} - {String((doc.dataJson as Record<string, unknown>).property_address || "")}
                                </p>
                              )}
                            </>
                          )}
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleViewDocument(doc)}
                            data-testid={`button-info-${doc.id}`}
                            title="View document information"
                          >
                            <Eye className="h-4 w-4 mr-1" />
                            Info
                          </Button>
                          {doc.status === "created" && !doc.archivedAt && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                const url = `${window.location.origin}/d/${doc.id}?token=${doc.signingToken}`;
                                window.open(url, "_blank");
                              }}
                              data-testid={`button-open-${doc.id}`}
                            >
                              <ExternalLink className="h-4 w-4" />
                            </Button>
                          )}
                          {doc.status === "completed" && doc.signedPdfKey && (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  window.open(`/api/admin/documents/${doc.id}/signed.pdf`, "_blank");
                                }}
                                data-testid={`button-view-signed-${doc.id}`}
                                title="View signed PDF"
                              >
                                <FileCheck className="h-4 w-4 mr-1" />
                                View
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => {
                                  const link = document.createElement("a");
                                  link.href = `/api/admin/documents/${doc.id}/signed.pdf?download=true`;
                                  link.download = `signed-${doc.id}.pdf`;
                                  link.click();
                                }}
                                data-testid={`button-download-${doc.id}`}
                                title="Download signed PDF"
                              >
                                <Download className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                          {doc.status !== "completed" && !doc.archivedAt && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => archiveMutation.mutate({ docId: doc.id, archive: true })}
                              disabled={archiveMutation.isPending}
                              data-testid={`button-archive-${doc.id}`}
                              title="Archive document"
                            >
                              <Archive className="h-4 w-4" />
                            </Button>
                          )}
                          {doc.archivedAt && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => archiveMutation.mutate({ docId: doc.id, archive: false })}
                              disabled={archiveMutation.isPending}
                              data-testid={`button-unarchive-${doc.id}`}
                              title="Restore document"
                            >
                              <ArchiveRestore className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="templates">
            <TemplatesManagement />
          </TabsContent>

          {user?.isAdmin && (
            <TabsContent value="users">
              <UserManagement />
            </TabsContent>
          )}

          <TabsContent value="subscription">
            <SubscriptionManagement />
          </TabsContent>

          <TabsContent value="settings">
            <div className="space-y-6">
              <ProfileSettings />
              
              <div>
                <h2 className="text-lg font-semibold mb-2">Account Security</h2>
                <p className="text-sm text-muted-foreground mb-4">Manage your account security settings</p>
              </div>
              <TwoFactorSetup
                isEnabled={user?.twoFactorEnabled || false}
                onUpdate={() => queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] })}
              />
            </div>
          </TabsContent>

          {user?.isAdmin && (
            <TabsContent value="storage">
              <StorageSettings />
            </TabsContent>
          )}
        </Tabs>
      </main>

      {/* Create Document Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={(open) => !open && resetCreateDialog()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="h-5 w-5" />
              Create Signing Request
            </DialogTitle>
            <DialogDescription>
              Generate a new lease document for electronic signature
            </DialogDescription>
          </DialogHeader>

          {createdResult ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-green-600">
                <CheckCircle className="h-5 w-5" />
                <span className="font-medium">Document Created</span>
              </div>
              
              <div className="space-y-2">
                <Label>Document ID</Label>
                <p className="text-sm font-mono bg-muted p-2 rounded-md break-all" data-testid="text-created-doc-id">
                  {createdResult.document_id}
                </p>
              </div>

              <div className="space-y-2">
                <Label>Signing URL</Label>
                <div className="flex gap-2">
                  <Input
                    readOnly
                    value={createdResult.signing_url}
                    className="font-mono text-xs"
                    data-testid="input-created-signing-url"
                  />
                  <Button
                    size="icon"
                    variant="outline"
                    onClick={() => handleCopyUrl(createdResult.signing_url)}
                    data-testid="button-copy-created-url"
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => window.open(createdResult.signing_url, "_blank")}
                  data-testid="button-open-created"
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Open
                </Button>
                <Button className="flex-1" onClick={resetCreateDialog} data-testid="button-done">
                  Done
                </Button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleCreateSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="tenantName">Tenant Name</Label>
                <Input
                  id="tenantName"
                  value={tenantName}
                  onChange={(e) => setTenantName(e.target.value)}
                  placeholder="Enter tenant name"
                  required
                  data-testid="input-create-tenant-name"
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
                  data-testid="input-create-tenant-email"
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
                  data-testid="input-create-property"
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
                  data-testid="input-create-rent"
                />
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={createDocumentMutation.isPending}
                data-testid="button-submit-create"
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
          )}
        </DialogContent>
      </Dialog>

      {/* Document Details Dialog */}
      <Dialog open={!!selectedDocument} onOpenChange={(open) => !open && setSelectedDocument(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          {selectedDocument && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Document Details
                </DialogTitle>
                <DialogDescription>
                  {selectedDocument.id}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-6">
                {/* Status and info */}
                <div className="flex items-center gap-4 flex-wrap">
                  {getStatusBadge(selectedDocument.status)}
                  <span className="text-sm text-muted-foreground">
                    Created: {formatDate(selectedDocument.createdAt)}
                  </span>
                </div>

                {/* Document data */}
                {selectedDocument.dataJson && typeof selectedDocument.dataJson === 'object' && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Document Data</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4 text-sm">
                      {/* Basic info - filter out complex objects */}
                      <div className="grid grid-cols-2 gap-2">
                        {Object.entries(selectedDocument.dataJson as Record<string, any>)
                          .filter(([key, value]) => !Array.isArray(value) && typeof value !== 'object')
                          .map(([key, value]) => (
                            <div key={key}>
                              <span className="text-muted-foreground">{key.replace(/_/g, " ")}:</span>{" "}
                              <span className="font-medium">{String(value)}</span>
                            </div>
                          ))}
                      </div>
                      
                      {/* Signers section */}
                      {(selectedDocument.dataJson as Record<string, any>).signers && (
                        <div className="space-y-2">
                          <h4 className="font-semibold text-sm flex items-center gap-2">
                            <Users className="h-4 w-4" />
                            Signers
                          </h4>
                          <div className="space-y-2">
                            {((selectedDocument.dataJson as Record<string, any>).signers as Array<{id: string; name: string; email: string}>).map((signer, idx) => (
                              <div key={signer.id || idx} className="flex items-center justify-between p-2 bg-muted/50 rounded-md">
                                <div>
                                  <p className="font-medium">{signer.name}</p>
                                  <p className="text-xs text-muted-foreground">{signer.email}</p>
                                </div>
                                <Badge variant="outline">Signer {idx + 1}</Badge>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      
                      {/* Fields section */}
                      {(selectedDocument.dataJson as Record<string, any>).fields && (
                        <div className="space-y-2">
                          <h4 className="font-semibold text-sm flex items-center gap-2">
                            <FileText className="h-4 w-4" />
                            Signature Fields ({((selectedDocument.dataJson as Record<string, any>).fields as Array<any>).length})
                          </h4>
                          <div className="grid gap-1">
                            {((selectedDocument.dataJson as Record<string, any>).fields as Array<{id: string; fieldType: string; page: number; signerId: string}>).map((field, idx) => {
                              const signers = (selectedDocument.dataJson as Record<string, any>).signers as Array<{id: string; name: string}> || [];
                              const signer = signers.find(s => s.id === field.signerId);
                              return (
                                <div key={field.id || idx} className="flex items-center justify-between text-xs p-2 bg-muted/30 rounded">
                                  <span className="capitalize">{field.fieldType}</span>
                                  <span className="text-muted-foreground">Page {field.page}</span>
                                  <span className="text-muted-foreground">{signer?.name || field.signerId}</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}

                {/* Signing URL */}
                {selectedDocument.status !== "completed" && (
                  <div className="space-y-2">
                    <Label>Signing URL</Label>
                    <div className="flex gap-2">
                      <Input
                        readOnly
                        value={`${window.location.origin}/d/${selectedDocument.id}?token=${selectedDocument.signingToken}`}
                        className="font-mono text-xs"
                        data-testid="input-signing-url"
                      />
                      <Button
                        size="icon"
                        variant="outline"
                        onClick={() => handleCopyUrl(`${window.location.origin}/d/${selectedDocument.id}?token=${selectedDocument.signingToken}`)}
                        data-testid="button-copy-url"
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}

                {/* Email Notifications */}
                {selectedDocument.status !== "completed" && (() => {
                  const docSigners = (selectedDocument.dataJson as Record<string, any>)?.signers as Array<{id: string; name: string; email: string; status?: string}> || [];
                  const hasSigners = docSigners.length > 0;
                  
                  return (
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <Send className="h-4 w-4" />
                          Send Email Notification
                        </CardTitle>
                        <CardDescription>
                          Send a signature request or reminder to a signer
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        {hasSigners ? (
                          <>
                            <div className="space-y-1">
                              <Label htmlFor="signer-select">Select Signer</Label>
                              <Select
                                value={emailRecipient}
                                onValueChange={(value) => {
                                  setEmailRecipient(value);
                                  const signer = docSigners.find(s => s.email === value);
                                  setEmailRecipientName(signer?.name || "");
                                }}
                              >
                                <SelectTrigger id="signer-select" data-testid="select-signer">
                                  <SelectValue placeholder="Choose a signer..." />
                                </SelectTrigger>
                                <SelectContent>
                                  {docSigners.map((signer) => (
                                    <SelectItem key={signer.id} value={signer.email}>
                                      {signer.name} ({signer.email})
                                      {signer.status === "signed" && " - Signed"}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="flex gap-2 flex-wrap">
                              <Button
                                onClick={() => handleSendEmail(selectedDocument.id, "signature_request")}
                                disabled={isSendingEmail || !emailRecipient}
                                data-testid="button-send-signature-request"
                              >
                                {isSendingEmail ? (
                                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                ) : (
                                  <Send className="h-4 w-4 mr-2" />
                                )}
                                Send Signature Request
                              </Button>
                              {selectedDocument.status === "sent" && (
                                <Button
                                  variant="outline"
                                  onClick={() => handleSendEmail(selectedDocument.id, "reminder")}
                                  disabled={isSendingEmail || !emailRecipient}
                                  data-testid="button-send-reminder"
                                >
                                  {isSendingEmail ? (
                                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                  ) : (
                                    <RefreshCw className="h-4 w-4 mr-2" />
                                  )}
                                  Send Reminder
                                </Button>
                              )}
                            </div>
                          </>
                        ) : (
                          <div className="grid gap-3">
                            <div className="space-y-1">
                              <Label htmlFor="email-recipient">Recipient Email</Label>
                              <Input
                                id="email-recipient"
                                type="email"
                                placeholder="signer@example.com"
                                value={emailRecipient}
                                onChange={(e) => setEmailRecipient(e.target.value)}
                                data-testid="input-email-recipient"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label htmlFor="email-name">Recipient Name (optional)</Label>
                              <Input
                                id="email-name"
                                type="text"
                                placeholder="John Doe"
                                value={emailRecipientName}
                                onChange={(e) => setEmailRecipientName(e.target.value)}
                                data-testid="input-email-name"
                              />
                            </div>
                            <Button
                              onClick={() => handleSendEmail(selectedDocument.id, "signature_request")}
                              disabled={isSendingEmail || !emailRecipient}
                              data-testid="button-send-signature-request"
                            >
                              {isSendingEmail ? (
                                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                              ) : (
                                <Send className="h-4 w-4 mr-2" />
                              )}
                              Send Signature Request
                            </Button>
                          </div>
                        )}
                        <p className="text-xs text-muted-foreground">
                          Note: In development mode, emails are logged to the server console instead of being sent.
                        </p>
                      </CardContent>
                    </Card>
                  );
                })()}

                {/* SHA-256 for completed docs */}
                {selectedDocument.signedPdfSha256 && (
                  <div className="space-y-2">
                    <Label>Signed PDF SHA-256</Label>
                    <p className="text-xs font-mono bg-muted p-2 rounded-md break-all">
                      {selectedDocument.signedPdfSha256}
                    </p>
                  </div>
                )}

                {/* Audit Events */}
                {selectedDocument.auditEvents && selectedDocument.auditEvents.length > 0 && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Audit Trail</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {selectedDocument.auditEvents.map((event) => {
                          const meta = event.metaJson as Record<string, any> | null;
                          const signerEmail = meta?.signerEmail;
                          const signerRole = meta?.signerRole;
                          const orderIndex = meta?.orderIndex;
                          
                          // Get signer name from document signers if available
                          const signers = (selectedDocument.dataJson as Record<string, any>)?.signers as Array<{id: string; name: string; email: string}> || [];
                          const signer = signers.find(s => s.email === signerEmail || s.id === signerRole);
                          
                          return (
                            <div key={event.id} className="flex justify-between items-start text-sm border-b pb-2 last:border-0">
                              <div>
                                <span className="font-medium">{event.event.replace(/_/g, " ")}</span>
                                {(signer || signerEmail) && (
                                  <p className="text-xs text-muted-foreground">
                                    {signer?.name || signerEmail}
                                    {orderIndex !== undefined && ` (Signer ${orderIndex + 1})`}
                                  </p>
                                )}
                                <p className="text-xs text-muted-foreground">
                                  IP: {event.ip || "N/A"}
                                </p>
                              </div>
                              <span className="text-xs text-muted-foreground whitespace-nowrap">
                                {formatDate(event.createdAt)}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
