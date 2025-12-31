import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Loader2,
  Plus,
  Users,
  Shield,
  ShieldOff,
  Key,
  Trash2,
  UserCog,
  CheckCircle,
  XCircle,
  RotateCcw,
  Archive,
} from "lucide-react";

interface User {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  isAdmin: boolean;
  twoFactorEnabled: boolean;
  emailVerified: boolean;
  createdAt: string;
  deletedAt: string | null;
  scheduledDeletionDate: string | null;
  deletionReason: string | null;
}

export default function UserManagement() {
  const { toast } = useToast();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isResetPasswordDialogOpen, setIsResetPasswordDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [activeTab, setActiveTab] = useState("active");

  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newFirstName, setNewFirstName] = useState("");
  const [newLastName, setNewLastName] = useState("");
  const [newIsAdmin, setNewIsAdmin] = useState(false);
  const [resetPassword, setResetPassword] = useState("");

  const { data: users, isLoading } = useQuery<User[]>({
    queryKey: ["/api/admin/users"],
  });

  const { data: archivedUsers, isLoading: isLoadingArchived } = useQuery<User[]>({
    queryKey: ["/api/ee/admin/users/archived"],
  });

  const createUserMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/admin/users", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "User created", description: "The new user has been added." });
      resetCreateDialog();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const resetPasswordMutation = useMutation({
    mutationFn: async ({ userId, newPassword }: { userId: string; newPassword: string }) => {
      const res = await apiRequest("POST", `/api/admin/users/${userId}/reset-password`, { newPassword });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Password reset", description: "The user's password has been changed." });
      setIsResetPasswordDialogOpen(false);
      setResetPassword("");
      setSelectedUser(null);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const toggle2FAMutation = useMutation({
    mutationFn: async ({ userId, enabled }: { userId: string; enabled: boolean }) => {
      const res = await apiRequest("POST", `/api/admin/users/${userId}/toggle-2fa`, { enabled });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "2FA updated", description: "Two-factor authentication has been disabled for this user." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: async ({ userId, reason }: { userId: string; reason?: string }) => {
      const res = await apiRequest("POST", `/api/ee/admin/users/${userId}/soft-delete`, { reason });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ee/admin/users/archived"] });
      toast({ title: "User archived", description: "The user has been archived and can be restored within 30 days." });
      setIsDeleteDialogOpen(false);
      setSelectedUser(null);
      setDeleteConfirmText("");
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const verifyUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      const res = await apiRequest("POST", `/api/ee/admin/users/${userId}/verify`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "User verified", description: "The user's email has been marked as verified." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const restoreUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      const res = await apiRequest("POST", `/api/ee/admin/users/${userId}/restore`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ee/admin/users/archived"] });
      toast({ title: "User restored", description: "The user account has been restored." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const resetCreateDialog = () => {
    setNewEmail("");
    setNewPassword("");
    setNewFirstName("");
    setNewLastName("");
    setNewIsAdmin(false);
    setIsCreateDialogOpen(false);
  };

  const handleCreateUser = () => {
    if (!newEmail || !newPassword) {
      toast({ title: "Error", description: "Email and password are required", variant: "destructive" });
      return;
    }
    createUserMutation.mutate({
      email: newEmail,
      password: newPassword,
      firstName: newFirstName || undefined,
      lastName: newLastName || undefined,
      isAdmin: newIsAdmin,
    });
  };

  const handleResetPassword = () => {
    if (!selectedUser || !resetPassword) return;
    if (resetPassword.length < 8) {
      toast({ title: "Error", description: "Password must be at least 8 characters", variant: "destructive" });
      return;
    }
    resetPasswordMutation.mutate({ userId: selectedUser.id, newPassword: resetPassword });
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const renderUserCard = (u: User, isArchived = false) => (
    <Card key={u.id} data-testid={`card-user-${u.id}`}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="font-medium" data-testid={`text-user-email-${u.id}`}>
                {u.email}
              </span>
              {u.isAdmin && (
                <Badge variant="secondary" className="text-xs">Admin</Badge>
              )}
              {u.twoFactorEnabled && (
                <Badge variant="outline" className="text-xs">
                  <Shield className="h-3 w-3 mr-1" />
                  2FA
                </Badge>
              )}
              {!isArchived && u.emailVerified && (
                <Badge variant="outline" className="text-xs bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800">
                  <CheckCircle className="h-3 w-3 mr-1" />
                  Verified
                </Badge>
              )}
              {!isArchived && !u.emailVerified && (
                <Badge variant="outline" className="text-xs bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800">
                  <XCircle className="h-3 w-3 mr-1" />
                  Unverified
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              {u.firstName} {u.lastName} {u.firstName || u.lastName ? "-" : ""} Joined {formatDate(u.createdAt)}
              {isArchived && u.scheduledDeletionDate && (
                <span className="ml-2 text-destructive">
                  Deletion: {formatDate(u.scheduledDeletionDate)}
                </span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
            {isArchived ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => restoreUserMutation.mutate(u.id)}
                disabled={restoreUserMutation.isPending}
                data-testid={`button-restore-user-${u.id}`}
              >
                <RotateCcw className="h-4 w-4 mr-1" />
                Restore
              </Button>
            ) : (
              <>
                {!u.emailVerified && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => verifyUserMutation.mutate(u.id)}
                    disabled={verifyUserMutation.isPending}
                    data-testid={`button-verify-user-${u.id}`}
                  >
                    <CheckCircle className="h-4 w-4 mr-1" />
                    Verify
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSelectedUser(u);
                    setIsResetPasswordDialogOpen(true);
                  }}
                  data-testid={`button-reset-password-${u.id}`}
                >
                  <Key className="h-4 w-4 mr-1" />
                  Reset Password
                </Button>
                {u.twoFactorEnabled && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => toggle2FAMutation.mutate({ userId: u.id, enabled: false })}
                    disabled={toggle2FAMutation.isPending}
                    data-testid={`button-disable-2fa-${u.id}`}
                  >
                    <ShieldOff className="h-4 w-4 mr-1" />
                    Disable 2FA
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    setSelectedUser(u);
                    setIsDeleteDialogOpen(true);
                  }}
                  data-testid={`button-delete-user-${u.id}`}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold">User Management</h2>
          <p className="text-sm text-muted-foreground">Manage users and their access</p>
        </div>
        <Button size="sm" onClick={() => setIsCreateDialogOpen(true)} data-testid="button-add-user">
          <Plus className="h-4 w-4 mr-2" />
          Add User
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="active" data-testid="tab-active-users">
            <Users className="h-4 w-4 mr-2" />
            Active Users ({users?.length || 0})
          </TabsTrigger>
          <TabsTrigger value="archived" data-testid="tab-archived-users">
            <Archive className="h-4 w-4 mr-2" />
            Archived ({archivedUsers?.length || 0})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="mt-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : !users || users.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Users className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground mb-4">No users found</p>
                <Button onClick={() => setIsCreateDialogOpen(true)} data-testid="button-add-first-user">
                  <Plus className="h-4 w-4 mr-2" />
                  Add First User
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {users.map((u) => renderUserCard(u, false))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="archived" className="mt-4">
          {isLoadingArchived ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : !archivedUsers || archivedUsers.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Archive className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No archived users</p>
                <p className="text-sm text-muted-foreground mt-2">
                  Deleted accounts appear here for 30 days before permanent removal
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {archivedUsers.map((u) => renderUserCard(u, true))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={isCreateDialogOpen} onOpenChange={(open) => !open && resetCreateDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserCog className="h-5 w-5" />
              Add New User
            </DialogTitle>
            <DialogDescription>
              Create a new admin user account
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="firstName">First Name</Label>
                <Input
                  id="firstName"
                  value={newFirstName}
                  onChange={(e) => setNewFirstName(e.target.value)}
                  placeholder="John"
                  data-testid="input-new-first-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Last Name</Label>
                <Input
                  id="lastName"
                  value={newLastName}
                  onChange={(e) => setNewLastName(e.target.value)}
                  placeholder="Doe"
                  data-testid="input-new-last-name"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email *</Label>
              <Input
                id="email"
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="user@example.com"
                required
                data-testid="input-new-email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password *</Label>
              <Input
                id="password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Minimum 8 characters"
                required
                data-testid="input-new-password"
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="isAdmin"
                checked={newIsAdmin}
                onCheckedChange={setNewIsAdmin}
                data-testid="switch-is-admin"
              />
              <Label htmlFor="isAdmin">Grant admin privileges</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={resetCreateDialog}>
              Cancel
            </Button>
            <Button
              onClick={handleCreateUser}
              disabled={createUserMutation.isPending}
              data-testid="button-create-user"
            >
              {createUserMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create User
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isResetPasswordDialogOpen} onOpenChange={(open) => {
        if (!open) {
          setIsResetPasswordDialogOpen(false);
          setResetPassword("");
          setSelectedUser(null);
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Key className="h-5 w-5" />
              Reset Password
            </DialogTitle>
            <DialogDescription>
              Set a new password for {selectedUser?.email}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="space-y-2">
              <Label htmlFor="resetPassword">New Password</Label>
              <Input
                id="resetPassword"
                type="password"
                value={resetPassword}
                onChange={(e) => setResetPassword(e.target.value)}
                placeholder="Minimum 8 characters"
                data-testid="input-reset-password"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setIsResetPasswordDialogOpen(false);
              setResetPassword("");
              setSelectedUser(null);
            }}>
              Cancel
            </Button>
            <Button
              onClick={handleResetPassword}
              disabled={resetPasswordMutation.isPending || resetPassword.length < 8}
              data-testid="button-confirm-reset-password"
            >
              {resetPasswordMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Reset Password
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isDeleteDialogOpen} onOpenChange={(open) => {
        if (!open) {
          setIsDeleteDialogOpen(false);
          setSelectedUser(null);
          setDeleteConfirmText("");
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" />
              Delete User Account
            </DialogTitle>
            <DialogDescription>
              This will archive <span className="font-semibold">{selectedUser?.email}</span>'s account. 
              The account can be restored within 30 days before permanent deletion.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-md p-4">
              <p className="text-sm text-amber-800 dark:text-amber-200">
                The user will receive an email notification about their account deletion with instructions on how to request restoration.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="deleteConfirm">
                Type <span className="font-mono font-bold text-destructive">delete</span> to confirm
              </Label>
              <Input
                id="deleteConfirm"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder="Type 'delete' to confirm"
                data-testid="input-delete-confirm"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setIsDeleteDialogOpen(false);
              setSelectedUser(null);
              setDeleteConfirmText("");
            }}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => selectedUser && deleteUserMutation.mutate({ userId: selectedUser.id, reason: "Admin deletion" })}
              disabled={deleteUserMutation.isPending || deleteConfirmText.toLowerCase() !== "delete"}
              data-testid="button-confirm-delete-user"
            >
              {deleteUserMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Delete Account
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
