import 'dart:io';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api.dart';
import '../../core/data.dart';
import '../../core/format.dart';
import '../../core/labels.dart';
import '../../core/session.dart';
import '../../widgets/shells.dart';
import '../../widgets/ui.dart';
import 'appointment_page.dart';

/// Pantalla solo para quien tiene el permiso; si no, lo dice en vez de mostrarse vacía.
Widget _guard(WidgetRef ref, String permission, String title, Widget Function() page) {
  if (ref.watch(staffProvider).can(permission)) return page();
  return StaffScaffold(title: title, body: const EmptyState(icon: Icons.lock_outline, title: 'Su usuario no tiene acceso a esta pantalla'));
}

// ───────────────────────────── Usuarios ─────────────────────────────

final usersProvider = FutureProvider.autoDispose<List<Json>>((ref) async => (await ref.watch(apiProvider).get<List>('/users')).cast<Json>());

class UsersPage extends ConsumerWidget {
  const UsersPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) => _guard(ref, 'usuarios.gestionar', 'Usuarios', () {
        final users = ref.watch(usersProvider);
        void open([Json? u]) async {
          final ok = await Navigator.of(context).push<bool>(MaterialPageRoute(builder: (_) => _UserForm(user: u)));
          if (ok == true) ref.invalidate(usersProvider);
        }

        return StaffScaffold(
          title: 'Usuarios',
          fab: FloatingActionButton.extended(onPressed: open, icon: const Icon(Icons.person_add_alt), label: const Text('Nuevo usuario')),
          body: AsyncBody(
            value: users,
            onRetry: () => ref.invalidate(usersProvider),
            data: (list) => PageList(onRefresh: () async => ref.invalidate(usersProvider), children: [
              const PageHeader('Usuarios', description: 'Una cuenta por persona. Así la bitácora dice quién hizo cada cambio.'),
              for (final u in list)
                Card(
                  child: ListTile(
                    onTap: () => open(u),
                    title: Text(u['fullName'], style: const TextStyle(fontWeight: FontWeight.w700)),
                    subtitle: Text('${u['username']} · ${u['roleName']}\nÚltimo ingreso: ${u['lastLoginAt'] == null ? 'nunca' : dateTime(u['lastLoginAt'])}'),
                    isThreeLine: true,
                    trailing: Column(mainAxisAlignment: MainAxisAlignment.center, crossAxisAlignment: CrossAxisAlignment.end, children: [
                      if (u['active'] != true) const Badge2(label: 'Inactivo', tone: Tone.neutral),
                      if (u['lockedUntil'] != null && parseIso(u['lockedUntil']).isAfter(DateTime.now())) const Badge2(label: 'Bloqueado', tone: Tone.danger),
                      if (u['mustChangePassword'] == true) const Badge2(label: 'Clave temporal', tone: Tone.warn),
                    ]),
                  ),
                ),
            ]),
          ),
        );
      });
}

class _UserForm extends ConsumerStatefulWidget {
  const _UserForm({this.user});
  final Json? user;
  @override
  ConsumerState<_UserForm> createState() => _UserFormState();
}

class _UserFormState extends ConsumerState<_UserForm> {
  late final _username = TextEditingController(text: widget.user?['username'] ?? '');
  late final _name = TextEditingController(text: widget.user?['fullName'] ?? '');
  final _password = TextEditingController();
  late String? _roleId = widget.user?['roleId'];
  late String? _doctorId = widget.user?['doctorId'];
  late final Set<String> _clinics = {...List<String>.from(widget.user?['clinicIds'] ?? const [])};
  late bool _active = widget.user?['active'] ?? true;
  Object? _error;

  bool get _editing => widget.user != null;

  @override
  Widget build(BuildContext context) {
    final roles = ref.watch(rolesProvider).valueOrNull ?? const [];
    final clinics = ref.watch(clinicsProvider).valueOrNull ?? const [];
    final doctors = ref.watch(doctorsProvider(null)).valueOrNull ?? const [];
    final role = roles.firstWhere((r) => r['id'] == _roleId, orElse: () => const {});
    final scope = role['scope'] as String?;
    String? err(String f) => fieldError(_error, f);
    final api = ref.read(apiProvider);
    return Scaffold(
      appBar: AppBar(title: Text(_editing ? widget.user!['fullName'] : 'Nuevo usuario')),
      body: SafeArea(
        top: false,
        child: PageList(children: [
          if (_error != null) Notice(tone: Tone.danger, body: errorText(_error!)),
          if (!_editing) TextField(controller: _username, autocorrect: false, decoration: InputDecoration(labelText: 'Usuario para ingresar', hintText: 'Ej. rosa', errorText: err('username'))),
          TextField(controller: _name, textCapitalization: TextCapitalization.words, decoration: InputDecoration(labelText: 'Nombre completo', errorText: err('fullName'))),
          Select<String>(label: 'Rol', value: _roleId, items: {for (final r in roles) r['id'] as String: r['name'] as String}, onChanged: (v) => setState(() => _roleId = v)),
          if (scope != null) Text(scopeLabels[scope]!.$2, style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant)),
          if (scope == 'MEDICO')
            Select<String?>(label: 'Ficha de médico', value: _doctorId, items: {null: 'Sin vincular', for (final d in doctors) d['id'] as String: d['fullName'] as String}, onChanged: (v) => setState(() => _doctorId = v)),
          if (scope != 'ADMIN') ...[
            Text('Clínicas donde trabaja (ninguna = todas)', style: Theme.of(context).textTheme.titleSmall),
            Wrap(spacing: 8, children: [
              for (final c in clinics)
                FilterChip(
                  avatar: ClinicDot(c['name']),
                  label: Text(c['name']),
                  selected: _clinics.contains(c['id']),
                  onSelected: (v) => setState(() => v ? _clinics.add(c['id']) : _clinics.remove(c['id'])),
                ),
            ]),
          ],
          TextField(
            controller: _password,
            obscureText: true,
            decoration: InputDecoration(
              labelText: _editing ? 'Nueva contraseña temporal (opcional)' : 'Contraseña temporal',
              helperText: 'La persona deberá cambiarla al ingresar.',
              errorText: err(_editing ? 'resetPassword' : 'password'),
            ),
          ),
          if (_editing) SwitchListTile(contentPadding: EdgeInsets.zero, title: const Text('Activo'), subtitle: const Text('Un usuario inactivo no puede ingresar'), value: _active, onChanged: (v) => setState(() => _active = v)),
          BusyButton(
            label: _editing ? 'Guardar cambios' : 'Crear usuario',
            icon: Icons.save_outlined,
            expand: true,
            onPressed: () async {
              setState(() => _error = null);
              try {
                if (_editing) {
                  await api.patch<Json>('/users/${widget.user!['id']}', body: {
                    'fullName': _name.text.trim(),
                    'roleId': _roleId,
                    'active': _active,
                    'clinicIds': _clinics.toList(),
                    'doctorId': scope == 'MEDICO' ? _doctorId : null,
                    if (_password.text.isNotEmpty) 'resetPassword': _password.text,
                  });
                } else {
                  await api.post<Json>('/users', body: {
                    'username': _username.text.trim().toLowerCase(),
                    'fullName': _name.text.trim(),
                    'roleId': _roleId,
                    'password': _password.text,
                    'doctorId': scope == 'MEDICO' ? _doctorId : null,
                    'clinicIds': _clinics.toList(),
                  });
                }
                if (context.mounted) {
                  showMessage(context, _editing ? 'Usuario actualizado.' : 'Usuario creado. Entréguele su usuario y la contraseña temporal.');
                  Navigator.pop(context, true);
                }
              } catch (e) {
                setState(() => _error = e);
              }
            },
          ),
          if (_editing) ...[
            OutlinedButton.icon(
              onPressed: () => run(context, () => api.post<Json>('/users/${widget.user!['id']}/unlock'), success: 'Usuario desbloqueado.'),
              icon: const Icon(Icons.lock_open),
              label: const Text('Desbloquear (tras muchos intentos fallidos)'),
            ),
            OutlinedButton.icon(
              onPressed: () => run(context, () => api.post<Json>('/users/${widget.user!['id']}/revoke-sessions'), success: 'Se cerraron todas sus sesiones.'),
              icon: const Icon(Icons.logout),
              label: const Text('Cerrar todas sus sesiones'),
            ),
          ],
        ]),
      ),
    );
  }
}

// ───────────────────────────── Roles ─────────────────────────────

class RolesPage extends ConsumerWidget {
  const RolesPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) => _guard(ref, 'roles.gestionar', 'Roles y permisos', () {
        final roles = ref.watch(rolesProvider);
        void open([Json? r]) async {
          final ok = await Navigator.of(context).push<bool>(MaterialPageRoute(builder: (_) => _RoleForm(role: r)));
          if (ok == true) ref.invalidate(rolesProvider);
        }

        return StaffScaffold(
          title: 'Roles y permisos',
          fab: FloatingActionButton.extended(onPressed: open, icon: const Icon(Icons.add), label: const Text('Nuevo rol')),
          body: AsyncBody(
            value: roles,
            onRetry: () => ref.invalidate(rolesProvider),
            data: (list) => PageList(onRefresh: () async => ref.invalidate(rolesProvider), children: [
              const PageHeader('Roles y permisos', description: 'El alcance decide qué datos ve; los permisos, qué puede hacer.'),
              for (final r in list)
                Card(
                  child: ListTile(
                    onTap: r['locked'] == true ? null : () => open(r),
                    title: Text(r['name'], style: const TextStyle(fontWeight: FontWeight.w700)),
                    subtitle: Text('${scopeLabels[r['scope']]!.$1} · ${(r['permissions'] as List).length} permisos · ${r['userCount']} usuarios${r['description'] == null ? '' : '\n${r['description']}'}'),
                    isThreeLine: r['description'] != null,
                    trailing: r['locked'] == true ? const Tooltip(message: 'Rol del sistema: no se puede cambiar', child: Icon(Icons.lock_outline)) : const Icon(Icons.chevron_right),
                  ),
                ),
            ]),
          ),
        );
      });
}

class _RoleForm extends ConsumerStatefulWidget {
  const _RoleForm({this.role});
  final Json? role;
  @override
  ConsumerState<_RoleForm> createState() => _RoleFormState();
}

class _RoleFormState extends ConsumerState<_RoleForm> {
  late final _name = TextEditingController(text: widget.role?['name'] ?? '');
  late final _desc = TextEditingController(text: widget.role?['description'] ?? '');
  late String _scope = widget.role?['scope'] ?? 'RECEPCION';
  late final Set<String> _perms = {...List<String>.from(widget.role?['permissions'] ?? const [])};
  Object? _error;

  @override
  Widget build(BuildContext context) {
    final editing = widget.role != null;
    final api = ref.read(apiProvider);
    final groups = <String, List<PermissionInfo>>{};
    for (final p in permissions) {
      groups.putIfAbsent(p.group, () => []).add(p);
    }
    return Scaffold(
      appBar: AppBar(title: Text(editing ? widget.role!['name'] : 'Nuevo rol')),
      body: SafeArea(
        top: false,
        child: PageList(children: [
          if (_error != null) Notice(tone: Tone.danger, body: errorText(_error!)),
          TextField(controller: _name, decoration: InputDecoration(labelText: 'Nombre del rol', errorText: fieldError(_error, 'name'))),
          TextField(controller: _desc, decoration: const InputDecoration(labelText: 'Descripción (opcional)')),
          if (!editing)
            Select<String>(label: 'Alcance (qué datos ve)', value: _scope, items: {for (final e in scopeLabels.entries) e.key: e.value.$1}, onChanged: (v) => setState(() => _scope = v ?? _scope))
          else
            InfoRow('Alcance', scopeLabels[_scope]!.$1),
          Text(scopeLabels[_scope]!.$2, style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant)),
          for (final e in groups.entries)
            SectionCard(title: e.key, children: [
              for (final p in e.value)
                CheckboxListTile(
                  contentPadding: EdgeInsets.zero,
                  controlAffinity: ListTileControlAffinity.leading,
                  value: _perms.contains(p.key),
                  onChanged: (v) => setState(() => v == true ? _perms.add(p.key) : _perms.remove(p.key)),
                  title: Text(p.label),
                ),
            ]),
          BusyButton(
            label: editing ? 'Guardar cambios' : 'Crear rol',
            icon: Icons.save_outlined,
            expand: true,
            onPressed: () async {
              setState(() => _error = null);
              final body = {'name': _name.text.trim(), 'description': _desc.text.trim().isEmpty ? null : _desc.text.trim(), 'permissions': _perms.toList()};
              try {
                if (editing) {
                  await api.patch<Json>('/roles/${widget.role!['id']}', body: body);
                } else {
                  await api.post<Json>('/roles', body: {...body, 'scope': _scope});
                }
                if (context.mounted) Navigator.pop(context, true);
              } catch (e) {
                setState(() => _error = e);
              }
            },
          ),
          if (editing && widget.role!['system'] != true)
            TextButton.icon(
              onPressed: () async {
                if (!await confirm(context, title: '¿Borrar el rol ${widget.role!['name']}?', body: 'Solo se puede si ningún usuario lo tiene.', ok: 'Borrar', danger: true)) return;
                if (!context.mounted) return;
                final r = await run(context, () => api.delete<Json>('/roles/${widget.role!['id']}'), success: 'Rol borrado.');
                if (r != null && context.mounted) Navigator.pop(context, true);
              },
              icon: const Icon(Icons.delete_outline),
              label: const Text('Borrar rol'),
            ),
        ]),
      ),
    );
  }
}

// ───────────────────────────── Bitácora ─────────────────────────────

final auditProvider = FutureProvider.autoDispose.family<Json, (String?, int)>((ref, k) {
  final (entity, page) = k;
  return ref.watch(apiProvider).get<Json>('/audit', query: {'entity': entity, 'page': page, 'pageSize': 30});
});

const _entities = {
  null: 'Todo',
  'Appointment': 'Citas',
  'Patient': 'Pacientes',
  'MedicalRecord': 'Antecedentes',
  'Consultation': 'Consultas',
  'MedicalAttachment': 'Documentos de la ficha',
  'WaitlistEntry': 'Lista de espera',
  'Doctor': 'Médicos',
  'Clinic': 'Clínicas',
  'ClinicClosure': 'Cierres de clínica',
  'User': 'Usuarios',
  'AccessRole': 'Roles',
  'ImportJob': 'Importaciones',
};

class AuditPage extends ConsumerStatefulWidget {
  const AuditPage({super.key});
  @override
  ConsumerState<AuditPage> createState() => _AuditPageState();
}

class _AuditPageState extends ConsumerState<AuditPage> {
  String? _entity;
  int _page = 1;

  @override
  Widget build(BuildContext context) => _guard(ref, 'auditoria.ver', 'Bitácora', () {
        final key = (_entity, _page);
        final res = ref.watch(auditProvider(key));
        return StaffScaffold(
          title: 'Bitácora',
          body: PageList(onRefresh: () async => ref.invalidate(auditProvider(key)), children: [
            const PageHeader('Bitácora', description: 'Quién cambió qué y cuándo. No se puede borrar ni editar.'),
            Select<String?>(label: 'Qué', value: _entity, items: _entities, onChanged: (v) => setState(() {
                  _entity = v;
                  _page = 1;
                })),
            AsyncBody(
              value: res,
              onRetry: () => ref.invalidate(auditProvider(key)),
              data: (r) {
                final items = (r['items'] as List).cast<Json>();
                if (items.isEmpty) return const EmptyState(title: 'Sin cambios registrados');
                return Column(children: [
                  for (final x in items)
                    Card(
                      margin: const EdgeInsets.only(bottom: 8),
                      child: ListTile(
                        title: Text(x['summary']),
                        subtitle: Text('${dateTime(x['at'])} · ${x['user']?['fullName'] ?? 'Sistema o paciente'}'),
                      ),
                    ),
                  Pager(page: r['page'], pageCount: r['pageCount'], onPage: (p) => setState(() => _page = p)),
                ]);
              },
            ),
          ]),
        );
      });
}

// ───────────────────────────── Importar ─────────────────────────────

class ImportPage extends ConsumerStatefulWidget {
  const ImportPage({super.key});
  @override
  ConsumerState<ImportPage> createState() => _ImportPageState();
}

class _ImportPageState extends ConsumerState<ImportPage> {
  String _kind = 'patients';
  File? _file;
  Json? _report;

  static const _kinds = {'doctors': '1. Médicos', 'patients': '2. Pacientes', 'appointments': '3. Citas futuras'};

  Future<void> _send(bool dryRun) async {
    final r = await run(context, () => ref.read(apiProvider).upload<Json>('/imports/$_kind', _file!, query: {'dryRun': dryRun}));
    if (r != null) setState(() => _report = r);
  }

  @override
  Widget build(BuildContext context) => _guard(ref, 'datos.importar', 'Importar datos', () {
        final r = _report;
        return StaffScaffold(
          title: 'Importar datos',
          body: PageList(children: [
            const PageHeader('Importar datos', description: 'Primero médicos, luego pacientes, luego citas. Siempre se ve una vista previa antes de guardar.'),
            SegmentedButton<String>(
              showSelectedIcon: false,
              segments: [for (final e in _kinds.entries) ButtonSegment(value: e.key, label: Text(e.value))],
              selected: {_kind},
              onSelectionChanged: (s) => setState(() {
                _kind = s.first;
                _report = null;
              }),
            ),
            OutlinedButton.icon(
              onPressed: () async {
                final picked = await FilePicker.pickFile(type: FileType.custom, allowedExtensions: ['csv']);
                final path = picked?.path;
                if (path != null) {
                  setState(() {
                    _file = File(path);
                    _report = null;
                  });
                }
              },
              icon: const Icon(Icons.attach_file),
              label: Text(_file == null ? 'Elegir archivo CSV' : _file!.uri.pathSegments.last),
            ),
            if (_file != null && (r == null || r['dryRun'] != true)) BusyButton(label: 'Ver vista previa', icon: Icons.preview, onPressed: () => _send(true)),
            if (r != null) ...[
              Notice(
                tone: r['rejected'] > 0 ? Tone.warn : Tone.good,
                title: r['dryRun'] == true ? 'Vista previa (todavía no se guardó nada)' : 'Importación terminada',
                body: '${r['total']} filas: ${r['imported']} listas, ${r['fixed']} corregidas, ${r['duplicates']} duplicadas y ${r['rejected']} rechazadas.',
              ),
              if (r['dryRun'] == true) BusyButton(label: 'Importar ${r['imported'] + r['fixed']} filas', icon: Icons.upload, onPressed: () => _send(false)),
              for (final row in (r['rows'] as List).cast<Json>().where((x) => x['status'] != 'IMPORTED').take(50))
                Card(
                  margin: const EdgeInsets.only(bottom: 6),
                  child: ListTile(
                    dense: true,
                    title: Text('Fila ${row['row']}: ${{'FIXED': 'corregida', 'REJECTED': 'rechazada', 'DUPLICATE': 'duplicada'}[row['status']] ?? row['status']}'),
                    subtitle: Text((row['messages'] as List).join(' · ')),
                  ),
                ),
            ],
          ]),
        );
      });
}

// ───────────────────────────── Sistema ─────────────────────────────

final systemProvider = FutureProvider.autoDispose<(Json, Json)>((ref) async {
  final api = ref.watch(apiProvider);
  final r = await Future.wait([api.get<Json>('/system/status'), api.get<Json>('/system/backup')]);
  return (r[0], r[1]);
});

class SystemPage extends ConsumerWidget {
  const SystemPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) => _guard(ref, 'sistema.ver', 'Sistema', () {
        final s = ref.watch(systemProvider);
        return StaffScaffold(
          title: 'Sistema',
          body: AsyncBody(
            value: s,
            onRetry: () => ref.invalidate(systemProvider),
            data: (d) {
              final (st, b) = d;
              final ok = b['state'] == 'OK';
              final db = st['database'] as Json;
              final users = st['users'] as Json;
              return PageList(onRefresh: () async => ref.invalidate(systemProvider), children: [
                const PageHeader('Sistema', description: 'Estado del servidor y de los respaldos.'),
                Notice(
                  tone: ok ? Tone.good : (b['state'] == 'SIN_COPIA_EXTERNA' || b['state'] == 'ATRASADO' ? Tone.warn : Tone.danger),
                  title: ok ? 'Respaldos al día' : 'Revise los respaldos',
                  body: '${b['message']}${b['lastAt'] == null ? '' : '\nÚltimo: ${dateTime(b['lastAt'])} · ${bytes(b['bytes'])}'}',
                ),
                SectionCard(title: 'Servidor', children: [
                  InfoRow('Versión', st['appVersion']),
                  InfoRow('Encendido desde', dateTime(st['startedAt'])),
                  InfoRow('Base de datos', '${db['version']} · ${bytes(db['bytes'])}'),
                  InfoRow('Última migración', db['lastMigration'] ?? '—'),
                ]),
                SectionCard(title: 'Datos', children: [
                  InfoRow('Pacientes', number(st['patients'])),
                  InfoRow('Citas', '${number(st['appointments']['total'])} (${number(st['appointments']['upcoming'])} por venir)'),
                  InfoRow('Usuarios', '${users['active']} activos · ${users['inactive']} inactivos · ${users['locked']} bloqueados'),
                  InfoRow('Últimas 24 h', '${st['activity']['changes24h']} cambios · ${st['activity']['failedLogins24h']} ingresos fallidos'),
                ]),
              ]);
            },
          ),
        );
      });
}
