"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { useAuth } from "@/hooks/useAuth";
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
import { Mail, Lock, Loader2, CheckCircle2, Shield, Sparkles } from "lucide-react";

export default function SignUpPage() {
  const router = useRouter();
  const { signUp } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [emailFocused, setEmailFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [confirmFocused, setConfirmFocused] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password.length < 6) {
      setError("Password must be at least 6 characters long");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setLoading(true);

    try {
      await signUp(email, password);
      router.push("/");
    } catch (err) {
      console.error("Signup error:", err);
      const error = err as { code?: string; message?: string };
      if (error.code === "auth/email-already-in-use") {
        setError("An account with this email already exists");
      } else if (error.code === "auth/invalid-email") {
        setError("Invalid email address");
      } else if (error.code === "auth/weak-password") {
        setError("Password is too weak. Use at least 6 characters");
      } else {
        setError("Failed to create account. Please try again");
      }
    } finally {
      setLoading(false);
    }
  };

  const getPasswordStrength = () => {
    if (!password) return { strength: 0, text: "", color: "" };
    if (password.length < 6) return { strength: 25, text: "Too weak", color: "text-red-500" };
    if (password.length < 8) return { strength: 50, text: "Weak", color: "text-yellow-500" };
    if (password.length < 12) return { strength: 75, text: "Good", color: "text-blue-500" };
    return { strength: 100, text: "Strong", color: "text-green-500" };
  };

  const passwordStrength = getPasswordStrength();
  const passwordsMatch = confirmPassword && password === confirmPassword;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-fuchsia-50/30 to-slate-100 dark:from-slate-950 dark:via-fuchsia-950/20 dark:to-slate-900 p-4 relative overflow-hidden">
      {/* Animated Background Elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 right-20 w-72 h-72 bg-fuchsia-500/10 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-20 left-20 w-96 h-96 bg-violet-500/10 rounded-full blur-3xl animate-pulse delay-1000"></div>
      </div>

      <Card className="w-full max-w-md glass border-2 border-fuchsia-200/50 dark:border-fuchsia-800/30 shadow-2xl shadow-fuchsia-500/10 animate-in zoom-in-95 fade-in-0 duration-500 relative z-10">
        <CardHeader className="space-y-3 text-center pb-6">
          {/* Logo */}
          <div className="flex justify-center mb-2">
            <div className="h-16 w-16 rounded-2xl overflow-hidden shadow-lg shadow-fuchsia-500/30 animate-in zoom-in-90 duration-700 delay-100">
              <Image 
                src="/penny.png" 
                alt="Penny" 
                width={64}
                height={64}
                className="object-contain"
                priority
              />
            </div>
          </div>
          <CardTitle className="text-3xl font-bold gradient-text animate-in slide-in-from-top-4 duration-500 delay-200">
            Join Penny
          </CardTitle>
          <CardDescription className="text-base animate-in slide-in-from-top-4 duration-500 delay-300">
            Create your account to start tracking expenses with AI
          </CardDescription>
        </CardHeader>
        
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-5">
            {/* Error Message */}
            {error && (
              <Alert variant="destructive" className="animate-in slide-in-from-top-2">
                <AlertDescription className="font-medium">{error}</AlertDescription>
              </Alert>
            )}

            {/* Email Field with Floating Label */}
            <div className="relative group animate-in slide-in-from-bottom-4 duration-500">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground transition-all duration-300 group-focus-within:text-fuchsia-500" />
              <Input
                id="email"
                type="email"
                placeholder=" "
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onFocus={() => setEmailFocused(true)}
                onBlur={() => setEmailFocused(false)}
                required
                autoComplete="email"
                disabled={loading}
                className="pl-10 h-12 peer transition-all duration-300 focus:border-fuchsia-500 focus:ring-fuchsia-500"
              />
              <Label 
                htmlFor="email"
                className={`absolute left-10 transition-all duration-300 pointer-events-none
                  ${emailFocused || email ? '-top-2 text-xs bg-background px-2 text-fuchsia-600 dark:text-fuchsia-400 font-medium' : 'top-1/2 -translate-y-1/2 text-muted-foreground'}`}
              >
                Email address
              </Label>
            </div>

            {/* Password Field with Strength Indicator */}
            <div className="space-y-2 animate-in slide-in-from-bottom-4 duration-500 delay-100">
              <div className="relative group">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground transition-all duration-300 group-focus-within:text-fuchsia-500" />
                <Input
                  id="password"
                  type="password"
                  placeholder=" "
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onFocus={() => setPasswordFocused(true)}
                  onBlur={() => setPasswordFocused(false)}
                  required
                  autoComplete="new-password"
                  disabled={loading}
                  minLength={6}
                  className="pl-10 h-12 peer transition-all duration-300 focus:border-fuchsia-500 focus:ring-fuchsia-500"
                />
                <Label 
                  htmlFor="password"
                  className={`absolute left-10 transition-all duration-300 pointer-events-none
                    ${passwordFocused || password ? '-top-2 text-xs bg-background px-2 text-fuchsia-600 dark:text-fuchsia-400 font-medium' : 'top-1/2 -translate-y-1/2 text-muted-foreground'}`}
                >
                  Password (min. 6 characters)
                </Label>
              </div>
              
              {/* Password Strength Bar */}
              {password && (
                <div className="space-y-1 animate-in slide-in-from-right-2">
                  <div className="h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                    <div 
                      className={`h-full transition-all duration-500 ${
                        passwordStrength.strength === 100 ? 'bg-green-500' :
                        passwordStrength.strength === 75 ? 'bg-blue-500' :
                        passwordStrength.strength === 50 ? 'bg-yellow-500' : 'bg-red-500'
                      }`}
                      style={{ width: `${passwordStrength.strength}%` }}
                    />
                  </div>
                  <p className={`text-xs font-medium ${passwordStrength.color}`}>
                    {passwordStrength.text}
                  </p>
                </div>
              )}
            </div>

            {/* Confirm Password Field */}
            <div className="relative group animate-in slide-in-from-bottom-4 duration-500 delay-200">
              <Shield className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground transition-all duration-300 group-focus-within:text-fuchsia-500" />
              <Input
                id="confirmPassword"
                type="password"
                placeholder=" "
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                onFocus={() => setConfirmFocused(true)}
                onBlur={() => setConfirmFocused(false)}
                required
                autoComplete="new-password"
                disabled={loading}
                minLength={6}
                className="pl-10 h-12 peer transition-all duration-300 focus:border-fuchsia-500 focus:ring-fuchsia-500"
              />
              <Label 
                htmlFor="confirmPassword"
                className={`absolute left-10 transition-all duration-300 pointer-events-none
                  ${confirmFocused || confirmPassword ? '-top-2 text-xs bg-background px-2 text-fuchsia-600 dark:text-fuchsia-400 font-medium' : 'top-1/2 -translate-y-1/2 text-muted-foreground'}`}
              >
                Confirm password
              </Label>
              {confirmPassword && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  {passwordsMatch ? (
                    <CheckCircle2 className="h-5 w-5 text-green-500 animate-in zoom-in-50" />
                  ) : (
                    <span className="text-xs text-red-500 font-medium">No match</span>
                  )}
                </div>
              )}
            </div>
          </CardContent>
          
          <CardFooter className="flex flex-col space-y-4 pt-2">
            <Button
              type="submit"
              className="w-full h-12 bg-gradient-to-r from-fuchsia-500 to-violet-500 hover:from-fuchsia-600 hover:to-violet-600 text-white shadow-lg shadow-fuchsia-500/30 hover:shadow-fuchsia-500/50 transition-all duration-300 hover:scale-105 text-base font-semibold"
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                  Creating account...
                </>
              ) : (
                <>
                  Create Account
                  <Sparkles className="h-5 w-5 ml-2" />
                </>
              )}
            </Button>
            
            <div className="text-center space-y-2">
              <p className="text-xs text-muted-foreground">
                By signing up, you agree to our Terms & Privacy Policy
              </p>
              <p className="text-sm text-muted-foreground">
                Already have an account?{" "}
                <Link
                  href="/login"
                  className="font-semibold text-fuchsia-600 dark:text-fuchsia-400 hover:underline"
                >
                  Sign in
                </Link>
              </p>
            </div>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
