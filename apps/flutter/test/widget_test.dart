import 'package:clinagenda/core/cie10.dart';
import 'package:clinagenda/core/config.dart';
import 'package:clinagenda/core/format.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';

void main() {
  setUpAll(() => initializeDateFormatting('es'));

  test('la dirección del servidor se completa y se valida', () {
    expect(normalizeServer('192.168.1.20:3000/'), 'http://192.168.1.20:3000');
    expect(normalizeServer('agenda.clinicasparedes.ec'), 'https://agenda.clinicasparedes.ec');
    expect(normalizeServer('no es una url'), isNull);
  });

  test('las horas se muestran en hora de Quito', () {
    expect(time('2026-11-20T13:00:00.000Z'), '08:00');
    expect(localDate('2026-11-21T02:30:00.000Z'), '2026-11-20');
    expect(addDays('2026-12-31', 1), '2027-01-01');
  });

  test('celulares de Ecuador con espacios', () {
    expect(phone('+593991234567'), '099 123 4567');
    expect(phone(null), '—');
  });

  test('CIE-10 busca por código y por nombre sin tildes', () {
    expect(normalizeCie10(' j069 '), 'J06.9');
    expect(searchCie10('faringitis').first.$1, 'J02.9');
    expect(searchCie10('j06').first.$1, 'J06.9');
    expect(searchCie10('cefalea tension').first.$1, 'G44.2');
  });
}
