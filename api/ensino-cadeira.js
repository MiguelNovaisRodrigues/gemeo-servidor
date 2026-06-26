// Gestão de ensino por cadeira: FUC, planificação, briefings, alunos.
// GET /api/ensino-cadeira?id=c_hf1   → dados da cadeira
// POST /api/ensino-cadeira            → { id, dados } — guarda dados da cadeira
// GET /api/ensino-cadeira?todas=1    → todas as cadeiras (para lembrete mensal)

import { lerGist, escreverGist } from "./_gist.js";

const ENSINO_FILE = "gemeo-ensino.json";

// Template de planificação vazio (15 semanas)
function templatePlanificacao() {
  return Array.from({ length: 15 }, (_, i) => ({
    n: i + 1,
    data: "",
    tema: "",
    objetivos: "",
    materiais: "",
    notas: "",
  }));
}

// Template de cadeira vazio
function templateCadeira(id) {
  return {
    id,
    fuc_url: "",
    fuc_notas: "",
    planificacao: templatePlanificacao(),
    briefings: [],
    alunos: [],
    ultima_edicao: new Date().toISOString(),
  };
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.status(200).end(); return; }

  try {
    const raw = await lerGist(ENSINO_FILE);
    const ensino = raw && raw !== "{}" ? JSON.parse(raw) : {};

    if (req.method === "GET") {
      const todas = req.query?.todas === "1";
      const id = req.query?.id;

      if (todas) {
        return res.status(200).json({ ok: true, ensino });
      }
      if (!id) return res.status(400).json({ erro: "Falta id" });

      const dados = ensino[id] || templateCadeira(id);
      return res.status(200).json({ ok: true, id, dados });
    }

    if (req.method === "POST") {
      const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
      const { id, dados } = body || {};
      if (!id || !dados) return res.status(400).json({ erro: "Falta id ou dados" });

      ensino[id] = { ...dados, ultima_edicao: new Date().toISOString() };
      await escreverGist(ENSINO_FILE, JSON.stringify(ensino));
      return res.status(200).json({ ok: true });
    }

    res.status(405).json({ erro: "Método não suportado" });
  } catch (e) {
    res.status(500).json({ erro: String(e.message || e) });
  }
}
