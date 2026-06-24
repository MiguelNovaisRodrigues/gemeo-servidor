// Busca papers no Semantic Scholar e analisa relevância com uma única chamada Claude.
// Optimizado para caber no timeout de 10s do Vercel hobby.

const SEMANTIC_SCHOLAR = "https://api.semanticscholar.org/graph/v1";

const PERFIL_MIGUEL = `Miguel Rodrigues é fotógrafo e doutorando na FBAUL. O seu trabalho centra-se em: fotografia como prática artística; imagens interiores e representação do corpo; teoria e prática da imagem; produção fotográfica (CST — Corpo, Sujeito, Território). Silos de trabalho: Escrita académica, Aulas, Trabalho Artístico, Produtos.`;

async function buscarSemanticScholar(query, limite = 8) {
  const url = `${SEMANTIC_SCHOLAR}/paper/search?query=${encodeURIComponent(query)}&limit=${limite}&fields=title,authors,year,abstract,externalIds,openAccessPdf,venue,citationCount`;
  const resp = await fetch(url, { headers: { Accept: "application/json" } });
  if (!resp.ok) throw new Error(`Semantic Scholar ${resp.status}`);
  const data = await resp.json();
  return data.data || [];
}

async function analisarTodos(papers, sonda) {
  const lista = papers.map((p, i) =>
    `[${i+1}] "${p.title}" (${p.year || '?'}, ${p.venue || '?'})\nResumo: ${(p.abstract || 'sem resumo').slice(0, 300)}`
  ).join('\n\n');

  const prompt = `${PERFIL_MIGUEL}

CHAMADA PARA ARTIGO:
Título: ${sonda.titulo}
Revista: ${sonda.revista || '?'}
Áreas: ${(sonda.areas || []).join(', ')}
Descrição: ${sonda.descricao || ''}

PAPERS A AVALIAR:
${lista}

Para cada paper, responde APENAS com JSON neste formato exato (array com ${papers.length} objectos):
[{"n":1,"analise":"2-3 frases sobre relevância para o trabalho do Miguel e esta chamada"},{"n":2,...}]
Sê honesto — se a ligação for fraca, diz isso. Responde APENAS com o JSON, sem mais texto.`;

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
  try {
    return JSON.parse(text);
  } catch {
    // tentar extrair JSON do texto
    const match = text.match(/\[[\s\S]*\]/);
    return match ? JSON.parse(match[0]) : [];
  }
}

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
    const papersRaw = await buscarSemanticScholar(query, 8);

    if (papersRaw.length === 0) {
      res.status(200).json({ ok: true, papers: [] });
      return;
    }

    const analises = await analisarTodos(papersRaw, sonda);

    const resultados = papersRaw.map((p, i) => {
      const doi = p.externalIds?.DOI || null;
      const analiseObj = analises.find(a => a.n === i + 1);
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
        analise_relevancia: analiseObj?.analise || "Análise indisponível.",
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
