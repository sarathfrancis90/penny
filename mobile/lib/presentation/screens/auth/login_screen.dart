import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:penny_mobile/core/constants/app_colors.dart';
import 'package:penny_mobile/data/services/oauth_service.dart';
import 'package:penny_mobile/presentation/providers/auth_provider.dart';
import 'package:penny_mobile/presentation/providers/biometric_provider.dart';

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
      final oauthService = OAuthService();
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
            setState(() => _error = 'Apple Sign-In is not available. Please use email or Google.');
          } else if (errStr.contains('network_error') || errStr.contains('ApiException: 10')) {
            setState(() => _error = 'Network error. Please check your connection.');
          } else if (errStr.contains('sign_in_failed') || errStr.contains('ApiException: 12500')) {
            setState(() => _error = 'Google Sign-In configuration error. Please use email.');
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
    if (e.toString().contains('user-not-found')) {
      return 'No account found with this email';
    }
    if (e.toString().contains('wrong-password')) {
      return 'Incorrect password';
    }
    if (e.toString().contains('invalid-email')) {
      return 'Invalid email address';
    }
    if (e.toString().contains('too-many-requests')) {
      return 'Too many attempts. Please try again later';
    }
    return 'Sign in failed. Please try again';
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
                        color: AppColors.textSecondary,
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

                // Biometric Sign In Button
                if (showBiometric) ...[
                  const SizedBox(height: 12),
                  OutlinedButton.icon(
                    onPressed: _loading ? null : _signInWithBiometrics,
                    icon: const Icon(Icons.face, size: 20),
                    label: const Text('Sign in with Face ID'),
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
                        color: AppColors.textSecondary, fontSize: 13)),
                    ),
                    const Expanded(child: Divider()),
                  ],
                ),
                const SizedBox(height: 20),

                // Google Sign In
                OutlinedButton.icon(
                  onPressed: _loading ? null : () => _signInWithOAuth('google'),
                  icon: const Text('G', style: TextStyle(
                    fontSize: 18, fontWeight: FontWeight.w700,
                    color: AppColors.textPrimary)),
                  label: const Text('Continue with Google'),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: AppColors.textPrimary,
                    side: const BorderSide(color: AppColors.divider),
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12)),
                  ),
                ),
                const SizedBox(height: 10),

                // Apple Sign In
                OutlinedButton.icon(
                  onPressed: _loading ? null : () => _signInWithOAuth('apple'),
                  icon: const Icon(Icons.apple, size: 20,
                    color: AppColors.textPrimary),
                  label: const Text('Continue with Apple'),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: AppColors.textPrimary,
                    side: const BorderSide(color: AppColors.divider),
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12)),
                  ),
                ),

                const SizedBox(height: 12),

                // Sign Up Link
                TextButton(
                  onPressed: () => context.go('/auth/signup'),
                  child: const Text("Don't have an account? Sign Up"),
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
