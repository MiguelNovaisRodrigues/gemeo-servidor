// Captura universal — recebe URL ou texto de qualquer fonte (browser, IA, email, etc.)
// classifica automaticamente e devolve dados estruturados para o Gémeo.
// POST { url?, texto?, contexto? }
// Devolve { resumo, itens: [{ tipo_item, ...campos }] }

import { lerGist, escreverGist } from "./_gist.js";

const PERFIL = `Fotógrafo e doutorando na FBAUL (Lisboa). Trabalho: fotografia artística, imagens interiores, corpo, CST (Corpo Sujeito Território), teoria da imagem, Flusser, visualidade contemporânea, filosofia da fotografia, estudos visuais, práticas artísticas baseadas em investigação, história da arte contemporânea, filosofia da arte, filosofia da tecnologia, memória e arquivo.
Silos de trabalho: escrita (artigos/tese), aulas (docência IPT+IADE), cst (trabalho artístico/fotografia), produtos (publicações), administrativo (burocracia institucional).`;

const APRENDIZAGEM_FILE = "gemeo-aprendizagem-captura.json";

// Devolve as últimas N correções de silos como exemplos few-shot
async function carregarExemplos(n = 6) {
  try {
    const raw = await lerGist(APRENDIZAGEM_FILE);
    if (!raw || raw === "{}") return "";
    const lista = JSON.parse(raw);
    if (!Array.isArray(lista) || lista.length === 0) return "";
    const recentes = lista.slice(-n);
    return "\n\nEXEMPLOS DE CLASSIFICAÇÕES ANTERIORES (aprende com estes):\n" +
      recentes.map(e =>
        `- Título: "${e.titulo}" → silos confirmados: [${e.silos_confirmados.join(", ")}]`
      ).join("\n");
  } catch { return ""; }
}

async function fetchPagina(url) {
  try {
    const resp = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; GemeoCaptura/1.0)" },
      signal: AbortSignal.timeout(6000),
    });
    if (!resp.ok) return "";
    const html = await resp.text();
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
      .replace(/&nbsp;/g, " ").replace(/&#\d+;/g, " ")
      .replace(/\s{3,}/g, "\n")
      .trim()
      .slice(0, 5000);
  } catch {
    return "";
  }
}

async function classificar(texto, urlOrigem) {
  const exemplos = await carregarExemplos(6);
  const prompt = `${PERFIL}${exemplos}

Analisa o seguinte conteúdo e classifica o que encontras. Pode conter uma ou mais coisas:
- "sonda": chamada para artigos/conferência/exposição/residência com prazo
- "leitura": paper académico, livro, artigo, site, texto, referência bibliográfica
- "node": tarefa, ideia, projecto, compromisso ou qualquer outra coisa relevante para o trabalho
- Se não encontrares nada relevante, devolve itens vazio

IMPORTANTE para leituras: sugere TODOS os silos onde este conteúdo faz sentido (pode ser mais de um).
Usa os exemplos de classificações anteriores para calibrar as sugestões de silos.

URL de origem (se disponível): ${urlOrigem || "nenhum"}

CONTEÚDO:
${texto.slice(0, 4000)}

Responde APENAS com JSON (sem texto antes ou depois):
{
  "resumo": "1 frase: o que foi encontrado",
  "itens": [
    {
      "tipo_item": "sonda",
      "titulo": "título da chamada",
      "revista": "nome da publicação/evento/instituição",
      "prazo": "YYYY-MM-DD ou null",
      "areas": ["área 1", "área 2"],
      "descricao": "1-2 frases sobre a chamada e ligação ao perfil",
      "url": "${urlOrigem || "null"}",
      "relevancia": 8
    },
    {
      "tipo_item": "leitura",
      "titulo": "título do paper/livro/artigo/site",
      "autores": ["Apelido, Nome"],
      "ano": 2023,
      "revista": "nome da revista/editora/site (ou null)",
      "doi": "10.xxx/xxx ou null",
      "url": "${urlOrigem || "null"}",
      "resumo": "1-2 frases sobre o conteúdo",
      "relevancia": 7,
      "silos_sugeridos": ["escrita", "aulas"]
    },
    {
      "tipo_item": "node",
      "label": "título curto para o nó",
      "silo": "escrita|aulas|cst|produtos|administrativo",
      "prazo": "YYYY-MM-DD ou null",
      "descricao": "contexto breve"
    }
  ]
}

Podes devolver vários itens de tipos mistos se o conteúdo contiver múltiplas coisas.`;

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
    const text = data.content?.[0]?.text || "{}";
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return { resumo: "Nada reconhecido.", itens: [] };
    const parsed = JSON.parse(match[0]);
    return {
      resumo: parsed.resumo || "Conteúdo capturado.",
      itens: Array.isArray(parsed.itens) ? parsed.itens : [],
    };
  } catch (e) {
    return { resumo: "Erro na análise.", itens: [] };
  }
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.status(200).end(); return; }
  if (req.method !== "POST") { res.status(405).json({ erro: "Método não suportado" }); return; }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;

    // Guardar correção de aprendizagem: POST { _feedback: true, titulo, silos_sugeridos, silos_confirmados }
    if (body?._feedback) {
      const raw = await lerGist(APRENDIZAGEM_FILE).catch(() => "[]");
      const lista = (() => { try { return JSON.parse(raw || "[]"); } catch { return []; } })();
      lista.push({
        titulo: body.titulo || "",
        silos_sugeridos: body.silos_sugeridos || [],
        silos_confirmados: body.silos_confirmados || [],
        data: new Date().toISOString().slice(0, 10),
      });
      // Manter apenas os últimos 100
      const recentes = lista.slice(-100);
      await escreverGist(APRENDIZAGEM_FILE, JSON.stringify(recentes));
      return res.status(200).json({ ok: true });
    }

    const { url, texto, contexto } = body || {};

    if (!url && !texto) {
      return res.status(400).json({ erro: "Falta url ou texto" });
    }

    let conteudo = texto || "";

    // Se tiver URL, vai buscar a página
    if (url) {
      const paginaTexto = await fetchPagina(url);
      conteudo = [paginaTexto, texto, contexto].filter(Boolean).join("\n\n");
    } else if (contexto) {
      conteudo = [texto, contexto].filter(Boolean).join("\n\n");
    }

    const resultado = await classificar(conteudo, url || null);

    res.status(200).json({
      ok: true,
      resumo: resultado.resumo,
      itens: resultado.itens,
      total: resultado.itens.length,
    });
  } catch (e) {
    res.status(500).json({ erro: String(e.message || e) });
  }
}
