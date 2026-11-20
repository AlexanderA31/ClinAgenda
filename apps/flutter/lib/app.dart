import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'core/a11y.dart';
import 'core/api.dart';
import 'core/config.dart';
import 'core/session.dart';
import 'core/theme.dart';
import 'features/auth/auth_pages.dart';
import 'features/portal/portal_pages.dart';
import 'features/staff/admin_pages.dart';
import 'features/staff/agenda_page.dart';
import 'features/staff/appointment_page.dart';
import 'features/staff/booking_page.dart';
import 'features/staff/clinic_pages.dart';
import 'features/staff/dashboard_page.dart';
import 'features/staff/medical_record_page.dart';
import 'features/staff/patient_pages.dart';
import 'features/staff/staff_misc_pages.dart';
import 'widgets/a11y_panel.dart';

/// Avisa al router cuando cambia la sesión o el servidor, para que vuelva a decidir a dónde ir.
class _RouterRefresh extends ChangeNotifier {
  _RouterRefresh(Ref ref) {
    ref.listen(sessionProvider, (_, _) => notifyListeners());
    ref.listen(serverProvider, (_, _) => notifyListeners());
  }
}

const _public = {'/servidor', '/ingresar', '/registro'};

final routerProvider = Provider<GoRouter>((ref) {
  final refresh = _RouterRefresh(ref);
  ref.onDispose(refresh.dispose);
  final router = GoRouter(
    initialLocation: '/',
    refreshListenable: refresh,
    redirect: (context, state) {
      final loc = state.matchedLocation;
      if (ref.read(serverProvider) == null) return loc == '/servidor' ? null : '/servidor';
      // Cambiar la dirección del servidor se permite siempre (también con sesión).
      if (loc == '/servidor') return null;
      final session = ref.read(sessionProvider);
      if (session.isLoading) return loc == '/' ? null : '/';
      final s = session.valueOrNull;
      if (s == null) return _public.contains(loc) ? null : '/ingresar';
      if (s.isPatient) return loc == '/p' || loc.startsWith('/p/') ? null : '/p';
      if (s.user!.mustChangePassword) return loc == '/clave' ? null : '/clave';
      if (loc == '/' || _public.contains(loc) || loc == '/clave' || loc == '/p' || loc.startsWith('/p/')) return '/agenda';
      return null;
    },
    routes: [
      GoRoute(path: '/', builder: (_, _) => const SplashPage()),
      GoRoute(path: '/servidor', builder: (_, _) => const ServerPage()),
      GoRoute(path: '/ingresar', builder: (_, _) => const LoginPage()),
      GoRoute(path: '/registro', builder: (_, _) => const RegisterPage()),
      GoRoute(path: '/clave', builder: (_, _) => const ForcePasswordPage()),
      // Portal del paciente
      GoRoute(path: '/p', builder: (_, _) => const PortalHomePage()),
      GoRoute(path: '/p/agendar', builder: (_, _) => const PortalBookPage()),
      GoRoute(path: '/p/historial', builder: (_, _) => const PortalHistoryPage()),
      GoRoute(path: '/p/ficha', builder: (_, _) => const PortalRecordPage()),
      GoRoute(path: '/p/perfil', builder: (_, _) => const PortalProfilePage()),
      GoRoute(path: '/p/avisos', builder: (_, _) => const NotificationsPage(portal: true)),
      // Personal
      GoRoute(path: '/agenda', builder: (_, _) => const AgendaPage()),
      GoRoute(path: '/nueva-cita', builder: (_, s) => BookingPage(preset: s.extra as BookingPreset?)),
      GoRoute(path: '/citas', builder: (_, _) => const AppointmentSearchPage()),
      GoRoute(path: '/cita/:id', builder: (_, s) => AppointmentPage(id: s.pathParameters['id']!)),
      GoRoute(path: '/pacientes', builder: (_, _) => const PatientsPage()),
      GoRoute(path: '/pacientes/nuevo', builder: (_, _) => const PatientFormPage()),
      GoRoute(path: '/pacientes/:id', builder: (_, s) => PatientDetailPage(id: s.pathParameters['id']!)),
      GoRoute(path: '/pacientes/:id/editar', builder: (_, s) => PatientFormPage(id: s.pathParameters['id'])),
      GoRoute(path: '/pacientes/:id/ficha', builder: (_, s) => MedicalRecordPage(patientId: s.pathParameters['id']!, appointmentId: s.uri.queryParameters['consulta'])),
      GoRoute(path: '/recordatorios', builder: (_, _) => const RemindersPage()),
      GoRoute(path: '/lista-espera', builder: (_, _) => const WaitlistPage()),
      GoRoute(path: '/panel', builder: (_, _) => const DashboardPage()),
      GoRoute(path: '/clinicas', builder: (_, _) => const ClinicsPage()),
      GoRoute(path: '/medicos', builder: (_, _) => const DoctorsPage()),
      GoRoute(path: '/usuarios', builder: (_, _) => const UsersPage()),
      GoRoute(path: '/roles', builder: (_, _) => const RolesPage()),
      GoRoute(path: '/bitacora', builder: (_, _) => const AuditPage()),
      GoRoute(path: '/importar', builder: (_, _) => const ImportPage()),
      GoRoute(path: '/sistema', builder: (_, _) => const SystemPage()),
      GoRoute(path: '/avisos', builder: (_, _) => const NotificationsPage(portal: false)),
      GoRoute(path: '/cuenta', builder: (_, _) => const MyAccountPage()),
    ],
  );
  // "Leer esta pantalla" se detiene al ir a otra pantalla.
  void onRoute() => ref.read(readerProvider.notifier).stopIfReading();
  router.routerDelegate.addListener(onRoute);
  ref.onDispose(() => router.routerDelegate.removeListener(onRoute));
  return router;
});

class ClinAgendaApp extends ConsumerWidget {
  const ClinAgendaApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final p = ref.watch(a11yProvider);
    final router = ref.watch(routerProvider);
    // La barra "Leyendo…" va debajo de la app (no encima), así no tapa la barra inferior ni los botones.
    final reading = ref.watch(readerProvider.select((r) => r.state != ReaderState.idle));
    // La API respondió 401: la sesión venció o se cerró en otro equipo.
    ref.listen(unauthorizedProvider, (_, _) => ref.read(sessionProvider.notifier).expired());
    final noMotion = p.reduceMotion ? const PageTransitionsTheme(builders: {TargetPlatform.android: _NoTransition(), TargetPlatform.iOS: _NoTransition()}) : null;
    ThemeData theme(Brightness b) {
      final t = buildTheme(brightness: b, highContrast: p.highContrast, bold: p.bold);
      return noMotion == null ? t : t.copyWith(pageTransitionsTheme: noMotion);
    }

    return MaterialApp.router(
      title: 'Clínicas Paredes',
      debugShowCheckedModeBanner: false,
      routerConfig: router,
      theme: theme(Brightness.light),
      darkTheme: theme(Brightness.dark),
      themeMode: p.theme,
      themeAnimationDuration: p.reduceMotion ? Duration.zero : kThemeAnimationDuration,
      locale: const Locale('es', 'EC'),
      supportedLocales: const [Locale('es', 'EC'), Locale('es')],
      localizationsDelegates: GlobalMaterialLocalizations.delegates,
      builder: (context, child) {
        final mq = MediaQuery.of(context);
        // La letra respeta la del teléfono y se agranda más con la opción de la app.
        final scale = mq.textScaler.scale(1) * p.textScale;
        final data = mq.copyWith(textScaler: TextScaler.linear(scale.clamp(1.0, 2.2)), disableAnimations: p.reduceMotion || mq.disableAnimations);
        return MediaQuery(
          data: data,
          child: Column(children: [
            Expanded(child: MediaQuery(data: reading ? data.removePadding(removeBottom: true) : data, child: child!)),
            const ReaderBar(),
          ]),
        );
      },
    );
  }
}

class _NoTransition extends PageTransitionsBuilder {
  const _NoTransition();
  @override
  Widget buildTransitions<T>(PageRoute<T> route, BuildContext context, Animation<double> animation, Animation<double> secondaryAnimation, Widget child) => child;
}
