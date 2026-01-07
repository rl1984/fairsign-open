import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Users, UserPlus, Crown, Trash2, LogOut, Mail, Clock, Copy, Shield, Lock } from "lucide-react";
import { Link, useLocation } from "wouter";
import { useState } from "react";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface TeamMember {
  id: string;
  userId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: string;
  joinedAt: string;
}

interface PendingInvitation {
  id: string;
  email: string;
  status: string;
  createdAt: string;
  expiresAt: string;
}

interface TeamData {
  hasTeam: boolean;
  isOwner: boolean;
  accountType: string;
  canCreateTeam?: boolean;
  message?: string;
  organization?: {
    id: string;
    name: string;
    seatCount: number;
    createdAt: string;
    ssoEnforced?: boolean;
    ssoProviderSettings?: Record<string, unknown>;
  };
  members?: TeamMember[];
  pendingInvitations?: PendingInvitation[];
}

interface InviteResponse {
  invitation: {
    id: string;
    email: string;
    token: string;
    expiresAt: string;
  };
  organization: {
    id: string;
    name: string;
  };
}

export default function TeamSettingsPage() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [createTeamDialogOpen, setCreateTeamDialogOpen] = useState(false);
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [teamName, setTeamName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [memberToRemove, setMemberToRemove] = useState<TeamMember | null>(null);
  const [invitationToCancel, setInvitationToCancel] = useState<PendingInvitation | null>(null);
  const [leaveTeamDialogOpen, setLeaveTeamDialogOpen] = useState(false);
  const [lastInviteLink, setLastInviteLink] = useState<string | null>(null);

  const { data: teamData, isLoading } = useQuery<TeamData>({
    queryKey: ["/api/team"],
  });

  const { data: authUser } = useQuery<{ id: string; email: string; accountType: string }>({
    queryKey: ["/api/auth/user"],
  });

  const createTeamMutation = useMutation({
    mutationFn: async (name: string) => {
      return apiRequest("POST", "/api/team", { name });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/team"] });
      setCreateTeamDialogOpen(false);
      setTeamName("");
      toast({
        title: "Team Created",
        description: "Your team has been created successfully.",
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

  const inviteMemberMutation = useMutation({
    mutationFn: async (email: string) => {
      const response = await apiRequest("POST", "/api/team/invite", { email });
      return response.json() as Promise<InviteResponse>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/team"] });
      setInviteDialogOpen(false);
      setInviteEmail("");
      
      const baseUrl = window.location.origin;
      const inviteLink = `${baseUrl}/team/invite?token=${data.invitation.token}`;
      setLastInviteLink(inviteLink);
      
      toast({
        title: "Invitation Sent",
        description: `An invitation has been created for ${data.invitation.email}.`,
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

  const removeMemberMutation = useMutation({
    mutationFn: async (memberId: string) => {
      return apiRequest("DELETE", `/api/team/members/${memberId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/team"] });
      setMemberToRemove(null);
      toast({
        title: "Member Removed",
        description: "The team member has been removed.",
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

  const cancelInvitationMutation = useMutation({
    mutationFn: async (invitationId: string) => {
      return apiRequest("DELETE", `/api/team/invitations/${invitationId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/team"] });
      setInvitationToCancel(null);
      toast({
        title: "Invitation Cancelled",
        description: "The invitation has been cancelled.",
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

  const leaveTeamMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/team/leave");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/team"] });
      setLeaveTeamDialogOpen(false);
      toast({
        title: "Left Team",
        description: "You have left the team.",
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

  const updateSsoSettingsMutation = useMutation({
    mutationFn: async (data: { ssoEnforced: boolean }) => {
      const response = await apiRequest("PATCH", "/api/team/sso-settings", data);
      const responseData = await response.json().catch(() => ({ error: "Failed to parse response" }));
      if (!response.ok) {
        const errorMessage = responseData.details 
          ? responseData.details.map((d: { message: string }) => d.message).join(", ")
          : responseData.error || responseData.message || "Failed to update SSO settings";
        throw new Error(errorMessage);
      }
      return responseData as { success: boolean; ssoEnforced: boolean; ssoProviderSettings?: Record<string, unknown> };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/team"] });
      toast({
        title: "SSO Settings Updated",
        description: data.ssoEnforced 
          ? "SSO is now enforced for team members." 
          : "SSO enforcement has been disabled.",
      });
    },
    onError: (error: Error) => {
      queryClient.invalidateQueries({ queryKey: ["/api/team"] });
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const copyInviteLink = () => {
    if (lastInviteLink) {
      navigator.clipboard.writeText(lastInviteLink);
      toast({
        title: "Copied",
        description: "Invite link copied to clipboard.",
      });
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" data-testid="loading-team">
        <div className="animate-pulse text-muted-foreground">Loading team settings...</div>
      </div>
    );
  }

  const isProOrHigher = authUser?.accountType === "pro" || authUser?.accountType === "enterprise" || authUser?.accountType === "org";

  if (!isProOrHigher) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container max-w-4xl mx-auto py-8 px-4">
          <Link href="/dashboard">
            <Button variant="ghost" className="mb-6" data-testid="button-back">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Dashboard
            </Button>
          </Link>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Team Management
              </CardTitle>
              <CardDescription>
                Invite team members to share your document workspace
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-center py-8">
                <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">Team Features Require Pro or Enterprise</h3>
                <p className="text-muted-foreground mb-4">
                  Upgrade to Pro or Enterprise to invite team members and share your document workspace.
                </p>
                <Link href="/dashboard?upgrade=true">
                  <Button data-testid="button-upgrade-pro">Upgrade Now</Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container max-w-4xl mx-auto py-8 px-4">
        <Link href="/dashboard">
          <Button variant="ghost" className="mb-6" data-testid="button-back">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Dashboard
          </Button>
        </Link>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Team Management
              </CardTitle>
              <CardDescription>
                Invite team members to share your document workspace. Each seat is billed to your subscription.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {!teamData?.hasTeam ? (
                <div className="text-center py-8">
                  <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2">Create Your Team</h3>
                  <p className="text-muted-foreground mb-4">
                    Start by creating a team. You can then invite members to collaborate.
                  </p>
                  <Button onClick={() => setCreateTeamDialogOpen(true)} data-testid="button-create-team">
                    <UserPlus className="mr-2 h-4 w-4" />
                    Create Team
                  </Button>
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b">
                    <div>
                      <h3 className="font-semibold text-lg">{teamData.organization?.name}</h3>
                      <p className="text-sm text-muted-foreground">
                        {teamData.organization?.seatCount} {teamData.organization?.seatCount === 1 ? "seat" : "seats"} in use
                      </p>
                    </div>
                    {teamData.isOwner && (
                      <Button onClick={() => setInviteDialogOpen(true)} data-testid="button-invite-member">
                        <UserPlus className="mr-2 h-4 w-4" />
                        Invite Member
                      </Button>
                    )}
                    {!teamData.isOwner && (
                      <Button 
                        variant="outline" 
                        onClick={() => setLeaveTeamDialogOpen(true)}
                        data-testid="button-leave-team"
                      >
                        <LogOut className="mr-2 h-4 w-4" />
                        Leave Team
                      </Button>
                    )}
                  </div>

                  {lastInviteLink && (
                    <div className="bg-muted p-4 rounded-md">
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                        <span className="text-sm font-medium">Last Invite Link</span>
                        <Button variant="ghost" size="sm" onClick={copyInviteLink} data-testid="button-copy-invite">
                          <Copy className="h-4 w-4 mr-1" />
                          Copy
                        </Button>
                      </div>
                      <code className="text-xs break-all">{lastInviteLink}</code>
                    </div>
                  )}

                  <div>
                    <h4 className="font-medium mb-3">Team Members</h4>
                    <div className="space-y-2">
                      {teamData.members?.map((member) => (
                        <div 
                          key={member.id} 
                          className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-md bg-muted/50"
                          data-testid={`member-row-${member.userId}`}
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                              {member.role === "owner" ? (
                                <Crown className="h-4 w-4 text-primary" />
                              ) : (
                                <Users className="h-4 w-4 text-muted-foreground" />
                              )}
                            </div>
                            <div>
                              <div className="font-medium">
                                {member.firstName && member.lastName 
                                  ? `${member.firstName} ${member.lastName}` 
                                  : member.email}
                              </div>
                              <div className="text-sm text-muted-foreground">{member.email}</div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant={member.role === "owner" ? "default" : "secondary"}>
                              {member.role === "owner" ? "Owner" : "Member"}
                            </Badge>
                            {teamData.isOwner && member.role !== "owner" && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setMemberToRemove(member)}
                                data-testid={`button-remove-member-${member.userId}`}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {teamData.isOwner && teamData.pendingInvitations && teamData.pendingInvitations.length > 0 && (
                    <div>
                      <h4 className="font-medium mb-3">Pending Invitations</h4>
                      <div className="space-y-2">
                        {teamData.pendingInvitations.map((invitation) => (
                          <div 
                            key={invitation.id} 
                            className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-md bg-muted/50"
                            data-testid={`invitation-row-${invitation.id}`}
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                                <Mail className="h-4 w-4 text-muted-foreground" />
                              </div>
                              <div>
                                <div className="font-medium">{invitation.email}</div>
                                <div className="text-sm text-muted-foreground flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  Expires {new Date(invitation.expiresAt).toLocaleDateString()}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge variant="outline">Pending</Badge>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setInvitationToCancel(invitation)}
                                data-testid={`button-cancel-invitation-${invitation.id}`}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Billing Information</CardTitle>
              <CardDescription>
                Team seats are billed at the same rate as your Pro subscription
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                When you invite a team member, an additional seat will be added to your subscription.
                You will be charged pro-rata for the remaining billing period.
                When a member leaves or is removed, your next invoice will be adjusted accordingly.
              </p>
            </CardContent>
          </Card>

          {/* SSO & Security Settings Card */}
          {teamData?.hasTeam && teamData.isOwner && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  SSO & Security
                </CardTitle>
                <CardDescription>
                  Manage single sign-on settings for your organization
                </CardDescription>
              </CardHeader>
              <CardContent>
                {(teamData.accountType === "enterprise" || teamData.accountType === "org") ? (
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-md bg-muted/50">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium">Enforce SSO for Team Members</div>
                        <p className="text-sm text-muted-foreground">
                          When enabled, team members must sign in using SSO (Google or Microsoft). 
                          Password-based login will be disabled for all members except the owner.
                        </p>
                      </div>
                      <Switch
                        checked={teamData.organization?.ssoEnforced ?? false}
                        onCheckedChange={(checked) => {
                          updateSsoSettingsMutation.mutate({ ssoEnforced: checked });
                        }}
                        disabled={updateSsoSettingsMutation.isPending}
                        data-testid="switch-sso-enforced"
                      />
                    </div>
                    {teamData.organization?.ssoEnforced && (
                      <div className="p-3 rounded-md border border-yellow-500/20 bg-yellow-500/10">
                        <p className="text-sm text-yellow-700 dark:text-yellow-400">
                          SSO is enforced. Team members can only sign in using Google or Microsoft accounts.
                        </p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-4 p-4 rounded-md bg-muted/50">
                    <Lock className="h-8 w-8 text-muted-foreground flex-shrink-0" />
                    <div>
                      <div className="font-medium">Enterprise Feature</div>
                      <p className="text-sm text-muted-foreground mb-2">
                        SSO management is available for Enterprise and Org plans. 
                        Upgrade to enforce SSO for your team members.
                      </p>
                      <Link href="/dashboard?upgrade=true">
                        <Button size="sm" data-testid="button-upgrade-sso">
                          Upgrade to Enterprise
                        </Button>
                      </Link>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

        </div>
      </div>

      <Dialog open={createTeamDialogOpen} onOpenChange={setCreateTeamDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Your Team</DialogTitle>
            <DialogDescription>
              Give your team a name. You can change this later.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="team-name">Team Name</Label>
              <Input
                id="team-name"
                placeholder="e.g., My Property Management Company"
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                data-testid="input-team-name"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateTeamDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => createTeamMutation.mutate(teamName)}
              disabled={!teamName.trim() || createTeamMutation.isPending}
              data-testid="button-confirm-create-team"
            >
              {createTeamMutation.isPending ? "Creating..." : "Create Team"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite Team Member</DialogTitle>
            <DialogDescription>
              Enter the email address of the person you want to invite. They will receive an invitation to join your team.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="invite-email">Email Address</Label>
              <Input
                id="invite-email"
                type="email"
                placeholder="colleague@example.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                data-testid="input-invite-email"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => inviteMemberMutation.mutate(inviteEmail)}
              disabled={!inviteEmail.includes("@") || inviteMemberMutation.isPending}
              data-testid="button-confirm-invite"
            >
              {inviteMemberMutation.isPending ? "Sending..." : "Send Invitation"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!memberToRemove} onOpenChange={(open) => !open && setMemberToRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Team Member</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove {memberToRemove?.email} from your team? 
              They will lose access to all shared documents and settings.
              Your subscription will be adjusted on the next billing cycle.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => memberToRemove && removeMemberMutation.mutate(memberToRemove.userId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-remove-member"
            >
              {removeMemberMutation.isPending ? "Removing..." : "Remove Member"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!invitationToCancel} onOpenChange={(open) => !open && setInvitationToCancel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Invitation</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to cancel the invitation to {invitationToCancel?.email}?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Invitation</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => invitationToCancel && cancelInvitationMutation.mutate(invitationToCancel.id)}
              data-testid="button-confirm-cancel-invitation"
            >
              {cancelInvitationMutation.isPending ? "Cancelling..." : "Cancel Invitation"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={leaveTeamDialogOpen} onOpenChange={setLeaveTeamDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Leave Team</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to leave this team? You will lose access to all shared documents and settings.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Stay</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => leaveTeamMutation.mutate()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-leave-team"
            >
              {leaveTeamMutation.isPending ? "Leaving..." : "Leave Team"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
