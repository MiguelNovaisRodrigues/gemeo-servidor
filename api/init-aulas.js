// Endpoint temporário — configura nós de escolas e cadeiras no silo Aulas.
// Chamar UMA vez via GET no browser. Pode ser apagado depois.

import { lerGist, escreverGist } from "./_gist.js";

const DADOS_FILE = "gemeo-dados.json";

const ESCOLAS = [
  {
    id: "n_atelier",
    label: "Atelier de Lisboa",
    url: "https://atelierdelisboa.pt/",
    cadeiras: [
      {
        id: "c_pcl",
        label: "Projeto e Construção de Livro",
        content: "Curso no Atelier de Lisboa sobre conceção, design e produção de livros fotográficos de autor.\n\nAtelier de Lisboa: https://atelierdelisboa.pt/",
      },
    ],
  },
  {
    id: "n_iade",
    label: "IADE",
    url: "https://www.iade.pt/",
    cadeiras: [
      {
        id: "c_ha",
        label: "História das Artes",
        content: "Unidade curricular de História das Artes no IADE.\n\nPortal estudante IADE: https://portalestudante.iade.pt/",
      },
      {
        id: "c_smcv",
        label: "Sociedades Modernas e Cultura Visual",
        content: "UC de mestrado no IADE. Cultura visual, modernidade e sociedade.\n\nPortal estudante IADE: https://portalestudante.iade.pt/",
      },
      {
        id: "c_ft",
        label: "Fotografia e Tendências",
        content: "Unidade curricular de Fotografia e Tendências no IADE.\n\nPortal estudante IADE: https://portalestudante.iade.pt/",
      },
      {
        id: "c_lra",
        label: "Laboratório de Representação Avançada",
        content: "UC prática de laboratório fotográfico avançado no IADE.\n\nPortal estudante IADE: https://portalestudante.iade.pt/",
      },
    ],
  },
  {
    id: "n_ipt",
    label: "IPT",
    url: "https://portal2.ipt.pt/pt/cursos/licenciaturas/l_-_foto/",
    cadeiras: [
      {
        id: "c_aci",
        label: "Antropologia Cultural e da Imagem",
        content: "Conceitos e métodos de antropologia cultural. Antropologia Visual: Curtis, Flaherty, Margaret Mead, Gregory Bateson, Jean Rouche. Relação entre Visual Anthropology e prática artística.\n\nFUC: https://portal2.ipt.pt/pt/Cursos/tmr/l_-_foto/4-964566/",
      },
      {
        id: "c_sc",
        label: "Sociologia da Comunicação",
        content: "Sociologia da comunicação aplicada ao contexto da fotografia e das artes visuais. 4 ECTS.\n\nCurso Fotografia IPT: https://portal2.ipt.pt/pt/cursos/licenciaturas/l_-_foto/",
      },
      {
        id: "c_pf1",
        label: "Projeto Fotográfico I",
        content: "Ferramentas para conceber, planear, produzir e realizar um projeto fotográfico. Do conceito à concretização, com relatório escrito de suporte.\n\nFUC: https://portal2.ipt.pt/pt/Cursos/hadcpaa/l_-_foto/4-964550/",
      },
      {
        id: "c_ipir",
        label: "A Imagem Pensada e a Imagem Representada",
        content: "Perspetiva crítica sobre o sujeito e a sua representação. Articulação entre arte e filosofia na noção de sujeito. Relações entre fotografia, pensamento crítico e história da arte.\n\nFUC: https://portal2.ipt.pt/pt/Cursos/tmr/l_-_foto/964580/",
      },
      {
        id: "c_hf1",
        label: "História da Fotografia I",
        content: "Das origens da fotografia como processo técnico de reprodução da realidade aos primeiros autores. Invenção e inventores. O público moderno e a fotografia.\n\nFUC: https://portal2.ipt.pt/pt/cursos/licenciaturas/l_-_foto/964528/",
      },
    ],
  },
];

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method !== "GET") { res.status(405).end(); return; }

  try {
    const raw = await lerGist(DADOS_FILE);
    const dados = raw && raw !== "{}" ? JSON.parse(raw) : { nodes: [], links: [] };
    if (!dados.nodes) dados.nodes = [];
    if (!dados.links) dados.links = [];

    const idsExistentes = new Set(dados.nodes.map(n => n.id));
    const adicionados = [];

    for (const escola of ESCOLAS) {
      if (!idsExistentes.has(escola.id)) {
        dados.nodes.push({
          id: escola.id, type: "leaf", silo: "aulas",
          label: escola.label, origin: "manuscrito",
          tags: { cat: ["escola"], kw: [], free: [] },
          content: escola.url || "",
        });
        dados.links.push({ source: escola.id, target: "n_aulas", provenance: "structural" });
        idsExistentes.add(escola.id);
        adicionados.push(escola.label);
      }

      for (const c of escola.cadeiras) {
        if (!idsExistentes.has(c.id)) {
          dados.nodes.push({
            id: c.id, type: "leaf", silo: "aulas",
            label: c.label, origin: "manuscrito",
            tags: { cat: ["cadeira"], kw: [], free: [] },
            content: c.content || "",
          });
          dados.links.push({ source: c.id, target: escola.id, provenance: "structural" });
          idsExistentes.add(c.id);
          adicionados.push("  └ " + c.label);
        }
      }
    }

    await escreverGist(DADOS_FILE, JSON.stringify(dados));

    const html = `<!DOCTYPE html><html lang="pt"><head><meta charset="UTF-8">
<title>Aulas inicializadas</title>
<style>body{font-family:-apple-system,sans-serif;max-width:520px;margin:60px auto;padding:0 24px;color:#111;background:#fafafa}
h2{font-size:16px;font-weight:700;margin-bottom:12px}
ul{font-size:13px;line-height:2;padding-left:18px;color:#333}
a{color:#111;font-weight:600;font-size:13px}
.note{background:#f5f5f7;border-left:3px solid #111;padding:10px 14px;font-size:12px;color:#555;margin-top:20px;line-height:1.6}</style></head><body>
<h2>✓ Nós de Aulas criados (${adicionados.length})</h2>
<ul>${adicionados.map(l => `<li>${l}</li>`).join('')}</ul>
<div class="note">As FUCs do IPT estão ligadas no conteúdo de cada nó.<br>
As FUCs do IADE estão no portal de estudante (login necessário).<br>
Podes apagar o ficheiro <code>api/init-aulas.js</code> após confirmar.</div>
<p style="margin-top:20px"><a href="https://gemeo-servidor.vercel.app">← Abrir Gémeo</a></p>
</body></html>`;

    res.setHeader("Content-Type", "text/html");
    res.status(200).send(html);
  } catch (e) {
    res.status(500).send("Erro: " + String(e.message || e));
  }
}
