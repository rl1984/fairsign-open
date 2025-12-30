import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Loader2, Shield, ShieldCheck, ShieldOff, Copy, Check } from "lucide-react";

interface TwoFactorSetupProps {
  isEnabled: boolean;
  onUpdate: () => void;
}

export default function TwoFactorSetup({ isEnabled, onUpdate }: TwoFactorSetupProps) {
  const { toast } = useToast();
  const [isSetupDialogOpen, setIsSetupDialogOpen] = useState(false);
  const [isDisableDialogOpen, setIsDisableDialogOpen] = useState(false);
  const [setupData, setSetupData] = useState<{ secret: string; qrCode: string } | null>(null);
  const [verifyCode, setVerifyCode] = useState("");
  const [disableCode, setDisableCode] = useState("");
  const [copiedSecret, setCopiedSecret] = useState(false);

  const setupMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/auth/2fa/setup", {});
      return res.json();
    },
    onSuccess: (data) => {
      setSetupData(data);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const verifyMutation = useMutation({
    mutationFn: async (code: string) => {
      const res = await apiRequest("POST", "/api/auth/2fa/verify", { code });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "2FA Enabled", description: "Two-factor authentication is now active." });
      setIsSetupDialogOpen(false);
      setSetupData(null);
      setVerifyCode("");
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      onUpdate();
    },
    onError: (error: Error) => {
      toast({ title: "Verification Failed", description: error.message, variant: "destructive" });
    },
  });

  const disableMutation = useMutation({
    mutationFn: async (code: string) => {
      const res = await apiRequest("POST", "/api/auth/2fa/disable", { code });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "2FA Disabled", description: "Two-factor authentication has been turned off." });
      setIsDisableDialogOpen(false);
      setDisableCode("");
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      onUpdate();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const handleStartSetup = () => {
    setIsSetupDialogOpen(true);
    setupMutation.mutate();
  };

  const handleCopySecret = () => {
    if (setupData?.secret) {
      navigator.clipboard.writeText(setupData.secret);
      setCopiedSecret(true);
      setTimeout(() => setCopiedSecret(false), 2000);
    }
  };

  if (isEnabled) {
    return (
      <>
        <div className="flex items-center justify-between p-4 border rounded-md">
          <div className="flex items-center gap-3">
            <ShieldCheck className="h-5 w-5 text-green-600" />
            <div>
              <p className="font-medium">Two-Factor Authentication</p>
              <p className="text-sm text-muted-foreground">Your account is protected with 2FA</p>
            </div>
          </div>
          <Button
            variant="outline"
            onClick={() => setIsDisableDialogOpen(true)}
            data-testid="button-disable-2fa"
          >
            <ShieldOff className="h-4 w-4 mr-2" />
            Disable
          </Button>
        </div>

        <Dialog open={isDisableDialogOpen} onOpenChange={setIsDisableDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ShieldOff className="h-5 w-5" />
                Disable Two-Factor Authentication
              </DialogTitle>
              <DialogDescription>
                Enter your current authenticator code to disable 2FA
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <div className="space-y-2">
                <Label htmlFor="disableCode">Verification Code</Label>
                <Input
                  id="disableCode"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  value={disableCode}
                  onChange={(e) => setDisableCode(e.target.value.replace(/\D/g, ""))}
                  placeholder="000000"
                  className="text-center text-xl tracking-widest"
                  data-testid="input-disable-2fa-code"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => {
                setIsDisableDialogOpen(false);
                setDisableCode("");
              }}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => disableMutation.mutate(disableCode)}
                disabled={disableMutation.isPending || disableCode.length !== 6}
                data-testid="button-confirm-disable-2fa"
              >
                {disableMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Disable 2FA
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  return (
    <>
      <div className="flex items-center justify-between p-4 border rounded-md">
        <div className="flex items-center gap-3">
          <Shield className="h-5 w-5 text-muted-foreground" />
          <div>
            <p className="font-medium">Two-Factor Authentication</p>
            <p className="text-sm text-muted-foreground">Add an extra layer of security to your account</p>
          </div>
        </div>
        <Button onClick={handleStartSetup} data-testid="button-enable-2fa">
          <Shield className="h-4 w-4 mr-2" />
          Enable
        </Button>
      </div>

      <Dialog open={isSetupDialogOpen} onOpenChange={(open) => {
        if (!open) {
          setIsSetupDialogOpen(false);
          setSetupData(null);
          setVerifyCode("");
        }
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Set Up Two-Factor Authentication
            </DialogTitle>
            <DialogDescription>
              Scan the QR code with your authenticator app
            </DialogDescription>
          </DialogHeader>

          {setupMutation.isPending ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : setupData ? (
            <div className="space-y-4 py-4">
              <div className="flex justify-center">
                <img
                  src={setupData.qrCode}
                  alt="2FA QR Code"
                  className="border rounded-md"
                  data-testid="img-2fa-qr"
                />
              </div>

              <div className="space-y-2">
                <Label>Manual Entry Code</Label>
                <div className="flex gap-2">
                  <Input
                    readOnly
                    value={setupData.secret}
                    className="font-mono text-xs"
                    data-testid="input-2fa-secret"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={handleCopySecret}
                    data-testid="button-copy-secret"
                  >
                    {copiedSecret ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="verifyCode">Enter Code from App</Label>
                <Input
                  id="verifyCode"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  value={verifyCode}
                  onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, ""))}
                  placeholder="000000"
                  className="text-center text-xl tracking-widest"
                  data-testid="input-verify-2fa-code"
                />
              </div>
            </div>
          ) : null}

          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setIsSetupDialogOpen(false);
              setSetupData(null);
              setVerifyCode("");
            }}>
              Cancel
            </Button>
            <Button
              onClick={() => verifyMutation.mutate(verifyCode)}
              disabled={verifyMutation.isPending || verifyCode.length !== 6 || !setupData}
              data-testid="button-verify-2fa"
            >
              {verifyMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Verify & Enable
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
