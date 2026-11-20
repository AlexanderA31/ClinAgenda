import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api.dart';
import '../../core/format.dart';
import '../../core/labels.dart';
import '../../core/session.dart';
import '../../widgets/shells.dart';
import '../../widgets/ui.dart';
import '../auth/auth_pages.dart';
import 'appointment_page.dart';
import 'booking_page.dart';
import 'common.dart';

final patientsProvider = FutureProvider.autoDispose.family<Json, (String, int)>((ref, k) {
  final (q, page) = k;
  return ref.watch(apiProvider).get<Json>('/patients', query: {'q': q, 'page': page, 'pageSize': 25});
});

final patientProvider = FutureProvider.autoDispose.family<Json, String>((ref, id) => ref.watch(apiProvider).get<Json>('/patients/$id'));

final patientAppointmentsProvider = FutureProvider.autoDispose.family<List<Json>, String>((ref, id) async {
  final r = await ref.watch(apiProvider).get<Json>('/appointments', query: {'patientId': id, 'pageSize': 100, 'sortBy': 'startsAt', 'sortDir': 'desc'});
  return (r['items'] as List).cast<Json>();
});

class PatientsPage extends ConsumerStatefulWidget {
  const PatientsPage({super.key});
  @override
  ConsumerState<PatientsPage> createState() => _PatientsPageState();
}

class _PatientsPageState extends ConsumerState<PatientsPage> {
  String _q = '';
  int _page = 1;

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(staffProvider);
    final key = (_q, _page);
    final res = ref.watch(patientsProvider(key));
    return StaffScaffold(
      title: 'Pacientes',
      fab: user.can('pacientes.editar')
          ? FloatingActionButton.extended(
              onPressed: () async {
                final p = await context.push<Json>('/pacientes/nuevo');
                if (p != null && context.mounted) context.push('/pacientes/${p['id']}');
              },
              icon: const Icon(Icons.person_add_alt),
              label: const Text('Registrar'),
            )
          : null,
      body: PageList(onRefresh: () async => ref.invalidate(patientsProvider(key)), children: [
        const PageHeader('Pacientes', description: 'Busque por nombre (con o sin tildes), cédula, teléfono o código. Antes de registrar a alguien, búsquelo: así no se duplica.'),
        SearchField(hint: 'Ej. maria lopez, 1712345675, 0991234567', onChanged: (v) => setState(() {
              _q = v;
              _page = 1;
            })),
        AsyncBody(
          value: res,
          onRetry: () => ref.invalidate(patientsProvider(key)),
          data: (r) {
            final items = (r['items'] as List).cast<Json>();
            if (items.isEmpty) return EmptyState(title: _q.isEmpty ? 'Todavía no hay pacientes' : 'No encontramos a nadie con "$_q"', body: 'Revise cómo lo escribió o registre al paciente.');
            return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              for (final p in items)
                Card(
                  margin: const EdgeInsets.only(bottom: 8),
                  child: ListTile(
                    title: Text(p['fullName'], style: const TextStyle(fontWeight: FontWeight.w700)),
                    subtitle: Text('${p['age']} años · ${p['documentNumber'] ?? 'sin documento'} · ${phone(p['phone'])}'),
                    trailing: const Icon(Icons.chevron_right),
                    onTap: () => context.push('/pacientes/${p['id']}'),
                  ),
                ),
              Pager(page: r['page'], pageCount: r['pageCount'], onPage: (p) => setState(() => _page = p)),
            ]);
          },
        ),
      ]),
    );
  }
}

class PatientDetailPage extends ConsumerWidget {
  const PatientDetailPage({super.key, required this.id});
  final String id;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(staffProvider);
    final p = ref.watch(patientProvider(id));
    final appts = ref.watch(patientAppointmentsProvider(id));
    void refresh() {
      ref.invalidate(patientProvider(id));
      ref.invalidate(patientAppointmentsProvider(id));
    }

    return StaffScaffold(
      title: 'Paciente',
      root: false,
      actions: [
        if (user.can('pacientes.editar'))
          IconButton(
            tooltip: 'Corregir datos',
            icon: const Icon(Icons.edit_outlined),
            onPressed: () async {
              await context.push('/pacientes/$id/editar');
              refresh();
            },
          ),
      ],
      body: AsyncBody(
        value: p,
        onRetry: refresh,
        data: (pt) {
          final guardian = pt['guardian'] as Json?;
          return PageList(onRefresh: () async => refresh(), children: [
            PageHeader(pt['fullName'], description: 'Ficha ${pt['code']}'),
            if (pt['mergedIntoId'] != null) const Notice(tone: Tone.warn, body: 'Este registro se unió a otro paciente por estar duplicado.'),
            Wrap(spacing: 8, runSpacing: 8, children: [
              if (user.can('citas.agendar'))
                FilledButton.icon(
                  onPressed: () async {
                    await context.push('/nueva-cita', extra: BookingPreset(patient: pt));
                    ref.invalidate(patientAppointmentsProvider(id));
                  },
                  icon: const Icon(Icons.add),
                  label: const Text('Nueva cita'),
                ),
              if (user.role != 'RECEPCION') OutlinedButton.icon(onPressed: () => context.push('/pacientes/$id/ficha'), icon: const Icon(Icons.assignment_outlined), label: const Text('Ficha médica')),
              if (pt['phone'] != null) OutlinedButton.icon(onPressed: () => openExternal(context, telUri(pt['phone'])), icon: const Icon(Icons.call_outlined), label: const Text('Llamar')),
            ]),
            SectionCard(title: 'Datos', children: [
              InfoRow('Edad', '${pt['age']} años${pt['birthDateEstimated'] == true ? ' (aprox.)' : ''}'),
              InfoRow('Nacimiento', shortDate('${pt['birthDate']}T17:00:00Z')),
              InfoRow(documentTypeLabels[pt['documentType']] ?? 'Documento', pt['documentNumber'] ?? (pt['noDocumentReason'] ?? '—')),
              if (pt['sex'] != null) InfoRow('Sexo', sexLabels[pt['sex']] ?? pt['sex']),
              InfoRow('Teléfono', phone(pt['phone']), mono: true),
              if (pt['email'] != null) InfoRow('Correo', pt['email']),
              if (pt['address'] != null) InfoRow('Dirección', pt['address']),
              if (pt['contactNote'] != null) InfoRow('Cómo avisarle', pt['contactNote']),
              if (guardian != null) InfoRow('Representante', '${guardian['fullName']} (${guardian['relationship']})${guardian['phone'] == null ? '' : ' · ${phone(guardian['phone'])}'}'),
            ]),
            Semantics(header: true, child: Text('Citas', style: Theme.of(context).textTheme.titleLarge)),
            AsyncBody(
              value: appts,
              onRetry: () => ref.invalidate(patientAppointmentsProvider(id)),
              data: (list) => list.isEmpty
                  ? const EmptyState(title: 'Todavía no tiene citas')
                  : Column(children: [
                      for (final a in list)
                        Padding(
                          padding: const EdgeInsets.only(bottom: 8),
                          child: AppointmentTile(appt: a, showDate: true, showPatient: false, onTap: () async {
                            await context.push('/cita/${a['id']}');
                            ref.invalidate(patientAppointmentsProvider(id));
                          }),
                        ),
                    ]),
            ),
          ]);
        },
      ),
    );
  }
}

/// Registrar o corregir un paciente. Al registrar devuelve el paciente creado (`context.pop(paciente)`).
class PatientFormPage extends ConsumerStatefulWidget {
  const PatientFormPage({super.key, this.id});
  final String? id;
  @override
  ConsumerState<PatientFormPage> createState() => _PatientFormPageState();
}

class _PatientFormPageState extends ConsumerState<PatientFormPage> {
  final _first = TextEditingController();
  final _last = TextEditingController();
  final _doc = TextEditingController();
  final _noDoc = TextEditingController();
  final _phone = TextEditingController();
  final _email = TextEditingController();
  final _address = TextEditingController();
  final _contact = TextEditingController();
  final _gName = TextEditingController();
  final _gRel = TextEditingController();
  final _gPhone = TextEditingController();
  String? _birth;
  bool _estimated = false;
  String? _sex;
  String _docType = 'CEDULA';
  bool _hasGuardian = false;
  bool _notDuplicate = false;
  bool _loaded = false;
  Object? _error;
  List<Json> _candidates = [];
  Timer? _dupTimer;

  bool get _editing => widget.id != null;

  int? get _age {
    if (_birth == null) return null;
    final b = dayToDate(_birth!);
    final t = dayToDate(todayIso());
    var a = t.year - b.year;
    if (t.month < b.month || (t.month == b.month && t.day < b.day)) a--;
    return a;
  }

  void _load(Json p) {
    _first.text = p['firstNames'];
    _last.text = p['lastNames'];
    _birth = p['birthDate'];
    _estimated = p['birthDateEstimated'] == true;
    _sex = p['sex'];
    _docType = p['documentType'];
    _doc.text = p['documentNumber'] ?? '';
    _noDoc.text = p['noDocumentReason'] ?? '';
    _phone.text = p['phone'] == null ? '' : phone(p['phone']);
    _email.text = p['email'] ?? '';
    _address.text = p['address'] ?? '';
    _contact.text = p['contactNote'] ?? '';
    final g = p['guardian'] as Json?;
    _hasGuardian = g != null;
    _gName.text = g?['fullName'] ?? '';
    _gRel.text = g?['relationship'] ?? '';
    _gPhone.text = g?['phone'] == null ? '' : phone(g!['phone']);
    _notDuplicate = true;
    _loaded = true;
  }

  /// Mientras escribe, busca pacientes parecidos para evitar duplicados.
  void _checkDuplicates() {
    if (_editing) return;
    _dupTimer?.cancel();
    _dupTimer = Timer(const Duration(milliseconds: 600), () async {
      if (_first.text.trim().length < 2 || _last.text.trim().length < 2) return;
      try {
        final r = await ref.read(apiProvider).post<List>('/patients/duplicates', body: {
          'firstNames': _first.text.trim(),
          'lastNames': _last.text.trim(),
          'birthDate': _birth,
          'documentNumber': _doc.text.trim().isEmpty ? null : _doc.text.trim(),
          'phone': _phone.text.trim().isEmpty ? null : _phone.text.trim(),
        });
        if (mounted) setState(() => _candidates = r.cast<Json>().where((c) => (c['score'] as num) >= 0.45).toList());
      } catch (_) {}
    });
  }

  @override
  void dispose() {
    _dupTimer?.cancel();
    super.dispose();
  }

  Json _payload() {
    String? t(TextEditingController c) => c.text.trim().isEmpty ? null : c.text.trim();
    final minor = (_age ?? 99) < 18;
    return {
      'firstNames': _first.text.trim(),
      'lastNames': _last.text.trim(),
      'birthDate': _birth ?? '',
      'birthDateEstimated': _estimated,
      'sex': _sex,
      'documentType': _docType,
      'documentNumber': _docType == 'SIN_DOCUMENTO' ? null : t(_doc),
      'noDocumentReason': _docType == 'SIN_DOCUMENTO' ? t(_noDoc) : null,
      'phone': t(_phone),
      'email': t(_email),
      'address': t(_address),
      'contactNote': t(_contact),
      'guardian': (_hasGuardian || minor) ? {'fullName': _gName.text.trim(), 'relationship': _gRel.text.trim(), 'phone': t(_gPhone)} : null,
      'confirmNotDuplicate': _notDuplicate,
    };
  }

  @override
  Widget build(BuildContext context) {
    if (_editing && !_loaded) {
      final p = ref.watch(patientProvider(widget.id!));
      return StaffScaffold(
        title: 'Corregir datos',
        root: false,
        body: AsyncBody(
          value: p,
          onRetry: () => ref.invalidate(patientProvider(widget.id!)),
          data: (pt) {
            WidgetsBinding.instance.addPostFrameCallback((_) => setState(() => _load(pt)));
            return const SizedBox.shrink();
          },
        ),
      );
    }
    String? err(String f) => fieldError(_error, f);
    final minor = (_age ?? 99) < 18;
    final showGuardian = minor || _hasGuardian;
    return StaffScaffold(
      title: _editing ? 'Corregir datos' : 'Registrar paciente',
      root: false,
      body: PageList(children: [
        if (_error != null) Notice(tone: Tone.danger, title: 'No se guardó todavía', body: errorText(_error!)),
        if (_candidates.isNotEmpty)
          Notice(
            tone: Tone.warn,
            title: '¿Es alguno de estos pacientes? Ya están registrados:',
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              for (final c in _candidates.take(4))
                Card(
                  margin: const EdgeInsets.only(top: 6),
                  child: ListTile(
                    title: Text('${c['patient']['fullName']} · ${c['patient']['code']}', style: const TextStyle(fontWeight: FontWeight.w700)),
                    subtitle: Text('${c['patient']['age']} años · ${c['patient']['documentNumber'] ?? 'sin documento'} · ${phone(c['patient']['phone'])}\n${(c['reasons'] as List).join(' · ')}'),
                    isThreeLine: true,
                    trailing: TextButton(onPressed: () => context.pop(c['patient'] as Json), child: const Text('Es este')),
                  ),
                ),
              CheckboxListTile(
                contentPadding: EdgeInsets.zero,
                controlAffinity: ListTileControlAffinity.leading,
                value: _notDuplicate,
                onChanged: (v) => setState(() => _notDuplicate = v == true),
                title: const Text('No es ninguno: es una persona distinta', style: TextStyle(fontWeight: FontWeight.w700)),
              ),
            ]),
          ),
        TextField(controller: _first, textCapitalization: TextCapitalization.words, onChanged: (_) => _checkDuplicates(), decoration: InputDecoration(labelText: 'Nombres', errorText: err('firstNames'))),
        TextField(controller: _last, textCapitalization: TextCapitalization.words, onChanged: (_) => _checkDuplicates(), decoration: InputDecoration(labelText: 'Apellidos', errorText: err('lastNames'))),
        DateField(
          label: 'Fecha de nacimiento',
          value: _birth,
          firstYear: 1900,
          lastDate: DateTime.now(),
          error: err('birthDate'),
          onChanged: (v) {
            setState(() => _birth = v);
            _checkDuplicates();
          },
        ),
        CheckboxListTile(
          contentPadding: EdgeInsets.zero,
          controlAffinity: ListTileControlAffinity.leading,
          value: _estimated,
          onChanged: (v) => setState(() => _estimated = v == true),
          title: const Text('Es una fecha aproximada (no sabe la exacta)'),
        ),
        Select<String>(label: 'Tipo de documento', value: _docType, items: documentTypeLabels, onChanged: (v) => setState(() => _docType = v ?? 'CEDULA')),
        if (_docType == 'SIN_DOCUMENTO')
          TextField(controller: _noDoc, decoration: InputDecoration(labelText: '¿Por qué no tiene?', hintText: 'Ej. Recién nacido, aún sin cédula', errorText: err('noDocumentReason')))
        else
          TextField(
            controller: _doc,
            keyboardType: _docType == 'CEDULA' ? TextInputType.number : TextInputType.text,
            onChanged: (_) => _checkDuplicates(),
            decoration: InputDecoration(labelText: _docType == 'CEDULA' ? 'Número de cédula' : 'Número de pasaporte', errorText: err('documentNumber')),
          ),
        Select<String?>(label: 'Sexo (opcional)', value: _sex, items: {null: 'Sin indicar', ...sexLabels}, onChanged: (v) => setState(() => _sex = v)),
        TextField(controller: _phone, keyboardType: TextInputType.phone, onChanged: (_) => _checkDuplicates(), decoration: InputDecoration(labelText: 'Teléfono o celular (opcional)', hintText: '099 123 4567', errorText: err('phone'))),
        TextField(controller: _email, keyboardType: TextInputType.emailAddress, decoration: InputDecoration(labelText: 'Correo (opcional)', errorText: err('email'))),
        TextField(controller: _address, decoration: InputDecoration(labelText: 'Dirección (opcional)', errorText: err('address'))),
        if (_phone.text.trim().isEmpty && _email.text.trim().isEmpty)
          TextField(controller: _contact, maxLines: 2, decoration: InputDecoration(labelText: 'Si no tiene teléfono ni correo: ¿cómo le avisamos?', hintText: 'Ej. Llamar a su hija Carmen, 098…', errorText: err('contactNote'))),
        Semantics(header: true, child: Text('Representante', style: Theme.of(context).textTheme.titleMedium)),
        if (minor)
          const Text('Es menor de edad: indique quién es su representante.')
        else
          CheckboxListTile(
            contentPadding: EdgeInsets.zero,
            controlAffinity: ListTileControlAffinity.leading,
            value: _hasGuardian,
            onChanged: (v) => setState(() => _hasGuardian = v == true),
            title: const Text('Viene con un familiar o cuidador responsable'),
          ),
        if (showGuardian) ...[
          TextField(controller: _gName, textCapitalization: TextCapitalization.words, decoration: InputDecoration(labelText: 'Nombre del representante', errorText: err('guardian.fullName') ?? err('guardian'))),
          TextField(controller: _gRel, decoration: InputDecoration(labelText: 'Parentesco', hintText: 'Madre, padre, hijo…', errorText: err('guardian.relationship'))),
          TextField(controller: _gPhone, keyboardType: TextInputType.phone, decoration: InputDecoration(labelText: 'Teléfono del representante', errorText: err('guardian.phone'))),
        ],
        BusyButton(
          label: _editing ? 'Guardar cambios' : 'Registrar paciente',
          icon: Icons.save_outlined,
          expand: true,
          onPressed: () async {
            setState(() => _error = null);
            try {
              final api = ref.read(apiProvider);
              final p = _editing ? await api.put<Json>('/patients/${widget.id}', body: _payload()) : await api.post<Json>('/patients', body: _payload());
              if (!context.mounted) return;
              ref.invalidate(patientsProvider);
              if (_editing) ref.invalidate(patientProvider(widget.id!));
              showMessage(context, _editing ? 'Datos del paciente actualizados.' : 'Paciente registrado: ${p['fullName']} (${p['code']}).');
              context.pop(p);
            } catch (e) {
              setState(() {
                _error = e;
                final details = e is ApiError ? e.details : null;
                if (e is ApiError && e.code == 'POSSIBLE_DUPLICATE' && details is Map && details['candidates'] is List) {
                  _candidates = (details['candidates'] as List).cast<Json>();
                }
              });
            }
          },
        ),
      ]),
    );
  }
}
