// Busca papers no OpenAlex e ordena por relevância (call + trabalho do Miguel) via Claude Haiku.
// Adiciona sempre referências fundacionais (clássicos canónicos) no topo.

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.status(200).end(); return; }
  if (req.method !== "POST") { res.status(405).json({ erro: "Método não suportado" }); return; }

  try {
    const sonda = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    if (!sonda?.titulo) { res.status(400).json({ erro: "Falta título da sonda" }); return; }

    const fields = "id,title,authorships,publication_year,abstract_inverted_index,primary_location,cited_by_count,open_access,doi";
    const baseUrl = `https://api.openalex.org/works?per-page=10&mailto=gemeo@miguelrodrigues.pt&select=${fields}`;

    // Três queries: contemporânea, académica, e clássicos canónicos
    const areasEn = (sonda.areas || []).join(" ");
    const queries = [
      sonda.titulo + " " + areasEn,                                                                          // título + áreas
      areasEn + " photography visual art embodiment theory representation",                                  // académica inglês
      areasEn + " Barthes Sontag Berger Benjamin Flusser Sekula Burgin Merleau-Ponty Butler photography",   // clássicos
    ];

    const resps = await Promise.all(queries.map(q =>
      fetch(`${baseUrl}&search=${encodeURIComponent(q)}`, { headers: { Accept: "application/json" } })
        .then(r => r.ok ? r.json() : { results: [] })
        .catch(() => ({ results: [] }))
    ));

    // Juntar e desduplicar por ID
    const seen = new Set();
    const papersRaw = resps.flatMap(d => d.results || []).filter(p => {
      if (!p.id || seen.has(p.id)) return false;
      seen.add(p.id); return true;
    }).slice(0, 16);

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
        tipo: "contemporaneo",
        status: "sugerida",
        notas: "",
        data_criacao: new Date().toISOString().slice(0, 10),
        data_leitura: null,
      };
    });

    // Correr scoring e referências fundacionais em paralelo
    const [ordenados, classicos] = await Promise.all([
      ordenarPorRelevancia(resultados, sonda),
      sugerirClassicos(sonda),
    ]);

    // Clássicos entram no topo (sem duplicar se já vieram do OpenAlex)
    const titulosOpenAlex = new Set(ordenados.map(p => p.titulo?.toLowerCase()));
    const classicosNovos = classicos.filter(c => !titulosOpenAlex.has(c.titulo?.toLowerCase()));

    res.status(200).json({ ok: true, papers: [...classicosNovos, ...ordenados] });
  } catch (e) {
    res.status(500).json({ erro: String(e.message || e) });
  }
}

const PERFIL = `Fotógrafo e doutorando FBAUL. Trabalho: fotografia artística, imagens interiores, corpo, CST (Corpo Sujeito Território), teoria da imagem, Flusser, visualidade contemporânea.`;

async function ordenarPorRelevancia(papers, sonda) {
  try {
    const lista = papers.map((p, i) =>
      `${i}:"${p.titulo}" (${p.ano||'?'}) - ${(p.resumo||'').slice(0,150)}`
    ).join('\n');

    const prompt = `Perfil: ${PERFIL}
Call: "${sonda.titulo}" — áreas: ${(sonda.areas||[]).join(', ')}

Papers (índice:título - resumo):
${lista}

Pontua cada paper de 0-10 por relevância para este perfil + call.
Responde APENAS com JSON compacto: [{"i":0,"s":8},{"i":1,"s":3},...] — um objecto por paper, sem mais texto.`;

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
    const text = data.content?.[0]?.text || "[]";
    const match = text.match(/\[[\s\S]*?\]/);
    const scores = match ? JSON.parse(match[0]) : [];

    // Adicionar score a cada paper e ordenar
    scores.forEach(({ i, s }) => { if (papers[i]) papers[i].relevancia = s; });
    return papers
      .map(p => ({ ...p, relevancia: p.relevancia ?? 0 }))
      .sort((a, b) => b.relevancia - a.relevancia);
  } catch {
    return papers; // se falhar, devolve na ordem original
  }
}

async function sugerirClassicos(sonda) {
  try {
    const prompt = `${PERFIL}
Call: "${sonda.titulo}" — áreas: ${(sonda.areas||[]).join(', ')}
Descrição: ${(sonda.descricao||'').slice(0,300)}

Lista 4 referências fundacionais canónicas (livros ou textos clássicos, não papers recentes) directamente relevantes para esta call e para o perfil acima. Inclui autores canónicos como Barthes, Benjamin, Sontag, Berger, Flusser, Sekula, Burgin, Merleau-Ponty, Butler, Derrida, Krauss, Rancière, Agamben, Tagg, Wells, Campany, Barad — conforme o tema.

Responde APENAS com JSON compacto (sem texto antes ou depois):
[{"titulo":"...","autores":["..."],"ano":1980,"editora":"...","resumo":"uma frase sobre o livro e a sua relevância para esta call"}]`;

    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 500,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    const data = await resp.json();
    const text = data.content?.[0]?.text || "[]";
    const match = text.match(/\[[\s\S]*?\]/);
    const refs = match ? JSON.parse(match[0]) : [];

    const hoje = new Date().toISOString().slice(0, 10);
    return refs.map(r => ({
      id: "classico-" + Math.random().toString(36).slice(2, 8),
      sonda_id: sonda.id,
      titulo: r.titulo,
      autores: r.autores || [],
      ano: r.ano || null,
      revista: r.editora || null,
      doi: null,
      url_doi: null,
      url_open_access: null,
      citacoes: null,
      resumo: r.resumo || null,
      analise_relevancia: null,
      tipo: "classico",
      relevancia: 10,
      status: "sugerida",
      notas: "",
      data_criacao: hoje,
      data_leitura: null,
    }));
  } catch {
    return []; // se falhar, sem clássicos (não quebra o resultado principal)
  }
}
