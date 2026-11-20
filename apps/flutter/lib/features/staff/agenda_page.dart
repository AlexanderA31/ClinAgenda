import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api.dart';
import '../../core/data.dart';
import '../../core/format.dart';
import '../../core/session.dart';
import '../../widgets/shells.dart';
import '../../widgets/ui.dart';
import 'booking_page.dart';
import 'common.dart';

/// Citas y horarios de un día en una clínica.
final agendaProvider = FutureProvider.autoDispose.family<({List<Json> appts, Json availability}), (String, String)>((ref, key) async {
  final (clinicId, date) = key;
  final api = ref.watch(apiProvider);
  final results = await Future.wait([
    api.get<Json>('/appointments', query: {'from': date, 'to': date, 'clinicId': clinicId, 'pageSize': 500, 'sortBy': 'startsAt'}),
    api.get<Json>('/appointments/availability', query: {'date': date, 'clinicId': clinicId}),
  ]);
  return (appts: (results[0]['items'] as List).cast<Json>(), availability: results[1]);
});

/// Solicitudes en línea por confirmar, de hoy en adelante.
final requestsProvider = FutureProvider.autoDispose<List<Json>>((ref) async {
  final r = await ref.watch(apiProvider).get<Json>('/appointments', query: {'status': 'REQUESTED', 'from': todayIso(), 'pageSize': 50, 'sortBy': 'startsAt'});
  return (r['items'] as List).cast<Json>();
});

class AgendaPage extends ConsumerStatefulWidget {
  const AgendaPage({super.key});
  @override
  ConsumerState<AgendaPage> createState() => _AgendaPageState();
}

class _AgendaPageState extends ConsumerState<AgendaPage> {
  String _date = todayIso();
  String? _clinicId;
  String? _doctorId;

  Future<void> _open(Json a) async {
    await context.push('/cita/${a['id']}');
    ref.invalidate(agendaProvider);
    ref.invalidate(requestsProvider);
  }

  Future<void> _book([BookingPreset? preset]) async {
    await context.push('/nueva-cita', extra: preset ?? BookingPreset(clinicId: _clinicId, date: _date));
    ref.invalidate(agendaProvider);
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(staffProvider);
    final clinics = ref.watch(workClinicsProvider);
    final canBook = user.can('citas.agendar');
    return StaffScaffold(
      title: 'Agenda',
      fab: canBook ? FloatingActionButton.extended(onPressed: _book, icon: const Icon(Icons.add), label: const Text('Nueva cita')) : null,
      body: AsyncBody(
        value: clinics,
        onRetry: () => ref.invalidate(clinicsProvider),
        data: (cs) {
          if (cs.isEmpty) return const EmptyState(title: 'No tiene clínicas asignadas', body: 'Pida a la dirección que le asigne una clínica.');
          final clinicId = _clinicId != null && cs.any((c) => c['id'] == _clinicId) ? _clinicId! : cs.first['id'] as String;
          final day = ref.watch(agendaProvider((clinicId, _date)));
          final requests = canBook ? ref.watch(requestsProvider).valueOrNull ?? const [] : const <Json>[];
          Future<void> refresh() async {
            ref.invalidate(agendaProvider((clinicId, _date)));
            ref.invalidate(requestsProvider);
            await ref.read(agendaProvider((clinicId, _date)).future);
          }

          return PageList(onRefresh: refresh, children: [
            DayBar(date: _date, onChanged: (d) => setState(() => _date = d)),
            if (cs.length > 1) ClinicChips(clinics: cs, selected: clinicId, onSelected: (id) => setState(() {
                  _clinicId = id;
                  _doctorId = null;
                })),
            if (requests.isNotEmpty) _Requests(requests: requests, onOpen: _open),
            AsyncBody(
              value: day,
              onRetry: refresh,
              data: (d) => _Day(
                appts: d.appts,
                availability: d.availability,
                doctorId: _doctorId,
                onDoctor: (id) => setState(() => _doctorId = id),
                onOpen: _open,
                onBook: canBook ? (slot) => _book(BookingPreset(clinicId: clinicId, date: _date, slot: slot)) : null,
              ),
            ),
          ]);
        },
      ),
    );
  }
}

class _Requests extends StatelessWidget {
  const _Requests({required this.requests, required this.onOpen});
  final List<Json> requests;
  final ValueChanged<Json> onOpen;

  @override
  Widget build(BuildContext context) {
    final c = toneColor(context, Tone.warn);
    return Container(
      decoration: BoxDecoration(color: c.withValues(alpha: 0.07), borderRadius: BorderRadius.circular(14), border: Border.all(color: c.withValues(alpha: 0.6), width: 1.5)),
      padding: const EdgeInsets.all(12),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Icon(Icons.hourglass_top, color: c),
          const SizedBox(width: 8),
          Expanded(child: Text('${requests.length} ${requests.length == 1 ? 'solicitud' : 'solicitudes'} en línea por confirmar', style: TextStyle(fontWeight: FontWeight.w700, color: c))),
        ]),
        const SizedBox(height: 6),
        for (final a in requests.take(5))
          ListTile(
            contentPadding: EdgeInsets.zero,
            title: Text(a['patient']['fullName'], style: const TextStyle(fontWeight: FontWeight.w700)),
            subtitle: Text('${dayLabelShort(localDate(a['startsAt']))}, ${time(a['startsAt'])} · ${a['doctor']['fullName']} · ${a['clinic']['name']}'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => onOpen(a),
          ),
        if (requests.length > 5) Text('y ${requests.length - 5} más'),
      ]),
    );
  }
}

class _Day extends StatelessWidget {
  const _Day({required this.appts, required this.availability, required this.doctorId, required this.onDoctor, required this.onOpen, required this.onBook});
  final List<Json> appts;
  final Json availability;
  final String? doctorId;
  final ValueChanged<String?> onDoctor;
  final ValueChanged<Json> onOpen;
  final ValueChanged<Json>? onBook;

  @override
  Widget build(BuildContext context) {
    final slots = (availability['slots'] as List).cast<Json>();
    final active = appts.where((a) => a['status'] != 'CANCELLED').toList();
    final cancelled = appts.where((a) => a['status'] == 'CANCELLED').toList();
    // Médicos del día: los que tienen horario o alguna cita.
    final doctors = <String, String>{};
    for (final s in slots) {
      doctors[s['doctorId']] = s['doctorName'];
    }
    for (final a in active) {
      doctors[a['doctor']['id']] = a['doctor']['fullName'];
    }
    final free = slots.where((s) => s['available'] == true).length;
    final attended = active.where((a) => a['status'] == 'ATTENDED').length;
    final pending = active.where((a) => a['status'] == 'SCHEDULED' || a['status'] == 'REQUESTED').length;
    final shown = doctorId == null ? doctors.keys.toList() : [doctorId!];

    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      if (availability['closed'] != null) ...[Notice(tone: Tone.warn, title: 'La clínica no atiende este día', body: availability['closed']), const SizedBox(height: 12)],
      Row(children: [
        _Mini('Citas', active.length),
        _Mini('Atendidas', attended),
        _Mini('Por atender', pending),
        _Mini('Libres', free),
      ]),
      const SizedBox(height: 12),
      if (doctors.length > 1)
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: Row(children: [
            Padding(padding: const EdgeInsets.only(right: 8), child: ChoiceChip(label: const Text('Todos'), selected: doctorId == null, onSelected: (_) => onDoctor(null))),
            for (final e in doctors.entries) Padding(padding: const EdgeInsets.only(right: 8), child: ChoiceChip(label: Text(e.value), selected: doctorId == e.key, onSelected: (_) => onDoctor(e.key))),
          ]),
        ),
      if (doctors.isEmpty && availability['closed'] == null) const EmptyState(icon: Icons.event_busy, title: 'Ningún médico atiende este día', body: 'Elija otro día u otra clínica.'),
      for (final id in shown) ...[
        const SizedBox(height: 14),
        _DoctorBlock(
          name: doctors[id] ?? '',
          appts: active.where((a) => a['doctor']['id'] == id).toList(),
          free: slots.where((s) => s['doctorId'] == id && s['available'] == true).toList(),
          onOpen: onOpen,
          onBook: onBook,
        ),
      ],
      if (cancelled.isNotEmpty) ...[
        const SizedBox(height: 14),
        Card(
          child: ExpansionTile(
            shape: const Border(),
            title: Text('Canceladas (${cancelled.length})'),
            children: [for (final a in cancelled) Padding(padding: const EdgeInsets.fromLTRB(8, 0, 8, 8), child: AppointmentTile(appt: a, onTap: () => onOpen(a)))],
          ),
        ),
      ],
    ]);
  }
}

class _Mini extends StatelessWidget {
  const _Mini(this.label, this.value);
  final String label;
  final int value;
  @override
  Widget build(BuildContext context) => Expanded(
        child: Column(children: [
          Text('$value', style: Theme.of(context).textTheme.titleLarge),
          Text(label, style: TextStyle(fontSize: 12, color: Theme.of(context).colorScheme.onSurfaceVariant), textAlign: TextAlign.center),
        ]),
      );
}

class _DoctorBlock extends StatelessWidget {
  const _DoctorBlock({required this.name, required this.appts, required this.free, required this.onOpen, required this.onBook});
  final String name;
  final List<Json> appts;
  final List<Json> free;
  final ValueChanged<Json> onOpen;
  final ValueChanged<Json>? onBook;

  @override
  Widget build(BuildContext context) {
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Row(children: [
        Expanded(child: Semantics(header: true, child: Text(name, style: Theme.of(context).textTheme.titleMedium))),
        Text('${appts.length} ${appts.length == 1 ? 'cita' : 'citas'} · ${free.length} libres', style: TextStyle(color: muted)),
      ]),
      const SizedBox(height: 8),
      for (final a in appts) Padding(padding: const EdgeInsets.only(bottom: 8), child: AppointmentTile(appt: a, onTap: () => onOpen(a), showDoctor: false)),
      if (appts.isEmpty) Padding(padding: const EdgeInsets.only(bottom: 8), child: Text('Sin citas todavía.', style: TextStyle(color: muted))),
      if (free.isNotEmpty) ...[
        Text(onBook == null ? 'Horas libres' : 'Horas libres (toque una para agendar)', style: TextStyle(color: muted, fontSize: 13)),
        const SizedBox(height: 6),
        Wrap(spacing: 6, runSpacing: 6, children: [
          for (final s in free)
            ActionChip(
              avatar: onBook == null ? null : const Icon(Icons.add, size: 16),
              label: Text(s['label'], style: const TextStyle(fontFeatures: [FontFeature.tabularFigures()])),
              onPressed: onBook == null ? null : () => onBook!(s),
            ),
        ]),
      ],
    ]);
  }
}
