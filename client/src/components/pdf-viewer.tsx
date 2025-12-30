import { useEffect, useRef, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Loader2, Check } from "lucide-react";
import type { SignatureSpot } from "@shared/schema";
import * as pdfjsLib from "pdfjs-dist";

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

// Extended spot type with optional label/inputMode for one-off documents
interface ExtendedSpot extends SignatureSpot {
  label?: string;
  inputMode?: "any" | "text" | "numeric";
  placeholder?: string;
}

// Text field spot component with popover input
function TextFieldSpot({
  spot,
  scale,
  spotY,
  isCompleted,
  isMySpot,
  textValue,
  onSubmit,
}: {
  spot: ExtendedSpot;
  scale: number;
  spotY: number;
  isCompleted: boolean;
  isMySpot: boolean;
  textValue?: string;
  onSubmit: (value: string) => void;
}) {
  const [inputValue, setInputValue] = useState(textValue || "");
  const [open, setOpen] = useState(false);
  const canEdit = isMySpot && !isCompleted;

  const handleSubmit = () => {
    if (inputValue.trim()) {
      onSubmit(inputValue.trim());
      setOpen(false);
    }
  };

  // Validate input based on inputMode
  const validateInput = (value: string): boolean => {
    if (!spot.inputMode || spot.inputMode === "any") return true;
    if (spot.inputMode === "numeric") return /^[\d.,\-+\s]*$/.test(value);
    if (spot.inputMode === "text") return /^[a-zA-Z\s\-'.]*$/.test(value);
    return true;
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    if (validateInput(newValue)) {
      setInputValue(newValue);
    }
  };

  const displayLabel = spot.placeholder || (spot.kind === "date" ? "Enter date" : "Enter text");
  const inputType = spot.kind === "date" ? "date" : (spot.inputMode === "numeric" ? "tel" : "text");

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className={`absolute border-2 border-dashed rounded-md flex flex-col items-start justify-center px-2 transition-all overflow-hidden ${
            isCompleted || textValue
              ? "border-green-500 bg-green-100/50 dark:bg-green-900/30"
              : canEdit
              ? "border-blue-500 bg-blue-100/50 dark:bg-blue-900/30 hover:bg-blue-200/50 cursor-pointer"
              : "border-muted-foreground/30 bg-muted/20"
          }`}
          style={{
            left: spot.x * scale,
            top: spotY,
            width: spot.w * scale,
            height: spot.h * scale,
          }}
          disabled={!canEdit}
          data-testid={`pdf-spot-${spot.spotKey}`}
        >
          {textValue ? (
            <span className="text-xs font-medium text-foreground truncate w-full">{textValue}</span>
          ) : canEdit ? (
            <span className="text-xs font-medium text-blue-600 dark:text-blue-400 truncate w-full">
              {displayLabel}
            </span>
          ) : spot.placeholder ? (
            <span className="text-xs text-muted-foreground truncate w-full">{spot.placeholder}</span>
          ) : null}
        </button>
      </PopoverTrigger>
      {canEdit && (
        <PopoverContent className="w-72 p-3" align="start">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium">
              {spot.placeholder || (spot.kind === "date" ? "Enter Date" : "Enter Text")}
            </label>
            {spot.inputMode && spot.inputMode !== "any" && (
              <span className="text-xs text-muted-foreground">
                {spot.inputMode === "numeric" ? "Numbers only" : "Letters only"}
              </span>
            )}
            <Input
              type={inputType}
              inputMode={spot.inputMode === "numeric" ? "numeric" : undefined}
              value={inputValue}
              onChange={handleChange}
              placeholder={spot.placeholder || (spot.kind === "date" ? "" : "Type here...")}
              className="h-9"
              data-testid={`input-text-${spot.spotKey}`}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            />
            <Button size="sm" onClick={handleSubmit} disabled={!inputValue.trim()} data-testid={`button-submit-${spot.spotKey}`}>
              <Check className="h-4 w-4 mr-1" />
              Confirm
            </Button>
          </div>
        </PopoverContent>
      )}
    </Popover>
  );
}

// Checkbox spot component
function CheckboxSpot({
  spot,
  scale,
  spotY,
  isCompleted,
  isMySpot,
  isChecked,
  onToggle,
}: {
  spot: ExtendedSpot;
  scale: number;
  spotY: number;
  isCompleted: boolean;
  isMySpot: boolean;
  isChecked: boolean;
  onToggle: (checked: boolean) => void;
}) {
  const canEdit = isMySpot && !isCompleted;

  return (
    <div
      className={`absolute border-2 border-dashed rounded-md flex items-center justify-center transition-all ${
        isCompleted || isChecked
          ? "border-green-500 bg-green-100/50 dark:bg-green-900/30"
          : canEdit
          ? "border-blue-500 bg-blue-100/50 dark:bg-blue-900/30"
          : "border-muted-foreground/30 bg-muted/20"
      }`}
      style={{
        left: spot.x * scale,
        top: spotY,
        width: spot.w * scale,
        height: spot.h * scale,
      }}
      data-testid={`pdf-spot-${spot.spotKey}`}
    >
      <Checkbox
        checked={isChecked}
        onCheckedChange={(checked) => canEdit && onToggle(checked === true)}
        disabled={!canEdit}
        className="h-5 w-5"
        data-testid={`checkbox-${spot.spotKey}`}
      />
    </div>
  );
}

interface PdfViewerProps {
  pdfUrl: string;
  spots: ExtendedSpot[];
  requiredSpotKeys: string[];
  uploadedSpots: string[];
  signatureImages?: Record<string, string>;
  textValues?: Record<string, string>;
  onSpotClick: (spot: ExtendedSpot) => void;
  onTextSubmit?: (spotKey: string, value: string) => void;
}

export function PdfViewer({ pdfUrl, spots, requiredSpotKeys, uploadedSpots, signatureImages = {}, textValues = {}, onSpotClick, onTextSubmit }: PdfViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [numPages, setNumPages] = useState(0);
  const [scale, setScale] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pageViewport, setPageViewport] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    if (!pdfUrl) return;

    setLoading(true);
    setError(null);

    const loadPdf = async () => {
      try {
        const loadingTask = pdfjsLib.getDocument(pdfUrl);
        const pdf = await loadingTask.promise;
        setPdfDoc(pdf);
        setNumPages(pdf.numPages);
        setCurrentPage(1);
      } catch (err) {
        console.error("Error loading PDF:", err);
        setError("Failed to load PDF document");
      } finally {
        setLoading(false);
      }
    };

    loadPdf();
  }, [pdfUrl]);

  const renderPage = useCallback(async () => {
    if (!pdfDoc || !canvasRef.current) return;

    try {
      const page = await pdfDoc.getPage(currentPage);
      const viewport = page.getViewport({ scale });

      const canvas = canvasRef.current;
      const context = canvas.getContext("2d");
      if (!context) return;

      canvas.height = viewport.height;
      canvas.width = viewport.width;
      setPageViewport({ width: viewport.width, height: viewport.height });

      const renderContext = {
        canvasContext: context,
        viewport: viewport,
      };

      await page.render(renderContext).promise;
    } catch (err) {
      console.error("Error rendering page:", err);
    }
  }, [pdfDoc, currentPage, scale]);

  useEffect(() => {
    renderPage();
  }, [renderPage]);

  const handlePrevPage = () => {
    if (currentPage > 1) setCurrentPage(currentPage - 1);
  };

  const handleNextPage = () => {
    if (currentPage < numPages) setCurrentPage(currentPage + 1);
  };

  const handleZoomIn = () => {
    setScale((prev) => Math.min(prev + 0.25, 3));
  };

  const handleZoomOut = () => {
    setScale((prev) => Math.max(prev - 0.25, 0.5));
  };

  const currentPageSpots = spots.filter((spot) => spot.page === currentPage);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96 bg-muted rounded-lg" data-testid="pdf-loading">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <p className="text-muted-foreground">Loading document...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-96 bg-muted rounded-lg" data-testid="pdf-error">
        <p className="text-destructive">{error}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4" data-testid="pdf-viewer">
      {/* Controls */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <Button
            size="icon"
            variant="outline"
            onClick={handlePrevPage}
            disabled={currentPage <= 1}
            data-testid="button-prev-page"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm min-w-[80px] text-center" data-testid="text-page-number">
            Page {currentPage} of {numPages}
          </span>
          <Button
            size="icon"
            variant="outline"
            onClick={handleNextPage}
            disabled={currentPage >= numPages}
            data-testid="button-next-page"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="icon"
            variant="outline"
            onClick={handleZoomOut}
            disabled={scale <= 0.5}
            data-testid="button-zoom-out"
          >
            <ZoomOut className="h-4 w-4" />
          </Button>
          <span className="text-sm min-w-[50px] text-center">{Math.round(scale * 100)}%</span>
          <Button
            size="icon"
            variant="outline"
            onClick={handleZoomIn}
            disabled={scale >= 3}
            data-testid="button-zoom-in"
          >
            <ZoomIn className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* PDF Canvas with signature spots overlay */}
      <div
        ref={containerRef}
        className="relative overflow-auto bg-muted rounded-lg p-4 max-h-[60vh]"
        style={{ touchAction: "pan-x pan-y" }}
      >
        <div className="relative inline-block shadow-lg">
          <canvas ref={canvasRef} className="block" />

          {/* Signature spot overlays */}
          {pageViewport &&
            currentPageSpots.map((spot) => {
              const signatureImageUrl = signatureImages[spot.spotKey];
              const textValue = textValues[spot.spotKey];
              const isSignedByAnyone = !!signatureImageUrl || !!textValue;
              const isMySpot = requiredSpotKeys.includes(spot.spotKey);
              const isSignedByMe = uploadedSpots.includes(spot.spotKey);
              const canSign = isMySpot && !isSignedByMe;
              const pdfHeight = 842 * scale; // A4 height in points at current scale
              const spotY = pdfHeight - (spot.y + spot.h) * scale;
              const isTextType = spot.kind === "text" || spot.kind === "date";
              const isCheckbox = spot.kind === "checkbox";

              // Render text/date field with popover input
              if (isTextType) {
                return (
                  <TextFieldSpot
                    key={spot.id}
                    spot={spot}
                    scale={scale}
                    spotY={spotY}
                    isCompleted={isSignedByMe}
                    isMySpot={isMySpot}
                    textValue={textValue}
                    onSubmit={(value) => onTextSubmit?.(spot.spotKey, value)}
                  />
                );
              }

              // Render checkbox field
              if (isCheckbox) {
                return (
                  <CheckboxSpot
                    key={spot.id}
                    spot={spot}
                    scale={scale}
                    spotY={spotY}
                    isCompleted={isSignedByMe}
                    isMySpot={isMySpot}
                    isChecked={textValue === "true"}
                    onToggle={(checked) => onTextSubmit?.(spot.spotKey, checked ? "true" : "false")}
                  />
                );
              }

              // Render signature/initial spots
              return (
                <button
                  key={spot.id}
                  className={`absolute border-2 border-dashed rounded-md flex items-center justify-center transition-all ${
                    isSignedByAnyone
                      ? "border-green-500 bg-green-100/50 dark:bg-green-900/30"
                      : canSign
                      ? "border-primary bg-primary/10 hover:bg-primary/20 cursor-pointer"
                      : "border-muted-foreground/30 bg-muted/20"
                  }`}
                  style={{
                    left: spot.x * scale,
                    top: spotY,
                    width: spot.w * scale,
                    height: spot.h * scale,
                  }}
                  onClick={() => canSign && onSpotClick(spot)}
                  disabled={!canSign}
                  data-testid={`pdf-spot-${spot.spotKey}`}
                >
                  {isSignedByAnyone && signatureImageUrl ? (
                    <img
                      src={signatureImageUrl}
                      alt="Signature"
                      className="w-full h-full object-contain"
                      style={{ maxWidth: "100%", maxHeight: "100%" }}
                    />
                  ) : canSign ? (
                    <span className="text-xs font-medium text-primary">
                      {spot.kind === "initial" ? "Initial here" : "Sign here"}
                    </span>
                  ) : null}
                </button>
              );
            })}
        </div>
      </div>
    </div>
  );
}
