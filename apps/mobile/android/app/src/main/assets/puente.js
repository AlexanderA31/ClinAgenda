// Se inyecta en cada página antes de que cargue (MainActivity). Conecta la web con el teléfono:
//  - window.print() -> servicio de impresión de Android.
//  - speechSynthesis -> la voz del teléfono (TextToSpeech). El WebView de Android no trae voz propia,
//    así que el botón "Leer en voz alta" de la web funciona igual que en el navegador.
// Implementa solo lo que usa la web (components/layout/read-aloud.ts): speak, cancel, pause, resume y getVoices.
(function () {
  var N = window.ClinAgendaNativo;
  if (!N || window.__clinagendaPuente) return;
  window.__clinagendaPuente = true;

  window.print = function () {
    N.imprimir();
  };

  var seq = 0;
  var cola = []; // frases enviadas y aún no terminadas, en orden: { id, u }
  var voz = { name: 'Voz del teléfono', lang: 'es-EC', localService: true, default: true, voiceURI: 'android-tts' };

  function avisar(u, tipo, extra) {
    var e = { type: tipo, utterance: u };
    if (extra) e.error = extra;
    try {
      if (typeof u['on' + tipo] === 'function') u['on' + tipo](e);
      (u._oyentes[tipo] || []).forEach(function (fn) { fn(e); });
    } catch (err) {
      setTimeout(function () { throw err; });
    }
  }

  function Frase(texto) {
    this.text = texto == null ? '' : String(texto);
    this.lang = '';
    this.voice = null;
    this.rate = 1;
    this.pitch = 1;
    this.volume = 1;
    this.onstart = this.onend = this.onerror = this.onpause = this.onresume = this.onboundary = this.onmark = null;
    this._oyentes = {};
  }
  Frase.prototype.addEventListener = function (tipo, fn) {
    (this._oyentes[tipo] = this._oyentes[tipo] || []).push(fn);
  };
  Frase.prototype.removeEventListener = function (tipo, fn) {
    this._oyentes[tipo] = (this._oyentes[tipo] || []).filter(function (f) { return f !== fn; });
  };

  function enviar(x) {
    N.hablar(x.id, x.u.text, Number(x.u.rate) || 1);
  }

  var synth = {
    speaking: false,
    pending: false,
    paused: false,
    onvoiceschanged: null,
    getVoices: function () {
      return N.hayVoz() ? [voz] : [];
    },
    speak: function (u) {
      if (!N.hayVoz()) {
        setTimeout(function () { avisar(u, 'error', 'synthesis-unavailable'); });
        return;
      }
      var x = { id: ++seq, u: u };
      cola.push(x);
      synth.speaking = true;
      if (!synth.paused) enviar(x);
    },
    cancel: function () {
      var antes = cola;
      cola = [];
      synth.speaking = false;
      synth.paused = false;
      N.callar();
      antes.forEach(function (x) { avisar(x.u, 'error', 'canceled'); });
    },
    // La voz de Android no se puede pausar: se detiene y, al seguir, se repite la frase en curso.
    pause: function () {
      if (synth.paused) return;
      synth.paused = true;
      N.callar();
    },
    resume: function () {
      if (!synth.paused) return;
      synth.paused = false;
      cola.forEach(enviar);
    },
    addEventListener: function () {},
    removeEventListener: function () {},
  };

  // Avisos del teléfono: "start", "end", "error" o "canceled" (este último lo manejan cancel y pause).
  window.__clinagendaVoz = function (id, evento) {
    if (evento === 'canceled') return;
    var i = cola.findIndex(function (x) { return x.id === id; });
    if (i < 0) return;
    var x = cola[i];
    if (evento === 'start') return avisar(x.u, 'start');
    cola.splice(i, 1);
    synth.speaking = cola.length > 0;
    avisar(x.u, evento === 'end' ? 'end' : 'error', evento === 'end' ? undefined : 'synthesis-failed');
  };

  try {
    Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true, writable: true });
    window.SpeechSynthesisUtterance = Frase;
  } catch (e) {
    // Si el WebView no deja reemplazarla, la web simplemente no ofrece leer en voz alta.
  }
})();
