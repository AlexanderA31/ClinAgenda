import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../core/api.dart';
import '../core/labels.dart';
import '../core/theme.dart';

/// Contenido que viene de la API: cargando, error con "Reintentar", o los datos.
class AsyncBody<T> extends StatelessWidget {
  const AsyncBody({super.key, required this.value, required this.data, this.onRetry});
  final AsyncValue<T> value;
  final Widget Function(T data) data;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) {
    return value.when(
      skipLoadingOnRefresh: true,
      skipLoadingOnReload: true,
      data: data,
      loading: () => const Padding(padding: EdgeInsets.all(40), child: Center(child: CircularProgressIndicator())),
      // Arriba y del tamaño de su texto (sin Align se estiraba a toda la pantalla).
      error: (e, _) => Align(
        alignment: Alignment.topCenter,
        child: Padding(
        padding: const EdgeInsets.all(16),
        child: Notice(
          tone: Tone.danger,
          title: 'No se pudo cargar',
          body: errorText(e),
          action: onRetry == null ? null : OutlinedButton.icon(onPressed: onRetry, icon: const Icon(Icons.refresh), label: const Text('Reintentar')),
        ),
        ),
      ),
    );
  }
}

enum Tone { info, good, warn, danger, neutral }

Color toneColor(BuildContext context, Tone t) {
  final dark = Theme.of(context).brightness == Brightness.dark;
  return switch (t) {
    Tone.info => dark ? const Color(0xFF9DB4FF) : Brand.info,
    Tone.good => dark ? const Color(0xFF6FD39B) : Brand.good,
    Tone.warn => dark ? const Color(0xFFF5B661) : Brand.warn,
    Tone.danger => dark ? const Color(0xFFFF8A7A) : Brand.danger,
    Tone.neutral => Theme.of(context).colorScheme.onSurfaceVariant,
  };
}

class Notice extends StatelessWidget {
  const Notice({super.key, required this.tone, this.title, this.body, this.child, this.action});
  final Tone tone;
  final String? title;
  final String? body;
  final Widget? child;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    final c = toneColor(context, tone);
    final icon = switch (tone) {
      Tone.danger => Icons.error_outline,
      Tone.warn => Icons.warning_amber_rounded,
      Tone.good => Icons.check_circle_outline,
      _ => Icons.info_outline,
    };
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(color: c.withValues(alpha: 0.08), borderRadius: BorderRadius.circular(12), border: Border.all(color: c.withValues(alpha: 0.5))),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, color: c),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (title != null) Text(title!, style: TextStyle(fontWeight: FontWeight.w700, color: c)),
                if (body != null) Padding(padding: EdgeInsets.only(top: title == null ? 0 : 4), child: Text(body!)),
                if (child != null) Padding(padding: const EdgeInsets.only(top: 6), child: child!),
                if (action != null) Padding(padding: const EdgeInsets.only(top: 10), child: action!),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class EmptyState extends StatelessWidget {
  const EmptyState({super.key, required this.title, this.body, this.icon = Icons.inbox_outlined, this.action});
  final String title;
  final String? body;
  final IconData icon;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 32, horizontal: 16),
      child: Column(
        children: [
          Icon(icon, size: 44, color: muted),
          const SizedBox(height: 10),
          Text(title, textAlign: TextAlign.center, style: Theme.of(context).textTheme.titleMedium),
          if (body != null) Padding(padding: const EdgeInsets.only(top: 6), child: Text(body!, textAlign: TextAlign.center, style: TextStyle(color: muted))),
          if (action != null) Padding(padding: const EdgeInsets.only(top: 14), child: action!),
        ],
      ),
    );
  }
}

class Badge2 extends StatelessWidget {
  const Badge2({super.key, required this.label, required this.tone, this.icon});
  final String label;
  final Tone tone;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    final c = toneColor(context, tone);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(color: c.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(6)),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        if (icon != null) ...[Icon(icon, size: 15, color: c), const SizedBox(width: 4)],
        Text(label, style: TextStyle(color: c, fontWeight: FontWeight.w700, fontSize: 13)),
      ]),
    );
  }
}

class StatusBadge extends StatelessWidget {
  const StatusBadge(this.status, {super.key});
  final String status;

  @override
  Widget build(BuildContext context) {
    final (tone, icon) = switch (status) {
      'REQUESTED' => (Tone.warn, Icons.hourglass_top),
      'SCHEDULED' => (Tone.info, Icons.event_available),
      'ATTENDED' => (Tone.good, Icons.check_circle),
      'NO_SHOW' => (Tone.warn, Icons.person_off),
      _ => (Tone.danger, Icons.cancel),
    };
    return Badge2(label: statusLabels[status] ?? status, tone: tone, icon: icon);
  }
}

Color statusColor(BuildContext context, String status) => toneColor(context, switch (status) {
      'REQUESTED' || 'NO_SHOW' => Tone.warn,
      'SCHEDULED' => Tone.info,
      'ATTENDED' => Tone.good,
      _ => Tone.danger,
    });

class ClinicDot extends StatelessWidget {
  const ClinicDot(this.name, {super.key, this.size = 10});
  final String name;
  final double size;
  @override
  Widget build(BuildContext context) => Container(width: size, height: size, decoration: BoxDecoration(color: Brand.clinic(name), shape: BoxShape.circle));
}

/// Tarjeta con título de sección.
class SectionCard extends StatelessWidget {
  const SectionCard({super.key, this.title, this.trailing, required this.children, this.padding = const EdgeInsets.all(16)});
  final String? title;
  final Widget? trailing;
  final List<Widget> children;
  final EdgeInsets padding;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: padding,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (title != null)
              Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: Row(children: [
                  Expanded(child: Semantics(header: true, child: Text(title!, style: Theme.of(context).textTheme.titleMedium))),
                  ?trailing,
                ]),
              ),
            ...children,
          ],
        ),
      ),
    );
  }
}

/// Fila "Etiqueta: valor" de los detalles.
class InfoRow extends StatelessWidget {
  const InfoRow(this.label, this.value, {super.key, this.mono = false});
  final String label;
  final String value;
  final bool mono;

  @override
  Widget build(BuildContext context) {
    final l = Text(label, style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant));
    final v = Text(value, style: TextStyle(fontWeight: FontWeight.w600, fontFeatures: mono ? const [FontFeature.tabularFigures()] : null));
    // Con letra grande la etiqueta va arriba del valor, para que ninguno quede apretado.
    final stacked = MediaQuery.textScalerOf(context).scale(1) > 1.2;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: stacked
          ? Column(crossAxisAlignment: CrossAxisAlignment.start, children: [l, v])
          : Row(crossAxisAlignment: CrossAxisAlignment.start, children: [SizedBox(width: 110, child: l), Expanded(child: v)]),
    );
  }
}

/// Título grande de pantalla con su descripción.
class PageHeader extends StatelessWidget {
  const PageHeader(this.title, {super.key, this.description});
  final String title;
  final String? description;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Semantics(header: true, child: Text(title, style: Theme.of(context).textTheme.headlineSmall)),
        if (description != null) Padding(padding: const EdgeInsets.only(top: 4), child: Text(description!, style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant))),
      ]),
    );
  }
}

void showMessage(BuildContext context, String text, {bool error = false, SnackBarAction? action, Duration duration = const Duration(seconds: 5)}) {
  final m = ScaffoldMessenger.of(context);
  m.hideCurrentSnackBar();
  m.showSnackBar(SnackBar(
    content: Text(text),
    backgroundColor: error ? Theme.of(context).colorScheme.error : null,
    action: action,
    duration: duration,
  ));
}

Future<bool> confirm(BuildContext context, {required String title, String? body, String ok = 'Sí', String cancel = 'No', bool danger = false}) async {
  final r = await showDialog<bool>(
    context: context,
    builder: (c) => AlertDialog(
      title: Text(title),
      content: body == null ? null : Text(body),
      actions: [
        TextButton(onPressed: () => Navigator.pop(c, false), child: Text(cancel)),
        FilledButton(
          style: danger ? FilledButton.styleFrom(backgroundColor: Theme.of(c).colorScheme.error, foregroundColor: Theme.of(c).colorScheme.onError) : null,
          onPressed: () => Navigator.pop(c, true),
          child: Text(ok),
        ),
      ],
    ),
  );
  return r == true;
}

/// Ejecuta una acción contra la API mostrando el error en un aviso. Devuelve el resultado o null.
Future<T?> run<T>(BuildContext context, Future<T> Function() action, {String? success}) async {
  try {
    final r = await action();
    if (success != null && context.mounted) showMessage(context, success);
    return r;
  } catch (e) {
    if (context.mounted) showMessage(context, errorText(e), error: true);
    return null;
  }
}

/// Botón que muestra un indicador mientras su acción corre.
class BusyButton extends StatefulWidget {
  const BusyButton({super.key, required this.label, required this.onPressed, this.icon, this.outlined = false, this.danger = false, this.expand = false});
  final String label;
  final Future<void> Function()? onPressed;
  final IconData? icon;
  final bool outlined;
  final bool danger;
  final bool expand;

  @override
  State<BusyButton> createState() => _BusyButtonState();
}

class _BusyButtonState extends State<BusyButton> {
  bool _busy = false;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final onPressed = widget.onPressed == null || _busy
        ? null
        : () async {
            setState(() => _busy = true);
            try {
              await widget.onPressed!();
            } finally {
              if (mounted) setState(() => _busy = false);
            }
          };
    final icon = _busy ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2.5)) : (widget.icon == null ? null : Icon(widget.icon));
    final label = Text(widget.label);
    final Widget b = widget.outlined
        ? (icon == null ? OutlinedButton(onPressed: onPressed, child: label) : OutlinedButton.icon(onPressed: onPressed, icon: icon, label: label))
        : (icon == null
            ? FilledButton(onPressed: onPressed, style: widget.danger ? FilledButton.styleFrom(backgroundColor: scheme.error, foregroundColor: scheme.onError) : null, child: label)
            : FilledButton.icon(onPressed: onPressed, style: widget.danger ? FilledButton.styleFrom(backgroundColor: scheme.error, foregroundColor: scheme.onError) : null, icon: icon, label: label));
    return widget.expand ? SizedBox(width: double.infinity, child: b) : b;
  }
}

/// Campo de búsqueda que espera a que se deje de escribir.
class SearchField extends StatefulWidget {
  const SearchField({super.key, required this.onChanged, this.hint = 'Buscar', this.label});
  final ValueChanged<String> onChanged;
  final String hint;
  final String? label;

  @override
  State<SearchField> createState() => _SearchFieldState();
}

class _SearchFieldState extends State<SearchField> {
  Timer? _t;
  final _c = TextEditingController();

  @override
  void dispose() {
    _t?.cancel();
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return TextField(
      controller: _c,
      textInputAction: TextInputAction.search,
      decoration: InputDecoration(
        labelText: widget.label,
        hintText: widget.hint,
        prefixIcon: const Icon(Icons.search),
        suffixIcon: _c.text.isEmpty
            ? null
            : IconButton(
                tooltip: 'Borrar',
                icon: const Icon(Icons.close),
                onPressed: () {
                  _c.clear();
                  setState(() {});
                  widget.onChanged('');
                },
              ),
      ),
      onChanged: (v) {
        setState(() {});
        _t?.cancel();
        _t = Timer(const Duration(milliseconds: 350), () => widget.onChanged(v.trim()));
      },
    );
  }
}

/// Abre WhatsApp, el marcador o el navegador.
Future<void> openExternal(BuildContext context, Uri uri) async {
  final ok = await launchUrl(uri, mode: LaunchMode.externalApplication).catchError((_) => false);
  if (!ok && context.mounted) showMessage(context, 'No se pudo abrir: ${uri.scheme == 'tel' ? 'no hay una app de teléfono' : uri.toString()}', error: true);
}

Uri telUri(String e164) => Uri(scheme: 'tel', path: e164);
Uri whatsappUri(String e164, String text) => Uri.parse('https://wa.me/${e164.replaceAll(RegExp(r'\D'), '')}?text=${Uri.encodeComponent(text)}');

/// Lista desplegable sencilla con etiqueta.
class Select<T> extends StatelessWidget {
  const Select({super.key, required this.label, required this.value, required this.items, required this.onChanged, this.hint});
  final String label;
  final T? value;
  final Map<T, String> items;
  final ValueChanged<T?>? onChanged;
  final String? hint;

  @override
  Widget build(BuildContext context) {
    return DropdownButtonFormField<T>(
      key: ValueKey('$label-$value-${items.length}'),
      initialValue: items.containsKey(value) ? value : null,
      isExpanded: true,
      decoration: InputDecoration(labelText: label),
      hint: hint == null ? null : Text(hint!),
      items: [for (final e in items.entries) DropdownMenuItem(value: e.key, child: Text(e.value, overflow: TextOverflow.ellipsis))],
      onChanged: onChanged,
    );
  }
}

/// Error de un campo devuelto por la API ("fields").
String? fieldError(Object? error, String field) => error is ApiError ? error.fields[field] : null;

/// Pantalla con desplazamiento, márgenes y "tirar para actualizar".
class PageList extends StatelessWidget {
  const PageList({super.key, required this.children, this.onRefresh, this.padding = const EdgeInsets.fromLTRB(16, 16, 16, 96)});
  final List<Widget> children;
  final Future<void> Function()? onRefresh;
  final EdgeInsets padding;

  @override
  Widget build(BuildContext context) {
    final list = ListView(padding: padding, physics: const AlwaysScrollableScrollPhysics(), children: _spaced(children));
    return onRefresh == null ? list : RefreshIndicator(onRefresh: onRefresh!, child: list);
  }

  static List<Widget> _spaced(List<Widget> c) => [
        for (var i = 0; i < c.length; i++) ...[if (i > 0) const SizedBox(height: 14), c[i]],
      ];
}

/// Cifras cortas en una sola tarjeta: número grande y etiqueta debajo.
class StatStrip extends StatelessWidget {
  const StatStrip({super.key, required this.items});
  final List<(String label, int value, Tone tone)> items;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    return Card(
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 6),
        child: Row(children: [
          for (final (label, value, tone) in items)
            Expanded(
              child: Semantics(
                label: '$label: $value',
                excludeSemantics: true,
                child: Column(children: [
                  Text('$value', style: t.headlineSmall?.copyWith(color: value == 0 ? Theme.of(context).colorScheme.onSurfaceVariant : toneColor(context, tone))),
                  const SizedBox(height: 2),
                  FittedBox(fit: BoxFit.scaleDown, child: Text(label, maxLines: 1, style: t.bodySmall?.copyWith(fontWeight: FontWeight.w600))),
                ]),
              ),
            ),
        ]),
      ),
    );
  }
}

/// Tarjeta que se abre al tocar su título: para lo que se usa poco (cambiar contraseña, sesiones).
class FoldCard extends StatelessWidget {
  const FoldCard({super.key, required this.title, this.subtitle, required this.icon, required this.children});
  final String title;
  final String? subtitle;
  final IconData icon;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return Card(
      clipBehavior: Clip.antiAlias,
      child: ExpansionTile(
        leading: Icon(icon),
        title: Text(title, style: Theme.of(context).textTheme.titleMedium),
        subtitle: subtitle == null ? null : Text(subtitle!),
        shape: const Border(),
        collapsedShape: const Border(),
        childrenPadding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
        expandedCrossAxisAlignment: CrossAxisAlignment.stretch,
        children: children,
      ),
    );
  }
}
