import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { RichTextEditor } from "@/components/rich-text-editor";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { BookOpen, Plus, Pencil, Trash2, Eye, EyeOff, Loader2, GripVertical } from "lucide-react";

interface UserGuide {
  id: string;
  title: string;
  slug: string;
  content: string;
  sortOrder: number;
  published: boolean;
  createdAt: string;
  updatedAt: string;
}

interface GuideFormData {
  title: string;
  slug: string;
  content: string;
  sortOrder: number;
  published: boolean;
}

export function GuidesManagement() {
  const { toast } = useToast();
  const [editingGuide, setEditingGuide] = useState<UserGuide | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [deleteGuide, setDeleteGuide] = useState<UserGuide | null>(null);
  const [formData, setFormData] = useState<GuideFormData>({
    title: "",
    slug: "",
    content: "",
    sortOrder: 0,
    published: true,
  });

  const { data: guides, isLoading } = useQuery<UserGuide[]>({
    queryKey: ["/api/admin/guides"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: GuideFormData) => {
      return apiRequest("POST", "/api/admin/guides", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/guides"] });
      queryClient.invalidateQueries({ queryKey: ["/api/guides"] });
      setIsCreateDialogOpen(false);
      resetForm();
      toast({ title: "Guide created successfully" });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to create guide",
        description: error.message || "An error occurred",
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<GuideFormData> }) => {
      return apiRequest("PATCH", `/api/admin/guides/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/guides"] });
      queryClient.invalidateQueries({ queryKey: ["/api/guides"] });
      setEditingGuide(null);
      resetForm();
      toast({ title: "Guide updated successfully" });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to update guide",
        description: error.message || "An error occurred",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/admin/guides/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/guides"] });
      queryClient.invalidateQueries({ queryKey: ["/api/guides"] });
      setDeleteGuide(null);
      toast({ title: "Guide deleted successfully" });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to delete guide",
        description: error.message || "An error occurred",
        variant: "destructive",
      });
    },
  });

  const togglePublishedMutation = useMutation({
    mutationFn: async ({ id, published }: { id: string; published: boolean }) => {
      return apiRequest("PATCH", `/api/admin/guides/${id}`, { published });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/guides"] });
      queryClient.invalidateQueries({ queryKey: ["/api/guides"] });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to update guide",
        description: error.message || "An error occurred",
        variant: "destructive",
      });
    },
  });

  const resetForm = () => {
    setFormData({
      title: "",
      slug: "",
      content: "",
      sortOrder: guides ? guides.length : 0,
      published: true,
    });
  };

  const handleTitleChange = (title: string) => {
    const slug = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    setFormData((prev) => ({
      ...prev,
      title,
      slug: editingGuide ? prev.slug : slug,
    }));
  };

  const openCreateDialog = () => {
    resetForm();
    setFormData((prev) => ({
      ...prev,
      sortOrder: guides ? guides.length : 0,
    }));
    setIsCreateDialogOpen(true);
  };

  const openEditDialog = (guide: UserGuide) => {
    setFormData({
      title: guide.title,
      slug: guide.slug,
      content: guide.content,
      sortOrder: guide.sortOrder,
      published: guide.published,
    });
    setEditingGuide(guide);
  };

  const handleSubmit = () => {
    if (!formData.title.trim() || !formData.slug.trim() || !formData.content.trim()) {
      toast({
        title: "Validation error",
        description: "Title, slug, and content are required",
        variant: "destructive",
      });
      return;
    }

    if (editingGuide) {
      updateMutation.mutate({ id: editingGuide.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-10 w-32" />
        </div>
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <BookOpen className="h-6 w-6 text-primary" />
          <h2 className="text-xl font-semibold">User Guides</h2>
          <Badge variant="secondary">{guides?.length || 0} guides</Badge>
        </div>
        <Button onClick={openCreateDialog} data-testid="button-create-guide">
          <Plus className="h-4 w-4 mr-2" />
          Create Guide
        </Button>
      </div>

      {guides && guides.length > 0 ? (
        <div className="space-y-3">
          {guides.map((guide) => (
            <Card key={guide.id} data-testid={`card-admin-guide-${guide.id}`}>
              <CardContent className="flex items-center justify-between gap-4 py-4">
                <div className="flex items-center gap-4 flex-1 min-w-0">
                  <GripVertical className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium truncate" data-testid={`text-admin-guide-title-${guide.id}`}>
                        {guide.title}
                      </span>
                      {guide.published ? (
                        <Badge variant="default" className="flex-shrink-0">
                          <Eye className="h-3 w-3 mr-1" />
                          Published
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="flex-shrink-0">
                          <EyeOff className="h-3 w-3 mr-1" />
                          Draft
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground truncate">
                      /{guide.slug}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Switch
                    checked={guide.published}
                    onCheckedChange={(checked) =>
                      togglePublishedMutation.mutate({ id: guide.id, published: checked })
                    }
                    data-testid={`switch-guide-published-${guide.id}`}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => openEditDialog(guide)}
                    data-testid={`button-edit-guide-${guide.id}`}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setDeleteGuide(guide)}
                    data-testid={`button-delete-guide-${guide.id}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="py-8 text-center">
            <BookOpen className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No guides yet</h3>
            <p className="text-muted-foreground mb-4">
              Create your first user guide to help users understand the platform.
            </p>
            <Button onClick={openCreateDialog} data-testid="button-create-first-guide">
              <Plus className="h-4 w-4 mr-2" />
              Create First Guide
            </Button>
          </CardContent>
        </Card>
      )}

      <Dialog open={isCreateDialogOpen || !!editingGuide} onOpenChange={(open) => {
        if (!open) {
          setIsCreateDialogOpen(false);
          setEditingGuide(null);
          resetForm();
        }
      }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingGuide ? "Edit Guide" : "Create New Guide"}
            </DialogTitle>
            <DialogDescription>
              {editingGuide
                ? "Update the guide content and settings."
                : "Create a new user guide. Guides help users understand how to use the platform."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="guide-title">Title</Label>
              <Input
                id="guide-title"
                value={formData.title}
                onChange={(e) => handleTitleChange(e.target.value)}
                placeholder="Getting Started"
                data-testid="input-guide-title"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="guide-slug">URL Slug</Label>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">/guides/</span>
                <Input
                  id="guide-slug"
                  value={formData.slug}
                  onChange={(e) => setFormData((prev) => ({ ...prev, slug: e.target.value }))}
                  placeholder="getting-started"
                  data-testid="input-guide-slug"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Content</Label>
              <RichTextEditor
                value={formData.content}
                onChange={(content) => setFormData((prev) => ({ ...prev, content }))}
                placeholder="Write your guide content here..."
                data-testid="editor-guide-content"
              />
              <p className="text-sm text-muted-foreground">
                Select text and use the toolbar or Ctrl+B, Ctrl+I, Ctrl+U for formatting.
              </p>
            </div>
            <div className="flex items-center gap-4">
              <div className="space-y-2">
                <Label htmlFor="guide-sort-order">Sort Order</Label>
                <Input
                  id="guide-sort-order"
                  type="number"
                  value={formData.sortOrder}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, sortOrder: parseInt(e.target.value) || 0 }))
                  }
                  className="w-24"
                  data-testid="input-guide-sort-order"
                />
              </div>
              <div className="flex items-center gap-2 pt-6">
                <Switch
                  id="guide-published"
                  checked={formData.published}
                  onCheckedChange={(checked) =>
                    setFormData((prev) => ({ ...prev, published: checked }))
                  }
                  data-testid="switch-guide-form-published"
                />
                <Label htmlFor="guide-published">Published</Label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsCreateDialogOpen(false);
                setEditingGuide(null);
                resetForm();
              }}
              data-testid="button-cancel-guide"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={createMutation.isPending || updateMutation.isPending}
              data-testid="button-save-guide"
            >
              {(createMutation.isPending || updateMutation.isPending) && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              {editingGuide ? "Save Changes" : "Create Guide"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteGuide} onOpenChange={(open) => !open && setDeleteGuide(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Guide</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deleteGuide?.title}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-guide">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteGuide && deleteMutation.mutate(deleteGuide.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete-guide"
            >
              {deleteMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
