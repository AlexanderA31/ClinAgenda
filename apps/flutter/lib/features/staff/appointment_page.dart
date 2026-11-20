import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api.dart';
import '../../core/data.dart';
import '../../core/format.dart';
import '../../core/labels.dart';
import '../../core/session.dart';
import '../../widgets/shells.dart';
import '../../widgets/ui.dart';
import 'booking_page.dart';
import 'common.dart';

final appointmentProvider = FutureProvider.autoDispose.family<Json, String>((ref, id) => ref.watch(apiProvider).get<Json>('/appointments/$id'));
final appointmentEventsProvider = FutureProvider.autoDispose.family<List<Json>, String>((ref, id) async => (await ref.watch(apiProvider).get<List>('/appointments/$id/events')).cast<Json>());

class AppointmentPage extends ConsumerStatefulWidget {
  const AppointmentPage({super.key, required this.id});
  final String id;
  @override
  ConsumerState<AppointmentPage> createState() => _AppointmentPageState();
}

enum _Mode { view, cancel, reschedule }

class _AppointmentPageState extends ConsumerState<AppointmentPage> {
  _Mode _mode = _Mode.view;

  void _refresh() {
    ref.invalidate(appointmentProvider(widget.id));
    ref.invalidate(appointmentEventsProvider(widget.id));
  }

  Future<void> _restore() async {
    final r = await run(context, () => ref.read(apiProvider).post<Json>('/appointments/${widget.id}/restore'), success: 'Listo: la cita volvió a quedar agendada.');
    if (r != null) _refresh();
  }

  @override
  Widget build(BuildContext context) {
    final appt = ref.watch(appointmentProvider(widget.id));
    return StaffScaffold(
      title: 'Cita',
      root: false,
      body: AsyncBody(
        value: appt,
        onRetry: _refresh,
        data: (a) => _body(a),
      ),
    );
  }

  Widget _body(Json a) {
    final user = ref.watch(staffProvider);
    final api = ref.read(apiProvider);
    final starts = parseIso(a['startsAt']);
    final now = DateTime.now();
    final isFuture = starts.isAfter(now);
    final status = a['status'] as String;
    final canBook = user.can('citas.agendar');
    final canMark = status == 'SCHEDULED' && user.can('citas.estado') && !starts.isAfter(now.add(const Duration(minutes: 15)));
    final canNote = user.can('citas.notas') && (user.role == 'ADMIN' || (user.role == 'MEDICO' && user.doctorId == a['doctor']['id']));
    final canConsult = user.can('fichas.editar') && user.doctorId == a['doctor']['id'] && ['SCHEDULED', 'ATTENDED', 'NO_SHOW'].contains(status) && !starts.isAfter(now.add(const Duration(hours: 1)));
    final events = ref.watch(appointmentEventsProvider(widget.id));
    final patient = a['patient'] as Json;

    return PageList(onRefresh: () async => _refresh(), children: [
      Wrap(spacing: 8, crossAxisAlignment: WrapCrossAlignment.center, children: [StatusBadge(status), Text(a['code'], style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant))]),
      Text('${longDate(a['startsAt'])}, ${time(a['startsAt'])}', style: Theme.of(context).textTheme.headlineSmall),
      SectionCard(children: [
        InkWell(
          onTap: () => context.push('/pacientes/${patient['id']}'),
          child: InfoRow('Paciente', '${patient['fullName']} (${patient['age']} años) ›'),
        ),
        InfoRow('Teléfono', phone(patient['phone']), mono: true),
        InfoRow('Médico', '${a['doctor']['fullName']} · ${a['doctor']['specialty']}'),
        InfoRow('Clínica', a['clinic']['name']),
        if (a['reason'] != null) InfoRow('Motivo', a['reason']),
        if (status == 'CANCELLED') InfoRow('Cancelada', '${cancelReasonLabels[a['cancelReason']] ?? ''}${a['cancelNote'] == null ? '' : ' — ${a['cancelNote']}'}\n${a['cancelledBy'] ?? 'Alguien'} · ${a['cancelledAt'] == null ? '' : dateTime(a['cancelledAt'])}'),
        if (patient['phone'] != null) ...[
          const SizedBox(height: 8),
          Wrap(spacing: 8, children: [
            OutlinedButton.icon(onPressed: () => openExternal(context, telUri(patient['phone'])), icon: const Icon(Icons.call_outlined), label: const Text('Llamar')),
          ]),
        ],
      ]),
      if (status == 'REQUESTED' && canBook) _RequestActions(appt: a, onDone: _refresh),
      if (_mode == _Mode.view)
        Wrap(spacing: 8, runSpacing: 8, children: [
          if ((status == 'SCHEDULED' || status == 'REQUESTED') && isFuture && canBook) ...[
            OutlinedButton.icon(onPressed: () => setState(() => _mode = _Mode.reschedule), icon: const Icon(Icons.edit_calendar), label: const Text('Cambiar día u hora')),
            FilledButton.icon(
              style: FilledButton.styleFrom(backgroundColor: Theme.of(context).colorScheme.error, foregroundColor: Theme.of(context).colorScheme.onError),
              onPressed: () => setState(() => _mode = _Mode.cancel),
              icon: const Icon(Icons.cancel_outlined),
              label: const Text('Cancelar cita'),
            ),
          ],
          if (canMark) ...[
            BusyButton(label: 'Fue atendido', icon: Icons.check_circle_outline, onPressed: () => _status('ATTENDED')),
            BusyButton(label: 'No vino', icon: Icons.person_off_outlined, outlined: true, onPressed: () => _status('NO_SHOW')),
          ],
          if (status == 'CANCELLED' && a['canUndoCancel'] == true && canBook) BusyButton(label: 'Deshacer cancelación', icon: Icons.undo, onPressed: _restore),
        ]),
      if (_mode == _Mode.cancel) _CancelForm(appt: a, onClose: () => setState(() => _mode = _Mode.view), onDone: (r) => _cancelled(r)),
      if (_mode == _Mode.reschedule) _RescheduleForm(appt: a, onClose: () => setState(() => _mode = _Mode.view), onDone: (n) {
            setState(() => _mode = _Mode.view);
            _refresh();
            showMessage(context, 'Cita cambiada al ${lowerFirst(longDate(n['startsAt']))} a las ${time(n['startsAt'])}.');
          }),
      if (status == 'SCHEDULED' && isFuture && user.can('lista_espera.gestionar')) _NotifyPatient(appt: a, onChanged: _refresh),
      if (user.role != 'RECEPCION')
        (canConsult ? FilledButton.icon : OutlinedButton.icon)(
          onPressed: () => context.push('/pacientes/${patient['id']}/ficha${canConsult ? '?consulta=${a['id']}' : ''}'),
          icon: const Icon(Icons.assignment_outlined),
          label: Text(canConsult ? 'Registrar consulta en la ficha' : 'Ver ficha médica'),
        ),
      if (canNote) _ClinicalNote(appt: a, onSaved: _refresh),
      OutlinedButton.icon(
        onPressed: () => run(context, () => api.openFile('/appointments/${a['id']}/comprobante.pdf', 'comprobante-${a['code']}.pdf')),
        icon: const Icon(Icons.picture_as_pdf_outlined),
        label: const Text('Comprobante en PDF (para imprimir o enviar)'),
      ),
      SectionCard(title: 'Historial de esta cita', children: [
        AsyncBody(
          value: events,
          data: (list) => Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            for (final e in list)
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(e['summary'], style: const TextStyle(fontWeight: FontWeight.w600)),
                  Text('${dateTime(e['at'])} · ${e['by'] ?? 'Sistema'}', style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant, fontSize: 13)),
                ]),
              ),
          ]),
        ),
      ]),
    ]);
  }

  Future<void> _status(String s) async {
    final r = await run(context, () => ref.read(apiProvider).patch<Json>('/appointments/${widget.id}/status', body: {'status': s}), success: s == 'ATTENDED' ? 'Marcada como atendida.' : 'Marcada como "no asistió".');
    if (r != null) _refresh();
  }

  void _cancelled(Json r) {
    setState(() => _mode = _Mode.view);
    _refresh();
    final already = r['alreadyCancelled'] == true;
    final matches = r['waitlistMatches'] as int? ?? 0;
    showMessage(
      context,
      already ? 'Esta cita ya estaba cancelada; no se hizo ningún cambio.' : 'Cita cancelada. El horario quedó libre.${matches > 0 && ref.read(staffProvider).can('lista_espera.gestionar') ? ' Hay $matches paciente(s) en lista de espera para esta clínica.' : ''}',
      duration: const Duration(seconds: 12),
      action: already ? null : SnackBarAction(label: 'Deshacer', onPressed: _restore),
    );
  }
}

class _RequestActions extends ConsumerStatefulWidget {
  const _RequestActions({required this.appt, required this.onDone});
  final Json appt;
  final VoidCallback onDone;
  @override
  ConsumerState<_RequestActions> createState() => _RequestActionsState();
}

class _RequestActionsState extends ConsumerState<_RequestActions> {
  bool _rejecting = false;
  final _note = TextEditingController();

  @override
  Widget build(BuildContext context) {
    final api = ref.read(apiProvider);
    final id = widget.appt['id'];
    return Notice(
      tone: Tone.warn,
      title: 'El paciente pidió esta cita en línea',
      body: 'El horario ya está reservado. Acéptela para confirmarla, o recházela con una nota para el paciente.',
      child: _rejecting
          ? Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              const SizedBox(height: 8),
              TextField(controller: _note, maxLines: 2, decoration: const InputDecoration(labelText: 'Nota para el paciente (opcional)', hintText: 'Ej. el médico no atiende ese día; llame para otra hora')),
              const SizedBox(height: 8),
              Wrap(spacing: 8, children: [
                BusyButton(
                  label: 'Rechazar solicitud',
                  danger: true,
                  onPressed: () async {
                    final r = await run(context, () => api.post<Json>('/appointments/$id/reject', body: {'note': _note.text.trim().isEmpty ? null : _note.text.trim()}), success: 'Solicitud rechazada. El paciente lo verá en su portal.');
                    if (r != null) widget.onDone();
                  },
                ),
                TextButton(onPressed: () => setState(() => _rejecting = false), child: const Text('Volver')),
              ]),
            ])
          : Wrap(spacing: 8, runSpacing: 8, children: [
              BusyButton(
                label: 'Aceptar',
                icon: Icons.check,
                onPressed: () async {
                  final r = await run(context, () => api.post<Json>('/appointments/$id/accept'), success: 'Cita confirmada. El paciente lo verá en su portal.');
                  if (r != null) widget.onDone();
                },
              ),
              OutlinedButton.icon(onPressed: () => setState(() => _rejecting = true), icon: const Icon(Icons.close), label: const Text('Rechazar')),
            ]),
    );
  }
}

class _CancelForm extends ConsumerStatefulWidget {
  const _CancelForm({required this.appt, required this.onClose, required this.onDone});
  final Json appt;
  final VoidCallback onClose;
  final ValueChanged<Json> onDone;
  @override
  ConsumerState<_CancelForm> createState() => _CancelFormState();
}

class _CancelFormState extends ConsumerState<_CancelForm> {
  String? _reason;
  final _note = TextEditingController();
  Object? _error;

  @override
  Widget build(BuildContext context) {
    return SectionCard(title: '¿Por qué se cancela?', children: [
      for (final r in staffCancelReasons)
        Padding(
          padding: const EdgeInsets.only(bottom: 6),
          child: ChoiceChip(label: Text(cancelReasonLabels[r]!), selected: _reason == r, onSelected: (_) => setState(() => _reason = r)),
        ),
      const SizedBox(height: 6),
      TextField(controller: _note, maxLines: 2, decoration: InputDecoration(labelText: _reason == 'OTRO' ? 'Explique el motivo' : 'Nota (opcional)', errorText: fieldError(_error, 'note'))),
      if (_error != null && fieldError(_error, 'note') == null) Padding(padding: const EdgeInsets.only(top: 8), child: Notice(tone: Tone.danger, body: errorText(_error!))),
      const SizedBox(height: 10),
      Wrap(spacing: 8, children: [
        BusyButton(
          label: 'Sí, cancelar la cita',
          danger: true,
          onPressed: _reason == null
              ? null
              : () async {
                  setState(() => _error = null);
                  try {
                    final r = await ref.read(apiProvider).post<Json>('/appointments/${widget.appt['id']}/cancel', body: {'reason': _reason, 'note': _note.text.trim().isEmpty ? null : _note.text.trim()});
                    widget.onDone(r);
                  } catch (e) {
                    setState(() => _error = e);
                  }
                },
        ),
        TextButton(onPressed: widget.onClose, child: const Text('No cancelar')),
      ]),
    ]);
  }
}

class _RescheduleForm extends ConsumerStatefulWidget {
  const _RescheduleForm({required this.appt, required this.onClose, required this.onDone});
  final Json appt;
  final VoidCallback onClose;
  final ValueChanged<Json> onDone;
  @override
  ConsumerState<_RescheduleForm> createState() => _RescheduleFormState();
}

class _RescheduleFormState extends ConsumerState<_RescheduleForm> {
  late String _date = localDate(widget.appt['startsAt']);
  Object? _error;

  @override
  Widget build(BuildContext context) {
    final clinicId = widget.appt['clinic']['id'] as String;
    final av = ref.watch(availabilityProvider((clinicId, _date)));
    return SectionCard(title: 'Nuevo día y hora', trailing: TextButton(onPressed: widget.onClose, child: const Text('Volver')), children: [
      DayBar(date: _date, onChanged: (d) => setState(() => _date = d)),
      const SizedBox(height: 12),
      if (_error != null) ...[Notice(tone: Tone.danger, body: errorText(_error!)), const SizedBox(height: 10)],
      AsyncBody(
        value: av,
        onRetry: () => ref.invalidate(availabilityProvider((clinicId, _date))),
        data: (a) => SlotPicker(
          availability: a,
          selected: null,
          onSelect: (s) async {
            if (!await confirm(context, title: '¿Cambiar la cita?', body: 'Al ${lowerFirst(dayLabel(_date))} a las ${s['label']} con ${s['doctorName']}.', ok: 'Cambiar', cancel: 'Volver')) return;
            try {
              final n = await ref.read(apiProvider).patch<Json>('/appointments/${widget.appt['id']}/reschedule', body: {'startsAt': s['startsAt'], 'doctorId': s['doctorId']});
              widget.onDone(n);
            } catch (e) {
              setState(() => _error = e);
              ref.invalidate(availabilityProvider((clinicId, _date)));
            }
          },
        ),
      ),
    ]);
  }
}

class _NotifyPatient extends ConsumerWidget {
  const _NotifyPatient({required this.appt, required this.onChanged});
  final Json appt;
  final VoidCallback onChanged;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final a = appt;
    final contact = a['contactPhone'] as String?;
    final soon = parseIso(a['startsAt']).difference(DateTime.now()) < const Duration(hours: 36);
    final api = ref.read(apiProvider);
    Future<void> setReminded(bool v) async {
      final r = await run(context, () => api.patch<Json>('/appointments/${a['id']}/reminded', body: {'reminded': v}));
      if (r != null) onChanged();
    }

    return SectionCard(title: 'Avisar al paciente', children: [
      if (contact != null)
        Wrap(spacing: 8, runSpacing: 8, children: [
          FilledButton.icon(
            onPressed: () {
              openExternal(context, whatsappUri(contact, soon ? reminderText(ref, a) : confirmationText(ref, a)));
              if (soon && a['remindedAt'] == null) setReminded(true);
            },
            icon: const Icon(Icons.chat_outlined),
            label: Text(soon ? 'Recordar por WhatsApp' : 'Confirmación por WhatsApp'),
          ),
          TextButton.icon(
            onPressed: () async {
              await Clipboard.setData(ClipboardData(text: patientUrl(ref, a)));
              if (context.mounted) showMessage(context, 'Enlace copiado. Péguelo en un mensaje para el paciente.');
            },
            icon: const Icon(Icons.copy),
            label: const Text('Copiar enlace del paciente'),
          ),
        ])
      else
        Text('Sin teléfono. ${a['contactNote'] == null ? '' : 'Cómo ubicarlo: ${a['contactNote']}'}'),
      CheckboxListTile(
        contentPadding: EdgeInsets.zero,
        controlAffinity: ListTileControlAffinity.leading,
        value: a['remindedAt'] != null,
        onChanged: (v) => setReminded(v == true),
        title: const Text('Ya se le recordó la cita'),
        subtitle: a['remindedAt'] == null ? null : Text('${a['remindedBy'] ?? 'Alguien'} · ${dateTime(a['remindedAt'])}'),
      ),
    ]);
  }
}

class _ClinicalNote extends ConsumerStatefulWidget {
  const _ClinicalNote({required this.appt, required this.onSaved});
  final Json appt;
  final VoidCallback onSaved;
  @override
  ConsumerState<_ClinicalNote> createState() => _ClinicalNoteState();
}

class _ClinicalNoteState extends ConsumerState<_ClinicalNote> {
  late final _c = TextEditingController(text: widget.appt['clinicalNote'] ?? '');

  @override
  Widget build(BuildContext context) {
    return SectionCard(title: 'Nota clínica', children: [
      Text('Solo la ven usted y la dirección. Recepción no tiene acceso.', style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant)),
      const SizedBox(height: 8),
      TextField(controller: _c, minLines: 3, maxLines: 8),
      const SizedBox(height: 8),
      Align(
        alignment: Alignment.centerLeft,
        child: BusyButton(
          label: 'Guardar nota',
          outlined: true,
          icon: Icons.save_outlined,
          onPressed: () async {
            final r = await run(context, () => ref.read(apiProvider).patch<Json>('/appointments/${widget.appt['id']}/clinical-note', body: {'clinicalNote': _c.text.trim().isEmpty ? null : _c.text.trim()}), success: 'Nota clínica guardada.');
            if (r != null) widget.onSaved();
          },
        ),
      ),
    ]);
  }
}

// ───────────────────────────── Buscar citas ─────────────────────────────

final appointmentSearchProvider = FutureProvider.autoDispose.family<Json, (String, String?, String?, int)>((ref, k) {
  final (q, clinicId, status, page) = k;
  return ref.watch(apiProvider).get<Json>('/appointments', query: {'q': q, 'clinicId': clinicId, 'status': status, 'page': page, 'pageSize': 30, 'sortBy': 'startsAt', 'sortDir': 'desc'});
});

class AppointmentSearchPage extends ConsumerStatefulWidget {
  const AppointmentSearchPage({super.key});
  @override
  ConsumerState<AppointmentSearchPage> createState() => _AppointmentSearchPageState();
}

class _AppointmentSearchPageState extends ConsumerState<AppointmentSearchPage> {
  String _q = '';
  String? _clinicId;
  String? _status;
  int _page = 1;

  @override
  Widget build(BuildContext context) {
    final clinics = ref.watch(workClinicsProvider).valueOrNull ?? const [];
    final key = (_q, _clinicId, _status, _page);
    final res = ref.watch(appointmentSearchProvider(key));
    return StaffScaffold(
      title: 'Buscar citas',
      body: PageList(onRefresh: () async => ref.invalidate(appointmentSearchProvider(key)), children: [
        SearchField(hint: 'Paciente, cédula, teléfono o código de cita', onChanged: (v) => setState(() {
              _q = v;
              _page = 1;
            })),
        if (clinics.length > 1) ClinicChips(clinics: clinics, selected: _clinicId, allLabel: 'Todas', onSelected: (id) => setState(() {
              _clinicId = id;
              _page = 1;
            })),
        Select<String?>(
          label: 'Estado',
          value: _status,
          items: {null: 'Todos los estados', ...statusLabels},
          onChanged: (v) => setState(() {
            _status = v;
            _page = 1;
          }),
        ),
        AsyncBody(
          value: res,
          onRetry: () => ref.invalidate(appointmentSearchProvider(key)),
          data: (r) {
            final items = (r['items'] as List).cast<Json>();
            if (items.isEmpty) return const EmptyState(title: 'No hay citas con esos filtros');
            return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Text('${r['total']} citas', style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant)),
              const SizedBox(height: 8),
              for (final a in items) Padding(padding: const EdgeInsets.only(bottom: 8), child: AppointmentTile(appt: a, showDate: true, onTap: () => context.push('/cita/${a['id']}'))),
              Pager(page: r['page'], pageCount: r['pageCount'], onPage: (p) => setState(() => _page = p)),
            ]);
          },
        ),
      ]),
    );
  }
}

/// Anterior / siguiente para listas paginadas.
class Pager extends StatelessWidget {
  const Pager({super.key, required this.page, required this.pageCount, required this.onPage});
  final int page;
  final int pageCount;
  final ValueChanged<int> onPage;

  @override
  Widget build(BuildContext context) {
    if (pageCount <= 1) return const SizedBox.shrink();
    return Row(mainAxisAlignment: MainAxisAlignment.center, children: [
      IconButton.outlined(tooltip: 'Página anterior', onPressed: page > 1 ? () => onPage(page - 1) : null, icon: const Icon(Icons.chevron_left)),
      Padding(padding: const EdgeInsets.symmetric(horizontal: 16), child: Text('Página $page de $pageCount')),
      IconButton.outlined(tooltip: 'Página siguiente', onPressed: page < pageCount ? () => onPage(page + 1) : null, icon: const Icon(Icons.chevron_right)),
    ]);
  }
}
