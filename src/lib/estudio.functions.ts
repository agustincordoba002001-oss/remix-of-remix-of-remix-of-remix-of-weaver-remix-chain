import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const ENDPOINT = "https://hircoir-piper-tts-spanish.hf.space/convert";
const MODELO = "models/es_MX-dark.onnx";

/* ------------------------------------------------------------------ */
/* Guion gratis: se arma con la enciclopedia libre, sin gastar créditos */
/* ------------------------------------------------------------------ */

/** Palabras en inglés escritas como suenan, para que la voz las pronuncie bien. */
const FONETICA: Record<string, string> = {
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
  New: "Niu",
  York: "York",
  Hollywood: "Jólivud",
  Chicago: "Chicágo",
  Michigan: "Míchigan",
  Boeing: "Bóing",
  Apollo: "Apolo",
};

const DRAMATICAS = [
  "muertos", "murieron", "miedo", "tragedia", "incendio", "hundió", "hundir",
  "silencio", "nunca", "desastre", "guerra", "sangre", "final",
];

function foneticas(t: string) {
  let out = t;
  for (const [en, es] of Object.entries(FONETICA)) {
    out = out.replace(new RegExp(`\\b${en}\\b`, "g"), es);
  }
  return out;
}

function limpiar(t: string) {
  return t
    .replace(/\([^)]*\)/g, "")
    .replace(/\[[^\]]*\]/g, "")
    .replace(/«|»|"|"|"/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function frases(texto: string) {
  return texto
    .split(/(?<=[.!?])\s+/)
    .map((f) => limpiar(f))
    .filter((f) => f.length > 45 && f.length < 340 && !f.endsWith(":"));
}

function pausa(txt: string) {
  const t = txt.toLowerCase();
  if (DRAMATICAS.some((k) => t.includes(k))) return 0.75;
  if (txt.length > 200) return 0.5;
  return 0.38;
}

async function wiki(tema: string) {
  const buscar = new URL("https://es.wikipedia.org/w/api.php");
  buscar.searchParams.set("action", "query");
  buscar.searchParams.set("list", "search");
  buscar.searchParams.set("srsearch", tema);
  buscar.searchParams.set("srlimit", "1");
  buscar.searchParams.set("format", "json");
  buscar.searchParams.set("origin", "*");
  const b = (await (await fetch(buscar)).json()) as {
    query?: { search?: { title?: string }[] };
  };
  const titulo = b.query?.search?.[0]?.title;
  if (!titulo) return null;

  const art = new URL("https://es.wikipedia.org/w/api.php");
  art.searchParams.set("action", "query");
  art.searchParams.set("prop", "extracts");
  art.searchParams.set("explaintext", "1");
  art.searchParams.set("redirects", "1");
  art.searchParams.set("titles", titulo);
  art.searchParams.set("format", "json");
  const a = (await (await fetch(art)).json()) as {
    query?: { pages?: Record<string, { extract?: string }> };
  };
  const pagina = Object.values(a.query?.pages ?? {})[0];
  return pagina?.extract ? { titulo, texto: pagina.extract } : null;
}

const temaSchema = z.object({
  tema: z.string().min(2).max(120),
  minutos: z.number().min(3).max(40).default(15),
});

export const generarGuion = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => temaSchema.parse(d))
  .handler(async ({ data }) => {
    const art = await wiki(data.tema);
    if (!art) throw new Error("No encontré información sobre ese tema.");

    // ~140 palabras por minuto de narración.
    const objetivo = Math.round(data.minutos * 140);

    const bloques = art.texto
      .split(/\n==+ ?([^=]+?) ?==+\n/)
      .map((s) => s.trim())
      .filter(Boolean);

    const crudas: string[] = [];
    for (const bloque of bloques) {
      if (/^(Véase también|Referencias|Bibliografía|Enlaces externos|Notas)/i.test(bloque)) continue;
      crudas.push(...frases(bloque));
    }

    const tituloVoz = foneticas(art.titulo);
    const guion: { txt: string; gap: number }[] = [
      { txt: `LA HISTORIA COMPLETA DE ${tituloVoz.toUpperCase()}.`, gap: 0.9 },
    ];

    let palabras = 0;
    const vistas = new Set<string>();
    for (const f of crudas) {
      const clave = f.slice(0, 60).toLowerCase();
      if (vistas.has(clave)) continue;
      vistas.add(clave);
      const txt = foneticas(f);
      guion.push({ txt, gap: pausa(txt) });
      palabras += txt.split(/\s+/).length;
      if (palabras >= objetivo) break;
    }

    guion.push({
      txt: "Y así termina esta historia. Gracias por acompañarme hasta el final.",
      gap: 0.8,
    });

    return {
      titulo: art.titulo,
      escenas: guion,
      palabras,
      minutos: Math.round((palabras / 140) * 10) / 10,
    };
  });

/* ------------------------------------------------------------------ */
/* Voz gratis: mismo motor y calibración que los documentales          */
/* ------------------------------------------------------------------ */

function ritmo(txt: string) {
  const t = txt.toLowerCase();
  let v = 0.99;
  if (DRAMATICAS.some((k) => t.includes(k))) v += 0.055;
  if (txt.length > 140) v -= 0.025;
  if (/\d/.test(t)) v -= 0.04;
  return Math.round(Math.min(1.07, Math.max(0.94, v)) * 1000) / 1000;
}

const vozSchema = z.object({ texto: z.string().min(1).max(600) });

export const generarVoz = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => vozSchema.parse(d))
  .handler(async ({ data }) => {
    const body = JSON.stringify({
      text: data.texto,
      modelPath: MODELO,
      settings: {
        speaker: 0,
        noise_scale: 0.58,
        length_scale: ritmo(data.texto),
        noise_w: 0.7,
      },
    });

    let ultimo = "sin respuesta";
    for (let i = 0; i < 3; i++) {
      try {
        const res = await fetch(ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
        });
        const json = (await res.json()) as { success?: boolean; audio?: string; error?: string };
        if (json.audio && json.success !== false) {
          const audio = json.audio.includes(",") ? json.audio.split(",").pop()! : json.audio;
          return { audio: `data:audio/wav;base64,${audio}` };
        }
        ultimo = json.error ?? `respuesta inválida (${res.status})`;
      } catch (err) {
        ultimo = err instanceof Error ? err.message : String(err);
      }
    }
    throw new Error(`No se pudo generar la voz: ${ultimo}`);
  });
