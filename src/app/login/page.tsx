"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
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
import { Fingerprint, Loader2, CheckCircle2, Mail, Lock, Sparkles, ArrowRight } from "lucide-react";

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
  const [emailFocused, setEmailFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);

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
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-violet-50/30 to-slate-100 dark:from-slate-950 dark:via-violet-950/20 dark:to-slate-900 p-4 relative overflow-hidden">
      {/* Animated Background Elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-20 w-72 h-72 bg-violet-500/10 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-20 right-20 w-96 h-96 bg-fuchsia-500/10 rounded-full blur-3xl animate-pulse delay-1000"></div>
      </div>

      <Card className="w-full max-w-md glass border-2 border-violet-200/50 dark:border-violet-800/30 shadow-2xl shadow-violet-500/10 animate-in zoom-in-95 fade-in-0 duration-500 relative z-10">
        <CardHeader className="space-y-3 text-center pb-6">
          {/* Logo */}
          <div className="flex justify-center mb-2">
            <div className="h-16 w-16 rounded-2xl overflow-hidden shadow-lg shadow-violet-500/30 animate-in zoom-in-90 duration-700 delay-100">
              <Image 
                src="/penny_icon.png" 
                alt="Penny" 
                width={64}
                height={64}
                className="object-contain"
                priority
              />
            </div>
          </div>
          <CardTitle className="text-3xl font-bold gradient-text animate-in slide-in-from-top-4 duration-500 delay-200">
            Welcome back to Penny
          </CardTitle>
          <CardDescription className="text-base animate-in slide-in-from-top-4 duration-500 delay-300">
            Sign in to your account to track your expenses
          </CardDescription>
        </CardHeader>
        
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-5">
            {/* Success Message */}
            {successMessage && (
              <Alert className="glass border-2 border-green-500/50 animate-in slide-in-from-top-2">
                <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                <AlertDescription className="text-green-600 dark:text-green-400 font-medium">
                  {successMessage}
                </AlertDescription>
              </Alert>
            )}
            
            {/* Error Message */}
            {error && (
              <Alert variant="destructive" className="animate-in slide-in-from-top-2">
                <AlertDescription className="font-medium">{error}</AlertDescription>
              </Alert>
            )}

            {/* Passkey Sign In */}
            {isPasskeyAvailable && !showPasswordFields && (
              <div className="space-y-4 animate-in slide-in-from-bottom-4 duration-500">
                <Button
                  type="button"
                  onClick={handlePasskeyLogin}
                  className="w-full h-12 bg-gradient-to-r from-violet-500 to-fuchsia-500 hover:from-violet-600 hover:to-fuchsia-600 text-white shadow-lg shadow-violet-500/30 hover:shadow-violet-500/50 transition-all duration-300 hover:scale-105 text-base font-semibold"
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
                      <Sparkles className="h-4 w-4 ml-2" />
                    </>
                  )}
                </Button>

                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-slate-300 dark:border-slate-700" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="glass px-4 py-1 text-muted-foreground font-medium rounded-full">
                      Or continue with email
                    </span>
                  </div>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowPasswordFields(true)}
                  className="w-full h-11 border-2 hover:bg-violet-50 dark:hover:bg-violet-950/30 hover:border-violet-300 dark:hover:border-violet-700 transition-all duration-300"
                >
                  <Mail className="h-4 w-4 mr-2" />
                  Sign in with Email & Password
                </Button>
              </div>
            )}

            {/* Email/Password Fields */}
            {showPasswordFields && (
              <div className="space-y-5 animate-in slide-in-from-bottom-4 duration-500">
                {/* Email Field with Floating Label */}
                <div className="relative group">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground transition-all duration-300 group-focus-within:text-violet-500" />
                  <Input
                    id="email"
                    type="email"
                    placeholder=" "
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onFocus={() => setEmailFocused(true)}
                    onBlur={() => setEmailFocused(false)}
                    required
                    autoComplete="email webauthn"
                    disabled={loading}
                    className="pl-10 h-12 peer transition-all duration-300 focus:border-violet-500 focus:ring-violet-500"
                  />
                  <Label 
                    htmlFor="email"
                    className={`absolute left-10 transition-all duration-300 pointer-events-none
                      ${emailFocused || email ? '-top-2 text-xs bg-background px-2 text-violet-600 dark:text-violet-400 font-medium' : 'top-1/2 -translate-y-1/2 text-muted-foreground'}`}
                  >
                    Email address
                  </Label>
                </div>

                {/* Password Field with Floating Label */}
                <div className="relative group">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground transition-all duration-300 group-focus-within:text-violet-500" />
                  <Input
                    id="password"
                    type="password"
                    placeholder=" "
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onFocus={() => setPasswordFocused(true)}
                    onBlur={() => setPasswordFocused(false)}
                    required
                    autoComplete="current-password"
                    disabled={loading}
                    className="pl-10 h-12 peer transition-all duration-300 focus:border-violet-500 focus:ring-violet-500"
                  />
                  <Label 
                    htmlFor="password"
                    className={`absolute left-10 transition-all duration-300 pointer-events-none
                      ${passwordFocused || password ? '-top-2 text-xs bg-background px-2 text-violet-600 dark:text-violet-400 font-medium' : 'top-1/2 -translate-y-1/2 text-muted-foreground'}`}
                  >
                    Password
                  </Label>
                  <Link
                    href="/forgot-password"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-violet-600 dark:text-violet-400 hover:underline font-medium"
                  >
                    Forgot?
                  </Link>
                </div>
              </div>
            )}
          </CardContent>
          
          <CardFooter className="flex flex-col space-y-4 pt-2">
            {showPasswordFields && (
              <>
                <Button
                  type="submit"
                  className="w-full h-12 bg-gradient-to-r from-violet-500 to-fuchsia-500 hover:from-violet-600 hover:to-fuchsia-600 text-white shadow-lg shadow-violet-500/30 hover:shadow-violet-500/50 transition-all duration-300 hover:scale-105 text-base font-semibold"
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                      Signing in...
                    </>
                  ) : (
                    <>
                      Sign In
                      <ArrowRight className="h-5 w-5 ml-2" />
                    </>
                  )}
                </Button>

                {isPasskeyAvailable && (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setShowPasswordFields(false);
                      setError("");
                    }}
                    className="w-full text-sm hover:bg-violet-50 dark:hover:bg-violet-950/30"
                  >
                    <Fingerprint className="h-4 w-4 mr-2" />
                    Use Face ID / Touch ID instead
                  </Button>
                )}
              </>
            )}
            
            {!showPasswordFields && isPasskeyAvailable && (
              <div className="text-center space-y-2">
                <p className="text-xs text-muted-foreground">
                  🔐 Passkeys are more secure than passwords
                </p>
                <p className="text-xs text-muted-foreground">
                  Works across all your devices with biometric authentication
                </p>
              </div>
            )}

            <div className="text-center">
              <p className="text-sm text-muted-foreground">
                Don&apos;t have an account?{" "}
                <Link
                  href="/signup"
                  className="font-semibold text-violet-600 dark:text-violet-400 hover:underline"
                >
                  Sign up
                </Link>
              </p>
            </div>
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
        <Card className="w-full max-w-md glass shadow-2xl">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Loader2 className="h-12 w-12 animate-spin text-violet-500 mb-4" />
            <p className="text-muted-foreground">Loading...</p>
          </CardContent>
        </Card>
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}
