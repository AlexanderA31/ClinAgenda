import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api.dart';
import '../../core/data.dart';
import '../../core/format.dart';
import '../../core/labels.dart';
import '../../core/session.dart';
import '../../widgets/shells.dart';
import '../../widgets/ui.dart';
import 'common.dart';

final dashboardProvider = FutureProvider.autoDispose.family<Json, (String, String, String?)>((ref, k) {
  final (from, to, clinicId) = k;
  return ref.watch(apiProvider).get<Json>('/reports/dashboard', query: {'from': from, 'to': to, 'clinicId': clinicId});
});

/// Series del gráfico diario: mismos colores y orden que la web (validados para daltonismo).
class _Series {
  const _Series(this.key, this.label, this.light, this.dark);
  final String key;
  final String label;
  final Color light;
  final Color dark;
  Color of(BuildContext c) => Theme.of(c).brightness == Brightness.dark ? dark : light;
}

const _daily = [
  _Series('attended', 'Atendidas', Color(0xFF1BAF7A), Color(0xFF199E70)),
  _Series('noShow', 'No asistieron', Color(0xFFEB6834), Color(0xFFD95926)),
  _Series('scheduled', 'Por atender', Color(0xFF2A78D6), Color(0xFF3987E5)),
  _Series('cancelled', 'Canceladas', Color(0xFFEDA100), Color(0xFFC98500)),
];

class DashboardPage extends ConsumerStatefulWidget {
  const DashboardPage({super.key});
  @override
  ConsumerState<DashboardPage> createState() => _DashboardPageState();
}

class _DashboardPageState extends ConsumerState<DashboardPage> {
  int _days = 30;
  String? _clinicId;

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(staffProvider);
    final to = todayIso();
    final key = (addDays(to, -(_days - 1)), to, _clinicId);
    final report = ref.watch(dashboardProvider(key));
    final clinics = ref.watch(clinicsProvider).valueOrNull ?? const [];
    if (!user.can('panel.ver')) {
      return const StaffScaffold(title: 'Panel', body: EmptyState(icon: Icons.lock_outline, title: 'Su usuario no tiene acceso al panel'));
    }
    return StaffScaffold(
      title: 'Panel',
      body: PageList(onRefresh: () async => ref.invalidate(dashboardProvider(key)), children: [
        PageHeader('Panel', description: user.role == 'MEDICO' ? 'Cifras de su propia agenda.' : 'Citas, inasistencias, cancelaciones y ocupación de las clínicas.'),
        SegmentedButton<int>(
          showSelectedIcon: false,
          segments: const [ButtonSegment(value: 7, label: Text('7 días')), ButtonSegment(value: 30, label: Text('30 días')), ButtonSegment(value: 90, label: Text('3 meses'))],
          selected: {_days},
          onSelectionChanged: (s) => setState(() => _days = s.first),
        ),
        if (clinics.length > 1 && user.role != 'MEDICO') ClinicChips(clinics: clinics, selected: _clinicId, allLabel: 'Las tres', onSelected: (id) => setState(() => _clinicId = id)),
        AsyncBody(
          value: report,
          onRetry: () => ref.invalidate(dashboardProvider(key)),
          data: (r) => _Report(r: r),
        ),
      ]),
    );
  }
}

class _Report extends StatelessWidget {
  const _Report({required this.r});
  final Json r;

  @override
  Widget build(BuildContext context) {
    final t = r['totals'] as Json;
    final attended = t['attended'] as int;
    final noShow = t['noShow'] as int;
    final rate = attended + noShow > 0 ? noShow / (attended + noShow) : 0.0;
    final daily = (r['daily'] as List).cast<Json>();
    final byClinic = (r['byClinic'] as List).cast<Json>();
    final byDoctor = (r['byDoctor'] as List).cast<Json>();
    final reasons = (r['cancelReasons'] as List).cast<Json>();
    final byHour = (r['byHour'] as List).cast<Json>().where((h) => (h['count'] as int) > 0).toList();
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      GridView.count(
        crossAxisCount: 2,
        shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        mainAxisSpacing: 10,
        crossAxisSpacing: 10,
        childAspectRatio: 1.6,
        children: [
          _Tile('Citas', '${attended + noShow + (t['scheduled'] as int)}', 'Atendidas, no vinieron y por atender'),
          _Tile('Atendidas', '$attended', ''),
          _Tile('No asistieron', '$noShow', '${(rate * 100).toStringAsFixed(0)}% de las que ya pasaron'),
          _Tile('Canceladas', '${t['cancelled']}', '${t['patientsNew']} pacientes nuevos'),
        ],
      ),
      const SizedBox(height: 14),
      SectionCard(title: 'Citas por día', children: [
        Wrap(spacing: 14, runSpacing: 6, children: [
          for (final s in _daily)
            Row(mainAxisSize: MainAxisSize.min, children: [Container(width: 12, height: 12, decoration: BoxDecoration(color: s.of(context), borderRadius: BorderRadius.circular(3))), const SizedBox(width: 6), Text(s.label)]),
        ]),
        const SizedBox(height: 12),
        SizedBox(height: 220, child: _DailyChart(daily: daily)),
        ExpansionTile(
          tilePadding: EdgeInsets.zero,
          shape: const Border(),
          title: const Text('Ver como tabla'),
          children: [
            for (final d in daily.reversed.where((d) => _daily.any((s) => (d[s.key] as int) > 0)))
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 3),
                child: Row(children: [
                  SizedBox(width: 92, child: Text(dayLabelShort(d['date']))),
                  Expanded(child: Text(_daily.map((s) => '${s.label}: ${d[s.key]}').join(' · '), style: TextStyle(color: muted, fontSize: 13))),
                ]),
              ),
          ],
        ),
      ]),
      const SizedBox(height: 14),
      SectionCard(title: 'Ocupación por clínica', children: [
        for (final c in byClinic)
          Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                ClinicDot(c['clinicName']),
                const SizedBox(width: 6),
                Expanded(child: Text(c['clinicName'], style: const TextStyle(fontWeight: FontWeight.w600))),
                Text('${((c['occupancy'] as num) * 100).toStringAsFixed(0)}% · ${c['appointments']} de ${c['capacity']}'),
              ]),
              const SizedBox(height: 4),
              ClipRRect(borderRadius: BorderRadius.circular(4), child: LinearProgressIndicator(value: (c['occupancy'] as num).toDouble().clamp(0, 1), minHeight: 10)),
            ]),
          ),
      ]),
      const SizedBox(height: 14),
      SectionCard(title: 'Por médico', children: [
        for (final d in byDoctor)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 4),
            child: Row(children: [
              Expanded(child: Text(d['doctorName'])),
              Text('${d['appointments']} citas · ${d['noShow']} no vinieron', style: TextStyle(color: muted)),
            ]),
          ),
      ]),
      if (reasons.isNotEmpty) ...[
        const SizedBox(height: 14),
        SectionCard(title: 'Por qué se cancelan', children: [
          for (final x in reasons)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 4),
              child: Row(children: [Expanded(child: Text(cancelReasonLabels[x['reason']] ?? x['reason'])), Text('${x['count']}', style: const TextStyle(fontWeight: FontWeight.w700))]),
            ),
        ]),
      ],
      if (byHour.isNotEmpty) ...[
        const SizedBox(height: 14),
        SectionCard(title: 'Horas más pedidas', children: [
          for (final h in byHour)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 3),
              child: Row(children: [
                SizedBox(width: 56, child: Text('${(h['hour'] as int).toString().padLeft(2, '0')}:00', style: const TextStyle(fontFeatures: [FontFeature.tabularFigures()]))),
                Expanded(
                  child: FractionallySizedBox(
                    alignment: Alignment.centerLeft,
                    widthFactor: (h['count'] as int) / byHour.map((x) => x['count'] as int).reduce((a, b) => a > b ? a : b),
                    child: Container(height: 14, decoration: BoxDecoration(color: _daily[2].of(context), borderRadius: const BorderRadius.horizontal(right: Radius.circular(4)))),
                  ),
                ),
                SizedBox(width: 40, child: Text('${h['count']}', textAlign: TextAlign.right)),
              ]),
            ),
        ]),
      ],
    ]);
  }
}

class _Tile extends StatelessWidget {
  const _Tile(this.label, this.value, this.note);
  final String label;
  final String value;
  final String note;
  @override
  Widget build(BuildContext context) => Card(
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
            Text(label, style: const TextStyle(fontWeight: FontWeight.w600)),
            Text(value, style: Theme.of(context).textTheme.headlineSmall),
            if (note.isNotEmpty) Text(note, maxLines: 2, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 12, color: Theme.of(context).colorScheme.onSurfaceVariant)),
          ]),
        ),
      );
}

/// Barras apiladas por día, con 2 px de separación entre tramos.
class _DailyChart extends StatelessWidget {
  const _DailyChart({required this.daily});
  final List<Json> daily;

  @override
  Widget build(BuildContext context) {
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    final surface = Theme.of(context).colorScheme.surface;
    final step = (daily.length / 6).ceil().clamp(1, 100);
    return BarChart(
      BarChartData(
        alignment: BarChartAlignment.spaceBetween,
        gridData: FlGridData(drawVerticalLine: false, getDrawingHorizontalLine: (_) => FlLine(color: Theme.of(context).colorScheme.outlineVariant, strokeWidth: 1)),
        borderData: FlBorderData(show: false),
        titlesData: FlTitlesData(
          topTitles: const AxisTitles(),
          rightTitles: const AxisTitles(),
          leftTitles: AxisTitles(sideTitles: SideTitles(showTitles: true, reservedSize: 28, getTitlesWidget: (v, meta) => Text(v.toInt().toString(), style: TextStyle(fontSize: 11, color: muted)))),
          bottomTitles: AxisTitles(
            sideTitles: SideTitles(
              showTitles: true,
              reservedSize: 22,
              getTitlesWidget: (v, meta) {
                final i = v.toInt();
                if (i % step != 0 || i >= daily.length) return const SizedBox.shrink();
                final d = daily[i]['date'] as String;
                return Padding(padding: const EdgeInsets.only(top: 4), child: Text('${int.parse(d.substring(8))}/${int.parse(d.substring(5, 7))}', style: TextStyle(fontSize: 11, color: muted)));
              },
            ),
          ),
        ),
        barTouchData: BarTouchData(
          touchTooltipData: BarTouchTooltipData(
            getTooltipItem: (group, _, _, _) {
              final d = daily[group.x];
              return BarTooltipItem('${dayLabelShort(d['date'])}\n${_daily.map((s) => '${s.label}: ${d[s.key]}').join('\n')}', const TextStyle(color: Colors.white, fontSize: 12));
            },
          ),
        ),
        barGroups: [
          for (var i = 0; i < daily.length; i++)
            BarChartGroupData(x: i, barRods: [
              BarChartRodData(
                toY: _daily.fold<double>(0, (sum, s) => sum + (daily[i][s.key] as int)),
                width: daily.length > 45 ? 3 : (daily.length > 14 ? 6 : 14),
                borderRadius: const BorderRadius.vertical(top: Radius.circular(3)),
                color: Colors.transparent,
                rodStackItems: _stack(daily[i], context, surface),
              ),
            ]),
        ],
      ),
    );
  }

  List<BarChartRodStackItem> _stack(Json d, BuildContext context, Color surface) {
    var y = 0.0;
    final items = <BarChartRodStackItem>[];
    for (final s in _daily) {
      final v = (d[s.key] as int).toDouble();
      if (v == 0) continue;
      items.add(BarChartRodStackItem(y, y + v, s.of(context), borderSide: BorderSide(color: surface, width: 1)));
      y += v;
    }
    return items;
  }
}
