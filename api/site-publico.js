// Endpoint público para o site pessoal de Miguel Rodrigues.
// Devolve nós marcados como publicado:true, agrupados por silo,
// mais a estrutura de ensino do /api/ensino.
// GET /api/site-publico        → tudo
// GET /api/site-publico?silo=escrita → só um silo

import { lerGist } from "./_gist.js";

const DADOS_FILE  = "gemeo-dados.json";
const ENSINO_FILE = "gemeo-ensino.json";

const SILO_META = {
  escrita:        { label_pt: "Escrita & Investigação", label_en: "Writing & Research" },
  aulas:          { label_pt: "Ensino",                 label_en: "Teaching" },
  cst:            { label_pt: "Trabalho Artístico",      label_en: "Artistic Work" },
  produtos:       { label_pt: "Projetos & Produtos",    label_en: "Projects & Products" },
  administrativo: { label_pt: "Institucional",          label_en: "Institutional" },
};

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.status(200).end(); return; }
  if (req.method !== "GET") { res.status(405).json({ erro: "Método não suportado" }); return; }

  try {
    const filtroSilo = req.query?.silo || null;

    const raw = await lerGist(DADOS_FILE);
    const dados = raw && raw !== "{}" ? JSON.parse(raw) : { nodes: [], links: [] };
    const nodes = dados.nodes || [];

    // Filtrar nós publicados (excluir centros e tipos especiais)
    const publicados = nodes.filter(n =>
      n.publicado === true &&
      n.type === "leaf" &&
      n.silo !== "administrativo"
    );

    // Agrupar por silo
    const silos = {};
    const silosAtivos = filtroSilo ? [filtroSilo] : Object.keys(SILO_META).filter(s => s !== "administrativo");

    for (const siloId of silosAtivos) {
      const meta = SILO_META[siloId] || {};
      const itens = publicados
        .filter(n => n.silo === siloId)
        .map(n => ({
          id: n.id,
          label: n.label,
          content: n.content || "",
          tags: n.tags || {},
          progresso: n.progresso || null,
          prazo: n.prazo || null,
        }));
      silos[siloId] = { ...meta, itens };
    }

    // Ensino: puxar de ensino.json para enriquecer os nós de aulas
    if (!filtroSilo || filtroSilo === "aulas") {
      try {
        const ensinoRaw = await lerGist(ENSINO_FILE);
        const ensinoData = ensinoRaw && ensinoRaw !== "{}" ? JSON.parse(ensinoRaw) : {};

        // Enriquecer cada item de aulas com dados de ensino
        if (silos.aulas) {
          silos.aulas.itens = silos.aulas.itens.map(item => {
            const extra = ensinoData[item.id];
            if (!extra) return item;
            return {
              ...item,
              fuc_url: extra.fuc_url || null,
              fuc_abordagem: extra.fuc_abordagem || "",
              fuc_programa: extra.fuc_programa || "",
              biblio: extra.biblio || [],
            };
          });
        }
      } catch {}
    }

    res.status(200).json({
      ok: true,
      total: publicados.length,
      silos,
      ultima_actualizacao: dados.ultima_sincronizacao || null,
    });
  } catch (e) {
    res.status(500).json({ erro: String(e.message || e) });
  }
}
