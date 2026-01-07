import { useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Bold, Italic, Underline } from "lucide-react";
import DOMPurify from "dompurify";

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  "data-testid"?: string;
}

export function RichTextEditor({
  value,
  onChange,
  placeholder = "Write your content here...",
  className = "",
  "data-testid": testId,
}: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const isInternalChange = useRef(false);

  useEffect(() => {
    if (editorRef.current && !isInternalChange.current) {
      const sanitizedValue = DOMPurify.sanitize(value);
      if (editorRef.current.innerHTML !== sanitizedValue) {
        editorRef.current.innerHTML = sanitizedValue;
      }
    }
    isInternalChange.current = false;
  }, [value]);

  const handleInput = useCallback(() => {
    if (editorRef.current) {
      isInternalChange.current = true;
      onChange(editorRef.current.innerHTML);
    }
  }, [onChange]);

  const execCommand = useCallback((command: string) => {
    document.execCommand(command, false);
    editorRef.current?.focus();
    handleInput();
  }, [handleInput]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey) {
      switch (e.key.toLowerCase()) {
        case "b":
          e.preventDefault();
          execCommand("bold");
          break;
        case "i":
          e.preventDefault();
          execCommand("italic");
          break;
        case "u":
          e.preventDefault();
          execCommand("underline");
          break;
      }
    }
  }, [execCommand]);

  return (
    <div className="border rounded-md overflow-hidden">
      <div className="flex items-center gap-1 p-2 border-b bg-muted/30">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => execCommand("bold")}
          title="Bold (Ctrl+B)"
          data-testid="button-format-bold"
        >
          <Bold className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => execCommand("italic")}
          title="Italic (Ctrl+I)"
          data-testid="button-format-italic"
        >
          <Italic className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => execCommand("underline")}
          title="Underline (Ctrl+U)"
          data-testid="button-format-underline"
        >
          <Underline className="h-4 w-4" />
        </Button>
        <span className="text-xs text-muted-foreground ml-2">
          Select text and click a button to format
        </span>
      </div>
      <div
        ref={editorRef}
        contentEditable
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        className={`min-h-[200px] p-3 focus:outline-none ${className}`}
        data-testid={testId}
        data-placeholder={placeholder}
        style={{
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      />
      <style>{`
        [contenteditable]:empty:before {
          content: attr(data-placeholder);
          color: hsl(var(--muted-foreground));
          pointer-events: none;
        }
      `}</style>
    </div>
  );
}
