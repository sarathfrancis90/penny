import 'dart:io';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_storage/firebase_storage.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';
import 'package:intl/intl.dart';
import 'package:penny_mobile/core/constants/app_colors.dart';
import 'package:penny_mobile/presentation/providers/auth_provider.dart';

class ProfileScreen extends ConsumerStatefulWidget {
  const ProfileScreen({super.key});

  @override
  ConsumerState<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends ConsumerState<ProfileScreen> {
  bool _uploadingAvatar = false;

  // ---------------------------------------------------------------------------
  // Display Name Editing
  // ---------------------------------------------------------------------------

  void _showEditNameSheet() {
    final user = ref.read(currentUserProvider);
    final controller = TextEditingController(text: user?.displayName ?? '');
    final formKey = GlobalKey<FormState>();

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (ctx) {
        var saving = false;

        return StatefulBuilder(
          builder: (ctx, setSheetState) {
            return Padding(
              padding: EdgeInsets.only(
                left: 24,
                right: 24,
                top: 24,
                bottom: MediaQuery.of(ctx).viewInsets.bottom + 24,
              ),
              child: Form(
                key: formKey,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const Text(
                      'Edit Display Name',
                      style: TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const SizedBox(height: 16),
                    TextFormField(
                      controller: controller,
                      autofocus: true,
                      maxLength: 50,
                      decoration: const InputDecoration(
                        hintText: 'Your name',
                        counterText: '',
                      ),
                      validator: (v) {
                        if (v == null || v.trim().isEmpty) {
                          return 'Name cannot be empty';
                        }
                        if (v.trim().length > 50) {
                          return 'Name must be 50 characters or less';
                        }
                        return null;
                      },
                    ),
                    const SizedBox(height: 16),
                    ElevatedButton(
                      onPressed: saving
                          ? null
                          : () async {
                              if (!formKey.currentState!.validate()) return;
                              setSheetState(() => saving = true);
                              try {
                                final name = controller.text.trim();
                                final currentUser =
                                    FirebaseAuth.instance.currentUser;
                                if (currentUser == null) return;

                                await currentUser.updateDisplayName(name);
                                await currentUser.reload();
                                await FirebaseFirestore.instance
                                    .collection('users')
                                    .doc(currentUser.uid)
                                    .set(
                                  {
                                    'displayName': name,
                                    'updatedAt': FieldValue.serverTimestamp(),
                                  },
                                  SetOptions(merge: true),
                                );

                                HapticFeedback.mediumImpact();

                                if (ctx.mounted) Navigator.of(ctx).pop();
                                // Refresh profile UI without invalidating
                                // authStateProvider (which triggers router
                                // redirect and navigates away from Profile).
                                if (mounted) setState(() {});
                              } catch (e) {
                                setSheetState(() => saving = false);
                                if (ctx.mounted) {
                                  ScaffoldMessenger.of(ctx).showSnackBar(
                                    SnackBar(
                                      content: Text(
                                          'Failed to update name: ${e.toString()}'),
                                    ),
                                  );
                                }
                              }
                            },
                      child: saving
                          ? const SizedBox(
                              height: 20,
                              width: 20,
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                                color: Colors.white,
                              ),
                            )
                          : const Text('Save'),
                    ),
                  ],
                ),
              ),
            );
          },
        );
      },
    );
  }

  // ---------------------------------------------------------------------------
  // Avatar Upload
  // ---------------------------------------------------------------------------

  void _showAvatarOptions() {
    final user = ref.read(currentUserProvider);
    final hasPhoto = user?.photoURL != null && user!.photoURL!.isNotEmpty;

    showModalBottomSheet(
      context: context,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (ctx) {
        return SafeArea(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const SizedBox(height: 8),
              Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: Theme.of(context).dividerColor,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
              const SizedBox(height: 16),
              ListTile(
                leading: const Icon(Icons.camera_alt_outlined),
                title: const Text('Take Photo'),
                onTap: () {
                  Navigator.of(ctx).pop();
                  _pickAndUploadAvatar(ImageSource.camera);
                },
              ),
              ListTile(
                leading: const Icon(Icons.photo_library_outlined),
                title: const Text('Choose from Gallery'),
                onTap: () {
                  Navigator.of(ctx).pop();
                  _pickAndUploadAvatar(ImageSource.gallery);
                },
              ),
              if (hasPhoto)
                ListTile(
                  leading: const Icon(Icons.delete_outline,
                      color: AppColors.error),
                  title: const Text('Remove Photo',
                      style: TextStyle(color: AppColors.error)),
                  onTap: () {
                    Navigator.of(ctx).pop();
                    _removeAvatar();
                  },
                ),
              const SizedBox(height: 8),
            ],
          ),
        );
      },
    );
  }

  Future<void> _pickAndUploadAvatar(ImageSource source) async {
    try {
      final picker = ImagePicker();
      final picked = await picker.pickImage(
        source: source,
        maxWidth: 512,
        maxHeight: 512,
        imageQuality: 85,
      );
      if (picked == null) return;

      if (mounted) setState(() => _uploadingAvatar = true);

      final user = FirebaseAuth.instance.currentUser;
      if (user == null) return;

      final file = File(picked.path);
      final storageRef = FirebaseStorage.instance
          .ref()
          .child('avatars')
          .child(user.uid)
          .child('profile.jpg');

      await storageRef.putFile(
        file,
        SettableMetadata(contentType: 'image/jpeg'),
      );
      final downloadUrl = await storageRef.getDownloadURL();

      await user.updatePhotoURL(downloadUrl);
      await user.reload();
      await FirebaseFirestore.instance.collection('users').doc(user.uid).set(
        {
          'photoURL': downloadUrl,
          'updatedAt': FieldValue.serverTimestamp(),
        },
        SetOptions(merge: true),
      );

      ref.invalidate(authStateProvider);
      HapticFeedback.mediumImpact();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to upload photo: ${e.toString()}')),
        );
      }
    } finally {
      if (mounted) setState(() => _uploadingAvatar = false);
    }
  }

  Future<void> _removeAvatar() async {
    try {
      if (mounted) setState(() => _uploadingAvatar = true);

      final user = FirebaseAuth.instance.currentUser;
      if (user == null) return;

      // Delete from storage
      try {
        final storageRef = FirebaseStorage.instance
            .ref()
            .child('avatars')
            .child(user.uid)
            .child('profile.jpg');
        await storageRef.delete();
      } catch (_) {
        // File may not exist in storage — continue
      }

      await user.updatePhotoURL(null);
      await user.reload();
      await FirebaseFirestore.instance.collection('users').doc(user.uid).set(
        {
          'photoURL': FieldValue.delete(),
          'updatedAt': FieldValue.serverTimestamp(),
        },
        SetOptions(merge: true),
      );

      ref.invalidate(authStateProvider);
      HapticFeedback.mediumImpact();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to remove photo: ${e.toString()}')),
        );
      }
    } finally {
      if (mounted) setState(() => _uploadingAvatar = false);
    }
  }

  // ---------------------------------------------------------------------------
  // Build
  // ---------------------------------------------------------------------------

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(currentUserProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Profile')),
      body: ListView(
        padding: const EdgeInsets.symmetric(horizontal: 16),
        children: [
          const SizedBox(height: 16),

          // User info
          Center(
            child: Column(
              children: [
                // Avatar with camera badge
                GestureDetector(
                  onTap: _showAvatarOptions,
                  child: Stack(
                    children: [
                      _buildAvatar(user),
                      Positioned(
                        bottom: 0,
                        right: 0,
                        child: Container(
                          width: 28,
                          height: 28,
                          decoration: BoxDecoration(
                            color: AppColors.primary,
                            shape: BoxShape.circle,
                            border: Border.all(
                              color: Theme.of(context).scaffoldBackgroundColor,
                              width: 2,
                            ),
                          ),
                          child: const Icon(
                            Icons.camera_alt,
                            size: 14,
                            color: Colors.white,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 12),

                // Display name (tappable)
                GestureDetector(
                  onTap: _showEditNameSheet,
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        user?.displayName ?? 'User',
                        style: const TextStyle(
                          fontSize: 20,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      const SizedBox(width: 4),
                      Icon(
                        Icons.edit_outlined,
                        size: 16,
                        color: Theme.of(context).colorScheme.onSurfaceVariant,
                      ),
                    ],
                  ),
                ),

                // Email
                const SizedBox(height: 2),
                Text(
                  user?.email ?? '',
                  style: TextStyle(
                    fontSize: 14,
                    color: Theme.of(context).colorScheme.onSurfaceVariant,
                  ),
                ),

                // Email verification badge
                const SizedBox(height: 6),
                _buildEmailVerificationBadge(user),

                // Member since
                if (user?.metadata.creationTime != null) ...[
                  const SizedBox(height: 4),
                  Text(
                    'Member since ${DateFormat('MMMM yyyy').format(user!.metadata.creationTime!)}',
                    style: TextStyle(
                      fontSize: 12,
                      color: Theme.of(context).colorScheme.onSurfaceVariant,
                    ),
                  ),
                ],
              ],
            ),
          ),

          const SizedBox(height: 32),

          // Navigation links
          _ProfileTile(
            icon: Icons.account_balance_outlined,
            title: 'Income',
            subtitle: 'Manage income sources',
            onTap: () => context.push('/income'),
          ),
          _ProfileTile(
            icon: Icons.savings_outlined,
            title: 'Savings Goals',
            subtitle: 'Track your savings progress',
            onTap: () => context.push('/savings'),
          ),
          _ProfileTile(
            icon: Icons.notifications_outlined,
            title: 'Notifications',
            subtitle: 'Manage alerts and preferences',
            onTap: () => context.push('/notifications'),
          ),
          _ProfileTile(
            icon: Icons.settings_outlined,
            title: 'Settings',
            subtitle: 'Currency, fiscal year, theme',
            onTap: () => context.push('/settings'),
          ),

          const SizedBox(height: 24),

          // Sign out
          TextButton(
            onPressed: () => ref.read(authServiceProvider).signOut(),
            child: const Text(
              'Sign Out',
              style: TextStyle(color: Color(0xFFFF3B30)),
            ),
          ),
          const SizedBox(height: 24),
        ],
      ),
    );
  }

  Widget _buildAvatar(User? user) {
    final photoUrl = user?.photoURL;
    final hasPhoto = photoUrl != null && photoUrl.isNotEmpty;

    return SizedBox(
      width: 80,
      height: 80,
      child: Stack(
        children: [
          if (hasPhoto)
            ClipOval(
              child: CachedNetworkImage(
                imageUrl: photoUrl,
                width: 80,
                height: 80,
                fit: BoxFit.cover,
                placeholder: (_, _) => CircleAvatar(
                  radius: 40,
                  backgroundColor: Theme.of(context).cardColor,
                  child: Text(
                    _getInitial(user),
                    style: const TextStyle(
                      fontSize: 32,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
                errorWidget: (_, _, _) => CircleAvatar(
                  radius: 40,
                  backgroundColor: Theme.of(context).cardColor,
                  child: Text(
                    _getInitial(user),
                    style: const TextStyle(
                      fontSize: 32,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ),
            )
          else
            CircleAvatar(
              radius: 40,
              backgroundColor: Theme.of(context).cardColor,
              child: Text(
                _getInitial(user),
                style: const TextStyle(
                  fontSize: 32,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),

          // Loading overlay
          if (_uploadingAvatar)
            Container(
              width: 80,
              height: 80,
              decoration: const BoxDecoration(
                color: Colors.black38,
                shape: BoxShape.circle,
              ),
              child: const Center(
                child: SizedBox(
                  width: 24,
                  height: 24,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    color: Colors.white,
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }

  String _getInitial(User? user) {
    return (user?.displayName ?? user?.email ?? '?')
        .substring(0, 1)
        .toUpperCase();
  }

  Widget _buildEmailVerificationBadge(User? user) {
    if (user == null) return const SizedBox.shrink();

    if (user.emailVerified) {
      return Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.check_circle, size: 14, color: AppColors.success),
          const SizedBox(width: 4),
          Text(
            'Email Verified',
            style: TextStyle(
              fontSize: 12,
              color: AppColors.success,
              fontWeight: FontWeight.w500,
            ),
          ),
        ],
      );
    }

    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(Icons.info_outline, size: 14, color: AppColors.warning),
        const SizedBox(width: 4),
        Text(
          'Email Not Verified',
          style: TextStyle(
            fontSize: 12,
            color: AppColors.warning,
            fontWeight: FontWeight.w500,
          ),
        ),
      ],
    );
  }
}

class _ProfileTile extends StatelessWidget {
  const _ProfileTile({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 14),
        child: Row(
          children: [
            Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(
                color: Theme.of(context).cardColor,
                borderRadius: BorderRadius.circular(10),
              ),
              child: Icon(icon, size: 20, color: Theme.of(context).colorScheme.onSurfaceVariant),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title,
                      style: const TextStyle(
                          fontSize: 16, fontWeight: FontWeight.w500)),
                  Text(subtitle,
                      style: TextStyle(
                          fontSize: 13, color: Theme.of(context).colorScheme.onSurfaceVariant)),
                ],
              ),
            ),
            Icon(Icons.chevron_right, color: Theme.of(context).hintColor),
          ],
        ),
      ),
    );
  }
}
