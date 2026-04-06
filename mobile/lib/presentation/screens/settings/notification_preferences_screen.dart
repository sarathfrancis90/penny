import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:penny_mobile/core/constants/app_colors.dart';
import 'package:penny_mobile/core/constants/notification_types.dart';
import 'package:penny_mobile/data/models/notification_preferences_model.dart';
import 'package:penny_mobile/presentation/providers/auth_provider.dart';
import 'package:penny_mobile/presentation/providers/notification_preferences_providers.dart';

class NotificationPreferencesScreen extends ConsumerWidget {
  const NotificationPreferencesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final settingsAsync = ref.watch(notificationSettingsProvider);
    final prefsAsync = ref.watch(notificationTypePrefsProvider);

    final settings =
        settingsAsync.valueOrNull ?? const NotificationSettingsModel();
    final prefs =
        prefsAsync.valueOrNull ?? NotificationPreferencesModel.defaults();

    return Scaffold(
      appBar: AppBar(title: const Text('Notification Preferences')),
      body: ListView(
        padding: const EdgeInsets.symmetric(horizontal: 16),
        children: [
          const SizedBox(height: 16),

          // --- Global section ---
          const _SectionHeader(title: 'GLOBAL'),
          const SizedBox(height: 8),
          _GlobalMuteToggle(
            value: settings.globalMute,
            onChanged: (value) =>
                _updateSetting(ref, {'globalMute': value}),
          ),
          _QuietHoursRow(
            startTime: settings.quietHoursStart,
            endTime: settings.quietHoursEnd,
            onTap: () => _showQuietHoursPicker(context, ref, settings),
          ),

          const SizedBox(height: 24),

          // --- Per-category sections ---
          for (final category in notificationCategories) ...[
            _SectionHeader(title: category.title.toUpperCase()),
            const SizedBox(height: 8),
            for (final type in category.types)
              _NotificationTypeRow(
                type: type,
                preference: prefs.forType(type),
                disabled: settings.globalMute,
                onTap: () => _showTypePreferenceSheet(
                    context, ref, type, prefs.forType(type)),
              ),
            const SizedBox(height: 24),
          ],
        ],
      ),
    );
  }

  void _updateSetting(WidgetRef ref, Map<String, dynamic> updates) {
    final user = ref.read(currentUserProvider);
    if (user == null) return;
    ref
        .read(notificationPreferencesRepoProvider)
        .updateSettings(user.uid, updates);
    HapticFeedback.selectionClick();
  }

  void _showQuietHoursPicker(
    BuildContext context,
    WidgetRef ref,
    NotificationSettingsModel settings,
  ) {
    var startTime = _parseTimeOfDay(settings.quietHoursStart);
    var endTime = _parseTimeOfDay(settings.quietHoursEnd);

    showModalBottomSheet(
      context: context,
      builder: (ctx) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'Quiet Hours',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600),
              ),
              const SizedBox(height: 4),
              Text(
                'No push notifications during these hours',
                style: TextStyle(
                    fontSize: 13, color: Theme.of(context).colorScheme.onSurfaceVariant),
              ),
              const SizedBox(height: 20),
              StatefulBuilder(
                builder: (context, setState) => Column(
                  children: [
                    _TimePickerRow(
                      label: 'Start',
                      time: startTime,
                      onTap: () async {
                        final picked = await showTimePicker(
                          context: context,
                          initialTime: startTime,
                        );
                        if (picked != null) {
                          setState(() => startTime = picked);
                        }
                      },
                    ),
                    const SizedBox(height: 12),
                    _TimePickerRow(
                      label: 'End',
                      time: endTime,
                      onTap: () async {
                        final picked = await showTimePicker(
                          context: context,
                          initialTime: endTime,
                        );
                        if (picked != null) {
                          setState(() => endTime = picked);
                        }
                      },
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 24),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: () {
                    _updateSetting(ref, {
                      'quietHoursStart': _formatTimeOfDay(startTime),
                      'quietHoursEnd': _formatTimeOfDay(endTime),
                    });
                    Navigator.pop(ctx);
                  },
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.primary,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12)),
                  ),
                  child: const Text('Save'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _showTypePreferenceSheet(
    BuildContext context,
    WidgetRef ref,
    NotificationType type,
    NotificationTypePreference pref,
  ) {
    showModalBottomSheet(
      context: context,
      builder: (ctx) => SafeArea(
        child: _TypePreferenceSheet(
          type: type,
          initialPref: pref,
          onSave: (updatedPref) {
            final user = ref.read(currentUserProvider);
            if (user == null) return;
            ref
                .read(notificationPreferencesRepoProvider)
                .updateTypePreference(user.uid, type, updatedPref);
            HapticFeedback.selectionClick();
            Navigator.pop(ctx);
          },
        ),
      ),
    );
  }

  TimeOfDay _parseTimeOfDay(String time) {
    final parts = time.split(':');
    return TimeOfDay(
      hour: int.tryParse(parts[0]) ?? 22,
      minute: int.tryParse(parts.length > 1 ? parts[1] : '0') ?? 0,
    );
  }

  String _formatTimeOfDay(TimeOfDay time) {
    return '${time.hour.toString().padLeft(2, '0')}:${time.minute.toString().padLeft(2, '0')}';
  }
}

// ---------------------------------------------------------------------------
// Private helper widgets
// ---------------------------------------------------------------------------

class _SectionHeader extends StatelessWidget {
  const _SectionHeader({required this.title});
  final String title;

  @override
  Widget build(BuildContext context) {
    return Text(
      title,
      style: TextStyle(
        fontSize: 12,
        fontWeight: FontWeight.w600,
        color: Theme.of(context).colorScheme.onSurfaceVariant,
        letterSpacing: 1,
      ),
    );
  }
}

class _GlobalMuteToggle extends StatelessWidget {
  const _GlobalMuteToggle({required this.value, required this.onChanged});
  final bool value;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        children: [
          Icon(Icons.do_not_disturb_on_outlined,
              size: 20, color: Theme.of(context).colorScheme.onSurfaceVariant),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Pause All Notifications',
                    style:
                        TextStyle(fontSize: 15, fontWeight: FontWeight.w500)),
                Text('Temporarily mute all notifications',
                    style:
                        TextStyle(fontSize: 12, color: Theme.of(context).colorScheme.onSurfaceVariant)),
              ],
            ),
          ),
          Switch(
            value: value,
            onChanged: onChanged,
            activeTrackColor: AppColors.primary.withValues(alpha: 0.4),
          ),
        ],
      ),
    );
  }
}

class _QuietHoursRow extends StatelessWidget {
  const _QuietHoursRow({
    required this.startTime,
    required this.endTime,
    required this.onTap,
  });

  final String startTime;
  final String endTime;
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
            Icon(Icons.bedtime_outlined,
                size: 20, color: Theme.of(context).colorScheme.onSurfaceVariant),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Quiet Hours',
                      style:
                          TextStyle(fontSize: 15, fontWeight: FontWeight.w500)),
                  Text('No push notifications during these hours',
                      style: TextStyle(
                          fontSize: 12, color: Theme.of(context).colorScheme.onSurfaceVariant)),
                ],
              ),
            ),
            Text('$startTime - $endTime',
                style: TextStyle(
                    fontSize: 14, color: Theme.of(context).colorScheme.onSurfaceVariant)),
            const SizedBox(width: 4),
            Icon(Icons.chevron_right,
                size: 18, color: Theme.of(context).hintColor),
          ],
        ),
      ),
    );
  }
}

class _TimePickerRow extends StatelessWidget {
  const _TimePickerRow({
    required this.label,
    required this.time,
    required this.onTap,
  });

  final String label;
  final TimeOfDay time;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        decoration: BoxDecoration(
          color: Theme.of(context).cardColor,
          borderRadius: BorderRadius.circular(12),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(label,
                style: const TextStyle(
                    fontSize: 15, fontWeight: FontWeight.w500)),
            Text(time.format(context),
                style: const TextStyle(
                    fontSize: 15, color: AppColors.primary)),
          ],
        ),
      ),
    );
  }
}

class _NotificationTypeRow extends StatelessWidget {
  const _NotificationTypeRow({
    required this.type,
    required this.preference,
    required this.disabled,
    required this.onTap,
  });

  final NotificationType type;
  final NotificationTypePreference preference;
  final bool disabled;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final opacity = disabled ? 0.4 : 1.0;

    return Opacity(
      opacity: opacity,
      child: InkWell(
        onTap: disabled ? null : onTap,
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 12),
          child: Row(
            children: [
              const SizedBox(width: 4),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(type.label,
                        style: const TextStyle(
                            fontSize: 15, fontWeight: FontWeight.w500)),
                    const SizedBox(height: 2),
                    Text(type.description,
                        style: TextStyle(
                            fontSize: 12,
                            color: Theme.of(context).colorScheme.onSurfaceVariant)),
                  ],
                ),
              ),
              _StatusIndicators(preference: preference),
              const SizedBox(width: 4),
              Icon(Icons.chevron_right,
                  size: 18, color: Theme.of(context).hintColor),
            ],
          ),
        ),
      ),
    );
  }
}

class _StatusIndicators extends StatelessWidget {
  const _StatusIndicators({required this.preference});
  final NotificationTypePreference preference;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        if (preference.inApp)
          Padding(
            padding: EdgeInsets.only(right: 4),
            child: Icon(Icons.inbox_outlined,
                size: 16, color: Theme.of(context).hintColor),
          ),
        if (preference.push)
          Padding(
            padding: EdgeInsets.only(right: 4),
            child: Icon(Icons.notifications_active_outlined,
                size: 16, color: Theme.of(context).hintColor),
          ),
        if (preference.frequency != 'realtime')
          Text(
            preference.frequency,
            style: TextStyle(
                fontSize: 11, color: Theme.of(context).hintColor),
          ),
      ],
    );
  }
}

class _TypePreferenceSheet extends StatefulWidget {
  const _TypePreferenceSheet({
    required this.type,
    required this.initialPref,
    required this.onSave,
  });

  final NotificationType type;
  final NotificationTypePreference initialPref;
  final ValueChanged<NotificationTypePreference> onSave;

  @override
  State<_TypePreferenceSheet> createState() => _TypePreferenceSheetState();
}

class _TypePreferenceSheetState extends State<_TypePreferenceSheet> {
  late bool _inApp;
  late bool _push;
  late String _frequency;

  static const _frequencies = [
    ('realtime', 'Real-time'),
    ('hourly', 'Hourly'),
    ('daily', 'Daily'),
    ('weekly', 'Weekly'),
    ('never', 'Never'),
  ];

  @override
  void initState() {
    super.initState();
    _inApp = widget.initialPref.inApp;
    _push = widget.initialPref.push;
    _frequency = widget.initialPref.frequency;
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(widget.type.label,
              style: const TextStyle(
                  fontSize: 18, fontWeight: FontWeight.w600)),
          const SizedBox(height: 4),
          Text(widget.type.description,
              style: TextStyle(
                  fontSize: 13, color: Theme.of(context).colorScheme.onSurfaceVariant)),
          const SizedBox(height: 20),

          // In-App toggle
          _ToggleRow(
            icon: Icons.inbox_outlined,
            label: 'In-App',
            subtitle: 'Show in notification center',
            value: _inApp,
            onChanged: (v) => setState(() => _inApp = v),
          ),

          const SizedBox(height: 4),

          // Push toggle
          _ToggleRow(
            icon: Icons.notifications_active_outlined,
            label: 'Push',
            subtitle: 'Send push notification to device',
            value: _push,
            onChanged: (v) => setState(() => _push = v),
          ),

          const SizedBox(height: 16),

          // Frequency dropdown
          Text('Frequency',
              style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                  color: Theme.of(context).colorScheme.onSurfaceVariant)),
          const SizedBox(height: 8),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(horizontal: 12),
            decoration: BoxDecoration(
              color: Theme.of(context).cardColor,
              borderRadius: BorderRadius.circular(12),
            ),
            child: DropdownButtonHideUnderline(
              child: DropdownButton<String>(
                value: _frequency,
                isExpanded: true,
                items: _frequencies.map((f) {
                  return DropdownMenuItem(value: f.$1, child: Text(f.$2));
                }).toList(),
                onChanged: (v) {
                  if (v != null) setState(() => _frequency = v);
                },
              ),
            ),
          ),

          const SizedBox(height: 24),

          // Save button
          SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              onPressed: () {
                widget.onSave(NotificationTypePreference(
                  inApp: _inApp,
                  push: _push,
                  frequency: _frequency,
                ));
              },
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.primary,
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(vertical: 14),
                shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12)),
              ),
              child: const Text('Save'),
            ),
          ),
        ],
      ),
    );
  }
}

class _ToggleRow extends StatelessWidget {
  const _ToggleRow({
    required this.icon,
    required this.label,
    required this.subtitle,
    required this.value,
    required this.onChanged,
  });

  final IconData icon;
  final String label;
  final String subtitle;
  final bool value;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          Icon(icon, size: 20, color: Theme.of(context).colorScheme.onSurfaceVariant),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(label,
                    style: const TextStyle(
                        fontSize: 15, fontWeight: FontWeight.w500)),
                Text(subtitle,
                    style: TextStyle(
                        fontSize: 12, color: Theme.of(context).colorScheme.onSurfaceVariant)),
              ],
            ),
          ),
          Switch(
            value: value,
            onChanged: onChanged,
            activeTrackColor: AppColors.primary.withValues(alpha: 0.4),
          ),
        ],
      ),
    );
  }
}
