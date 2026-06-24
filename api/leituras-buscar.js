// Busca papers relevantes para uma sonda no Semantic Scholar.
// Para cada paper: verifica se o link existe, depois pede ao Claude uma
// análise de relevância para o trabalho do Miguel.

const SEMANTIC_SCHOLAR = "https://api.semanticscholar.org/graph/v1";
const UNPAYWALL = "https://api.unpaywall.org/v2";

// Perfil do trabalho do Miguel — usado pelo Claude para contextualizar
const PERFIL_MIGUEL = `
Miguel Rodrigues é fotógrafo e doutorando na FBAUL (Faculdade de Belas-Artes da Universidade de Lisboa).
O seu trabalho centra-se em: fotografia como prática artística; imagens interiores e representação do corpo;
trabalho artístico e escrita académica (teoria e prática); produção fotográfica (CST — Corpo, Sujeito, Território).
Os seus silos de trabalho são: Escrita académica, Aulas, Trabalho Artístico (CST), Produtos.
`;

async function buscarSemanticScholar(query, limite = 15) {
  const url = `${SEMANTIC_SCHOLAR}/paper/search?query=${encodeURIComponent(query)}&limit=${limite}&fields=title,authors,year,abstract,externalIds,openAccessPdf,venue,citationCount`;
  const resp = await fetch(url, {
    headers: { "Accept": "application/json" }
  });
  if (!resp.ok) throw new Error(`Semantic Scholar erro: ${resp.status}`);
  const data = await resp.json();
  return data.data || [];
}

async function verificarLinkOpenAccess(doi) {
  if (!doi) return null;
  try {
    const resp = await fetch(`${UNPAYWALL}/${encodeURIComponent(doi)}?email=gemeo@miguelrodrigues.pt`);
    if (!resp.ok) return null;
    const data = await resp.json();
    if (data.best_oa_location && data.best_oa_location.url_for_pdf) {
      return data.best_oa_location.url_for_pdf;
    }
    if (data.best_oa_location && data.best_oa_location.url) {
      return data.best_oa_location.url;
    }
    return null;
  } catch { return null; }
}

async function analisarRelevancia(paper, sonda) {
  const prompt = `${PERFIL_MIGUEL}

CHAMADA PARA ARTIGO:
Título: ${sonda.titulo}
Revista: ${sonda.revista}
Áreas: ${(sonda.areas || []).join(", ")}
Descrição: ${sonda.descricao}

PAPER A AVALIAR:
Título: ${paper.title}
Autores: ${(paper.authors || []).map(a => a.name).join(", ")}
Ano: ${paper.year}
Revista/Venue: ${paper.venue || "—"}
Resumo: ${paper.abstract || "Sem resumo disponível"}

Avalia em 3-4 frases concisas: (1) de que trata este paper; (2) que ligações tem ao trabalho do Miguel e à chamada; (3) porque pode ser útil para escrever este artigo. Sê específico e honesto — se a ligação for fraca, diz isso.`;

  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 300,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  const data = await resp.json();
  return data.content?.[0]?.text || "Análise indisponível.";
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.status(200).end(); return; }
  if (req.method !== "POST") { res.status(405).json({ erro: "Método não suportado" }); return; }

  try {
    const sonda = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    if (!sonda || !sonda.titulo) {
      res.status(400).json({ erro: "Sonda inválida — falta título" });
      return;
    }

    // Construir query de busca a partir da sonda
    const query = [sonda.titulo, ...(sonda.areas || [])].join(" ");
    const papersRaw = await buscarSemanticScholar(query);

    // Para cada paper: verificar link + analisar relevância (em paralelo, limite 8)
    const papers = papersRaw.slice(0, 8);
    const resultados = await Promise.all(papers.map(async (p) => {
      const doi = p.externalIds?.DOI || null;
      const url_doi = doi ? `https://doi.org/${doi}` : null;
      const url_open_access = p.openAccessPdf?.url || await verificarLinkOpenAccess(doi);
      const analise = await analisarRelevancia(p, sonda);

      return {
        id: p.paperId || ("ss-" + Math.random().toString(36).slice(2, 8)),
        sonda_id: sonda.id,
        titulo: p.title,
        autores: (p.authors || []).map(a => a.name),
        ano: p.year,
        revista: p.venue || null,
        doi,
        url_doi,
        url_open_access,
        citacoes: p.citationCount || 0,
        resumo: p.abstract || null,
        analise_relevancia: analise,
        status: "sugerida",
        notas: "",
        data_criacao: new Date().toISOString().slice(0, 10),
        data_leitura: null,
      };
    }));

    res.status(200).json({ ok: true, papers: resultados });
  } catch (e) {
    res.status(500).json({ erro: String(e.message || e) });
  }
}
