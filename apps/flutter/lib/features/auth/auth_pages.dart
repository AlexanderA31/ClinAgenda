import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api.dart';
import '../../core/config.dart';
import '../../core/format.dart';
import '../../core/session.dart';
import '../../core/theme.dart';
import '../../widgets/a11y_panel.dart';
import '../../widgets/ui.dart';

/// Mientras se revisa si hay una sesión guardada.
class SplashPage extends StatelessWidget {
  const SplashPage({super.key});
  @override
  Widget build(BuildContext context) => const Scaffold(backgroundColor: Brand.ballpoint, body: Center(child: Icon(Icons.event_available, color: Colors.white, size: 72)));
}

/// Marca de la clínica arriba de las pantallas de ingreso.
class _Brand extends StatelessWidget {
  const _Brand();
  @override
  Widget build(BuildContext context) {
    return Row(children: [
      Container(
        width: 44,
        height: 44,
        decoration: BoxDecoration(color: Brand.ballpoint, borderRadius: BorderRadius.circular(12)),
        child: const Icon(Icons.event_available, color: Colors.white),
      ),
      const SizedBox(width: 12),
      Text('Clínicas Paredes', style: Theme.of(context).textTheme.titleLarge?.copyWith(color: Theme.of(context).colorScheme.primary, fontWeight: FontWeight.w800)),
    ]);
  }
}

class _AuthScaffold extends StatelessWidget {
  const _AuthScaffold({required this.children, this.back = false});
  final List<Widget> children;
  final bool back;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(automaticallyImplyLeading: back, actions: const [A11yAction()], shape: const Border(), backgroundColor: Colors.transparent, scrolledUnderElevation: 0),
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 480),
            child: ListView(padding: const EdgeInsets.fromLTRB(20, 0, 20, 32), children: [const _Brand(), const SizedBox(height: 24), ...children]),
          ),
        ),
      ),
    );
  }
}

/// Dirección del sistema de la clínica (se pide una vez; se puede cambiar desde el ingreso).
class ServerPage extends ConsumerStatefulWidget {
  const ServerPage({super.key});
  @override
  ConsumerState<ServerPage> createState() => _ServerPageState();
}

class _ServerPageState extends ConsumerState<ServerPage> {
  late final _c = TextEditingController(text: ref.read(serverProvider) ?? '');
  String? _error;
  bool _busy = false;

  Future<void> _save() async {
    final origin = normalizeServer(_c.text);
    if (origin == null) return setState(() => _error = 'Revise la dirección: debe verse como https://agenda.clinicasparedes.ec');
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      // Se comprueba que de verdad sea el sistema de la clínica antes de guardarlo.
      await Api(origin, null).get<Json>('/health');
      await ref.read(serverProvider.notifier).set(origin);
      ref.invalidate(sessionProvider);
      if (mounted) context.go('/ingresar');
    } catch (e) {
      setState(() => _error = 'No se pudo conectar con $origin. Revise que el teléfono tenga internet o esté en la red de la clínica.');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return _AuthScaffold(back: context.canPop(), children: [
      Text('¿Dónde está el sistema de la clínica?', style: Theme.of(context).textTheme.headlineSmall),
      const SizedBox(height: 8),
      const Text('Escriba la dirección que le dio la clínica. Solo se pide una vez.'),
      const SizedBox(height: 20),
      TextField(
        controller: _c,
        keyboardType: TextInputType.url,
        autocorrect: false,
        decoration: InputDecoration(labelText: 'Dirección del sistema', hintText: 'https://agenda.clinicasparedes.ec', errorText: _error, errorMaxLines: 3),
        onSubmitted: (_) => _save(),
      ),
      const SizedBox(height: 8),
      Text('En la red de la clínica también sirve la IP, por ejemplo 192.168.1.20:3000', style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant)),
      const SizedBox(height: 20),
      FilledButton.icon(onPressed: _busy ? null : _save, icon: _busy ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2.5)) : const Icon(Icons.check), label: const Text('Guardar y seguir')),
    ]);
  }
}

/// Un solo ingreso para pacientes (cédula o pasaporte) y personal (usuario).
class LoginPage extends ConsumerStatefulWidget {
  const LoginPage({super.key});
  @override
  ConsumerState<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends ConsumerState<LoginPage> {
  final _id = TextEditingController();
  final _pw = TextEditingController();
  bool _show = false;
  bool _busy = false;
  String? _error;

  Future<void> _submit() async {
    if (_id.text.trim().isEmpty || _pw.text.isEmpty) return setState(() => _error = 'Escriba su usuario o documento y su contraseña.');
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref.read(sessionProvider.notifier).signIn(_id.text, _pw.text);
    } catch (e) {
      if (mounted) setState(() => _error = errorText(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    final h = DateTime.now().toUtc().subtract(const Duration(hours: 5)).hour;
    final greeting = h < 12 ? 'Buenos días' : (h < 19 ? 'Buenas tardes' : 'Buenas noches');
    return _AuthScaffold(children: [
      Text('$greeting.', style: Theme.of(context).textTheme.headlineMedium),
      const SizedBox(height: 6),
      Text('Pacientes: su cédula o pasaporte. Personal: el usuario que le dio la dirección.', style: TextStyle(color: muted)),
      const SizedBox(height: 24),
      if (_error != null) ...[Notice(tone: Tone.danger, body: _error), const SizedBox(height: 16)],
      AutofillGroup(
        child: Column(children: [
          TextField(
            controller: _id,
            autofillHints: const [AutofillHints.username],
            textInputAction: TextInputAction.next,
            autocorrect: false,
            decoration: const InputDecoration(labelText: 'Usuario, cédula o pasaporte', prefixIcon: Icon(Icons.person_outline)),
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _pw,
            obscureText: !_show,
            autofillHints: const [AutofillHints.password],
            textInputAction: TextInputAction.done,
            onSubmitted: (_) => _submit(),
            decoration: InputDecoration(
              labelText: 'Contraseña',
              prefixIcon: const Icon(Icons.lock_outline),
              suffixIcon: IconButton(tooltip: _show ? 'Ocultar contraseña' : 'Mostrar contraseña', onPressed: () => setState(() => _show = !_show), icon: Icon(_show ? Icons.visibility_off : Icons.visibility)),
            ),
          ),
        ]),
      ),
      const SizedBox(height: 20),
      FilledButton.icon(
        onPressed: _busy ? null : _submit,
        icon: _busy ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2.5)) : const Icon(Icons.login),
        label: const Text('Ingresar'),
      ),
      const SizedBox(height: 16),
      Wrap(crossAxisAlignment: WrapCrossAlignment.center, children: [
        const Text('¿Es paciente y no tiene cuenta?'),
        TextButton(onPressed: () => context.push('/registro'), child: const Text('Crear mi cuenta')),
      ]),
      Text('¿Olvidó su contraseña? Pacientes: llamen a su clínica. Personal: pídala a la dirección.', style: TextStyle(color: muted, fontSize: 13)),
      const SizedBox(height: 24),
      Row(children: [
        Icon(Icons.dns_outlined, size: 16, color: muted),
        const SizedBox(width: 6),
        Expanded(child: Text(ref.watch(serverProvider) ?? '', style: TextStyle(color: muted, fontSize: 13), overflow: TextOverflow.ellipsis)),
        TextButton(onPressed: () => context.push('/servidor'), child: const Text('Cambiar')),
      ]),
    ]);
  }
}

/// Registro del paciente en dos pasos: sus datos, y contraseña con el aviso de privacidad.
class RegisterPage extends ConsumerStatefulWidget {
  const RegisterPage({super.key});
  @override
  ConsumerState<RegisterPage> createState() => _RegisterPageState();
}

class _RegisterPageState extends ConsumerState<RegisterPage> {
  int _step = 0;
  String _docType = 'CEDULA';
  final _doc = TextEditingController();
  final _first = TextEditingController();
  final _last = TextEditingController();
  final _phone = TextEditingController();
  final _email = TextEditingController();
  final _pw = TextEditingController();
  final _pw2 = TextEditingController();
  String? _birth;
  bool _accept = false;
  Object? _error;
  bool _busy = false;

  static const _step1 = {'documentType', 'documentNumber', 'firstNames', 'lastNames', 'birthDate', 'phone', 'email'};

  Future<void> _submit() async {
    if (_pw.text != _pw2.text) return setState(() => _error = ApiError(400, 'VALIDATION', 'Las contraseñas no coinciden.', {'password2': 'No coincide con la contraseña.'}));
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final r = await ref.read(apiProvider).post<Json>('/portal/register', body: {
        'documentType': _docType,
        'documentNumber': _doc.text.trim(),
        'firstNames': _first.text.trim(),
        'lastNames': _last.text.trim(),
        'birthDate': _birth ?? '',
        'phone': _phone.text.trim(),
        'email': _email.text.trim().isEmpty ? null : _email.text.trim(),
        'password': _pw.text,
        'acceptPrivacy': _accept,
      });
      await ref.read(sessionProvider.notifier).registered(r['accessToken'] as String);
    } catch (e) {
      setState(() {
        _error = e;
        // Si el error es de los datos del paso 1, se vuelve a ese paso.
        if (e is ApiError && e.fields.keys.any(_step1.contains)) _step = 0;
      });
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    String? err(String f) => fieldError(_error, f);
    final general = _error is ApiError ? (_error as ApiError).message : (_error == null ? null : errorText(_error!));
    return _AuthScaffold(back: true, children: [
      Text('Crear mi cuenta', style: Theme.of(context).textTheme.headlineSmall),
      const SizedBox(height: 4),
      Text('Paso ${_step + 1} de 2: ${_step == 0 ? 'sus datos' : 'su contraseña'}'),
      const SizedBox(height: 8),
      LinearProgressIndicator(value: (_step + 1) / 2),
      const SizedBox(height: 20),
      if (general != null) ...[Notice(tone: Tone.danger, body: general), const SizedBox(height: 16)],
      if (_step == 0) ...[
        SegmentedButton<String>(
          showSelectedIcon: false,
          segments: const [ButtonSegment(value: 'CEDULA', label: Text('Cédula')), ButtonSegment(value: 'PASAPORTE', label: Text('Pasaporte'))],
          selected: {_docType},
          onSelectionChanged: (s) => setState(() => _docType = s.first),
        ),
        const SizedBox(height: 16),
        TextField(controller: _doc, keyboardType: _docType == 'CEDULA' ? TextInputType.number : TextInputType.text, decoration: InputDecoration(labelText: _docType == 'CEDULA' ? 'Número de cédula' : 'Número de pasaporte', errorText: err('documentNumber'))),
        const SizedBox(height: 16),
        TextField(controller: _first, textCapitalization: TextCapitalization.words, decoration: InputDecoration(labelText: 'Nombres', errorText: err('firstNames'))),
        const SizedBox(height: 16),
        TextField(controller: _last, textCapitalization: TextCapitalization.words, decoration: InputDecoration(labelText: 'Apellidos', errorText: err('lastNames'))),
        const SizedBox(height: 16),
        DateField(label: 'Fecha de nacimiento', value: _birth, onChanged: (v) => setState(() => _birth = v), error: err('birthDate'), firstYear: 1900, lastDate: DateTime.now()),
        const SizedBox(height: 16),
        TextField(controller: _phone, keyboardType: TextInputType.phone, decoration: InputDecoration(labelText: 'Celular', hintText: '099 123 4567', errorText: err('phone'))),
        const SizedBox(height: 16),
        TextField(controller: _email, keyboardType: TextInputType.emailAddress, decoration: InputDecoration(labelText: 'Correo (opcional)', errorText: err('email'))),
        const SizedBox(height: 20),
        FilledButton(onPressed: () => setState(() => _step = 1), child: const Text('Seguir')),
      ] else ...[
        TextField(controller: _pw, obscureText: true, decoration: InputDecoration(labelText: 'Contraseña', helperText: 'Al menos 8 caracteres, con letras y números', errorText: err('password'))),
        const SizedBox(height: 16),
        TextField(controller: _pw2, obscureText: true, decoration: InputDecoration(labelText: 'Repita la contraseña', errorText: err('password2'))),
        const SizedBox(height: 12),
        CheckboxListTile(
          contentPadding: EdgeInsets.zero,
          controlAffinity: ListTileControlAffinity.leading,
          value: _accept,
          onChanged: (v) => setState(() => _accept = v == true),
          title: const Text('Acepto que Clínicas Paredes guarde mis datos para darme citas y atenderme.'),
          subtitle: err('acceptPrivacy') == null ? const Text('Sus datos no se comparten con nadie más.') : Text(err('acceptPrivacy')!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
        ),
        const SizedBox(height: 16),
        Row(children: [
          OutlinedButton(onPressed: () => setState(() => _step = 0), child: const Text('Atrás')),
          const SizedBox(width: 12),
          Expanded(child: FilledButton(onPressed: _busy || !_accept ? null : _submit, child: Text(_busy ? 'Creando…' : 'Crear mi cuenta'))),
        ]),
      ],
    ]);
  }
}

/// Campo de fecha ("AAAA-MM-DD") con el calendario del teléfono.
class DateField extends StatelessWidget {
  const DateField({super.key, required this.label, required this.value, required this.onChanged, this.error, this.firstYear = 2020, this.lastDate, this.firstDate});
  final String label;
  final String? value;
  final ValueChanged<String> onChanged;
  final String? error;
  final int firstYear;
  final DateTime? firstDate;
  final DateTime? lastDate;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      borderRadius: BorderRadius.circular(10),
      onTap: () async {
        final now = DateTime.now();
        final initial = value != null ? dayToDate(value!).toLocal() : (lastDate != null && lastDate!.isBefore(now) ? DateTime(now.year - 30) : now);
        final d = await showDatePicker(
          context: context,
          initialDate: initial,
          firstDate: firstDate ?? DateTime(firstYear),
          lastDate: lastDate ?? DateTime(now.year + 2),
          locale: const Locale('es', 'EC'),
          helpText: label,
        );
        if (d != null) onChanged(dateOnly(d));
      },
      child: InputDecorator(
        decoration: InputDecoration(labelText: label, errorText: error, suffixIcon: const Icon(Icons.calendar_today)),
        child: Text(value == null ? 'Elegir fecha' : shortDate('${value}T17:00:00Z')),
      ),
    );
  }
}

/// El personal con contraseña temporal debe elegir una propia antes de usar el sistema.
class ForcePasswordPage extends ConsumerWidget {
  const ForcePasswordPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return _AuthScaffold(children: [
      Text('Elija su contraseña', style: Theme.of(context).textTheme.headlineSmall),
      const SizedBox(height: 6),
      const Text('Está usando una contraseña temporal. Elija una propia para seguir.'),
      const SizedBox(height: 20),
      ChangePasswordForm(
        path: '/auth/change-password',
        onDone: () => ref.read(sessionProvider.notifier).refreshUser(),
      ),
      const SizedBox(height: 12),
      TextButton(onPressed: () => ref.read(sessionProvider.notifier).signOut(), child: const Text('Salir')),
    ]);
  }
}

/// Cambiar la contraseña (personal o paciente).
class ChangePasswordForm extends ConsumerStatefulWidget {
  const ChangePasswordForm({super.key, required this.path, this.onDone});
  final String path;
  final VoidCallback? onDone;
  @override
  ConsumerState<ChangePasswordForm> createState() => _ChangePasswordFormState();
}

class _ChangePasswordFormState extends ConsumerState<ChangePasswordForm> {
  final _cur = TextEditingController();
  final _new = TextEditingController();
  final _rep = TextEditingController();
  Object? _error;

  @override
  Widget build(BuildContext context) {
    String? err(String f) => fieldError(_error, f);
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      if (_error != null && err('currentPassword') == null && err('newPassword') == null) ...[Notice(tone: Tone.danger, body: errorText(_error!)), const SizedBox(height: 12)],
      TextField(controller: _cur, obscureText: true, decoration: InputDecoration(labelText: 'Contraseña actual', errorText: err('currentPassword'))),
      const SizedBox(height: 14),
      TextField(controller: _new, obscureText: true, decoration: InputDecoration(labelText: 'Contraseña nueva', helperText: 'Al menos 8 caracteres, con letras y números', errorText: err('newPassword'))),
      const SizedBox(height: 14),
      TextField(controller: _rep, obscureText: true, decoration: const InputDecoration(labelText: 'Repita la nueva')),
      const SizedBox(height: 16),
      BusyButton(
        label: 'Cambiar contraseña',
        icon: Icons.key,
        onPressed: () async {
          if (_new.text != _rep.text) return setState(() => _error = ApiError(400, 'VALIDATION', 'La contraseña nueva no coincide al repetirla.'));
          setState(() => _error = null);
          try {
            await ref.read(apiProvider).post<Json>(widget.path, body: {'currentPassword': _cur.text, 'newPassword': _new.text});
            _cur.clear();
            _new.clear();
            _rep.clear();
            if (context.mounted) showMessage(context, 'Contraseña cambiada.');
            widget.onDone?.call();
          } catch (e) {
            setState(() => _error = e);
          }
        },
      ),
    ]);
  }
}
