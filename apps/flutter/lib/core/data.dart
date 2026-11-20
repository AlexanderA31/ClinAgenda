import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'api.dart';
import 'session.dart';

// Consultas que usan varias pantallas. `ref.invalidate(...)` las vuelve a pedir después de un cambio.

final clinicsProvider = FutureProvider.autoDispose<List<Json>>((ref) async {
  final list = await ref.watch(apiProvider).get<List>('/clinics');
  return list.cast<Json>();
});

/// Clínicas donde quien tiene la sesión da y maneja citas.
final workClinicsProvider = FutureProvider.autoDispose<List<Json>>((ref) async {
  final all = await ref.watch(clinicsProvider.future);
  final mine = ref.watch(staffProvider).workClinics;
  return mine == null ? all : all.where((c) => mine.contains(c['id'])).toList();
});

final doctorsProvider = FutureProvider.autoDispose.family<List<Json>, String?>((ref, clinicId) async {
  final list = await ref.watch(apiProvider).get<List>('/doctors', query: {'clinicId': clinicId});
  return list.cast<Json>();
});

final rolesProvider = FutureProvider.autoDispose<List<Json>>((ref) async => (await ref.watch(apiProvider).get<List>('/roles')).cast<Json>());

/// Avisos (campana) del personal o del paciente.
final notificationsProvider = FutureProvider.autoDispose.family<Json, bool>((ref, portal) async {
  return ref.watch(apiProvider).get<Json>(portal ? '/portal/notifications' : '/notifications');
});

/// Directorio público: clínicas con horarios y médicos con dónde atienden (lo usa el paciente al agendar).
final directoryProvider = FutureProvider.autoDispose<Json>((ref) async => ref.watch(apiProvider).get<Json>('/public/directory'));
