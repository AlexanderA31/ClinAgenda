import 'package:flutter/material.dart';

/// Colores de Clínicas Paredes, los mismos de la web (globals.css).
class Brand {
  static const ballpoint = Color(0xFF1D45B5);
  static const ink = Color(0xFF142029);
  static const paper = Color(0xFFF4F7F8);
  static const good = Color(0xFF1E7A46);
  static const warn = Color(0xFFB45309);
  static const danger = Color(0xFFB42318);
  static const info = Color(0xFF1D45B5);

  /// Color de cada clínica (tarjetas, puntos y pestañas).
  static Color clinic(String name) {
    final n = name.toLowerCase();
    if (n.contains('norte')) return const Color(0xFF22594A);
    if (n.contains('sur')) return const Color(0xFFD99A1E);
    return ballpoint;
  }
}

ThemeData buildTheme({required Brightness brightness, required bool highContrast, required bool bold}) {
  final dark = brightness == Brightness.dark;
  final scheme = ColorScheme.fromSeed(
    seedColor: Brand.ballpoint,
    brightness: brightness,
    primary: dark ? const Color(0xFF9DB4FF) : Brand.ballpoint,
    onPrimary: dark ? const Color(0xFF0B1430) : Colors.white,
    surface: dark ? (highContrast ? Colors.black : const Color(0xFF151D23)) : (highContrast ? Colors.white : Colors.white),
    onSurface: dark ? (highContrast ? Colors.white : const Color(0xFFE7EDF1)) : (highContrast ? Colors.black : Brand.ink),
    error: dark ? const Color(0xFFFF8A7A) : Brand.danger,
    outline: highContrast ? (dark ? Colors.white : Colors.black) : (dark ? const Color(0xFF3A4852) : const Color(0xFFCFD9DF)),
    outlineVariant: highContrast ? (dark ? Colors.white70 : Colors.black54) : (dark ? const Color(0xFF2B3842) : const Color(0xFFE2E8EC)),
  );
  final background = dark ? (highContrast ? Colors.black : const Color(0xFF0E1418)) : (highContrast ? Colors.white : Brand.paper);
  final border = BorderSide(color: scheme.outline, width: highContrast ? 2 : 1);
  final weight = bold ? FontWeight.w600 : null;
  final base = ThemeData(useMaterial3: true, colorScheme: scheme, brightness: brightness);
  final text = base.textTheme.apply(bodyColor: scheme.onSurface, displayColor: scheme.onSurface).copyWith(
        headlineMedium: base.textTheme.headlineMedium?.copyWith(fontWeight: FontWeight.w800, letterSpacing: -0.5),
        headlineSmall: base.textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w800),
        titleLarge: base.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700),
        titleMedium: base.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
        bodyLarge: base.textTheme.bodyLarge?.copyWith(fontSize: 16, fontWeight: weight, height: 1.45),
        bodyMedium: base.textTheme.bodyMedium?.copyWith(fontSize: 15, fontWeight: weight, height: 1.4),
        labelLarge: base.textTheme.labelLarge?.copyWith(fontSize: 15, fontWeight: FontWeight.w700),
      );
  const radius = BorderRadius.all(Radius.circular(10));
  return base.copyWith(
    scaffoldBackgroundColor: background,
    textTheme: text,
    appBarTheme: AppBarTheme(
      backgroundColor: scheme.surface,
      foregroundColor: scheme.onSurface,
      elevation: 0,
      scrolledUnderElevation: 1,
      shape: Border(bottom: BorderSide(color: scheme.outlineVariant)),
      titleTextStyle: text.titleLarge,
    ),
    cardTheme: CardThemeData(
      color: scheme.surface,
      elevation: 0,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(borderRadius: const BorderRadius.all(Radius.circular(14)), side: BorderSide(color: highContrast ? scheme.outline : scheme.outlineVariant, width: highContrast ? 2 : 1)),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: scheme.surface,
      border: OutlineInputBorder(borderRadius: radius, borderSide: border),
      enabledBorder: OutlineInputBorder(borderRadius: radius, borderSide: border),
      focusedBorder: OutlineInputBorder(borderRadius: radius, borderSide: BorderSide(color: scheme.primary, width: 2.5)),
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
      floatingLabelBehavior: FloatingLabelBehavior.always,
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(minimumSize: const Size(48, 48), padding: const EdgeInsets.symmetric(horizontal: 18), shape: const RoundedRectangleBorder(borderRadius: radius), textStyle: text.labelLarge),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(minimumSize: const Size(48, 48), padding: const EdgeInsets.symmetric(horizontal: 16), shape: const RoundedRectangleBorder(borderRadius: radius), side: border, textStyle: text.labelLarge),
    ),
    textButtonTheme: TextButtonThemeData(style: TextButton.styleFrom(minimumSize: const Size(48, 48), textStyle: text.labelLarge)),
    chipTheme: base.chipTheme.copyWith(side: border, labelStyle: text.bodyMedium),
    dividerTheme: DividerThemeData(color: scheme.outlineVariant, space: 1),
    listTileTheme: ListTileThemeData(minVerticalPadding: 10, iconColor: scheme.onSurfaceVariant),
    snackBarTheme: const SnackBarThemeData(behavior: SnackBarBehavior.floating, showCloseIcon: true),
    visualDensity: VisualDensity.standard,
  );
}
