import { useQuery } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { BookOpen, ChevronRight, ArrowLeft, Home } from "lucide-react";

interface UserGuide {
  id: string;
  title: string;
  slug: string;
  content: string;
  sortOrder: number;
  published: boolean;
  createdAt: string;
  updatedAt: string;
}

function GuideSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-3/4" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-2/3" />
    </div>
  );
}

export default function UserGuidePage() {
  const [location, setLocation] = useLocation();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  
  const pathParts = location.split("/");
  const slug = pathParts.length > 2 ? pathParts[2] : null;

  const { data: guides, isLoading: guidesLoading } = useQuery<UserGuide[]>({
    queryKey: ["/api/guides"],
    enabled: isAuthenticated,
  });

  const { data: currentGuide, isLoading: guideLoading, error: guideError } = useQuery<UserGuide>({
    queryKey: ["/api/guides", slug],
    enabled: isAuthenticated && !!slug,
  });

  if (authLoading) {
    return (
      <div className="container mx-auto py-8 px-4">
        <GuideSkeleton />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="container mx-auto py-8 px-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-8">
              <BookOpen className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h2 className="text-xl font-semibold mb-2">Please sign in</h2>
              <p className="text-muted-foreground mb-4">
                You need to be signed in to access user guides.
              </p>
              <Link href="/">
                <Button data-testid="button-go-to-login">
                  Go to Login
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!slug) {
    return (
      <div className="container mx-auto py-8 px-4 max-w-4xl">
        <div className="mb-6">
          <Link href="/dashboard">
            <Button variant="ghost" size="sm" data-testid="button-back-to-dashboard">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Dashboard
            </Button>
          </Link>
        </div>
        
        <div className="flex items-center gap-3 mb-6">
          <BookOpen className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-3xl font-bold" data-testid="text-guides-title">User Guides</h1>
            <p className="text-muted-foreground">Learn how to use the platform</p>
          </div>
        </div>

        {guidesLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Card key={i}>
                <CardContent className="pt-6">
                  <GuideSkeleton />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : guides && guides.length > 0 ? (
          <div className="space-y-3">
            {guides.map((guide) => (
              <Card 
                key={guide.id} 
                className="hover-elevate cursor-pointer transition-all"
                onClick={() => setLocation(`/guides/${guide.slug}`)}
                data-testid={`card-guide-${guide.id}`}
              >
                <CardContent className="flex items-center justify-between py-4">
                  <div className="flex items-center gap-3">
                    <BookOpen className="h-5 w-5 text-muted-foreground" />
                    <span className="font-medium" data-testid={`text-guide-title-${guide.id}`}>
                      {guide.title}
                    </span>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="pt-6">
              <div className="text-center py-8">
                <BookOpen className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h2 className="text-xl font-semibold mb-2">No guides available</h2>
                <p className="text-muted-foreground">
                  User guides will appear here once they are published.
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  if (guideLoading) {
    return (
      <div className="container mx-auto py-8 px-4 max-w-4xl">
        <Card>
          <CardContent className="pt-6">
            <GuideSkeleton />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (guideError || !currentGuide) {
    return (
      <div className="container mx-auto py-8 px-4 max-w-4xl">
        <div className="mb-6">
          <Link href="/guides">
            <Button variant="ghost" size="sm" data-testid="button-back-to-guides">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Guides
            </Button>
          </Link>
        </div>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-8">
              <BookOpen className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h2 className="text-xl font-semibold mb-2">Guide not found</h2>
              <p className="text-muted-foreground mb-4">
                The requested guide could not be found.
              </p>
              <Link href="/guides">
                <Button data-testid="button-browse-guides">
                  Browse Guides
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 px-4 max-w-4xl">
      <div className="mb-6">
        <Link href="/guides">
          <Button variant="ghost" size="sm" data-testid="button-back-to-guides">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Guides
          </Button>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-2xl" data-testid="text-current-guide-title">
            {currentGuide.title}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div 
            className="prose prose-slate dark:prose-invert max-w-none [&_br]:block [&_br]:my-2"
            data-testid="text-guide-content"
            style={{ whiteSpace: "pre-wrap" }}
            dangerouslySetInnerHTML={{ __html: currentGuide.content }}
          />
        </CardContent>
      </Card>

      {guides && guides.length > 1 && (
        <div className="mt-8">
          <h3 className="text-lg font-semibold mb-4">Other Guides</h3>
          <div className="space-y-2">
            {guides
              .filter((g) => g.slug !== slug)
              .map((guide) => (
                <Card 
                  key={guide.id}
                  className="hover-elevate cursor-pointer"
                  onClick={() => setLocation(`/guides/${guide.slug}`)}
                  data-testid={`card-other-guide-${guide.id}`}
                >
                  <CardContent className="flex items-center justify-between py-3">
                    <div className="flex items-center gap-3">
                      <BookOpen className="h-4 w-4 text-muted-foreground" />
                      <span>{guide.title}</span>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </CardContent>
                </Card>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
