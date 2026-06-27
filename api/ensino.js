// GET /api/ensino              → todas as escolas + cadeiras (público)
// GET /api/ensino?escola=n_ipt → só uma escola
// GET /api/ensino?id=c_hf1    → só uma cadeira (público)
// GET /api/ensino?cadeira=1&id=c_hf1  → dados internos de cadeira (ex-ensino-cadeira.js)
// GET /api/ensino?cadeira=1&todas=1   → todas as cadeiras internas
// POST /api/ensino?cadeira=1          → { id, dados } — guarda dados internos

import { lerGist, escreverGist } from "./_gist.js";

const DADOS_FILE  = "gemeo-dados.json";
const ENSINO_FILE = "gemeo-ensino.json";

const ESCOLA_IDS = ["n_atelier", "n_iade", "n_ipt"];
const ESCOLA_NOMES = { n_atelier: "Atelier de Lisboa", n_iade: "IADE", n_ipt: "IPT" };

function templatePlanificacao() {
  return Array.from({ length: 15 }, (_, i) => ({ n: i + 1, data: "", tema: "", objetivos: "", materiais: "", notas: "" }));
}
function templateCadeira(id) {
  return { id, fuc_url: "", fuc_notas: "", planificacao: templatePlanificacao(), briefings: [], alunos: [], ultima_edicao: new Date().toISOString() };
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.status(200).end(); return; }

  // --- Gestão interna de cadeira (ex-ensino-cadeira.js) ---
  if (req.query?.cadeira === "1") {
    try {
      const raw = await lerGist(ENSINO_FILE);
      const ensino = raw && raw !== "{}" ? JSON.parse(raw) : {};

      if (req.method === "GET") {
        if (req.query?.todas === "1") return res.status(200).json({ ok: true, ensino });
        const id = req.query?.id;
        if (!id) return res.status(400).json({ erro: "Falta id" });
        return res.status(200).json({ ok: true, id, dados: ensino[id] || templateCadeira(id) });
      }
      if (req.method === "POST") {
        const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
        const { id, dados } = body || {};
        if (!id || !dados) return res.status(400).json({ erro: "Falta id ou dados" });
        ensino[id] = { ...dados, ultima_edicao: new Date().toISOString() };
        await escreverGist(ENSINO_FILE, JSON.stringify(ensino));
        return res.status(200).json({ ok: true });
      }
      return res.status(405).json({ erro: "Método não suportado" });
    } catch (e) {
      return res.status(500).json({ erro: String(e.message || e) });
    }
  }

  // --- Endpoint público ---
  if (req.method !== "GET") { res.status(405).json({ erro: "Método não suportado" }); return; }

  try {
    const raw = await lerGist(DADOS_FILE);
    if (!raw || raw === "{}") return res.status(200).json({ ok: true, escolas: [] });
    const dados = JSON.parse(raw);
    const nodes = dados.nodes || [];
    const links = dados.links || [];

    const filtroEscola = req.query?.escola || null;
    const filtroId = req.query?.id || null;

    if (filtroId) {
      const node = nodes.find(n => n.id === filtroId);
      if (!node) return res.status(404).json({ erro: "Cadeira não encontrada" });
      return res.status(200).json({ ok: true, cadeira: formatarCadeira(node) });
    }

    const linkMap = {};
    links.forEach(l => { const src = l.source?.id || l.source; const tgt = l.target?.id || l.target; linkMap[src] = tgt; });

    const escolasIds = filtroEscola ? [filtroEscola] : ESCOLA_IDS;
    const escolas = escolasIds.map(escolaId => {
      const escolaNode = nodes.find(n => n.id === escolaId);
      const nomeEscola = escolaNode?.label || ESCOLA_NOMES[escolaId] || escolaId;
      const cadeiras = nodes
        .filter(n => n.silo === "aulas" && n.type === "leaf" && !ESCOLA_IDS.includes(n.id) && linkMap[n.id] === escolaId)
        .map(formatarCadeira);
      return { id: escolaId, nome: nomeEscola, url: escolaNode?.content || null, cadeiras };
    }).filter(e => e.cadeiras.length > 0 || !filtroEscola);

    res.status(200).json({ ok: true, total_cadeiras: escolas.reduce((s, e) => s + e.cadeiras.length, 0), escolas, ultima_actualizacao: dados.ultima_sincronizacao || null });
  } catch (e) {
    res.status(500).json({ erro: String(e.message || e) });
  }
}

function formatarCadeira(node) {
  return { id: node.id, nome: node.label, conteudo: node.content || "", tags: node.tags?.cat || [], progresso: node.progresso || null, publicado: node.publicado || false, ultima_edicao: node.ultima_edicao || null };
}
