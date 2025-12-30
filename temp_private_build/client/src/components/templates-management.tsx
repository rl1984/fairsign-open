import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Loader2, Plus, FileCode, Edit, Trash2, Eye, Code, FileText, Upload, Settings, X, GripVertical, Type, PenTool, CheckSquare, Maximize, Calendar, Edit3, AlignLeft, Hash, Send, User, Mail } from "lucide-react";
import type { Template, TemplateField } from "@shared/schema";
import * as pdfjsLib from "pdfjs-dist";

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

type FieldType = "text" | "signature" | "initial" | "date" | "checkbox";
type InputMode = "any" | "text" | "numeric";

interface PlacedField {
  id: string;
  apiTag: string;
  fieldType: FieldType;
  label: string;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  signerRole: string;
  required: boolean;
  fontSize: number;
  fontColor: string;
  inputMode?: InputMode;
  placeholder?: string;
  creatorFills?: boolean;
}

export function TemplatesManagement() {
  const { toast } = useToast();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isPdfUploadOpen, setIsPdfUploadOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [viewingTemplate, setViewingTemplate] = useState<Template | null>(null);
  const [editingFieldsTemplate, setEditingFieldsTemplate] = useState<Template | null>(null);
  const [creatingDocumentFromTemplate, setCreatingDocumentFromTemplate] = useState<Template | null>(null);

  const { data: templates, isLoading } = useQuery<Template[]>({
    queryKey: ["/api/admin/templates"],
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

  const uploadPdfMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      const res = await fetch("/api/admin/templates/pdf", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to upload PDF");
      }
      return res.json();
    },
    onSuccess: (template) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/templates"] });
      setIsPdfUploadOpen(false);
      setEditingFieldsTemplate(template);
      toast({ title: "PDF uploaded", description: "Now configure the form fields for your template." });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to upload PDF", variant: "destructive" });
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold" data-testid="text-templates-title">Templates</h2>
          <p className="text-sm text-muted-foreground">Create and manage document templates</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" onClick={() => setIsPdfUploadOpen(true)} data-testid="button-upload-pdf">
            <Upload className="h-4 w-4 mr-2" />
            Upload PDF
          </Button>
          <Button onClick={() => setIsCreateDialogOpen(true)} data-testid="button-create-template">
            <Plus className="h-4 w-4 mr-2" />
            New HTML Template
          </Button>
        </div>
      </div>

      {templates?.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FileCode className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground mb-4">No templates yet</p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setIsPdfUploadOpen(true)} data-testid="button-upload-first-pdf">
                <Upload className="h-4 w-4 mr-2" />
                Upload PDF
              </Button>
              <Button onClick={() => setIsCreateDialogOpen(true)} data-testid="button-create-first-template">
                <Plus className="h-4 w-4 mr-2" />
                Create HTML Template
              </Button>
            </div>
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
                  <div className="flex items-center gap-1">
                    {template.templateType === "pdf" ? (
                      <Badge variant="outline">PDF</Badge>
                    ) : (
                      <Badge variant="outline">HTML</Badge>
                    )}
                    {template.isDefault && (
                      <Badge variant="secondary">Default</Badge>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3 flex-wrap">
                  {template.templateType === "pdf" ? (
                    <span>{template.pageCount || 0} pages</span>
                  ) : (
                    <span>{(template.placeholders as string[])?.length || 0} placeholders</span>
                  )}
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
                  {template.templateType === "pdf" && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setEditingFieldsTemplate(template)}
                        data-testid={`button-configure-fields-${template.id}`}
                      >
                        <Settings className="h-4 w-4 mr-1" />
                        Fields
                      </Button>
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => setCreatingDocumentFromTemplate(template)}
                        data-testid={`button-create-document-${template.id}`}
                      >
                        <Send className="h-4 w-4 mr-1" />
                        Create
                      </Button>
                    </>
                  )}
                  {!template.isDefault && (
                    <>
                      {template.templateType === "html" && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setEditingTemplate(template)}
                          data-testid={`button-edit-template-${template.id}`}
                        >
                          <Edit className="h-4 w-4 mr-1" />
                          Edit
                        </Button>
                      )}
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

      <CreateTemplateDialog
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
        onSubmit={(data) => createMutation.mutate(data)}
        isPending={createMutation.isPending}
      />

      <UploadPdfDialog
        open={isPdfUploadOpen}
        onOpenChange={setIsPdfUploadOpen}
        onSubmit={(formData) => uploadPdfMutation.mutate(formData)}
        isPending={uploadPdfMutation.isPending}
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

      <PdfFieldEditorDialog
        template={editingFieldsTemplate}
        onOpenChange={(open) => !open && setEditingFieldsTemplate(null)}
      />

      <CreateDocumentFromTemplateDialog
        template={creatingDocumentFromTemplate}
        onOpenChange={(open) => !open && setCreatingDocumentFromTemplate(null)}
      />
    </div>
  );
}

function UploadPdfDialog({
  open,
  onOpenChange,
  onSubmit,
  isPending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (formData: FormData) => void;
  isPending: boolean;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;

    const formData = new FormData();
    formData.append("pdf", file);
    formData.append("name", name);
    formData.append("description", description);
    onSubmit(formData);
  };

  const handleClose = () => {
    setName("");
    setDescription("");
    setFile(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Upload PDF Template
          </DialogTitle>
          <DialogDescription>
            Upload a PDF file and configure form fields for signing.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="pdf-name">Template Name</Label>
            <Input
              id="pdf-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Standard Lease Agreement"
              required
              data-testid="input-pdf-template-name"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pdf-description">Description</Label>
            <Input
              id="pdf-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of this template"
              data-testid="input-pdf-template-description"
            />
          </div>
          <div className="space-y-2">
            <Label>PDF File</Label>
            <div
              className="border-2 border-dashed rounded-md p-6 text-center cursor-pointer hover-elevate"
              onClick={() => fileInputRef.current?.click()}
            >
              {file ? (
                <div className="flex items-center justify-center gap-2">
                  <FileText className="h-6 w-6 text-primary" />
                  <span className="text-sm">{file.name}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={(e) => {
                      e.stopPropagation();
                      setFile(null);
                    }}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <div>
                  <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">Click to select a PDF file</p>
                </div>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,application/pdf"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              data-testid="input-pdf-file"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending || !name || !file} data-testid="button-upload-pdf-submit">
              {isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  Upload
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
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

  useEffect(() => {
    if (template) {
      setName(template.name);
      setDescription(template.description || "");
      setHtmlContent(template.htmlContent || "");
    }
  }, [template]);

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
          {template?.templateType === "html" && (
            <div>
              <Label className="text-sm font-medium">HTML Content</Label>
              <pre className="mt-2 p-4 bg-muted rounded-md overflow-x-auto text-xs font-mono max-h-[400px] overflow-y-auto">
                {template?.htmlContent}
              </pre>
            </div>
          )}
          {template?.templateType === "pdf" && (
            <div>
              <Label className="text-sm font-medium">PDF Template</Label>
              <p className="text-sm text-muted-foreground mt-1">
                {template.pageCount} pages
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PdfFieldEditorDialog({
  template,
  onOpenChange,
}: {
  template: Template | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [fields, setFields] = useState<PlacedField[]>([]);
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [scale, setScale] = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [resizeCorner, setResizeCorner] = useState<string | null>(null);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [resizeStartGeometry, setResizeStartGeometry] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [fieldToolType, setFieldToolType] = useState<FieldType>("text");
  const [pageDimensions, setPageDimensions] = useState<{ width: number; height: number } | null>(null);
  const [canvasReady, setCanvasReady] = useState(false);
  const [renderScale, setRenderScale] = useState(2); // Higher resolution multiplier
  const [containerWidth, setContainerWidth] = useState<number | null>(null);
  const [autoFitEnabled, setAutoFitEnabled] = useState(true);

  const selectedField = fields.find((f) => f.id === selectedFieldId);

  // Track container width for auto-fit - use interval to wait for dialog mount
  useEffect(() => {
    if (!template) return;
    
    let observer: ResizeObserver | null = null;
    let rafId: number | null = null;
    
    const tryAttachObserver = () => {
      if (!containerRef.current) {
        // Retry until the dialog portal is mounted
        rafId = requestAnimationFrame(tryAttachObserver);
        return;
      }
      
      // Initialize container width immediately
      const initialWidth = containerRef.current.clientWidth - 32;
      if (initialWidth > 0) {
        setContainerWidth(initialWidth);
      }
      
      observer = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const width = entry.contentRect.width - 32; // Account for padding
          if (width > 0) {
            setContainerWidth(width);
          }
        }
      });
      
      observer.observe(containerRef.current);
    };
    
    tryAttachObserver();
    
    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      if (observer) observer.disconnect();
    };
  }, [template]);

  // Auto-fit scale when container width or page dimensions change
  useEffect(() => {
    if (!autoFitEnabled || !containerWidth || !pageDimensions) return;
    
    const fitScale = containerWidth / pageDimensions.width;
    const clampedScale = Math.min(Math.max(fitScale, 0.5), 2);
    setScale(clampedScale);
  }, [containerWidth, pageDimensions, autoFitEnabled]);

  const loadPdf = useCallback(async () => {
    if (!template) return;
    setIsLoading(true);
    setCanvasReady(false);
    setPageDimensions(null);
    setPdfDoc(null);
    
    try {
      // Use proxy endpoint to avoid CORS issues with S3
      const loadingTask = pdfjsLib.getDocument({
        url: `/api/admin/templates/${template.id}/pdf`,
        withCredentials: true,
      });
      const doc = await loadingTask.promise;
      setPdfDoc(doc);
      setCurrentPage(1);
    } catch (error: any) {
      console.error("Error loading PDF:", error);
      const message = error?.message || "Failed to load PDF";
      toast({ title: "Error", description: message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, [template, toast]);

  const loadFields = useCallback(async () => {
    if (!template) return;
    try {
      const res = await fetch(`/api/admin/templates/${template.id}/fields`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load fields");
      const data: TemplateField[] = await res.json();
      setFields(
        data.map((f) => ({
          id: f.id,
          apiTag: f.apiTag,
          fieldType: f.fieldType as FieldType,
          label: f.label || "",
          page: f.page,
          x: Number(f.x),
          y: Number(f.y),
          width: Number(f.width),
          height: Number(f.height),
          signerRole: f.signerRole || "tenant",
          required: f.required ?? true,
          fontSize: f.fontSize || 12,
          fontColor: f.fontColor || "#000000",
          inputMode: (f as any).inputMode as InputMode || "any",
          placeholder: (f as any).placeholder || "",
          creatorFills: (f as any).creatorFills || false,
        }))
      );
    } catch (error) {
      console.error("Error loading fields:", error);
    }
  }, [template]);

  useEffect(() => {
    if (template) {
      // Reset state for new template
      setScale(1);
      setAutoFitEnabled(true);
      setContainerWidth(null);
      setPageDimensions(null);
      loadPdf();
      loadFields();
    } else {
      setPdfDoc(null);
      setFields([]);
      setSelectedFieldId(null);
    }
  }, [template, loadPdf, loadFields]);

  // Intercept Ctrl+wheel to zoom just the PDF pane instead of browser zoom
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        setAutoFitEnabled(false);
        const delta = e.deltaY > 0 ? -0.1 : 0.1;
        setScale((s) => Math.min(3, Math.max(0.5, s + delta)));
      }
    };

    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => container.removeEventListener("wheel", handleWheel);
  }, [template]);

  const renderTaskRef = useRef<any>(null);

  const renderPage = useCallback(async () => {
    if (!pdfDoc || !canvasRef.current) return;

    // Cancel any previous render task
    if (renderTaskRef.current) {
      renderTaskRef.current.cancel();
      renderTaskRef.current = null;
    }

    setCanvasReady(false);
    const page = await pdfDoc.getPage(currentPage);
    const unscaledViewport = page.getViewport({ scale: 1 });
    setPageDimensions({ width: unscaledViewport.width, height: unscaledViewport.height });
    
    // Use higher resolution for sharper rendering
    const effectiveScale = scale * renderScale;
    const viewport = page.getViewport({ scale: effectiveScale });
    const displayViewport = page.getViewport({ scale });
    
    const canvas = canvasRef.current;
    const context = canvas.getContext("2d");

    if (!context) return;

    // Set canvas size for high DPI rendering
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    canvas.style.width = `${displayViewport.width}px`;
    canvas.style.height = `${displayViewport.height}px`;

    const renderTask = page.render({
      canvasContext: context,
      viewport,
      canvas,
    } as any);
    renderTaskRef.current = renderTask;
    
    try {
      await renderTask.promise;
      setCanvasReady(true);
    } catch (err: any) {
      // Ignore cancellation errors
      if (err?.name !== 'RenderingCancelledException') {
        console.error('PDF render error:', err);
      }
    }
    renderTaskRef.current = null;
  }, [pdfDoc, currentPage, scale, renderScale]);

  useEffect(() => {
    renderPage();
  }, [renderPage]);

  const handleCanvasClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!canvasRef.current || !canvasReady || !pageDimensions) return;

      const canvas = canvasRef.current;
      const rect = canvas.getBoundingClientRect();
      const cssX = e.clientX - rect.left;
      const cssY = e.clientY - rect.top;
      
      const x = (cssX / rect.width) * pageDimensions.width;
      const y = (cssY / rect.height) * pageDimensions.height;

      const clickedField = fields.find(
        (f) =>
          f.page === currentPage &&
          x >= f.x &&
          x <= f.x + f.width &&
          y >= f.y &&
          y <= f.y + f.height
      );

      if (clickedField) {
        setSelectedFieldId(clickedField.id);
      } else {
        const defaultSizes: Record<FieldType, { width: number; height: number }> = {
          text: { width: 150, height: 20 },
          signature: { width: 200, height: 50 },
          initial: { width: 100, height: 40 },
          date: { width: 120, height: 20 },
          checkbox: { width: 20, height: 20 },
        };

        const size = defaultSizes[fieldToolType];
        const newField: PlacedField = {
          id: `field_${Date.now()}`,
          apiTag: `field_${fields.length + 1}`,
          fieldType: fieldToolType,
          label: "",
          page: currentPage,
          x: x - size.width / 2,
          y: y - size.height / 2,
          width: size.width,
          height: size.height,
          signerRole: "tenant",
          required: true,
          fontSize: 12,
          fontColor: "#000000",
          inputMode: "any",
          placeholder: "",
          creatorFills: false,
        };

        setFields([...fields, newField]);
        setSelectedFieldId(newField.id);
      }
    },
    [fields, currentPage, pageDimensions, fieldToolType, canvasReady]
  );

  const handleFieldMouseDown = useCallback(
    (e: React.MouseEvent, fieldId: string) => {
      e.stopPropagation();
      setSelectedFieldId(fieldId);
      setIsDragging(true);
      setDragStart({ x: e.clientX, y: e.clientY });
    },
    []
  );

  const handleResizeMouseDown = useCallback(
    (e: React.MouseEvent, fieldId: string, corner: string) => {
      e.stopPropagation();
      const field = fields.find((f) => f.id === fieldId);
      if (!field) return;
      
      setSelectedFieldId(fieldId);
      setIsResizing(true);
      setResizeCorner(corner);
      setDragStart({ x: e.clientX, y: e.clientY });
      setResizeStartGeometry({ x: field.x, y: field.y, width: field.width, height: field.height });
    },
    [fields]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!canvasRef.current || !pageDimensions) return;
      
      const rect = canvasRef.current.getBoundingClientRect();
      const dx = ((e.clientX - dragStart.x) / rect.width) * pageDimensions.width;
      const dy = ((e.clientY - dragStart.y) / rect.height) * pageDimensions.height;

      if (isDragging && selectedFieldId) {
        setFields((prev) =>
          prev.map((f) =>
            f.id === selectedFieldId
              ? { ...f, x: Math.max(0, f.x + dx), y: Math.max(0, f.y + dy) }
              : f
          )
        );
        setDragStart({ x: e.clientX, y: e.clientY });
      } else if (isResizing && selectedFieldId && resizeCorner && resizeStartGeometry) {
        // Calculate total delta from initial resize start position
        const totalDx = ((e.clientX - dragStart.x) / rect.width) * pageDimensions.width;
        const totalDy = ((e.clientY - dragStart.y) / rect.height) * pageDimensions.height;
        
        setFields((prev) =>
          prev.map((f) => {
            if (f.id !== selectedFieldId) return f;
            
            let newX = resizeStartGeometry.x;
            let newY = resizeStartGeometry.y;
            let newWidth = resizeStartGeometry.width;
            let newHeight = resizeStartGeometry.height;
            
            if (resizeCorner.includes("e")) {
              newWidth = Math.max(20, resizeStartGeometry.width + totalDx);
            }
            if (resizeCorner.includes("w")) {
              const widthDelta = Math.min(totalDx, resizeStartGeometry.width - 20);
              newX = resizeStartGeometry.x + widthDelta;
              newWidth = resizeStartGeometry.width - widthDelta;
            }
            if (resizeCorner.includes("s")) {
              newHeight = Math.max(15, resizeStartGeometry.height + totalDy);
            }
            if (resizeCorner.includes("n")) {
              const heightDelta = Math.min(totalDy, resizeStartGeometry.height - 15);
              newY = resizeStartGeometry.y + heightDelta;
              newHeight = resizeStartGeometry.height - heightDelta;
            }
            
            return { ...f, x: newX, y: newY, width: newWidth, height: newHeight };
          })
        );
      }
    },
    [isDragging, isResizing, selectedFieldId, dragStart, pageDimensions, resizeCorner, resizeStartGeometry]
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    setIsResizing(false);
    setResizeCorner(null);
    setResizeStartGeometry(null);
  }, []);

  // Use window-level event listeners during drag/resize for proper pointer capture
  useEffect(() => {
    if (!isDragging && !isResizing) return;
    
    const handleWindowMouseMove = (e: MouseEvent) => {
      if (!canvasRef.current || !pageDimensions) return;
      
      const rect = canvasRef.current.getBoundingClientRect();
      const dx = ((e.clientX - dragStart.x) / rect.width) * pageDimensions.width;
      const dy = ((e.clientY - dragStart.y) / rect.height) * pageDimensions.height;

      if (isDragging && selectedFieldId) {
        setFields((prev) =>
          prev.map((f) =>
            f.id === selectedFieldId
              ? { ...f, x: Math.max(0, f.x + dx), y: Math.max(0, f.y + dy) }
              : f
          )
        );
        setDragStart({ x: e.clientX, y: e.clientY });
      } else if (isResizing && selectedFieldId && resizeCorner && resizeStartGeometry) {
        const totalDx = ((e.clientX - dragStart.x) / rect.width) * pageDimensions.width;
        const totalDy = ((e.clientY - dragStart.y) / rect.height) * pageDimensions.height;
        
        setFields((prev) =>
          prev.map((f) => {
            if (f.id !== selectedFieldId) return f;
            
            let newX = resizeStartGeometry.x;
            let newY = resizeStartGeometry.y;
            let newWidth = resizeStartGeometry.width;
            let newHeight = resizeStartGeometry.height;
            
            if (resizeCorner.includes("e")) {
              newWidth = Math.max(20, resizeStartGeometry.width + totalDx);
            }
            if (resizeCorner.includes("w")) {
              const widthDelta = Math.min(totalDx, resizeStartGeometry.width - 20);
              newX = resizeStartGeometry.x + widthDelta;
              newWidth = resizeStartGeometry.width - widthDelta;
            }
            if (resizeCorner.includes("s")) {
              newHeight = Math.max(15, resizeStartGeometry.height + totalDy);
            }
            if (resizeCorner.includes("n")) {
              const heightDelta = Math.min(totalDy, resizeStartGeometry.height - 15);
              newY = resizeStartGeometry.y + heightDelta;
              newHeight = resizeStartGeometry.height - heightDelta;
            }
            
            return { ...f, x: newX, y: newY, width: newWidth, height: newHeight };
          })
        );
      }
    };

    const handleWindowMouseUp = () => {
      setIsDragging(false);
      setIsResizing(false);
      setResizeCorner(null);
      setResizeStartGeometry(null);
    };

    window.addEventListener("mousemove", handleWindowMouseMove);
    window.addEventListener("mouseup", handleWindowMouseUp);
    
    return () => {
      window.removeEventListener("mousemove", handleWindowMouseMove);
      window.removeEventListener("mouseup", handleWindowMouseUp);
    };
  }, [isDragging, isResizing, selectedFieldId, dragStart, pageDimensions, resizeCorner, resizeStartGeometry]);

  const updateSelectedField = useCallback(
    (updates: Partial<PlacedField>) => {
      if (!selectedFieldId) return;
      setFields((prev) =>
        prev.map((f) => (f.id === selectedFieldId ? { ...f, ...updates } : f))
      );
    },
    [selectedFieldId]
  );

  const deleteSelectedField = useCallback(() => {
    if (!selectedFieldId) return;
    setFields((prev) => prev.filter((f) => f.id !== selectedFieldId));
    setSelectedFieldId(null);
  }, [selectedFieldId]);

  const saveFields = async () => {
    if (!template) return;
    setIsSaving(true);
    try {
      const res = await apiRequest("PUT", `/api/admin/templates/${template.id}/fields`, {
        fields: fields.map((f) => ({
          apiTag: f.apiTag,
          fieldType: f.fieldType,
          label: f.label,
          page: f.page,
          x: f.x,
          y: f.y,
          width: f.width,
          height: f.height,
          signerRole: f.signerRole,
          required: f.required,
          fontSize: f.fontSize,
          fontColor: f.fontColor,
          inputMode: f.inputMode,
          placeholder: f.placeholder,
          creatorFills: f.creatorFills,
        })),
      });

      if (!res.ok) throw new Error("Failed to save fields");

      queryClient.invalidateQueries({ queryKey: ["/api/admin/templates"] });
      toast({ title: "Fields saved", description: "Template fields have been updated." });
      onOpenChange(false);
    } catch (error) {
      toast({ title: "Error", description: "Failed to save fields", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const getFieldColor = (fieldType: FieldType) => {
    switch (fieldType) {
      case "signature":
        return "border-blue-500 bg-blue-500/10";
      case "initial":
        return "border-purple-500 bg-purple-500/10";
      case "date":
        return "border-cyan-500 bg-cyan-500/10";
      case "checkbox":
        return "border-green-500 bg-green-500/10";
      default:
        return "border-orange-500 bg-orange-500/10";
    }
  };

  const getFieldIcon = (fieldType: FieldType) => {
    switch (fieldType) {
      case "signature":
        return <PenTool className="h-3 w-3" />;
      case "initial":
        return <Edit3 className="h-3 w-3" />;
      case "date":
        return <Calendar className="h-3 w-3" />;
      case "checkbox":
        return <CheckSquare className="h-3 w-3" />;
      default:
        return <Type className="h-3 w-3" />;
    }
  };

  const currentPageFields = fields.filter((f) => f.page === currentPage);

  return (
    <Dialog open={!!template} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl h-[90vh] p-0 overflow-hidden">
        <div className="flex flex-col h-full">
          <DialogHeader className="p-4 border-b">
            <DialogTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Configure Fields - {template?.name}
            </DialogTitle>
            <DialogDescription>
              Click on the PDF to place form fields. Drag to move, use corner handles to resize.
            </DialogDescription>
          </DialogHeader>

          <ResizablePanelGroup direction="horizontal" className="flex-1">
            <ResizablePanel defaultSize={70} minSize={40} className="min-w-0">
              <div 
                ref={containerRef}
                className="h-full overflow-auto bg-muted/50 p-4"
              >
                {isLoading ? (
                  <div className="flex items-center justify-center h-full">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <div className="relative inline-block">
                    <canvas
                      ref={canvasRef}
                      className="block shadow-lg"
                      onClick={handleCanvasClick}
                      data-testid="canvas-pdf-preview"
                    />
                  {canvasReady && pageDimensions && currentPageFields.map((field) => {
                    const canvas = canvasRef.current;
                    if (!canvas) return null;
                    const rect = canvas.getBoundingClientRect();
                    const scaleX = rect.width / pageDimensions.width;
                    const scaleY = rect.height / pageDimensions.height;
                    const isSelected = field.id === selectedFieldId;
                    return (
                      <div
                        key={field.id}
                        className={`absolute border-2 cursor-move ${getFieldColor(field.fieldType)} ${
                          isSelected ? "ring-2 ring-primary" : ""
                        }`}
                        style={{
                          left: field.x * scaleX,
                          top: field.y * scaleY,
                          width: field.width * scaleX,
                          height: field.height * scaleY,
                        }}
                        onMouseDown={(e) => handleFieldMouseDown(e, field.id)}
                        data-testid={`field-${field.id}`}
                      >
                        <div className="absolute -top-5 left-0 text-xs bg-background px-1 rounded shadow flex items-center gap-1">
                          {getFieldIcon(field.fieldType)}
                          <span>{field.apiTag}</span>
                          {field.creatorFills && (
                            <Badge variant="secondary" className="text-[10px] px-1 py-0">
                              Creator
                            </Badge>
                          )}
                        </div>
                        {/* Show label or placeholder inside field for text/date fields */}
                        {(field.fieldType === "text" || field.fieldType === "date") && (field.label || field.placeholder) && (
                          <div className="absolute inset-0 flex items-center px-1 overflow-hidden pointer-events-none z-10 bg-white/70 dark:bg-black/50 rounded-sm">
                            <span className="text-[10px] text-gray-700 dark:text-gray-200 truncate font-medium leading-tight">
                              {field.label || field.placeholder}
                            </span>
                          </div>
                        )}
                        {/* Resize handles - only show when selected */}
                        {isSelected && (
                          <>
                            {/* Corner handles */}
                            <div
                              className="absolute w-3 h-3 bg-primary border border-background rounded-sm cursor-nw-resize"
                              style={{ top: -6, left: -6 }}
                              onMouseDown={(e) => handleResizeMouseDown(e, field.id, "nw")}
                            />
                            <div
                              className="absolute w-3 h-3 bg-primary border border-background rounded-sm cursor-ne-resize"
                              style={{ top: -6, right: -6 }}
                              onMouseDown={(e) => handleResizeMouseDown(e, field.id, "ne")}
                            />
                            <div
                              className="absolute w-3 h-3 bg-primary border border-background rounded-sm cursor-sw-resize"
                              style={{ bottom: -6, left: -6 }}
                              onMouseDown={(e) => handleResizeMouseDown(e, field.id, "sw")}
                            />
                            <div
                              className="absolute w-3 h-3 bg-primary border border-background rounded-sm cursor-se-resize"
                              style={{ bottom: -6, right: -6 }}
                              onMouseDown={(e) => handleResizeMouseDown(e, field.id, "se")}
                            />
                            {/* Edge handles */}
                            <div
                              className="absolute w-3 h-2 bg-primary border border-background rounded-sm cursor-n-resize"
                              style={{ top: -5, left: "50%", transform: "translateX(-50%)" }}
                              onMouseDown={(e) => handleResizeMouseDown(e, field.id, "n")}
                            />
                            <div
                              className="absolute w-3 h-2 bg-primary border border-background rounded-sm cursor-s-resize"
                              style={{ bottom: -5, left: "50%", transform: "translateX(-50%)" }}
                              onMouseDown={(e) => handleResizeMouseDown(e, field.id, "s")}
                            />
                            <div
                              className="absolute w-2 h-3 bg-primary border border-background rounded-sm cursor-w-resize"
                              style={{ left: -5, top: "50%", transform: "translateY(-50%)" }}
                              onMouseDown={(e) => handleResizeMouseDown(e, field.id, "w")}
                            />
                            <div
                              className="absolute w-2 h-3 bg-primary border border-background rounded-sm cursor-e-resize"
                              style={{ right: -5, top: "50%", transform: "translateY(-50%)" }}
                              onMouseDown={(e) => handleResizeMouseDown(e, field.id, "e")}
                            />
                          </>
                        )}
                      </div>
                    );
                  })}
                  </div>
                )}
              </div>
            </ResizablePanel>

            <ResizableHandle withHandle data-testid="handle-field-editor-split" />

            <ResizablePanel defaultSize={30} minSize={20} maxSize={50}>
              <div className="h-full overflow-y-auto bg-background">
              <div className="p-4 space-y-4">
                <div className="space-y-2">
                  <Label>Field Tool</Label>
                  <div className="flex gap-1 flex-wrap">
                    <Button
                      variant={fieldToolType === "signature" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setFieldToolType("signature")}
                      data-testid="button-tool-signature"
                    >
                      <PenTool className="h-4 w-4 mr-1" />
                      Signature
                    </Button>
                    <Button
                      variant={fieldToolType === "initial" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setFieldToolType("initial")}
                      data-testid="button-tool-initial"
                    >
                      <Edit3 className="h-4 w-4 mr-1" />
                      Initial
                    </Button>
                    <Button
                      variant={fieldToolType === "text" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setFieldToolType("text")}
                      data-testid="button-tool-text"
                    >
                      <Type className="h-4 w-4 mr-1" />
                      Text
                    </Button>
                    <Button
                      variant={fieldToolType === "date" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setFieldToolType("date")}
                      data-testid="button-tool-date"
                    >
                      <Calendar className="h-4 w-4 mr-1" />
                      Date
                    </Button>
                    <Button
                      variant={fieldToolType === "checkbox" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setFieldToolType("checkbox")}
                      data-testid="button-tool-checkbox"
                    >
                      <CheckSquare className="h-4 w-4 mr-1" />
                      Check
                    </Button>
                  </div>
                </div>

                {pdfDoc && (
                  <div className="space-y-2">
                    <Label>Page</Label>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={currentPage <= 1}
                        onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      >
                        Prev
                      </Button>
                      <span className="text-sm">
                        {currentPage} / {pdfDoc.numPages}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={currentPage >= pdfDoc.numPages}
                        onClick={() => setCurrentPage((p) => Math.min(pdfDoc.numPages, p + 1))}
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <Label>Zoom</Label>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setAutoFitEnabled(false);
                        setScale((s) => Math.max(0.5, s - 0.25));
                      }}
                    >
                      -
                    </Button>
                    <span className="text-sm w-16 text-center">{Math.round(scale * 100)}%</span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setAutoFitEnabled(false);
                        setScale((s) => Math.min(3, s + 0.25));
                      }}
                    >
                      +
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setAutoFitEnabled(false);
                        setScale(1);
                      }}
                    >
                      100%
                    </Button>
                    <Button
                      variant={autoFitEnabled ? "default" : "outline"}
                      size="sm"
                      onClick={() => setAutoFitEnabled(true)}
                      data-testid="button-fit-zoom"
                    >
                      <Maximize className="h-3 w-3 mr-1" />
                      Fit
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Resolution</Label>
                  <Select
                    value={renderScale.toString()}
                    onValueChange={(value) => setRenderScale(parseFloat(value))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">Standard (1x)</SelectItem>
                      <SelectItem value="2">High (2x)</SelectItem>
                      <SelectItem value="3">Ultra (3x)</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">Higher = sharper but slower</p>
                </div>

                {selectedField && (
                  <div className="space-y-4 border-t pt-4">
                    <div className="flex items-center justify-between">
                      <Label className="text-base font-semibold">Field Properties</Label>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={deleteSelectedField}
                        data-testid="button-delete-field"
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="apiTag">API Tag</Label>
                      <Input
                        id="apiTag"
                        value={selectedField.apiTag}
                        onChange={(e) => updateSelectedField({ apiTag: e.target.value })}
                        placeholder="e.g., tenant_name"
                        data-testid="input-field-api-tag"
                      />
                      <p className="text-xs text-muted-foreground">
                        Used to populate this field via API
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="label">Label</Label>
                      <Input
                        id="label"
                        value={selectedField.label}
                        onChange={(e) => updateSelectedField({ label: e.target.value })}
                        placeholder="Display label"
                        data-testid="input-field-label"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="signerRole">Signer Role</Label>
                      <Select
                        value={selectedField.signerRole}
                        onValueChange={(value) => updateSelectedField({ signerRole: value })}
                      >
                        <SelectTrigger data-testid="select-signer-role">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="landlord">Landlord</SelectItem>
                          <SelectItem value="tenant">Tenant</SelectItem>
                          <SelectItem value="witness">Witness</SelectItem>
                          <SelectItem value="guarantor">Guarantor</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="flex items-center justify-between">
                      <Label htmlFor="required">Required</Label>
                      <Switch
                        id="required"
                        checked={selectedField.required}
                        onCheckedChange={(checked) => updateSelectedField({ required: checked })}
                        data-testid="switch-field-required"
                      />
                    </div>

                    {(selectedField.fieldType === "text" || selectedField.fieldType === "date") && (
                      <>
                        {selectedField.fieldType === "text" && (
                          <div className="space-y-2">
                            <Label htmlFor="inputMode">Input Type</Label>
                            <Select
                              value={selectedField.inputMode || "any"}
                              onValueChange={(value: InputMode) => updateSelectedField({ inputMode: value })}
                            >
                              <SelectTrigger data-testid="select-input-mode">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="any">
                                  <div className="flex items-center gap-2">
                                    <AlignLeft className="h-3 w-3" />
                                    Any Input
                                  </div>
                                </SelectItem>
                                <SelectItem value="text">
                                  <div className="flex items-center gap-2">
                                    <Type className="h-3 w-3" />
                                    Text Only
                                  </div>
                                </SelectItem>
                                <SelectItem value="numeric">
                                  <div className="flex items-center gap-2">
                                    <Hash className="h-3 w-3" />
                                    Numbers Only
                                  </div>
                                </SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                        <div className="space-y-2">
                          <Label htmlFor="placeholder">Placeholder Text</Label>
                          <Input
                            id="placeholder"
                            value={selectedField.placeholder || ""}
                            onChange={(e) => updateSelectedField({ placeholder: e.target.value })}
                            placeholder="e.g., Enter your name..."
                            data-testid="input-field-placeholder"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="fontSize">Font Size</Label>
                          <Input
                            id="fontSize"
                            type="number"
                            value={selectedField.fontSize}
                            onChange={(e) =>
                              updateSelectedField({ fontSize: parseInt(e.target.value) || 12 })
                            }
                            data-testid="input-font-size"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="fontColor">Font Color</Label>
                          <Input
                            id="fontColor"
                            type="color"
                            value={selectedField.fontColor}
                            onChange={(e) => updateSelectedField({ fontColor: e.target.value })}
                            data-testid="input-font-color"
                          />
                        </div>
                        <div className="flex items-center gap-2 pt-2">
                          <Checkbox
                            id="creatorFills"
                            checked={selectedField.creatorFills || false}
                            onCheckedChange={(checked) => updateSelectedField({ creatorFills: !!checked })}
                            data-testid="checkbox-creator-fills"
                          />
                          <Label htmlFor="creatorFills" className="text-sm font-normal cursor-pointer">
                            Creator fills at document creation
                          </Label>
                        </div>
                      </>
                    )}

                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs">X Position</Label>
                        <Input
                          type="number"
                          value={Math.round(selectedField.x)}
                          onChange={(e) =>
                            updateSelectedField({ x: parseInt(e.target.value) || 0 })
                          }
                          data-testid="input-field-x"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Y Position</Label>
                        <Input
                          type="number"
                          value={Math.round(selectedField.y)}
                          onChange={(e) =>
                            updateSelectedField({ y: parseInt(e.target.value) || 0 })
                          }
                          data-testid="input-field-y"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs">Width</Label>
                        <Input
                          type="number"
                          value={Math.round(selectedField.width)}
                          onChange={(e) =>
                            updateSelectedField({ width: Math.max(20, parseInt(e.target.value) || 100) })
                          }
                          data-testid="input-field-width"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Height</Label>
                        <Input
                          type="number"
                          value={Math.round(selectedField.height)}
                          onChange={(e) =>
                            updateSelectedField({ height: Math.max(15, parseInt(e.target.value) || 20) })
                          }
                          data-testid="input-field-height"
                        />
                      </div>
                    </div>
                  </div>
                )}

                <div className="border-t pt-4">
                  <h4 className="text-sm font-semibold mb-2">All Fields ({fields.length})</h4>
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {fields.map((field) => (
                      <div
                        key={field.id}
                        className={`flex items-center gap-2 p-2 rounded cursor-pointer hover-elevate ${
                          field.id === selectedFieldId ? "bg-accent" : ""
                        }`}
                        onClick={() => {
                          setCurrentPage(field.page);
                          setSelectedFieldId(field.id);
                        }}
                      >
                        {getFieldIcon(field.fieldType)}
                        <span className="text-sm flex-1 truncate">{field.apiTag}</span>
                        <Badge variant="outline" className="text-xs">
                          P{field.page}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>

          <div className="p-4 border-t flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={saveFields} disabled={isSaving} data-testid="button-save-fields">
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Fields"
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface CreatorFieldValue {
  apiTag: string;
  label: string;
  fieldType: string;
  value: string;
  inputMode?: string;
  placeholder?: string;
}

interface SignerEntry {
  role: string;
  name: string;
  email: string;
}

function CreateDocumentFromTemplateDialog({
  template,
  onOpenChange,
}: {
  template: Template | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const [signers, setSigners] = useState<SignerEntry[]>([]);
  const [requiredRoles, setRequiredRoles] = useState<string[]>([]);
  const [creatorFieldValues, setCreatorFieldValues] = useState<Record<string, string>>({});
  const [creatorFields, setCreatorFields] = useState<CreatorFieldValue[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [sendEmail, setSendEmail] = useState(true);

  useEffect(() => {
    if (!template) {
      setCreatorFields([]);
      setCreatorFieldValues({});
      setSigners([]);
      setRequiredRoles([]);
      return;
    }

    const fetchFields = async () => {
      setIsLoading(true);
      try {
        const res = await fetch(`/api/admin/templates/${template.id}/fields`, {
          credentials: "include",
        });
        if (!res.ok) throw new Error("Failed to load fields");
        const fields: TemplateField[] = await res.json();
        
        // Get unique signer roles from non-creatorFills fields
        const roles = [...new Set(
          fields
            .filter((f: any) => !f.creatorFills)
            .map((f: any) => f.signerRole || "tenant")
        )];
        setRequiredRoles(roles);
        
        // Initialize signers for each role
        setSigners(roles.map(role => ({ role, name: "", email: "" })));
        
        const creatorFillFields = fields.filter((f: any) => f.creatorFills);
        setCreatorFields(
          creatorFillFields.map((f: any) => ({
            apiTag: f.apiTag,
            label: f.label || f.apiTag,
            fieldType: f.fieldType,
            value: "",
            inputMode: f.inputMode,
            placeholder: f.placeholder,
          }))
        );
        
        const initialValues: Record<string, string> = {};
        creatorFillFields.forEach((f: any) => {
          initialValues[f.apiTag] = "";
        });
        setCreatorFieldValues(initialValues);
      } catch (error) {
        console.error("Error loading fields:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchFields();
  }, [template]);

  const updateSigner = (role: string, field: "name" | "email", value: string) => {
    setSigners(prev => prev.map(s => s.role === role ? { ...s, [field]: value } : s));
  };

  const allSignersComplete = signers.every(s => s.name.trim() && s.email.trim());

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!template || !allSignersComplete) return;

    setIsSending(true);
    try {
      const res = await apiRequest("POST", "/api/admin/documents/from-template", {
        templateId: template.id,
        signers: signers.map((s, index) => ({ ...s, orderIndex: index })),
        creatorFieldValues,
        sendEmail,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create document");
      }

      const data = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/admin/documents"] });
      toast({
        title: "Document created",
        description: sendEmail 
          ? `Signing link has been sent to ${signers[0]?.name || "the first signer"}.` 
          : "Signing links have been generated.",
      });
      onOpenChange(false);
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setIsSending(false);
    }
  };

  const handleClose = () => {
    setSigners([]);
    setCreatorFieldValues({});
    onOpenChange(false);
  };

  return (
    <Dialog open={!!template} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-5 w-5" />
            Create Document from Template
          </DialogTitle>
          <DialogDescription>
            {template?.name} - Fill in the details below to create a document for signing.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center p-8">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
            <div className="space-y-4">
              <h4 className="text-sm font-semibold flex items-center gap-2">
                <User className="h-4 w-4" />
                {signers.length > 1 ? "Signers (in signing order)" : "Signer Details"}
              </h4>
              {signers.map((signer, index) => (
                <div key={signer.role} className="space-y-3 p-3 bg-muted/50 rounded-md">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="capitalize">
                      {index + 1}. {signer.role}
                    </Badge>
                    {index === 0 && signers.length > 1 && (
                      <span className="text-xs text-muted-foreground">(signs first)</span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label htmlFor={`signerName-${signer.role}`} className="text-xs">Name</Label>
                      <Input
                        id={`signerName-${signer.role}`}
                        value={signer.name}
                        onChange={(e) => updateSigner(signer.role, "name", e.target.value)}
                        placeholder="Enter name"
                        required
                        data-testid={`input-signer-name-${signer.role}`}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`signerEmail-${signer.role}`} className="text-xs">Email</Label>
                      <Input
                        id={`signerEmail-${signer.role}`}
                        type="email"
                        value={signer.email}
                        onChange={(e) => updateSigner(signer.role, "email", e.target.value)}
                        placeholder="Enter email"
                        required
                        data-testid={`input-signer-email-${signer.role}`}
                      />
                    </div>
                  </div>
                </div>
              ))}
              {signers.length === 0 && (
                <p className="text-sm text-muted-foreground">No signer roles found in this template.</p>
              )}
            </div>

            {creatorFields.length > 0 && (
              <div className="space-y-4 border-t pt-4">
                <h4 className="text-sm font-semibold">Pre-filled Fields</h4>
                <p className="text-xs text-muted-foreground">
                  These fields will be filled in by you and stamped onto the document before sending.
                </p>
                {creatorFields.map((field) => (
                  <div key={field.apiTag} className="space-y-2">
                    <Label htmlFor={field.apiTag}>{field.label}</Label>
                    {field.fieldType === "checkbox" ? (
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id={field.apiTag}
                          checked={creatorFieldValues[field.apiTag] === "true"}
                          onCheckedChange={(checked) =>
                            setCreatorFieldValues((prev) => ({
                              ...prev,
                              [field.apiTag]: checked ? "true" : "false",
                            }))
                          }
                          data-testid={`checkbox-creator-${field.apiTag}`}
                        />
                        <Label htmlFor={field.apiTag} className="font-normal cursor-pointer">
                          {field.placeholder || "Check if applicable"}
                        </Label>
                      </div>
                    ) : field.fieldType === "date" ? (
                      <Input
                        id={field.apiTag}
                        type="date"
                        value={creatorFieldValues[field.apiTag] || ""}
                        onChange={(e) =>
                          setCreatorFieldValues((prev) => ({
                            ...prev,
                            [field.apiTag]: e.target.value,
                          }))
                        }
                        data-testid={`input-creator-${field.apiTag}`}
                      />
                    ) : (
                      <Input
                        id={field.apiTag}
                        type={field.inputMode === "numeric" ? "number" : "text"}
                        value={creatorFieldValues[field.apiTag] || ""}
                        onChange={(e) =>
                          setCreatorFieldValues((prev) => ({
                            ...prev,
                            [field.apiTag]: e.target.value,
                          }))
                        }
                        placeholder={field.placeholder || `Enter ${field.label}`}
                        data-testid={`input-creator-${field.apiTag}`}
                      />
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-center gap-2 border-t pt-4">
              <Switch
                id="sendEmail"
                checked={sendEmail}
                onCheckedChange={setSendEmail}
                data-testid="switch-send-email"
              />
              <Label htmlFor="sendEmail" className="font-normal cursor-pointer">
                Send signing link via email
              </Label>
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSending || !allSignersComplete || signers.length === 0}>
                {isSending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4 mr-2" />
                    Create Document
                  </>
                )}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
