"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import { usePasskey } from "@/hooks/usePasskey";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Fingerprint, Loader2, CheckCircle2 } from "lucide-react";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { signIn } = useAuth();
  const { authenticateWithPasskey, isAvailable: isPasskeyAvailable } = usePasskey();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [passkeyLoading, setPasskeyLoading] = useState(false);
  const [showPasswordFields, setShowPasswordFields] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");

  // Check for success message and pre-fill email from URL
  useEffect(() => {
    const resetSuccess = searchParams.get("reset");
    const emailParam = searchParams.get("email");
    
    if (resetSuccess === "success") {
      setSuccessMessage("Password reset successful! You can now sign in with your new password.");
      setShowPasswordFields(true);
    }
    
    if (emailParam) {
      setEmail(decodeURIComponent(emailParam));
      setShowPasswordFields(true);
    }
  }, [searchParams]);

  // Auto-show password fields if passkeys not available
  useEffect(() => {
    if (!isPasskeyAvailable) {
      setShowPasswordFields(true);
    }
  }, [isPasskeyAvailable]);

  const handlePasskeyLogin = async () => {
    setError("");
    setPasskeyLoading(true);

    try {
      await authenticateWithPasskey(email || undefined);
      router.push("/");
    } catch (err) {
      console.error("Passkey login error:", err);
      const errorMessage = err instanceof Error ? err.message : "Failed to sign in with passkey";
      setError(`${errorMessage}. Try password instead.`);
      setShowPasswordFields(true);
    } finally {
      setPasskeyLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await signIn(email, password);
      router.push("/");
    } catch (err) {
      console.error("Login error:", err);
      const error = err as { code?: string; message?: string };
      if (error.code === "auth/invalid-credential") {
        setError("Invalid email or password");
      } else if (error.code === "auth/user-not-found") {
        setError("No account found with this email");
      } else if (error.code === "auth/wrong-password") {
        setError("Incorrect password");
      } else if (error.code === "auth/too-many-requests") {
        setError("Too many failed attempts. Please try again later");
      } else {
        setError("Failed to sign in. Please try again");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 p-4">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="space-y-1 text-center">
          <CardTitle className="text-3xl font-bold tracking-tight">
            Welcome back to Penny
          </CardTitle>
          <CardDescription className="text-base">
            Sign in to your account to track your expenses
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            {successMessage && (
              <Alert className="bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800">
                <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                <AlertDescription className="text-green-600 dark:text-green-400">
                  {successMessage}
                </AlertDescription>
              </Alert>
            )}
            
            {error && (
              <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-md border border-destructive/20">
                {error}
              </div>
            )}

            {/* Passkey Sign In Button - Show first if available */}
            {isPasskeyAvailable && !showPasswordFields && (
              <div className="space-y-3">
                <Button
                  type="button"
                  onClick={handlePasskeyLogin}
                  className="w-full"
                  size="lg"
                  disabled={passkeyLoading}
                >
                  {passkeyLoading ? (
                    <>
                      <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                      Authenticating...
                    </>
                  ) : (
                    <>
                      <Fingerprint className="h-5 w-5 mr-2" />
                      Sign in with Face ID / Touch ID
                    </>
                  )}
                </Button>

                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-background px-2 text-muted-foreground">
                      Or continue with password
                    </span>
                  </div>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowPasswordFields(true)}
                  className="w-full"
                >
                  Sign in with Email & Password
                </Button>
              </div>
            )}

            {/* Traditional Email/Password Fields */}
            {showPasswordFields && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email webauthn"
                    disabled={loading}
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password">Password</Label>
                    <Link
                      href="/forgot-password"
                      className="text-xs text-muted-foreground hover:text-primary underline-offset-4 hover:underline"
                    >
                      Forgot password?
                    </Link>
                  </div>
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    disabled={loading}
                  />
                </div>
              </>
            )}
          </CardContent>
          <CardFooter className="flex flex-col space-y-4">
            {showPasswordFields && (
              <>
                <Button
                  type="submit"
                  className="w-full"
                  disabled={loading}
                  size="lg"
                >
                  {loading ? "Signing in..." : "Sign In"}
                </Button>

                {/* Back to Passkey button */}
                {isPasskeyAvailable && (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setShowPasswordFields(false);
                      setError("");
                    }}
                    className="w-full text-xs"
                  >
                    <Fingerprint className="h-3 w-3 mr-1" />
                    Use Face ID / Touch ID instead
                  </Button>
                )}
              </>
            )}
            
            {!showPasswordFields && isPasskeyAvailable && (
              <p className="text-xs text-center text-muted-foreground">
                Passkeys are more secure than passwords and work across your devices
              </p>
            )}

            <p className="text-sm text-center text-muted-foreground">
              Don&apos;t have an account?{" "}
              <Link
                href="/signup"
                className="font-medium text-primary hover:underline"
              >
                Sign up
              </Link>
            </p>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 p-4">
        <Card className="w-full max-w-md shadow-xl">
          <CardContent className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </CardContent>
        </Card>
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}
