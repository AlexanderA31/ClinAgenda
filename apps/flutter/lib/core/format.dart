import 'package:intl/intl.dart';

/// Las clínicas están en Quito (UTC−5, sin horario de verano): todas las horas se muestran así,
/// sin importar la zona configurada en el teléfono.
const _quitoOffset = Duration(hours: -5);

/// Instante -> "hora de pared" de Quito (un DateTime UTC con los números de Quito, solo para mostrar).
DateTime quito(DateTime instant) => instant.toUtc().add(_quitoOffset);
DateTime parseIso(String iso) => DateTime.parse(iso);

final _long = DateFormat("EEEE d 'de' MMMM", 'es');
final _longYear = DateFormat("EEEE d 'de' MMMM 'de' y", 'es');
final _short = DateFormat('dd/MM/yyyy', 'es');
final _time = DateFormat('HH:mm', 'es');
final _dateTime = DateFormat("d MMM, HH:mm", 'es');
final _month = DateFormat('MMM', 'es');
final _monthYear = DateFormat('MMMM y', 'es');

String _cap(String s) => s.isEmpty ? s : s[0].toUpperCase() + s.substring(1);

/// Para usar dentro de una frase: "el miércoles 18 de noviembre".
String lowerFirst(String s) => s.isEmpty ? s : s[0].toLowerCase() + s.substring(1);

/// "Miércoles 18 de noviembre"
String longDate(String iso) => _cap(_long.format(quito(parseIso(iso))));
String longDateYear(String iso) => _cap(_longYear.format(quito(parseIso(iso))));
String shortDate(String iso) => _short.format(quito(parseIso(iso)));
String time(String iso) => _time.format(quito(parseIso(iso)));
String dateTime(String iso) => _dateTime.format(quito(parseIso(iso)));
String monthShort(String iso) => _month.format(quito(parseIso(iso))).replaceAll('.', '');
int dayOfMonth(String iso) => quito(parseIso(iso)).day;
String monthYear(DateTime d) => _cap(_monthYear.format(d));

/// "2026-11-18" de hoy en Quito.
String todayIso() => dateOnly(quito(DateTime.now()));
String dateOnly(DateTime d) => '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

/// Fecha de Quito ("2026-11-18") de un instante.
String localDate(String iso) => dateOnly(quito(parseIso(iso)));

/// "2026-11-18" -> DateTime UTC a mediodía (para sumar días sin desfases).
DateTime dayToDate(String day) => DateTime.utc(int.parse(day.substring(0, 4)), int.parse(day.substring(5, 7)), int.parse(day.substring(8, 10)), 12);
String addDays(String day, int n) => dateOnly(dayToDate(day).add(Duration(days: n)));

/// "2026-11-18" -> "Miércoles 18 de noviembre"
String dayLabel(String day) => _cap(_long.format(dayToDate(day)));
String dayLabelShort(String day) => _cap(DateFormat("EEE d MMM", 'es').format(dayToDate(day)).replaceAll('.', ''));

/// "Hoy", "Mañana", "En 5 días"
String whenLabel(String iso) {
  final days = dayToDate(localDate(iso)).difference(dayToDate(todayIso())).inDays;
  if (days <= 0) return 'Hoy';
  if (days == 1) return 'Mañana';
  return 'En $days días';
}

/// "+593991234567" -> "099 123 4567"; otros números se muestran como vienen.
String phone(String? e164) {
  if (e164 == null || e164.isEmpty) return '—';
  final m = RegExp(r'^\+5939(\d{8})$').firstMatch(e164);
  if (m != null) {
    final d = '09${m.group(1)}';
    return '${d.substring(0, 3)} ${d.substring(3, 6)} ${d.substring(6)}';
  }
  final f = RegExp(r'^\+593(\d)(\d{7})$').firstMatch(e164);
  if (f != null) return '0${f.group(1)}${f.group(2)!.substring(0, 3)}${f.group(2)!.substring(3)}';
  return e164;
}

String bytes(int n) {
  if (n < 1024) return '$n B';
  if (n < 1024 * 1024) return '${(n / 1024).toStringAsFixed(0)} KB';
  return '${(n / 1024 / 1024).toStringAsFixed(1)} MB';
}

/// Número con separadores en español ("1.234").
String number(num n) => NumberFormat.decimalPattern('es').format(n);

/// "Hace 5 min", "Hace 2 h", "Ayer, 13:39", "18 nov, 13:39".
String ago(String iso) {
  final at = parseIso(iso);
  final diff = DateTime.now().difference(at);
  if (diff.inMinutes < 1) return 'Ahora';
  if (diff.inMinutes < 60) return 'Hace ${diff.inMinutes} min';
  final day = localDate(iso);
  if (day == todayIso()) return 'Hace ${diff.inHours} h';
  if (day == addDays(todayIso(), -1)) return 'Ayer, ${time(iso)}';
  return dateTime(iso);
}
