import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Smartphone, Check, X, RefreshCw } from "lucide-react";
import QRCode from "qrcode";

interface SignatureQrModalProps {
  isOpen: boolean;
  onClose: () => void;
  sessionToken: string;
  spotKey: string;
  onSignatureComplete: (spotKey: string) => void;
}

export function SignatureQrModal({
  isOpen,
  onClose,
  sessionToken,
  spotKey,
  onSignatureComplete,
}: SignatureQrModalProps) {
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [status, setStatus] = useState<"pending" | "completed" | "expired">("pending");
  const [error, setError] = useState<string>("");

  useEffect(() => {
    if (!isOpen || !sessionToken) return;

    const generateQR = async () => {
      try {
        const signUrl = `${window.location.origin}/sign-mobile/${sessionToken}`;
        const dataUrl = await QRCode.toDataURL(signUrl, {
          width: 256,
          margin: 2,
          color: {
            dark: "#000000",
            light: "#ffffff",
          },
        });
        setQrDataUrl(dataUrl);
      } catch (err) {
        setError("Failed to generate QR code");
      }
    };

    generateQR();
  }, [isOpen, sessionToken]);

  useEffect(() => {
    if (!isOpen || !sessionToken || status !== "pending") return;

    const pollInterval = setInterval(async () => {
      try {
        const res = await fetch(`/api/signer-sessions/${sessionToken}/status`);
        if (res.ok) {
          const data = await res.json();
          if (data.status === "completed") {
            setStatus("completed");
            onSignatureComplete(spotKey);
            clearInterval(pollInterval);
          } else if (data.status === "expired") {
            setStatus("expired");
            clearInterval(pollInterval);
          }
        }
      } catch (err) {
        console.error("Error polling session status:", err);
      }
    }, 2000);

    return () => clearInterval(pollInterval);
  }, [isOpen, sessionToken, status, onSignatureComplete]);

  const handleCancel = () => {
    setStatus("pending");
    setQrDataUrl("");
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Smartphone className="h-5 w-5" />
            Sign on Your Mobile Device
          </DialogTitle>
          <DialogDescription>
            Scan this QR code with your phone to sign using touch
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4 py-4">
          {status === "pending" && (
            <>
              {qrDataUrl ? (
                <div className="bg-white p-4 rounded-lg">
                  <img src={qrDataUrl} alt="QR Code for mobile signing" className="w-64 h-64" />
                </div>
              ) : (
                <div className="w-64 h-64 flex items-center justify-center bg-muted rounded-lg">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              )}
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Waiting for signature...
              </div>
              <p className="text-xs text-muted-foreground text-center max-w-xs">
                Open your phone camera and point it at this code. A link will appear to sign with your finger.
              </p>
            </>
          )}

          {status === "completed" && (
            <div className="flex flex-col items-center gap-4 py-8">
              <div className="h-16 w-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <Check className="h-8 w-8 text-green-600 dark:text-green-400" />
              </div>
              <p className="text-lg font-medium">Signature Received!</p>
              <p className="text-sm text-muted-foreground">Your signature has been captured from your mobile device.</p>
            </div>
          )}

          {status === "expired" && (
            <div className="flex flex-col items-center gap-4 py-8">
              <div className="h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center">
                <X className="h-8 w-8 text-destructive" />
              </div>
              <p className="text-lg font-medium">Session Expired</p>
              <p className="text-sm text-muted-foreground">The QR code has expired. Please try again.</p>
              <Button variant="outline" onClick={handleCancel}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Try Again
              </Button>
            </div>
          )}

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
        </div>

        <div className="flex justify-between">
          <Button variant="ghost" onClick={handleCancel}>
            Cancel
          </Button>
          {status === "completed" && (
            <Button onClick={handleCancel}>
              Continue
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
