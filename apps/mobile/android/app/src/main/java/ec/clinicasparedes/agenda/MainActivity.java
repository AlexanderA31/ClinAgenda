package ec.clinicasparedes.agenda;

import android.app.DownloadManager;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.print.PrintAttributes;
import android.print.PrintManager;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.URLUtil;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.widget.Toast;
import androidx.activity.OnBackPressedCallback;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.Locale;

/**
 * La app es el mismo sistema web de la clínica abierto dentro de la app, sin navegador.
 * Aquí se agrega lo que un WebView de Android no trae solo:
 *  - La dirección del servidor de la clínica: se guarda en el teléfono y solo esa se abre dentro de la app;
 *    WhatsApp, mapas, teléfono y demás enlaces se abren en su propia app.
 *  - Sin conexión: vuelve a la pantalla local (www/index.html) con "Intentar de nuevo" y "Cambiar dirección".
 *  - Descargas (comprobantes, recetas, resultados): van a Descargas usando la sesión de la persona.
 *  - Imprimir (window.print) usa el servicio de impresión de Android.
 *  - Leer en voz alta (speechSynthesis, que el WebView no trae) usa la voz del teléfono.
 *  - Atrás: vuelve a la pantalla anterior y, en la primera, sale de la app.
 */
public class MainActivity extends BridgeActivity {

    private static final String PREFS = "clinagenda";
    private static final String KEY_SERVIDOR = "servidor";

    private SharedPreferences prefs;
    private TextToSpeech voz;
    private volatile boolean vozLista = false;
    /** Página que se está mostrando; la interfaz nativa la usa para saber quién la llama (se lee desde otro hilo). */
    private volatile String paginaActual = "";

    /** Antes de que el puente cargue la primera página: la interfaz y el script deben existir desde esa carga. */
    @Override
    protected void load() {
        prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        WebView web = findViewById(com.getcapacitor.android.R.id.webview);
        web.addJavascriptInterface(new Nativo(), "ClinAgendaNativo");
        if (WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
            WebViewCompat.addDocumentStartJavaScript(web, leerAsset("puente.js"), Collections.singleton("*"));
        }
        super.load();

        bridge.setWebViewClient(new Cliente(bridge));
        web.setDownloadListener((url, userAgent, disposition, mime, length) -> descargar(url, userAgent, disposition, mime));
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (web.canGoBack()) web.goBack();
                else moveTaskToBack(true);
            }
        });
        voz = new TextToSpeech(this, estado -> {
            if (estado != TextToSpeech.SUCCESS) return;
            int r = voz.setLanguage(Locale.forLanguageTag("es-EC"));
            if (r < 0) r = voz.setLanguage(Locale.forLanguageTag("es"));
            vozLista = r >= 0;
            voz.setOnUtteranceProgressListener(new AvisoDeVoz());
        });
    }

    @Override
    public void onDestroy() {
        if (voz != null) voz.shutdown();
        super.onDestroy();
    }

    private String leerAsset(String nombre) {
        try (InputStream in = getAssets().open(nombre); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            byte[] buf = new byte[8192];
            for (int n; (n = in.read(buf)) > 0; ) out.write(buf, 0, n);
            return out.toString(StandardCharsets.UTF_8.name());
        } catch (IOException e) {
            throw new IllegalStateException("Falta " + nombre + " en la app", e);
        }
    }

    /** La dirección guardada, o la que vino al compilar el APK (puede ser vacía: entonces la app la pide). */
    private String servidor() {
        return prefs.getString(KEY_SERVIDOR, BuildConfig.SERVIDOR_POR_DEFECTO);
    }

    private boolean esDelServidor(Uri url) {
        String s = servidor();
        if (s == null || s.isEmpty()) return false;
        Uri srv = Uri.parse(s);
        return (
            srv.getScheme() != null &&
            srv.getScheme().equals(url.getScheme()) &&
            srv.getHost() != null &&
            srv.getHost().equalsIgnoreCase(url.getHost()) &&
            srv.getPort() == url.getPort()
        );
    }

    private boolean esLocal(String url) {
        return url != null && url.startsWith(bridge.getLocalUrl());
    }

    /** Navegación: el servidor de la clínica adentro; lo demás según Capacitor (otras apps). Sin conexión: pantalla local. */
    private class Cliente extends BridgeWebViewClient {

        Cliente(Bridge bridge) {
            super(bridge);
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            if (esDelServidor(request.getUrl())) return false;
            return super.shouldOverrideUrlLoading(view, request);
        }

        @Override
        public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
            paginaActual = url == null ? "" : url;
            super.onPageStarted(view, url, favicon);
        }

        @Override
        public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
            super.onReceivedError(view, request, error);
            if (!request.isForMainFrame() || esLocal(request.getUrl().toString())) return;
            String desde = Uri.encode(request.getUrl().toString());
            view.loadUrl(bridge.getLocalUrl() + "/index.html?sin-conexion=1&desde=" + desde);
        }
    }

    private void descargar(String url, String userAgent, String disposition, String mime) {
        if (!url.startsWith("http")) {
            Toast.makeText(this, "Este archivo no se puede descargar desde la app.", Toast.LENGTH_LONG).show();
            return;
        }
        String nombre = URLUtil.guessFileName(url, disposition, mime);
        DownloadManager.Request req = new DownloadManager.Request(Uri.parse(url));
        // La sesión es una cookie: sin ella el servidor no entrega el archivo.
        String cookies = CookieManager.getInstance().getCookie(url);
        if (cookies != null) req.addRequestHeader("Cookie", cookies);
        req.addRequestHeader("User-Agent", userAgent);
        req.setMimeType(mime);
        req.setTitle(nombre);
        req.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            req.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, nombre);
        } else {
            // Android 9 o anterior: carpeta de la app, que no pide permiso de almacenamiento.
            req.setDestinationInExternalFilesDir(this, Environment.DIRECTORY_DOWNLOADS, nombre);
        }
        DownloadManager dm = getSystemService(DownloadManager.class);
        if (dm == null) return;
        dm.enqueue(req);
        Toast.makeText(this, "Descargando " + nombre + " en Descargas", Toast.LENGTH_LONG).show();
    }

    private void imprimir() {
        WebView web = bridge.getWebView();
        PrintManager pm = getSystemService(PrintManager.class);
        if (pm == null) return;
        String titulo = web.getTitle() == null || web.getTitle().isEmpty() ? "Clínicas Paredes" : web.getTitle();
        pm.print(titulo, web.createPrintDocumentAdapter(titulo), new PrintAttributes.Builder().build());
    }

    /** Avisa a la página cuando la voz empieza o termina cada frase (los avisos llegan en otro hilo). */
    private class AvisoDeVoz extends UtteranceProgressListener {

        private void avisar(String id, String evento) {
            WebView web = bridge.getWebView();
            web.post(() -> web.evaluateJavascript("window.__clinagendaVoz && window.__clinagendaVoz(" + Integer.parseInt(id) + ",'" + evento + "')", null));
        }

        @Override
        public void onStart(String id) {
            avisar(id, "start");
        }

        @Override
        public void onDone(String id) {
            avisar(id, "end");
        }

        @Override
        public void onError(String id) {
            avisar(id, "error");
        }

        @Override
        public void onStop(String id, boolean interrumpida) {
            avisar(id, "canceled");
        }
    }

    /** Lo que la página puede pedirle al teléfono. Solo cosas inofensivas; cambiar el servidor, solo desde la pantalla local. */
    private class Nativo {

        @JavascriptInterface
        public String servidor() {
            return MainActivity.this.servidor();
        }

        @JavascriptInterface
        public boolean guardarServidor(String origen) {
            if (!esLocal(paginaActual)) return false;
            Uri u = Uri.parse(origen);
            if (u.getHost() == null || !("http".equals(u.getScheme()) || "https".equals(u.getScheme()))) return false;
            prefs.edit().putString(KEY_SERVIDOR, origen).apply();
            return true;
        }

        @JavascriptInterface
        public boolean hayVoz() {
            return vozLista;
        }

        @JavascriptInterface
        public void hablar(int id, String texto, float velocidad) {
            if (!vozLista) return;
            voz.setSpeechRate(Math.max(0.5f, Math.min(2f, velocidad)));
            voz.speak(texto, TextToSpeech.QUEUE_ADD, null, String.valueOf(id));
        }

        @JavascriptInterface
        public void callar() {
            if (voz != null) voz.stop();
        }

        @JavascriptInterface
        public void imprimir() {
            runOnUiThread(MainActivity.this::imprimir);
        }
    }
}
