import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:penny_mobile/core/constants/app_colors.dart';
import 'package:penny_mobile/presentation/providers/auth_provider.dart';
import 'package:penny_mobile/presentation/providers/biometric_provider.dart';
import 'package:penny_mobile/presentation/providers/guest_provider.dart';

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  final _formKey = GlobalKey<FormState>();
  bool _loading = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    // Attempt biometric login automatically on first load if eligible.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _tryAutoBiometricLogin();
    });
  }

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  /// Attempt biometric login automatically when the screen first loads,
  /// if biometrics are available and the user has logged in before.
  Future<void> _tryAutoBiometricLogin() async {
    final biometricAvailable =
        await ref.read(biometricAvailableProvider.future);
    final hasLoggedIn = await ref.read(hasLoggedInBeforeProvider.future);

    if (biometricAvailable && hasLoggedIn && mounted) {
      await _signInWithBiometrics();
    }
  }

  Future<void> _signIn() async {
    if (!_formKey.currentState!.validate()) return;

    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      await ref.read(authServiceProvider).signInWithEmail(
            email: _emailController.text.trim(),
            password: _passwordController.text,
          );
      // Mark that user has logged in so biometric can be offered next time.
      await markUserLoggedIn();
    } catch (e) {
      setState(() => _error = _parseError(e));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _signInWithBiometrics() async {
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final biometricService = ref.read(biometricServiceProvider);
      final authenticated = await biometricService.authenticate(
        reason: 'Sign in to Penny',
      );

      if (!authenticated) {
        if (mounted) {
          setState(() {
            _loading = false;
            _error = null; // User cancelled — no error message
          });
        }
        return;
      }

      // Firebase Auth persists the session. If the user was previously signed
      // in, currentUser is already available after biometric verification.
      // The authStateProvider will redirect automatically.
      // If the persisted session has expired, fall back to email/password.
      final currentUser = ref.read(authServiceProvider).currentUser;
      if (currentUser == null) {
        if (mounted) {
          setState(() {
            _loading = false;
            _error = 'Session expired. Please sign in with your credentials.';
          });
        }
        return;
      }

      // Force a token refresh to ensure the session is valid.
      await currentUser.reload();
    } catch (e) {
      if (mounted) {
        setState(() => _error = 'Biometric sign in failed. Please try again.');
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _signInWithOAuth(String provider) async {
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final oauthService = ref.read(oauthServiceProvider);
      if (provider == 'google') {
        await oauthService.signInWithGoogle();
      } else if (provider == 'apple') {
        await oauthService.signInWithApple();
      }
      await markUserLoggedIn();
    } catch (e) {
      if (mounted) {
        final msg = e.toString();
        if (msg.contains('cancelled') || msg.contains('canceled')) {
          setState(() => _error = null); // User cancelled, no error
        } else {
          final errStr = e.toString();
          if (errStr.contains('error 1000') || errStr.contains('AuthorizationError')) {
            // Apple Sign-In not available — show as snackbar, not persistent error
            if (mounted) {
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text('Apple Sign-In is not available on this device. Please use email or Google.'),
                    backgroundColor: AppColors.warning, behavior: SnackBarBehavior.floating),
              );
            }
          } else if (errStr.contains('network_error') || errStr.contains('ApiException: 10')) {
            setState(() => _error = 'Network error. Please check your connection.');
          } else if (errStr.contains('sign_in_failed') || errStr.contains('ApiException: 12500')) {
            // Google config error — show as snackbar
            if (mounted) {
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text('Google Sign-In is temporarily unavailable. Please use email.'),
                    backgroundColor: AppColors.warning, behavior: SnackBarBehavior.floating),
              );
            }
          } else {
            setState(() => _error = _parseError(e));
          }
        }
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  String _parseError(Object e) {
    final msg = e.toString();
    debugPrint('[Auth] Sign-in error: $msg');
    if (msg.contains('user-not-found')) {
      return 'No account found with this email';
    }
    if (msg.contains('wrong-password')) {
      return 'Incorrect password';
    }
    if (msg.contains('invalid-email')) {
      return 'Invalid email address';
    }
    if (msg.contains('too-many-requests')) {
      return 'Too many attempts. Please try again later';
    }
    if (msg.contains('credential-already-in-use')) {
      return 'This account is already linked to another sign-in method';
    }
    if (msg.contains('provider-not-enabled') || msg.contains('operation-not-allowed')) {
      return 'This sign-in method is not enabled';
    }
    // Show actual error for debugging
    return 'Sign in failed: ${e is Exception ? msg.replaceFirst('Exception: ', '') : msg}';
  }

  @override
  Widget build(BuildContext context) {
    final biometricAvailable = ref.watch(biometricAvailableProvider);
    final hasLoggedIn = ref.watch(hasLoggedInBeforeProvider);

    // Determine if biometric button should be shown.
    final showBiometric = biometricAvailable.valueOrNull == true &&
        hasLoggedIn.valueOrNull == true;

    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 24),
          child: Form(
            key: _formKey,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const Spacer(flex: 2),

                // Logo
                Center(
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(16),
                    child: Image.asset('assets/icon/penny_icon.png', width: 72, height: 72),
                  ),
                ),
                const SizedBox(height: 12),
                Text(
                  'Penny',
                  style: Theme.of(context).textTheme.headlineLarge?.copyWith(
                        fontWeight: FontWeight.w700,
                        color: AppColors.primary,
                      ),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 8),
                Text(
                  'AI Expense Tracker',
                  style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                        color: Theme.of(context).colorScheme.onSurfaceVariant,
                      ),
                  textAlign: TextAlign.center,
                ),

                const Spacer(),

                // Error
                if (_error != null) ...[
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: AppColors.error.withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Text(
                      _error!,
                      style: const TextStyle(
                        color: AppColors.error,
                        fontSize: 14,
                      ),
                      textAlign: TextAlign.center,
                    ),
                  ),
                  const SizedBox(height: 16),
                ],

                // Email
                TextFormField(
                  controller: _emailController,
                  keyboardType: TextInputType.emailAddress,
                  autocorrect: false,
                  decoration: const InputDecoration(hintText: 'Email'),
                  validator: (v) {
                    if (v == null || v.trim().isEmpty) return 'Required';
                    if (!v.contains('@')) return 'Invalid email';
                    return null;
                  },
                ),
                const SizedBox(height: 12),

                // Password
                TextFormField(
                  controller: _passwordController,
                  obscureText: true,
                  decoration: const InputDecoration(hintText: 'Password'),
                  validator: (v) {
                    if (v == null || v.isEmpty) return 'Required';
                    return null;
                  },
                  onFieldSubmitted: (_) => _signIn(),
                ),
                const SizedBox(height: 24),

                // Sign In Button
                ElevatedButton(
                  onPressed: _loading ? null : _signIn,
                  child: _loading
                      ? const SizedBox(
                          height: 20,
                          width: 20,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: Colors.white,
                          ),
                        )
                      : const Text('Sign In'),
                ),

                // Forgot Password
                Align(
                  alignment: Alignment.centerRight,
                  child: TextButton(
                    onPressed: () => context.push('/auth/forgot-password'),
                    child: Text(
                      'Forgot Password?',
                      style: TextStyle(
                        color: Theme.of(context).colorScheme.onSurfaceVariant,
                        fontSize: 14,
                      ),
                    ),
                  ),
                ),

                // Biometric Sign In Button
                if (showBiometric) ...[
                  const SizedBox(height: 12),
                  OutlinedButton.icon(
                    onPressed: _loading ? null : _signInWithBiometrics,
                    icon: Icon(
                      Theme.of(context).platform == TargetPlatform.iOS
                          ? Icons.face
                          : Icons.fingerprint,
                      size: 20,
                    ),
                    label: Text(
                      Theme.of(context).platform == TargetPlatform.iOS
                          ? 'Sign in with Face ID'
                          : 'Sign in with Biometrics',
                    ),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: AppColors.primary,
                      side: const BorderSide(color: AppColors.primary),
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                    ),
                  ),
                ],

                const SizedBox(height: 20),

                // Divider
                Row(
                  children: [
                    const Expanded(child: Divider()),
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 16),
                      child: Text('or', style: TextStyle(
                        color: Theme.of(context).colorScheme.onSurfaceVariant, fontSize: 13)),
                    ),
                    const Expanded(child: Divider()),
                  ],
                ),
                const SizedBox(height: 20),

                // Google Sign In
                OutlinedButton.icon(
                  onPressed: _loading ? null : () => _signInWithOAuth('google'),
                  icon: Text('G', style: TextStyle(
                    fontSize: 18, fontWeight: FontWeight.w700,
                    color: Theme.of(context).colorScheme.onSurface)),
                  label: const Text('Continue with Google'),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: Theme.of(context).colorScheme.onSurface,
                    side: BorderSide(color: Theme.of(context).dividerColor),
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12)),
                  ),
                ),
                const SizedBox(height: 10),

                // Apple Sign In (only show if available on this device)
                FutureBuilder<bool>(
                  future: ref.read(oauthServiceProvider).isAppleSignInAvailable(),
                  builder: (context, snapshot) {
                    if (snapshot.data != true) return const SizedBox.shrink();
                    return OutlinedButton.icon(
                      onPressed: _loading ? null : () => _signInWithOAuth('apple'),
                      icon: Icon(Icons.apple, size: 20,
                        color: Theme.of(context).colorScheme.onSurface),
                      label: const Text('Continue with Apple'),
                      style: OutlinedButton.styleFrom(
                        foregroundColor: Theme.of(context).colorScheme.onSurface,
                        side: BorderSide(color: Theme.of(context).dividerColor),
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12)),
                      ),
                    );
                  },
                ),

                const SizedBox(height: 12),

                // Sign Up Link
                TextButton(
                  onPressed: () => context.go('/auth/signup'),
                  child: const Text("Don't have an account? Sign Up"),
                ),

                const SizedBox(height: 8),

                // Guest Mode — prominent for App Store review compliance
                OutlinedButton(
                  onPressed: _loading
                      ? null
                      : () {
                          setGuestMode(ref, true);
                          context.go('/');
                        },
                  style: OutlinedButton.styleFrom(
                    foregroundColor: AppColors.primary,
                    side: BorderSide(
                      color: AppColors.primary.withValues(alpha: 0.4),
                    ),
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                  ),
                  child: const Text('Try Without Account'),
                ),

                const Spacer(flex: 2),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
