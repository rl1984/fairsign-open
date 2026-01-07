import { Link } from "wouter";
import { FileSignature } from "lucide-react";

export function Footer() {
  const currentYear = new Date().getFullYear();
  
  return (
    <footer className="py-4 px-4 text-center border-t bg-background mt-auto">
      <div className="container mx-auto">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <FileSignature className="h-4 w-4 text-primary" />
            <span className="text-sm text-muted-foreground">
              {currentYear} FairSign.io. All rights reserved.
            </span>
          </div>
          <div className="flex items-center gap-4 flex-wrap">
            <Link href="/terms">
              <span className="text-sm text-muted-foreground hover:text-foreground cursor-pointer" data-testid="link-footer-terms">
                Terms of Service
              </span>
            </Link>
            <Link href="/privacy">
              <span className="text-sm text-muted-foreground hover:text-foreground cursor-pointer" data-testid="link-footer-privacy">
                Privacy Policy
              </span>
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
