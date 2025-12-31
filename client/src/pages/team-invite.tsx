import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Users, Check, X, AlertCircle } from "lucide-react";
import { Link, useLocation } from "wouter";
import { useEffect, useState } from "react";

export default function TeamInvitePage() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [token, setToken] = useState<string | null>(null);
  const [status, setStatus] = useState<"loading" | "pending" | "accepted" | "declined" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const inviteToken = params.get("token");
    if (inviteToken) {
      setToken(inviteToken);
      setStatus("pending");
    } else {
      setStatus("error");
      setErrorMessage("No invitation token provided");
    }
  }, []);

  const { data: authUser, isLoading: isAuthLoading } = useQuery<{ id: string; email: string } | null>({
    queryKey: ["/api/auth/user"],
  });

  const acceptMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/team/invite/accept", { token });
    },
    onSuccess: () => {
      setStatus("accepted");
      queryClient.invalidateQueries({ queryKey: ["/api/team"] });
      toast({
        title: "Welcome to the Team!",
        description: "You have successfully joined the team.",
      });
    },
    onError: (error: Error) => {
      setStatus("error");
      setErrorMessage(error.message);
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const declineMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/team/invite/decline", { token });
    },
    onSuccess: () => {
      setStatus("declined");
      toast({
        title: "Invitation Declined",
        description: "You have declined the team invitation.",
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

  if (isAuthLoading || status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center" data-testid="loading-invite">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!authUser) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <Users className="h-6 w-6 text-primary" />
            </div>
            <CardTitle>Team Invitation</CardTitle>
            <CardDescription>
              Please sign in to accept this team invitation
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-center text-sm text-muted-foreground">
              You need to be signed in to join a team. Please sign in with the email address that received this invitation.
            </p>
            <div className="flex justify-center">
              <Link href={`/?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`}>
                <Button data-testid="button-sign-in">Sign In</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (status === "accepted") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mb-4">
              <Check className="h-6 w-6 text-green-600 dark:text-green-400" />
            </div>
            <CardTitle>Welcome to the Team!</CardTitle>
            <CardDescription>
              You have successfully joined the team
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-center text-sm text-muted-foreground">
              You now have access to the shared document workspace. All documents and templates are shared with your team.
            </p>
            <div className="flex justify-center">
              <Link href="/dashboard">
                <Button data-testid="button-go-dashboard">Go to Dashboard</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (status === "declined") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
              <X className="h-6 w-6 text-muted-foreground" />
            </div>
            <CardTitle>Invitation Declined</CardTitle>
            <CardDescription>
              You have declined this team invitation
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-center">
              <Link href="/dashboard">
                <Button variant="outline" data-testid="button-go-dashboard">Go to Dashboard</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
              <AlertCircle className="h-6 w-6 text-destructive" />
            </div>
            <CardTitle>Invalid Invitation</CardTitle>
            <CardDescription>
              {errorMessage || "This invitation is invalid or has expired"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-center">
              <Link href="/dashboard">
                <Button variant="outline" data-testid="button-go-dashboard">Go to Dashboard</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
            <Users className="h-6 w-6 text-primary" />
          </div>
          <CardTitle>Team Invitation</CardTitle>
          <CardDescription>
            You have been invited to join a team
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-center text-sm text-muted-foreground">
            By joining this team, you will have access to the shared document workspace. 
            All documents and templates will be shared with your team members.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Button
              onClick={() => acceptMutation.mutate()}
              disabled={acceptMutation.isPending || declineMutation.isPending}
              data-testid="button-accept-invite"
            >
              {acceptMutation.isPending ? "Joining..." : "Join Team"}
            </Button>
            <Button
              variant="outline"
              onClick={() => declineMutation.mutate()}
              disabled={acceptMutation.isPending || declineMutation.isPending}
              data-testid="button-decline-invite"
            >
              {declineMutation.isPending ? "Declining..." : "Decline"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
