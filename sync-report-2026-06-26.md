# Relatório Sincronização Gémeo Digital — 26 jun 2026

## Nodes adicionados
**Nenhum** — todos os itens relevantes já existiam no Gémeo ou classificam como sondas.

## Sondas adicionadas
**1 sonda** (POST ao /api/sincronizar falhou por restrição de rede do sandbox — payload abaixo para envio manual):

### Dossiê Rhinocervs – Artes, Ciências e Tecnologias
- **Revista:** Revista Rhinocervs, Vol. 3, nº 2
- **Prazo:** 15 de Julho de 2026 ⚠️ URGENTE (faltam 19 dias)
- **Editores:** António de Sousa Dias, Fernando Rosa Dias (FBAUL/CIEBA)
- **Áreas:** investigação artística, artes, ciências, tecnologias, interdisciplinar
- **Info:** https://journals.ipl.pt/rhinocervs/announcement/view/15
- **Descrição:** Chamada para dossiê "Artes, Ciências e Tecnologias: intersecções na investigação artística". Publicação prevista: dezembro 2026. Recebido via lista HIPE (CIEBA) em 25 jun.

### Payload JSON para envio manual:
```json
{
  "fonte": "calendar+gmail+iade",
  "nodes": [],
  "sondas": [
    {
      "titulo": "Dossiê Rhinocervs – Artes, Ciências e Tecnologias",
      "revista": "Revista Rhinocervs, Vol. 3, nº 2",
      "prazo": "2026-07-15",
      "areas": ["investigação artística", "artes", "ciências", "tecnologias", "interdisciplinar"],
      "descricao": "Chamada de trabalhos para dossiê temático Artes, Ciências e Tecnologias: intersecções na investigação artística. Editores: António de Sousa Dias, Fernando Rosa Dias. Publicação prevista: 15 dezembro 2026. Info: https://journals.ipl.pt/rhinocervs/announcement/view/15"
    }
  ]
}
```

## Ignorado e porquê
- **Noite Europeia dos Investigadores 2026** — já existe no Gémeo (sync_1782324298697_9mnh)
- **Unite! Widening – candidaturas ULisboa** — já existe no Gémeo (sync_1782324298697_n6fp)
- **CADERNO - MARIANA** (calendar, 4 jul) — evento pessoal irrelevante para o trabalho
- **Outlook IADE** — conector mcp__ce0c9cda indisponível nesta sessão

## Urgências imediatas
⚠️ **Rhinocervs prazo 15 julho** — CFP directamente relevante para a linha de investigação (cruzamento artes/tecnologia/imagem técnica). Intersecta com o Abstract EJMAP e Imagens Interiores. Considerar submissão.
⚠️ **Raccont'Arti submissão incompleta** (já no Gémeo) — verificar estado no Picter.
⚠️ **NEI'26 candidatura** (já no Gémeo) — prazo 10 julho, faltam 14 dias.
