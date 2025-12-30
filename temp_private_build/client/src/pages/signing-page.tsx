import { useState, useEffect, useCallback } from "react";
import { useParams, useSearch } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { Loader2, CheckCircle, Pencil, FileText, AlertCircle } from "lucide-react";
import { PdfViewer } from "@/components/pdf-viewer";
import { SignaturePad } from "@/components/signature-pad";
import { SignatureQrModal } from "@/components/signature-qr-modal";
import type { DocumentMetadata, SignatureSpot } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";

export default function SigningPage() {
  const params = useParams<{ id: string }>();
  const searchString = useSearch();
  const token = new URLSearchParams(searchString).get("token") || "";
  const { toast } = useToast();

  const [currentSpot, setCurrentSpot] = useState<SignatureSpot | null>(null);
  const [showSignaturePad, setShowSignaturePad] = useState(false);
  const [consentChecked, setConsentChecked] = useState(false);
  const [uploadedSpots, setUploadedSpots] = useState<string[]>([]);
  const [signatureImages, setSignatureImages] = useState<Record<string, string>>({});
  const [textValues, setTextValues] = useState<Record<string, string>>({});
  const [signingComplete, setSigningComplete] = useState<{ documentComplete: boolean } | null>(null);
  const [showQrModal, setShowQrModal] = useState(false);
  const [qrSessionToken, setQrSessionToken] = useState<string>("");
  const [isCreatingSession, setIsCreatingSession] = useState(false);

  const { data: docMetadata, isLoading, error } = useQuery<DocumentMetadata>({
    queryKey: ["/api/documents", params.id, token],
    queryFn: async () => {
      const res = await fetch(`/api/documents/${params.id}?token=${token}`);
      if (!res.ok) {
        throw new Error("Failed to load document");
      }
      return res.json();
    },
    enabled: !!params.id && !!token,
  });

  useEffect(() => {
    if (docMetadata?.uploadedSpots) {
      setUploadedSpots(docMetadata.uploadedSpots);
    }
    if (docMetadata?.signatureImages) {
      setSignatureImages(docMetadata.signatureImages);
    }
    if (docMetadata?.textValues) {
      setTextValues(docMetadata.textValues);
    }
  }, [docMetadata]);

  const uploadSignatureMutation = useMutation({
    mutationFn: async ({ spotKey, imageBlob }: { spotKey: string; imageBlob: Blob }) => {
      const formData = new FormData();
      formData.append("spot_key", spotKey);
      formData.append("image", imageBlob, "signature.png");

      const res = await fetch(`/api/documents/${params.id}/signatures?token=${token}`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        throw new Error("Failed to upload signature");
      }
      return res.json();
    },
    onSuccess: (data, variables) => {
      setUploadedSpots((prev) => [...prev, variables.spotKey]);
      // Add the new signature image URL 
      const newImageUrl = `/api/documents/${params.id}/signature-image/${variables.spotKey}?token=${token}`;
      setSignatureImages((prev) => ({ ...prev, [variables.spotKey]: newImageUrl }));
      setShowSignaturePad(false);
      setCurrentSpot(null);
      toast({
        title: "Signature saved",
        description: `Your ${currentSpot?.kind === "initial" ? "initials" : "signature"} has been captured.`,
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to save signature. Please try again.",
        variant: "destructive",
      });
    },
  });

  const submitTextMutation = useMutation({
    mutationFn: async ({ spotKey, value }: { spotKey: string; value: string }) => {
      const res = await fetch(`/api/documents/${params.id}/text-field?token=${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spotKey, value }),
      });

      if (!res.ok) {
        throw new Error("Failed to save text value");
      }
      return res.json();
    },
    onSuccess: (data, variables) => {
      setUploadedSpots((prev) => [...prev, variables.spotKey]);
      setTextValues((prev) => ({ ...prev, [variables.spotKey]: variables.value }));
      toast({
        title: "Saved",
        description: "Your entry has been recorded.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to save. Please try again.",
        variant: "destructive",
      });
    },
  });

  const completeMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/documents/${params.id}/complete?token=${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consent: true }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to complete signing");
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/documents", params.id] });
      const documentComplete = data?.documentStatus === "completed";
      setSigningComplete({ documentComplete });
      toast({
        title: "Signing complete",
        description: documentComplete 
          ? "The document has been fully signed by all parties!" 
          : "Your signature has been recorded successfully.",
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

  const handleSpotClick = useCallback((spot: SignatureSpot) => {
    if (!uploadedSpots.includes(spot.spotKey)) {
      setCurrentSpot(spot);
      setShowSignaturePad(true);
    }
  }, [uploadedSpots]);

  const handleTextSubmit = useCallback((spotKey: string, value: string) => {
    submitTextMutation.mutate({ spotKey, value });
  }, [submitTextMutation]);

  const handleSignatureComplete = useCallback(async (dataUrl: string) => {
    if (!currentSpot) return;

    const res = await fetch(dataUrl);
    const blob = await res.blob();
    uploadSignatureMutation.mutate({ spotKey: currentSpot.spotKey, imageBlob: blob });
  }, [currentSpot, uploadSignatureMutation]);

  const handleComplete = useCallback(() => {
    if (!consentChecked) {
      toast({
        title: "Consent required",
        description: "Please check the consent box to complete signing.",
        variant: "destructive",
      });
      return;
    }
    completeMutation.mutate();
  }, [consentChecked, completeMutation, toast]);

  const handleMobileSign = useCallback(async () => {
    if (!currentSpot || !docMetadata?.signerId) return;
    
    setIsCreatingSession(true);
    try {
      const res = await fetch("/api/signer-sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentId: params.id,
          signerId: docMetadata.signerId,
          spotKey: currentSpot.spotKey,
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to create signing session");
      }

      const data = await res.json();
      setQrSessionToken(data.sessionToken);
      setShowSignaturePad(false);
      setShowQrModal(true);
    } catch (err) {
      toast({
        title: "Error",
        description: "Failed to create mobile signing session. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsCreatingSession(false);
    }
  }, [currentSpot, docMetadata?.signerId, params.id, toast]);

  const handleQrSignatureComplete = useCallback((completedSpotKey: string) => {
    if (!completedSpotKey) return;
    
    setUploadedSpots((prev) => [...prev, completedSpotKey]);
    const newImageUrl = `/api/documents/${params.id}/signature-image/${completedSpotKey}?token=${token}&t=${Date.now()}`;
    setSignatureImages((prev) => ({ ...prev, [completedSpotKey]: newImageUrl }));
    
    toast({
      title: "Signature saved",
      description: "Your signature has been captured from your mobile device.",
    });
    
    setShowQrModal(false);
    setQrSessionToken("");
    setCurrentSpot(null);
  }, [params.id, token, toast]);

  const handleQrModalClose = useCallback(() => {
    setShowQrModal(false);
    setQrSessionToken("");
    setCurrentSpot(null);
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background" data-testid="loading-state">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
          <p className="text-muted-foreground text-lg">Loading document...</p>
        </div>
      </div>
    );
  }

  if (error || !docMetadata) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4" data-testid="error-state">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center gap-4 text-center">
              <AlertCircle className="h-16 w-16 text-destructive" />
              <h2 className="text-xl font-medium">Unable to load document</h2>
              <p className="text-muted-foreground">
                The signing link may be invalid or expired. Please contact the sender for a new link.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (docMetadata.status === "completed" || signingComplete) {
    const isFullyComplete = docMetadata.status === "completed" || signingComplete?.documentComplete;
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4" data-testid="completed-state">
        <Card className="max-w-lg w-full">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center gap-4 text-center">
              <CheckCircle className="h-16 w-16 text-green-500" />
              <h2 className="text-xl font-medium">
                {isFullyComplete ? "Document Completed" : "Thank You for Signing"}
              </h2>
              <p className="text-muted-foreground">
                {isFullyComplete 
                  ? "This document has been signed by all parties and is now complete." 
                  : "Your signature has been recorded. Once all remaining parties have signed, you will receive an email with a complete copy of the signed document."}
              </p>
              <p className="text-sm text-muted-foreground mt-2">
                You may now close this window.
              </p>
              <div className="mt-6 pt-6 border-t w-full">
                <p className="text-xs text-muted-foreground">
                  I agree that my electronic signature is the legal equivalent of my manual signature on this document.
                </p>
                <p className="text-xs text-muted-foreground mt-4">
                  &copy; {new Date().getFullYear()} FairSign.io. All Rights Reserved.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const allSpots = docMetadata.spots || [];
  const requiredSpotKeys = docMetadata.requiredSpotKeys || [];
  const requiredSpots = allSpots.filter(s => requiredSpotKeys.includes(s.spotKey));
  const completedCount = uploadedSpots.length;
  const totalCount = requiredSpotKeys.length;
  const progress = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;
  const allSigned = completedCount === totalCount && totalCount > 0;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Sticky header with progress */}
      <header className="sticky top-0 z-50 bg-background border-b px-4 py-3">
        <div className="max-w-4xl mx-auto flex flex-col gap-2">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              <span className="font-medium text-sm md:text-base">{docMetadata?.title || "Document"}</span>
            </div>
            <span className="text-sm text-muted-foreground" data-testid="text-progress">
              {completedCount} of {totalCount} completed
            </span>
          </div>
          <Progress value={progress} className="h-2" data-testid="progress-bar" />
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 flex flex-col lg:flex-row max-w-7xl mx-auto w-full">
        {/* PDF Viewer */}
        <div className="flex-1 p-4 lg:p-6">
          <PdfViewer
            pdfUrl={docMetadata.unsignedPdfUrl}
            spots={allSpots}
            requiredSpotKeys={requiredSpotKeys}
            uploadedSpots={uploadedSpots}
            signatureImages={signatureImages}
            textValues={textValues}
            onSpotClick={handleSpotClick}
            onTextSubmit={handleTextSubmit}
          />
        </div>

        {/* Sidebar - Signature checklist */}
        <aside className="w-full lg:w-80 border-t lg:border-t-0 lg:border-l p-4 lg:p-6 bg-card">
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-lg flex items-center gap-2">
                <Pencil className="h-5 w-5" />
                Required Signatures
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {requiredSpots.map((spot) => {
                const isCompleted = uploadedSpots.includes(spot.spotKey);
                return (
                  <div
                    key={spot.id}
                    className={`flex items-center justify-between gap-2 p-3 rounded-lg border transition-colors ${
                      isCompleted
                        ? "bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800"
                        : "bg-background border-border hover-elevate cursor-pointer"
                    }`}
                    onClick={() => !isCompleted && handleSpotClick(spot)}
                    data-testid={`spot-item-${spot.spotKey}`}
                  >
                    <div className="flex items-center gap-3">
                      {isCompleted ? (
                        <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                      ) : (
                        <div className="h-5 w-5 rounded-full border-2 border-muted-foreground flex-shrink-0" />
                      )}
                      <div>
                        <p className="font-medium text-sm capitalize">
                          {spot.kind === "initial" ? "Initials" : "Signature"}
                        </p>
                        <p className="text-xs text-muted-foreground">Page {spot.page}</p>
                      </div>
                    </div>
                    {!isCompleted && (
                      <Button size="sm" variant="outline" data-testid={`button-sign-${spot.spotKey}`}>
                        Sign
                      </Button>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* Completion section */}
          {allSigned && (
            <Card className="mt-4">
              <CardContent className="pt-6 space-y-4">
                <div className="flex items-start gap-3">
                  <Checkbox
                    id="consent"
                    checked={consentChecked}
                    onCheckedChange={(checked) => setConsentChecked(checked === true)}
                    className="mt-0.5"
                    data-testid="checkbox-consent"
                  />
                  <label htmlFor="consent" className="text-sm leading-relaxed cursor-pointer">
                    I agree that my electronic signature is the legal equivalent of my manual signature on this document.
                  </label>
                </div>
                <Button
                  className="w-full"
                  size="lg"
                  onClick={handleComplete}
                  disabled={!consentChecked || completeMutation.isPending}
                  data-testid="button-complete"
                >
                  {completeMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Completing...
                    </>
                  ) : (
                    "Complete Signing"
                  )}
                </Button>
              </CardContent>
            </Card>
          )}
        </aside>
      </main>

      {/* Signature Pad Modal */}
      <SignaturePad
        isOpen={showSignaturePad}
        onClose={() => {
          setShowSignaturePad(false);
          setCurrentSpot(null);
        }}
        onComplete={handleSignatureComplete}
        isInitial={currentSpot?.kind === "initial"}
        isLoading={uploadSignatureMutation.isPending || isCreatingSession}
        onMobileSign={docMetadata?.signerId ? handleMobileSign : undefined}
      />

      {/* QR Code Modal for Mobile Signing */}
      <SignatureQrModal
        isOpen={showQrModal}
        onClose={handleQrModalClose}
        sessionToken={qrSessionToken}
        spotKey={currentSpot?.spotKey || ""}
        onSignatureComplete={handleQrSignatureComplete}
      />
    </div>
  );
}
