import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState } from "react";
import { Download, FileAudio, Loader2, Upload, Wand2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Toaster } from "@/components/ui/sonner";
import { generarGuion, generarVoz } from "@/lib/estudio.functions";

export const Route = createFileRoute("/estudio")({
  head: () => ({
    meta: [
      { title: "Estudio: guion y voz gratis en minutos" },
      {
        name: "description",
        content:
          "Escribí un tema y el estudio arma el guion completo y la narración con voz Dark, sin costo. También podés subir tu audio o video para revisarlo y corregirlo.",
      },
      { property: "og:title", content: "Estudio: guion y voz gratis en minutos" },
      {
        property: "og:description",
        content: "Guion y narración automáticos, y revisión de tus audios y videos.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Estudio,
});

type Escena = { txt: string; gap: number };

/** Une varios audios en un solo archivo WAV descargable. */
async function unirWav(pistas: string[], huecos: number[]) {
  const ctx = new AudioContext();
  const buffers: AudioBuffer[] = [];
  for (const p of pistas) {
    const bin = Uint8Array.from(atob(p.split(",").pop()!), (c) => c.charCodeAt(0));
    buffers.push(await ctx.decodeAudioData(bin.buffer));
  }
  const sr = buffers[0]?.sampleRate ?? 22050;
  const total =
    buffers.reduce((n, b) => n + b.length, 0) +
    huecos.reduce((n, g) => n + Math.round(g * sr), 0);
  const out = new Float32Array(total);
  let pos = 0;
  buffers.forEach((b, i) => {
    out.set(b.getChannelData(0), pos);
    pos += b.length + Math.round((huecos[i] ?? 0.4) * sr);
  });
  void ctx.close();

  const bytes = new DataView(new ArrayBuffer(44 + out.length * 2));
  const txt = (o: number, s: string) =>
    [...s].forEach((c, i) => bytes.setUint8(o + i, c.charCodeAt(0)));
  txt(0, "RIFF");
  bytes.setUint32(4, 36 + out.length * 2, true);
  txt(8, "WAVEfmt ");
  bytes.setUint32(16, 16, true);
  bytes.setUint16(20, 1, true);
  bytes.setUint16(22, 1, true);
  bytes.setUint32(24, sr, true);
  bytes.setUint32(28, sr * 2, true);
  bytes.setUint16(32, 2, true);
  bytes.setUint16(34, 16, true);
  txt(36, "data");
  bytes.setUint32(40, out.length * 2, true);
  for (let i = 0; i < out.length; i++) {
    const v = Math.max(-1, Math.min(1, out[i]!));
    bytes.setInt16(44 + i * 2, v * 32767, true);
  }
  return URL.createObjectURL(new Blob([bytes.buffer], { type: "audio/wav" }));
}

function Estudio() {
  const [tema, setTema] = useState("");
  const [minutos, setMinutos] = useState(15);
  const [escenas, setEscenas] = useState<Escena[]>([]);
  const [titulo, setTitulo] = useState("");
  const [armando, setArmando] = useState(false);
  const [narrando, setNarrando] = useState(false);
  const [progreso, setProgreso] = useState(0);
  const [audioFinal, setAudioFinal] = useState<string | null>(null);
  const [subido, setSubido] = useState<{ url: string; tipo: string; nombre: string } | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const pedirGuion = useServerFn(generarGuion);
  const pedirVoz = useServerFn(generarVoz);

  async function armarGuion() {
    if (!tema.trim()) return;
    setArmando(true);
    setAudioFinal(null);
    try {
      const r = await pedirGuion({ data: { tema: tema.trim(), minutos } });
      setEscenas(r.escenas);
      setTitulo(r.titulo);
      toast.success(`Guion listo: ${r.escenas.length} frases, unos ${r.minutos} minutos`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No pude armar el guion");
    } finally {
      setArmando(false);
    }
  }

  async function narrar() {
    if (!escenas.length) return;
    setNarrando(true);
    setProgreso(0);
    setAudioFinal(null);
    const pistas: string[] = [];
    try {
      for (let i = 0; i < escenas.length; i++) {
        const r = await pedirVoz({ data: { texto: escenas[i]!.txt.slice(0, 600) } });
        pistas.push(r.audio);
        setProgreso(Math.round(((i + 1) / escenas.length) * 100));
      }
      setAudioFinal(await unirWav(pistas, escenas.map((e) => e.gap)));
      toast.success("Narración completa lista para escuchar y descargar");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Se cortó la narración");
    } finally {
      setNarrando(false);
    }
  }

  function subir(f: File | undefined) {
    if (!f) return;
    setSubido({ url: URL.createObjectURL(f), tipo: f.type, nombre: f.name });
  }

  return (
    <main className="min-h-screen bg-background">
      <Toaster />
      <header className="mx-auto max-w-6xl px-6 pt-14 pb-6">
        <p className="text-xs uppercase tracking-[0.35em] text-muted-foreground">Estudio</p>
        <h1 className="mt-4 text-4xl leading-[1.05] font-semibold sm:text-5xl">
          Guion y voz en minutos, sin gastar créditos.
        </h1>
        <p className="mt-4 max-w-2xl text-base text-muted-foreground">
          Escribí el tema y el estudio arma el guion completo y lo narra con la misma voz de
          siempre. Abajo podés subir cualquier audio o video, de cualquier tamaño, para verlo
          y decidir qué corregir.
        </p>
      </header>

      <section className="mx-auto grid max-w-6xl gap-6 px-6 pb-24 lg:grid-cols-[1fr_1fr]">
        <Card className="border-border/70 bg-card/70 p-5">
          <h2 className="text-lg font-semibold">1 · Tema del video</h2>
          <input
            value={tema}
            onChange={(e) => setTema(e.target.value)}
            placeholder="Por ejemplo: El hundimiento del Titanic"
            className="mt-3 w-full rounded-md border border-border/70 bg-background/60 p-3 text-base"
          />
          <label className="mt-4 block text-sm text-muted-foreground">
            Duración deseada: {minutos} minutos
            <input
              type="range"
              min={3}
              max={40}
              value={minutos}
              onChange={(e) => setMinutos(Number(e.target.value))}
              className="mt-2 w-full"
            />
          </label>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button className="h-11" disabled={armando} onClick={() => void armarGuion()}>
              {armando ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Wand2 className="mr-2 h-4 w-4" />
              )}
              Armar el guion
            </Button>
            <Button
              variant="secondary"
              className="h-11"
              disabled={!escenas.length || narrando}
              onClick={() => void narrar()}
            >
              {narrando ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <FileAudio className="mr-2 h-4 w-4" />
              )}
              Generar la narración
            </Button>
          </div>

          {narrando && (
            <p className="mt-3 text-sm text-muted-foreground">Narrando… {progreso}%</p>
          )}

          {audioFinal && (
            <div className="mt-4 space-y-3">
              <audio src={audioFinal} controls className="w-full" />
              <a href={audioFinal} download={`${titulo || "narracion"}.wav`}>
                <Button variant="ghost" className="h-10">
                  <Download className="mr-2 h-4 w-4" /> Descargar la narración
                </Button>
              </a>
            </div>
          )}

          {escenas.length > 0 && (
            <div className="mt-5 max-h-[45vh] space-y-2 overflow-y-auto border-t border-border/70 pt-4">
              {escenas.map((e, i) => (
                <textarea
                  key={i}
                  value={e.txt}
                  rows={2}
                  onChange={(ev) => {
                    const next = [...escenas];
                    next[i] = { ...e, txt: ev.target.value };
                    setEscenas(next);
                  }}
                  className="w-full rounded-md border border-border/60 bg-background/60 p-2 text-sm"
                />
              ))}
            </div>
          )}
        </Card>

        <Card className="border-border/70 bg-card/70 p-5">
          <h2 className="text-lg font-semibold">2 · Revisar un audio o un video</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Subí el archivo que quieras revisar. Se abre acá mismo, sin límite de tamaño y sin
            subirlo a ningún lado.
          </p>
          <input
            ref={inputRef}
            type="file"
            accept="audio/*,video/*"
            className="hidden"
            onChange={(e) => subir(e.target.files?.[0])}
          />
          <Button className="mt-4 h-11" onClick={() => inputRef.current?.click()}>
            <Upload className="mr-2 h-4 w-4" /> Elegir archivo
          </Button>

          {subido && (
            <div className="mt-4 space-y-3">
              <p className="text-sm text-muted-foreground">{subido.nombre}</p>
              {subido.tipo.startsWith("video") ? (
                <video
                  src={subido.url}
                  controls
                  playsInline
                  className="w-full rounded-lg border border-border/70 bg-black"
                />
              ) : (
                <audio src={subido.url} controls className="w-full" />
              )}
              <textarea
                rows={4}
                placeholder="Anotá qué hay que corregir de este video o audio…"
                className="w-full rounded-md border border-border/70 bg-background/60 p-3 text-sm"
              />
            </div>
          )}
        </Card>
      </section>
    </main>
  );
}
