import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Dirección con la que se compiló la app (`--dart-define=SERVIDOR=...`); la persona puede cambiarla.
const servidorPorDefecto = String.fromEnvironment('SERVIDOR');

late SharedPreferences prefs;

/// Dirección del sistema de la clínica (ej. https://agenda.clinicasparedes.ec), sin barra final.
class ServerNotifier extends Notifier<String?> {
  @override
  String? build() {
    final saved = prefs.getString('servidor');
    if (saved != null && saved.isNotEmpty) return saved;
    return servidorPorDefecto.isEmpty ? null : servidorPorDefecto;
  }

  Future<void> set(String origin) async {
    await prefs.setString('servidor', origin);
    state = origin;
  }
}

final serverProvider = NotifierProvider<ServerNotifier, String?>(ServerNotifier.new);

/// "192.168.1.20:3000" -> "http://192.168.1.20:3000"; "agenda.x.ec/" -> "https://agenda.x.ec". null si no sirve.
String? normalizeServer(String value) {
  var v = value.trim();
  if (v.isEmpty) return null;
  if (!RegExp(r'^https?://', caseSensitive: false).hasMatch(v)) {
    final local = RegExp(r'^((\d{1,3}\.){3}\d{1,3}|localhost)(:\d+)?(/|$)', caseSensitive: false).hasMatch(v);
    v = '${local ? 'http' : 'https'}://$v';
  }
  final uri = Uri.tryParse(v);
  if (uri == null || !(uri.scheme == 'http' || uri.scheme == 'https')) return null;
  if (!RegExp(r'^(localhost|[a-z0-9-]+(\.[a-z0-9-]+)+)$', caseSensitive: false).hasMatch(uri.host)) return null;
  return '${uri.scheme}://${uri.host}${uri.hasPort ? ':${uri.port}' : ''}';
}
