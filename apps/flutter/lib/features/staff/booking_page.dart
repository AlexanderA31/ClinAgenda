import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api.dart';
import '../../core/data.dart';
import '../../core/format.dart';
import '../../widgets/shells.dart';
import '../../widgets/ui.dart';
import 'common.dart';

class BookingPreset {
  const BookingPreset({this.clinicId, this.date, this.slot, this.patient, this.waitlistEntryId});
  final String? clinicId;
  final String? date;
  final Json? slot;
  final Json? patient;
  final String? waitlistEntryId;
}

final availabilityProvider = FutureProvider.autoDispose.family<Json, (String, String)>((ref, key) {
  final (clinicId, date) = key;
  return ref.watch(apiProvider).get<Json>('/appointments/availability', query: {'date': date, 'clinicId': clinicId});
});

final patientSearchProvider = FutureProvider.autoDispose.family<Json, String>((ref, q) => ref.watch(apiProvider).get<Json>('/patients', query: {'q': q, 'pageSize': 20}));

/// Clave por intento de agendar: si se reintenta (doble toque, internet que vuelve), la cita no se duplica.
String newIdempotencyKey() {
  final r = Random.secure();
  return List.generate(16, (_) => r.nextInt(256).toRadixString(16).padLeft(2, '0')).join();
}

/// Nueva cita en tres pasos: paciente, día y hora, confirmar.
class BookingPage extends ConsumerStatefulWidget {
  const BookingPage({super.key, this.preset});
  final BookingPreset? preset;
  @override
  ConsumerState<BookingPage> createState() => _BookingPageState();
}

class _BookingPageState extends ConsumerState<BookingPage> {
  late int _step = widget.preset?.patient != null ? (widget.preset?.slot != null ? 2 : 1) : 0;
  late Json? _patient = widget.preset?.patient;
  late String? _clinicId = widget.preset?.clinicId;
  late String _date = widget.preset?.date ?? todayIso();
  late Json? _slot = widget.preset?.slot;
  final _reason = TextEditingController();
  String _q = '';
  Object? _error;
  final _key = newIdempotencyKey();

  static const _steps = ['Paciente', 'Día y hora', 'Confirmar'];

  @override
  Widget build(BuildContext context) {
    final clinics = ref.watch(workClinicsProvider);
    return StaffScaffold(
      title: 'Nueva cita',
      root: false,
      body: AsyncBody(
        value: clinics,
        onRetry: () => ref.invalidate(clinicsProvider),
        data: (cs) {
          final clinic = cs.firstWhere((c) => c['id'] == _clinicId, orElse: () => cs.isEmpty ? <String, dynamic>{} : cs.first);
          return PageList(children: [
            Row(children: [
              for (var i = 0; i < _steps.length; i++)
                Expanded(
                  child: Container(
                    margin: EdgeInsets.only(right: i < 2 ? 6 : 0),
                    padding: const EdgeInsets.only(top: 6),
                    decoration: BoxDecoration(border: Border(top: BorderSide(width: 4, color: i < _step ? toneColor(context, Tone.good) : (i == _step ? Theme.of(context).colorScheme.primary : Theme.of(context).colorScheme.outlineVariant)))),
                    child: Text('${i + 1}. ${_steps[i]}', style: TextStyle(fontWeight: FontWeight.w700, color: i <= _step ? null : Theme.of(context).colorScheme.onSurfaceVariant)),
                  ),
                ),
            ]),
            if (_error != null) Notice(tone: Tone.danger, body: errorText(_error!)),
            if (_step == 0) ..._patientStep(),
            if (_step == 1 && clinic.isNotEmpty) ..._slotStep(cs, clinic),
            if (_step == 2 && clinic.isNotEmpty) ..._confirmStep(clinic),
          ]);
        },
      ),
    );
  }

  List<Widget> _patientStep() {
    final results = _q.length >= 2 ? ref.watch(patientSearchProvider(_q)) : null;
    return [
      Text('¿Para quién es la cita?', style: Theme.of(context).textTheme.titleLarge),
      SearchField(hint: 'Nombre, cédula, teléfono o código', onChanged: (v) => setState(() => _q = v)),
      if (results != null)
        AsyncBody(
          value: results,
          data: (r) {
            final items = (r['items'] as List).cast<Json>();
            if (items.isEmpty) return const EmptyState(title: 'No encontramos a nadie con eso', body: 'Revise cómo lo escribió o registre al paciente.');
            return Column(children: [
              for (final p in items)
                Card(
                  margin: const EdgeInsets.only(bottom: 8),
                  child: ListTile(
                    title: Text(p['fullName'], style: const TextStyle(fontWeight: FontWeight.w700)),
                    subtitle: Text('${p['age']} años · ${p['documentNumber'] ?? 'sin documento'} · ${phone(p['phone'])}'),
                    trailing: const Icon(Icons.chevron_right),
                    onTap: () => setState(() {
                      _patient = p;
                      _step = 1;
                    }),
                  ),
                ),
            ]);
          },
        )
      else
        Text('Escriba al menos 2 letras o números.', style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant)),
      OutlinedButton.icon(
        onPressed: () async {
          final created = await context.push<Json>('/pacientes/nuevo');
          if (created != null) {
            setState(() {
              _patient = created;
              _step = 1;
            });
          }
        },
        icon: const Icon(Icons.person_add_alt),
        label: const Text('Registrar paciente nuevo'),
      ),
    ];
  }

  List<Widget> _slotStep(List<Json> cs, Json clinic) {
    final av = ref.watch(availabilityProvider((clinic['id'], _date)));
    return [
      _PatientLine(patient: _patient!, onChange: () => setState(() => _step = 0)),
      if (cs.length > 1) ClinicChips(clinics: cs, selected: clinic['id'], onSelected: (id) => setState(() => _clinicId = id)),
      DayBar(date: _date, onChanged: (d) => setState(() => _date = d)),
      AsyncBody(
        value: av,
        onRetry: () => ref.invalidate(availabilityProvider((clinic['id'], _date))),
        data: (a) => SlotPicker(
          availability: a,
          selected: _slot,
          onSelect: (s) => setState(() {
            _slot = s;
            _step = 2;
          }),
        ),
      ),
    ];
  }

  List<Widget> _confirmStep(Json clinic) {
    final p = _patient!;
    final s = _slot!;
    // Frase para leerle al paciente por teléfono antes de confirmar.
    final sentence = '${p['fullName']}, su cita es el ${lowerFirst(dayLabel(_date))} a las ${s['label']}, con ${s['doctorName']}, en ${clinic['name']}.';
    return [
      SectionCard(title: 'Revise con el paciente', children: [
        Text(sentence, style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 14),
        TextField(controller: _reason, maxLength: 200, decoration: const InputDecoration(labelText: 'Motivo (opcional)', hintText: 'Ej. control, dolor de garganta')),
      ]),
      BusyButton(
        label: 'Confirmar cita',
        icon: Icons.check,
        expand: true,
        onPressed: () async {
          setState(() => _error = null);
          try {
            final a = await ref.read(apiProvider).post<Json>('/appointments', headers: {'Idempotency-Key': _key}, body: {
              'patientId': p['id'],
              'doctorId': s['doctorId'],
              'clinicId': clinic['id'],
              'startsAt': s['startsAt'],
              'reason': _reason.text.trim().isEmpty ? null : _reason.text.trim(),
              'waitlistEntryId': widget.preset?.waitlistEntryId,
            });
            if (!mounted) return;
            final contact = a['contactPhone'] as String?;
            showMessage(
              context,
              'Cita confirmada (${a['code']}): ${a['patient']['fullName']}, ${lowerFirst(dayLabel(localDate(a['startsAt'])))} a las ${time(a['startsAt'])}.',
              duration: const Duration(seconds: 15),
              action: contact == null ? null : SnackBarAction(label: 'WhatsApp', onPressed: () => openExternal(context, whatsappUri(contact, confirmationText(ref, a)))),
            );
            context.pop(a);
          } catch (e) {
            setState(() {
              _error = e;
              // El horario se ocupó o cambió: se vuelve a elegir con los horarios al día.
              if (e is ApiError && (e.code == 'SLOT_TAKEN' || e.code == 'OUTSIDE_SCHEDULE')) {
                ref.invalidate(availabilityProvider);
                _slot = null;
                _step = 1;
              }
            });
          }
        },
      ),
      OutlinedButton(onPressed: () => setState(() => _step = 1), child: const Text('Cambiar día u hora')),
    ];
  }
}

class _PatientLine extends StatelessWidget {
  const _PatientLine({required this.patient, required this.onChange});
  final Json patient;
  final VoidCallback onChange;
  @override
  Widget build(BuildContext context) => Card(
        child: ListTile(
          leading: const Icon(Icons.person),
          title: Text(patient['fullName'], style: const TextStyle(fontWeight: FontWeight.w700)),
          subtitle: Text('${patient['age']} años · ${phone(patient['phone'])}'),
          trailing: TextButton(onPressed: onChange, child: const Text('Cambiar')),
        ),
      );
}

/// Horas libres del día por médico (solo las libres; las que ya pasaron no aparecen).
class SlotPicker extends StatelessWidget {
  const SlotPicker({super.key, required this.availability, required this.selected, required this.onSelect});
  final Json availability;
  final Json? selected;
  final ValueChanged<Json> onSelect;

  @override
  Widget build(BuildContext context) {
    if (availability['closed'] != null) return EmptyState(icon: Icons.event_busy, title: 'Ese día no se atiende', body: availability['closed']);
    final byDoctor = <String, List<Json>>{};
    for (final s in (availability['slots'] as List).cast<Json>()) {
      byDoctor.putIfAbsent(s['doctorName'], () => []).add(s);
    }
    if (byDoctor.isEmpty) return const EmptyState(icon: Icons.event_busy, title: 'Sin médicos ese día', body: 'Elija otro día u otra clínica.');
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      for (final e in byDoctor.entries) ...[
        Row(children: [
          Expanded(child: Text(e.key, style: Theme.of(context).textTheme.titleMedium)),
          Text('${e.value.where((s) => s['available'] == true).length} libres', style: TextStyle(color: muted)),
        ]),
        const SizedBox(height: 8),
        if (e.value.any((s) => s['available'] == true))
          Wrap(spacing: 8, runSpacing: 8, children: [
            for (final s in e.value.where((s) => s['available'] == true))
              ChoiceChip(
                label: Text(s['label'], style: const TextStyle(fontSize: 16, fontFeatures: [FontFeature.tabularFigures()])),
                selected: selected?['startsAt'] == s['startsAt'] && selected?['doctorId'] == s['doctorId'],
                onSelected: (_) => onSelect(s),
              ),
          ])
        else
          Text('Todo ocupado este día. Puede ponerlo en la lista de espera.', style: TextStyle(color: muted)),
        const SizedBox(height: 16),
      ],
    ]);
  }
}
