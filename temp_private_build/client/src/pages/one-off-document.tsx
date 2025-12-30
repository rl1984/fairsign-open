import { useState, useRef, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Upload, ArrowLeft, Plus, Trash2, Type, PenTool, CheckSquare, Send, User, Mail, ChevronUp, ChevronDown, Calendar, Edit3, Hash, AlignLeft } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import * as pdfjsLib from "pdfjs-dist";

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

type FieldType = "text" | "signature" | "checkbox" | "date" | "initial";
type InputMode = "any" | "text" | "numeric";

interface Signer {
  id: string;
  name: string;
  email: string;
  color: string;
}

interface PlacedField {
  id: string;
  fieldType: FieldType;
  signerId: string;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  required: boolean;
  label?: string;
  inputMode?: InputMode;
  placeholder?: string;
  creatorFills?: boolean;
  creatorValue?: string;
}

const SIGNER_COLORS = [
  { bg: "bg-blue-500/20", border: "border-blue-500", text: "text-blue-700 dark:text-blue-300" },
  { bg: "bg-green-500/20", border: "border-green-500", text: "text-green-700 dark:text-green-300" },
  { bg: "bg-purple-500/20", border: "border-purple-500", text: "text-purple-700 dark:text-purple-300" },
  { bg: "bg-orange-500/20", border: "border-orange-500", text: "text-orange-700 dark:text-orange-300" },
  { bg: "bg-pink-500/20", border: "border-pink-500", text: "text-pink-700 dark:text-pink-300" },
];

export default function OneOffDocument() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [step, setStep] = useState<"upload" | "signers" | "fields">("upload");
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [documentTitle, setDocumentTitle] = useState("");
  const [signers, setSigners] = useState<Signer[]>([]);
  const [newSignerName, setNewSignerName] = useState("");
  const [newSignerEmail, setNewSignerEmail] = useState("");
  const [sendEmails, setSendEmails] = useState(true);
  const [isSending, setIsSending] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [fields, setFields] = useState<PlacedField[]>([]);
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [scale, setScale] = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [resizeCorner, setResizeCorner] = useState<string | null>(null);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [resizeStartGeometry, setResizeStartGeometry] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [fieldToolType, setFieldToolType] = useState<FieldType>("signature");
  const [selectedSignerIdForField, setSelectedSignerIdForField] = useState<string>("");
  const [pageDimensions, setPageDimensions] = useState<{ width: number; height: number } | null>(null);
  const [canvasReady, setCanvasReady] = useState(false);
  const [containerWidth, setContainerWidth] = useState<number | null>(null);
  const [autoFitEnabled, setAutoFitEnabled] = useState(true);

  const selectedField = fields.find((f) => f.id === selectedFieldId);

  useEffect(() => {
    if (step !== "fields") return;
    
    let observer: ResizeObserver | null = null;
    let rafId: number | null = null;
    
    const tryAttachObserver = () => {
      if (!containerRef.current) {
        rafId = requestAnimationFrame(tryAttachObserver);
        return;
      }
      
      const initialWidth = containerRef.current.clientWidth - 32;
      if (initialWidth > 0) {
        setContainerWidth(initialWidth);
      }
      
      observer = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const width = entry.contentRect.width - 32;
          if (width > 0) {
            setContainerWidth(width);
          }
        }
      });
      
      observer.observe(containerRef.current);
    };
    
    tryAttachObserver();
    
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      observer?.disconnect();
    };
  }, [step]);

  useEffect(() => {
    if (!autoFitEnabled || !containerWidth || !pageDimensions) return;
    
    const fitScale = containerWidth / pageDimensions.width;
    const clampedScale = Math.min(Math.max(fitScale, 0.5), 2);
    setScale(clampedScale);
  }, [containerWidth, pageDimensions, autoFitEnabled]);

  const loadPdf = useCallback(async () => {
    if (!pdfFile) return;
    setCanvasReady(false);
    setPageDimensions(null);
    setPdfDoc(null);
    
    try {
      const arrayBuffer = await pdfFile.arrayBuffer();
      const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
      const doc = await loadingTask.promise;
      setPdfDoc(doc);
      setCurrentPage(1);
    } catch (error: any) {
      console.error("Error loading PDF:", error);
      toast({ title: "Error", description: "Failed to load PDF", variant: "destructive" });
    }
  }, [pdfFile, toast]);

  useEffect(() => {
    if (step === "fields" && pdfFile) {
      loadPdf();
    }
  }, [step, pdfFile, loadPdf]);

  const renderTaskRef = useRef<any>(null);

  const renderPage = useCallback(async () => {
    if (!pdfDoc || !canvasRef.current) return;

    if (renderTaskRef.current) {
      renderTaskRef.current.cancel();
      renderTaskRef.current = null;
    }

    setCanvasReady(false);
    const page = await pdfDoc.getPage(currentPage);
    const unscaledViewport = page.getViewport({ scale: 1 });
    setPageDimensions({ width: unscaledViewport.width, height: unscaledViewport.height });
    
    const renderScale = 2;
    const effectiveScale = scale * renderScale;
    const viewport = page.getViewport({ scale: effectiveScale });
    const displayViewport = page.getViewport({ scale });
    
    const canvas = canvasRef.current;
    const context = canvas.getContext("2d");

    if (!context) return;

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
      if (err?.name !== 'RenderingCancelledException') {
        console.error('PDF render error:', err);
      }
    }
    renderTaskRef.current = null;
  }, [pdfDoc, currentPage, scale]);

  useEffect(() => {
    if (pdfDoc) {
      renderPage();
    }
  }, [pdfDoc, currentPage, scale, renderPage]);

  const handleCanvasClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!canvasRef.current || !canvasReady || !pageDimensions) return;
      if (!selectedSignerIdForField) {
        toast({ title: "Select a signer", description: "Please select which signer this field is for", variant: "destructive" });
        return;
      }

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
        const newX = Math.max(0, Math.min(x - size.width / 2, pageDimensions.width - size.width));
        const newY = Math.max(0, Math.min(y - size.height / 2, pageDimensions.height - size.height));
        const newField: PlacedField = {
          id: `field_${Date.now()}`,
          fieldType: fieldToolType,
          signerId: selectedSignerIdForField,
          page: currentPage,
          x: newX,
          y: newY,
          width: size.width,
          height: size.height,
          required: true,
          label: "",
          inputMode: "any",
          placeholder: "",
          creatorFills: false,
          creatorValue: "",
        };

        setFields([...fields, newField]);
        setSelectedFieldId(newField.id);
      }
    },
    [fields, currentPage, pageDimensions, fieldToolType, canvasReady, selectedSignerIdForField, toast]
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

  useEffect(() => {
    if (!isDragging && !isResizing) return;
    
    const handleWindowMouseMove = (e: MouseEvent) => {
      if (!canvasRef.current || !pageDimensions) return;
      
      const rect = canvasRef.current.getBoundingClientRect();
      const dx = ((e.clientX - dragStart.x) / rect.width) * pageDimensions.width;
      const dy = ((e.clientY - dragStart.y) / rect.height) * pageDimensions.height;

      if (isDragging && selectedFieldId) {
        setFields((prev) =>
          prev.map((f) => {
            if (f.id !== selectedFieldId) return f;
            const newX = Math.max(0, Math.min(f.x + dx, pageDimensions.width - f.width));
            const newY = Math.max(0, Math.min(f.y + dy, pageDimensions.height - f.height));
            return { ...f, x: newX, y: newY };
          }
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

  const deleteSelectedField = useCallback(() => {
    if (!selectedFieldId) return;
    setFields((prev) => prev.filter((f) => f.id !== selectedFieldId));
    setSelectedFieldId(null);
  }, [selectedFieldId]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type === "application/pdf") {
      setPdfFile(file);
      setDocumentTitle(file.name.replace(/\.pdf$/i, ""));
      setStep("signers");
    } else {
      toast({ title: "Invalid file", description: "Please select a PDF file", variant: "destructive" });
    }
  };

  const addSigner = () => {
    if (!newSignerName.trim() || !newSignerEmail.trim()) {
      toast({ title: "Missing information", description: "Please enter name and email", variant: "destructive" });
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newSignerEmail)) {
      toast({ title: "Invalid email", description: "Please enter a valid email address", variant: "destructive" });
      return;
    }

    const colorIndex = signers.length % SIGNER_COLORS.length;
    const newSigner: Signer = {
      id: `signer_${Date.now()}`,
      name: newSignerName.trim(),
      email: newSignerEmail.trim(),
      color: SIGNER_COLORS[colorIndex].border,
    };

    setSigners([...signers, newSigner]);
    setNewSignerName("");
    setNewSignerEmail("");

    if (!selectedSignerIdForField) {
      setSelectedSignerIdForField(newSigner.id);
    }
  };

  const removeSigner = (signerId: string) => {
    setSigners(signers.filter((s) => s.id !== signerId));
    setFields(fields.filter((f) => f.signerId !== signerId));
    if (selectedSignerIdForField === signerId) {
      setSelectedSignerIdForField(signers.find((s) => s.id !== signerId)?.id || "");
    }
  };

  const moveSignerUp = (index: number) => {
    if (index <= 0) return;
    const newSigners = [...signers];
    [newSigners[index - 1], newSigners[index]] = [newSigners[index], newSigners[index - 1]];
    setSigners(newSigners);
  };

  const moveSignerDown = (index: number) => {
    if (index >= signers.length - 1) return;
    const newSigners = [...signers];
    [newSigners[index], newSigners[index + 1]] = [newSigners[index + 1], newSigners[index]];
    setSigners(newSigners);
  };

  const getSignerColor = (signerId: string) => {
    const index = signers.findIndex((s) => s.id === signerId);
    return SIGNER_COLORS[index % SIGNER_COLORS.length];
  };

  const getFieldColor = (field: PlacedField) => {
    const signerColor = getSignerColor(field.signerId);
    return `${signerColor.border} ${signerColor.bg}`;
  };

  const getFieldIcon = (fieldType: FieldType) => {
    switch (fieldType) {
      case "signature":
        return <PenTool className="h-3 w-3" />;
      case "initial":
        return <Edit3 className="h-3 w-3" />;
      case "checkbox":
        return <CheckSquare className="h-3 w-3" />;
      case "date":
        return <Calendar className="h-3 w-3" />;
      default:
        return <Type className="h-3 w-3" />;
    }
  };

  const handleSendDocument = async () => {
    // Only count non-creatorFills fields for validation
    const signerFields = fields.filter(f => !f.creatorFills);
    
    if (signerFields.length === 0) {
      toast({ title: "No fields", description: "Please add at least one signature field for signers", variant: "destructive" });
      return;
    }

    const signatureFieldsExist = signers.every((signer) =>
      signerFields.some((f) => f.signerId === signer.id && f.fieldType === "signature")
    );

    if (!signatureFieldsExist) {
      toast({ 
        title: "Missing signatures", 
        description: "Each signer must have at least one signature field (excluding creator-filled fields)", 
        variant: "destructive" 
      });
      return;
    }

    setIsSending(true);

    try {
      const formData = new FormData();
      formData.append("pdf", pdfFile!);
      formData.append("title", documentTitle);
      formData.append("signers", JSON.stringify(signers));
      formData.append("fields", JSON.stringify(fields));
      formData.append("sendEmails", sendEmails ? "true" : "false");

      const res = await fetch("/api/admin/documents/one-off", {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to send document");
      }

      const result = await res.json();
      
      toast({ 
        title: "Document sent", 
        description: `Document created and ${sendEmails ? "emails sent to signers" : "ready for signing"}` 
      });

      setLocation("/dashboard");
    } catch (error: any) {
      console.error("Error sending document:", error);
      toast({ title: "Error", description: error.message || "Failed to send document", variant: "destructive" });
    } finally {
      setIsSending(false);
    }
  };

  const currentPageFields = fields.filter((f) => f.page === currentPage);

  if (step === "upload") {
    return (
      <div className="container mx-auto py-8 px-4 max-w-2xl">
        <Button
          variant="ghost"
          className="mb-6"
          onClick={() => setLocation("/dashboard")}
          data-testid="button-back-dashboard"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Dashboard
        </Button>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Create One-Off Document
            </CardTitle>
            <CardDescription>
              Upload a PDF document to send for signatures. This creates a single document without using a template.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div
              className="border-2 border-dashed rounded-lg p-12 text-center cursor-pointer hover-elevate transition-colors"
              onClick={() => fileInputRef.current?.click()}
              data-testid="dropzone-pdf-upload"
            >
              <Upload className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-lg font-medium mb-2">Click to upload PDF</p>
              <p className="text-sm text-muted-foreground">Or drag and drop your file here</p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={handleFileSelect}
              data-testid="input-pdf-file"
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (step === "signers") {
    return (
      <div className="container mx-auto py-8 px-4 max-w-2xl">
        <Button
          variant="ghost"
          className="mb-6"
          onClick={() => setStep("upload")}
          data-testid="button-back-upload"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Document Details</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="title">Document Title</Label>
                <Input
                  id="title"
                  value={documentTitle}
                  onChange={(e) => setDocumentTitle(e.target.value)}
                  placeholder="Enter document title"
                  data-testid="input-document-title"
                />
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Badge variant="outline">{pdfFile?.name}</Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Add Signers
            </CardTitle>
            <CardDescription>
              Add the people who need to sign this document. Each signer will receive their own signing link.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex gap-2">
                <div className="flex-1">
                  <Input
                    placeholder="Name"
                    value={newSignerName}
                    onChange={(e) => setNewSignerName(e.target.value)}
                    data-testid="input-signer-name"
                  />
                </div>
                <div className="flex-1">
                  <Input
                    type="email"
                    placeholder="Email"
                    value={newSignerEmail}
                    onChange={(e) => setNewSignerEmail(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addSigner()}
                    data-testid="input-signer-email"
                  />
                </div>
                <Button onClick={addSigner} data-testid="button-add-signer">
                  <Plus className="h-4 w-4" />
                </Button>
              </div>

              {signers.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    Signers will sign in this order. Use arrows to reorder.
                  </p>
                  {signers.map((signer, index) => {
                    const color = SIGNER_COLORS[index % SIGNER_COLORS.length];
                    return (
                      <div
                        key={signer.id}
                        className={`flex items-center justify-between p-3 rounded-md border-2 ${color.border} ${color.bg}`}
                        data-testid={`signer-item-${signer.id}`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex flex-col gap-0.5">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-5 w-5"
                              disabled={index === 0}
                              onClick={() => moveSignerUp(index)}
                              data-testid={`button-move-up-${signer.id}`}
                            >
                              <ChevronUp className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-5 w-5"
                              disabled={index === signers.length - 1}
                              onClick={() => moveSignerDown(index)}
                              data-testid={`button-move-down-${signer.id}`}
                            >
                              <ChevronDown className="h-3 w-3" />
                            </Button>
                          </div>
                          <Badge variant="outline" className="h-6 w-6 flex items-center justify-center p-0">
                            {index + 1}
                          </Badge>
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${color.border} border-2`}>
                            <span className={`text-sm font-medium ${color.text}`}>
                              {signer.name.charAt(0).toUpperCase()}
                            </span>
                          </div>
                          <div>
                            <p className="font-medium">{signer.name}</p>
                            <p className="text-sm text-muted-foreground flex items-center gap-1">
                              <Mail className="h-3 w-3" />
                              {signer.email}
                            </p>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeSigner(signer.id)}
                          data-testid={`button-remove-signer-${signer.id}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button
            size="lg"
            disabled={signers.length === 0}
            onClick={() => {
              if (signers.length > 0 && !selectedSignerIdForField) {
                setSelectedSignerIdForField(signers[0].id);
              }
              setStep("fields");
            }}
            data-testid="button-continue-fields"
          >
            Continue to Place Fields
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col">
      <div className="flex items-center justify-between gap-4 p-4 border-b bg-background">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            onClick={() => setStep("signers")}
            data-testid="button-back-signers"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div>
            <h1 className="text-lg font-semibold">{documentTitle}</h1>
            <p className="text-sm text-muted-foreground">
              Click on the PDF to place signature fields for each signer
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Switch
              id="send-emails"
              checked={sendEmails}
              onCheckedChange={setSendEmails}
              data-testid="switch-send-emails"
            />
            <Label htmlFor="send-emails" className="text-sm">Send emails</Label>
          </div>
          <Button
            onClick={handleSendDocument}
            disabled={isSending || fields.length === 0}
            data-testid="button-send-document"
          >
            {isSending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Send className="h-4 w-4 mr-2" />
                Send Document
              </>
            )}
          </Button>
        </div>
      </div>

      <ResizablePanelGroup direction="horizontal" className="flex-1">
        <ResizablePanel defaultSize={70} minSize={40}>
          <div 
            ref={containerRef}
            className="h-full overflow-auto bg-muted/50 p-4"
          >
            {!pdfDoc ? (
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
                {canvasReady && pageDimensions && canvasRef.current && (() => {
                  const canvas = canvasRef.current!;
                  // Use the canvas's CSS dimensions directly (more reliable than getBoundingClientRect during render)
                  const canvasWidth = parseFloat(canvas.style.width) || canvas.offsetWidth;
                  const canvasHeight = parseFloat(canvas.style.height) || canvas.offsetHeight;
                  const scaleX = canvasWidth / pageDimensions.width;
                  const scaleY = canvasHeight / pageDimensions.height;
                  
                  return currentPageFields.map((field) => {
                    const isSelected = field.id === selectedFieldId;
                    const signer = signers.find((s) => s.id === field.signerId);
                    
                    // Clamp field position to ensure it stays within canvas bounds
                    const clampedX = Math.max(0, Math.min(field.x, pageDimensions.width - field.width));
                    const clampedY = Math.max(0, Math.min(field.y, pageDimensions.height - field.height));
                    
                    return (
                      <div
                        key={field.id}
                        className={`absolute border-2 cursor-move ${getFieldColor(field)} ${
                          isSelected ? "ring-2 ring-primary" : ""
                        }`}
                        style={{
                          left: clampedX * scaleX,
                          top: clampedY * scaleY,
                          width: field.width * scaleX,
                          height: field.height * scaleY,
                        }}
                        onMouseDown={(e) => handleFieldMouseDown(e, field.id)}
                        data-testid={`field-${field.id}`}
                      >
                        <div className="absolute -top-5 left-0 text-xs bg-background px-1 rounded shadow flex items-center gap-1">
                          {getFieldIcon(field.fieldType)}
                          <span>{signer?.name || "Unknown"}</span>
                          {field.creatorFills && (
                            <Badge variant="secondary" className="text-[10px] px-1 py-0">
                              Creator
                            </Badge>
                          )}
                        </div>
                        {/* Show creatorValue or placeholder inside field for text/date fields */}
                        {(field.fieldType === "text" || field.fieldType === "date") && (field.creatorFills ? field.creatorValue : field.placeholder) && (
                          <div className="absolute inset-0 flex items-center px-1 overflow-hidden pointer-events-none z-10 bg-white/70 dark:bg-black/50 rounded-sm">
                            <span className="text-[10px] text-gray-700 dark:text-gray-200 truncate font-medium leading-tight">
                              {field.creatorFills ? field.creatorValue : field.placeholder}
                            </span>
                          </div>
                        )}
                        {isSelected && (
                          <>
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
                          </>
                        )}
                      </div>
                    );
                  });
                })()}
              </div>
            )}
          </div>
        </ResizablePanel>

        <ResizableHandle withHandle data-testid="handle-field-editor-split" />

        <ResizablePanel defaultSize={30} minSize={20} maxSize={50}>
          <div className="h-full overflow-y-auto bg-background">
            <div className="p-4 space-y-4">
              <div className="space-y-2">
                <Label>Assign to Signer (signing order)</Label>
                <div className="flex flex-col gap-1">
                  {signers.map((signer, index) => {
                    const color = SIGNER_COLORS[index % SIGNER_COLORS.length];
                    const isSelected = selectedSignerIdForField === signer.id;
                    return (
                      <Button
                        key={signer.id}
                        variant={isSelected ? "default" : "outline"}
                        size="sm"
                        className={`justify-start ${isSelected ? "" : `${color.border} border-2`}`}
                        onClick={() => setSelectedSignerIdForField(signer.id)}
                        data-testid={`button-select-signer-${signer.id}`}
                      >
                        <Badge variant="outline" className="h-5 w-5 flex items-center justify-center p-0 mr-2 text-xs">
                          {index + 1}
                        </Badge>
                        <div className={`w-4 h-4 rounded-full mr-2 ${color.border} border-2`} />
                        {signer.name}
                      </Button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Field Type</Label>
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
                <div className="flex items-center gap-2">
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
                      setScale((s) => Math.min(2, s + 0.25));
                    }}
                  >
                    +
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setAutoFitEnabled(true)}
                  >
                    Fit
                  </Button>
                </div>
              </div>

              {selectedField && (
                <div className="space-y-4 pt-4 border-t">
                  <div className="flex items-center justify-between">
                    <Label>Selected Field</Label>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={deleteSelectedField}
                      data-testid="button-delete-field"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="text-sm space-y-1">
                    <p><span className="text-muted-foreground">Type:</span> {selectedField.fieldType}</p>
                    <p><span className="text-muted-foreground">Signer:</span> {signers.find((s) => s.id === selectedField.signerId)?.name}</p>
                    <p><span className="text-muted-foreground">Page:</span> {selectedField.page}</p>
                  </div>
                  
                  {(selectedField.fieldType === "text" || selectedField.fieldType === "date") && (
                    <div className="space-y-3 pt-2">
                      <div className="space-y-1">
                        <Label className="text-xs">Placeholder Text</Label>
                        <Input
                          placeholder="e.g., Full Name, Phone Number..."
                          value={selectedField.placeholder || ""}
                          onChange={(e) => {
                            setFields(fields.map(f => 
                              f.id === selectedField.id 
                                ? { ...f, placeholder: e.target.value }
                                : f
                            ));
                          }}
                          data-testid="input-field-placeholder"
                        />
                      </div>
                      
                      {selectedField.fieldType === "text" && (
                        <div className="space-y-1">
                          <Label className="text-xs">Input Type</Label>
                          <Select
                            value={selectedField.inputMode || "any"}
                            onValueChange={(value: InputMode) => {
                              setFields(fields.map(f => 
                                f.id === selectedField.id 
                                  ? { ...f, inputMode: value }
                                  : f
                              ));
                            }}
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

                      <div className="flex items-center gap-2 pt-2">
                        <Checkbox
                          id="creatorFills"
                          checked={selectedField.creatorFills || false}
                          onCheckedChange={(checked) => {
                            setFields(fields.map(f => 
                              f.id === selectedField.id 
                                ? { ...f, creatorFills: !!checked, creatorValue: "" }
                                : f
                            ));
                          }}
                          data-testid="checkbox-creator-fills"
                        />
                        <Label htmlFor="creatorFills" className="text-sm font-normal cursor-pointer">
                          Creator fills at document creation
                        </Label>
                      </div>

                      {selectedField.creatorFills && (
                        <div className="space-y-1 pt-2">
                          <Label className="text-xs">Value (filled by creator)</Label>
                          <Input
                            placeholder="Enter the value..."
                            value={selectedField.creatorValue || ""}
                            onChange={(e) => {
                              setFields(fields.map(f => 
                                f.id === selectedField.id 
                                  ? { ...f, creatorValue: e.target.value }
                                  : f
                              ));
                            }}
                            data-testid="input-creator-value"
                          />
                        </div>
                      )}
                    </div>
                  )}

                  {/* Checkbox field settings */}
                  {selectedField.fieldType === "checkbox" && (
                    <div className="space-y-3 pt-2">
                      <div className="flex items-center gap-2 pt-2">
                        <Checkbox
                          id="creatorFillsCheckbox"
                          checked={selectedField.creatorFills || false}
                          onCheckedChange={(checked) => {
                            setFields(fields.map(f => 
                              f.id === selectedField.id 
                                ? { ...f, creatorFills: !!checked, creatorValue: checked ? "true" : "" }
                                : f
                            ));
                          }}
                          data-testid="checkbox-creator-fills-checkbox"
                        />
                        <Label htmlFor="creatorFillsCheckbox" className="text-sm font-normal cursor-pointer">
                          Creator fills at document creation
                        </Label>
                      </div>

                      {selectedField.creatorFills && (
                        <div className="flex items-center gap-2 pt-2">
                          <Checkbox
                            id="checkboxValue"
                            checked={selectedField.creatorValue === "true"}
                            onCheckedChange={(checked) => {
                              setFields(fields.map(f => 
                                f.id === selectedField.id 
                                  ? { ...f, creatorValue: checked ? "true" : "false" }
                                  : f
                              ));
                            }}
                            data-testid="checkbox-creator-value"
                          />
                          <Label htmlFor="checkboxValue" className="text-sm font-normal cursor-pointer">
                            Checked
                          </Label>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div className="pt-4 border-t">
                <Label className="mb-2 block">All Fields ({fields.length})</Label>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {fields.map((field) => {
                    const signer = signers.find((s) => s.id === field.signerId);
                    const signerIndex = signers.findIndex((s) => s.id === field.signerId);
                    const color = SIGNER_COLORS[signerIndex % SIGNER_COLORS.length];
                    return (
                      <div
                        key={field.id}
                        className={`p-2 rounded text-sm cursor-pointer ${
                          field.id === selectedFieldId ? "bg-accent" : "hover:bg-muted"
                        }`}
                        onClick={() => {
                          setSelectedFieldId(field.id);
                          setCurrentPage(field.page);
                        }}
                      >
                        <div className="flex items-center gap-2">
                          <div className={`w-3 h-3 rounded-full ${color.border} border-2`} />
                          <span className="flex-1">{signer?.name} - {field.fieldType}</span>
                          <Badge variant="outline" className="text-xs">p{field.page}</Badge>
                        </div>
                      </div>
                    );
                  })}
                  {fields.length === 0 && (
                    <p className="text-sm text-muted-foreground">
                      Click on the PDF to add fields
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
