// Utilitário partilhado: lê e escreve ficheiros num GitHub Gist privado.
// Só precisa de GITHUB_TOKEN nas variáveis de ambiente do Vercel.

const GIST_DESCRIPTION = "Gémeo Digital - dados privados";

// Encontra (ou cria) o Gist do Gémeo e devolve o seu ID.
async function getGistId(token) {
  const resp = await fetch("https://api.github.com/gists?per_page=100", {
    headers: {
      Authorization: `token ${token}`,
      Accept: "application/vnd.github+json",
    },
  });
  const gists = await resp.json();
  if (!Array.isArray(gists)) {
    throw new Error("GitHub API erro: " + JSON.stringify(gists));
  }
  const found = gists.find((g) => g.description === GIST_DESCRIPTION);
  if (found) return found.id;

  // Criar novo Gist na primeira vez
  const create = await fetch("https://api.github.com/gists", {
    method: "POST",
    headers: {
      Authorization: `token ${token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      description: GIST_DESCRIPTION,
      public: false,
      files: {
        "gemeo-dados.json": { content: "{}" },
        "gemeo-sondas.json": { content: "[]" },
        "gemeo-rejeicoes.json": { content: JSON.stringify({ rejeicoes: [] }) },
      },
    }),
  });
  const newGist = await create.json();
  if (!newGist.id) throw new Error("Erro ao criar Gist: " + JSON.stringify(newGist));
  return newGist.id;
}

export async function lerGist(nomeFicheiro) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error("GITHUB_TOKEN não configurado");
  const gistId = await getGistId(token);

  const resp = await fetch(`https://api.github.com/gists/${gistId}`, {
    headers: {
      Authorization: `token ${token}`,
      Accept: "application/vnd.github+json",
    },
  });
  const gist = await resp.json();
  const file = gist.files && gist.files[nomeFicheiro];
  if (!file) return null;
  // Se o conteúdo for truncado, buscar via raw_url
  if (file.truncated) {
    const raw = await fetch(file.raw_url);
    return await raw.text();
  }
  return file.content;
}

export async function escreverGist(nomeFicheiro, conteudo) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error("GITHUB_TOKEN não configurado");
  const gistId = await getGistId(token);

  const resp = await fetch(`https://api.github.com/gists/${gistId}`, {
    method: "PATCH",
    headers: {
      Authorization: `token ${token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      files: {
        [nomeFicheiro]: {
          content: typeof conteudo === "string" ? conteudo : JSON.stringify(conteudo),
        },
      },
    }),
  });
  const data = await resp.json();
  if (data.message) throw new Error("Erro ao escrever Gist: " + data.message);
  return data;
}
