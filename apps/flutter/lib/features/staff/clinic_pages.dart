import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api.dart';
import '../../core/data.dart';
import '../../core/format.dart';
import '../../core/labels.dart';
import '../../core/session.dart';
import '../../core/theme.dart';
import '../../widgets/shells.dart';
import '../../widgets/ui.dart';
import '../auth/auth_pages.dart';

/// Orden de los días en pantalla: lunes primero (la API usa 0 = domingo).
const _weekOrder = [1, 2, 3, 4, 5, 6, 0];

String _range(Json r) => '${r['startTime']}–${r['endTime']}';

Future<String?> _pickTime(BuildContext context, String? current) async {
  final parts = (current ?? '08:00').split(':');
  final t = await showTimePicker(
    context: context,
    initialTime: TimeOfDay(hour: int.parse(parts[0]), minute: int.parse(parts[1])),
    builder: (c, child) => MediaQuery(data: MediaQuery.of(c).copyWith(alwaysUse24HourFormat: true), child: child!),
  );
  return t == null ? null : '${t.hour.toString().padLeft(2, '0')}:${t.minute.toString().padLeft(2, '0')}';
}

/// Citas que quedaron fuera del nuevo horario: no se cancelan, hay que reprogramarlas.
Future<void> showOutsideSchedule(BuildContext context, List<Json> list) {
  return showDialog(
    context: context,
    builder: (c) => AlertDialog(
      title: Text('${list.length} ${list.length == 1 ? 'cita quedó' : 'citas quedaron'} fuera del horario'),
      content: SizedBox(
        width: double.maxFinite,
        child: ListView(shrinkWrap: true, children: [
          const Text('No se cancelaron. Llame a cada paciente para darle otra hora.'),
          const SizedBox(height: 8),
          for (final a in list)
            ListTile(
              contentPadding: EdgeInsets.zero,
              title: Text(a['patientName'], style: const TextStyle(fontWeight: FontWeight.w700)),
              subtitle: Text('${dayLabelShort(localDate(a['startsAt']))}, ${time(a['startsAt'])} · ${a['doctorName']} · ${a['clinicName']}\n${phone(a['patientPhone'])}'),
              isThreeLine: true,
              trailing: IconButton(tooltip: 'Abrir cita', icon: const Icon(Icons.open_in_new), onPressed: () {
                Navigator.pop(c);
                context.push('/cita/${a['id']}');
              }),
            ),
        ]),
      ),
      actions: [FilledButton(onPressed: () => Navigator.pop(c), child: const Text('Entendido'))],
    ),
  );
}

// ───────────────────────────── Clínicas ─────────────────────────────

class ClinicsPage extends ConsumerWidget {
  const ClinicsPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final clinics = ref.watch(clinicsProvider);
    final canManage = ref.watch(staffProvider).can('clinicas.gestionar');
    return StaffScaffold(
      title: 'Clínicas',
      body: AsyncBody(
        value: clinics,
        onRetry: () => ref.invalidate(clinicsProvider),
        data: (list) => PageList(onRefresh: () async => ref.invalidate(clinicsProvider), children: [
          const PageHeader('Clínicas', description: 'Horarios de atención y días cerrados de cada sede.'),
          for (final c in list) _ClinicCard(clinic: c, canManage: canManage),
        ]),
      ),
    );
  }
}

class _ClinicCard extends ConsumerWidget {
  const _ClinicCard({required this.clinic, required this.canManage});
  final Json clinic;
  final bool canManage;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = clinic;
    final schedule = (c['schedule'] as List).cast<Json>();
    final closures = (c['closures'] as List).cast<Json>()..sort((a, b) => (a['date'] as String).compareTo(b['date']));
    final upcomingClosures = closures.where((x) => (x['date'] as String).compareTo(todayIso()) >= 0).toList();
    final api = ref.read(apiProvider);
    return Card(
      clipBehavior: Clip.antiAlias,
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Container(height: 6, color: Brand.clinic(c['name'])),
        Padding(
          padding: const EdgeInsets.all(16),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Text(c['name'], style: Theme.of(context).textTheme.titleLarge),
            if (c['address'] != null) Text(c['address']),
            Text('${phone(c['phone'])} · turnos de ${c['slotMinutes']} minutos', style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant)),
            const SizedBox(height: 10),
            for (final w in _weekOrder)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 2),
                child: Row(children: [
                  SizedBox(width: 100, child: Text(weekdayLabels[w])),
                  Expanded(
                    child: Text(
                      schedule.where((s) => s['weekday'] == w).map(_range).join(', ').ifEmpty('Cerrado'),
                      style: TextStyle(fontWeight: FontWeight.w600, fontFeatures: const [FontFeature.tabularFigures()], color: schedule.any((s) => s['weekday'] == w) ? null : Theme.of(context).colorScheme.onSurfaceVariant),
                    ),
                  ),
                ]),
              ),
            const SizedBox(height: 12),
            Text('Días cerrados', style: Theme.of(context).textTheme.titleSmall),
            if (upcomingClosures.isEmpty) const Text('Ninguno próximo.'),
            for (final x in upcomingClosures)
              ListTile(
                contentPadding: EdgeInsets.zero,
                dense: true,
                title: Text(dayLabel(x['date'])),
                subtitle: Text(x['reason']),
                trailing: canManage
                    ? IconButton(
                        tooltip: 'Quitar cierre',
                        icon: const Icon(Icons.delete_outline),
                        onPressed: () async {
                          if (!await confirm(context, title: '¿Quitar este cierre?', body: '${dayLabel(x['date'])}: la clínica volverá a atender ese día.', ok: 'Quitar')) return;
                          if (!context.mounted) return;
                          final r = await run(context, () => api.delete<Json>('/clinics/${c['id']}/closures/${x['id']}'), success: 'Cierre quitado.');
                          if (r != null) ref.invalidate(clinicsProvider);
                        },
                      )
                    : null,
              ),
            if (canManage) ...[
              const SizedBox(height: 10),
              Wrap(spacing: 8, runSpacing: 8, children: [
                FilledButton.icon(
                  onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => _ClinicForm(clinic: c))),
                  icon: const Icon(Icons.edit_calendar),
                  label: const Text('Editar horario y datos'),
                ),
                OutlinedButton.icon(onPressed: () => _addClosure(context, ref), icon: const Icon(Icons.event_busy), label: const Text('Cerrar un día')),
              ]),
            ],
          ]),
        ),
      ]),
    );
  }

  Future<void> _addClosure(BuildContext context, WidgetRef ref) async {
    String? date;
    final reason = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (c) => StatefulBuilder(
        builder: (c, set) => AlertDialog(
          title: Text('Cerrar un día en ${clinic['name']}'),
          content: Column(mainAxisSize: MainAxisSize.min, children: [
            DateField(label: 'Día', value: date, firstDate: DateTime.now(), onChanged: (v) => set(() => date = v)),
            const SizedBox(height: 12),
            TextField(controller: reason, decoration: const InputDecoration(labelText: 'Motivo', hintText: 'Ej. Feriado, mantenimiento')),
          ]),
          actions: [TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Cancelar')), FilledButton(onPressed: date == null ? null : () => Navigator.pop(c, true), child: const Text('Cerrar ese día'))],
        ),
      ),
    );
    if (ok != true || !context.mounted) return;
    final r = await run(context, () => ref.read(apiProvider).post<Json>('/clinics/${clinic['id']}/closures', body: {'date': date, 'reason': reason.text.trim()}));
    if (r == null || !context.mounted) return;
    ref.invalidate(clinicsProvider);
    final n = r['appointmentsToReschedule'] as int? ?? 0;
    showMessage(context, n > 0 ? 'Día cerrado. Hay $n cita(s) ese día que hay que reprogramar: búsquelas en la agenda.' : 'Día cerrado.', duration: const Duration(seconds: 10));
  }
}

extension on String {
  String ifEmpty(String other) => isEmpty ? other : this;
}

class _ClinicForm extends ConsumerStatefulWidget {
  const _ClinicForm({required this.clinic});
  final Json clinic;
  @override
  ConsumerState<_ClinicForm> createState() => _ClinicFormState();
}

class _ClinicFormState extends ConsumerState<_ClinicForm> {
  late final _name = TextEditingController(text: widget.clinic['name']);
  late final _address = TextEditingController(text: widget.clinic['address'] ?? '');
  late final _phone = TextEditingController(text: widget.clinic['phone'] ?? '');
  late int _slot = widget.clinic['slotMinutes'];
  late final Map<int, List<Json>> _days = {
    for (final w in _weekOrder) w: [for (final s in (widget.clinic['schedule'] as List).cast<Json>().where((s) => s['weekday'] == w)) {'startTime': s['startTime'], 'endTime': s['endTime']}],
  };
  Object? _error;

  @override
  Widget build(BuildContext context) {
    String? err(String f) => fieldError(_error, f);
    return Scaffold(
      appBar: AppBar(title: Text('Editar ${widget.clinic['name']}')),
      body: SafeArea(
        top: false,
        child: PageList(children: [
          if (_error != null) Notice(tone: Tone.danger, body: errorText(_error!)),
          TextField(controller: _name, decoration: InputDecoration(labelText: 'Nombre', errorText: err('name'))),
          TextField(controller: _address, decoration: InputDecoration(labelText: 'Dirección', errorText: err('address'))),
          TextField(controller: _phone, keyboardType: TextInputType.phone, decoration: InputDecoration(labelText: 'Teléfono', errorText: err('phone'))),
          Select<int>(label: 'Duración de cada turno', value: _slot, items: {for (final m in [10, 15, 20, 30, 45, 60]) m: '$m minutos'}, onChanged: (v) => setState(() => _slot = v ?? _slot)),
          Row(children: [
            Expanded(child: Text('Horario de atención', style: Theme.of(context).textTheme.titleMedium)),
            TextButton(
              onPressed: () => setState(() {
                for (final w in [2, 3, 4, 5]) {
                  _days[w] = [for (final r in _days[1]!) {...r}];
                }
              }),
              child: const Text('Copiar el lunes a los días hábiles'),
            ),
          ]),
          if (err('schedule') != null) Text(err('schedule')!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
          for (final w in _weekOrder) _DayEditor(
            label: weekdayLabels[w],
            ranges: _days[w]!,
            onChanged: () => setState(() {}),
          ),
          BusyButton(
            label: 'Guardar',
            icon: Icons.save_outlined,
            expand: true,
            onPressed: () async {
              setState(() => _error = null);
              try {
                final r = await ref.read(apiProvider).patch<Json>('/clinics/${widget.clinic['id']}', body: {
                  'name': _name.text.trim(),
                  'address': _address.text.trim().isEmpty ? null : _address.text.trim(),
                  'phone': _phone.text.trim().isEmpty ? null : _phone.text.trim(),
                  'slotMinutes': _slot,
                  'schedule': [
                    for (final w in _weekOrder)
                      for (final range in _days[w]!) {'weekday': w, ...range},
                  ],
                });
                ref.invalidate(clinicsProvider);
                if (!context.mounted) return;
                final outside = (r['appointmentsOutsideSchedule'] as List).cast<Json>();
                showMessage(context, 'Horario guardado.');
                if (outside.isNotEmpty) await showOutsideSchedule(context, outside);
                if (context.mounted) Navigator.pop(context);
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

/// Un día: abierto o cerrado, con uno o más rangos (ej. mañana y tarde).
class _DayEditor extends StatelessWidget {
  const _DayEditor({required this.label, required this.ranges, required this.onChanged});
  final String label;
  final List<Json> ranges;
  final VoidCallback onChanged;

  @override
  Widget build(BuildContext context) {
    final open = ranges.isNotEmpty;
    return Card(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(14, 6, 8, 10),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: Text(label, style: const TextStyle(fontWeight: FontWeight.w700)),
            subtitle: Text(open ? 'Abierto' : 'Cerrado'),
            value: open,
            onChanged: (v) {
              if (v) {
                ranges.add({'startTime': '08:00', 'endTime': '17:00'});
              } else {
                ranges.clear();
              }
              onChanged();
            },
          ),
          for (var i = 0; i < ranges.length; i++)
            Row(children: [
              Expanded(child: _TimeButton(value: ranges[i]['startTime'], label: 'Desde', onPicked: (t) => {ranges[i]['startTime'] = t, onChanged()})),
              const Padding(padding: EdgeInsets.symmetric(horizontal: 6), child: Text('a')),
              Expanded(child: _TimeButton(value: ranges[i]['endTime'], label: 'Hasta', onPicked: (t) => {ranges[i]['endTime'] = t, onChanged()})),
              IconButton(tooltip: 'Quitar este horario', onPressed: () => {ranges.removeAt(i), onChanged()}, icon: const Icon(Icons.close)),
            ]),
          if (open)
            Align(
              alignment: Alignment.centerLeft,
              child: TextButton.icon(onPressed: () => {ranges.add({'startTime': '14:00', 'endTime': '18:00'}), onChanged()}, icon: const Icon(Icons.add), label: const Text('Agregar otro horario')),
            ),
        ]),
      ),
    );
  }
}

class _TimeButton extends StatelessWidget {
  const _TimeButton({required this.value, required this.label, required this.onPicked});
  final String value;
  final String label;
  final ValueChanged<String> onPicked;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: '$label $value',
      button: true,
      child: OutlinedButton(
        onPressed: () async {
          final t = await _pickTime(context, value);
          if (t != null) onPicked(t);
        },
        child: Text(value, style: const TextStyle(fontSize: 16, fontFeatures: [FontFeature.tabularFigures()])),
      ),
    );
  }
}

// ───────────────────────────── Médicos ─────────────────────────────

class DoctorsPage extends ConsumerWidget {
  const DoctorsPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final doctors = ref.watch(doctorsProvider(null));
    final canManage = ref.watch(staffProvider).can('medicos.gestionar');
    void open([Json? d]) => Navigator.of(context).push(MaterialPageRoute(builder: (_) => _DoctorForm(doctor: d)));
    return StaffScaffold(
      title: 'Médicos',
      fab: canManage ? FloatingActionButton.extended(onPressed: open, icon: const Icon(Icons.add), label: const Text('Nuevo médico')) : null,
      body: AsyncBody(
        value: doctors,
        onRetry: () => ref.invalidate(doctorsProvider),
        data: (list) => PageList(onRefresh: () async => ref.invalidate(doctorsProvider), children: [
          const PageHeader('Médicos', description: 'Qué días y en qué clínica atiende cada uno.'),
          for (final d in list)
            Card(
              child: Padding(
                padding: const EdgeInsets.all(14),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Row(children: [
                    Expanded(
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text(d['fullName'], style: Theme.of(context).textTheme.titleMedium),
                        Text(d['specialty'], style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant)),
                      ]),
                    ),
                    if (d['active'] != true) const Badge2(label: 'Inactivo', tone: Tone.neutral),
                    if (canManage) IconButton(tooltip: 'Editar médico', onPressed: () => open(d), icon: const Icon(Icons.edit_outlined)),
                  ]),
                  const SizedBox(height: 8),
                  ..._assignmentLines(context, (d['assignments'] as List).cast<Json>()),
                  if (canManage)
                    TextButton.icon(
                      onPressed: () async {
                        final r = await run(context, () => ref.read(apiProvider).get<List>('/doctors/${d['id']}/orphans'));
                        if (r == null || !context.mounted) return;
                        if (r.isEmpty) return showMessage(context, 'Todas sus citas futuras están dentro de su horario.');
                        await showOutsideSchedule(context, r.cast<Json>());
                      },
                      icon: const Icon(Icons.rule),
                      label: const Text('Revisar citas fuera de horario'),
                    ),
                ]),
              ),
            ),
        ]),
      ),
    );
  }

  List<Widget> _assignmentLines(BuildContext context, List<Json> as) {
    if (as.isEmpty) return [const Text('Sin horario asignado.')];
    final byClinic = <String, List<Json>>{};
    for (final a in as) {
      byClinic.putIfAbsent(a['clinicName'], () => []).add(a);
    }
    return [
      for (final e in byClinic.entries)
        Padding(
          padding: const EdgeInsets.only(bottom: 4),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Padding(padding: const EdgeInsets.only(top: 5, right: 8), child: ClinicDot(e.key)),
            Expanded(
              child: Text(
                '${e.key}: ${(e.value..sort((a, b) => _weekOrder.indexOf(a['weekday']) - _weekOrder.indexOf(b['weekday']))).map((a) => '${weekdayLabels[a['weekday']].substring(0, 3).toLowerCase()} ${_range(a)}').join(', ')}',
              ),
            ),
          ]),
        ),
    ];
  }
}

class _DoctorForm extends ConsumerStatefulWidget {
  const _DoctorForm({this.doctor});
  final Json? doctor;
  @override
  ConsumerState<_DoctorForm> createState() => _DoctorFormState();
}

class _DoctorFormState extends ConsumerState<_DoctorForm> {
  late final _name = TextEditingController(text: widget.doctor?['fullName'] ?? '');
  late final _specialty = TextEditingController(text: widget.doctor?['specialty'] ?? '');
  late final _phone = TextEditingController(text: widget.doctor?['phone'] == null ? '' : phone(widget.doctor!['phone']));
  late bool _active = widget.doctor?['active'] ?? true;
  late final List<Json> _as = [
    for (final a in (widget.doctor?['assignments'] as List? ?? const []).cast<Json>()) {'clinicId': a['clinicId'], 'weekday': a['weekday'], 'startTime': a['startTime'], 'endTime': a['endTime']},
  ];
  Object? _error;

  @override
  Widget build(BuildContext context) {
    final clinics = ref.watch(clinicsProvider).valueOrNull ?? const [];
    String? err(String f) => fieldError(_error, f);
    final editing = widget.doctor != null;
    return Scaffold(
      appBar: AppBar(title: Text(editing ? 'Editar médico' : 'Nuevo médico')),
      body: SafeArea(
        top: false,
        child: PageList(children: [
          if (_error != null) Notice(tone: Tone.danger, body: errorText(_error!)),
          TextField(controller: _name, textCapitalization: TextCapitalization.words, decoration: InputDecoration(labelText: 'Nombre completo', errorText: err('fullName'))),
          TextField(controller: _specialty, textCapitalization: TextCapitalization.sentences, decoration: InputDecoration(labelText: 'Especialidad', errorText: err('specialty'))),
          TextField(controller: _phone, keyboardType: TextInputType.phone, decoration: InputDecoration(labelText: 'Teléfono (opcional)', errorText: err('phone'))),
          if (editing) SwitchListTile(contentPadding: EdgeInsets.zero, title: const Text('Activo'), subtitle: const Text('Si no está activo, no se le pueden dar citas'), value: _active, onChanged: (v) => setState(() => _active = v)),
          Row(children: [
            Expanded(child: Text('Horario por clínica', style: Theme.of(context).textTheme.titleMedium)),
            TextButton.icon(
              onPressed: clinics.isEmpty ? null : () => setState(() => _as.add({'clinicId': clinics.first['id'], 'weekday': 1, 'startTime': '08:00', 'endTime': '13:00'})),
              icon: const Icon(Icons.add),
              label: const Text('Agregar'),
            ),
          ]),
          if (err('assignments') != null) Text(err('assignments')!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
          if (_as.isEmpty) const Text('Sin horario: no aparecerá en la agenda hasta que tenga al menos un día.'),
          for (var i = 0; i < _as.length; i++)
            Card(
              child: Padding(
                padding: const EdgeInsets.all(10),
                child: Column(children: [
                  Row(children: [
                    Expanded(child: Select<String>(label: 'Clínica', value: _as[i]['clinicId'], items: {for (final c in clinics) c['id'] as String: c['name'] as String}, onChanged: (v) => setState(() => _as[i]['clinicId'] = v))),
                    IconButton(tooltip: 'Quitar', onPressed: () => setState(() => _as.removeAt(i)), icon: const Icon(Icons.delete_outline)),
                  ]),
                  const SizedBox(height: 8),
                  Select<int>(label: 'Día', value: _as[i]['weekday'], items: {for (final w in _weekOrder) w: weekdayLabels[w]}, onChanged: (v) => setState(() => _as[i]['weekday'] = v)),
                  const SizedBox(height: 8),
                  Row(children: [
                    Expanded(child: _TimeButton(value: _as[i]['startTime'], label: 'Desde', onPicked: (t) => setState(() => _as[i]['startTime'] = t))),
                    const Padding(padding: EdgeInsets.symmetric(horizontal: 6), child: Text('a')),
                    Expanded(child: _TimeButton(value: _as[i]['endTime'], label: 'Hasta', onPicked: (t) => setState(() => _as[i]['endTime'] = t))),
                  ]),
                ]),
              ),
            ),
          BusyButton(
            label: 'Guardar',
            icon: Icons.save_outlined,
            expand: true,
            onPressed: () async {
              setState(() => _error = null);
              final body = {
                'fullName': _name.text.trim(),
                'specialty': _specialty.text.trim(),
                'phone': _phone.text.trim().isEmpty ? null : _phone.text.trim(),
                'assignments': _as,
                if (editing) 'active': _active,
              };
              try {
                final api = ref.read(apiProvider);
                final r = editing ? await api.patch<Json>('/doctors/${widget.doctor!['id']}', body: body) : await api.post<Json>('/doctors', body: body);
                ref.invalidate(doctorsProvider);
                if (!context.mounted) return;
                showMessage(context, editing ? 'Médico actualizado.' : 'Médico creado.');
                final outside = (r['appointmentsOutsideSchedule'] as List? ?? const []).cast<Json>();
                if (outside.isNotEmpty) await showOutsideSchedule(context, outside);
                if (context.mounted) Navigator.pop(context);
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
