// Busca papers no OpenAlex — gratuito, sem limites, resposta rápida.
// A análise de relevância é feita separadamente por /api/leituras-analisar.

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
    const url = `https://api.openalex.org/works?search=${encodeURIComponent(query)}&per-page=10&mailto=gemeo@miguelrodrigues.pt&select=id,title,authorships,publication_year,abstract_inverted_index,primary_location,cited_by_count,open_access,doi`;

    const resp = await fetch(url, { headers: { Accept: "application/json" } });
    if (!resp.ok) throw new Error(`OpenAlex ${resp.status}`);
    const data = await resp.json();
    const papersRaw = data.results || [];

    const resultados = papersRaw.map(p => {
      // Reconstruir abstract do índice invertido
      let resumo = null;
      if (p.abstract_inverted_index) {
        try {
          const words = {};
          Object.entries(p.abstract_inverted_index).forEach(([word, positions]) => {
            positions.forEach(pos => { words[pos] = word; });
          });
          resumo = Object.keys(words).sort((a,b) => a-b).map(k => words[k]).join(" ");
        } catch {}
      }
      const doi = p.doi ? p.doi.replace("https://doi.org/", "") : null;
      const venue = p.primary_location?.source?.display_name || null;
      const autores = (p.authorships || []).slice(0, 5).map(a => a.author?.display_name).filter(Boolean);
      return {
        id: p.id?.replace("https://openalex.org/", "") || ("oa-" + Math.random().toString(36).slice(2, 8)),
        sonda_id: sonda.id,
        titulo: p.title,
        autores,
        ano: p.publication_year,
        revista: venue,
        doi,
        url_doi: doi ? `https://doi.org/${doi}` : null,
        url_open_access: p.open_access?.oa_url || null,
        citacoes: p.cited_by_count || 0,
        resumo,
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
