const groupIconFallback = '👥';

const groupIconOptions = [
  groupIconFallback,
  '👨‍👩‍👧‍👦',
  '🏢',
  '🏠',
  '✈️',
  '🎯',
  '💼',
  '🎉',
];

String safeGroupIcon(String? icon) {
  if (icon != null && groupIconOptions.contains(icon)) {
    return icon;
  }
  return groupIconFallback;
}
