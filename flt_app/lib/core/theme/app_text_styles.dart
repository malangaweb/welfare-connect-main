import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

/// Design System Typography based on DESIGN.md
/// Font Family: Manrope with specified weights and sizes
class AppTextStyles {
  // Display Large - 40px, weight 800, -0.02em letter spacing, 48px line height
  static TextStyle get displayLarge => GoogleFonts.manrope(
        fontSize: 40,
        fontWeight: FontWeight.w800,
        letterSpacing: -0.02,
        height: 48 / 40,
      );

  // Headline Large - 32px, weight 700, -0.01em letter spacing, 40px line height
  static TextStyle get headlineLarge => GoogleFonts.manrope(
        fontSize: 32,
        fontWeight: FontWeight.w700,
        letterSpacing: -0.01,
        height: 40 / 32,
      );

  // Headline Medium - 24px, weight 700, 32px line height
  static TextStyle get headlineMedium => GoogleFonts.manrope(
        fontSize: 24,
        fontWeight: FontWeight.w700,
        height: 32 / 24,
      );

  // Title Large - 20px, weight 600, 28px line height
  static TextStyle get titleLarge => GoogleFonts.manrope(
        fontSize: 20,
        fontWeight: FontWeight.w600,
        height: 28 / 20,
      );

  // Body Large - 16px, weight 400, 24px line height
  static TextStyle get bodyLarge => GoogleFonts.manrope(
        fontSize: 16,
        fontWeight: FontWeight.w400,
        height: 24 / 16,
      );

  // Body Medium - 14px, weight 400, 20px line height
  static TextStyle get bodyMedium => GoogleFonts.manrope(
        fontSize: 14,
        fontWeight: FontWeight.w400,
        height: 20 / 14,
      );

  // Label Large - 14px, weight 600, 20px line height, 0.1px letter spacing
  static TextStyle get labelLarge => GoogleFonts.manrope(
        fontSize: 14,
        fontWeight: FontWeight.w600,
        letterSpacing: 0.1,
        height: 20 / 14,
      );

  // Label Small - 11px, weight 500, 16px line height, 0.5px letter spacing
  static TextStyle get labelSmall => GoogleFonts.manrope(
        fontSize: 11,
        fontWeight: FontWeight.w500,
        letterSpacing: 0.5,
        height: 16 / 11,
      );
}

/// Extension to apply custom text styles to a theme
extension AppTextTheme on TextTheme {
  // Custom named text styles matching design system
  TextStyle get displayLarge => AppTextStyles.displayLarge;
  TextStyle get headlineLarge => AppTextStyles.headlineLarge;
  TextStyle get headlineMedium => AppTextStyles.headlineMedium;
  TextStyle get titleLarge => AppTextStyles.titleLarge;
  TextStyle get bodyLarge => AppTextStyles.bodyLarge;
  TextStyle get bodyMedium => AppTextStyles.bodyMedium;
  TextStyle get labelLarge => AppTextStyles.labelLarge;
  TextStyle get labelSmall => AppTextStyles.labelSmall;
}
