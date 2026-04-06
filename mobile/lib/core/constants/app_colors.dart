import 'dart:ui';

/// Penny Mobile color tokens.
/// Clean Blue design system — light theme, blue #0A84FF accent.
abstract final class AppColors {
  // Brand
  static const primary = Color(0xFF0A84FF);
  static const primaryLight = Color(0xFF5AC8FA);

  // Backgrounds
  static const background = Color(0xFFFFFFFF);
  static const surface = Color(0xFFF5F5F7);
  static const surfaceSecondary = Color(0xFFE5E5EA);

  // Text
  static const textPrimary = Color(0xFF1C1C1E);
  static const textSecondary = Color(0xFF8E8E93);
  static const textTertiary = Color(0xFFC7C7CC);

  // Semantic
  static const success = Color(0xFF34C759);
  static const warning = Color(0xFFFF9F0A);
  static const error = Color(0xFFFF3B30);

  // Borders / Dividers
  static const divider = Color(0xFFE5E5EA);
  static const border = Color(0xFFD1D1D6);

  // Dark theme colors
  static const darkBackground = Color(0xFF000000);       // Pure black (OLED)
  static const darkSurface = Color(0xFF1C1C1E);          // iOS dark gray
  static const darkSurfaceSecondary = Color(0xFF2C2C2E);
  static const darkTextPrimary = Color(0xFFFFFFFF);
  static const darkTextSecondary = Color(0xFF8E8E93);    // Same gray works both themes
  static const darkTextTertiary = Color(0xFF48484A);
  static const darkDivider = Color(0xFF38383A);
  static const darkBorder = Color(0xFF48484A);
}
