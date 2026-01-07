import { useState, useRef, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { isEnterprise } from "@shared/models/auth";
import * as pdfjsLib from "pdfjs-dist";
import { 
  Loader2, 
  Upload, 
  ArrowLeft, 
  ArrowRight,
  FileText, 
  Users, 
  CheckCircle, 
  AlertCircle, 
  Clock,
  Download,
  Send,
  RefreshCw,
  Lock,
  PenTool,
  Edit3,
  Type,
  Calendar,
  CheckSquare,
  Trash2,
  X
} from "lucide-react";

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

type FieldType = "signature" | "initial" | "text" | "date" | "checkbox";

interface PlacedField {
  id: string;
  fieldType: FieldType;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  apiTag: string;
  label: string;
  required: boolean;
}

interface BulkBatch {
  id: string;
  userId: string;
  originalFilename: string;
  title: string;
  status: string;
  createdAt: string;
  totalCount: number;
  sentCount: number;
  errorCount: number;
  pendingCount: number;
}

type Step = "upload" | "fields" | "sending";

const defaultSizes: Record<FieldType, { width: number; height: number }> = {
  signature: { width: 200, height: 50 },
  initial: { width: 80, height: 40 },
  text: { width: 200, height: 30 },
  date: { width: 120, height: 30 },
  checkbox: { width: 24, height: 24 },
};

export default function BulkSendPage() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const { user, isLoading: authLoading } = useAuth();
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const [step, setStep] = useState<Step>("upload");
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [recipientCount, setRecipientCount] = useState(0);
  
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [fields, setFields] = useState<PlacedField[]>([]);
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [fieldToolType, setFieldToolType] = useState<FieldType>("signature");
  const [scale, setScale] = useState(1);
  const [pageDimensions, setPageDimensions] = useState<{ width: number; height: number } | null>(null);
  const [canvasReady, setCanvasReady] = useState(false);
  const [isSending, setIsSending] = useState(false);

  const hasEnterprise = isEnterprise(user?.accountType);

  const { data: batches, isLoading: batchesLoading, refetch } = useQuery<BulkBatch[]>({
    queryKey: ["/api/bulk-batches"],
    refetchInterval: 5000,
    enabled: hasEnterprise,
  });

  const renderPage = useCallback(async () => {
    if (!pdfDoc || !canvasRef.current) return;

    const page = await pdfDoc.getPage(currentPage);
    const viewport = page.getViewport({ scale });
    const canvas = canvasRef.current;
    const context = canvas.getContext("2d");
    if (!context) return;

    canvas.height = viewport.height;
    canvas.width = viewport.width;
    setPageDimensions({ width: viewport.width, height: viewport.height });

    await page.render({ canvasContext: context, viewport } as any).promise;
    setCanvasReady(true);
  }, [pdfDoc, currentPage, scale]);

  useEffect(() => {
    renderPage();
  }, [renderPage]);

  useEffect(() => {
    if (batchId && step === "fields") {
      const loadPdf = async () => {
        try {
          const response = await fetch(`/api/bulk-batches/${batchId}/pdf`, { credentials: "include" });
          if (!response.ok) throw new Error("Failed to load PDF");
          const blob = await response.blob();
          const arrayBuffer = await blob.arrayBuffer();
          const doc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
          setPdfDoc(doc);
        } catch (error) {
          toast({ title: "Error", description: "Failed to load PDF for editing", variant: "destructive" });
        }
      };
      loadPdf();
    }
  }, [batchId, step, toast]);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  if (!hasEnterprise) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8 max-w-2xl">
          <div className="mb-6">
            <Button variant="ghost" onClick={() => setLocation("/dashboard")} className="gap-2" data-testid="button-back-dashboard">
              <ArrowLeft className="w-4 h-4" />
              Back to Dashboard
            </Button>
          </div>
          <Card>
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 w-16 h-16 rounded-full bg-muted flex items-center justify-center">
                <Lock className="w-8 h-8 text-muted-foreground" />
              </div>
              <CardTitle>Enterprise Feature</CardTitle>
              <CardDescription>
                Bulk Send is available exclusively for Enterprise subscribers
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-center">
              <p className="text-sm text-muted-foreground">
                Send documents to hundreds of recipients at once with a single CSV upload. 
                Track progress in real-time and manage all your bulk sends from one dashboard.
              </p>
              <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
                <Button onClick={() => setLocation("/billing")} data-testid="button-upgrade-enterprise">
                  Upgrade to Enterprise
                </Button>
                <Button variant="outline" onClick={() => setLocation("/dashboard")} data-testid="button-return-dashboard">
                  Return to Dashboard
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const handlePdfSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.name.toLowerCase().endsWith(".pdf")) {
        toast({ title: "Invalid file type", description: "Please select a PDF file.", variant: "destructive" });
        return;
      }
      setPdfFile(file);
      if (!title) setTitle(file.name.replace(/\.pdf$/i, ""));
    }
  };

  const handleCsvSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.name.toLowerCase().endsWith(".csv")) {
        toast({ title: "Invalid file type", description: "Please select a CSV file.", variant: "destructive" });
        return;
      }
      setCsvFile(file);
    }
  };

  const handlePrepare = async () => {
    if (!pdfFile || !csvFile) {
      toast({ title: "Missing files", description: "Please select both a PDF document and a CSV recipient list.", variant: "destructive" });
      return;
    }

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("pdf", pdfFile);
      formData.append("csv", csvFile);
      formData.append("title", title || pdfFile.name.replace(/\.pdf$/i, ""));

      const response = await fetch("/api/bulk-send/prepare", { method: "POST", body: formData, credentials: "include" });
      const data = await response.json();

      if (!response.ok) throw new Error(data.message || data.error || "Failed to prepare bulk send");

      setBatchId(data.batchId);
      setRecipientCount(data.recipientCount);
      setFields([]);
      setStep("fields");
      
      toast({ title: "Files uploaded", description: `Now place signature fields on the document. ${data.recipientCount} recipients ready.` });
    } catch (error) {
      toast({ title: "Upload failed", description: error instanceof Error ? error.message : "An error occurred", variant: "destructive" });
    } finally {
      setIsUploading(false);
    }
  };

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current || !pageDimensions) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const size = defaultSizes[fieldToolType];
    
    const newField: PlacedField = {
      id: `field-${Date.now()}`,
      fieldType: fieldToolType,
      page: currentPage,
      x: x - size.width / 2,
      y: y - size.height / 2,
      width: size.width,
      height: size.height,
      apiTag: `${fieldToolType}_${fields.length + 1}`,
      label: fieldToolType.charAt(0).toUpperCase() + fieldToolType.slice(1),
      required: true,
    };
    
    setFields([...fields, newField]);
    setSelectedFieldId(newField.id);
  };

  const handleSend = async () => {
    if (!batchId) return;
    
    const signatureFields = fields.filter(f => f.fieldType === "signature");
    if (signatureFields.length === 0) {
      toast({ title: "Signature required", description: "Please add at least one signature field before sending.", variant: "destructive" });
      return;
    }

    setIsSending(true);
    try {
      const response = await fetch(`/api/bulk-batches/${batchId}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fields }),
        credentials: "include",
      });
      const data = await response.json();

      if (!response.ok) throw new Error(data.message || data.error || "Failed to send");

      toast({ title: "Bulk send started", description: `Sending to ${recipientCount} recipients. Track progress below.` });
      
      setStep("upload");
      setBatchId(null);
      setPdfFile(null);
      setCsvFile(null);
      setTitle("");
      setFields([]);
      setPdfDoc(null);
      if (pdfInputRef.current) pdfInputRef.current.value = "";
      if (csvInputRef.current) csvInputRef.current.value = "";
      
      refetch();
    } catch (error) {
      toast({ title: "Send failed", description: error instanceof Error ? error.message : "An error occurred", variant: "destructive" });
    } finally {
      setIsSending(false);
    }
  };

  const downloadSampleCsv = () => {
    const csvContent = "name,email\nJohn Doe,john@example.com\nJane Smith,jane@example.com\n";
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "recipients-sample.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const getStatusBadge = (batch: BulkBatch) => {
    switch (batch.status) {
      case "draft":
        return <Badge variant="outline" className="gap-1"><Edit3 className="w-3 h-3" /> Draft</Badge>;
      case "processing":
        return <Badge variant="secondary" className="gap-1"><Clock className="w-3 h-3" /> Processing</Badge>;
      case "failed":
        return <Badge variant="destructive" className="gap-1"><AlertCircle className="w-3 h-3" /> Failed</Badge>;
      case "partial":
        return <Badge variant="outline" className="gap-1"><AlertCircle className="w-3 h-3" /> Partial</Badge>;
      case "completed":
        return <Badge className="gap-1 bg-green-600"><CheckCircle className="w-3 h-3" /> Completed</Badge>;
      default:
        return <Badge variant="secondary" className="gap-1">{batch.status}</Badge>;
    }
  };

  const getFieldColor = (fieldType: FieldType) => {
    switch (fieldType) {
      case "signature": return "border-blue-500 bg-blue-500/20";
      case "initial": return "border-purple-500 bg-purple-500/20";
      case "date": return "border-cyan-500 bg-cyan-500/20";
      case "checkbox": return "border-green-500 bg-green-500/20";
      default: return "border-orange-500 bg-orange-500/20";
    }
  };

  const getFieldIcon = (fieldType: FieldType) => {
    switch (fieldType) {
      case "signature": return <PenTool className="h-3 w-3" />;
      case "initial": return <Edit3 className="h-3 w-3" />;
      case "date": return <Calendar className="h-3 w-3" />;
      case "checkbox": return <CheckSquare className="h-3 w-3" />;
      default: return <Type className="h-3 w-3" />;
    }
  };

  const currentPageFields = fields.filter(f => f.page === currentPage);

  if (step === "fields") {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <div className="border-b p-4 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <Button variant="ghost" onClick={() => { setStep("upload"); setBatchId(null); setPdfDoc(null); }} className="gap-2">
              <ArrowLeft className="w-4 h-4" />
              Back
            </Button>
            <div>
              <h1 className="font-semibold">Configure Signature Fields</h1>
              <p className="text-sm text-muted-foreground">{recipientCount} recipients - Click on the document to place fields</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex gap-1">
              {(["signature", "initial", "text", "date", "checkbox"] as FieldType[]).map((type) => (
                <Button
                  key={type}
                  variant={fieldToolType === type ? "default" : "outline"}
                  size="sm"
                  onClick={() => setFieldToolType(type)}
                  data-testid={`button-tool-${type}`}
                >
                  {getFieldIcon(type)}
                  <span className="ml-1 hidden sm:inline capitalize">{type}</span>
                </Button>
              ))}
            </div>
            <Button onClick={handleSend} disabled={isSending || fields.filter(f => f.fieldType === "signature").length === 0} data-testid="button-send-bulk">
              {isSending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
              Send to {recipientCount} Recipients
            </Button>
          </div>
        </div>

        <div className="flex-1 flex overflow-hidden">
          <div ref={containerRef} className="flex-1 overflow-auto p-4 bg-muted/30">
            <div className="relative inline-block">
              {!pdfDoc ? (
                <div className="flex items-center justify-center h-96"><Loader2 className="w-8 h-8 animate-spin" /></div>
              ) : (
                <>
                  <canvas ref={canvasRef} className="block shadow-lg cursor-crosshair" onClick={handleCanvasClick} data-testid="canvas-pdf-preview" />
                  {canvasReady && pageDimensions && currentPageFields.map((field) => (
                    <div
                      key={field.id}
                      className={`absolute border-2 ${getFieldColor(field.fieldType)} ${field.id === selectedFieldId ? "ring-2 ring-primary" : ""}`}
                      style={{ left: field.x, top: field.y, width: field.width, height: field.height }}
                      onClick={(e) => { e.stopPropagation(); setSelectedFieldId(field.id); }}
                      data-testid={`field-${field.id}`}
                    >
                      <div className="absolute -top-5 left-0 text-xs bg-background px-1 rounded shadow flex items-center gap-1">
                        {getFieldIcon(field.fieldType)}
                        <span>{field.apiTag}</span>
                      </div>
                      {field.id === selectedFieldId && (
                        <Button
                          size="icon"
                          variant="destructive"
                          className="absolute -top-3 -right-3 h-6 w-6"
                          onClick={(e) => { e.stopPropagation(); setFields(fields.filter(f => f.id !== field.id)); setSelectedFieldId(null); }}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>

          <div className="w-64 border-l bg-background p-4 space-y-4 overflow-auto">
            {pdfDoc && (
              <div className="space-y-2">
                <Label>Page</Label>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" disabled={currentPage <= 1} onClick={() => setCurrentPage(p => Math.max(1, p - 1))}>Prev</Button>
                  <span className="text-sm">{currentPage} / {pdfDoc.numPages}</span>
                  <Button variant="outline" size="sm" disabled={currentPage >= pdfDoc.numPages} onClick={() => setCurrentPage(p => Math.min(pdfDoc.numPages, p + 1))}>Next</Button>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label>Zoom</Label>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setScale(s => Math.max(0.5, s - 0.25))}>-</Button>
                <span className="text-sm w-12 text-center">{Math.round(scale * 100)}%</span>
                <Button variant="outline" size="sm" onClick={() => setScale(s => Math.min(2, s + 0.25))}>+</Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Fields ({fields.length})</Label>
              {fields.length === 0 ? (
                <p className="text-xs text-muted-foreground">Click on the document to add fields</p>
              ) : (
                <div className="space-y-1 max-h-60 overflow-auto">
                  {fields.map((field) => (
                    <div
                      key={field.id}
                      className={`flex items-center gap-2 p-2 rounded text-sm cursor-pointer hover-elevate ${field.id === selectedFieldId ? "bg-muted" : ""}`}
                      onClick={() => { setSelectedFieldId(field.id); setCurrentPage(field.page); }}
                    >
                      {getFieldIcon(field.fieldType)}
                      <span className="flex-1 truncate">{field.apiTag}</span>
                      <span className="text-xs text-muted-foreground">p{field.page}</span>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6"
                        onClick={(e) => { e.stopPropagation(); setFields(fields.filter(f => f.id !== field.id)); if (selectedFieldId === field.id) setSelectedFieldId(null); }}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {fields.filter(f => f.fieldType === "signature").length === 0 && (
              <div className="p-3 rounded bg-destructive/10 text-destructive text-sm">
                Add at least one signature field before sending.
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="mb-6">
          <Button variant="ghost" onClick={() => setLocation("/dashboard")} className="gap-2">
            <ArrowLeft className="w-4 h-4" />
            Back to Dashboard
          </Button>
        </div>

        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Bulk Send</h1>
          <p className="text-muted-foreground">Send a document to multiple recipients at once using a CSV file.</p>
        </div>

        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Send className="w-5 h-5" /> New Bulk Send</CardTitle>
            <CardDescription>Upload a PDF document and a CSV file with recipient names and emails.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="title">Document Title</Label>
              <Input id="title" data-testid="input-bulk-title" placeholder="Enter document title" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>PDF Document</Label>
                <div className="border-2 border-dashed rounded-md p-6 text-center cursor-pointer hover-elevate" onClick={() => pdfInputRef.current?.click()}>
                  <input ref={pdfInputRef} type="file" accept=".pdf" className="hidden" onChange={handlePdfSelect} data-testid="input-bulk-pdf" />
                  {pdfFile ? (
                    <div className="flex flex-col items-center gap-2">
                      <FileText className="w-8 h-8 text-primary" />
                      <span className="text-sm font-medium">{pdfFile.name}</span>
                      <span className="text-xs text-muted-foreground">Click to change</span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2">
                      <Upload className="w-8 h-8 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">Click to select PDF</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Label>Recipient List (CSV)</Label>
                  <Button variant="ghost" size="sm" className="h-auto px-1 text-xs" onClick={downloadSampleCsv} data-testid="button-download-sample">
                    <Download className="w-3 h-3 mr-1" />
                    Download sample
                  </Button>
                </div>
                <div className="border-2 border-dashed rounded-md p-6 text-center cursor-pointer hover-elevate" onClick={() => csvInputRef.current?.click()}>
                  <input ref={csvInputRef} type="file" accept=".csv" className="hidden" onChange={handleCsvSelect} data-testid="input-bulk-csv" />
                  {csvFile ? (
                    <div className="flex flex-col items-center gap-2">
                      <Users className="w-8 h-8 text-primary" />
                      <span className="text-sm font-medium">{csvFile.name}</span>
                      <span className="text-xs text-muted-foreground">Click to change</span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2">
                      <Users className="w-8 h-8 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">Click to select CSV</span>
                    </div>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">CSV must have "name" and "email" columns.</p>
              </div>
            </div>

            <Button onClick={handlePrepare} disabled={!pdfFile || !csvFile || isUploading} className="w-full" data-testid="button-continue-fields">
              {isUploading ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Uploading...</>
              ) : (
                <><ArrowRight className="w-4 h-4 mr-2" /> Continue to Place Fields</>
              )}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <div>
                <CardTitle className="flex items-center gap-2"><Clock className="w-5 h-5" /> History</CardTitle>
                <CardDescription>Recent bulk send batches</CardDescription>
              </div>
              <Button variant="ghost" size="icon" onClick={() => refetch()} data-testid="button-refresh-batches">
                <RefreshCw className="w-4 h-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {batchesLoading ? (
              <div className="flex items-center justify-center py-8"><Loader2 className="w-6 h-6 animate-spin" /></div>
            ) : !batches || batches.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">No bulk sends yet. Create your first one above.</div>
            ) : (
              <div className="space-y-4">
                {batches.map((batch) => (
                  <div key={batch.id} className="border rounded-md p-4 space-y-3" data-testid={`batch-item-${batch.id}`}>
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <h4 className="font-medium truncate">{batch.title}</h4>
                        <p className="text-sm text-muted-foreground">{batch.originalFilename} - {new Date(batch.createdAt).toLocaleDateString()}</p>
                      </div>
                      {getStatusBadge(batch)}
                    </div>
                    {batch.status !== "draft" && (
                      <div className="space-y-1">
                        <div className="flex justify-between text-sm">
                          <span>
                            {batch.sentCount} of {batch.totalCount} sent
                            {batch.errorCount > 0 && <span className="text-destructive ml-2">({batch.errorCount} failed)</span>}
                          </span>
                          <span className="text-muted-foreground">{batch.totalCount > 0 ? Math.round((batch.sentCount / batch.totalCount) * 100) : 0}%</span>
                        </div>
                        <Progress value={batch.totalCount > 0 ? (batch.sentCount / batch.totalCount) * 100 : 0} className="h-2" />
                      </div>
                    )}
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
