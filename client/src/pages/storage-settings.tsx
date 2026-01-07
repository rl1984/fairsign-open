import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Cloud, Shield, HardDrive, ExternalLink, Check, AlertCircle, Lock, Unlink, Server, Settings, Crown, Play, Loader2, Globe, Building, Code, X, Plus, Key } from "lucide-react";
import { ApiKeysManagement } from "@/components/api-keys-management";
import { SiGoogledrive, SiDropbox } from "react-icons/si";
import { Link, useLocation } from "wouter";
import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  generateSalt,
  deriveKeyFromPassword,
  exportKey,
  storeEncryptionKey,
  storeEncryptionSalt,
  getEncryptionStatus,
  clearStoredEncryptionKey,
} from "@/lib/encryption";

interface StorageProvider {
  provider: string;
  name: string;
  description: string;
  connected: boolean;
  configured: boolean;
  requiresEncryption?: boolean;
  requiresPro?: boolean;
  hidden?: boolean;
  connectedEmail?: string | null;
}

interface StorageSettings {
  currentProvider: string;
  encryptionEnabled: boolean;
  encryptionSalt: string | null;
  providers: StorageProvider[];
  s3Available: boolean;
  isPro?: boolean;
}

interface CustomS3Config {
  configured: boolean;
  endpoint?: string;
  bucket?: string;
  accessKeyId?: string;
  region?: string;
  prefix?: string;
  label?: string;
  lastTestedAt?: string;
}

interface DataRegionSettings {
  dataRegion: "EU" | "US";
  isEnterprise: boolean;
  canChange: boolean;
  available: boolean;
  regions: Array<{ value: string; label: string }>;
}

function ProviderIcon({ provider }: { provider: string }) {
  switch (provider) {
    case "fairsign":
      return <Shield className="h-6 w-6" />;
    case "custom_s3":
      return <Server className="h-6 w-6" />;
    case "google_drive":
      return <SiGoogledrive className="h-6 w-6" />;
    case "dropbox":
      return <SiDropbox className="h-6 w-6" />;
    case "box":
      return <HardDrive className="h-6 w-6" />;
    default:
      return <Cloud className="h-6 w-6" />;
  }
}

export default function StorageSettingsPage() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [encryptionDialogOpen, setEncryptionDialogOpen] = useState(false);
  const [encryptionPassword, setEncryptionPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSettingUpEncryption, setIsSettingUpEncryption] = useState(false);
  const encryptionStatus = getEncryptionStatus();
  
  // Custom S3 state
  const [s3DialogOpen, setS3DialogOpen] = useState(false);
  const [s3Endpoint, setS3Endpoint] = useState("");
  const [s3Bucket, setS3Bucket] = useState("");
  const [s3AccessKeyId, setS3AccessKeyId] = useState("");
  const [s3SecretAccessKey, setS3SecretAccessKey] = useState("");
  const [s3Region, setS3Region] = useState("auto");
  const [s3Prefix, setS3Prefix] = useState("");
  const [s3Label, setS3Label] = useState("");
  const [isTesting, setIsTesting] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const success = params.get("success");
    const error = params.get("error");
    const provider = params.get("provider");

    if (success === "connected" && provider) {
      toast({
        title: "Connected!",
        description: `Successfully connected to ${provider.replace("_", " ")}.`,
      });
      window.history.replaceState({}, "", "/storage-settings");
    } else if (error) {
      toast({
        title: "Connection Failed",
        description: `Failed to connect: ${error.replace(/_/g, " ")}`,
        variant: "destructive",
      });
      window.history.replaceState({}, "", "/storage-settings");
    }
  }, [toast]);

  const { data: settings, isLoading } = useQuery<StorageSettings>({
    queryKey: ["/api/storage/settings"],
  });

  const { data: dataRegionSettings, isLoading: isLoadingDataRegion } = useQuery<DataRegionSettings>({
    queryKey: ["/api/user/data-region"],
  });

  // Allowed origins for embedded signing (Enterprise feature)
  interface AllowedOriginsSettings {
    allowedOrigins: string[];
    isEnterprise: boolean;
    canEdit: boolean;
  }
  
  const { data: originsSettings, isLoading: isLoadingOrigins } = useQuery<AllowedOriginsSettings>({
    queryKey: ["/api/user/allowed-origins"],
  });

  interface TeamData {
    hasTeam: boolean;
    isOwner: boolean;
    accountType: string;
  }
  
  const { data: teamData } = useQuery<TeamData>({
    queryKey: ["/api/team"],
  });
  
  const [newOrigin, setNewOrigin] = useState("");
  const [originsEditing, setOriginsEditing] = useState<string[]>([]);
  
  useEffect(() => {
    if (originsSettings?.allowedOrigins) {
      setOriginsEditing(originsSettings.allowedOrigins);
    }
  }, [originsSettings?.allowedOrigins]);
  
  const updateOriginsMutation = useMutation({
    mutationFn: async (allowedOrigins: string[]) => {
      return apiRequest("PATCH", "/api/user/allowed-origins", { allowedOrigins });
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/user/allowed-origins"] });
      toast({
        title: "Allowed Origins Updated",
        description: data.message || "Your allowed origins have been updated.",
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
  
  const addOrigin = () => {
    if (!newOrigin.trim()) return;
    try {
      const url = new URL(newOrigin.trim());
      const origin = url.origin;
      if (!originsEditing.includes(origin)) {
        const updated = [...originsEditing, origin];
        setOriginsEditing(updated);
        updateOriginsMutation.mutate(updated);
      }
      setNewOrigin("");
    } catch {
      toast({
        title: "Invalid URL",
        description: "Please enter a valid URL (e.g., https://example.com)",
        variant: "destructive",
      });
    }
  };
  
  const removeOrigin = (origin: string) => {
    const updated = originsEditing.filter(o => o !== origin);
    setOriginsEditing(updated);
    updateOriginsMutation.mutate(updated);
  };

  const updateDataRegionMutation = useMutation({
    mutationFn: async (dataRegion: string) => {
      return apiRequest("PATCH", "/api/user/data-region", { dataRegion });
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/user/data-region"] });
      toast({
        title: "Data Residency Updated",
        description: data.message || "Your data residency preference has been updated.",
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

  const updateProviderMutation = useMutation({
    mutationFn: async (provider: string) => {
      return apiRequest("POST", "/api/storage/settings", { storageProvider: provider });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/storage/settings"] });
      toast({
        title: "Storage Updated",
        description: "Your storage preference has been updated.",
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

  const disconnectMutation = useMutation({
    mutationFn: async (provider: string) => {
      return apiRequest("DELETE", `/api/storage/oauth/${provider}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/storage/settings"] });
      toast({
        title: "Disconnected",
        description: "Provider has been disconnected.",
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

  const [isTestingDropbox, setIsTestingDropbox] = useState(false);

  const testDropboxConnection = async () => {
    setIsTestingDropbox(true);
    try {
      const response = await fetch("/api/storage/test/dropbox", {
        method: "POST",
        credentials: "include",
      });
      const data = await response.json();
      
      if (data.success) {
        toast({
          title: "Connection Successful",
          description: data.message,
        });
      } else {
        toast({
          title: "Connection Failed",
          description: data.error || "Failed to connect to Dropbox",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to test Dropbox connection",
        variant: "destructive",
      });
    } finally {
      setIsTestingDropbox(false);
    }
  };

  const [isTestingBox, setIsTestingBox] = useState(false);

  const testBoxConnection = async () => {
    setIsTestingBox(true);
    try {
      const response = await fetch("/api/storage/test/box", {
        method: "POST",
        credentials: "include",
      });
      const data = await response.json();
      
      if (data.success) {
        toast({
          title: "Connection Successful",
          description: data.message,
        });
      } else {
        toast({
          title: "Connection Failed",
          description: data.error || "Failed to connect to Box",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to test Box connection",
        variant: "destructive",
      });
    } finally {
      setIsTestingBox(false);
    }
  };

  const connectProvider = async (provider: string) => {
    try {
      const response = await fetch(`/api/storage/oauth/${provider}`, {
        credentials: "include",
      });
      const data = await response.json();
      if (data.authUrl) {
        window.location.href = data.authUrl;
      } else if (data.error) {
        toast({
          title: "Error",
          description: data.error,
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to initiate connection",
        variant: "destructive",
      });
    }
  };

  // Custom S3 mutations
  const saveS3CredentialsMutation = useMutation({
    mutationFn: async (data: { 
      endpoint: string; 
      bucket: string; 
      accessKeyId: string; 
      secretAccessKey: string;
      region: string;
      prefix: string;
      label: string;
    }) => {
      return apiRequest("POST", "/api/storage/custom-s3", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/storage/settings"] });
      setS3DialogOpen(false);
      toast({
        title: "Saved",
        description: "Custom S3 credentials saved successfully.",
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

  const deleteS3CredentialsMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("DELETE", "/api/storage/custom-s3");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/storage/settings"] });
      toast({
        title: "Disconnected",
        description: "Custom S3 storage has been disconnected.",
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

  const testS3Connection = async () => {
    if (!s3Endpoint || !s3Bucket || !s3AccessKeyId || !s3SecretAccessKey) {
      toast({
        title: "Missing Fields",
        description: "Please fill in all required fields.",
        variant: "destructive",
      });
      return;
    }

    setIsTesting(true);
    try {
      const response = await apiRequest("POST", "/api/storage/custom-s3/test", {
        endpoint: s3Endpoint,
        bucket: s3Bucket,
        accessKeyId: s3AccessKeyId,
        secretAccessKey: s3SecretAccessKey,
        region: s3Region,
      });
      toast({
        title: "Connection Successful",
        description: "Your S3 storage is configured correctly.",
      });
    } catch (error: any) {
      toast({
        title: "Connection Failed",
        description: error.message || "Failed to connect to S3 storage.",
        variant: "destructive",
      });
    } finally {
      setIsTesting(false);
    }
  };

  const openS3Dialog = () => {
    setS3Endpoint("");
    setS3Bucket("");
    setS3AccessKeyId("");
    setS3SecretAccessKey("");
    setS3Region("auto");
    setS3Prefix("");
    setS3Label("");
    setS3DialogOpen(true);
  };

  const saveS3Credentials = () => {
    saveS3CredentialsMutation.mutate({
      endpoint: s3Endpoint,
      bucket: s3Bucket,
      accessKeyId: s3AccessKeyId,
      secretAccessKey: s3SecretAccessKey,
      region: s3Region,
      prefix: s3Prefix,
      label: s3Label,
    });
  };

  const setupEncryption = async () => {
    if (encryptionPassword !== confirmPassword) {
      toast({
        title: "Passwords don't match",
        description: "Please make sure both passwords match.",
        variant: "destructive",
      });
      return;
    }

    if (encryptionPassword.length < 8) {
      toast({
        title: "Password too short",
        description: "Please use a password with at least 8 characters.",
        variant: "destructive",
      });
      return;
    }

    setIsSettingUpEncryption(true);
    try {
      const salt = generateSalt();
      const key = await deriveKeyFromPassword(encryptionPassword, salt);
      const keyBase64 = await exportKey(key);

      await apiRequest("POST", "/api/storage/encryption/setup", { salt });

      storeEncryptionKey(keyBase64);
      storeEncryptionSalt(salt);

      queryClient.invalidateQueries({ queryKey: ["/api/storage/settings"] });

      toast({
        title: "Encryption Enabled",
        description: "Your documents will now be encrypted before upload.",
      });

      setEncryptionDialogOpen(false);
      setEncryptionPassword("");
      setConfirmPassword("");
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to setup encryption",
        variant: "destructive",
      });
    } finally {
      setIsSettingUpEncryption(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background p-6 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto px-4 py-4 flex items-center gap-4">
          <Link href="/dashboard">
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-semibold">Storage Settings</h1>
            <p className="text-sm text-muted-foreground">Choose where your signed documents are stored</p>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="space-y-6">
          {settings?.currentProvider === "fairsign" && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Lock className="h-5 w-5" />
                  Document Encryption
                </CardTitle>
                <CardDescription>
                  Protect your documents with end-to-end encryption. Only you can access them.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {settings.encryptionEnabled ? (
                  <div className="flex items-center gap-3">
                    <Badge variant="default" className="bg-green-600">
                      <Check className="h-3 w-3 mr-1" />
                      Enabled
                    </Badge>
                    {encryptionStatus.hasKey ? (
                      <span className="text-sm text-muted-foreground">
                        Encryption key is loaded for this session
                      </span>
                    ) : (
                      <div className="flex items-center gap-2">
                        <AlertCircle className="h-4 w-4 text-yellow-500" />
                        <span className="text-sm text-yellow-600 dark:text-yellow-400">
                          Enter your password to unlock encrypted documents
                        </span>
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => setEncryptionDialogOpen(true)}
                          data-testid="button-unlock"
                        >
                          Unlock
                        </Button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col gap-4">
                    <p className="text-sm text-muted-foreground">
                      When encryption is enabled, your documents are encrypted in your browser before being uploaded.
                      FairSign cannot read your encrypted documents - only you have the key.
                    </p>
                    <Button 
                      onClick={() => setEncryptionDialogOpen(true)}
                      data-testid="button-setup-encryption"
                    >
                      <Shield className="h-4 w-4 mr-2" />
                      Enable Encryption
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Data Residency Section - Enterprise Only */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Globe className="h-5 w-5" />
                Data Residency
                {!dataRegionSettings?.isEnterprise && (
                  <Badge variant="secondary" className="text-xs ml-2">
                    <Building className="h-3 w-3 mr-1" />
                    Enterprise
                  </Badge>
                )}
              </CardTitle>
              <CardDescription>
                Choose where your documents are stored geographically for compliance requirements.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingDataRegion ? (
                <div className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm text-muted-foreground">Loading...</span>
                </div>
              ) : dataRegionSettings?.canChange ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-4">
                    <div className="flex-1 max-w-xs">
                      <Select
                        value={dataRegionSettings?.dataRegion || "EU"}
                        onValueChange={(value) => updateDataRegionMutation.mutate(value)}
                        disabled={updateDataRegionMutation.isPending}
                      >
                        <SelectTrigger data-testid="select-data-region">
                          <SelectValue placeholder="Select region" />
                        </SelectTrigger>
                        <SelectContent>
                          {dataRegionSettings?.regions.map((region) => (
                            <SelectItem key={region.value} value={region.value} data-testid={`select-region-${region.value}`}>
                              {region.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {updateDataRegionMutation.isPending && (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    New documents will be stored in the selected region. Existing documents remain in their original location.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <Badge variant="outline">
                      {dataRegionSettings?.dataRegion === "US" ? "United States" : "Europe"} (Default)
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Data residency control is available for Enterprise accounts. Upgrade to Enterprise to store documents in different geographic regions for compliance requirements.
                  </p>
                  <Button
                    variant="outline"
                    onClick={() => setLocation("/billing")}
                    data-testid="button-upgrade-enterprise"
                  >
                    <Building className="h-4 w-4 mr-2" />
                    Upgrade to Enterprise
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Embedded Signing API Section - Enterprise Only */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Code className="h-5 w-5" />
                Embedded Signing API
                {!originsSettings?.isEnterprise && (
                  <Badge variant="secondary" className="text-xs ml-2">
                    <Building className="h-3 w-3 mr-1" />
                    Enterprise
                  </Badge>
                )}
              </CardTitle>
              <CardDescription>
                Configure allowed origins for embedding signing pages in your application via iframe.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingOrigins ? (
                <div className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm text-muted-foreground">Loading...</span>
                </div>
              ) : originsSettings?.canEdit ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <Input
                      value={newOrigin}
                      onChange={(e) => setNewOrigin(e.target.value)}
                      placeholder="https://example.com"
                      className="flex-1 max-w-md"
                      data-testid="input-new-origin"
                      onKeyDown={(e) => e.key === "Enter" && addOrigin()}
                    />
                    <Button
                      onClick={addOrigin}
                      disabled={updateOriginsMutation.isPending || !newOrigin.trim()}
                      data-testid="button-add-origin"
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Add
                    </Button>
                  </div>
                  
                  {originsEditing.length > 0 ? (
                    <div className="space-y-2">
                      <Label className="text-sm text-muted-foreground">Allowed Origins</Label>
                      <div className="flex flex-wrap gap-2">
                        {originsEditing.map((origin) => (
                          <Badge key={origin} variant="outline" className="flex items-center gap-1 py-1 px-2">
                            {origin}
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-4 w-4 ml-1"
                              onClick={() => removeOrigin(origin)}
                              disabled={updateOriginsMutation.isPending}
                              data-testid={`button-remove-origin-${origin.replace(/[:/]/g, "-")}`}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </Badge>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No origins configured. Add origins to enable embedded signing in your application.
                    </p>
                  )}
                  
                  <p className="text-sm text-muted-foreground">
                    Documents created via the Embedded Signing API can only be embedded in iframes from these origins.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    The Embedded Signing API allows you to embed document signing directly in your application. This feature is available for Enterprise accounts.
                  </p>
                  <Button
                    variant="outline"
                    onClick={() => setLocation("/billing")}
                    data-testid="button-upgrade-enterprise-api"
                  >
                    <Building className="h-4 w-4 mr-2" />
                    Upgrade to Enterprise
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* API Keys Section - Enterprise Only */}
          <ApiKeysManagement 
            isOwner={teamData?.isOwner || false}
            hasTeam={teamData?.hasTeam || false}
            accountType={teamData?.accountType || (originsSettings?.isEnterprise ? "enterprise" : (settings?.isPro ? "pro" : "free"))}
          />

          <div className="space-y-4">
            <h2 className="text-lg font-semibold">Storage Providers</h2>
            <div className="grid gap-4 md:grid-cols-2">
              {settings?.providers.filter(p => !p.hidden).map((provider) => (
                <Card 
                  key={provider.provider}
                  className={settings.currentProvider === provider.provider ? "border-primary" : ""}
                >
                  <CardHeader>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-3">
                        <ProviderIcon provider={provider.provider} />
                        <div>
                          <CardTitle className="text-base flex items-center gap-2">
                            {provider.name}
                            {provider.requiresPro && !settings.isPro && (
                              <Badge variant="secondary" className="text-xs">
                                <Crown className="h-3 w-3 mr-1" />
                                Pro
                              </Badge>
                            )}
                          </CardTitle>
                          {provider.connectedEmail && (
                            <p className="text-xs text-muted-foreground">{provider.connectedEmail}</p>
                          )}
                        </div>
                      </div>
                      {settings.currentProvider === provider.provider && (
                        <Badge data-testid={`badge-active-${provider.provider}`}>Active</Badge>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <p className="text-sm text-muted-foreground">{provider.description}</p>
                    
                    <div className="flex flex-wrap gap-2">
                      {provider.requiresPro && !settings.isPro ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setLocation("/billing")}
                          data-testid={`button-upgrade-${provider.provider}`}
                        >
                          <Crown className="h-3 w-3 mr-1" />
                          Upgrade to Pro
                        </Button>
                      ) : provider.provider === "fairsign" ? (
                        settings.currentProvider !== "fairsign" && (
                          <Button
                            size="sm"
                            onClick={() => updateProviderMutation.mutate("fairsign")}
                            disabled={updateProviderMutation.isPending}
                            data-testid="button-select-fairsign"
                          >
                            Select
                          </Button>
                        )
                      ) : provider.provider === "custom_s3" ? (
                        provider.connected ? (
                          <>
                            {settings.currentProvider !== "custom_s3" && (
                              <Button
                                size="sm"
                                onClick={() => updateProviderMutation.mutate("custom_s3")}
                                disabled={updateProviderMutation.isPending}
                                data-testid="button-select-custom_s3"
                              >
                                Select
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openS3Dialog()}
                              data-testid="button-reconfigure-custom_s3"
                            >
                              <Settings className="h-3 w-3 mr-1" />
                              Reconfigure
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => deleteS3CredentialsMutation.mutate()}
                              disabled={deleteS3CredentialsMutation.isPending}
                              data-testid="button-disconnect-custom_s3"
                            >
                              <Unlink className="h-3 w-3 mr-1" />
                              Disconnect
                            </Button>
                          </>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openS3Dialog()}
                            data-testid="button-configure-custom_s3"
                          >
                            <Settings className="h-3 w-3 mr-1" />
                            Configure
                          </Button>
                        )
                      ) : provider.connected ? (
                        <>
                          {settings.currentProvider !== provider.provider && (
                            <Button
                              size="sm"
                              onClick={() => updateProviderMutation.mutate(provider.provider)}
                              disabled={updateProviderMutation.isPending}
                              data-testid={`button-select-${provider.provider}`}
                            >
                              Select
                            </Button>
                          )}
                          {provider.provider === "dropbox" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => testDropboxConnection()}
                              disabled={isTestingDropbox}
                              data-testid="button-test-dropbox"
                            >
                              {isTestingDropbox ? (
                                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                              ) : (
                                <Play className="h-3 w-3 mr-1" />
                              )}
                              Test
                            </Button>
                          )}
                          {provider.provider === "box" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => testBoxConnection()}
                              disabled={isTestingBox}
                              data-testid="button-test-box"
                            >
                              {isTestingBox ? (
                                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                              ) : (
                                <Play className="h-3 w-3 mr-1" />
                              )}
                              Test
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => disconnectMutation.mutate(provider.provider)}
                            disabled={disconnectMutation.isPending}
                            data-testid={`button-disconnect-${provider.provider}`}
                          >
                            <Unlink className="h-3 w-3 mr-1" />
                            Disconnect
                          </Button>
                        </>
                      ) : provider.configured ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => connectProvider(provider.provider)}
                          data-testid={`button-connect-${provider.provider}`}
                        >
                          <ExternalLink className="h-3 w-3 mr-1" />
                          Connect
                        </Button>
                      ) : (
                        <Badge variant="secondary">Not Configured</Badge>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          {!settings?.s3Available && settings?.currentProvider === "fairsign" && (
            <Card className="border-yellow-500/50 bg-yellow-500/5">
              <CardContent className="pt-6">
                <div className="flex gap-3">
                  <AlertCircle className="h-5 w-5 text-yellow-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-yellow-700 dark:text-yellow-400">
                      S3 Storage Not Configured
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">
                      FairSign S3 storage requires AWS credentials to be configured. 
                      Please contact support or use external storage providers in the meantime.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </main>

      <Dialog open={encryptionDialogOpen} onOpenChange={setEncryptionDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {settings?.encryptionEnabled ? "Unlock Documents" : "Setup Encryption"}
            </DialogTitle>
            <DialogDescription>
              {settings?.encryptionEnabled 
                ? "Enter your encryption password to access your documents."
                : "Create a password to encrypt your documents. This password cannot be recovered if lost."
              }
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={encryptionPassword}
                onChange={(e) => setEncryptionPassword(e.target.value)}
                placeholder="Enter your encryption password"
                data-testid="input-encryption-password"
              />
            </div>
            {!settings?.encryptionEnabled && (
              <div className="space-y-2">
                <Label htmlFor="confirm">Confirm Password</Label>
                <Input
                  id="confirm"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm your password"
                  data-testid="input-confirm-password"
                />
              </div>
            )}
            {!settings?.encryptionEnabled && (
              <div className="p-3 bg-yellow-500/10 rounded-md border border-yellow-500/30">
                <p className="text-sm text-yellow-700 dark:text-yellow-400">
                  <strong>Important:</strong> If you forget this password, you will not be able to access your encrypted documents. 
                  There is no way to recover it.
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEncryptionDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={settings?.encryptionEnabled 
                ? async () => {
                    try {
                      const key = await deriveKeyFromPassword(encryptionPassword, settings.encryptionSalt!);
                      const keyBase64 = await exportKey(key);
                      storeEncryptionKey(keyBase64);
                      storeEncryptionSalt(settings.encryptionSalt!);
                      setEncryptionDialogOpen(false);
                      setEncryptionPassword("");
                      toast({
                        title: "Unlocked",
                        description: "Your documents are now accessible.",
                      });
                    } catch (e) {
                      toast({
                        title: "Error",
                        description: "Invalid password",
                        variant: "destructive",
                      });
                    }
                  }
                : setupEncryption
              }
              disabled={isSettingUpEncryption}
              data-testid="button-confirm-encryption"
            >
              {isSettingUpEncryption ? "Setting up..." : settings?.encryptionEnabled ? "Unlock" : "Enable Encryption"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={s3DialogOpen} onOpenChange={setS3DialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Configure Custom S3 Storage</DialogTitle>
            <DialogDescription>
              Connect your own S3-compatible storage (AWS S3, Cloudflare R2, MinIO, etc.)
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="s3-label">Label (optional)</Label>
              <Input
                id="s3-label"
                placeholder="My S3 Storage"
                value={s3Label}
                onChange={(e) => setS3Label(e.target.value)}
                data-testid="input-s3-label"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="s3-endpoint">Endpoint URL *</Label>
              <Input
                id="s3-endpoint"
                placeholder="https://s3.amazonaws.com or https://xxx.r2.cloudflarestorage.com"
                value={s3Endpoint}
                onChange={(e) => setS3Endpoint(e.target.value)}
                data-testid="input-s3-endpoint"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="s3-bucket">Bucket Name *</Label>
              <Input
                id="s3-bucket"
                placeholder="my-bucket"
                value={s3Bucket}
                onChange={(e) => setS3Bucket(e.target.value)}
                data-testid="input-s3-bucket"
              />
            </div>
            
            <div className="grid gap-4 grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="s3-access-key">Access Key ID *</Label>
                <Input
                  id="s3-access-key"
                  placeholder="Your access key ID"
                  value={s3AccessKeyId}
                  onChange={(e) => setS3AccessKeyId(e.target.value)}
                  data-testid="input-s3-access-key"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="s3-secret-key">Secret Access Key *</Label>
                <Input
                  id="s3-secret-key"
                  type="password"
                  placeholder="Your secret access key"
                  value={s3SecretAccessKey}
                  onChange={(e) => setS3SecretAccessKey(e.target.value)}
                  data-testid="input-s3-secret-key"
                />
              </div>
            </div>
            
            <div className="grid gap-4 grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="s3-region">Region</Label>
                <Input
                  id="s3-region"
                  placeholder="auto"
                  value={s3Region}
                  onChange={(e) => setS3Region(e.target.value)}
                  data-testid="input-s3-region"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="s3-prefix">Path Prefix (optional)</Label>
                <Input
                  id="s3-prefix"
                  placeholder="documents/"
                  value={s3Prefix}
                  onChange={(e) => setS3Prefix(e.target.value)}
                  data-testid="input-s3-prefix"
                />
              </div>
            </div>
          </div>
          
          <DialogFooter className="flex flex-col gap-2 sm:flex-row">
            <Button
              variant="outline"
              onClick={testS3Connection}
              disabled={isTesting || !s3Endpoint || !s3Bucket || !s3AccessKeyId || !s3SecretAccessKey}
              data-testid="button-test-s3"
            >
              {isTesting ? "Testing..." : "Test Connection"}
            </Button>
            <Button
              onClick={saveS3Credentials}
              disabled={saveS3CredentialsMutation.isPending || !s3Endpoint || !s3Bucket || !s3AccessKeyId || !s3SecretAccessKey}
              data-testid="button-save-s3"
            >
              {saveS3CredentialsMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
