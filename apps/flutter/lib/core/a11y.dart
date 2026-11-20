import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_tts/flutter_tts.dart';

import 'config.dart';

/// Preferencias de accesibilidad: se guardan en el teléfono, como en la web.
class A11yPrefs {
  const A11yPrefs({this.textScale = 1.0, this.theme = ThemeMode.system, this.highContrast = false, this.bold = false, this.reduceMotion = false, this.speechRate = 0.5});
  final double textScale;
  final ThemeMode theme;
  final bool highContrast;
  final bool bold;
  final bool reduceMotion;
  final double speechRate;

  A11yPrefs copyWith({double? textScale, ThemeMode? theme, bool? highContrast, bool? bold, bool? reduceMotion, double? speechRate}) => A11yPrefs(
        textScale: textScale ?? this.textScale,
        theme: theme ?? this.theme,
        highContrast: highContrast ?? this.highContrast,
        bold: bold ?? this.bold,
        reduceMotion: reduceMotion ?? this.reduceMotion,
        speechRate: speechRate ?? this.speechRate,
      );
}

class A11yNotifier extends Notifier<A11yPrefs> {
  @override
  A11yPrefs build() => A11yPrefs(
        textScale: prefs.getDouble('a11y.texto') ?? 1.0,
        theme: ThemeMode.values[prefs.getInt('a11y.tema') ?? 0],
        highContrast: prefs.getBool('a11y.contraste') ?? false,
        bold: prefs.getBool('a11y.negrita') ?? false,
        reduceMotion: prefs.getBool('a11y.movimiento') ?? false,
        speechRate: prefs.getDouble('a11y.voz') ?? 0.5,
      );

  void update(A11yPrefs p) {
    state = p;
    prefs.setDouble('a11y.texto', p.textScale);
    prefs.setInt('a11y.tema', p.theme.index);
    prefs.setBool('a11y.contraste', p.highContrast);
    prefs.setBool('a11y.negrita', p.bold);
    prefs.setBool('a11y.movimiento', p.reduceMotion);
    prefs.setDouble('a11y.voz', p.speechRate);
  }

  void reset() => update(const A11yPrefs());
}

final a11yProvider = NotifierProvider<A11yNotifier, A11yPrefs>(A11yNotifier.new);

enum ReaderState { idle, playing, paused }

class ReaderStatus {
  const ReaderStatus(this.state, [this.current = '']);
  final ReaderState state;
  final String current;
}

/// "Leer esta pantalla" con la voz del teléfono. Lee el árbol de semántica (lo mismo que usa TalkBack),
/// así solo se lee lo que está a la vista en la pantalla actual, en orden.
class ReaderNotifier extends Notifier<ReaderStatus> {
  final _tts = FlutterTts();
  List<String> _queue = [];
  int _run = 0;
  SemanticsHandle? _handle;

  @override
  ReaderStatus build() {
    _tts.awaitSpeakCompletion(true);
    ref.onDispose(() {
      _tts.stop();
      _handle?.dispose();
    });
    return const ReaderStatus(ReaderState.idle);
  }

  Future<void> readScreen() async {
    _handle ??= SemanticsBinding.instance.ensureSemantics();
    // La semántica se arma en el siguiente cuadro.
    await WidgetsBinding.instance.endOfFrame;
    final texts = <String>[];
    for (final view in RendererBinding.instance.renderViews) {
      final root = view.owner?.semanticsOwner?.rootSemanticsNode;
      if (root != null) _collect(root, texts);
    }
    await read(texts);
  }

  void _collect(SemanticsNode node, List<String> out) {
    final data = node.getSemanticsData();
    if (data.flagsCollection.isHidden || node.isInvisible) return;
    final label = [data.label, data.value].where((t) => t.trim().isNotEmpty).join(', ').trim();
    if (label.isNotEmpty && label != 'Leer esta pantalla' && (out.isEmpty || out.last != label)) out.add(label);
    node.visitChildren((child) {
      _collect(child, out);
      return true;
    });
  }

  Future<void> read(List<String> items) async {
    await _tts.stop();
    final id = ++_run;
    _queue = [...items];
    await _tts.setLanguage('es-US');
    await _tts.setSpeechRate(ref.read(a11yProvider).speechRate);
    state = const ReaderStatus(ReaderState.playing);
    await _next(id);
  }

  Future<void> _next(int id) async {
    while (id == _run && _queue.isNotEmpty) {
      if (state.state == ReaderState.paused) return;
      final text = _queue.first;
      state = ReaderStatus(ReaderState.playing, text);
      await _tts.speak(text);
      if (id != _run || state.state == ReaderState.paused) return;
      if (_queue.isNotEmpty) _queue.removeAt(0);
    }
    if (id == _run) _finish();
  }

  /// Terminó o se detuvo: se apaga el árbol de semántica que se encendió solo para leer.
  void _finish() {
    state = const ReaderStatus(ReaderState.idle);
    _handle?.dispose();
    _handle = null;
  }

  /// Al cambiar de pantalla deja de leer la anterior.
  void stopIfReading() {
    if (state.state != ReaderState.idle) stop();
  }

  /// La voz de Android no se pausa: se detiene y al seguir se repite la frase en curso.
  Future<void> pause() async {
    state = ReaderStatus(ReaderState.paused, state.current);
    await _tts.stop();
  }

  Future<void> resume() async {
    state = ReaderStatus(ReaderState.playing, state.current);
    await _next(_run);
  }

  Future<void> stop() async {
    _run++;
    _queue = [];
    await _tts.stop();
    _finish();
  }
}

final readerProvider = NotifierProvider<ReaderNotifier, ReaderStatus>(ReaderNotifier.new);
