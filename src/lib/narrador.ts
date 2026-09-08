/**
 * NARRADOR PROPIO — el "modelo" de guiones del proyecto.
 *
 * No usa ninguna IA de pago ni consume créditos: son las reglas de escritura
 * que aprendimos escribiendo a mano el guion del Titanic, convertidas en código.
 * Recibe hechos en crudo (enciclopedia libre) y devuelve un relato con gancho,
 * cronología, actos, tensión y cierre.
 *
 * Reglas fijas del proyecto:
 * - La intro dice siempre "LA HISTORIA COMPLETA DE [TEMA]".
 * - Los nombres en inglés se escriben como suenan (tabla FONETICA).
 */

/* ------------------------------------------------------------------ */
/* 1. Pronunciación                                                    */
/* ------------------------------------------------------------------ */

export const FONETICA: Record<string, string> = {
  Titanic: "Taitánic",
  Kennedy: "Quénedi",
  Armstrong: "Ármstrong",
  Washington: "Washintong",
  Liverpool: "Líverpul",
  Southampton: "Sáuthampton",
  Belfast: "Bélfast",
  Cherbourg: "Cherburgo",
  Queenstown: "Quínstaun",
  Carpathia: "Carpatia",
  California: "Califórnia",
  Hollywood: "Jólivud",
  Chicago: "Chicágo",
  Michigan: "Míchigan",
  Boeing: "Bóing",
  Apollo: "Apolo",
  Cunard: "Kiunard",
  Harland: "Járland",
  Wolff: "Uólf",
  Olympic: "Olímpic",
  Britannic: "Britanic",
  Lusitania: "Lusitania",
  New: "Niu",
  Jersey: "Yérsey",
  Sherman: "Shérman",
  Churchill: "Chérchil",
  Roosevelt: "Rúsvelt",
  Eisenhower: "Áisenhauer",
  Hughes: "Hiuz",
  Wright: "Ráit",
  Edison: "Édison",
  Bell: "Bel",
  Cambridge: "Kéimbrich",
  Oxford: "Óxford",
  Yale: "Yeil",
  Detroit: "Detróit",
  Seattle: "Siátel",
  Houston: "Hiúston",
};

export function foneticas(t: string) {
  let out = t;
  for (const [en, es] of Object.entries(FONETICA)) {
    out = out.replace(new RegExp(`\\b${en}\\b`, "g"), es);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* 2. Vocabulario de tensión y ritmo                                   */
/* ------------------------------------------------------------------ */

const DRAMATICAS = [
  "muerte", "muertos", "murió", "murieron", "miedo", "tragedia", "incendio",
  "hundió", "hundimiento", "silencio", "nunca", "desastre", "guerra", "sangre",
  "final", "destruyó", "derrumbó", "fracaso", "peligro", "víctimas", "colapso",
  "catástrofe", "explosión", "ataque", "prohibido", "secreto", "último",
];

const NUMEROSA = /\b(\d{1,3}(?:[.,]\d{3})+|\d+(?:[.,]\d+)?\s?(?:%|millones|mil|metros|kilómetros|toneladas|personas|años|horas|días))\b/i;
const ANIO = /\b(1[0-9]{3}|20[0-9]{2})\b/;

/** Frases que hablan de películas, libros o cultura pop: no son el relato. */
const META = /\b(pel[ií]cula|filme|film|serie|documental|novela|recaudaci[oó]n|taquilla|actor|actriz|videojuego|canci[oó]n|estreno|reestreno|adaptaci[oó]n)\b/i;

const CAUSALES = /\b(porque|debido a|por eso|como consecuencia|provocó|permitió|obligó|impidió|gracias a|a raíz de)\b/i;

/** Cuánto sirve una frase para el relato: más alto, más adelante en el guion. */
function fuerza(f: string) {
  const t = f.toLowerCase();
  let p = 0;
  if (DRAMATICAS.some((k) => t.includes(k))) p += 3;
  if (NUMEROSA.test(f)) p += 2;
  if (CAUSALES.test(f)) p += 2;
  if (ANIO.test(f)) p += 1;
  if (META.test(f)) p -= 8;
  if (f.length > 260) p -= 2;
  if ((f.match(/,/g) || []).length > 5) p -= 2;
  return p;
}

export function pausa(txt: string) {
  const t = txt.toLowerCase();
  if (txt.length < 60) return 0.72;
  if (DRAMATICAS.some((k) => t.includes(k))) return 0.7;
  if (txt.length > 200) return 0.5;
  return 0.4;
}

/* ------------------------------------------------------------------ */
/* 3. Reescritura: de enciclopedia a relato hablado                    */
/* ------------------------------------------------------------------ */

/** Quita el ruido de enciclopedia (paréntesis, comillas, referencias). */
export function limpiar(t: string) {
  return t
    .replace(/^=+[^=]*=+/g, "")
    .replace(/[\u200b\u200e\u00ad]/g, "")
    .replace(/\([^)]*\)/g, "")
    .replace(/\[[^\]]*\]/g, "")
    .replace(/[«»""„"]/g, "")
    .replace(/\s+([,.;:])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

/** Corta las frases muy largas en dos, como hace un narrador al hablar. */
function respirar(f: string): string[] {
  if (f.length <= 190) return [f];
  const corte = f.lastIndexOf(", ", Math.floor(f.length * 0.62));
  if (corte < 70) return [f];
  const a = f.slice(0, corte).trim();
  let b = f.slice(corte + 2).trim();
  b = b.charAt(0).toUpperCase() + b.slice(1);
  return [a.endsWith(".") ? a : `${a}.`, b];
}

/** Arranques que dan intención al dato, sin inventar hechos. */
const ENFASIS = [
  "Y acá está el detalle:",
  "Prestá atención a esto:",
  "Este dato lo explica casi todo:",
  "Y esto es lo que casi nadie cuenta:",
  "Guardate este número:",
];

/** Conectores entre bloques del relato (retórica, no información nueva). */
const PUENTES = [
  "Pero esto recién empezaba.",
  "Y entonces todo dio un giro.",
  "Lo que pasó después lo cambió todo.",
  "Hasta acá, todo parecía bajo control.",
  "Y las cosas no iban a ser tan simples.",
  "Ahora sí, viene la parte importante.",
  "Y todavía faltaba lo peor.",
];

const CIERRES_ACTO = [
  "Todo estaba listo. Nadie imaginaba lo que venía.",
  "Ese fue el punto sin retorno.",
  "Y ya no había manera de volver atrás.",
];

/* ------------------------------------------------------------------ */
/* 4. Cronología y actos                                               */
/* ------------------------------------------------------------------ */

function anio(f: string): number | null {
  const m = ANIO.exec(f);
  return m ? Number(m[1]) : null;
}

export type Frase = { txt: string; gap: number };

export type Bloque = { titulo: string; frases: string[] };

/**
 * Ordena los hechos en una línea de tiempo: primero lo que tiene año
 * (en orden), después el resto ordenado por fuerza narrativa.
 */
export function cronologia(frases: string[]): string[] {
  const conAnio: { f: string; a: number; i: number }[] = [];
  const sinAnio: { f: string; i: number }[] = [];
  frases.forEach((f, i) => {
    const a = anio(f);
    if (a) conAnio.push({ f, a, i });
    else sinAnio.push({ f, i });
  });
  conAnio.sort((x, y) => x.a - y.a || x.i - y.i);
  sinAnio.sort((x, y) => fuerza(y.f) - fuerza(x.f) || x.i - y.i);

  // Intercalamos: la columna vertebral es la cronología, y entre medio
  // entran los hechos de contexto más fuertes.
  const out: string[] = [];
  let j = 0;
  conAnio.forEach((c, k) => {
    out.push(c.f);
    if (k % 2 === 1 && j < sinAnio.length) out.push(sinAnio[j++]!.f);
  });
  while (j < sinAnio.length) out.push(sinAnio[j++]!.f);
  return out;
}

/* ------------------------------------------------------------------ */
/* 5. El guion completo                                                */
/* ------------------------------------------------------------------ */

/** Arma la intro fija respetando el artículo del tema (del / de la / de). */
export function tituloIntro(tema: string) {
  const t = tema.trim();
  const m = /^(el|la|los|las)\s+(.+)$/i.exec(t);
  if (m) {
    const art = m[1]!.toLowerCase();
    const resto = m[2]!.toUpperCase();
    if (art === "el") return `LA HISTORIA COMPLETA DEL ${resto}.`;
    if (art === "la") return `LA HISTORIA COMPLETA DE LA ${resto}.`;
    if (art === "los") return `LA HISTORIA COMPLETA DE LOS ${resto}.`;
    return `LA HISTORIA COMPLETA DE LAS ${resto}.`;
  }
  return `LA HISTORIA COMPLETA DE ${t.toUpperCase()}.`;
}

export type Guion = {
  titulo: string;
  escenas: Frase[];
  palabras: number;
  minutos: number;
};

/**
 * Arma el guion con la misma arquitectura del Titanic:
 * gancho -> intro fija -> promesa -> actos cronológicos con tensión -> cierre.
 */
export function escribirGuion(
  tema: string,
  hechos: string[],
  minutos: number,
): Guion {
  const objetivo = Math.round(minutos * 140);
  const temaVoz = foneticas(tema);
  const intro = tituloIntro(temaVoz);

  // --- material ---------------------------------------------------
  const vistas = new Set<string>();
  const unicos: string[] = [];
  for (const h of hechos) {
    const f = limpiar(h);
    if (f.length < 45 || f.length > 340) continue;
    if (f.includes("==")) continue;
    const clave = f.slice(0, 55).toLowerCase();
    if (vistas.has(clave)) continue;
    if (META.test(f)) continue;
    vistas.add(clave);
    unicos.push(f);
  }

  // --- gancho: los 3 hechos más impactantes van al principio -------
  // El gancho pide lo mismo que en el Titanic: un dato con peso humano y
  // un número concreto, dicho corto.
  const candidatos = unicos.filter(
    (f) =>
      f.length < 210 &&
      NUMEROSA.test(f) &&
      /\b(muert|muri|víctim|tragedia|desastre|hundi|catástrofe|destruy|sobrevivi|superviv)/i.test(f) &&
      !/^(los|las|el|la)\s+\w+\s+se\s+consideran/i.test(f),
  );
  const porFuerza = (candidatos.length >= 3 ? candidatos : unicos)
    .slice()
    .sort((a, b) => fuerza(b) - fuerza(a));
  const gancho = porFuerza.slice(0, 3);
  const cuerpo = cronologia(unicos.filter((f) => !gancho.includes(f)));

  const esc: Frase[] = [];
  const push = (txt: string, gap?: number) => {
    const t = foneticas(txt).trim();
    if (t) esc.push({ txt: t, gap: gap ?? pausa(t) });
  };

  gancho.forEach((g, i) => {
    respirar(g).forEach((p) => push(i === 0 ? p : p, i === 0 ? 0.75 : undefined));
  });

  // --- intro fija (regla del proyecto) -----------------------------
  push(intro, 0.95);
  push(
    `Cómo empezó, qué pasó realmente y por qué todavía se sigue contando. De principio a fin.`,
    0.8,
  );

  // --- cuerpo en actos ---------------------------------------------
  let palabras = esc.reduce((n, e) => n + e.txt.split(/\s+/).length, 0);
  let desdePuente = 0;
  let puenteIdx = 0;
  let enfasisIdx = 0;
  let bloque = 0;

  for (const f of cuerpo) {
    if (palabras >= objetivo) break;

    // cada ~6 frases, un conector de tensión
    if (desdePuente >= 6) {
      const usarCierre = bloque > 0 && bloque % 3 === 0;
      const linea = usarCierre
        ? CIERRES_ACTO[(bloque / 3 - 1) % CIERRES_ACTO.length]!
        : PUENTES[puenteIdx++ % PUENTES.length]!;
      push(linea, 0.85);
      palabras += linea.split(/\s+/).length;
      desdePuente = 0;
      bloque++;
    }

    // los datos muy fuertes se anuncian antes de decirlos
    if (fuerza(f) >= 5 && enfasisIdx < 6 && desdePuente > 1) {
      const e = ENFASIS[enfasisIdx++ % ENFASIS.length]!;
      push(e, 0.55);
      palabras += e.split(/\s+/).length;
    }

    for (const parte of respirar(f)) {
      push(parte);
      palabras += parte.split(/\s+/).length;
    }
    desdePuente++;
  }

  // --- cierre -------------------------------------------------------
  push("Y así termina esta historia.", 0.8);
  push(
    "Lo que pasó ya no se puede cambiar, pero sí se puede entender. Y por eso se sigue contando.",
    0.9,
  );
  push("Gracias por acompañarme hasta el final.", 1);

  const total = esc.reduce((n, e) => n + e.txt.split(/\s+/).length, 0);
  return {
    titulo: tema,
    escenas: esc,
    palabras: total,
    minutos: Math.round((total / 140) * 10) / 10,
  };
}
