import { useState, useRef, useEffect } from "react";
import { useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Loader2, Check, Trash2, PenTool, AlertCircle } from "lucide-react";
import SignaturePad from "signature_pad";

type SessionStatus = "loading" | "ready" | "signing" | "submitting" | "completed" | "expired" | "error";

export default function MobileSignature() {
  const { sessionToken } = useParams<{ sessionToken: string }>();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const signaturePadRef = useRef<SignaturePad | null>(null);
  const [status, setStatus] = useState<SessionStatus>("loading");
  const [error, setError] = useState<string>("");
  const [sessionData, setSessionData] = useState<{
    documentTitle?: string;
    signerName?: string;
    spotLabel?: string;
  } | null>(null);

  useEffect(() => {
    const verifySession = async () => {
      try {
        const res = await fetch(`/api/signer-sessions/${sessionToken}/verify`);
        if (!res.ok) {
          const data = await res.json();
          if (data.error === "Session expired") {
            setStatus("expired");
          } else {
            setError(data.error || "Invalid session");
            setStatus("error");
          }
          return;
        }
        const data = await res.json();
        setSessionData({
          documentTitle: data.documentTitle,
          signerName: data.signerName,
          spotLabel: data.spotLabel,
        });
        setStatus("ready");
      } catch (err) {
        setError("Failed to verify session");
        setStatus("error");
      }
    };

    verifySession();
  }, [sessionToken]);

  useEffect(() => {
    if (status !== "ready" && status !== "signing") return;
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;
    const container = canvas.parentElement;
    if (!container) return;

    const resizeCanvas = () => {
      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.scale(dpr, dpr);
      }
    };

    resizeCanvas();

    if (!signaturePadRef.current) {
      signaturePadRef.current = new SignaturePad(canvas, {
        backgroundColor: "rgb(255, 255, 255)",
        penColor: "rgb(0, 0, 0)",
        minWidth: 1.5,
        maxWidth: 3,
      });

      signaturePadRef.current.addEventListener("beginStroke", () => {
        setStatus("signing");
      });
    }

    window.addEventListener("resize", resizeCanvas);
    return () => window.removeEventListener("resize", resizeCanvas);
  }, [status]);

  const clearSignature = () => {
    signaturePadRef.current?.clear();
    setStatus("ready");
  };

  const submitSignature = async () => {
    if (!signaturePadRef.current || signaturePadRef.current.isEmpty()) return;

    setStatus("submitting");

    try {
      const dataUrl = signaturePadRef.current.toDataURL("image/png");
      const blob = await fetch(dataUrl).then((r) => r.blob());

      const formData = new FormData();
      formData.append("signature", blob, "signature.png");

      const res = await fetch(`/api/signer-sessions/${sessionToken}/submit`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to submit signature");
      }

      setStatus("completed");
    } catch (err: any) {
      setError(err.message || "Failed to submit signature");
      setStatus("error");
    }
  };

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center py-12">
            <Loader2 className="h-12 w-12 animate-spin text-muted-foreground" />
            <p className="mt-4 text-muted-foreground">Verifying session...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (status === "expired") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center py-12">
            <div className="h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
              <AlertCircle className="h-8 w-8 text-destructive" />
            </div>
            <h2 className="text-xl font-semibold mb-2">Session Expired</h2>
            <p className="text-muted-foreground text-center">
              This signing session has expired. Please scan the QR code again from your computer.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center py-12">
            <div className="h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
              <AlertCircle className="h-8 w-8 text-destructive" />
            </div>
            <h2 className="text-xl font-semibold mb-2">Error</h2>
            <p className="text-muted-foreground text-center">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (status === "completed") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center py-12">
            <div className="h-20 w-20 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mb-4">
              <Check className="h-10 w-10 text-green-600 dark:text-green-400" />
            </div>
            <h2 className="text-xl font-semibold mb-2">Signature Submitted!</h2>
            <p className="text-muted-foreground text-center">
              Your signature has been captured. You can close this page and return to your computer.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="p-4 border-b bg-background">
        <div className="flex items-center gap-2">
          <PenTool className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-semibold">Sign Document</h1>
        </div>
        {sessionData?.documentTitle && (
          <p className="text-sm text-muted-foreground mt-1">{sessionData.documentTitle}</p>
        )}
      </header>

      <main className="flex-1 flex flex-col p-4">
        <Card className="flex-1 flex flex-col">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              {sessionData?.spotLabel || "Your Signature"}
            </CardTitle>
            <CardDescription>
              Use your finger to sign below
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1 p-0">
            <div className="relative h-full min-h-[250px] mx-4 mb-4 border-2 border-dashed rounded-lg overflow-hidden">
              <canvas
                ref={canvasRef}
                className="absolute inset-0 touch-none"
                data-testid="canvas-mobile-signature"
              />
              {status === "ready" && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <p className="text-muted-foreground text-sm">Sign here</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="flex gap-3 mt-4">
          <Button
            variant="outline"
            className="flex-1"
            onClick={clearSignature}
            disabled={status === "submitting"}
            data-testid="button-clear-mobile-signature"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Clear
          </Button>
          <Button
            className="flex-1"
            onClick={submitSignature}
            disabled={status !== "signing" || !signaturePadRef.current || signaturePadRef.current.isEmpty()}
            data-testid="button-submit-mobile-signature"
          >
            {status === "submitting" ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Submitting...
              </>
            ) : (
              <>
                <Check className="h-4 w-4 mr-2" />
                Submit Signature
              </>
            )}
          </Button>
        </div>
      </main>
    </div>
  );
}
