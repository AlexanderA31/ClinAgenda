import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api.dart';
import '../../core/config.dart';
import '../../core/format.dart';
import '../../widgets/ui.dart';

/// Enlace del paciente para ver o cancelar su cita (la web del servidor).
String patientUrl(WidgetRef ref, Json a) => '${ref.read(serverProvider) ?? ''}${a['patientLink'] ?? ''}';

String _when(Json a) => '${lowerFirst(dayLabel(localDate(a['startsAt'])))} a las ${time(a['startsAt'])}';

/// Los mismos textos de WhatsApp de la web (lib/whatsapp.ts).
String confirmationText(WidgetRef ref, Json a) => [
      'Hola, le saludamos de ${a['clinic']['name']}.',
      'Su cita (${a['code']}) con ${a['doctor']['fullName']} quedó agendada para el ${_when(a)}.',
      'Si no puede venir, cancélela aquí para dar el espacio a otro paciente: ${patientUrl(ref, a)}',
      'Por favor llegue 10 minutos antes.',
    ].join('\n');

String reminderText(WidgetRef ref, Json a) => [
      'Hola, le recordamos su cita en ${a['clinic']['name']} con ${a['doctor']['fullName']} el ${_when(a)}.',
      'Si no puede venir, avísenos o cancélela aquí: ${patientUrl(ref, a)}',
    ].join('\n');

/// Fila de una cita en listas (agenda, búsqueda, historial del paciente).
class AppointmentTile extends StatelessWidget {
  const AppointmentTile({super.key, required this.appt, required this.onTap, this.showDate = false, this.showDoctor = true, this.showPatient = true});
  final Json appt;
  final VoidCallback onTap;
  final bool showDate;
  final bool showDoctor;
  final bool showPatient;

  @override
  Widget build(BuildContext context) {
    final a = appt;
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    final patient = a['patient'] as Json;
    final lines = <String>[
      if (showDate) '${shortDate(a['startsAt'])} · ${a['clinic']['name']}',
      if (showDoctor) (a['doctor'] as Json)['fullName'],
      if (a['reason'] != null) 'Motivo: ${a['reason']}',
    ];
    return Card(
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: onTap,
        child: IntrinsicHeight(
          child: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Container(width: 5, decoration: BoxDecoration(color: statusColor(context, a['status']), borderRadius: const BorderRadius.horizontal(left: Radius.circular(14)))),
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 12, 4, 12),
              child: Text(time(a['startsAt']), style: Theme.of(context).textTheme.titleMedium?.copyWith(fontFeatures: const [FontFeature.tabularFigures()])),
            ),
            Expanded(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(8, 12, 12, 12),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  if (showPatient) Text(patient['fullName'], style: const TextStyle(fontWeight: FontWeight.w700)),
                  for (final l in lines) Text(l, style: TextStyle(color: muted), maxLines: 2, overflow: TextOverflow.ellipsis),
                  const SizedBox(height: 6),
                  Wrap(spacing: 8, runSpacing: 4, crossAxisAlignment: WrapCrossAlignment.center, children: [
                    StatusBadge(a['status']),
                    if (showPatient && patient['phone'] != null) Text(phone(patient['phone']), style: TextStyle(color: muted, fontFeatures: const [FontFeature.tabularFigures()])),
                    if (a['remindedAt'] != null) Badge2(label: 'Avisado', tone: Tone.good, icon: Icons.done_all),
                  ]),
                ]),
              ),
            ),
            Icon(Icons.chevron_right, color: muted),
            const SizedBox(width: 6),
          ]),
        ),
      ),
    );
  }
}

/// Selector de día: anterior, fecha (abre el calendario), siguiente y "Hoy".
class DayBar extends StatelessWidget {
  const DayBar({super.key, required this.date, required this.onChanged});
  final String date;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    final today = todayIso();
    return Row(children: [
      IconButton.outlined(tooltip: 'Día anterior', onPressed: () => onChanged(addDays(date, -1)), icon: const Icon(Icons.chevron_left)),
      const SizedBox(width: 6),
      Expanded(
        child: OutlinedButton(
          onPressed: () async {
            final d = await showDatePicker(context: context, initialDate: dayToDate(date).toLocal(), firstDate: DateTime(2024), lastDate: DateTime(DateTime.now().year + 2), locale: const Locale('es', 'EC'));
            if (d != null) onChanged(dateOnly(d));
          },
          child: Text(date == today ? 'Hoy, ${dayLabelShort(date)}' : dayLabelShort(date), overflow: TextOverflow.ellipsis),
        ),
      ),
      const SizedBox(width: 6),
      IconButton.outlined(tooltip: 'Día siguiente', onPressed: () => onChanged(addDays(date, 1)), icon: const Icon(Icons.chevron_right)),
      if (date != today) ...[const SizedBox(width: 6), TextButton(onPressed: () => onChanged(today), child: const Text('Hoy'))],
    ]);
  }
}

/// Pestañas de clínica con su color.
class ClinicChips extends StatelessWidget {
  const ClinicChips({super.key, required this.clinics, required this.selected, required this.onSelected, this.allLabel});
  final List<Json> clinics;
  final String? selected;
  final ValueChanged<String?> onSelected;

  /// Si se da, agrega la opción "todas" (valor null).
  final String? allLabel;

  @override
  Widget build(BuildContext context) {
    return Wrap(spacing: 8, runSpacing: 8, children: [
      if (allLabel != null) ChoiceChip(label: Text(allLabel!), selected: selected == null, onSelected: (_) => onSelected(null)),
      for (final c in clinics)
        ChoiceChip(
          avatar: ClinicDot(c['name']),
          label: Text((c['name'] as String).replaceFirst('Clínica ', '')),
          selected: selected == c['id'],
          onSelected: (_) => onSelected(c['id']),
        ),
    ]);
  }
}
