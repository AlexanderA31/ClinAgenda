import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/a11y.dart';

/// Botón de la barra superior que abre las opciones de accesibilidad (en todas las pantallas).
class A11yAction extends StatelessWidget {
  const A11yAction({super.key});

  @override
  Widget build(BuildContext context) {
    return IconButton(
      tooltip: 'Accesibilidad',
      icon: const Icon(Icons.accessibility_new),
      onPressed: () => showA11yPanel(context),
    );
  }
}

void showA11yPanel(BuildContext context) {
  showModalBottomSheet(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    showDragHandle: true,
    builder: (_) => const _A11yPanel(),
  );
}

class _A11yPanel extends ConsumerWidget {
  const _A11yPanel();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final p = ref.watch(a11yProvider);
    final n = ref.read(a11yProvider.notifier);
    final t = Theme.of(context).textTheme;
    Widget label(String s) => Padding(padding: const EdgeInsets.only(top: 16, bottom: 8), child: Text(s.toUpperCase(), style: t.labelMedium?.copyWith(letterSpacing: 1.1)));
    return DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.75,
      maxChildSize: 0.95,
      builder: (context, scroll) => ListView(
        controller: scroll,
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 32),
        children: [
          Semantics(header: true, child: Text('Accesibilidad', style: t.headlineSmall)),
          label('Leer en voz alta'),
          FilledButton.icon(
            onPressed: () {
              final reader = ref.read(readerProvider.notifier);
              Navigator.pop(context);
              // Se lee la pantalla de atrás, ya sin este panel.
              Future.delayed(const Duration(milliseconds: 350), reader.readScreen);
            },
            icon: const Icon(Icons.volume_up),
            label: const Text('Leer esta pantalla'),
          ),
          const SizedBox(height: 10),
          Text('Velocidad', style: t.titleSmall),
          const SizedBox(height: 6),
          Choices<double>(
            value: p.speechRate,
            onChanged: (v) => n.update(p.copyWith(speechRate: v)),
            options: const [(0.38, 'Lenta', Icons.slow_motion_video), (0.5, 'Normal', Icons.play_arrow), (0.62, 'Rápida', Icons.fast_forward)],
          ),
          label('Texto'),
          Text('Tamaño de la letra', style: t.titleSmall),
          const SizedBox(height: 6),
          Choices<double>(
            value: p.textScale,
            onChanged: (v) => n.update(p.copyWith(textScale: v)),
            options: const [(1.0, 'Normal', null), (1.15, 'Grande', null), (1.3, 'Muy grande', null)],
            // Una "A" de muestra del tamaño de cada opción.
            preview: (v) => Text('A', textScaler: TextScaler.noScaling, style: TextStyle(fontSize: 16 + (v - 1) * 35, fontWeight: FontWeight.w800, height: 1)),
          ),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('Letra más gruesa'),
            subtitle: const Text('Más fácil de leer con poca vista'),
            value: p.bold,
            onChanged: (v) => n.update(p.copyWith(bold: v)),
          ),
          label('Pantalla'),
          Text('Tema', style: t.titleSmall),
          const SizedBox(height: 6),
          Choices<ThemeMode>(
            value: p.theme,
            onChanged: (v) => n.update(p.copyWith(theme: v)),
            options: const [(ThemeMode.system, 'Automático', Icons.brightness_auto), (ThemeMode.light, 'Claro', Icons.light_mode_outlined), (ThemeMode.dark, 'Oscuro', Icons.dark_mode_outlined)],
          ),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('Alto contraste'),
            subtitle: const Text('Bordes y textos más marcados'),
            value: p.highContrast,
            onChanged: (v) => n.update(p.copyWith(highContrast: v)),
          ),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('Menos movimiento'),
            subtitle: const Text('Sin animaciones al cambiar de pantalla'),
            value: p.reduceMotion,
            onChanged: (v) => n.update(p.copyWith(reduceMotion: v)),
          ),
          const SizedBox(height: 12),
          OutlinedButton.icon(onPressed: n.reset, icon: const Icon(Icons.restart_alt), label: const Text('Restablecer')),
          const SizedBox(height: 8),
          Text('También funciona TalkBack, el lector de pantalla de Android.', style: t.bodySmall),
        ],
      ),
    );
  }
}

/// Opciones de una sola elección en fila, iguales de ancho. El texto se achica en vez de partirse
/// cuando la letra está en "Muy grande".
class Choices<T> extends StatelessWidget {
  const Choices({super.key, required this.value, required this.options, required this.onChanged, this.preview});
  final T value;
  final List<(T, String, IconData?)> options;
  final ValueChanged<T> onChanged;
  final Widget Function(T value)? preview;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Row(children: [
      for (final (i, (v, label, icon)) in options.indexed) ...[
        if (i > 0) const SizedBox(width: 8),
        Expanded(
          child: Semantics(
            inMutuallyExclusiveGroup: true,
            selected: v == value,
            button: true,
            label: label,
            excludeSemantics: true,
            child: Material(
              color: v == value ? scheme.primaryContainer : scheme.surface,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12),
                side: BorderSide(color: v == value ? scheme.primary : scheme.outline, width: v == value ? 2 : 1),
              ),
              child: InkWell(
                borderRadius: BorderRadius.circular(12),
                onTap: () => onChanged(v),
                child: ConstrainedBox(
                  constraints: const BoxConstraints(minHeight: 56),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 8),
                    child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                      if (preview != null)
                        SizedBox(height: 26, child: Center(child: DefaultTextStyle.merge(style: TextStyle(color: v == value ? scheme.onPrimaryContainer : scheme.onSurface), child: preview!(v))))
                      else if (icon != null)
                        Icon(icon, size: 22, color: v == value ? scheme.onPrimaryContainer : scheme.onSurfaceVariant),
                      const SizedBox(height: 4),
                      FittedBox(
                        fit: BoxFit.scaleDown,
                        child: Text(label, maxLines: 1, style: TextStyle(fontWeight: FontWeight.w700, color: v == value ? scheme.onPrimaryContainer : scheme.onSurface)),
                      ),
                    ]),
                  ),
                ),
              ),
            ),
          ),
        ),
      ],
    ]);
  }
}

/// Barra "Leyendo…" al pie de todas las pantallas mientras la voz lee.
/// Está fuera del Navigator (no tiene Overlay), por eso sus botones no usan tooltip sino Semantics.
class ReaderBar extends ConsumerWidget {
  const ReaderBar({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final r = ref.watch(readerProvider);
    if (r.state == ReaderState.idle) return const SizedBox.shrink();
    final n = ref.read(readerProvider.notifier);
    final paused = r.state == ReaderState.paused;
    final scheme = Theme.of(context).colorScheme;
    Widget action(String label, IconData icon, VoidCallback onTap, {bool primary = false}) => Semantics(
          button: true,
          label: label,
          excludeSemantics: true,
          child: Padding(
            padding: const EdgeInsets.only(left: 6),
            child: primary
                ? IconButton.filled(onPressed: onTap, icon: Icon(icon), iconSize: 26, constraints: const BoxConstraints(minWidth: 52, minHeight: 52))
                : IconButton.outlined(onPressed: onTap, icon: Icon(icon), iconSize: 24, constraints: const BoxConstraints(minWidth: 52, minHeight: 52)),
          ),
        );
    return Material(
      color: scheme.surface,
      elevation: 8,
      shadowColor: Colors.black54,
      child: DecoratedBox(
        decoration: BoxDecoration(border: Border(top: BorderSide(color: scheme.primary, width: 3))),
        child: SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 10, 12, 10),
            child: Row(children: [
              Icon(paused ? Icons.pause_circle_outline : Icons.record_voice_over, color: scheme.primary, size: 28),
              const SizedBox(width: 12),
              Expanded(
                child: Semantics(
                  liveRegion: true,
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
                    Text(paused ? 'En pausa' : 'Leyendo la pantalla…', style: TextStyle(fontWeight: FontWeight.w800, color: scheme.primary)),
                    if (r.current.isNotEmpty) Text(r.current, maxLines: 2, overflow: TextOverflow.ellipsis),
                  ]),
                ),
              ),
              action(paused ? 'Seguir leyendo' : 'Pausar la lectura', paused ? Icons.play_arrow : Icons.pause, paused ? n.resume : n.pause, primary: true),
              action('Detener la lectura', Icons.stop, n.stop),
            ]),
          ),
        ),
      ),
    );
  }
}
