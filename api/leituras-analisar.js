// Analisa a relevância de um paper específico para o trabalho do Miguel.
// Chamado a pedido, um paper de cada vez.

const PERFIL_MIGUEL = `Miguel Rodrigues é fotógrafo e doutorando na FBAUL. O seu trabalho centra-se em: fotografia como prática artística; imagens interiores e representação do corpo; teoria e prática da imagem; produção fotográfica (CST — Corpo, Sujeito, Território). Silos de trabalho: Escrita académica, Aulas, Trabalho Artístico, Produtos.`;

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
Descrição: ${sonda.descricao || ''}

PAPER: "${paper.titulo}" (${paper.ano || '?'}, ${paper.revista || '?'})
Autores: ${(paper.autores || []).join(', ')}
Resumo: ${(paper.resumo || 'sem resumo').slice(0, 500)}

Em 2-3 frases: (1) de que trata este paper; (2) que ligações tem ao trabalho do Miguel e a esta chamada. Sê directo e honesto.`;

    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 250,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    const data = await resp.json();
    const analise = data.content?.[0]?.text || "Análise indisponível.";
    res.status(200).json({ ok: true, analise });
  } catch (e) {
    res.status(500).json({ erro: String(e.message || e) });
  }
}
