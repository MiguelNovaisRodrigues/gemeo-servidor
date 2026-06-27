// Anotações sincronizadas por leitura_id.
// Uma leitura pode existir em múltiplos silos como nós distintos com o mesmo leitura_id.
// Uma anotação feita em qualquer silo aparece em todos, marcada com a cor do silo de origem.
//
// POST { leitura_id, texto, silo }  → adiciona anotação a todos os nós com esse leitura_id
// GET  ?leitura_id=xxx              → devolve todas as anotações desse leitura_id

import { lerGist, escreverGist } from "./_gist.js";

const DADOS_FILE = "gemeo-dados.json";

const COR_SILO = {
  escrita:        "#111111",
  aulas:          "#777777",
  cst:            "#9e2a2b",
  produtos:       "#5a6b5d",
  administrativo: "#6b5b95",
};

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.status(200).end(); return; }

  try {
    const raw = await lerGist(DADOS_FILE);
    const dados = raw && raw !== "{}" ? JSON.parse(raw) : { nodes: [], links: [] };
    const nodes = dados.nodes || [];

    // GET: devolver todas as anotações do leitura_id
    if (req.method === "GET") {
      const lid = req.query?.leitura_id;
      if (!lid) return res.status(400).json({ erro: "Falta leitura_id" });

      const nodosAssoc = nodes.filter(n => n.leitura_id === lid);
      // Recolher todas as anotações de todos os nós (sem duplicar por texto+data)
      const vistas = new Set();
      const anotacoes = [];
      for (const n of nodosAssoc) {
        for (const a of (n.anotacoes || [])) {
          const chave = `${a.silo}|${a.texto}|${a.data}`;
          if (!vistas.has(chave)) {
            vistas.add(chave);
            anotacoes.push(a);
          }
        }
      }
      anotacoes.sort((a, b) => (a.data || "").localeCompare(b.data || ""));

      return res.status(200).json({
        ok: true,
        leitura_id: lid,
        silos: nodosAssoc.map(n => n.silo),
        anotacoes,
      });
    }

    // POST: adicionar anotação
    if (req.method === "POST") {
      const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
      const { leitura_id, texto, silo } = body || {};

      if (!leitura_id || !texto || !silo) {
        return res.status(400).json({ erro: "Falta leitura_id, texto ou silo" });
      }

      const nodosAssoc = nodes.filter(n => n.leitura_id === leitura_id);
      if (nodosAssoc.length === 0) {
        return res.status(404).json({ erro: "Nenhum nó com esse leitura_id" });
      }

      const anotacao = {
        silo,
        cor: COR_SILO[silo] || "#999",
        texto: texto.trim(),
        data: new Date().toISOString().slice(0, 10),
      };

      // Adicionar a todos os nós com esse leitura_id
      for (const n of nodosAssoc) {
        if (!Array.isArray(n.anotacoes)) n.anotacoes = [];
        n.anotacoes.push(anotacao);
      }

      await escreverGist(DADOS_FILE, JSON.stringify(dados));

      return res.status(200).json({
        ok: true,
        anotacao,
        silos_sincronizados: nodosAssoc.map(n => n.silo),
      });
    }

    res.status(405).json({ erro: "Método não suportado" });
  } catch (e) {
    res.status(500).json({ erro: String(e.message || e) });
  }
}
