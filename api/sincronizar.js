// Endpoint de sincronização — recebe nodes e sondas propostos pelo Cowork
// e faz merge inteligente com o estado actual do Gémeo, sem apagar nada.
// POST { nodes: [...], sondas: [...], fonte: "calendar|gmail|manual" }

import { lerGist, escreverGist } from "./_gist.js";

const DADOS_FILE   = "gemeo-dados.json";
const SONDAS_FILE  = "gemeo-sondas.json";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.status(200).end(); return; }
  if (req.method !== "POST") { res.status(405).json({ erro: "Método não suportado" }); return; }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const { nodes: novosNodes = [], sondas: novasSondas = [], fonte = "sync" } = body;

    // ── Merge nodes ────────────────────────────────────────────────────
    const dadosRaw = await lerGist(DADOS_FILE);
    const dados = dadosRaw && dadosRaw !== "{}" ? JSON.parse(dadosRaw) : { nodes: [], links: [] };
    if (!dados.nodes) dados.nodes = [];
    if (!dados.links) dados.links = [];

    const labelsExist = new Set(dados.nodes.map(n => n.label?.toLowerCase().trim()));
    const nodesAdicionados = [];

    for (const n of novosNodes) {
      const lbl = n.label?.toLowerCase().trim();
      if (!lbl || labelsExist.has(lbl)) continue;

      const id = "sync_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6);
      const node = {
        id,
        type: "leaf",
        silo: n.silo || "administrativo",
        label: n.label,
        origin: "sync",
        origem_sync: fonte,
        tags: { cat: n.tags || [], kw: [], free: [] },
        content: n.descricao || "",
      };
      if (n.prazo) node.prazo = n.prazo;

      dados.nodes.push(node);
      labelsExist.add(lbl);
      nodesAdicionados.push(n.label);

      // Liga ao centro do silo
      const siloCenter = "n_" + (node.silo === "administrativo" ? "administrativo" :
        node.silo === "aulas" ? "aulas" :
        node.silo === "cst" ? "cst" :
        node.silo === "produtos" ? "prod" : "escrita");
      if (dados.nodes.find(x => x.id === siloCenter)) {
        dados.links.push({ source: id, target: siloCenter, provenance: "sync" });
      }
    }

    dados.ultima_sincronizacao = new Date().toISOString();
    dados.ultima_sincronizacao_fonte = fonte;

    await escreverGist(DADOS_FILE, JSON.stringify(dados));

    // ── Merge sondas ───────────────────────────────────────────────────
    const sondasAdicionadas = [];
    if (novasSondas.length > 0) {
      const sondasRaw = await lerGist(SONDAS_FILE);
      const sondas = sondasRaw && sondasRaw !== "[]" ? JSON.parse(sondasRaw) : [];
      const titulosExist = new Set(sondas.map(s => s.titulo?.toLowerCase().trim()));

      for (const s of novasSondas) {
        const titulo = s.titulo?.toLowerCase().trim();
        if (!titulo || titulosExist.has(titulo)) continue;
        sondas.push({
          id: "sync_s_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
          titulo: s.titulo,
          revista: s.revista || "",
          prazo: s.prazo || "",
          areas: s.areas || [],
          descricao: s.descricao || "",
          status: "ativa",
          origem_sync: fonte,
        });
        sondasAdicionadas.push(s.titulo);
        titulosExist.add(titulo);
      }
      await escreverGist(SONDAS_FILE, JSON.stringify(sondas));
    }

    res.status(200).json({
      ok: true,
      nodes_adicionados: nodesAdicionados.length,
      sondas_adicionadas: sondasAdicionadas.length,
      detalhes: { nodes: nodesAdicionados, sondas: sondasAdicionadas },
      timestamp: dados.ultima_sincronizacao,
    });
  } catch (e) {
    res.status(500).json({ erro: String(e.message || e) });
  }
}
