import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Cloud, Shield, HardDrive, ExternalLink, Check, AlertCircle, Lock, Unlink } from "lucide-react";
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
  connectedEmail?: string | null;
}

interface StorageSettings {
  currentProvider: string;
  encryptionEnabled: boolean;
  encryptionSalt: string | null;
  providers: StorageProvider[];
  s3Available: boolean;
}

function ProviderIcon({ provider }: { provider: string }) {
  switch (provider) {
    case "fairsign":
      return <Shield className="h-6 w-6" />;
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

          <div className="space-y-4">
            <h2 className="text-lg font-semibold">Storage Providers</h2>
            <div className="grid gap-4 md:grid-cols-2">
              {settings?.providers.map((provider) => (
                <Card 
                  key={provider.provider}
                  className={settings.currentProvider === provider.provider ? "border-primary" : ""}
                >
                  <CardHeader>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-3">
                        <ProviderIcon provider={provider.provider} />
                        <div>
                          <CardTitle className="text-base">{provider.name}</CardTitle>
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
                      {provider.provider === "fairsign" ? (
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
    </div>
  );
}
