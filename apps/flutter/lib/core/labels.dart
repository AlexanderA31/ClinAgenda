// Etiquetas en español: las mismas de packages/schemas (enums.ts y permissions.ts).

const statusLabels = {
  'REQUESTED': 'Por confirmar',
  'SCHEDULED': 'Agendada',
  'ATTENDED': 'Atendida',
  'NO_SHOW': 'No asistió',
  'CANCELLED': 'Cancelada',
};

const cancelReasonLabels = {
  'PACIENTE_LLAMO': 'El paciente avisó que no viene',
  'MEDICO_NO_DISPONIBLE': 'El médico no puede atender',
  'ERROR_AL_AGENDAR': 'Se agendó por error',
  'REPROGRAMADA': 'Se cambió a otra fecha',
  'PACIENTE_WEB': 'El paciente canceló desde su enlace',
  'SOLICITUD_RECHAZADA': 'La clínica no pudo aceptar la solicitud',
  'OTRO': 'Otro motivo',
};

/// Los que el personal puede elegir (PACIENTE_WEB y SOLICITUD_RECHAZADA los pone el sistema).
const staffCancelReasons = ['PACIENTE_LLAMO', 'MEDICO_NO_DISPONIBLE', 'ERROR_AL_AGENDAR', 'REPROGRAMADA', 'OTRO'];

const roleLabels = {'ADMIN': 'Dirección', 'RECEPCION': 'Recepción', 'MEDICO': 'Médico'};

const documentTypeLabels = {'CEDULA': 'Cédula', 'PASAPORTE': 'Pasaporte', 'SIN_DOCUMENTO': 'Sin documento'};
const sexLabels = {'F': 'Femenino', 'M': 'Masculino', 'X': 'Otro / prefiere no decir'};

const weekdayLabels = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

const waitlistStatusLabels = {'WAITING': 'Esperando', 'OFFERED': 'Se le ofreció', 'BOOKED': 'Ya tiene cita', 'REMOVED': 'Quitado'};

const bloodTypes = ['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-'];

class PermissionInfo {
  const PermissionInfo(this.key, this.group, this.label);
  final String key;
  final String group;
  final String label;
}

const permissions = [
  PermissionInfo('citas.agendar', 'Citas', 'Dar, reprogramar, cancelar y recuperar citas'),
  PermissionInfo('citas.estado', 'Citas', 'Marcar si el paciente asistió o no'),
  PermissionInfo('citas.notas', 'Citas', 'Escribir notas clínicas (un médico, solo en sus citas)'),
  PermissionInfo('recordatorios.gestionar', 'Citas', 'Enviar y marcar recordatorios'),
  PermissionInfo('lista_espera.gestionar', 'Citas', 'Manejar la lista de espera'),
  PermissionInfo('pacientes.editar', 'Pacientes', 'Registrar y corregir pacientes'),
  PermissionInfo('pacientes.fusionar', 'Pacientes', 'Unir pacientes duplicados'),
  PermissionInfo('fichas.editar', 'Pacientes', 'Escribir en la ficha médica: antecedentes y consultas (no aplica a recepción)'),
  PermissionInfo('panel.ver', 'Información', 'Ver el panel de cifras'),
  PermissionInfo('medicos.gestionar', 'Clínicas y médicos', 'Crear médicos y cambiar sus horarios'),
  PermissionInfo('clinicas.gestionar', 'Clínicas y médicos', 'Cambiar horarios y cierres de las clínicas'),
  PermissionInfo('usuarios.gestionar', 'Administración', 'Crear usuarios, cambiar contraseñas y bloquear accesos'),
  PermissionInfo('roles.gestionar', 'Administración', 'Crear roles y decidir sus permisos'),
  PermissionInfo('auditoria.ver', 'Administración', 'Ver la bitácora de cambios'),
  PermissionInfo('datos.importar', 'Administración', 'Importar datos desde archivos'),
  PermissionInfo('sistema.ver', 'Administración', 'Ver el estado del sistema y los respaldos'),
];

const scopeLabels = {
  'ADMIN': ('Ve toda la información', 'Ve todas las agendas, pacientes, notas clínicas y fichas médicas.'),
  'RECEPCION': ('Sus clínicas, sin notas clínicas', 'Da y maneja citas en las clínicas donde trabaja y ve a todos los pacientes, pero no las notas clínicas ni la ficha médica.'),
  'MEDICO': ('Ve solo su agenda', 'Ve únicamente sus citas y sus pacientes, con su ficha médica. Se vincula a una ficha de médico.'),
};
