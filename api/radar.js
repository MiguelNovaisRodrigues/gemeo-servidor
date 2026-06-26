// Radar de CFPs — varre fontes públicas activamente e devolve chamadas relevantes
// GET /api/radar          → lista de candidatos scored
// GET /api/radar?commit=1 → idem + envia automaticamente para /api/sincronizar

import { lerGist } from "./_gist.js";

const SONDAS_FILE = "gemeo-sondas.json";

const PERFIL = `Fotógrafo e doutorando na FBAUL (Lisboa). Trabalho: fotografia artística, imagens interiores, corpo, CST (Corpo Sujeito Território), teoria da imagem, Flusser, visualidade contemporânea, filosofia da fotografia, estudos visuais, práticas artísticas baseadas em investigação. Revistas de referência: Photographies, History of Photography, Philosophy of Photography, Convergência Lusíada, Eikon, Artíbulo, Photography & Culture. Línguas de trabalho: português, inglês, espanhol, francês.`;

const FONTES_WIKICFP = [
  "photography visual art embodiment",
  "image theory visual culture photography",
  "artistic research practice photography",
];

async function fetchTexto(url) {
  try {
    const resp = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; GemeoRadar/1.0)" },
      signal: AbortSignal.timeout(5000),
    });
    if (!resp.ok) return "";
    const html = await resp.text();
    // Strip HTML tags, collapse whitespace
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
      .replace(/&nbsp;/g, " ").replace(/&#\d+;/g, " ")
      .replace(/\s{3,}/g, "\n")
      .trim()
      .slice(0, 3000);
  } catch {
    return "";
  }
}

async function extrairCandidatos(textos, titulosExistentes) {
  const textosCombinados = textos.filter(Boolean).join("\n\n---\n\n").slice(0, 6000);
  if (!textosCombinados.trim()) return [];

  const prompt = `${PERFIL}

Abaixo está texto extraído de páginas de chamadas para artigos e conferências. Extrai todas as chamadas que sejam relevantes para este perfil (mínimo relevância 6/10). Ignora chamadas já encerradas se conseguires determinar a data.

Títulos de chamadas já existentes (não repetir): ${titulosExistentes.slice(0, 20).join(" | ") || "nenhum"}

TEXTO:
${textosCombinados}

Responde APENAS com JSON (sem texto antes ou depois):
[
  {
    "titulo": "título da chamada",
    "revista": "nome da revista/conferência/instituição",
    "prazo": "YYYY-MM-DD ou null se desconhecido",
    "areas": ["área 1", "área 2"],
    "descricao": "1-2 frases: de que trata + porquê relevante para o perfil",
    "url": "URL se disponível ou null",
    "relevancia": 8
  }
]
Devolve array vazio [] se não houver nada relevante.`;

  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1200,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    const data = await resp.json();
    const text = data.content?.[0]?.text || "[]";
    const match = text.match(/\[[\s\S]*\]/);
    return match ? JSON.parse(match[0]) : [];
  } catch {
    return [];
  }
}

async function sugerirDeConhecimento(titulosExistentes) {
  const prompt = `${PERFIL}

Com base no teu conhecimento actualizado, sugere 5-8 chamadas para artigos ou conferências que estejam provavelmente abertas agora (2025-2026) e sejam altamente relevantes para este perfil. Inclui: revistas internacionais de fotografia, estudos visuais, artistic research, filosofia da imagem. Prioriza chamadas com deadlines nos próximos 6 meses.

Títulos já existentes (não repetir): ${titulosExistentes.slice(0, 20).join(" | ") || "nenhum"}

Responde APENAS com JSON:
[
  {
    "titulo": "título da chamada",
    "revista": "nome da publicação/evento",
    "prazo": "YYYY-MM-DD ou null",
    "areas": ["área 1", "área 2"],
    "descricao": "1-2 frases: tema + ligação ao perfil",
    "url": "URL oficial se conheces, ou null",
    "relevancia": 9,
    "fonte": "conhecimento"
  }
]`;

  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1500,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    const data = await resp.json();
    const text = data.content?.[0]?.text || "[]";
    const match = text.match(/\[[\s\S]*\]/);
    return match ? JSON.parse(match[0]) : [];
  } catch {
    return [];
  }
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.status(200).end(); return; }
  if (req.method !== "GET") { res.status(405).json({ erro: "Método não suportado" }); return; }

  try {
    const commit = req.query?.commit === "1" || req.query?.commit === "true";

    // Sondas existentes para evitar duplicados
    const sondasRaw = await lerGist(SONDAS_FILE);
    const sondas = sondasRaw && sondasRaw !== "[]" ? JSON.parse(sondasRaw) : [];
    const titulosExistentes = sondas.map(s => s.titulo?.toLowerCase().trim());

    // Fetch WikiCFP em paralelo + sugestões de conhecimento
    const [textos, conhecimento] = await Promise.all([
      Promise.all(
        FONTES_WIKICFP.map(q =>
          fetchTexto(`https://www.wikicfp.com/cfp/servlet/tool.search?q=${encodeURIComponent(q)}&series=0`)
        )
      ),
      sugerirDeConhecimento(titulosExistentes),
    ]);

    // Extrai candidatos do WikiCFP
    const doWikicfp = await extrairCandidatos(textos, titulosExistentes);

    // Junta tudo, remove duplicados por título
    const titulosVistos = new Set(titulosExistentes);
    const candidatos = [];
    for (const c of [...conhecimento, ...doWikicfp]) {
      const chave = c.titulo?.toLowerCase().trim();
      if (!chave || titulosVistos.has(chave)) continue;
      titulosVistos.add(chave);
      candidatos.push({ ...c, id: "radar_" + Math.random().toString(36).slice(2, 8) });
    }

    // Ordenar por relevância
    candidatos.sort((a, b) => (b.relevancia || 0) - (a.relevancia || 0));

    // Se commit=true, envia para /api/sincronizar
    if (commit && candidatos.length > 0) {
      const hoje = new Date().toISOString().slice(0, 10);
      const novasSondas = candidatos.map(c => ({
        titulo: c.titulo,
        revista: c.revista || "",
        prazo: c.prazo || "",
        areas: c.areas || [],
        descricao: c.descricao || "",
        url: c.url || null,
        status: "pendente",
        origem_sync: "radar",
      }));
      try {
        const baseUrl = process.env.VERCEL_URL
          ? `https://${process.env.VERCEL_URL}`
          : "https://gemeo-servidor.vercel.app";
        await fetch(`${baseUrl}/api/sincronizar`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fonte: "radar", nodes: [], sondas: novasSondas }),
        });
      } catch {}
    }

    res.status(200).json({
      ok: true,
      total: candidatos.length,
      candidatos,
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    res.status(500).json({ erro: String(e.message || e) });
  }
}
