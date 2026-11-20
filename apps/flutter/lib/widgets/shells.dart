import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../core/data.dart';
import '../core/session.dart';
import '../core/theme.dart';
import 'a11y_panel.dart';
import 'ui.dart';

class _NavItem {
  const _NavItem(this.path, this.label, this.hint, this.icon, [this.permission]);
  final String path;
  final String label;
  final String hint;
  final IconData icon;
  final String? permission;
}

/// El mismo menú de la web, por permisos: cada persona ve solo lo que su rol le deja usar.
const _nav = <(String, List<_NavItem>)>[
  ('Día a día', [
    _NavItem('/agenda', 'Agenda del día', 'Citas por clínica y médico', Icons.calendar_month),
    _NavItem('/citas', 'Buscar citas', 'Por paciente, código o fecha', Icons.manage_search),
    _NavItem('/lista-espera', 'Lista de espera', 'Pacientes esperando un espacio', Icons.hourglass_bottom, 'lista_espera.gestionar'),
    _NavItem('/pacientes', 'Pacientes', 'Buscar o registrar', Icons.people_alt_outlined),
    _NavItem('/recordatorios', 'Recordatorios', 'Avisar las citas de mañana', Icons.notifications_active_outlined, 'recordatorios.gestionar'),
  ]),
  ('Clínicas', [
    _NavItem('/panel', 'Panel', 'Cifras del mes', Icons.dashboard_outlined, 'panel.ver'),
    _NavItem('/clinicas', 'Clínicas', 'Horarios y cierres', Icons.apartment),
    _NavItem('/medicos', 'Médicos', 'Horarios por clínica', Icons.medical_services_outlined),
  ]),
  ('Administración', [
    _NavItem('/usuarios', 'Usuarios', 'Cuentas del personal', Icons.manage_accounts_outlined, 'usuarios.gestionar'),
    _NavItem('/roles', 'Roles y permisos', 'Qué puede hacer cada rol', Icons.admin_panel_settings_outlined, 'roles.gestionar'),
    _NavItem('/bitacora', 'Bitácora', 'Quién cambió qué', Icons.fact_check_outlined, 'auditoria.ver'),
    _NavItem('/importar', 'Importar datos', 'Cargar archivos CSV', Icons.upload_file, 'datos.importar'),
    _NavItem('/sistema', 'Sistema', 'Respaldos y estado', Icons.dns_outlined, 'sistema.ver'),
  ]),
];

/// Campana con los avisos sin leer.
class _Bell extends ConsumerWidget {
  const _Bell({required this.portal});
  final bool portal;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final unread = ref.watch(notificationsProvider(portal)).valueOrNull?['unread'] as int? ?? 0;
    return IconButton(
      tooltip: unread > 0 ? 'Avisos: $unread sin leer' : 'Avisos',
      onPressed: () => context.push(portal ? '/p/avisos' : '/avisos'),
      icon: Badge(isLabelVisible: unread > 0, label: Text(unread > 9 ? '9+' : '$unread'), child: const Icon(Icons.notifications_outlined)),
    );
  }
}

/// Pantalla del personal: barra superior, menú lateral por permisos, avisos y accesibilidad.
class StaffScaffold extends ConsumerWidget {
  const StaffScaffold({super.key, required this.title, required this.body, this.fab, this.actions = const [], this.root = true});
  final String title;
  final Widget body;
  final Widget? fab;
  final List<Widget> actions;

  /// Pantalla del menú (con el menú lateral) o de detalle (con flecha para volver).
  final bool root;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Scaffold(
      appBar: AppBar(
        title: Text(title, overflow: TextOverflow.ellipsis),
        actions: [...actions, const _Bell(portal: false), const A11yAction()],
      ),
      drawer: root ? const _StaffDrawer() : null,
      floatingActionButton: fab,
      body: SafeArea(top: false, child: body),
    );
  }
}

class _StaffDrawer extends ConsumerWidget {
  const _StaffDrawer();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(staffProvider);
    final here = GoRouterState.of(context).matchedLocation;
    final scheme = Theme.of(context).colorScheme;
    return NavigationDrawer(
      selectedIndex: null,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 16, 16, 8),
          child: Row(children: [
            CircleAvatar(backgroundColor: scheme.primaryContainer, child: Text(_initials(user.fullName), style: TextStyle(color: scheme.onPrimaryContainer, fontWeight: FontWeight.w700))),
            const SizedBox(width: 12),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(user.fullName, style: const TextStyle(fontWeight: FontWeight.w700), overflow: TextOverflow.ellipsis),
                Text(user.roleName, style: TextStyle(color: scheme.onSurfaceVariant)),
              ]),
            ),
          ]),
        ),
        for (final (group, items) in _nav) ...[
          if (items.any((i) => i.permission == null || user.can(i.permission!)))
            Padding(padding: const EdgeInsets.fromLTRB(28, 16, 16, 6), child: Text(group, style: Theme.of(context).textTheme.labelLarge?.copyWith(color: scheme.onSurfaceVariant))),
          for (final i in items)
            if (i.permission == null || user.can(i.permission!))
              _DrawerTile(item: i, selected: here == i.path),
        ],
        const Divider(indent: 16, endIndent: 16),
        _DrawerTile(item: const _NavItem('/cuenta', 'Mi usuario', 'Datos, contraseña y sesiones', Icons.person_outline), selected: here == '/cuenta'),
        ListTile(
          contentPadding: const EdgeInsets.symmetric(horizontal: 28),
          leading: const Icon(Icons.logout),
          title: const Text('Salir'),
          onTap: () async {
            if (await confirm(context, title: '¿Cerrar sesión?', ok: 'Salir', cancel: 'Quedarme')) ref.read(sessionProvider.notifier).signOut();
          },
        ),
        const SizedBox(height: 16),
      ],
    );
  }
}

class _DrawerTile extends StatelessWidget {
  const _DrawerTile({required this.item, required this.selected});
  final _NavItem item;
  final bool selected;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 12),
      child: ListTile(
        selected: selected,
        selectedTileColor: Theme.of(context).colorScheme.primaryContainer,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        leading: Icon(item.icon),
        title: Text(item.label, style: const TextStyle(fontWeight: FontWeight.w600)),
        subtitle: Text(item.hint),
        onTap: () {
          Navigator.pop(context);
          if (!selected) context.go(item.path);
        },
      ),
    );
  }
}

String _initials(String name) {
  final parts = name.trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty).toList();
  if (parts.isEmpty) return '?';
  return (parts.first[0] + (parts.length > 1 ? parts[1][0] : '')).toUpperCase();
}

/// Pantalla del paciente: barra inferior con sus cinco secciones.
class PortalScaffold extends StatelessWidget {
  const PortalScaffold({super.key, required this.title, required this.body, required this.index});
  final String title;
  final Widget body;
  final int index;

  static const _paths = ['/p', '/p/agendar', '/p/historial', '/p/ficha', '/p/perfil'];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Row(children: [
          Container(
            width: 30,
            height: 30,
            decoration: BoxDecoration(color: Brand.ballpoint, borderRadius: BorderRadius.circular(8)),
            child: const Icon(Icons.event_available, color: Colors.white, size: 18),
          ),
          const SizedBox(width: 10),
          Expanded(child: Text(title, overflow: TextOverflow.ellipsis)),
        ]),
        actions: const [_Bell(portal: true), A11yAction()],
      ),
      body: SafeArea(top: false, child: body),
      bottomNavigationBar: NavigationBar(
        selectedIndex: index,
        onDestinationSelected: (i) => context.go(_paths[i]),
        labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
        destinations: const [
          NavigationDestination(icon: Icon(Icons.home_outlined), selectedIcon: Icon(Icons.home), label: 'Inicio'),
          NavigationDestination(icon: Icon(Icons.add_circle_outline), selectedIcon: Icon(Icons.add_circle), label: 'Agendar'),
          NavigationDestination(icon: Icon(Icons.history), label: 'Citas'),
          NavigationDestination(icon: Icon(Icons.assignment_outlined), selectedIcon: Icon(Icons.assignment), label: 'Mi ficha'),
          NavigationDestination(icon: Icon(Icons.person_outline), selectedIcon: Icon(Icons.person), label: 'Perfil'),
        ],
      ),
    );
  }
}
