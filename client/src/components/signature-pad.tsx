import { useRef, useEffect, useState, useCallback, useLayoutEffect } from "react";
import SignaturePadLib from "signature_pad";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Eraser, Check, Loader2, X, Smartphone } from "lucide-react";

interface SignaturePadProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: (dataUrl: string) => void;
  isInitial?: boolean;
  isLoading?: boolean;
  onMobileSign?: () => void;
}

export function SignaturePad({
  isOpen,
  onClose,
  onComplete,
  isInitial = false,
  isLoading = false,
  onMobileSign,
}: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const signaturePadRef = useRef<SignaturePadLib | null>(null);
  const [isEmpty, setIsEmpty] = useState(true);
  const [isReady, setIsReady] = useState(false);

  const setupCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return false;

    const rect = container.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return false;

    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    
    canvas.width = rect.width * ratio;
    canvas.height = rect.height * ratio;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;

    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.scale(ratio, ratio);
    }

    return true;
  }, []);

  const initializeSignaturePad = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (signaturePadRef.current) {
      signaturePadRef.current.off();
      signaturePadRef.current = null;
    }

    if (!setupCanvas()) return;

    signaturePadRef.current = new SignaturePadLib(canvas, {
      backgroundColor: "rgb(255, 255, 255)",
      penColor: "rgb(0, 0, 0)",
      minWidth: 1,
      maxWidth: 3,
    });

    signaturePadRef.current.addEventListener("beginStroke", () => {
      setIsEmpty(false);
    });

    signaturePadRef.current.clear();
    setIsEmpty(true);
    setIsReady(true);
  }, [setupCanvas]);

  useLayoutEffect(() => {
    if (!isOpen) {
      setIsReady(false);
      return;
    }

    let animationId: number;
    let attemptCount = 0;
    const maxAttempts = 30;

    const tryInitialize = () => {
      attemptCount++;
      const canvas = canvasRef.current;
      const container = containerRef.current;
      
      if (canvas && container) {
        const rect = container.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          initializeSignaturePad();
          return;
        }
      }
      
      if (attemptCount < maxAttempts) {
        animationId = requestAnimationFrame(tryInitialize);
      }
    };

    animationId = requestAnimationFrame(tryInitialize);

    return () => {
      cancelAnimationFrame(animationId);
    };
  }, [isOpen, initializeSignaturePad]);

  useEffect(() => {
    if (!isOpen) return;

    const handleResize = () => {
      if (signaturePadRef.current && !signaturePadRef.current.isEmpty()) {
        return;
      }
      initializeSignaturePad();
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [isOpen, initializeSignaturePad]);

  useEffect(() => {
    return () => {
      if (signaturePadRef.current) {
        signaturePadRef.current.off();
        signaturePadRef.current = null;
      }
    };
  }, []);

  const handleClear = () => {
    signaturePadRef.current?.clear();
    setIsEmpty(true);
  };

  const handleSave = () => {
    if (!signaturePadRef.current || signaturePadRef.current.isEmpty()) return;
    const dataUrl = signaturePadRef.current.toDataURL("image/png");
    onComplete(dataUrl);
  };

  const handleClose = () => {
    setIsEmpty(true);
    setIsReady(false);
    if (signaturePadRef.current) {
      signaturePadRef.current.off();
      signaturePadRef.current = null;
    }
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-xl w-[95vw] p-0 gap-0">
        <DialogHeader className="p-6 pb-4">
          <DialogTitle className="text-xl">
            {isInitial ? "Draw Your Initials" : "Draw Your Signature"}
          </DialogTitle>
          <DialogDescription>
            Use your finger or stylus to {isInitial ? "write your initials" : "sign"} in the box below.
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 pb-4">
          <div
            ref={containerRef}
            className={`relative border-2 rounded-lg overflow-hidden ${
              isInitial ? "aspect-[2/1]" : "aspect-[3/2]"
            }`}
            style={{ touchAction: "none" }}
          >
            <canvas
              ref={canvasRef}
              className="absolute inset-0 w-full h-full cursor-crosshair"
              style={{ 
                touchAction: "none",
                pointerEvents: isReady ? "auto" : "none"
              }}
              data-testid="signature-canvas"
            />
            {isEmpty && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <span className="text-muted-foreground text-sm">
                  {isInitial ? "Write your initials here" : "Sign here"}
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-3 p-6 pt-2 border-t bg-muted/50">
          {onMobileSign && (
            <Button
              variant="outline"
              onClick={onMobileSign}
              disabled={isLoading}
              className="w-full"
              data-testid="button-mobile-sign"
            >
              <Smartphone className="h-4 w-4 mr-2" />
              Sign on Mobile Device
            </Button>
          )}
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={handleClose}
              disabled={isLoading}
              data-testid="button-cancel-signature"
            >
              <X className="h-4 w-4 mr-2" />
              Cancel
            </Button>
            <Button
              variant="outline"
              onClick={handleClear}
              disabled={isLoading}
              className="flex-1"
              data-testid="button-clear-signature"
            >
              <Eraser className="h-4 w-4 mr-2" />
              Clear
            </Button>
            <Button
              onClick={handleSave}
              disabled={isEmpty || isLoading}
              className="flex-1"
              data-testid="button-save-signature"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Check className="h-4 w-4 mr-2" />
                  Save
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
