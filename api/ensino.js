// Endpoint público de Ensino — expõe o conteúdo das cadeiras para o site.
// GET /api/ensino          → todas as escolas + cadeiras com conteúdo
// GET /api/ensino?escola=n_ipt   → só uma escola
// GET /api/ensino?id=c_hf1      → só uma cadeira

import { lerGist } from "./_gist.js";

const DADOS_FILE = "gemeo-dados.json";

// IDs das escolas (nós pai de cadeiras)
const ESCOLA_IDS = ["n_atelier", "n_iade", "n_ipt"];

// Nomes canónicos das escolas (fallback se não estiver no Gist)
const ESCOLA_NOMES = {
  n_atelier: "Atelier de Lisboa",
  n_iade: "IADE",
  n_ipt: "IPT",
};

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.status(200).end(); return; }
  if (req.method !== "GET") { res.status(405).json({ erro: "Método não suportado" }); return; }

  try {
    const raw = await lerGist(DADOS_FILE);
    if (!raw || raw === "{}") {
      return res.status(200).json({ ok: true, escolas: [] });
    }
    const dados = JSON.parse(raw);
    const nodes = dados.nodes || [];
    const links = dados.links || [];

    // Filtro por query params
    const filtroEscola = req.query?.escola || null;
    const filtroId = req.query?.id || null;

    // Se pediu uma cadeira específica
    if (filtroId) {
      const node = nodes.find(n => n.id === filtroId);
      if (!node) return res.status(404).json({ erro: "Cadeira não encontrada" });
      return res.status(200).json({ ok: true, cadeira: formatarCadeira(node) });
    }

    // Mapear links: filho → pai
    const linkMap = {};
    links.forEach(l => {
      const src = l.source?.id || l.source;
      const tgt = l.target?.id || l.target;
      linkMap[src] = tgt;
    });

    // Construir hierarquia: escola → cadeiras
    const escolasIds = filtroEscola
      ? [filtroEscola]
      : ESCOLA_IDS;

    const escolas = escolasIds.map(escolaId => {
      const escolaNode = nodes.find(n => n.id === escolaId);
      const nomeEscola = escolaNode?.label || ESCOLA_NOMES[escolaId] || escolaId;

      // Encontrar cadeiras ligadas a esta escola
      const cadeiras = nodes
        .filter(n =>
          n.silo === "aulas" &&
          n.type === "leaf" &&
          !ESCOLA_IDS.includes(n.id) &&
          linkMap[n.id] === escolaId
        )
        .map(formatarCadeira);

      return {
        id: escolaId,
        nome: nomeEscola,
        url: escolaNode?.content || null,
        cadeiras,
      };
    }).filter(e => e.cadeiras.length > 0 || !filtroEscola);

    res.status(200).json({
      ok: true,
      total_cadeiras: escolas.reduce((s, e) => s + e.cadeiras.length, 0),
      escolas,
      ultima_actualizacao: dados.ultima_sincronizacao || null,
    });
  } catch (e) {
    res.status(500).json({ erro: String(e.message || e) });
  }
}

function formatarCadeira(node) {
  return {
    id: node.id,
    nome: node.label,
    conteudo: node.content || "",
    tags: node.tags?.cat || [],
    progresso: node.progresso || null,
    publicado: node.publicado || false,
    ultima_edicao: node.ultima_edicao || null,
  };
}
