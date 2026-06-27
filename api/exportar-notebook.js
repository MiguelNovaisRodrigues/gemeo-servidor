// Exportação de nós do Gémeo para o NotebookLM.
// Devolve um ficheiro .txt com os nós de um silo (ou todos), formatado para
// ser carregado como "fonte de texto" no NotebookLM.
//
// GET /api/exportar-notebook                → todos os silos, nós publicados
// GET /api/exportar-notebook?silo=escrita   → só esse silo
// GET /api/exportar-notebook?todos=1        → todos os nós (publicados e não publicados)
// GET /api/exportar-notebook?leituras=1     → inclui leituras com anotações
// GET /api/exportar-notebook?formato=json   → devolve JSON em vez de texto

import { lerGist } from "./_gist.js";

const DADOS_FILE  = "gemeo-dados.json";
const ENSINO_FILE = "gemeo-ensino.json";

const SILO_LABEL = {
  escrita:        "ESCRITA & INVESTIGAÇÃO",
  aulas:          "ENSINO",
  cst:            "TRABALHO ARTÍSTICO",
  produtos:       "PROJETOS & PRODUTOS",
  administrativo: "ADMINISTRATIVO",
};

function formatarNo(n) {
  const linhas = [];
  linhas.push(`## ${n.label}`);
  if (n.autores?.length) linhas.push(`Autores: ${n.autores.join(", ")}`);
  if (n.ano)            linhas.push(`Ano: ${n.ano}`);
  if (n.revista)        linhas.push(`Revista/Fonte: ${n.revista}`);
  if (n.doi)            linhas.push(`DOI: ${n.doi}`);
  if (n.url)            linhas.push(`URL: ${n.url}`);
  if (n.prazo)          linhas.push(`Prazo: ${n.prazo}`);
  if (n.progresso)      linhas.push(`Progresso: ${n.progresso}%`);

  if (n.content) {
    const texto = n.content.replace(/<[^>]+>/g, " ").replace(/\s{2,}/g, " ").trim();
    if (texto) linhas.push(`\n${texto}`);
  }

  // Anotações cross-silo
  if (n.anotacoes?.length) {
    linhas.push("\nANOTAÇÕES:");
    for (const a of n.anotacoes) {
      linhas.push(`  [${(SILO_LABEL[a.silo] || a.silo)} · ${a.data}] ${a.texto}`);
    }
  }

  return linhas.join("\n");
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") { res.status(200).end(); return; }
  if (req.method !== "GET") { res.status(405).json({ erro: "Método não suportado" }); return; }

  try {
    const filtroSilo = req.query?.silo || null;
    const todos      = req.query?.todos === "1";
    const incLeit    = req.query?.leituras === "1";
    const formato    = req.query?.formato || "txt";

    const raw = await lerGist(DADOS_FILE);
    const dados = raw && raw !== "{}" ? JSON.parse(raw) : { nodes: [] };
    const nodes = (dados.nodes || []).filter(n => n.type === "leaf");

    // Filtrar
    let nos = todos
      ? nodes
      : nodes.filter(n => n.publicado === true);

    if (filtroSilo) {
      nos = nos.filter(n => n.silo === filtroSilo);
    }

    // Excluir administrativo por defeito, salvo pedido explícito
    if (!filtroSilo) {
      nos = nos.filter(n => n.silo !== "administrativo");
    }

    // Separar leituras e outros
    const leituras = incLeit ? nos.filter(n => (n.tags?.cat || []).includes("leitura")) : [];
    const outros   = nos.filter(n => !(n.tags?.cat || []).includes("leitura"));

    if (formato === "json") {
      return res.status(200).json({ ok: true, total: nos.length, nos });
    }

    // Formato texto para NotebookLM
    const silos = {};
    for (const n of outros) {
      if (!silos[n.silo]) silos[n.silo] = [];
      silos[n.silo].push(n);
    }

    const secoes = [];

    // Cabeçalho de contexto
    secoes.push(`GÉMEO DIGITAL — MIGUEL RODRIGUES
Exportação gerada em: ${new Date().toISOString().slice(0,10)}
Fotógrafo e doutorando na FBAUL (Lisboa). Investigação em fotografia artística, imagens interiores, corpo, CST (Corpo Sujeito Território), teoria da imagem, Flusser, visualidade contemporânea.

Este documento representa o estado atual do trabalho de investigação, ensino e prática artística.
${"─".repeat(60)}`);

    // Nós por silo
    for (const [silo, lista] of Object.entries(silos)) {
      if (!lista.length) continue;
      secoes.push(`\n${"═".repeat(60)}\n${SILO_LABEL[silo] || silo.toUpperCase()}\n${"═".repeat(60)}`);
      for (const n of lista) {
        secoes.push("\n" + formatarNo(n));
        secoes.push("─".repeat(40));
      }
    }

    // Leituras (se pedidas)
    if (leituras.length) {
      // Deduplicar por leitura_id (mostrar cada leitura uma vez com todos os silos)
      const vistas = new Set();
      const leiturasUnicas = [];
      for (const n of leituras) {
        const chave = n.leitura_id || n.id;
        if (!vistas.has(chave)) {
          vistas.add(chave);
          // Juntar anotações de todos os irmãos
          if (n.leitura_id) {
            const irmaos = nodes.filter(x => x.leitura_id === n.leitura_id);
            const todasAnotacoes = [];
            const aVistas = new Set();
            for (const irmao of irmaos) {
              for (const a of (irmao.anotacoes || [])) {
                const ck = `${a.silo}|${a.texto}`;
                if (!aVistas.has(ck)) { aVistas.add(ck); todasAnotacoes.push(a); }
              }
            }
            leiturasUnicas.push({ ...n, anotacoes: todasAnotacoes });
          } else {
            leiturasUnicas.push(n);
          }
        }
      }

      secoes.push(`\n${"═".repeat(60)}\nLEITURAS & REFERÊNCIAS BIBLIOGRÁFICAS\n${"═".repeat(60)}`);
      for (const n of leiturasUnicas) {
        secoes.push("\n" + formatarNo(n));
        secoes.push("─".repeat(40));
      }
    }

    const texto = secoes.join("\n");
    const nomeFile = filtroSilo
      ? `gemeo-${filtroSilo}-${new Date().toISOString().slice(0,10)}.txt`
      : `gemeo-${new Date().toISOString().slice(0,10)}.txt`;

    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${nomeFile}"`);
    res.status(200).send(texto);

  } catch (e) {
    res.status(500).json({ erro: String(e.message || e) });
  }
}
