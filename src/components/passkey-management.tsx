"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { usePasskey } from "@/hooks/usePasskey";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Fingerprint,
  Smartphone,
  Plus,
  Trash2,
  CheckCircle2,
  Cloud,
  AlertCircle,
  Loader2,
} from "lucide-react";

export function PasskeyManagement() {
  const { user } = useAuth();
  const {
    passkeys,
    isLoading,
    isAvailable,
    registerPasskey,
    loadPasskeys,
    deletePasskey,
  } = usePasskey();

  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [passkeyToDelete, setPasskeyToDelete] = useState<string | null>(null);
  const [isRegistering, setIsRegistering] = useState(false);
  const [registrationError, setRegistrationError] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      loadPasskeys();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const handleRegisterPasskey = async () => {
    if (!user || !user.email) return;

    setIsRegistering(true);
    setRegistrationError(null);

    try {
      await registerPasskey(
        user.uid,
        user.email,
        user.displayName || user.email
      );
    } catch (err) {
      setRegistrationError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setIsRegistering(false);
    }
  };

  const handleDeletePasskey = async () => {
    if (!passkeyToDelete) return;

    try {
      await deletePasskey(passkeyToDelete);
      setShowDeleteDialog(false);
      setPasskeyToDelete(null);
    } catch (err) {
      console.error('Error deleting passkey:', err);
    }
  };

  // Don't show the card if WebAuthn is not available
  if (!isAvailable) {
    return null;
  }

  return (
    <Card className="mb-6">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Fingerprint className="h-5 w-5" />
              Passkeys & Biometrics
            </CardTitle>
            <CardDescription>
              Sign in faster with Face ID, Touch ID, or device biometrics
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Info Banner */}
        <div className="bg-blue-50 dark:bg-blue-950/30 p-4 rounded-lg border border-blue-200 dark:border-blue-800">
          <div className="flex gap-3">
            <CheckCircle2 className="h-5 w-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                Passwordless Authentication
              </p>
              <p className="text-xs text-blue-700 dark:text-blue-300">
                Passkeys are more secure than passwords and work across your devices.
                Sign in instantly with your fingerprint or face.
              </p>
            </div>
          </div>
        </div>

        {/* Registration Error */}
        {registrationError && (
          <div className="bg-red-50 dark:bg-red-950/30 p-4 rounded-lg border border-red-200 dark:border-red-800">
            <div className="flex gap-3">
              <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 shrink-0" />
              <div>
                <p className="text-sm font-medium text-red-900 dark:text-red-100">
                  Registration Failed
                </p>
                <p className="text-xs text-red-700 dark:text-red-300 mt-1">
                  {registrationError}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Registered Passkeys List */}
        {passkeys.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium">Your Passkeys</p>
            {passkeys.map((passkey) => (
              <div
                key={passkey.id}
                className="flex items-center justify-between p-3 rounded-lg border bg-card"
              >
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <Smartphone className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{passkey.deviceName}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <p className="text-xs text-muted-foreground">
                        Added {new Date(passkey.createdAt).toLocaleDateString()}
                      </p>
                      {passkey.credentialBackedUp && (
                        <div className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                          <Cloud className="h-3 w-3" />
                          <span>Synced</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setPasskeyToDelete(passkey.id);
                    setShowDeleteDialog(true);
                  }}
                  disabled={isLoading}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        )}

        {/* Add Passkey Button */}
        <Button
          onClick={handleRegisterPasskey}
          disabled={isRegistering}
          className="w-full"
          variant={passkeys.length === 0 ? "default" : "outline"}
        >
          {isRegistering ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Setting up passkey...
            </>
          ) : (
            <>
              <Plus className="h-4 w-4 mr-2" />
              {passkeys.length === 0 ? "Enable Face ID / Touch ID" : "Add Another Device"}
            </>
          )}
        </Button>

        {/* Delete Confirmation Dialog */}
        <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Remove Passkey?</DialogTitle>
              <DialogDescription>
                Are you sure you want to remove this passkey? You&apos;ll need to use your
                password or another passkey to sign in to this device.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setShowDeleteDialog(false);
                  setPasskeyToDelete(null);
                }}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleDeletePasskey}
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Removing...
                  </>
                ) : (
                  <>
                    <Trash2 className="h-4 w-4 mr-2" />
                    Remove Passkey
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Help Text */}
        {passkeys.length === 0 && (
          <p className="text-xs text-muted-foreground text-center">
            Once enabled, you can sign in instantly without typing your password
          </p>
        )}
      </CardContent>
    </Card>
  );
}

