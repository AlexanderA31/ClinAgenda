import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:open_filex/open_filex.dart';
import 'package:path_provider/path_provider.dart';

import 'config.dart';

typedef Json = Map<String, dynamic>;

/// Error de la API con el mensaje en español y los campos a corregir (forma `ApiError` del servidor).
class ApiError implements Exception {
  ApiError(this.status, this.code, this.message, [this.fields = const {}, this.details]);
  final int status;
  final String code;
  final String message;
  final Map<String, String> fields;

  /// Datos extra del error (por ejemplo, los pacientes parecidos de POSSIBLE_DUPLICATE).
  final Object? details;

  bool get offline => status == 0;

  @override
  String toString() => message;
}

String errorText(Object e) => e is ApiError ? e.message : 'Algo salió mal. Intente de nuevo.';

/// Cliente único hacia el servidor de la clínica. La sesión viaja como `Authorization: Bearer`.
class Api {
  Api(this.baseUrl, this.token, {this.onUnauthorized})
      : _dio = Dio(BaseOptions(
          baseUrl: '$baseUrl/api',
          connectTimeout: const Duration(seconds: 12),
          receiveTimeout: const Duration(seconds: 30),
          headers: {if (token != null) 'Authorization': 'Bearer $token'},
          validateStatus: (_) => true,
        ));

  final String baseUrl;
  final String? token;
  final void Function()? onUnauthorized;
  final Dio _dio;

  Future<T> get<T>(String path, {Map<String, Object?>? query}) => _send<T>('GET', path, query: query);
  Future<T> post<T>(String path, {Object? body, Map<String, String>? headers}) => _send<T>('POST', path, body: body, headers: headers);
  Future<T> put<T>(String path, {Object? body}) => _send<T>('PUT', path, body: body);
  Future<T> patch<T>(String path, {Object? body}) => _send<T>('PATCH', path, body: body);
  Future<T> delete<T>(String path) => _send<T>('DELETE', path);

  Future<T> _send<T>(String method, String path, {Map<String, Object?>? query, Object? body, Map<String, String>? headers}) async {
    final q = <String, Object>{};
    query?.forEach((k, v) {
      if (v != null && v != '') q[k] = v;
    });
    Response res;
    try {
      res = await _dio.request(path, data: body, queryParameters: q, options: Options(method: method, headers: headers));
    } on DioException {
      throw ApiError(0, 'OFFLINE', 'No hay conexión con el sistema de la clínica. Revise el internet e intente de nuevo.');
    }
    final status = res.statusCode ?? 0;
    if (status == 401 && !path.startsWith('/auth/') && !path.startsWith('/portal/login')) onUnauthorized?.call();
    if (status == 502 || status == 503 || status == 504) {
      throw ApiError(0, 'OFFLINE', 'El sistema de la clínica no responde en este momento. Intente en unos minutos.');
    }
    if (status < 200 || status >= 300) {
      final data = res.data;
      if (data is Map) {
        final fields = <String, String>{};
        (data['fields'] as Map?)?.forEach((k, v) => fields['$k'] = '$v');
        throw ApiError(status, '${data['code'] ?? 'HTTP_$status'}', '${data['message'] ?? 'No se pudo completar la acción.'}', fields, data['details']);
      }
      throw ApiError(status, 'HTTP_$status', 'No se pudo completar la acción.');
    }
    return res.data as T;
  }

  /// Descarga un archivo con la sesión (comprobante, receta, resultado) y lo abre con la app del teléfono.
  Future<void> openFile(String path, String filename) async {
    final dir = await getTemporaryDirectory();
    final safe = filename.replaceAll(RegExp(r'[^\w.\-]+'), '_');
    final file = File('${dir.path}/$safe');
    Response res;
    try {
      res = await _dio.get(path, options: Options(responseType: ResponseType.bytes));
    } on DioException {
      throw ApiError(0, 'OFFLINE', 'No hay conexión con el sistema de la clínica.');
    }
    if ((res.statusCode ?? 0) != 200) throw ApiError(res.statusCode ?? 0, 'HTTP', 'No se pudo descargar el archivo.');
    await file.writeAsBytes(res.data as List<int>);
    final r = await OpenFilex.open(file.path);
    if (r.type != ResultType.done) throw ApiError(0, 'OPEN', 'No hay una app para abrir este archivo en el teléfono (${r.message}).');
  }

  /// Sube un archivo (resultados de la ficha, CSV para importar).
  Future<T> upload<T>(String path, File file, {Map<String, String> fields = const {}, Map<String, Object?>? query}) async {
    final form = FormData.fromMap({...fields, 'file': await MultipartFile.fromFile(file.path, filename: file.uri.pathSegments.last)});
    return _send<T>('POST', path, body: form, query: query);
  }
}

/// Lo cambia la sesión: cada vez que ingresa o sale alguien, se crea un cliente con su token.
final tokenProvider = StateProvider<String?>((ref) => null);
final unauthorizedProvider = StateProvider<int>((ref) => 0);

final apiProvider = Provider<Api>((ref) {
  final server = ref.watch(serverProvider) ?? '';
  final token = ref.watch(tokenProvider);
  return Api(server, token, onUnauthorized: () => ref.read(unauthorizedProvider.notifier).state++);
});
