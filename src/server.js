require('dotenv').config();
const express = require('express');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const app = express();
const PORT = 3000;
const ADMIN_PASSWORD = 'vovo70anos'; // <-- troque essa senha como quiser

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- Helpers ---

// Converte um Gift do Prisma (com suas contribuições) para o formato que o front-end espera
function formatarPresente(gift, nomeAtual) {
  const contributions = gift.contributions || [];

  const totalArrecadado = contributions.reduce(
    (soma, c) => soma + Number(c.amount),
    0
  );

  // Filtra só as contribuições da pessoa que está vendo a página agora
  const minhasContribuicoes = nomeAtual
    ? contributions.filter(
        (c) => c.contributorName.toLowerCase() === nomeAtual.toLowerCase()
      )
    : [];

  return {
    id: String(gift.id),
    nome: gift.name,
    descricao: gift.description,
    categoria: gift.category,
    imagem: gift.image || '',
    linkLoja: gift.storeLink || '',
    valorSugerido: gift.suggestedValue ? Number(gift.suggestedValue) : null,
    totalArrecadado,
    totalContribuicoes: contributions.length,
    minhasContribuicoes: minhasContribuicoes.length,
    minhasContribuicoesValor: minhasContribuicoes.reduce(
      (soma, c) => soma + Number(c.amount),
      0
    ),
  };
}

async function buscarDadosCompletos(nomeAtual) {
  const party = await prisma.party.findFirst();
  const gifts = await prisma.gift.findMany({
    include: { contributions: true },
    orderBy: { id: 'asc' },
  });

  return {
    festa: party
      ? {
          nomeAniversariante: party.honoreeName,
          idade: party.age,
          dataFesta: party.partyDate.toISOString().split('T')[0],
          mensagem: party.message || '',
        }
      : null,
    presentes: gifts.map((g) => formatarPresente(g, nomeAtual)),
  };
}

// --- Rotas públicas ---

app.get('/api/presentes', async (req, res) => {
  try {
    const nomeAtual = req.query.nome ? String(req.query.nome) : null;
    const dados = await buscarDadosCompletos(nomeAtual);
    res.json(dados);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Não foi possível carregar os presentes.' });
  }
});

// Registrar uma nova contribuição (Pix) — não bloqueia o presente, pode repetir
app.post('/api/presentes/:id/contribuir', async (req, res) => {
  const { id } = req.params;
  const { nome, valor } = req.body;

  if (!nome || !nome.trim()) {
    return res.status(400).json({ erro: 'Informe seu nome para contribuir.' });
  }

  const valorNumerico = Number(valor);
  if (!valor || Number.isNaN(valorNumerico) || valorNumerico <= 0) {
    return res.status(400).json({ erro: 'Informe um valor de contribuição válido.' });
  }

  try {
    const gift = await prisma.gift.findUnique({ where: { id: Number(id) } });

    if (!gift) {
      return res.status(404).json({ erro: 'Presente não encontrado.' });
    }

    const contribuicao = await prisma.contribution.create({
      data: {
        giftId: Number(id),
        contributorName: nome.trim(),
        amount: valorNumerico,
      },
    });

    const giftAtualizado = await prisma.gift.findUnique({
      where: { id: Number(id) },
      include: { contributions: true },
    });

    res.json({
      sucesso: true,
      contribuicao: {
        id: contribuicao.id,
        valor: Number(contribuicao.amount),
        data: contribuicao.createdAt.toISOString(),
      },
      presente: formatarPresente(giftAtualizado, nome.trim()),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Não foi possível registrar a contribuição.' });
  }
});

app.get('/api/presentes/:id/minhas-contribuicoes', async (req, res) => {
  const { id } = req.params;
  const nomeAtual = req.query.nome ? String(req.query.nome) : null;

  if (!nomeAtual) {
    return res.status(400).json({ erro: 'Informe o nome para consultar.' });
  }

  try {
    const contribuicoes = await prisma.contribution.findMany({
      where: {
        giftId: Number(id),
        contributorName: { equals: nomeAtual, mode: 'insensitive' },
      },
      orderBy: { createdAt: 'asc' },
    });

    res.json({
      contribuicoes: contribuicoes.map((c) => ({
        id: c.id,
        valor: Number(c.amount),
        data: c.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Não foi possível buscar as contribuições.' });
  }
});

app.get('/api/config', (req, res) => {
  res.json({ mapApiKey: process.env.MAP_APIKEY });
});

// --- Rotas administrativas ---

function checarSenhaAdmin(req, res, next) {
  const senha = req.headers['x-admin-password'];
  if (senha !== ADMIN_PASSWORD) {
    return res.status(401).json({ erro: 'Senha incorreta.' });
  }
  next();
}

app.post('/api/admin/login', (req, res) => {
  const { senha } = req.body;
  if (senha === ADMIN_PASSWORD) {
    res.json({ sucesso: true });
  } else {
    res.status(401).json({ erro: 'Senha incorreta.' });
  }
});

app.get('/api/admin/presentes', checarSenhaAdmin, async (req, res) => {
  try {
    const dados = await buscarDadosCompletos(null);
    res.json(dados);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Não foi possível carregar os presentes.' });
  }
});

app.get('/api/admin/contribuicoes', checarSenhaAdmin, async (req, res) => {
  try {
    const contribuicoes = await prisma.contribution.findMany({
      include: { gift: true },
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      contribuicoes: contribuicoes.map((c) => ({
        id: c.id,
        presente: c.gift.name,
        nome: c.contributorName,
        valor: Number(c.amount),
        data: c.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Não foi possível carregar as contribuições.' });
  }
});

app.listen(PORT, () => {
  console.log(`\n🎁 MyGift rodando em http://localhost:${PORT}\n`);
});