import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { Key, Plus, Trash2, Copy, Eye, EyeOff, AlertTriangle, Activity } from "lucide-react";
import { useState } from "react";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Link } from "wouter";

interface ApiKey {
  id: string;
  name: string;
  keyPrefix: string;
  lastUsedAt: string | null;
  createdAt: string;
}

interface ApiKeysResponse {
  keys: ApiKey[];
}

interface CreateKeyResponse {
  id: string;
  name: string;
  key: string;
  keyPrefix: string;
  createdAt: string;
  message: string;
}

interface ApiUsageResponse {
  hasAccess: boolean;
  used: number;
  limit: number;
  remaining: number;
  billingPeriodStart: string | null;
  message?: string;
}

interface ApiKeysManagementProps {
  isOwner: boolean;
  hasTeam: boolean;
  accountType: string;
}

export function ApiKeysManagement({ isOwner, hasTeam, accountType }: ApiKeysManagementProps) {
  const { toast } = useToast();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [keyName, setKeyName] = useState("");
  const [keyToDelete, setKeyToDelete] = useState<ApiKey | null>(null);
  const [newlyCreatedKey, setNewlyCreatedKey] = useState<string | null>(null);
  const [showKey, setShowKey] = useState(false);

  const isEnterprise = accountType === "enterprise";

  const { data: keysData, isLoading } = useQuery<ApiKeysResponse>({
    queryKey: ["/api/team/api-keys"],
    enabled: isEnterprise && isOwner && hasTeam,
  });

  const { data: usageData } = useQuery<ApiUsageResponse>({
    queryKey: ["/api/team/api-usage"],
    enabled: isEnterprise && isOwner && hasTeam,
  });

  const createKeyMutation = useMutation({
    mutationFn: async (name: string) => {
      const response = await apiRequest("POST", "/api/team/api-keys", { name });
      return response.json() as Promise<CreateKeyResponse>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/team/api-keys"] });
      setNewlyCreatedKey(data.key);
      setShowKey(true);
      setKeyName("");
      toast({
        title: "API Key Created",
        description: "Copy your key now. It will not be shown again.",
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

  const deleteKeyMutation = useMutation({
    mutationFn: async (keyId: string) => {
      return apiRequest("DELETE", `/api/team/api-keys/${keyId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/team/api-keys"] });
      setKeyToDelete(null);
      toast({
        title: "API Key Deleted",
        description: "The API key has been revoked and can no longer be used.",
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

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied",
      description: "API key copied to clipboard.",
    });
  };

  if (!isEnterprise) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            API Keys
            <Badge variant="secondary" className="ml-2">Enterprise</Badge>
          </CardTitle>
          <CardDescription>
            Generate API keys for programmatic access to FairSign
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-6">
            <Key className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <h3 className="font-medium mb-2">Enterprise Feature</h3>
            <p className="text-sm text-muted-foreground mb-4 max-w-md mx-auto">
              API keys allow you to integrate FairSign with your existing systems.
              Upgrade to Enterprise to access the API.
            </p>
            <Link href="/dashboard?upgrade=enterprise">
              <Button data-testid="button-upgrade-enterprise-api">
                Upgrade to Enterprise
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!hasTeam || !isOwner) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            API Keys
          </CardTitle>
          <CardDescription>
            Generate API keys for programmatic access to FairSign
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-6">
            <Key className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <h3 className="font-medium mb-2">Team Required</h3>
            <p className="text-sm text-muted-foreground max-w-md mx-auto mb-4">
              {!hasTeam 
                ? "API keys are organization-scoped. Create a team first to generate API keys." 
                : "Only team owners can manage API keys."}
            </p>
            {!hasTeam && (
              <Link href="/team-settings">
                <Button variant="outline" data-testid="button-create-team-for-api">
                  Go to Team Settings
                </Button>
              </Link>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            API Keys
          </CardTitle>
          <CardDescription>
            Generate API keys for programmatic access. Keys are linked to your organization.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {usageData?.hasAccess && (
            <div className="p-4 rounded-md bg-muted/50 space-y-2" data-testid="api-usage-stats">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Activity className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">API Usage This Month</span>
                </div>
                <span className="text-sm font-medium" data-testid="text-api-usage-count">
                  {usageData.used} / {usageData.limit} calls
                </span>
              </div>
              <Progress 
                value={(usageData.used / usageData.limit) * 100} 
                className="h-2"
                data-testid="progress-api-usage"
              />
              <p className="text-xs text-muted-foreground">
                {usageData.remaining} calls remaining
                {usageData.billingPeriodStart && (
                  <> (resets {new Date(new Date(usageData.billingPeriodStart).getTime() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString()})</>
                )}
              </p>
            </div>
          )}

          <div className="flex justify-end">
            <Button onClick={() => setCreateDialogOpen(true)} data-testid="button-create-api-key">
              <Plus className="mr-2 h-4 w-4" />
              Create API Key
            </Button>
          </div>

          {isLoading ? (
            <div className="text-center py-6 text-muted-foreground">
              Loading API keys...
            </div>
          ) : keysData?.keys && keysData.keys.length > 0 ? (
            <div className="space-y-2">
              {keysData.keys.map((key) => (
                <div
                  key={key.id}
                  className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-md bg-muted/50"
                  data-testid={`api-key-row-${key.id}`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                      <Key className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <div className="font-medium">{key.name}</div>
                      <div className="text-sm text-muted-foreground">
                        Created {new Date(key.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      {key.lastUsedAt 
                        ? `Last used ${new Date(key.lastUsedAt).toLocaleDateString()}`
                        : "Never used"}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setKeyToDelete(key)}
                      data-testid={`button-delete-api-key-${key.id}`}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-6 text-muted-foreground">
              <Key className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No API keys yet. Create one to get started.</p>
            </div>
          )}

          <div className="text-xs text-muted-foreground bg-muted p-3 rounded-md">
            <strong>Usage:</strong> Include your API key in requests as a Bearer token:
            <code className="block mt-1 bg-background p-2 rounded font-mono text-xs">
              Authorization: Bearer fs_live_...
            </code>
          </div>
        </CardContent>
      </Card>

      <Dialog open={createDialogOpen} onOpenChange={(open) => {
        setCreateDialogOpen(open);
        if (!open) {
          setNewlyCreatedKey(null);
          setShowKey(false);
        }
      }}>
        <DialogContent>
          {!newlyCreatedKey ? (
            <>
              <DialogHeader>
                <DialogTitle>Create API Key</DialogTitle>
                <DialogDescription>
                  Give your API key a name to help you identify it later.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="key-name">Key Name</Label>
                  <Input
                    id="key-name"
                    placeholder="e.g., Production Server"
                    value={keyName}
                    onChange={(e) => setKeyName(e.target.value)}
                    data-testid="input-api-key-name"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={() => createKeyMutation.mutate(keyName)}
                  disabled={!keyName.trim() || createKeyMutation.isPending}
                  data-testid="button-confirm-create-api-key"
                >
                  {createKeyMutation.isPending ? "Creating..." : "Create Key"}
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-amber-500" />
                  Save Your API Key
                </DialogTitle>
                <DialogDescription>
                  This is the only time you will see this key. Copy it now and store it securely.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Your API Key</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      readOnly
                      type={showKey ? "text" : "password"}
                      value={newlyCreatedKey}
                      className="font-mono text-sm"
                      data-testid="text-new-api-key"
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => setShowKey(!showKey)}
                      data-testid="button-toggle-key-visibility"
                    >
                      {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => copyToClipboard(newlyCreatedKey)}
                      data-testid="button-copy-api-key"
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="bg-amber-50 dark:bg-amber-950/20 text-amber-800 dark:text-amber-200 p-3 rounded-md text-sm">
                  Keep this key secret. Anyone with this key can access your FairSign API as your organization.
                </div>
              </div>
              <DialogFooter>
                <Button onClick={() => {
                  setCreateDialogOpen(false);
                  setNewlyCreatedKey(null);
                  setShowKey(false);
                }} data-testid="button-close-key-dialog">
                  I've Saved My Key
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!keyToDelete} onOpenChange={(open) => !open && setKeyToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke API Key</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to revoke the API key "{keyToDelete?.name}"?
              This action cannot be undone. Any applications using this key will stop working.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => keyToDelete && deleteKeyMutation.mutate(keyToDelete.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete-api-key"
            >
              {deleteKeyMutation.isPending ? "Revoking..." : "Revoke Key"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
