import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api.dart';
import '../../core/config.dart';
import '../../core/data.dart';
import '../../core/format.dart';
import '../../core/labels.dart';
import '../../core/session.dart';
import '../../widgets/a11y_panel.dart';
import '../../widgets/shells.dart';
import '../../widgets/ui.dart';
import '../auth/auth_pages.dart';
import 'booking_page.dart';
import 'common.dart';

// ───────────────────────────── Recordatorios ─────────────────────────────

final remindersProvider = FutureProvider.autoDispose.family<List<Json>, (String, String?)>((ref, k) async {
  final (date, clinicId) = k;
  final r = await ref.watch(apiProvider).get<Json>('/appointments', query: {'from': date, 'to': date, 'clinicId': clinicId, 'status': 'SCHEDULED', 'pageSize': 500, 'sortBy': 'startsAt'});
  return (r['items'] as List).cast<Json>();
});

class RemindersPage extends ConsumerStatefulWidget {
  const RemindersPage({super.key});
  @override
  ConsumerState<RemindersPage> createState() => _RemindersPageState();
}

class _RemindersPageState extends ConsumerState<RemindersPage> {
  String _date = addDays(todayIso(), 1);
  String? _clinicId;

  @override
  Widget build(BuildContext context) {
    final clinics = ref.watch(workClinicsProvider).valueOrNull ?? const [];
    final key = (_date, _clinicId);
    final list = ref.watch(remindersProvider(key));
    final api = ref.read(apiProvider);
    Future<void> mark(Json a, bool v) async {
      final r = await run(context, () => api.patch<Json>('/appointments/${a['id']}/reminded', body: {'reminded': v}));
      if (r != null) ref.invalidate(remindersProvider(key));
    }

    return StaffScaffold(
      title: 'Recordatorios',
      body: PageList(onRefresh: () async => ref.invalidate(remindersProvider(key)), children: [
        const PageHeader('Recordatorios', description: 'Avise a cada paciente de su cita. El mensaje de WhatsApp lleva su enlace para cancelar si ya no puede venir, así el espacio se libera a tiempo.'),
        DayBar(date: _date, onChanged: (d) => setState(() => _date = d)),
        if (clinics.length > 1) ClinicChips(clinics: clinics, selected: _clinicId, allLabel: 'Todas', onSelected: (id) => setState(() => _clinicId = id)),
        AsyncBody(
          value: list,
          onRetry: () => ref.invalidate(remindersProvider(key)),
          data: (items) {
            final pending = items.where((a) => a['remindedAt'] == null).length;
            if (items.isEmpty) return const EmptyState(icon: Icons.notifications_off_outlined, title: 'No hay citas agendadas ese día');
            return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Text('${dayLabel(_date)}: ${items.length} citas · $pending por avisar', style: const TextStyle(fontWeight: FontWeight.w600)),
              const SizedBox(height: 10),
              for (final a in items)
                Card(
                  margin: const EdgeInsets.only(bottom: 10),
                  child: Padding(
                    padding: const EdgeInsets.all(14),
                    child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                      Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text(time(a['startsAt']), style: Theme.of(context).textTheme.titleMedium?.copyWith(fontFeatures: const [FontFeature.tabularFigures()])),
                        const SizedBox(width: 14),
                        Expanded(
                          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                            InkWell(onTap: () => context.push('/cita/${a['id']}'), child: Text(a['patient']['fullName'], style: const TextStyle(fontWeight: FontWeight.w700))),
                            Text('${a['doctor']['fullName']} · ${(a['clinic']['name'] as String).replaceFirst('Clínica ', '')}', style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant)),
                            if (a['contactPhone'] != null) Text(phone(a['contactPhone']), style: const TextStyle(fontFeatures: [FontFeature.tabularFigures()])),
                            if (a['contactPhone'] == null && a['contactNote'] != null) Text('Cómo ubicarlo: ${a['contactNote']}'),
                          ]),
                        ),
                      ]),
                      const SizedBox(height: 10),
                      Wrap(spacing: 8, runSpacing: 8, crossAxisAlignment: WrapCrossAlignment.center, children: [
                        if (a['contactPhone'] != null) ...[
                          FilledButton.icon(
                            onPressed: () {
                              openExternal(context, whatsappUri(a['contactPhone'], reminderText(ref, a)));
                              if (a['remindedAt'] == null) mark(a, true);
                            },
                            icon: const Icon(Icons.chat_outlined),
                            label: const Text('WhatsApp'),
                          ),
                          OutlinedButton.icon(onPressed: () => openExternal(context, telUri(a['contactPhone'])), icon: const Icon(Icons.call_outlined), label: const Text('Llamar')),
                        ],
                      ]),
                      CheckboxListTile(
                        contentPadding: EdgeInsets.zero,
                        controlAffinity: ListTileControlAffinity.leading,
                        value: a['remindedAt'] != null,
                        onChanged: (v) => mark(a, v == true),
                        title: const Text('Ya se le avisó'),
                        subtitle: a['remindedAt'] == null ? null : Text('${a['remindedBy'] ?? 'Alguien'} · ${dateTime(a['remindedAt'])}'),
                      ),
                    ]),
                  ),
                ),
            ]);
          },
        ),
      ]),
    );
  }
}

// ───────────────────────────── Lista de espera ─────────────────────────────

final waitlistProvider = FutureProvider.autoDispose.family<List<Json>, String?>((ref, clinicId) async => (await ref.watch(apiProvider).get<List>('/waitlist', query: {'clinicId': clinicId})).cast<Json>());

class WaitlistPage extends ConsumerStatefulWidget {
  const WaitlistPage({super.key});
  @override
  ConsumerState<WaitlistPage> createState() => _WaitlistPageState();
}

class _WaitlistPageState extends ConsumerState<WaitlistPage> {
  String? _clinicId;

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(staffProvider);
    final clinics = ref.watch(workClinicsProvider).valueOrNull ?? const [];
    final list = ref.watch(waitlistProvider(_clinicId));
    final api = ref.read(apiProvider);
    if (!user.can('lista_espera.gestionar')) {
      return const StaffScaffold(title: 'Lista de espera', body: EmptyState(icon: Icons.lock_outline, title: 'Su usuario no maneja la lista de espera'));
    }
    return StaffScaffold(
      title: 'Lista de espera',
      fab: FloatingActionButton.extended(
        onPressed: () async {
          final ok = await Navigator.of(context).push<bool>(MaterialPageRoute(builder: (_) => _WaitlistForm(clinics: clinics)));
          if (ok == true) ref.invalidate(waitlistProvider);
        },
        icon: const Icon(Icons.add),
        label: const Text('Agregar'),
      ),
      body: PageList(onRefresh: () async => ref.invalidate(waitlistProvider(_clinicId)), children: [
        const PageHeader('Lista de espera', description: 'Pacientes que quieren una cita antes. Cuando se libera un horario, se les ofrece.'),
        if (clinics.length > 1) ClinicChips(clinics: clinics, selected: _clinicId, allLabel: 'Todas', onSelected: (id) => setState(() => _clinicId = id)),
        AsyncBody(
          value: list,
          onRetry: () => ref.invalidate(waitlistProvider(_clinicId)),
          data: (items) {
            final active = items.where((e) => e['status'] == 'WAITING' || e['status'] == 'OFFERED').toList();
            if (active.isEmpty) return const EmptyState(icon: Icons.hourglass_empty, title: 'Nadie está esperando');
            return Column(children: [
              for (final e in active)
                Card(
                  margin: const EdgeInsets.only(bottom: 10),
                  child: Padding(
                    padding: const EdgeInsets.all(14),
                    child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                      Row(children: [
                        Expanded(child: Text(e['patient']['fullName'], style: const TextStyle(fontWeight: FontWeight.w700))),
                        Badge2(label: waitlistStatusLabels[e['status']] ?? e['status'], tone: e['status'] == 'OFFERED' ? Tone.warn : Tone.info),
                      ]),
                      Text('${e['clinic']['name']} · ${e['doctor']?['fullName'] ?? 'cualquier médico'} · desde ${shortDate(e['createdAt'])}', style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant)),
                      if (e['preference'] != null) Text('Prefiere: ${e['preference']}'),
                      const SizedBox(height: 10),
                      Wrap(spacing: 8, runSpacing: 8, children: [
                        if (user.can('citas.agendar'))
                          FilledButton.icon(
                            onPressed: () async {
                              final patient = await api.get<Json>('/patients/${e['patient']['id']}');
                              if (!context.mounted) return;
                              await context.push('/nueva-cita', extra: BookingPreset(patient: patient, clinicId: e['clinic']['id'], waitlistEntryId: e['id']));
                              ref.invalidate(waitlistProvider);
                            },
                            icon: const Icon(Icons.event_available),
                            label: const Text('Darle cita'),
                          ),
                        if (e['patient']['phone'] != null) OutlinedButton.icon(onPressed: () => openExternal(context, telUri(e['patient']['phone'])), icon: const Icon(Icons.call_outlined), label: const Text('Llamar')),
                        TextButton.icon(
                          onPressed: () async {
                            if (!await confirm(context, title: '¿Quitar de la lista de espera?', body: e['patient']['fullName'], ok: 'Quitar')) return;
                            if (!context.mounted) return;
                            final r = await run(context, () => api.delete<Json>('/waitlist/${e['id']}'), success: 'Quitado de la lista de espera.');
                            if (r != null) ref.invalidate(waitlistProvider);
                          },
                          icon: const Icon(Icons.delete_outline),
                          label: const Text('Quitar'),
                        ),
                      ]),
                    ]),
                  ),
                ),
            ]);
          },
        ),
      ]),
    );
  }
}

class _WaitlistForm extends ConsumerStatefulWidget {
  const _WaitlistForm({required this.clinics});
  final List<Json> clinics;
  @override
  ConsumerState<_WaitlistForm> createState() => _WaitlistFormState();
}

class _WaitlistFormState extends ConsumerState<_WaitlistForm> {
  Json? _patient;
  late String? _clinicId = widget.clinics.isEmpty ? null : widget.clinics.first['id'];
  String? _doctorId;
  final _pref = TextEditingController();
  String _q = '';
  Object? _error;

  @override
  Widget build(BuildContext context) {
    final doctors = _clinicId == null ? const <Json>[] : ref.watch(doctorsProvider(_clinicId)).valueOrNull ?? const [];
    final results = _q.length >= 2 ? ref.watch(patientSearchProvider(_q)) : null;
    return Scaffold(
      appBar: AppBar(title: const Text('Agregar a la lista de espera')),
      body: SafeArea(
        top: false,
        child: PageList(children: [
          if (_error != null) Notice(tone: Tone.danger, body: errorText(_error!)),
          if (_patient == null) ...[
            SearchField(label: 'Paciente', hint: 'Nombre, cédula o teléfono', onChanged: (v) => setState(() => _q = v)),
            if (results != null)
              AsyncBody(
                value: results,
                data: (r) => Column(children: [
                  for (final p in (r['items'] as List).cast<Json>())
                    ListTile(title: Text(p['fullName']), subtitle: Text('${p['age']} años · ${phone(p['phone'])}'), onTap: () => setState(() => _patient = p)),
                ]),
              ),
          ] else
            Card(child: ListTile(leading: const Icon(Icons.person), title: Text(_patient!['fullName']), trailing: TextButton(onPressed: () => setState(() => _patient = null), child: const Text('Cambiar')))),
          Select<String>(label: 'Clínica', value: _clinicId, items: {for (final c in widget.clinics) c['id'] as String: c['name'] as String}, onChanged: (v) => setState(() {
                _clinicId = v;
                _doctorId = null;
              })),
          Select<String?>(label: 'Médico', value: _doctorId, items: {null: 'Cualquier médico', for (final d in doctors) d['id'] as String: d['fullName'] as String}, onChanged: (v) => setState(() => _doctorId = v)),
          TextField(controller: _pref, decoration: const InputDecoration(labelText: 'Preferencia (opcional)', hintText: 'Ej. mañanas, después de las 15:00')),
          BusyButton(
            label: 'Agregar',
            icon: Icons.add,
            expand: true,
            onPressed: _patient == null || _clinicId == null
                ? null
                : () async {
                    try {
                      await ref.read(apiProvider).post<Json>('/waitlist', body: {'patientId': _patient!['id'], 'clinicId': _clinicId, 'doctorId': _doctorId, 'preference': _pref.text.trim().isEmpty ? null : _pref.text.trim()});
                      if (context.mounted) Navigator.pop(context, true);
                    } catch (e) {
                      setState(() => _error = e);
                    }
                  },
          ),
        ]),
      ),
    );
  }
}

// ───────────────────────────── Avisos (campana) ─────────────────────────────

class NotificationsPage extends ConsumerWidget {
  const NotificationsPage({super.key, required this.portal});
  final bool portal;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final n = ref.watch(notificationsProvider(portal));
    final api = ref.read(apiProvider);
    final base = portal ? '/portal/notifications' : '/notifications';
    final unread = n.valueOrNull?['unread'] as int? ?? 0;

    Future<void> open(Json x) async {
      if (x['read'] != true) {
        await api.post<Json>('$base/${x['id']}/read').catchError((_) => <String, dynamic>{});
        ref.invalidate(notificationsProvider(portal));
      }
      if (!context.mounted) return;
      if (portal) {
        context.go('/p/historial');
      } else if (x['appointmentId'] != null) {
        context.push('/cita/${x['appointmentId']}');
      }
    }

    return Scaffold(
      appBar: AppBar(title: const Text('Avisos'), actions: const [A11yAction()]),
      body: SafeArea(
        top: false,
        child: AsyncBody(
          value: n,
          onRetry: () => ref.invalidate(notificationsProvider(portal)),
          data: (d) {
            final items = (d['items'] as List).cast<Json>();
            if (items.isEmpty) return const EmptyState(icon: Icons.notifications_none, title: 'No tiene avisos', body: 'Aquí verá cuando una cita se confirme, cambie o se cancele.');
            final fresh = items.where((x) => x['read'] != true).toList();
            final old = items.where((x) => x['read'] == true).toList();
            return PageList(onRefresh: () async => ref.invalidate(notificationsProvider(portal)), children: [
              Row(children: [
                Expanded(child: Text(unread == 0 ? 'Todo leído' : '$unread sin leer', style: Theme.of(context).textTheme.titleMedium)),
                if (unread > 0)
                  TextButton.icon(
                    onPressed: () async {
                      await run(context, () => api.post<Json>('$base/read-all'));
                      ref.invalidate(notificationsProvider(portal));
                    },
                    icon: const Icon(Icons.done_all),
                    label: const Text('Marcar todo leído'),
                  ),
              ]),
              for (final x in fresh) _NoticeCard(item: x, onTap: () => open(x)),
              if (old.isNotEmpty && fresh.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 8), child: Text('Anteriores', style: Theme.of(context).textTheme.titleSmall)),
              for (final x in old) _NoticeCard(item: x, onTap: () => open(x)),
            ]);
          },
        ),
      ),
    );
  }
}

/// Un aviso: ícono y color según lo que pasó, resaltado si no se ha leído.
class _NoticeCard extends StatelessWidget {
  const _NoticeCard({required this.item, required this.onTap});
  final Json item;
  final VoidCallback onTap;

  static (IconData, Tone) _style(String? kind) => switch (kind) {
        'CITA_AGENDADA' || 'CITA_ACEPTADA' => (Icons.event_available, Tone.good),
        'CITA_REACTIVADA' => (Icons.undo, Tone.good),
        'CITA_MOVIDA' => (Icons.edit_calendar, Tone.info),
        'SOLICITUD_NUEVA' => (Icons.hourglass_top, Tone.warn),
        'CITA_RECHAZADA' || 'CITA_CANCELADA' || 'CANCELADA_POR_PACIENTE' => (Icons.event_busy, Tone.danger),
        _ => (Icons.notifications_outlined, Tone.neutral),
      };

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final unread = item['read'] != true;
    final (icon, tone) = _style(item['kind'] as String?);
    final c = toneColor(context, tone);
    return Semantics(
      button: true,
      label: unread ? 'Sin leer' : null,
      child: Card(
        color: unread ? scheme.primaryContainer.withValues(alpha: 0.35) : null,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(14),
          side: BorderSide(color: unread ? scheme.primary.withValues(alpha: 0.5) : scheme.outlineVariant, width: unread ? 1.5 : 1),
        ),
        child: InkWell(
          borderRadius: BorderRadius.circular(14),
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(color: c.withValues(alpha: 0.14), shape: BoxShape.circle),
                child: Icon(icon, color: c, size: 22),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Expanded(child: Text(item['title'], style: TextStyle(fontWeight: unread ? FontWeight.w800 : FontWeight.w600, fontSize: 16))),
                    const SizedBox(width: 8),
                    Text(ago(item['createdAt']), style: TextStyle(color: scheme.onSurfaceVariant, fontSize: 12)),
                  ]),
                  const SizedBox(height: 4),
                  Text(item['body'], style: TextStyle(color: unread ? null : scheme.onSurfaceVariant)),
                ]),
              ),
              if (unread) Padding(padding: const EdgeInsets.only(left: 8, top: 4), child: Container(width: 10, height: 10, decoration: BoxDecoration(color: scheme.primary, shape: BoxShape.circle))),
            ]),
          ),
        ),
      ),
    );
  }
}

// ───────────────────────────── Mi usuario ─────────────────────────────

final myProfileProvider = FutureProvider.autoDispose<Json>((ref) => ref.watch(apiProvider).get<Json>('/auth/me/profile'));

class MyAccountPage extends ConsumerStatefulWidget {
  const MyAccountPage({super.key});
  @override
  ConsumerState<MyAccountPage> createState() => _MyAccountPageState();
}

class _MyAccountPageState extends ConsumerState<MyAccountPage> {
  TextEditingController? _name;

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(staffProvider);
    final profile = ref.watch(myProfileProvider);
    return StaffScaffold(
      title: 'Mi usuario',
      body: AsyncBody(
        value: profile,
        onRetry: () => ref.invalidate(myProfileProvider),
        data: (p) {
          _name ??= TextEditingController(text: p['fullName']);
          final groups = <String, List<PermissionInfo>>{};
          for (final x in permissions.where((x) => user.can(x.key))) {
            groups.putIfAbsent(x.group, () => []).add(x);
          }
          return PageList(children: [
            PageHeader(p['fullName'], description: '${p['roleName']} · usuario ${p['username']}'),
            SectionCard(title: 'Mis datos', children: [
              TextField(controller: _name, textCapitalization: TextCapitalization.words, decoration: const InputDecoration(labelText: 'Nombre completo')),
              const SizedBox(height: 10),
              Align(
                alignment: Alignment.centerLeft,
                child: BusyButton(
                  label: 'Guardar nombre',
                  outlined: true,
                  onPressed: () async {
                    final r = await run(context, () => ref.read(apiProvider).patch<Json>('/auth/me', body: {'fullName': _name!.text.trim()}), success: 'Nombre guardado.');
                    if (r != null) {
                      ref.invalidate(myProfileProvider);
                      ref.read(sessionProvider.notifier).refreshUser();
                    }
                  },
                ),
              ),
              const SizedBox(height: 10),
              InfoRow('Clínicas', (p['clinicNames'] as List).isEmpty ? 'Todas' : (p['clinicNames'] as List).join(', ')),
              if (p['doctorName'] != null) InfoRow('Ficha de médico', p['doctorName']),
              InfoRow('Último ingreso', p['lastLoginAt'] == null ? '—' : dateTime(p['lastLoginAt'])),
            ]),
            SectionCard(title: 'Lo que puedo hacer', children: [
              for (final e in groups.entries) ...[
                Padding(padding: const EdgeInsets.only(top: 6, bottom: 2), child: Text(e.key, style: const TextStyle(fontWeight: FontWeight.w700))),
                for (final x in e.value) Text('• ${x.label}'),
              ],
            ]),
            const FoldCard(title: 'Cambiar contraseña', icon: Icons.key_outlined, children: [ChangePasswordForm(path: '/auth/change-password')]),
            FoldCard(title: 'Sesiones abiertas', subtitle: 'Otros teléfonos o computadoras', icon: Icons.devices_other, children: [
              const Text('Si ingresó en otro equipo y no cerró la sesión, ciérrela desde aquí.'),
              const SizedBox(height: 10),
              BusyButton(
                label: 'Cerrar mi sesión en los demás equipos',
                outlined: true,
                icon: Icons.devices_other,
                onPressed: () async => run(context, () => ref.read(apiProvider).post<Json>('/auth/me/revoke-other-sessions'), success: 'Listo: se cerraron las demás sesiones.'),
              ),
            ]),
            // La dirección del servidor solo la ve y la cambia la dirección.
            if (user.role == 'ADMIN') OutlinedButton.icon(onPressed: () => context.push('/servidor'), icon: const Icon(Icons.dns_outlined), label: Text('Servidor: ${ref.watch(serverProvider) ?? ''}', overflow: TextOverflow.ellipsis)),
          ]);
        },
      ),
    );
  }
}
