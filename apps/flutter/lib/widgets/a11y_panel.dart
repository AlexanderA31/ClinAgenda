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
          SegmentedButton<double>(
            showSelectedIcon: false,
            segments: const [ButtonSegment(value: 0.38, label: Text('Lenta')), ButtonSegment(value: 0.5, label: Text('Normal')), ButtonSegment(value: 0.62, label: Text('Rápida'))],
            selected: {p.speechRate},
            onSelectionChanged: (s) => n.update(p.copyWith(speechRate: s.first)),
          ),
          label('Texto'),
          Text('Tamaño de la letra', style: t.titleSmall),
          const SizedBox(height: 6),
          SegmentedButton<double>(
            showSelectedIcon: false,
            segments: const [ButtonSegment(value: 1.0, label: Text('Normal')), ButtonSegment(value: 1.15, label: Text('Grande')), ButtonSegment(value: 1.3, label: Text('Muy grande'))],
            selected: {p.textScale},
            onSelectionChanged: (s) => n.update(p.copyWith(textScale: s.first)),
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
          SegmentedButton<ThemeMode>(
            showSelectedIcon: false,
            segments: const [
              ButtonSegment(value: ThemeMode.system, label: Text('Automático')),
              ButtonSegment(value: ThemeMode.light, label: Text('Claro')),
              ButtonSegment(value: ThemeMode.dark, label: Text('Oscuro')),
            ],
            selected: {p.theme},
            onSelectionChanged: (s) => n.update(p.copyWith(theme: s.first)),
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

/// Barra "Leyendo…" sobre todas las pantallas mientras la voz lee.
class ReaderBar extends ConsumerWidget {
  const ReaderBar({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final r = ref.watch(readerProvider);
    if (r.state == ReaderState.idle) return const SizedBox.shrink();
    final n = ref.read(readerProvider.notifier);
    final paused = r.state == ReaderState.paused;
    return SafeArea(
      child: Align(
        alignment: Alignment.bottomCenter,
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Material(
            elevation: 6,
            borderRadius: BorderRadius.circular(14),
            color: Theme.of(context).colorScheme.surface,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 10, 8, 10),
              child: Row(children: [
                Icon(Icons.record_voice_over, color: Theme.of(context).colorScheme.primary),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
                    Text(paused ? 'En pausa' : 'Leyendo…', style: const TextStyle(fontWeight: FontWeight.w700)),
                    Text(r.current, maxLines: 1, overflow: TextOverflow.ellipsis),
                  ]),
                ),
                IconButton(tooltip: paused ? 'Seguir' : 'Pausar', onPressed: paused ? n.resume : n.pause, icon: Icon(paused ? Icons.play_arrow : Icons.pause)),
                IconButton(tooltip: 'Detener', onPressed: n.stop, icon: const Icon(Icons.stop)),
              ]),
            ),
          ),
        ),
      ),
    );
  }
}
