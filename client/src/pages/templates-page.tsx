import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { UserAvatar } from "@/components/user-avatar";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Loader2, Plus, FileCode, Edit, Trash2, Eye, Code, FileText, LayoutDashboard, LogOut } from "lucide-react";
import type { Template } from "@shared/schema";

export default function TemplatesPage() {
  const { toast } = useToast();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [viewingTemplate, setViewingTemplate] = useState<Template | null>(null);

  const { data: templates, isLoading } = useQuery<Template[]>({
    queryKey: ["/api/admin/templates"],
    enabled: isAuthenticated,
  });

  const createMutation = useMutation({
    mutationFn: async (data: { name: string; description: string; htmlContent: string }) => {
      const res = await apiRequest("POST", "/api/admin/templates", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/templates"] });
      setIsCreateDialogOpen(false);
      toast({ title: "Template created", description: "Your template has been saved." });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to create template", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...data }: { id: string; name?: string; description?: string; htmlContent?: string }) => {
      const res = await apiRequest("PATCH", `/api/admin/templates/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/templates"] });
      setEditingTemplate(null);
      toast({ title: "Template updated", description: "Your changes have been saved." });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to update template", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/admin/templates/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/templates"] });
      toast({ title: "Template deleted", description: "The template has been removed." });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to delete template", variant: "destructive" });
    },
  });

  const formatDate = (date: Date | string | null) => {
    if (!date) return "N/A";
    return new Date(date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  // If not authenticated, redirect to login
  if (!authLoading && !isAuthenticated) {
    window.location.href = "/";
    return null;
  }

  if (authLoading || isLoading) {
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
            <img src="/logo.png" alt="FairSign" className="h-8 w-8" />
            <div>
              <h1 className="text-lg font-semibold">Templates</h1>
              <p className="text-xs text-muted-foreground">Manage document templates</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => window.location.href = "/dashboard"}
              data-testid="button-nav-dashboard"
            >
              <LayoutDashboard className="h-4 w-4 mr-1" />
              Dashboard
            </Button>
            {user && (
              <div className="flex items-center gap-2">
                <UserAvatar user={user} />
                <span className="text-sm hidden sm:inline" data-testid="text-user-name">
                  {user.firstName} {user.lastName}
                </span>
              </div>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => window.location.href = "/api/logout"}
              data-testid="button-logout"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-6xl mx-auto p-4">
        <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
          <div>
            <h2 className="text-xl font-semibold" data-testid="text-page-title">Your Templates</h2>
            <p className="text-sm text-muted-foreground">Create and manage HTML templates for your documents</p>
          </div>
          <Button onClick={() => setIsCreateDialogOpen(true)} data-testid="button-create-template">
            <Plus className="h-4 w-4 mr-2" />
            New Template
          </Button>
        </div>

      {templates?.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FileCode className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground mb-4">No templates yet</p>
            <Button onClick={() => setIsCreateDialogOpen(true)} data-testid="button-create-first-template">
              <Plus className="h-4 w-4 mr-2" />
              Create Your First Template
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {templates?.map((template) => (
            <Card key={template.id} className="hover-elevate" data-testid={`card-template-${template.id}`}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-base truncate" data-testid={`text-template-name-${template.id}`}>
                      {template.name}
                    </CardTitle>
                    <CardDescription className="truncate">
                      {template.description || "No description"}
                    </CardDescription>
                  </div>
                  {template.isDefault && (
                    <Badge variant="secondary">Default</Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3 flex-wrap">
                  <span>{(template.placeholders as string[])?.length || 0} placeholders</span>
                  <span>Created {formatDate(template.createdAt)}</span>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setViewingTemplate(template)}
                    data-testid={`button-view-template-${template.id}`}
                  >
                    <Eye className="h-4 w-4 mr-1" />
                    View
                  </Button>
                  {!template.isDefault && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setEditingTemplate(template)}
                        data-testid={`button-edit-template-${template.id}`}
                      >
                        <Edit className="h-4 w-4 mr-1" />
                        Edit
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          if (confirm("Are you sure you want to delete this template?")) {
                            deleteMutation.mutate(template.id);
                          }
                        }}
                        data-testid={`button-delete-template-${template.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      </main>

      <CreateTemplateDialog
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
        onSubmit={(data) => createMutation.mutate(data)}
        isPending={createMutation.isPending}
      />

      <EditTemplateDialog
        template={editingTemplate}
        onOpenChange={(open) => !open && setEditingTemplate(null)}
        onSubmit={(data) => updateMutation.mutate({ id: editingTemplate!.id, ...data })}
        isPending={updateMutation.isPending}
      />

      <ViewTemplateDialog
        template={viewingTemplate}
        onOpenChange={(open) => !open && setViewingTemplate(null)}
      />
    </div>
  );
}

function CreateTemplateDialog({
  open,
  onOpenChange,
  onSubmit,
  isPending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: { name: string; description: string; htmlContent: string }) => void;
  isPending: boolean;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [htmlContent, setHtmlContent] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({ name, description, htmlContent });
  };

  const handleClose = () => {
    setName("");
    setDescription("");
    setHtmlContent("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileCode className="h-5 w-5" />
            Create Template
          </DialogTitle>
          <DialogDescription>
            Create a new HTML template for your documents. Use {"{{placeholder}}"} syntax for dynamic fields.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Template Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Residential Lease Agreement"
              required
              data-testid="input-template-name"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Input
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of this template"
              data-testid="input-template-description"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="htmlContent">HTML Content</Label>
            <Textarea
              id="htmlContent"
              value={htmlContent}
              onChange={(e) => setHtmlContent(e.target.value)}
              placeholder="<html>...</html>"
              className="font-mono text-sm min-h-[300px]"
              required
              data-testid="textarea-template-html"
            />
            <p className="text-xs text-muted-foreground">
              Use {"{{field_name}}"} for placeholders. Example: {"{{tenant_name}}"}, {"{{property_address}}"}
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending || !name || !htmlContent} data-testid="button-submit-template">
              {isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Template
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditTemplateDialog({
  template,
  onOpenChange,
  onSubmit,
  isPending,
}: {
  template: Template | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: { name?: string; description?: string; htmlContent?: string }) => void;
  isPending: boolean;
}) {
  const [name, setName] = useState(template?.name || "");
  const [description, setDescription] = useState(template?.description || "");
  const [htmlContent, setHtmlContent] = useState(template?.htmlContent || "");

  // Update state when template changes
  if (template && name !== template.name && !isPending) {
    setName(template.name);
    setDescription(template.description || "");
    setHtmlContent(template.htmlContent);
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({ name, description, htmlContent });
  };

  return (
    <Dialog open={!!template} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Edit className="h-5 w-5" />
            Edit Template
          </DialogTitle>
          <DialogDescription>
            Update your template content and placeholders.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-name">Template Name</Label>
            <Input
              id="edit-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              data-testid="input-edit-template-name"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-description">Description</Label>
            <Input
              id="edit-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              data-testid="input-edit-template-description"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-htmlContent">HTML Content</Label>
            <Textarea
              id="edit-htmlContent"
              value={htmlContent}
              onChange={(e) => setHtmlContent(e.target.value)}
              className="font-mono text-sm min-h-[300px]"
              required
              data-testid="textarea-edit-template-html"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending} data-testid="button-save-template">
              {isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Changes"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ViewTemplateDialog({
  template,
  onOpenChange,
}: {
  template: Template | null;
  onOpenChange: (open: boolean) => void;
}) {
  const placeholders = (template?.placeholders as string[]) || [];

  return (
    <Dialog open={!!template} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            {template?.name}
          </DialogTitle>
          <DialogDescription>
            {template?.description || "No description"}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {placeholders.length > 0 && (
            <div>
              <Label className="text-sm font-medium">Placeholders</Label>
              <div className="flex flex-wrap gap-2 mt-2">
                {placeholders.map((placeholder) => (
                  <Badge key={placeholder} variant="outline">
                    <Code className="h-3 w-3 mr-1" />
                    {placeholder}
                  </Badge>
                ))}
              </div>
            </div>
          )}
          <div>
            <Label className="text-sm font-medium">HTML Content</Label>
            <pre className="mt-2 p-4 bg-muted rounded-md overflow-x-auto text-xs font-mono max-h-[400px] overflow-y-auto">
              {template?.htmlContent}
            </pre>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
