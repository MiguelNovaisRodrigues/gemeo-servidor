import { lerGist, escreverGist } from "./_gist.js";

const NOME_FICHEIRO = "gemeo-sondas.json";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.status(200).end(); return; }

  try {
    if (req.method === "GET") {
      const conteudo = await lerGist(NOME_FICHEIRO);
      if (!conteudo || conteudo === "[]") {
        res.status(200).json({ existe: false, dados: null });
        return;
      }
      const parsed = JSON.parse(conteudo);
      // Normalizar: aceitar array directo ou { sondas: [...] }
      const dados = Array.isArray(parsed) ? { sondas: parsed } : parsed;
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
