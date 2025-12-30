import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Loader2, Eye, EyeOff, CheckCircle, XCircle, HardDrive } from "lucide-react";

interface StorageSettings {
  endpoint: string;
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  prefix: string;
}

export function StorageSettings() {
  const { toast } = useToast();
  const [showSecretKey, setShowSecretKey] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  
  const [formData, setFormData] = useState<StorageSettings>({
    endpoint: "",
    bucket: "",
    region: "auto",
    accessKeyId: "",
    secretAccessKey: "",
    prefix: "",
  });

  const { isLoading } = useQuery({
    queryKey: ["/api/admin/storage-settings"],
    queryFn: async () => {
      const response = await fetch("/api/admin/storage-settings", { credentials: "include" });
      if (!response.ok) throw new Error("Failed to fetch storage settings");
      return response.json();
    },
    onSuccess: (data: StorageSettings) => {
      setFormData(data);
    },
  } as any);

  const saveMutation = useMutation({
    mutationFn: async (data: StorageSettings) => {
      const response = await fetch("/api/admin/storage-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to save settings");
      }
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Settings saved", description: "Storage settings have been updated" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/storage-settings"] });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const testMutation = useMutation({
    mutationFn: async (data: StorageSettings) => {
      const response = await fetch("/api/admin/storage-settings/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      return response.json();
    },
    onSuccess: (result) => {
      setTestResult(result);
      if (result.success) {
        toast({ title: "Connection successful", description: "Successfully connected to S3 storage" });
      } else {
        toast({ title: "Connection failed", description: result.message, variant: "destructive" });
      }
    },
    onError: (error: any) => {
      setTestResult({ success: false, message: error.message });
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const handleChange = (field: keyof StorageSettings, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setTestResult(null);
  };

  const handleSave = () => {
    saveMutation.mutate(formData);
  };

  const handleTest = () => {
    testMutation.mutate(formData);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <HardDrive className="h-5 w-5" />
          S3 Storage Configuration
        </CardTitle>
        <CardDescription>
          Configure an S3-compatible storage bucket for document storage. This works with AWS S3, 
          Cloudflare R2, MinIO, and other S3-compatible services.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="endpoint">Endpoint URL</Label>
            <Input
              id="endpoint"
              data-testid="input-s3-endpoint"
              placeholder="https://s3.amazonaws.com"
              value={formData.endpoint}
              onChange={(e) => handleChange("endpoint", e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              The S3 endpoint URL (e.g., https://s3.us-east-1.amazonaws.com)
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="bucket">Bucket Name</Label>
            <Input
              id="bucket"
              data-testid="input-s3-bucket"
              placeholder="my-bucket"
              value={formData.bucket}
              onChange={(e) => handleChange("bucket", e.target.value)}
            />
            <p className="text-xs text-muted-foreground">The name of your S3 bucket</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="region">Region</Label>
            <Input
              id="region"
              data-testid="input-s3-region"
              placeholder="us-east-1"
              value={formData.region}
              onChange={(e) => handleChange("region", e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              AWS region (e.g., us-east-1). Use "auto" for non-AWS services.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="prefix">Object Prefix (Optional)</Label>
            <Input
              id="prefix"
              data-testid="input-s3-prefix"
              placeholder="documents/"
              value={formData.prefix}
              onChange={(e) => handleChange("prefix", e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Optional prefix for all stored objects (e.g., "documents/")
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="accessKeyId">Access Key ID</Label>
            <Input
              id="accessKeyId"
              data-testid="input-s3-access-key"
              placeholder="AKIAIOSFODNN7EXAMPLE"
              value={formData.accessKeyId}
              onChange={(e) => handleChange("accessKeyId", e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="secretAccessKey">Secret Access Key</Label>
            <div className="relative">
              <Input
                id="secretAccessKey"
                data-testid="input-s3-secret-key"
                type={showSecretKey ? "text" : "password"}
                placeholder="wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
                value={formData.secretAccessKey}
                onChange={(e) => handleChange("secretAccessKey", e.target.value)}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-0 top-0"
                onClick={() => setShowSecretKey(!showSecretKey)}
                data-testid="button-toggle-secret"
              >
                {showSecretKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </div>

        {testResult && (
          <div
            className={`flex items-center gap-2 p-3 rounded-md ${
              testResult.success
                ? "bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400"
                : "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400"
            }`}
          >
            {testResult.success ? (
              <CheckCircle className="h-4 w-4" />
            ) : (
              <XCircle className="h-4 w-4" />
            )}
            <span className="text-sm">{testResult.message}</span>
          </div>
        )}

        <div className="flex gap-2 flex-wrap">
          <Button
            onClick={handleTest}
            variant="outline"
            disabled={testMutation.isPending || !formData.endpoint || !formData.bucket}
            data-testid="button-test-connection"
          >
            {testMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Test Connection
          </Button>
          <Button
            onClick={handleSave}
            disabled={saveMutation.isPending}
            data-testid="button-save-storage"
          >
            {saveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save Settings
          </Button>
        </div>

        <div className="mt-4 p-4 bg-muted rounded-md">
          <h4 className="font-medium mb-2">Note</h4>
          <p className="text-sm text-muted-foreground">
            After saving, the application may need to be restarted for the new storage settings to take effect.
            If using Replit's built-in Object Storage, you don't need to configure these settings.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
