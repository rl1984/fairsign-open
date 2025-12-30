import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { ArrowLeft, Upload, FileText, CheckCircle, XCircle, Loader2, Info } from "lucide-react";
import type { Template } from "@shared/schema";

interface BulkResult {
  success: boolean;
  document_id?: string;
  signing_url?: string;
  email_sent?: boolean;
  error?: string;
  row_index: number;
}

interface BulkResponse {
  total: number;
  success_count: number;
  failure_count: number;
  results: BulkResult[];
}

export default function BulkImportPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [csvInput, setCsvInput] = useState("");
  const [sendEmails, setSendEmails] = useState(false);
  const [results, setResults] = useState<BulkResponse | null>(null);

  const { data: templates = [], isLoading: templatesLoading } = useQuery<Template[]>({
    queryKey: ["/api/admin/templates"],
  });

  const bulkCreateMutation = useMutation({
    mutationFn: async (data: { template_id: string; documents: Record<string, any>[]; send_emails: boolean }) => {
      const response = await apiRequest("POST", "/api/admin/documents/bulk", data);
      return (await response.json()) as BulkResponse;
    },
    onSuccess: (data) => {
      setResults(data);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/documents"] });
      toast({
        title: "Bulk Import Complete",
        description: `${data.success_count} of ${data.total} documents created successfully.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Import Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const parseCSV = (csv: string): Record<string, string>[] => {
    const lines = csv.trim().split("\n");
    if (lines.length < 2) return [];

    const headers = lines[0].split(",").map(h => h.trim().replace(/"/g, ""));
    const rows: Record<string, string>[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = parseCSVLine(lines[i]);
      if (values.length !== headers.length) continue;
      
      const row: Record<string, string> = {};
      headers.forEach((header, index) => {
        row[header] = values[index];
      });
      rows.push(row);
    }

    return rows;
  };

  const parseCSVLine = (line: string): string[] => {
    const values: string[] = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === "," && !inQuotes) {
        values.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
    values.push(current.trim());
    return values;
  };

  const handleImport = () => {
    if (!selectedTemplateId) {
      toast({
        title: "Template Required",
        description: "Please select a template.",
        variant: "destructive",
      });
      return;
    }

    const documents = parseCSV(csvInput);
    if (documents.length === 0) {
      toast({
        title: "No Data",
        description: "Please enter valid CSV data with at least one row.",
        variant: "destructive",
      });
      return;
    }

    if (documents.length > 50) {
      toast({
        title: "Too Many Rows",
        description: "Maximum 50 documents can be created at once.",
        variant: "destructive",
      });
      return;
    }

    bulkCreateMutation.mutate({
      template_id: selectedTemplateId,
      documents,
      send_emails: sendEmails,
    });
  };

  const selectedTemplate = templates.find(t => t.id === selectedTemplateId);

  const getPlaceholdersList = (): string[] => {
    if (!selectedTemplate?.placeholders) return [];
    if (Array.isArray(selectedTemplate.placeholders)) {
      return selectedTemplate.placeholders;
    }
    return [];
  };

  const generateSampleCSV = (): string => {
    const placeholders = getPlaceholdersList();
    if (placeholders.length === 0) {
      return "tenant_name,tenant_email,property_address,monthly_rent,lease_start_date,lease_end_date\nJohn Doe,john@example.com,123 Main St,1500,2024-01-01,2024-12-31";
    }
    const headers = placeholders.join(",");
    const sampleValues = placeholders.map(p => {
      if (p.includes("email")) return "tenant@example.com";
      if (p.includes("name")) return "John Doe";
      if (p.includes("address")) return "123 Main St";
      if (p.includes("rent")) return "1500";
      if (p.includes("date")) return "2024-01-01";
      return "Sample Value";
    }).join(",");
    return `${headers}\n${sampleValues}`;
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur">
        <div className="container mx-auto px-4 py-4 flex items-center gap-4">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => navigate("/dashboard")}
            data-testid="button-back"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-semibold">Bulk Document Import</h1>
            <p className="text-sm text-muted-foreground">Create multiple documents from CSV data</p>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-6">
        {!results ? (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Template Selection
                </CardTitle>
                <CardDescription>
                  Choose the template to use for all documents
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="template-select">Template</Label>
                  {templatesLoading ? (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading templates...
                    </div>
                  ) : (
                    <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
                      <SelectTrigger data-testid="select-template">
                        <SelectValue placeholder="Select a template" />
                      </SelectTrigger>
                      <SelectContent>
                        {templates.map((template) => (
                          <SelectItem key={template.id} value={template.id}>
                            {template.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>

                {selectedTemplate && (
                  <div className="bg-muted/50 rounded-md p-4 space-y-2">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <Info className="h-4 w-4" />
                      Required Placeholders
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {getPlaceholdersList().map((placeholder) => (
                        <code key={placeholder} className="bg-background px-2 py-1 rounded text-xs border">
                          {placeholder}
                        </code>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Upload className="h-5 w-5" />
                  CSV Data
                </CardTitle>
                <CardDescription>
                  Paste your CSV data with headers matching the template placeholders
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="csv-input">CSV Content</Label>
                    {selectedTemplateId && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCsvInput(generateSampleCSV())}
                        data-testid="button-generate-sample"
                      >
                        Generate Sample
                      </Button>
                    )}
                  </div>
                  <Textarea
                    id="csv-input"
                    placeholder="tenant_name,tenant_email,property_address,monthly_rent&#10;John Doe,john@example.com,123 Main St,1500&#10;Jane Smith,jane@example.com,456 Oak Ave,1800"
                    value={csvInput}
                    onChange={(e) => setCsvInput(e.target.value)}
                    className="min-h-[200px] font-mono text-sm"
                    data-testid="textarea-csv"
                  />
                  <p className="text-xs text-muted-foreground">
                    First row should contain column headers. Maximum 50 rows.
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <Checkbox
                    id="send-emails"
                    checked={sendEmails}
                    onCheckedChange={(checked) => setSendEmails(checked === true)}
                    data-testid="checkbox-send-emails"
                  />
                  <Label htmlFor="send-emails" className="text-sm cursor-pointer">
                    Send signature request emails automatically (requires tenant_email column)
                  </Label>
                </div>

                <div className="flex gap-3">
                  <Button
                    onClick={handleImport}
                    disabled={!selectedTemplateId || !csvInput.trim() || bulkCreateMutation.isPending}
                    data-testid="button-import"
                  >
                    {bulkCreateMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        Creating Documents...
                      </>
                    ) : (
                      <>
                        <Upload className="h-4 w-4 mr-2" />
                        Import Documents
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {results.failure_count === 0 ? (
                  <CheckCircle className="h-5 w-5 text-green-600" />
                ) : (
                  <Info className="h-5 w-5 text-amber-600" />
                )}
                Import Results
              </CardTitle>
              <CardDescription>
                {results.success_count} of {results.total} documents created successfully
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-4 text-center">
                <div className="bg-muted/50 rounded-md p-3">
                  <div className="text-2xl font-bold">{results.total}</div>
                  <div className="text-sm text-muted-foreground">Total</div>
                </div>
                <div className="bg-green-50 dark:bg-green-950/30 rounded-md p-3">
                  <div className="text-2xl font-bold text-green-600">{results.success_count}</div>
                  <div className="text-sm text-muted-foreground">Success</div>
                </div>
                <div className="bg-red-50 dark:bg-red-950/30 rounded-md p-3">
                  <div className="text-2xl font-bold text-red-600">{results.failure_count}</div>
                  <div className="text-sm text-muted-foreground">Failed</div>
                </div>
              </div>

              <div className="max-h-[400px] overflow-y-auto border rounded-md">
                <table className="w-full text-sm">
                  <thead className="bg-muted sticky top-0">
                    <tr>
                      <th className="text-left p-2 font-medium">Row</th>
                      <th className="text-left p-2 font-medium">Status</th>
                      <th className="text-left p-2 font-medium">Document ID</th>
                      <th className="text-left p-2 font-medium">Email</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.results.map((result) => (
                      <tr key={result.row_index} className="border-t">
                        <td className="p-2">{result.row_index + 1}</td>
                        <td className="p-2">
                          {result.success ? (
                            <span className="flex items-center gap-1 text-green-600">
                              <CheckCircle className="h-4 w-4" />
                              Created
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-red-600">
                              <XCircle className="h-4 w-4" />
                              Failed
                            </span>
                          )}
                        </td>
                        <td className="p-2 font-mono text-xs">
                          {result.document_id ? result.document_id.substring(0, 8) + "..." : "-"}
                        </td>
                        <td className="p-2">
                          {result.email_sent ? (
                            <span className="text-green-600">Sent</span>
                          ) : result.success ? (
                            <span className="text-muted-foreground">Not sent</span>
                          ) : (
                            <span className="text-red-600" title={result.error}>{result.error}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex gap-3">
                <Button onClick={() => setResults(null)} variant="outline" data-testid="button-new-import">
                  Start New Import
                </Button>
                <Button onClick={() => navigate("/dashboard")} data-testid="button-go-dashboard">
                  Go to Dashboard
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
