// Recolha de emails para waitlists de produtos
// POST /api/waitlist { email, produto, perfil? }
// produto: "radar" | "gemeo-pro"

import { lerGist, escreverGist } from "./_gist.js";

const WAITLIST_FILE = "gemeo-waitlist.json";

function validarEmail(e) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.status(200).end(); return; }

  try {
    if (req.method === "GET") {
      // Só acessível com token de admin
      const token = req.query?.token;
      if (token !== process.env.ADMIN_TOKEN) {
        return res.status(401).json({ erro: "Não autorizado" });
      }
      const raw = await lerGist(WAITLIST_FILE);
      const lista = raw && raw !== "[]" ? JSON.parse(raw) : [];
      return res.status(200).json({ ok: true, total: lista.length, lista });
    }

    if (req.method === "POST") {
      const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
      const { email, produto, perfil, nome } = body;

      if (!email || !validarEmail(email)) {
        return res.status(400).json({ erro: "Email inválido" });
      }
      if (!produto || !["radar", "gemeo-pro"].includes(produto)) {
        return res.status(400).json({ erro: "Produto inválido" });
      }

      const raw = await lerGist(WAITLIST_FILE);
      const lista = raw && raw !== "[]" ? JSON.parse(raw) : [];

      // Não duplicar
      const jaExiste = lista.find(e => e.email === email && e.produto === produto);
      if (jaExiste) {
        return res.status(200).json({ ok: true, novo: false, mensagem: "Já estás na lista!" });
      }

      lista.push({
        email,
        produto,
        nome: nome || "",
        perfil: perfil || "",
        data: new Date().toISOString(),
      });

      await escreverGist(WAITLIST_FILE, JSON.stringify(lista));
      return res.status(200).json({ ok: true, novo: true, mensagem: "Adicionado à lista!" });
    }

    res.status(405).json({ erro: "Método não suportado" });
  } catch (e) {
    res.status(500).json({ erro: String(e.message || e) });
  }
}
