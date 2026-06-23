// Endpoint de Sondas (Chamadas de Artigos) do Gémeo Digital
// Lê e escreve gemeo-sondas.json no Drive do Miguel.
// Segue exatamente o mesmo padrão que dados.js.

const NOME_FICHEIRO = "gemeo-sondas.json";

async function getAccessToken() {
  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
      grant_type: "refresh_token",
    }),
  });
  const data = await resp.json();
  if (!data.access_token) {
    throw new Error("Falha ao obter access token: " + JSON.stringify(data));
  }
  return data.access_token;
}

async function encontrarFicheiro(token) {
  const q = encodeURIComponent(`name='${NOME_FICHEIRO}' and trashed=false`);
  const resp = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${q}&spaces=drive&fields=files(id,name)`,
    { headers: { Authorization: "Bearer " + token } }
  );
  const data = await resp.json();
  return data.files && data.files.length > 0 ? data.files[0].id : null;
}

async function lerFicheiro(token, fileId) {
  const resp = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
    { headers: { Authorization: "Bearer " + token } }
  );
  return await resp.text();
}

async function criarFicheiro(token, conteudo) {
  const boundary = "-------gemeo" + Date.now();
  const metadata = { name: NOME_FICHEIRO, mimeType: "application/json" };
  const corpo =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
    JSON.stringify(metadata) +
    `\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n` +
    conteudo +
    `\r\n--${boundary}--`;
  const resp = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart",
    {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body: corpo,
    }
  );
  return await resp.json();
}

async function atualizarFicheiro(token, fileId, conteudo) {
  const resp = await fetch(
    `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`,
    {
      method: "PATCH",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
      },
      body: conteudo,
    }
  );
  return await resp.json();
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.status(200).end(); return; }

  try {
    const token = await getAccessToken();

    if (req.method === "GET") {
      const fileId = await encontrarFicheiro(token);
      if (!fileId) { res.status(200).json({ existe: false, dados: null }); return; }
      const conteudo = await lerFicheiro(token, fileId);
      res.status(200).json({ existe: true, dados: JSON.parse(conteudo) });
      return;
    }

    if (req.method === "POST") {
      const conteudo = typeof req.body === "string" ? req.body : JSON.stringify(req.body);
      const fileId = await encontrarFicheiro(token);
      if (fileId) {
        await atualizarFicheiro(token, fileId, conteudo);
      } else {
        await criarFicheiro(token, conteudo);
      }
      res.status(200).json({ ok: true });
      return;
    }

    res.status(405).json({ erro: "Método não suportado" });
  } catch (e) {
    res.status(500).json({ erro: String(e.message || e) });
  }
}
