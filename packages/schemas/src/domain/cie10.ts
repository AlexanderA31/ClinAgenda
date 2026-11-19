import { normalizeForSearch } from '../validators/text';

/**
 * Diagnósticos CIE-10 (OMS) más usados en medicina familiar, pediatría y consulta general.
 * No es el catálogo completo (más de 12 000 códigos): sirve para buscar rápido por nombre o código.
 * Se acepta cualquier código bien escrito; si no está en esta lista, la web lo avisa para revisarlo.
 */
export const CIE10_COMMON: readonly (readonly [code: string, label: string])[] = [
  ['A09', 'Diarrea y gastroenteritis de presunto origen infeccioso'],
  ['A90', 'Fiebre del dengue (dengue clásico)'],
  ['A91', 'Fiebre del dengue hemorrágico'],
  ['B00.1', 'Herpes simple labial'],
  ['B01.9', 'Varicela sin complicaciones'],
  ['B02.9', 'Herpes zóster sin complicaciones'],
  ['B07', 'Verrugas víricas'],
  ['B35.1', 'Tiña de las uñas (onicomicosis)'],
  ['B35.3', 'Tiña del pie'],
  ['B35.4', 'Tiña del cuerpo'],
  ['B36.0', 'Pitiriasis versicolor'],
  ['B37.0', 'Estomatitis candidiásica (muguet)'],
  ['B37.3', 'Candidiasis de la vulva y de la vagina'],
  ['B77.9', 'Ascariasis, sin otra especificación'],
  ['B82.9', 'Parasitosis intestinal, sin otra especificación'],
  ['B85.0', 'Pediculosis de la cabeza'],
  ['B86', 'Escabiosis (sarna)'],
  ['D50.9', 'Anemia por deficiencia de hierro, sin otra especificación'],
  ['D64.9', 'Anemia de tipo no especificado'],
  ['E03.9', 'Hipotiroidismo, no especificado'],
  ['E05.9', 'Hipertiroidismo, no especificado'],
  ['E10.9', 'Diabetes mellitus tipo 1 sin complicaciones'],
  ['E11.9', 'Diabetes mellitus tipo 2 sin complicaciones'],
  ['E46', 'Desnutrición proteicocalórica, no especificada'],
  ['E55.9', 'Deficiencia de vitamina D, no especificada'],
  ['E66.9', 'Obesidad, no especificada'],
  ['E78.0', 'Hipercolesterolemia pura'],
  ['E78.1', 'Hipertrigliceridemia pura'],
  ['E78.5', 'Hiperlipidemia, no especificada'],
  ['E79.0', 'Hiperuricemia sin signos de artritis'],
  ['E86', 'Deshidratación'],
  ['F17.2', 'Dependencia del tabaco'],
  ['F32.9', 'Episodio depresivo, no especificado'],
  ['F41.1', 'Trastorno de ansiedad generalizada'],
  ['F41.9', 'Trastorno de ansiedad, no especificado'],
  ['F51.0', 'Insomnio no orgánico'],
  ['F90.0', 'Trastorno de la actividad y de la atención'],
  ['G40.9', 'Epilepsia, tipo no especificado'],
  ['G43.9', 'Migraña, no especificada'],
  ['G44.2', 'Cefalea tensional'],
  ['G47.0', 'Insomnio'],
  ['G56.0', 'Síndrome del túnel carpiano'],
  ['H00.0', 'Orzuelo'],
  ['H10.1', 'Conjuntivitis atópica aguda'],
  ['H10.9', 'Conjuntivitis, no especificada'],
  ['H52.4', 'Presbicia'],
  ['H60.9', 'Otitis externa, sin otra especificación'],
  ['H61.2', 'Cerumen impactado'],
  ['H65.9', 'Otitis media no supurativa, sin otra especificación'],
  ['H66.9', 'Otitis media, no especificada'],
  ['I10', 'Hipertensión esencial (primaria)'],
  ['I11.9', 'Cardiopatía hipertensiva sin insuficiencia cardiaca'],
  ['I20.9', 'Angina de pecho, no especificada'],
  ['I25.9', 'Cardiopatía isquémica crónica, no especificada'],
  ['I48', 'Fibrilación y aleteo auricular'],
  ['I50.9', 'Insuficiencia cardiaca, no especificada'],
  ['I63.9', 'Infarto cerebral, no especificado'],
  ['I83.9', 'Várices de los miembros inferiores sin úlcera ni inflamación'],
  ['J00', 'Rinofaringitis aguda (resfriado común)'],
  ['J01.9', 'Sinusitis aguda, no especificada'],
  ['J02.9', 'Faringitis aguda, no especificada'],
  ['J03.9', 'Amigdalitis aguda, no especificada'],
  ['J04.0', 'Laringitis aguda'],
  ['J06.9', 'Infección aguda de las vías respiratorias superiores, no especificada'],
  ['J11.1', 'Influenza con manifestaciones respiratorias, virus no identificado'],
  ['J18.9', 'Neumonía, no especificada'],
  ['J20.9', 'Bronquitis aguda, no especificada'],
  ['J21.9', 'Bronquiolitis aguda, no especificada'],
  ['J30.4', 'Rinitis alérgica, no especificada'],
  ['J32.9', 'Sinusitis crónica, no especificada'],
  ['J44.9', 'Enfermedad pulmonar obstructiva crónica, no especificada'],
  ['J45.9', 'Asma, no especificada'],
  ['K02.9', 'Caries dental, no especificada'],
  ['K04.7', 'Absceso periapical sin fístula'],
  ['K05.1', 'Gingivitis crónica'],
  ['K21.9', 'Enfermedad por reflujo gastroesofágico sin esofagitis'],
  ['K29.7', 'Gastritis, no especificada'],
  ['K30', 'Dispepsia funcional'],
  ['K37', 'Apendicitis, no especificada'],
  ['K40.9', 'Hernia inguinal sin obstrucción ni gangrena'],
  ['K52.9', 'Gastroenteritis y colitis no infecciosas, no especificadas'],
  ['K58.9', 'Síndrome del colon irritable sin diarrea'],
  ['K59.0', 'Estreñimiento'],
  ['K64.9', 'Hemorroides, no especificadas'],
  ['K76.0', 'Hígado graso, no clasificado en otra parte'],
  ['K80.2', 'Cálculo de la vesícula biliar sin colecistitis'],
  ['L01.0', 'Impétigo'],
  ['L02.9', 'Absceso cutáneo, furúnculo y ántrax, de sitio no especificado'],
  ['L03.9', 'Celulitis de sitio no especificado'],
  ['L20.9', 'Dermatitis atópica, no especificada'],
  ['L21.9', 'Dermatitis seborreica, no especificada'],
  ['L22', 'Dermatitis del pañal'],
  ['L23.9', 'Dermatitis alérgica de contacto, de causa no especificada'],
  ['L30.9', 'Dermatitis, no especificada'],
  ['L40.0', 'Psoriasis vulgar'],
  ['L50.9', 'Urticaria, no especificada'],
  ['L60.0', 'Uña encarnada'],
  ['L70.0', 'Acné vulgar'],
  ['M10.9', 'Gota, no especificada'],
  ['M15.9', 'Poliartrosis, no especificada'],
  ['M17.9', 'Artrosis de rodilla (gonartrosis), no especificada'],
  ['M19.9', 'Artrosis, no especificada'],
  ['M25.5', 'Dolor articular'],
  ['M54.2', 'Cervicalgia'],
  ['M54.4', 'Lumbago con ciática'],
  ['M54.5', 'Lumbago no especificado'],
  ['M75.1', 'Síndrome del manguito rotador'],
  ['M79.1', 'Mialgia'],
  ['M81.9', 'Osteoporosis, no especificada'],
  ['N18.9', 'Enfermedad renal crónica, no especificada'],
  ['N20.0', 'Cálculo del riñón'],
  ['N30.0', 'Cistitis aguda'],
  ['N39.0', 'Infección de vías urinarias, sitio no especificado'],
  ['N40', 'Hiperplasia de la próstata'],
  ['N76.0', 'Vaginitis aguda'],
  ['N94.6', 'Dismenorrea, no especificada'],
  ['N95.1', 'Estados menopáusicos y climatéricos'],
  ['R05', 'Tos'],
  ['R06.0', 'Disnea'],
  ['R10.4', 'Dolor abdominal, otro y el no especificado'],
  ['R11', 'Náusea y vómito'],
  ['R42', 'Mareo y desvanecimiento'],
  ['R50.9', 'Fiebre, no especificada'],
  ['R51', 'Cefalea'],
  ['R52.9', 'Dolor, no especificado'],
  ['R53', 'Malestar y fatiga'],
  ['R73.9', 'Hiperglucemia, no especificada'],
  ['S06.0', 'Conmoción cerebral'],
  ['S13.4', 'Esguince de la columna cervical'],
  ['S93.4', 'Esguince del tobillo'],
  ['T14.0', 'Traumatismo superficial de región no especificada'],
  ['T14.1', 'Herida de región no especificada'],
  ['T78.4', 'Alergia no especificada'],
  ['U07.1', 'COVID-19, virus identificado'],
  ['Z00.0', 'Examen médico general'],
  ['Z00.1', 'Control de salud de rutina del niño'],
  ['Z01.2', 'Examen odontológico'],
  ['Z01.4', 'Examen ginecológico de rutina'],
  ['Z25.1', 'Necesidad de vacunación contra la influenza'],
  ['Z30.0', 'Consejería general sobre anticoncepción'],
  ['Z34.9', 'Control de embarazo normal, no especificado'],
  ['Z71.3', 'Consejería y vigilancia de la dieta'],
  ['Z72.0', 'Uso de tabaco'],
  ['Z76.0', 'Consulta para repetir una receta'],
];

const BY_CODE = new Map(CIE10_COMMON.map(([code, label]) => [code, label]));
const SEARCHABLE = CIE10_COMMON.map(([code, label]) => ({ code, label, name: normalizeForSearch(label), text: normalizeForSearch(`${code} ${label}`) }));

/** "j069", "J06.9" o " j06.9 " -> "J06.9". */
export function normalizeCie10(value: string): string {
  const raw = value.replace(/[\s.]/g, '').toUpperCase();
  return raw.length > 3 ? `${raw.slice(0, 3)}.${raw.slice(3)}` : raw;
}

export const CIE10_PATTERN = /^[A-Z]\d{2}(\.\d{1,2})?$/;

export function cie10Label(code: string | null | undefined): string | null {
  return code ? (BY_CODE.get(code) ?? null) : null;
}

/** Busca por código ("j06") o por palabras del nombre, sin importar tildes ("faringitis", "dolor cabeza"). */
export function searchCie10(query: string, limit = 8): { code: string; label: string }[] {
  const q = normalizeForSearch(query);
  if (!q) return [];
  const words = q.split(' ');
  const code = normalizeCie10(query);
  // Primero el código que empieza igual, luego el nombre que empieza con lo escrito, luego el que contiene la frase entera.
  const rank = (d: (typeof SEARCHABLE)[number]) => {
    return d.code.startsWith(code) ? 0 : d.name.startsWith(q) ? 1 : d.name.includes(q) ? 2 : 3;
  };
  return SEARCHABLE.filter((d) => d.code.startsWith(code) || words.every((w) => d.text.includes(w)))
    .map((d) => ({ d, r: rank(d) }))
    .sort((a, b) => a.r - b.r || a.d.label.length - b.d.label.length)
    .slice(0, limit)
    .map(({ d }) => ({ code: d.code, label: d.label }));
}
