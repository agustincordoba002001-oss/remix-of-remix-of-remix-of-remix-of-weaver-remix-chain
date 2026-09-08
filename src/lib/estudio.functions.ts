import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { escribirGuion, limpiar } from "./narrador";

const ENDPOINT = "https://hircoir-piper-tts-spanish.hf.space/convert";
const MODELO = "models/es_MX-dark.onnx";

/* ------------------------------------------------------------------ */
/* Hechos gratis: enciclopedia libre (sin créditos, sin tokens)         */
/* ------------------------------------------------------------------ */

function frases(texto: string) {
  return texto
    .split(/(?<=[.!?])\s+/)
    .map((f) => limpiar(f))
    .filter((f) => f.length > 40 && f.length < 340 && !f.endsWith(":"));
}

/** Descarta frases que suenan a ficha de referencia y no a relato. */
function esRelato(f: string): boolean {
  const t = f.toLowerCase();
  if ((f.match(/,/g) || []).length > 6) return false;
  if (t.startsWith("para otros usos")) return false;
  if (/^\d{3,}\s/.test(f) && f.length < 80) return false;
  if (/\bcoordenadas\b/.test(t)) return false;
  return true;
}

const SECCIONES_BASURA =
  /^(Véase también|Referencias|Bibliografía|Enlaces externos|Notas|Obras|Filmografía|Galardones|Premios|Discografía|Enlaces)/i;

function extraerRelato(texto: string): string[] {
  const partes = texto
    .split(/\n==+ ?([^=]+?) ?==+\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  const out: string[] = [];
  for (const bloque of partes) {
    if (SECCIONES_BASURA.test(bloque)) continue;
    out.push(...frases(bloque).filter(esRelato));
  }
  return out;
}

function esArticuloValido(extract: string): boolean {
  if (!extract) return false;
  const t = extract.toLowerCase();
  if (/puede referirse a|desambiguación|hace referencia a/.test(t)) return false;
  return extract.split(/\s+/).length > 120;
}

async function wikipedia(tema: string) {
  const buscar = new URL("https://es.wikipedia.org/w/api.php");
  buscar.searchParams.set("action", "query");
  buscar.searchParams.set("list", "search");
  buscar.searchParams.set("srsearch", tema);
  buscar.searchParams.set("srlimit", "8");
  buscar.searchParams.set("format", "json");
  const b = (await (await fetch(buscar)).json()) as {
    query?: { search?: { title?: string }[] };
  };
  const titulos = (b.query?.search ?? [])
    .map((s) => s.title)
    .filter((t): t is string => Boolean(t));
  if (!titulos.length) return [];

  const art = new URL("https://es.wikipedia.org/w/api.php");
  art.searchParams.set("action", "query");
  art.searchParams.set("prop", "extracts");
  art.searchParams.set("explaintext", "1");
  art.searchParams.set("redirects", "1");
  art.searchParams.set("titles", titulos.join("|"));
  art.searchParams.set("format", "json");
  const a = (await (await fetch(art)).json()) as {
    query?: { pages?: Record<string, { title?: string; extract?: string }> };
  };

  return Object.values(a.query?.pages ?? {})
    .filter((p) => p.title && p.extract && esArticuloValido(p.extract))
    .map((p) => ({ titulo: p.title!, relato: extraerRelato(p.extract!) }))
    .filter((c) => c.relato.length > 5)
    .sort((x, y) => y.relato.length - x.relato.length);
}

const temaSchema = z.object({
  tema: z.string().min(2).max(120),
  minutos: z.number().min(3).max(40).default(15),
});

export const generarGuion = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => temaSchema.parse(d))
  .handler(async ({ data }) => {
    const candidatos = await wikipedia(data.tema);
    if (!candidatos.length) throw new Error("No encontré información sobre ese tema.");

    const principal = candidatos[0]!;
    const hechos = candidatos.flatMap((c) => c.relato);

    // El guion lo escribe el narrador propio del proyecto: sin IA de pago,
    // sin tokens y sin consumir créditos nunca.
    return escribirGuion(principal.titulo, hechos, data.minutos);
  });

/* ------------------------------------------------------------------ */
/* Voz gratis: mismo motor y calibración que los documentales          */
/* ------------------------------------------------------------------ */

const DRAMATICAS = [
  "muertos", "murieron", "miedo", "tragedia", "incendio", "hundió",
  "silencio", "nunca", "desastre", "guerra", "sangre", "final",
];

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
