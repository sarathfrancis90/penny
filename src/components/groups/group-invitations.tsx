"use client";

import { useState } from "react";
import { useGroupInvitations } from "@/hooks/useGroupInvitations";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Mail, UserPlus, X, Check } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export function GroupInvitations() {
  const { invitations, loading, acceptInvitation, rejectInvitation } = useGroupInvitations();
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleAccept = async (invitation: typeof invitations[0]) => {
    setError(null);
    setProcessingId(invitation.id);

    try {
      await acceptInvitation(invitation.token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to accept invitation");
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (invitationId: string) => {
    setError(null);
    setProcessingId(invitationId);

    try {
      await rejectInvitation(invitationId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reject invitation");
    } finally {
      setProcessingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (invitations.length === 0) {
    return (
      <Card className="glass">
        <CardContent className="flex flex-col items-center justify-center p-8 text-center">
          <Mail className="h-12 w-12 text-muted-foreground/50 mb-4" />
          <p className="text-muted-foreground">No pending invitations</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="text-sm text-red-500 bg-red-50 dark:bg-red-950 p-3 rounded-md">
          {error}
        </div>
      )}

      {invitations.map((invitation) => {
        const isExpired = new Date() > invitation.expiresAt.toDate();
        const isProcessing = processingId === invitation.id;

        return (
          <Card key={invitation.id} className="glass border-violet-200/50 dark:border-violet-800/30">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <UserPlus className="h-5 w-5 text-violet-500" />
                    {invitation.groupName}
                  </CardTitle>
                  <CardDescription>
                    Invited by {invitation.invitedByName || "Someone"}
                  </CardDescription>
                </div>
                <Badge
                  variant={isExpired ? "destructive" : "secondary"}
                  className={isExpired ? "" : "bg-violet-100 dark:bg-violet-950 text-violet-700 dark:text-violet-300"}
                >
                  {invitation.role}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="text-sm text-muted-foreground">
                {isExpired ? (
                  <span className="text-red-500">
                    Expired {formatDistanceToNow(invitation.expiresAt.toDate())} ago
                  </span>
                ) : (
                  <>
                    Expires{" "}
                    {formatDistanceToNow(invitation.expiresAt.toDate(), {
                      addSuffix: true,
                    })}
                  </>
                )}
              </div>

              {!isExpired && (
                <div className="flex gap-2">
                  <Button
                    onClick={() => handleAccept(invitation)}
                    disabled={isProcessing}
                    className="flex-1 bg-gradient-to-r from-violet-500 to-fuchsia-500 hover:from-violet-600 hover:to-fuchsia-600"
                  >
                    {isProcessing ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Accepting...
                      </>
                    ) : (
                      <>
                        <Check className="mr-2 h-4 w-4" />
                        Accept
                      </>
                    )}
                  </Button>
                  <Button
                    onClick={() => handleReject(invitation.id)}
                    disabled={isProcessing}
                    variant="outline"
                    className="flex-1"
                  >
                    {isProcessing ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Rejecting...
                      </>
                    ) : (
                      <>
                        <X className="mr-2 h-4 w-4" />
                        Decline
                      </>
                    )}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

