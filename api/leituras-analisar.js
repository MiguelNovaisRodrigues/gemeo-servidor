// Analisa a relevância de um paper específico para o trabalho do Miguel.
// Devolve análise textual + scores de relevância por silo (escrita/aulas/cst/produtos).

const PERFIL_MIGUEL = `Miguel Rodrigues é fotógrafo e doutorando na FBAUL. O seu trabalho centra-se em: fotografia como prática artística; imagens interiores e representação do corpo; teoria e prática da imagem; produção fotográfica (CST — Corpo, Sujeito, Território).
Silos de trabalho:
- escrita: artigos, ensaios, textos académicos, tese
- aulas: docência, pedagogia, materiais didáticos
- cst: trabalho artístico, produção fotográfica, exposições
- produtos: publicações, livros, edições, objetos físicos`;

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.status(200).end(); return; }
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
    "escrita": <0-10 relevância para escrita académica>,
    "aulas": <0-10 relevância para docência>,
    "cst": <0-10 relevância para trabalho artístico/fotografia>,
    "produtos": <0-10 relevância para publicações/objetos>
  }
}`;

    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 400,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    const data = await resp.json();
    const text = data.content?.[0]?.text || "{}";
    let analise = "Análise indisponível.";
    let relevancia_silos = null;
    try {
      const match = text.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        analise = parsed.analise || analise;
        relevancia_silos = parsed.relevancia_silos || null;
      }
    } catch { analise = text; }
    res.status(200).json({ ok: true, analise, relevancia_silos });
  } catch (e) {
    res.status(500).json({ erro: String(e.message || e) });
  }
}
