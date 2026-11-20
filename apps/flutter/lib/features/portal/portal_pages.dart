import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api.dart';
import '../../core/config.dart';
import '../../core/data.dart';
import '../../core/format.dart';
import '../../core/labels.dart';
import '../../core/session.dart';
import '../../core/theme.dart';
import '../../widgets/shells.dart';
import '../../widgets/ui.dart';
import '../auth/auth_pages.dart';

/// Mismos límites que la API (PORTAL_LIMITS): citas a la vez y días hacia adelante.
const maxUpcoming = 2;
const maxDaysAhead = 60;

final portalMeProvider = FutureProvider.autoDispose<Json>((ref) => ref.watch(apiProvider).get<Json>('/portal/me'));
final portalAppointmentsProvider = FutureProvider.autoDispose<List<Json>>((ref) async => (await ref.watch(apiProvider).get<List>('/portal/appointments')).cast<Json>());

/// Próximas (agendadas o por confirmar que no pasaron), la más cercana primero; lo demás es historial.
({List<Json> upcoming, List<Json> past}) splitAppointments(List<Json> all) {
  final now = DateTime.now();
  bool isUpcoming(Json a) => (a['status'] == 'SCHEDULED' || a['status'] == 'REQUESTED') && parseIso(a['startsAt']).isAfter(now);
  final upcoming = all.where(isUpcoming).toList()..sort((a, b) => (a['startsAt'] as String).compareTo(b['startsAt']));
  final past = all.where((a) => !isUpcoming(a)).toList()..sort((a, b) => (b['startsAt'] as String).compareTo(a['startsAt']));
  return (upcoming: upcoming, past: past);
}

// ───────────────────────────── Inicio ─────────────────────────────

class PortalHomePage extends ConsumerWidget {
  const PortalHomePage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final me = ref.watch(portalMeProvider).valueOrNull;
    final list = ref.watch(portalAppointmentsProvider);
    Future<void> refresh() async {
      ref.invalidate(portalAppointmentsProvider);
      ref.invalidate(portalMeProvider);
      await ref.read(portalAppointmentsProvider.future);
    }

    return PortalScaffold(
      title: 'Inicio',
      index: 0,
      body: AsyncBody(
        value: list,
        onRetry: refresh,
        data: (all) {
          final s = splitAppointments(all);
          final count = {for (final st in statusLabels.keys) st: all.where((a) => a['status'] == st).length};
          final atLimit = s.upcoming.length >= maxUpcoming;
          return PageList(onRefresh: refresh, children: [
            PageHeader(
              'Hola${me == null ? '' : ', ${(me['firstNames'] as String).split(' ').first}'}',
              description: s.upcoming.isEmpty ? 'No tiene citas por venir. Puede agendar una cuando quiera.' : (s.upcoming.length > 1 ? 'Tiene ${s.upcoming.length} citas por venir. Esta es la más próxima.' : 'Esta es su próxima cita.'),
            ),
            if (s.upcoming.isEmpty)
              Card(
                child: EmptyState(
                  icon: Icons.event_available,
                  title: '¿Necesita una cita?',
                  body: 'Elija la clínica, el médico y la hora que le queden mejor. La clínica la confirma y usted lo ve aquí.',
                  action: FilledButton.icon(onPressed: () => context.go('/p/agendar'), icon: const Icon(Icons.add), label: const Text('Agendar una cita')),
                ),
              )
            else ...[
              NextAppointmentCard(appt: s.upcoming.first),
              for (final a in s.upcoming.skip(1)) AppointmentCard(appt: a),
            ],
            if (atLimit) const Notice(tone: Tone.info, body: 'Ya tiene $maxUpcoming citas por venir, el máximo en línea. Para otra, cancele una o llame a la clínica.'),
            GridView.count(
              crossAxisCount: 2,
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              mainAxisSpacing: 10,
              crossAxisSpacing: 10,
              childAspectRatio: 1.7,
              children: [
                _Stat('Por venir', s.upcoming.length, Icons.event, Tone.info),
                _Stat('Por confirmar', count['REQUESTED']!, Icons.hourglass_top, count['REQUESTED']! > 0 ? Tone.warn : Tone.neutral),
                _Stat('Atendidas', count['ATTENDED']!, Icons.check_circle_outline, Tone.good),
                _Stat('Canceladas', count['CANCELLED']!, Icons.event_busy, Tone.neutral),
              ],
            ),
            const SectionCard(title: 'Antes de su cita', children: [
              _Tip('Llegue 10 minutos antes para registrarse con calma.'),
              _Tip('Traiga su cédula o pasaporte.'),
              _Tip('Lleve exámenes y recetas anteriores, y las medicinas que toma.'),
              _Tip('¿No puede ir? Cancele aquí hasta 2 horas antes: el espacio pasa a otro paciente.'),
            ]),
          ]);
        },
      ),
    );
  }
}

class _Tip extends StatelessWidget {
  const _Tip(this.text);
  final String text;
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 4),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Icon(Icons.check, size: 18, color: Theme.of(context).colorScheme.primary),
          const SizedBox(width: 8),
          Expanded(child: Text(text)),
        ]),
      );
}

class _Stat extends StatelessWidget {
  const _Stat(this.label, this.value, this.icon, this.tone);
  final String label;
  final int value;
  final IconData icon;
  final Tone tone;
  @override
  Widget build(BuildContext context) {
    final c = toneColor(context, tone);
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
          Row(children: [Expanded(child: Text(label, style: const TextStyle(fontWeight: FontWeight.w600))), Icon(icon, color: c, size: 20)]),
          Text('$value', style: Theme.of(context).textTheme.headlineSmall),
        ]),
      ),
    );
  }
}

/// La próxima cita, grande: cuánto falta, día, hora, dónde y qué hacer.
class NextAppointmentCard extends StatelessWidget {
  const NextAppointmentCard({super.key, required this.appt});
  final Json appt;

  @override
  Widget build(BuildContext context) {
    final a = appt;
    final clinic = a['clinic'] as Json;
    final tone = Brand.clinic(clinic['name']);
    final onTone = ThemeData.estimateBrightnessForColor(tone) == Brightness.dark ? Colors.white : Brand.ink;
    return Card(
      clipBehavior: Clip.antiAlias,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16), side: BorderSide(color: tone, width: 2)),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Container(
          color: tone,
          padding: const EdgeInsets.fromLTRB(18, 14, 18, 16),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(whenLabel(a['startsAt']), style: TextStyle(color: onTone, fontWeight: FontWeight.w700)),
            Text(longDate(a['startsAt']), style: Theme.of(context).textTheme.titleLarge?.copyWith(color: onTone, fontWeight: FontWeight.w800)),
            Text(time(a['startsAt']), style: Theme.of(context).textTheme.displaySmall?.copyWith(color: onTone, fontWeight: FontWeight.w800)),
          ]),
        ),
        Padding(padding: const EdgeInsets.all(16), child: _AppointmentBody(appt: a, primary: true)),
      ]),
    );
  }
}

/// Una cita del paciente en tarjeta compacta.
class AppointmentCard extends StatelessWidget {
  const AppointmentCard({super.key, required this.appt});
  final Json appt;

  @override
  Widget build(BuildContext context) {
    final a = appt;
    final tone = Brand.clinic((a['clinic'] as Json)['name']);
    final onTone = ThemeData.estimateBrightnessForColor(tone) == Brightness.dark ? Colors.white : Brand.ink;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Row(children: [
            Container(
              width: 56,
              padding: const EdgeInsets.symmetric(vertical: 6),
              decoration: BoxDecoration(color: tone, borderRadius: BorderRadius.circular(10)),
              child: Column(children: [
                Text(monthShort(a['startsAt']), style: TextStyle(color: onTone, fontSize: 12, fontWeight: FontWeight.w700)),
                Text('${dayOfMonth(a['startsAt'])}', style: TextStyle(color: onTone, fontSize: 22, fontWeight: FontWeight.w800)),
              ]),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('${longDate(a['startsAt'])}, ${time(a['startsAt'])}', style: const TextStyle(fontWeight: FontWeight.w700)),
                Text('${a['doctorName']} · ${(a['clinic'] as Json)['name']}', style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant)),
              ]),
            ),
          ]),
          const SizedBox(height: 12),
          _AppointmentBody(appt: a, compact: true),
        ]),
      ),
    );
  }
}

class _AppointmentBody extends ConsumerWidget {
  const _AppointmentBody({required this.appt, this.primary = false, this.compact = false});
  final Json appt;
  final bool primary;
  final bool compact;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final a = appt;
    final clinic = a['clinic'] as Json;
    final api = ref.read(apiProvider);
    final upcoming = (a['status'] == 'SCHEDULED' || a['status'] == 'REQUESTED') && parseIso(a['startsAt']).isAfter(DateTime.now());
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      if (!compact) ...[
        Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(a['doctorName'], style: Theme.of(context).textTheme.titleMedium),
              Text(a['specialty'], style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant)),
            ]),
          ),
          StatusBadge(a['status']),
        ]),
        const SizedBox(height: 10),
        Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Icon(Icons.place_outlined, size: 18),
          const SizedBox(width: 6),
          Expanded(child: Text('${clinic['name']}${clinic['address'] == null ? '' : ', ${clinic['address']}'}')),
        ]),
      ] else
        Wrap(spacing: 8, runSpacing: 6, crossAxisAlignment: WrapCrossAlignment.center, children: [
          StatusBadge(a['status']),
          Text('Código ${a['code']}', style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant, fontSize: 13)),
        ]),
      if (a['status'] == 'REQUESTED') ...[
        const SizedBox(height: 10),
        const Notice(tone: Tone.warn, body: 'Por confirmar: el horario ya es suyo; la clínica revisará la solicitud y la confirmará.'),
      ],
      if (a['rejectedNote'] != null) ...[
        const SizedBox(height: 10),
        Notice(tone: Tone.danger, title: 'La clínica no pudo aceptarla', body: a['rejectedNote']),
      ],
      const SizedBox(height: 12),
      Wrap(spacing: 8, runSpacing: 8, children: [
        OutlinedButton.icon(
          onPressed: () => run(context, () => api.openFile('/portal/appointments/${a['id']}/comprobante.pdf', 'comprobante-${a['code']}.pdf')),
          icon: const Icon(Icons.picture_as_pdf_outlined),
          label: const Text('Comprobante'),
        ),
        if (upcoming && clinic['phone'] != null)
          OutlinedButton.icon(onPressed: () => openExternal(context, telUri(clinic['phone'])), icon: const Icon(Icons.call_outlined), label: const Text('Llamar')),
        if (upcoming && a['canCancel'] == true)
          TextButton.icon(
            onPressed: () async {
              if (!await confirm(context, title: '¿Cancelar esta cita?', body: '${longDate(a['startsAt'])} a las ${time(a['startsAt'])} con ${a['doctorName']}. El espacio pasará a otro paciente.', ok: 'Sí, cancelar', cancel: 'No', danger: true)) return;
              if (!context.mounted) return;
              final r = await run(context, () => api.post<Json>('/portal/appointments/${a['id']}/cancel'), success: 'Cita cancelada. Gracias por avisar: el espacio pasa a otro paciente.');
              if (r != null) ref.invalidate(portalAppointmentsProvider);
            },
            icon: const Icon(Icons.cancel_outlined),
            label: const Text('Cancelar cita'),
          )
        else if (upcoming)
          Text('Falta poco: para cancelar, llame a la clínica.', style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant)),
      ]),
    ]);
  }
}

// ───────────────────────────── Citas (historial) ─────────────────────────────

class PortalHistoryPage extends ConsumerStatefulWidget {
  const PortalHistoryPage({super.key});
  @override
  ConsumerState<PortalHistoryPage> createState() => _PortalHistoryPageState();
}

class _PortalHistoryPageState extends ConsumerState<PortalHistoryPage> {
  bool _past = false;

  @override
  Widget build(BuildContext context) {
    final list = ref.watch(portalAppointmentsProvider);
    Future<void> refresh() async {
      ref.invalidate(portalAppointmentsProvider);
      await ref.read(portalAppointmentsProvider.future);
    }

    return PortalScaffold(
      title: 'Mis citas',
      index: 2,
      body: AsyncBody(
        value: list,
        onRetry: refresh,
        data: (all) {
          final s = splitAppointments(all);
          final items = _past ? s.past : s.upcoming;
          return PageList(onRefresh: refresh, children: [
            const PageHeader('Mis citas', description: 'Las que vienen y las que ya pasaron. Descargue el comprobante de cualquiera.'),
            SegmentedButton<bool>(
              showSelectedIcon: false,
              segments: [ButtonSegment(value: false, label: Text('Próximas (${s.upcoming.length})')), ButtonSegment(value: true, label: Text('Pasadas (${s.past.length})'))],
              selected: {_past},
              onSelectionChanged: (v) => setState(() => _past = v.first),
            ),
            if (items.isEmpty)
              EmptyState(
                title: _past ? 'Todavía no tiene citas pasadas' : 'No tiene citas por venir',
                action: _past ? null : FilledButton(onPressed: () => context.go('/p/agendar'), child: const Text('Agendar una cita')),
              )
            else
              for (final a in items) AppointmentCard(appt: a),
          ]);
        },
      ),
    );
  }
}

// ───────────────────────────── Agendar ─────────────────────────────

class PortalBookPage extends ConsumerStatefulWidget {
  const PortalBookPage({super.key});
  @override
  ConsumerState<PortalBookPage> createState() => _PortalBookPageState();
}

class _PortalBookPageState extends ConsumerState<PortalBookPage> {
  String? _clinicId; // null = todas
  String? _specialty;
  Json? _doctor;
  String? _date;
  Json? _slot;
  final _reason = TextEditingController();
  Json? _done;
  Object? _error;

  /// Días (desde mañana o hoy) en que el médico atiende en la clínica elegida y la clínica no está cerrada.
  Map<String, List<Json>> _bookable(Json dir) {
    final clinics = (dir['clinics'] as List).cast<Json>();
    final out = <String, List<Json>>{};
    final today = todayIso();
    for (var i = 0; i <= maxDaysAhead; i++) {
      final day = addDays(today, i);
      final weekday = dayToDate(day).weekday % 7; // 0 = domingo, como la API
      final here = <Json>[];
      for (final as in (_doctor!['assignments'] as List).cast<Json>()) {
        if (as['weekday'] != weekday || (_clinicId != null && as['clinicId'] != _clinicId)) continue;
        final clinic = clinics.firstWhere((c) => c['id'] == as['clinicId'], orElse: () => {});
        if (clinic.isEmpty || (clinic['closures'] as List).any((c) => c['date'] == day)) continue;
        if (!here.any((c) => c['id'] == clinic['id'])) here.add(clinic);
      }
      if (here.isNotEmpty) out[day] = here;
    }
    return out;
  }

  @override
  Widget build(BuildContext context) {
    final dir = ref.watch(directoryProvider);
    final list = ref.watch(portalAppointmentsProvider).valueOrNull;
    final atLimit = list != null && splitAppointments(list).upcoming.length >= maxUpcoming;
    return PortalScaffold(
      title: 'Agendar una cita',
      index: 1,
      body: _done != null
          ? _Done(appt: _done!, onAnother: () => setState(() => _done = _slot = _date = _doctor = null))
          : AsyncBody(
              value: dir,
              onRetry: () => ref.invalidate(directoryProvider),
              data: (d) {
                if (atLimit) {
                  return const PageList(children: [
                    PageHeader('Agendar una cita'),
                    Notice(tone: Tone.info, title: 'Ya tiene $maxUpcoming citas por venir', body: 'Es el máximo para agendar en línea. Cancele una en "Citas" o llame a la clínica para otra.'),
                  ]);
                }
                final clinics = (d['clinics'] as List).cast<Json>();
                var doctors = (d['doctors'] as List).cast<Json>().where((doc) => (doc['assignments'] as List).isNotEmpty).toList();
                if (_clinicId != null) doctors = doctors.where((doc) => (doc['assignments'] as List).any((a) => a['clinicId'] == _clinicId)).toList();
                final specialties = {for (final doc in doctors) doc['specialty'] as String}.toList()..sort();
                if (_specialty != null) doctors = doctors.where((doc) => doc['specialty'] == _specialty).toList();
                final days = _doctor == null ? <String, List<Json>>{} : _bookable(d);
                return PageList(children: [
                  const PageHeader('Agendar una cita', description: 'Elija clínica y médico, luego el día y la hora.'),
                  // Clínica
                  Wrap(spacing: 8, runSpacing: 8, children: [
                    ChoiceChip(label: const Text('Todas'), selected: _clinicId == null, onSelected: (_) => setState(() => _clinicId = _doctor = _date = _slot = null)),
                    for (final c in clinics)
                      ChoiceChip(
                        avatar: ClinicDot(c['name']),
                        label: Text((c['name'] as String).replaceFirst('Clínica ', '')),
                        selected: _clinicId == c['id'],
                        onSelected: (_) => setState(() {
                          _clinicId = c['id'];
                          _doctor = null;
                          _date = null;
                          _slot = null;
                        }),
                      ),
                  ]),
                  // 1. Médico
                  SectionCard(title: '1. Médico', children: [
                    Select<String?>(
                      label: 'Especialidad',
                      value: _specialty,
                      items: {null: 'Todas las especialidades', for (final s in specialties) s: s},
                      onChanged: (v) => setState(() {
                        _specialty = v;
                        _doctor = null;
                        _date = null;
                        _slot = null;
                      }),
                    ),
                    const SizedBox(height: 8),
                    for (final doc in doctors)
                      _ChoiceTile(
                        selected: _doctor?['id'] == doc['id'],
                        title: doc['fullName'],
                        subtitle: '${doc['specialty']} · ${_where(doc)}',
                        onTap: () => setState(() {
                          _doctor = doc;
                          _date = null;
                          _slot = null;
                        }),
                      ),
                    if (doctors.isEmpty) const Text('No hay médicos con esa especialidad en esta clínica.'),
                  ]),
                  // 2. Día
                  if (_doctor != null)
                    SectionCard(title: '2. Día', children: [
                      if (days.isEmpty)
                        const Text('Este médico no tiene días disponibles en los próximos dos meses en esta clínica.')
                      else
                        Wrap(spacing: 8, runSpacing: 8, children: [
                          for (final day in days.keys.take(24))
                            ChoiceChip(
                              label: Text(dayLabelShort(day)),
                              selected: _date == day,
                              onSelected: (_) => setState(() {
                                _date = day;
                                _slot = null;
                              }),
                            ),
                        ]),
                    ]),
                  // 3. Hora
                  if (_doctor != null && _date != null) _Hours(doctorId: _doctor!['id'], date: _date!, clinics: days[_date] ?? const [], selected: _slot, onSelect: (s) => setState(() => _slot = s)),
                  if (_slot != null)
                    SectionCard(title: '4. Confirmar', children: [
                      Text('${dayLabel(_date!)}, ${_slot!['label']}', style: Theme.of(context).textTheme.titleMedium),
                      Text('${_doctor!['fullName']} · ${_slot!['clinicName']}'),
                      const SizedBox(height: 12),
                      TextField(controller: _reason, maxLength: 200, decoration: const InputDecoration(labelText: 'Motivo de la consulta (opcional)', hintText: 'Ej. control, dolor de garganta')),
                      if (_error != null) ...[Notice(tone: Tone.danger, body: errorText(_error!)), const SizedBox(height: 10)],
                      BusyButton(
                        label: 'Confirmar cita',
                        icon: Icons.check,
                        expand: true,
                        onPressed: () async {
                          setState(() => _error = null);
                          try {
                            final a = await ref.read(apiProvider).post<Json>('/portal/appointments', body: {
                              'clinicId': _slot!['clinicId'],
                              'doctorId': _doctor!['id'],
                              'startsAt': _slot!['startsAt'],
                              'reason': _reason.text.trim().isEmpty ? null : _reason.text.trim(),
                            });
                            ref.invalidate(portalAppointmentsProvider);
                            _reason.clear();
                            setState(() => _done = a);
                          } catch (e) {
                            setState(() {
                              _error = e;
                              // Alguien tomó la hora mientras tanto: se vuelven a pedir los horarios.
                              if (e is ApiError && e.status == 409) _slot = null;
                            });
                          }
                        },
                      ),
                    ]),
                ]);
              },
            ),
    );
  }

  String _where(Json doc) {
    final names = <String>{for (final a in (doc['assignments'] as List).cast<Json>()) (a['clinicName'] as String).replaceFirst('Clínica ', '')};
    return names.join(', ');
  }
}

class _ChoiceTile extends StatelessWidget {
  const _ChoiceTile({required this.selected, required this.title, required this.subtitle, required this.onTap});
  final bool selected;
  final String title;
  final String subtitle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.only(top: 6),
      child: Semantics(
        selected: selected,
        button: true,
        child: ListTile(
          onTap: onTap,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10), side: BorderSide(color: selected ? scheme.primary : scheme.outlineVariant, width: selected ? 2 : 1)),
          tileColor: selected ? scheme.primaryContainer.withValues(alpha: 0.5) : null,
          title: Text(title, style: const TextStyle(fontWeight: FontWeight.w700)),
          subtitle: Text(subtitle),
          trailing: selected ? Icon(Icons.check_circle, color: scheme.primary) : null,
        ),
      ),
    );
  }
}

/// Horas libres del médico ese día, en cada clínica donde atiende.
class _Hours extends ConsumerWidget {
  const _Hours({required this.doctorId, required this.date, required this.clinics, required this.selected, required this.onSelect});
  final String doctorId;
  final String date;
  final List<Json> clinics;
  final Json? selected;
  final ValueChanged<Json> onSelect;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final key = (doctorId, date, clinics.map((c) => c['id']).join(','));
    final av = ref.watch(_portalSlotsProvider(key));
    return SectionCard(title: '3. Hora', children: [
      AsyncBody(
        value: av,
        onRetry: () => ref.invalidate(_portalSlotsProvider(key)),
        data: (slots) {
          if (slots.isEmpty) return const Text('No quedan horas libres ese día. Elija otro día.');
          final byClinic = <String, List<Json>>{};
          for (final s in slots) {
            byClinic.putIfAbsent(s['clinicName'], () => []).add(s);
          }
          return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            for (final e in byClinic.entries) ...[
              if (byClinic.length > 1) Padding(padding: const EdgeInsets.only(top: 6, bottom: 6), child: Row(children: [ClinicDot(e.key), const SizedBox(width: 6), Text(e.key, style: const TextStyle(fontWeight: FontWeight.w700))])),
              Wrap(spacing: 8, runSpacing: 8, children: [
                for (final s in e.value)
                  ChoiceChip(
                    label: Text(s['label'], style: const TextStyle(fontSize: 16, fontFeatures: [FontFeature.tabularFigures()])),
                    selected: selected?['startsAt'] == s['startsAt'] && selected?['clinicId'] == s['clinicId'],
                    onSelected: (_) => onSelect(s),
                  ),
              ]),
            ],
            const SizedBox(height: 8),
            Text('Se agenda con al menos 2 horas de anticipación.', style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant, fontSize: 13)),
          ]);
        },
      ),
    ]);
  }
}

final _portalSlotsProvider = FutureProvider.autoDispose.family<List<Json>, (String, String, String)>((ref, key) async {
  final (doctorId, date, clinicIds) = key;
  final api = ref.watch(apiProvider);
  final out = <Json>[];
  for (final clinicId in clinicIds.split(',').where((c) => c.isNotEmpty)) {
    final r = await api.get<Json>('/portal/availability', query: {'clinicId': clinicId, 'date': date, 'doctorId': doctorId});
    final dir = await ref.read(directoryProvider.future);
    final name = ((dir['clinics'] as List).cast<Json>().firstWhere((c) => c['id'] == clinicId))['name'];
    for (final s in (r['slots'] as List).cast<Json>()) {
      out.add({...s, 'clinicId': clinicId, 'clinicName': name});
    }
  }
  out.sort((a, b) => (a['startsAt'] as String).compareTo(b['startsAt']));
  return out;
});

class _Done extends ConsumerWidget {
  const _Done({required this.appt, required this.onAnother});
  final Json appt;
  final VoidCallback onAnother;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final a = appt;
    return PageList(children: [
      Notice(
        tone: a['status'] == 'REQUESTED' ? Tone.warn : Tone.good,
        title: a['status'] == 'REQUESTED' ? 'Solicitud enviada' : 'Cita agendada',
        body: a['status'] == 'REQUESTED' ? 'El horario ya es suyo. La clínica revisará la solicitud y la confirmará; le avisaremos en la campana.' : 'Le esperamos. Llegue 10 minutos antes.',
      ),
      NextAppointmentCard(appt: a),
      FilledButton(onPressed: () => context.go('/p'), child: const Text('Ir al inicio')),
      OutlinedButton(onPressed: onAnother, child: const Text('Agendar otra')),
    ]);
  }
}

// ───────────────────────────── Mi ficha ─────────────────────────────

final portalRecordProvider = FutureProvider.autoDispose<Json>((ref) => ref.watch(apiProvider).get<Json>('/portal/medical-record'));

class PortalRecordPage extends ConsumerWidget {
  const PortalRecordPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final rec = ref.watch(portalRecordProvider);
    final api = ref.read(apiProvider);
    return PortalScaffold(
      title: 'Mi ficha',
      index: 3,
      body: AsyncBody(
        value: rec,
        onRetry: () => ref.invalidate(portalRecordProvider),
        data: (r) {
          final h = r['history'] as Json;
          final consultations = (r['consultations'] as List).cast<Json>();
          final attachments = (r['attachments'] as List).cast<Json>();
          return PageList(onRefresh: () async => ref.invalidate(portalRecordProvider), children: [
            const PageHeader('Mi ficha', description: 'Diagnósticos, indicaciones, recetas y resultados que su médico compartió con usted.'),
            if ((h['allergies'] as String?)?.isNotEmpty == true) Notice(tone: Tone.danger, title: 'Alergias', body: h['allergies']),
            SectionCard(title: 'Mis datos de salud', children: [
              InfoRow('Tipo de sangre', h['bloodType'] ?? 'Sin registrar'),
              InfoRow('Enfermedades', h['chronicConditions'] ?? 'Ninguna registrada'),
              InfoRow('Medicinas', h['medications'] ?? 'Ninguna registrada'),
            ]),
            SectionCard(title: 'Consultas (${consultations.length})', children: [
              if (consultations.isEmpty) const Text('Todavía no hay consultas registradas.'),
              for (final c in consultations) _PortalConsultation(c: c, onRecipe: () => run(context, () => api.openFile('/portal/consultations/${c['id']}/receta.pdf', 'receta-${(c['appointment'] as Json?)?['code'] ?? c['id']}.pdf'))),
            ]),
            SectionCard(title: 'Resultados y documentos', children: [
              if (attachments.isEmpty) const Text('Su médico todavía no compartió documentos.'),
              for (final f in attachments)
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: Icon(f['mime'] == 'application/pdf' ? Icons.picture_as_pdf_outlined : Icons.image_outlined),
                  title: Text(f['description'] ?? f['filename']),
                  subtitle: Text('${shortDate(f['createdAt'])} · ${bytes(f['bytes'])}'),
                  trailing: const Icon(Icons.open_in_new),
                  onTap: () => run(context, () => api.openFile('/portal/attachments/${f['id']}', f['filename'])),
                ),
            ]),
          ]);
        },
      ),
    );
  }
}

class _PortalConsultation extends StatelessWidget {
  const _PortalConsultation({required this.c, required this.onRecipe});
  final Json c;
  final VoidCallback onRecipe;

  @override
  Widget build(BuildContext context) {
    final rx = (c['prescription'] as List).cast<Json>();
    final doctor = c['doctor'] as Json;
    // Una consulta puede no venir de una cita (se registró aparte).
    final appt = c['appointment'] as Json?;
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    return Container(
      margin: const EdgeInsets.only(top: 10),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(border: Border.all(color: Theme.of(context).colorScheme.outlineVariant), borderRadius: BorderRadius.circular(12)),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(longDateYear(appt?['startsAt'] ?? c['createdAt']), style: const TextStyle(fontWeight: FontWeight.w700)),
        Text([doctor['fullName'], doctor['specialty'], appt?['clinic']].whereType<String>().join(' · '), style: TextStyle(color: muted)),
        const SizedBox(height: 8),
        Text('Motivo: ${c['reason']}'),
        if (c['diagnosis'] != null || c['diagnosisCode'] != null)
          Padding(padding: const EdgeInsets.only(top: 4), child: Text('Diagnóstico: ${[c['diagnosisCode'], c['diagnosis'] ?? c['diagnosisCodeLabel']].whereType<String>().join(' · ')}')),
        if (c['plan'] != null) Padding(padding: const EdgeInsets.only(top: 4), child: Text('Indicaciones: ${c['plan']}')),
        if (rx.isNotEmpty) ...[
          const SizedBox(height: 8),
          const Text('Receta', style: TextStyle(fontWeight: FontWeight.w700)),
          for (final m in rx) Text('• ${[m['medication'], m['dose'], m['frequency'], m['duration']].whereType<String>().join(' · ')}${m['instructions'] == null ? '' : ' (${m['instructions']})'}'),
          const SizedBox(height: 8),
          OutlinedButton.icon(onPressed: onRecipe, icon: const Icon(Icons.picture_as_pdf_outlined), label: const Text('Receta en PDF')),
        ],
      ]),
    );
  }
}

// ───────────────────────────── Perfil ─────────────────────────────

class PortalProfilePage extends ConsumerStatefulWidget {
  const PortalProfilePage({super.key});
  @override
  ConsumerState<PortalProfilePage> createState() => _PortalProfilePageState();
}

class _PortalProfilePageState extends ConsumerState<PortalProfilePage> {
  final _phone = TextEditingController();
  final _email = TextEditingController();
  final _address = TextEditingController();
  bool _loaded = false;
  Object? _error;

  @override
  Widget build(BuildContext context) {
    final me = ref.watch(portalMeProvider);
    return PortalScaffold(
      title: 'Mi perfil',
      index: 4,
      body: AsyncBody(
        value: me,
        onRetry: () => ref.invalidate(portalMeProvider),
        data: (m) {
          if (!_loaded) {
            _phone.text = phone(m['phone']) == '—' ? '' : phone(m['phone']);
            _email.text = m['email'] ?? '';
            _address.text = m['address'] ?? '';
            _loaded = true;
          }
          return PageList(children: [
            PageHeader('${m['firstNames']} ${m['lastNames']}', description: 'Ficha ${m['patientCode']}'),
            SectionCard(title: 'Mis datos', children: [
              InfoRow(documentTypeLabels[m['documentType']] ?? 'Documento', m['documentNumber']),
              InfoRow('Nacimiento', '${shortDate('${m['birthDate']}T17:00:00Z')} (${m['age']} años)'),
              InfoRow('Cuenta desde', shortDate(m['accountSince'])),
              const SizedBox(height: 6),
              Text('Para corregir su nombre, documento o fecha de nacimiento, pídalo en la clínica.', style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant, fontSize: 13)),
            ]),
            SectionCard(title: 'Cómo contactarle', children: [
              TextField(controller: _phone, keyboardType: TextInputType.phone, decoration: InputDecoration(labelText: 'Celular', errorText: fieldError(_error, 'phone'))),
              const SizedBox(height: 12),
              TextField(controller: _email, keyboardType: TextInputType.emailAddress, decoration: InputDecoration(labelText: 'Correo (opcional)', errorText: fieldError(_error, 'email'))),
              const SizedBox(height: 12),
              TextField(controller: _address, decoration: InputDecoration(labelText: 'Dirección (opcional)', errorText: fieldError(_error, 'address'))),
              const SizedBox(height: 12),
              BusyButton(
                label: 'Guardar',
                icon: Icons.save_outlined,
                onPressed: () async {
                  setState(() => _error = null);
                  try {
                    await ref.read(apiProvider).patch<Json>('/portal/me', body: {
                      'phone': _phone.text.trim(),
                      'email': _email.text.trim().isEmpty ? null : _email.text.trim(),
                      'address': _address.text.trim().isEmpty ? null : _address.text.trim(),
                    });
                    ref.invalidate(portalMeProvider);
                    _loaded = false;
                    if (context.mounted) showMessage(context, 'Datos guardados.');
                  } catch (e) {
                    setState(() => _error = e);
                    if (context.mounted && (e is! ApiError || e.fields.isEmpty)) showMessage(context, errorText(e), error: true);
                  }
                },
              ),
            ]),
            const SectionCard(title: 'Contraseña', children: [ChangePasswordForm(path: '/portal/me/password')]),
            SectionCard(title: 'Sesiones', children: [
              const Text('Si ingresó en otro teléfono o computadora y no cerró la sesión, ciérrela desde aquí.'),
              const SizedBox(height: 10),
              BusyButton(
                label: 'Cerrar sesión en los demás equipos',
                outlined: true,
                icon: Icons.devices_other,
                onPressed: () async => run(context, () => ref.read(apiProvider).post<Json>('/portal/me/revoke-other-sessions'), success: 'Listo: se cerraron las demás sesiones.'),
              ),
            ]),
            FilledButton.icon(
              style: FilledButton.styleFrom(backgroundColor: Theme.of(context).colorScheme.error, foregroundColor: Theme.of(context).colorScheme.onError),
              onPressed: () async {
                if (await confirm(context, title: '¿Cerrar sesión?', ok: 'Salir', cancel: 'Quedarme')) ref.read(sessionProvider.notifier).signOut();
              },
              icon: const Icon(Icons.logout),
              label: const Text('Salir'),
            ),
          ]);
        },
      ),
    );
  }
}
