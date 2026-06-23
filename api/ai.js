// Endpoint de IA do Gémeo Digital
// Recebe uma pergunta do frontend, envia para a Claude API, devolve a resposta.
// A chave ANTHROPIC_API_KEY vem de variáveis de ambiente (configuradas na Vercel).

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.status(200).end(); return; }

  if (req.method !== "POST") {
    res.status(405).json({ erro: "Método não suportado" });
    return;
  }

  try {
    const { mensagem, contexto } = req.body;

    if (!mensagem) {
      res.status(400).json({ erro: "Falta o campo 'mensagem'" });
      return;
    }

    // Monta as mensagens: contexto opcional (dados do gémeo) + pergunta do utilizador
    const messages = [];
    if (contexto) {
      messages.push({
        role: "user",
        content: `Contexto do Gémeo Digital (dados actuais):\n${JSON.stringify(contexto, null, 2)}\n\n${mensagem}`
      });
    } else {
      messages.push({ role: "user", content: mensagem });
    }

    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1024,
        system: "És o assistente do Gémeo Digital, um sistema de gestão de carreira artística/académica. Respondes em português (Portugal), de forma concisa e directa.",
        messages,
      }),
    });

    const data = await resp.json();

    if (data.error) {
      res.status(500).json({ erro: data.error.message });
      return;
    }

    res.status(200).json({ resposta: data.content[0].text });
  } catch (e) {
    res.status(500).json({ erro: String(e.message || e) });
  }
}
