import 'dart:io';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api.dart';
import '../../core/cie10.dart';
import '../../core/format.dart';
import '../../core/labels.dart';
import '../../widgets/shells.dart';
import '../../widgets/ui.dart';
import 'patient_pages.dart';

final medicalRecordProvider = FutureProvider.autoDispose.family<Json, String>((ref, id) => ref.watch(apiProvider).get<Json>('/patients/$id/medical-record'));

/// Ficha médica del paciente: antecedentes, consultas (con receta) y resultados.
/// Recepción no la ve (la API responde 403); el médico ve solo a sus pacientes.
class MedicalRecordPage extends ConsumerStatefulWidget {
  const MedicalRecordPage({super.key, required this.patientId, this.appointmentId});
  final String patientId;

  /// Cita desde la que se abrió: se ofrece registrar la consulta de esa cita.
  final String? appointmentId;
  @override
  ConsumerState<MedicalRecordPage> createState() => _MedicalRecordPageState();
}

class _MedicalRecordPageState extends ConsumerState<MedicalRecordPage> {
  bool _editHistory = false;
  Json? _editing; // consulta que se está corrigiendo
  late bool _writing = widget.appointmentId != null;

  void _refresh() => ref.invalidate(medicalRecordProvider(widget.patientId));

  @override
  Widget build(BuildContext context) {
    final rec = ref.watch(medicalRecordProvider(widget.patientId));
    final patient = ref.watch(patientProvider(widget.patientId)).valueOrNull;
    return StaffScaffold(
      title: 'Ficha médica',
      root: false,
      body: AsyncBody(
        value: rec,
        onRetry: _refresh,
        data: (r) {
          final h = r['history'] as Json;
          final consultations = (r['consultations'] as List).cast<Json>();
          final attachments = (r['attachments'] as List).cast<Json>();
          return PageList(onRefresh: () async => _refresh(), children: [
            if (patient != null) PageHeader(patient['fullName'], description: '${patient['age']} años · ficha ${patient['code']}'),
            if ((h['allergies'] as String?)?.isNotEmpty == true) Notice(tone: Tone.danger, title: 'Alergias', body: h['allergies']),
            if (_editHistory)
              _HistoryForm(patientId: widget.patientId, history: h, onDone: () {
                setState(() => _editHistory = false);
                _refresh();
              })
            else
              SectionCard(
                title: 'Antecedentes',
                trailing: r['canEditHistory'] == true ? TextButton.icon(onPressed: () => setState(() => _editHistory = true), icon: const Icon(Icons.edit_outlined), label: const Text('Editar')) : null,
                children: [
                  InfoRow('Tipo de sangre', h['bloodType'] ?? 'Sin registrar'),
                  InfoRow('Enfermedades', h['chronicConditions'] ?? '—'),
                  InfoRow('Medicinas', h['medications'] ?? '—'),
                  InfoRow('Cirugías', h['surgicalHistory'] ?? '—'),
                  InfoRow('Familiares', h['familyHistory'] ?? '—'),
                  InfoRow('Hábitos', h['habits'] ?? '—'),
                  if (h['notes'] != null) InfoRow('Notas', h['notes']),
                  if (h['updatedAt'] != null) Padding(padding: const EdgeInsets.only(top: 6), child: Text('Actualizado ${dateTime(h['updatedAt'])} por ${h['updatedBy'] ?? 'alguien'}', style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant, fontSize: 13))),
                ],
              ),
            if (r['canWriteConsultation'] == true && !_writing && _editing == null)
              FilledButton.icon(onPressed: () => setState(() => _writing = true), icon: const Icon(Icons.add), label: const Text('Registrar consulta')),
            if (_writing || _editing != null)
              _ConsultationForm(
                patientId: widget.patientId,
                appointmentId: _editing == null ? widget.appointmentId : null,
                consultation: _editing,
                onClose: () => setState(() {
                  _writing = false;
                  _editing = null;
                }),
                onSaved: () {
                  setState(() {
                    _writing = false;
                    _editing = null;
                  });
                  _refresh();
                },
              ),
            Semantics(header: true, child: Text('Consultas (${consultations.length})', style: Theme.of(context).textTheme.titleLarge)),
            if (consultations.isEmpty) const EmptyState(icon: Icons.assignment_outlined, title: 'Todavía no hay consultas registradas'),
            for (final c in consultations) _ConsultationCard(patientId: widget.patientId, c: c, onEdit: () => setState(() => _editing = c)),
            _Attachments(patientId: widget.patientId, items: attachments, consultations: consultations, canUpload: r['canWriteConsultation'] == true, onChanged: _refresh),
          ]);
        },
      ),
    );
  }
}

class _HistoryForm extends ConsumerStatefulWidget {
  const _HistoryForm({required this.patientId, required this.history, required this.onDone});
  final String patientId;
  final Json history;
  final VoidCallback onDone;
  @override
  ConsumerState<_HistoryForm> createState() => _HistoryFormState();
}

class _HistoryFormState extends ConsumerState<_HistoryForm> {
  static const _fields = [
    ('allergies', 'Alergias', 'Medicamentos, alimentos u otras; "Ninguna conocida" si no tiene'),
    ('chronicConditions', 'Enfermedades crónicas', 'Ej. hipertensión, diabetes'),
    ('medications', 'Medicinas que toma', null),
    ('surgicalHistory', 'Cirugías y hospitalizaciones', null),
    ('familyHistory', 'Antecedentes familiares', null),
    ('habits', 'Hábitos', 'Tabaco, alcohol, actividad física'),
    ('notes', 'Notas', null),
  ];
  late final _c = {for (final f in _fields) f.$1: TextEditingController(text: widget.history[f.$1] ?? '')};
  late String? _blood = widget.history['bloodType'];
  Object? _error;

  @override
  Widget build(BuildContext context) {
    return SectionCard(title: 'Antecedentes', trailing: TextButton(onPressed: widget.onDone, child: const Text('Cancelar')), children: [
      if (_error != null && _error is! ApiError) Notice(tone: Tone.danger, body: errorText(_error!)),
      Select<String?>(label: 'Tipo de sangre', value: _blood, items: {null: 'Sin registrar', for (final b in bloodTypes) b: b}, onChanged: (v) => setState(() => _blood = v)),
      for (final (key, label, hint) in _fields) ...[
        const SizedBox(height: 12),
        TextField(controller: _c[key], minLines: 1, maxLines: 5, decoration: InputDecoration(labelText: label, hintText: hint, errorText: fieldError(_error, key))),
      ],
      const SizedBox(height: 14),
      BusyButton(
        label: 'Guardar antecedentes',
        icon: Icons.save_outlined,
        onPressed: () async {
          setState(() => _error = null);
          try {
            await ref.read(apiProvider).put<Json>('/patients/${widget.patientId}/medical-record', body: {
              'bloodType': _blood,
              for (final f in _fields) f.$1: _c[f.$1]!.text.trim().isEmpty ? null : _c[f.$1]!.text.trim(),
            });
            if (context.mounted) showMessage(context, 'Antecedentes guardados.');
            widget.onDone();
          } catch (e) {
            setState(() => _error = e);
            if (context.mounted) showMessage(context, errorText(e), error: true);
          }
        },
      ),
    ]);
  }
}

class _ConsultationCard extends ConsumerWidget {
  const _ConsultationCard({required this.patientId, required this.c, required this.onEdit});
  final String patientId;
  final Json c;
  final VoidCallback onEdit;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    final rx = (c['prescription'] as List).cast<Json>();
    // Una consulta puede no venir de una cita (se registró aparte).
    final appt = c['appointment'] as Json?;
    final vitals = [
      if (c['weightKg'] != null) '${c['weightKg']} kg',
      if (c['heightCm'] != null) '${c['heightCm']} cm',
      if (c['bmi'] != null) 'IMC ${c['bmi']}',
      if (c['systolic'] != null) 'PA ${c['systolic']}/${c['diastolic'] ?? '—'}',
      if (c['heartRate'] != null) 'FC ${c['heartRate']}',
      if (c['temperatureC'] != null) '${c['temperatureC']} °C',
      if (c['oxygenSat'] != null) 'SpO₂ ${c['oxygenSat']}%',
    ];
    final dx = [c['diagnosisCode'], c['diagnosis'] ?? c['diagnosisCodeLabel']].whereType<String>().join(' · ');
    return SectionCard(
      title: longDateYear(appt?['startsAt'] ?? c['createdAt']),
      trailing: c['editable'] == true ? IconButton(tooltip: 'Corregir consulta', onPressed: onEdit, icon: const Icon(Icons.edit_outlined)) : null,
      children: [
        Text([c['doctor']['fullName'], appt?['clinic'], if (appt != null) 'cita ${appt['code']}'].whereType<String>().join(' · '), style: TextStyle(color: muted)),
        const SizedBox(height: 8),
        Text('Motivo: ${c['reason']}', style: const TextStyle(fontWeight: FontWeight.w600)),
        if (vitals.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 4), child: Text(vitals.join(' · '), style: const TextStyle(fontFeatures: [FontFeature.tabularFigures()]))),
        if (c['findings'] != null) Padding(padding: const EdgeInsets.only(top: 4), child: Text('Hallazgos: ${c['findings']}')),
        if (dx.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 4), child: Text('Diagnóstico: $dx')),
        if (c['plan'] != null) Padding(padding: const EdgeInsets.only(top: 4), child: Text('Plan: ${c['plan']}')),
        if (rx.isNotEmpty) ...[
          const SizedBox(height: 8),
          const Text('Receta', style: TextStyle(fontWeight: FontWeight.w700)),
          for (final m in rx) Text('• ${[m['medication'], m['dose'], m['frequency'], m['duration']].whereType<String>().join(' · ')}${m['instructions'] == null ? '' : ' (${m['instructions']})'}'),
          const SizedBox(height: 6),
          Align(
            alignment: Alignment.centerLeft,
            child: OutlinedButton.icon(
              onPressed: () => run(context, () => ref.read(apiProvider).openFile('/patients/$patientId/consultations/${c['id']}/receta.pdf', 'receta-${appt?['code'] ?? c['id']}.pdf')),
              icon: const Icon(Icons.picture_as_pdf_outlined),
              label: const Text('Receta en PDF'),
            ),
          ),
        ],
        Padding(padding: const EdgeInsets.only(top: 6), child: Text('Escribió ${c['author']} · ${dateTime(c['createdAt'])}', style: TextStyle(color: muted, fontSize: 13))),
      ],
    );
  }
}

class _ConsultationForm extends ConsumerStatefulWidget {
  const _ConsultationForm({required this.patientId, required this.appointmentId, required this.consultation, required this.onClose, required this.onSaved});
  final String patientId;
  final String? appointmentId;
  final Json? consultation;
  final VoidCallback onClose;
  final VoidCallback onSaved;
  @override
  ConsumerState<_ConsultationForm> createState() => _ConsultationFormState();
}

class _ConsultationFormState extends ConsumerState<_ConsultationForm> {
  static const _vitals = [
    ('weightKg', 'Peso (kg)'),
    ('heightCm', 'Talla (cm)'),
    ('systolic', 'Presión sistólica'),
    ('diastolic', 'Presión diastólica'),
    ('heartRate', 'Frecuencia cardiaca'),
    ('temperatureC', 'Temperatura (°C)'),
    ('oxygenSat', 'Saturación O₂ (%)'),
  ];
  static const _texts = [('reason', 'Motivo de consulta'), ('findings', 'Hallazgos del examen'), ('diagnosis', 'Diagnóstico (en palabras)'), ('plan', 'Plan e indicaciones')];
  late final _c = {
    for (final v in [..._vitals.map((e) => e.$1), ..._texts.map((e) => e.$1), 'diagnosisCode']) v: TextEditingController(text: widget.consultation?[v]?.toString() ?? ''),
  };
  late final List<Map<String, TextEditingController>> _rx = [
    for (final m in (widget.consultation?['prescription'] as List? ?? const []).cast<Json>()) _rxItem(m),
  ];
  List<(String, String)> _suggestions = [];
  Object? _error;

  Map<String, TextEditingController> _rxItem([Json? m]) => {for (final k in ['medication', 'dose', 'frequency', 'duration', 'instructions']) k: TextEditingController(text: m?[k] ?? '')};

  Object? _vital(String key) {
    final t = _c[key]!.text.trim();
    if (t.isEmpty) return null;
    return num.tryParse(t.replaceAll(',', '.')) ?? t;
  }

  String? _text(String key) => _c[key]!.text.trim().isEmpty ? null : _c[key]!.text.trim();

  @override
  Widget build(BuildContext context) {
    String? err(String f) => fieldError(_error, f);
    final code = normalizeCie10(_c['diagnosisCode']!.text);
    final codeLabel = cie10Label(code);
    return SectionCard(
      title: widget.consultation == null ? 'Nueva consulta' : 'Corregir consulta',
      trailing: TextButton(onPressed: widget.onClose, child: const Text('Cancelar')),
      children: [
        if (widget.consultation != null) Text('Se puede corregir durante 24 horas después de escribirla.', style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant)),
        if (_error != null) Padding(padding: const EdgeInsets.only(bottom: 8), child: Notice(tone: Tone.danger, body: errorText(_error!))),
        Text('Signos vitales', style: Theme.of(context).textTheme.titleSmall),
        const SizedBox(height: 8),
        LayoutBuilder(builder: (context, box) {
          final w = (box.maxWidth - 10) / 2;
          return Wrap(spacing: 10, runSpacing: 12, children: [
            for (final (key, label) in _vitals)
              SizedBox(width: w, child: TextField(controller: _c[key], keyboardType: const TextInputType.numberWithOptions(decimal: true), decoration: InputDecoration(labelText: label, errorText: err(key), errorMaxLines: 3))),
          ]);
        }),
        const SizedBox(height: 14),
        for (final (key, label) in _texts) ...[
          TextField(controller: _c[key], minLines: key == 'reason' ? 1 : 2, maxLines: 6, decoration: InputDecoration(labelText: label, errorText: err(key))),
          const SizedBox(height: 12),
          if (key == 'diagnosis') ...[
            TextField(
              controller: _c['diagnosisCode'],
              textCapitalization: TextCapitalization.characters,
              onChanged: (v) => setState(() => _suggestions = v.trim().length >= 2 ? searchCie10(v) : []),
              decoration: InputDecoration(
                labelText: 'Código CIE-10 (opcional)',
                hintText: 'Escriba el código o el nombre: "J06" o "faringitis"',
                errorText: err('diagnosisCode'),
                helperText: codeLabel ?? (code.isNotEmpty && cie10Pattern.hasMatch(code) ? 'Código válido, pero no está en la lista común: revíselo.' : null),
                helperMaxLines: 2,
              ),
            ),
            for (final (c, l) in _suggestions)
              ListTile(
                dense: true,
                contentPadding: EdgeInsets.zero,
                title: Text('$c · $l'),
                onTap: () => setState(() {
                  _c['diagnosisCode']!.text = c;
                  if (_c['diagnosis']!.text.trim().isEmpty) _c['diagnosis']!.text = l;
                  _suggestions = [];
                }),
              ),
            const SizedBox(height: 12),
          ],
        ],
        Row(children: [
          Expanded(child: Text('Receta (${_rx.length})', style: Theme.of(context).textTheme.titleSmall)),
          if (_rx.length < 15) TextButton.icon(onPressed: () => setState(() => _rx.add(_rxItem())), icon: const Icon(Icons.add), label: const Text('Medicamento')),
        ]),
        if (err('prescription') != null) Text(err('prescription')!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
        for (var i = 0; i < _rx.length; i++)
          Container(
            margin: const EdgeInsets.only(top: 8),
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(border: Border.all(color: Theme.of(context).colorScheme.outlineVariant), borderRadius: BorderRadius.circular(10)),
            child: Column(children: [
              Row(children: [
                Expanded(child: TextField(controller: _rx[i]['medication'], decoration: InputDecoration(labelText: 'Medicamento ${i + 1}', errorText: err('prescription.$i.medication')))),
                IconButton(tooltip: 'Quitar medicamento', onPressed: () => setState(() => _rx.removeAt(i)), icon: const Icon(Icons.delete_outline)),
              ]),
              const SizedBox(height: 8),
              Row(children: [
                Expanded(child: TextField(controller: _rx[i]['dose'], decoration: const InputDecoration(labelText: 'Dosis', hintText: '500 mg'))),
                const SizedBox(width: 8),
                Expanded(child: TextField(controller: _rx[i]['frequency'], decoration: const InputDecoration(labelText: 'Cada', hintText: '8 horas'))),
              ]),
              const SizedBox(height: 8),
              Row(children: [
                Expanded(child: TextField(controller: _rx[i]['duration'], decoration: const InputDecoration(labelText: 'Por', hintText: '5 días'))),
                const SizedBox(width: 8),
                Expanded(child: TextField(controller: _rx[i]['instructions'], decoration: const InputDecoration(labelText: 'Indicaciones', hintText: 'Con comida'))),
              ]),
            ]),
          ),
        const SizedBox(height: 16),
        BusyButton(
          label: 'Guardar consulta',
          icon: Icons.save_outlined,
          expand: true,
          onPressed: () async {
            setState(() => _error = null);
            final body = <String, Object?>{
              for (final (k, _) in _vitals) k: _vital(k),
              for (final (k, _) in _texts) k: _text(k),
              'diagnosisCode': _c['diagnosisCode']!.text.trim().isEmpty ? null : normalizeCie10(_c['diagnosisCode']!.text),
              'prescription': [
                for (final m in _rx.where((m) => m['medication']!.text.trim().isNotEmpty)) {for (final e in m.entries) e.key: e.value.text.trim().isEmpty ? null : e.value.text.trim()},
              ],
              if (widget.consultation == null) 'appointmentId': widget.appointmentId,
            };
            try {
              final api = ref.read(apiProvider);
              if (widget.consultation == null) {
                await api.post<Json>('/patients/${widget.patientId}/consultations', body: body);
              } else {
                await api.put<Json>('/patients/${widget.patientId}/consultations/${widget.consultation!['id']}', body: body);
              }
              if (context.mounted) showMessage(context, 'Consulta guardada.');
              widget.onSaved();
            } catch (e) {
              setState(() => _error = e);
            }
          },
        ),
      ],
    );
  }
}

class _Attachments extends ConsumerWidget {
  const _Attachments({required this.patientId, required this.items, required this.consultations, required this.canUpload, required this.onChanged});
  final String patientId;
  final List<Json> items;
  final List<Json> consultations;
  final bool canUpload;
  final VoidCallback onChanged;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final api = ref.read(apiProvider);
    return SectionCard(
      title: 'Resultados y documentos',
      trailing: canUpload ? TextButton.icon(onPressed: () => _upload(context, ref), icon: const Icon(Icons.upload_file), label: const Text('Subir')) : null,
      children: [
        Text('PDF, JPG, PNG o WEBP de hasta 10 MB. Se guardan dentro del respaldo diario.', style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant, fontSize: 13)),
        if (items.isEmpty) const Padding(padding: EdgeInsets.only(top: 10), child: Text('Todavía no hay documentos.')),
        for (final f in items)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: Icon(f['mime'] == 'application/pdf' ? Icons.picture_as_pdf_outlined : Icons.image_outlined),
                title: Text(f['description'] ?? f['filename']),
                subtitle: Text('${shortDate(f['createdAt'])} · ${bytes(f['bytes'])} · ${f['uploadedBy']}'),
                onTap: () => run(context, () => api.openFile('/patients/$patientId/attachments/${f['id']}', f['filename'])),
                trailing: const Icon(Icons.open_in_new),
              ),
              Wrap(spacing: 8, crossAxisAlignment: WrapCrossAlignment.center, children: [
                FilterChip(
                  label: Text(f['sharedWithPatient'] == true ? 'El paciente lo ve' : 'Solo personal'),
                  selected: f['sharedWithPatient'] == true,
                  onSelected: canUpload
                      ? (v) async {
                          final r = await run(context, () => api.patch<Json>('/patients/$patientId/attachments/${f['id']}', body: {'sharedWithPatient': v}));
                          if (r != null) onChanged();
                        }
                      : null,
                ),
                if (f['deletable'] == true)
                  TextButton.icon(
                    onPressed: () async {
                      if (!await confirm(context, title: '¿Quitar este documento?', body: f['filename'], ok: 'Quitar', danger: true)) return;
                      if (!context.mounted) return;
                      final r = await run(context, () => api.delete<Json>('/patients/$patientId/attachments/${f['id']}'), success: 'Documento quitado.');
                      if (r != null) onChanged();
                    },
                    icon: const Icon(Icons.delete_outline),
                    label: const Text('Quitar'),
                  ),
              ]),
            ]),
          ),
      ],
    );
  }

  Future<void> _upload(BuildContext context, WidgetRef ref) async {
    final picked = await FilePicker.pickFile(type: FileType.custom, allowedExtensions: ['pdf', 'jpg', 'jpeg', 'png', 'webp']);
    final path = picked?.path;
    if (path == null || !context.mounted) return;
    final desc = TextEditingController();
    var shared = false;
    String? consultationId = consultations.isEmpty ? null : consultations.first['id'];
    final ok = await showDialog<bool>(
      context: context,
      builder: (c) => StatefulBuilder(
        builder: (c, set) => AlertDialog(
          title: const Text('Subir documento'),
          content: SingleChildScrollView(
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              Text(path.split('/').last, style: const TextStyle(fontWeight: FontWeight.w600)),
              const SizedBox(height: 12),
              TextField(controller: desc, decoration: const InputDecoration(labelText: 'Descripción', hintText: 'Ej. Biometría hemática')),
              if (consultations.isNotEmpty) ...[
                const SizedBox(height: 12),
                Select<String?>(
                  label: 'De la consulta',
                  value: consultationId,
                  items: {null: 'Ninguna', for (final cn in consultations) cn['id'] as String: shortDate((cn['appointment'] as Json?)?['startsAt'] ?? cn['createdAt'])},
                  onChanged: (v) => set(() => consultationId = v),
                ),
              ],
              SwitchListTile(contentPadding: EdgeInsets.zero, title: const Text('El paciente lo puede ver en su portal'), value: shared, onChanged: (v) => set(() => shared = v)),
            ]),
          ),
          actions: [TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Cancelar')), FilledButton(onPressed: () => Navigator.pop(c, true), child: const Text('Subir'))],
        ),
      ),
    );
    if (ok != true || !context.mounted) return;
    final r = await run(
      context,
      () => ref.read(apiProvider).upload<Json>('/patients/$patientId/attachments', File(path), fields: {
        if (desc.text.trim().isNotEmpty) 'description': desc.text.trim(),
        'sharedWithPatient': '$shared',
        'consultationId': ?consultationId,
      }),
      success: 'Documento subido.',
    );
    if (r != null) onChanged();
  }
}
