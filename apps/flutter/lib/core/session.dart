import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'api.dart';
import 'config.dart';

const _storage = FlutterSecureStorage();

/// Persona del personal con su rol y permisos (SessionUser de la API).
class StaffUser {
  StaffUser(this.json);
  final Json json;
  String get id => json['id'];
  String get username => json['username'];
  String get fullName => json['fullName'];
  String get role => json['role'];
  String get roleName => json['roleName'];
  List<String> get permissions => List<String>.from(json['permissions'] ?? const []);
  String? get doctorId => json['doctorId'];
  List<String> get clinicIds => List<String>.from(json['clinicIds'] ?? const []);
  bool get mustChangePassword => json['mustChangePassword'] == true;

  bool can(String permission) => permissions.contains(permission);

  /// Clínicas donde da y maneja citas; null si son todas (dirección, o sin clínicas asignadas).
  List<String>? get workClinics => role == 'ADMIN' || clinicIds.isEmpty ? null : clinicIds;
}

/// Sesión: del personal (con su usuario) o de un paciente.
class Session {
  const Session.staff(this.user) : kind = 'staff';
  const Session.patient() : kind = 'patient', user = null;
  final String kind;
  final StaffUser? user;
  bool get isPatient => kind == 'patient';
}

class SessionNotifier extends AsyncNotifier<Session?> {
  @override
  Future<Session?> build() async {
    final token = await _storage.read(key: 'token');
    final kind = await _storage.read(key: 'kind');
    if (token == null || kind == null || ref.read(serverProvider) == null) return null;
    ref.read(tokenProvider.notifier).state = token;
    try {
      if (kind == 'patient') {
        await ref.read(apiProvider).get<Json>('/portal/me');
        return const Session.patient();
      }
      final user = await ref.read(apiProvider).get<Json>('/auth/me');
      await _storage.write(key: 'user', value: jsonEncode(user));
      return Session.staff(StaffUser(user));
    } on ApiError catch (e) {
      // Sin conexión: se mantiene la sesión guardada para no sacar a la persona; cada pantalla avisará.
      if (e.offline) {
        if (kind == 'patient') return const Session.patient();
        final cached = await _storage.read(key: 'user');
        if (cached != null) return Session.staff(StaffUser(jsonDecode(cached) as Json));
      }
      await _clear();
      return null;
    }
  }

  Future<void> _clear() async {
    await _storage.delete(key: 'token');
    await _storage.delete(key: 'kind');
    await _storage.delete(key: 'user');
    ref.read(tokenProvider.notifier).state = null;
  }

  /// Un solo ingreso: usuario del personal, o cédula / pasaporte del paciente.
  Future<Session> signIn(String identifier, String password) async {
    final r = await ref.read(apiProvider).post<Json>('/auth/sign-in', body: {'identifier': identifier.trim(), 'password': password});
    return _start(r['kind'] as String, r['accessToken'] as String, r['user'] as Json?);
  }

  Future<Session> registered(String token) => _start('patient', token, null);

  Future<Session> _start(String kind, String token, Json? user) async {
    await _storage.write(key: 'token', value: token);
    await _storage.write(key: 'kind', value: kind);
    if (user != null) await _storage.write(key: 'user', value: jsonEncode(user));
    ref.read(tokenProvider.notifier).state = token;
    final s = kind == 'patient' ? const Session.patient() : Session.staff(StaffUser(user!));
    state = AsyncData(s);
    return s;
  }

  /// Vuelve a leer el usuario (después de cambiar la contraseña o el nombre).
  Future<void> refreshUser() async {
    final s = state.valueOrNull;
    if (s == null || s.isPatient) return;
    final user = await ref.read(apiProvider).get<Json>('/auth/me');
    await _storage.write(key: 'user', value: jsonEncode(user));
    state = AsyncData(Session.staff(StaffUser(user)));
  }

  Future<void> signOut() async {
    final s = state.valueOrNull;
    try {
      await ref.read(apiProvider).post<Json>(s?.isPatient == true ? '/portal/logout' : '/auth/logout');
    } catch (_) {}
    await _clear();
    state = const AsyncData(null);
  }

  /// La API dijo 401: la sesión venció o se cerró desde otro equipo.
  Future<void> expired() async {
    await _clear();
    state = const AsyncData(null);
  }
}

final sessionProvider = AsyncNotifierProvider<SessionNotifier, Session?>(SessionNotifier.new);

/// Usuario del personal (lanza si no hay: solo se usa dentro de las pantallas del personal).
final staffProvider = Provider<StaffUser>((ref) => ref.watch(sessionProvider).valueOrNull!.user!);
