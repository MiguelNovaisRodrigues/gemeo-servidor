// Busca papers no Semantic Scholar — resposta rápida, sem Claude.
// A análise de relevância é feita separadamente por /api/leituras-analisar.

const SEMANTIC_SCHOLAR = "https://api.semanticscholar.org/graph/v1";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.status(200).end(); return; }
  if (req.method !== "POST") { res.status(405).json({ erro: "Método não suportado" }); return; }

  try {
    const sonda = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    if (!sonda?.titulo) { res.status(400).json({ erro: "Falta título da sonda" }); return; }

    const query = [sonda.titulo, ...(sonda.areas || [])].join(" ");
    const url = `${SEMANTIC_SCHOLAR}/paper/search?query=${encodeURIComponent(query)}&limit=10&fields=title,authors,year,abstract,externalIds,openAccessPdf,venue,citationCount`;

    const resp = await fetch(url, { headers: { Accept: "application/json" } });
    if (!resp.ok) throw new Error(`Semantic Scholar ${resp.status}`);
    const data = await resp.json();
    const papersRaw = data.data || [];

    const resultados = papersRaw.map(p => {
      const doi = p.externalIds?.DOI || null;
      return {
        id: p.paperId || ("ss-" + Math.random().toString(36).slice(2, 8)),
        sonda_id: sonda.id,
        titulo: p.title,
        autores: (p.authors || []).map(a => a.name),
        ano: p.year,
        revista: p.venue || null,
        doi,
        url_doi: doi ? `https://doi.org/${doi}` : null,
        url_open_access: p.openAccessPdf?.url || null,
        citacoes: p.citationCount || 0,
        resumo: p.abstract || null,
        analise_relevancia: null,
        status: "sugerida",
        notas: "",
        data_criacao: new Date().toISOString().slice(0, 10),
        data_leitura: null,
      };
    });

    res.status(200).json({ ok: true, papers: resultados });
  } catch (e) {
    res.status(500).json({ erro: String(e.message || e) });
  }
}
