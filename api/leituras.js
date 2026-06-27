import { lerGist, escreverGist } from "./_gist.js";

const NOME_FICHEIRO = "gemeo-leituras.json";

// GET/POST              → CRUD de leituras
// POST ?action=analisar → analisa relevância de um paper (ex-leituras-analisar.js)
// POST ?action=buscar   → busca papers no OpenAlex (ex-leituras-buscar.js)

const PERFIL_MIGUEL = `Miguel Rodrigues é fotógrafo e doutorando na FBAUL. O seu trabalho centra-se em: fotografia como prática artística; imagens interiores e representação do corpo; teoria e prática da imagem; produção fotográfica (CST — Corpo, Sujeito, Território).
Silos de trabalho:
- escrita: artigos, ensaios, textos académicos, tese
- aulas: docência, pedagogia, materiais didáticos
- cst: trabalho artístico, produção fotográfica, exposições
- produtos: publicações, livros, edições, objetos físicos`;

const PERFIL_BUSCA = `Fotógrafo e doutorando FBAUL. Trabalho: fotografia artística, imagens interiores, corpo, CST (Corpo Sujeito Território), teoria da imagem, Flusser, visualidade contemporânea.`;

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.status(200).end(); return; }

  const action = req.query?.action;

  // --- action=analisar ---
  if (action === "analisar") {
    if (req.method !== "POST") { res.status(405).json({ erro: "Método não suportado" }); return; }
    try {
      const { paper, sonda } = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
      if (!paper || !sonda) { res.status(400).json({ erro: "Faltam paper ou sonda" }); return; }

      const prompt = `${PERFIL_MIGUEL}

CHAMADA PARA ARTIGO: "${sonda.titulo}" (${sonda.revista || ''})
Áreas: ${(sonda.areas || []).join(', ')}
Descrição: ${(sonda.descricao || '').slice(0, 300)}

PAPER: "${paper.titulo}" (${paper.ano || '?'}, ${paper.revista || '?'})
Autores: ${(paper.autores || []).join(', ')}
Resumo: ${(paper.resumo || 'sem resumo').slice(0, 500)}

Responde APENAS com JSON (sem texto antes ou depois):
{
  "analise": "2-3 frases: (1) de que trata este paper; (2) que ligações concretas tem ao trabalho do Miguel e a esta chamada",
  "relevancia_silos": {
    "escrita": <0-10>,
    "aulas": <0-10>,
    "cst": <0-10>,
    "produtos": <0-10>
  }
}`;

      const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": process.env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ model: "claude-haiku-4-5-20251001", max_tokens: 400, messages: [{ role: "user", content: prompt }] }),
      });
      const data = await resp.json();
      const text = data.content?.[0]?.text || "{}";
      let analise = "Análise indisponível.";
      let relevancia_silos = null;
      try {
        const match = text.match(/\{[\s\S]*\}/);
        if (match) { const parsed = JSON.parse(match[0]); analise = parsed.analise || analise; relevancia_silos = parsed.relevancia_silos || null; }
      } catch { analise = text; }
      res.status(200).json({ ok: true, analise, relevancia_silos });
    } catch (e) {
      res.status(500).json({ erro: String(e.message || e) });
    }
    return;
  }

  // --- action=buscar ---
  if (action === "buscar") {
    if (req.method !== "POST") { res.status(405).json({ erro: "Método não suportado" }); return; }
    try {
      const sonda = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
      if (!sonda?.titulo) { res.status(400).json({ erro: "Falta título da sonda" }); return; }

      const fields = "id,title,authorships,publication_year,abstract_inverted_index,primary_location,cited_by_count,open_access,doi";
      const baseUrl = `https://api.openalex.org/works?per-page=10&mailto=gemeo@miguelrodrigues.pt&select=${fields}`;
      const areasEn = (sonda.areas || []).join(" ");
      const queries = [
        sonda.titulo + " " + areasEn,
        areasEn + " photography visual art embodiment theory representation",
        areasEn + " Barthes Sontag Berger Benjamin Flusser Sekula Burgin Merleau-Ponty Butler photography",
      ];

      const resps = await Promise.all(queries.map(q =>
        fetch(`${baseUrl}&search=${encodeURIComponent(q)}`, { headers: { Accept: "application/json" } })
          .then(r => r.ok ? r.json() : { results: [] }).catch(() => ({ results: [] }))
      ));

      const seen = new Set();
      const papersRaw = resps.flatMap(d => d.results || []).filter(p => {
        if (!p.id || seen.has(p.id)) return false;
        seen.add(p.id); return true;
      }).slice(0, 16);

      const resultados = papersRaw.map(p => {
        let resumo = null;
        if (p.abstract_inverted_index) {
          try {
            const words = {};
            Object.entries(p.abstract_inverted_index).forEach(([word, positions]) => { positions.forEach(pos => { words[pos] = word; }); });
            resumo = Object.keys(words).sort((a, b) => a - b).map(k => words[k]).join(" ");
          } catch {}
        }
        const doi = p.doi ? p.doi.replace("https://doi.org/", "") : null;
        const venue = p.primary_location?.source?.display_name || null;
        const autores = (p.authorships || []).slice(0, 5).map(a => a.author?.display_name).filter(Boolean);
        return {
          id: p.id?.replace("https://openalex.org/", "") || ("oa-" + Math.random().toString(36).slice(2, 8)),
          sonda_id: sonda.id, titulo: p.title, autores, ano: p.publication_year, revista: venue, doi,
          url_doi: doi ? `https://doi.org/${doi}` : null,
          url_open_access: p.open_access?.oa_url || null,
          citacoes: p.cited_by_count || 0, resumo, analise_relevancia: null,
          tipo: "contemporaneo", status: "sugerida", notas: "",
          data_criacao: new Date().toISOString().slice(0, 10), data_leitura: null,
        };
      });

      const [ordenados, classicos] = await Promise.all([
        ordenarPorRelevancia(resultados, sonda),
        sugerirClassicos(sonda),
      ]);

      const titulosOpenAlex = new Set(ordenados.map(p => p.titulo?.toLowerCase()));
      const classicosNovos = classicos.filter(c => !titulosOpenAlex.has(c.titulo?.toLowerCase()));
      res.status(200).json({ ok: true, papers: [...classicosNovos, ...ordenados] });
    } catch (e) {
      res.status(500).json({ erro: String(e.message || e) });
    }
    return;
  }

  // --- CRUD base ---
  try {
    if (req.method === "GET") {
      const conteudo = await lerGist(NOME_FICHEIRO);
      if (!conteudo) { res.status(200).json({ existe: false, dados: { leituras: [] } }); return; }
      const parsed = JSON.parse(conteudo);
      const dados = Array.isArray(parsed) ? { leituras: parsed } : parsed;
      res.status(200).json({ existe: true, dados });
      return;
    }
    if (req.method === "POST") {
      const conteudo = typeof req.body === "string" ? req.body : JSON.stringify(req.body);
      await escreverGist(NOME_FICHEIRO, conteudo);
      res.status(200).json({ ok: true });
      return;
    }
    res.status(405).json({ erro: "Método não suportado" });
  } catch (e) {
    res.status(500).json({ erro: String(e.message || e) });
  }
}

async function ordenarPorRelevancia(papers, sonda) {
  try {
    const lista = papers.map((p, i) => `${i}:"${p.titulo}" (${p.ano || '?'}) - ${(p.resumo || '').slice(0, 150)}`).join('\n');
    const prompt = `Perfil: ${PERFIL_BUSCA}\nCall: "${sonda.titulo}" — áreas: ${(sonda.areas || []).join(', ')}\n\nPapers (índice:título - resumo):\n${lista}\n\nPontua cada paper de 0-10 por relevância para este perfil + call.\nResponde APENAS com JSON compacto: [{"i":0,"s":8},{"i":1,"s":3},...] — um objecto por paper, sem mais texto.`;
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
      body: JSON.stringify({ model: "claude-haiku-4-5-20251001", max_tokens: 300, messages: [{ role: "user", content: prompt }] }),
    });
    const data = await resp.json();
    const text = data.content?.[0]?.text || "[]";
    const match = text.match(/\[[\s\S]*?\]/);
    const scores = match ? JSON.parse(match[0]) : [];
    scores.forEach(({ i, s }) => { if (papers[i]) papers[i].relevancia = s; });
    return papers.map(p => ({ ...p, relevancia: p.relevancia ?? 0 })).sort((a, b) => b.relevancia - a.relevancia);
  } catch { return papers; }
}

async function sugerirClassicos(sonda) {
  try {
    const prompt = `${PERFIL_BUSCA}\nCall: "${sonda.titulo}" — áreas: ${(sonda.areas || []).join(', ')}\nDescrição: ${(sonda.descricao || '').slice(0, 300)}\n\nLista 4 referências fundacionais canónicas (livros ou textos clássicos, não papers recentes) directamente relevantes para esta call e para o perfil acima.\n\nResponde APENAS com JSON compacto:\n[{"titulo":"...","autores":["..."],"ano":1980,"editora":"...","resumo":"uma frase"}]`;
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
      body: JSON.stringify({ model: "claude-haiku-4-5-20251001", max_tokens: 500, messages: [{ role: "user", content: prompt }] }),
    });
    const data = await resp.json();
    const text = data.content?.[0]?.text || "[]";
    const match = text.match(/\[[\s\S]*?\]/);
    const refs = match ? JSON.parse(match[0]) : [];
    const hoje = new Date().toISOString().slice(0, 10);
    return refs.map(r => ({
      id: "classico-" + Math.random().toString(36).slice(2, 8), sonda_id: sonda.id,
      titulo: r.titulo, autores: r.autores || [], ano: r.ano || null, revista: r.editora || null,
      doi: null, url_doi: null, url_open_access: null, citacoes: null, resumo: r.resumo || null,
      analise_relevancia: null, tipo: "classico", relevancia: 10, status: "sugerida",
      notas: "", data_criacao: hoje, data_leitura: null,
    }));
  } catch { return []; }
}
