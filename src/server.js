require("dotenv").config();
const express = require("express");
const path = require("path");
const { PrismaClient } = require("@prisma/client");
const { randomUUID } = require("crypto");
const { MercadoPagoConfig, Payment } = require("mercadopago");

const prisma = new PrismaClient();
const app = express();
const PORT = 3000;
const ADMIN_PASSWORD = "vovo70anos"; // <-- troque essa senha como quiser
const mpMode = String(process.env.MP_MODE || "live").toLowerCase();
const mpAccessToken =
  mpMode === "test"
    ? process.env.MP_TEST_ACCESS_TOKEN || ""
    : process.env.MP_ACCESS_TOKEN || "";

if (mpMode === "test" && !process.env.MP_TEST_ACCESS_TOKEN) {
  console.warn(
    "MP_MODE=test está ativo, mas MP_TEST_ACCESS_TOKEN não foi definido.",
  );
}
const mercadoPagoClient = mpAccessToken
  ? new MercadoPagoConfig({ accessToken: mpAccessToken })
  : null;
const mercadoPagoPayment = mercadoPagoClient
  ? new Payment(mercadoPagoClient)
  : null;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// --- Helpers ---

// Converte um Gift do Prisma (com suas contribuições) para o formato que o front-end espera
function formatarPresente(gift, nomeAtual) {
  const contributions = gift.contributions || [];

  const totalArrecadado = contributions.reduce(
    (soma, c) => soma + Number(c.amount),
    0,
  );

  // Filtra só as contribuições da pessoa que está vendo a página agora
  const minhasContribuicoes = nomeAtual
    ? contributions.filter(
        (c) => c.contributorName.toLowerCase() === nomeAtual.toLowerCase(),
      )
    : [];

  return {
    id: String(gift.id),
    nome: gift.name,
    descricao: gift.description,
    categoria: gift.category,
    imagem: gift.image || "",
    linkLoja: gift.storeLink || "",
    valorSugerido: gift.suggestedValue ? Number(gift.suggestedValue) : null,
    totalArrecadado,
    totalContribuicoes: contributions.length,
    minhasContribuicoes: minhasContribuicoes.length,
    minhasContribuicoesValor: minhasContribuicoes.reduce(
      (soma, c) => soma + Number(c.amount),
      0,
    ),
  };
}

async function buscarDadosCompletos(nomeAtual) {
  const party = await prisma.party.findFirst();
  const gifts = await prisma.gift.findMany({
    include: { contributions: true },
    orderBy: { id: "asc" },
  });

  return {
    festa: party
      ? {
          nomeAniversariante: party.honoreeName,
          idade: party.age,
          dataFesta: party.partyDate.toISOString().split("T")[0],
          mensagem: party.message || "",
        }
      : null,
    presentes: gifts.map((g) => formatarPresente(g, nomeAtual)),
  };
}

function montarErroMercadoPago(err) {
  const detalhes = Array.isArray(err?.cause) ? err.cause : [];
  const mensagemErro = String(err?.message || "");

  const liveCredentialsError =
    err?.status === 401 &&
    (mensagemErro.includes("Unauthorized use of live credentials") ||
      detalhes.some((item) =>
        String(item?.description || "").includes(
          "Unauthorized use of live credentials",
        ),
      ));

  if (liveCredentialsError) {
    return {
      status: 400,
      erro: "O Mercado Pago rejeitou a credencial de produção. Para testes locais, use `MP_MODE=test` com `MP_TEST_ACCESS_TOKEN`. Para produção, confirme no painel se a aplicação e o Pix estão habilitados.",
    };
  }

  return {
    status: 500,
    erro: "Não foi possível registrar sua mensagem.",
  };
}

// --- Rotas públicas ---

app.get("/api/presentes", async (req, res) => {
  try {
    const nomeAtual = req.query.nome ? String(req.query.nome) : null;
    const dados = await buscarDadosCompletos(nomeAtual);
    res.json(dados);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: "Não foi possível carregar os presentes." });
  }
});

// Registrar uma nova contribuição e gerar o Pix pelo Mercado Pago
app.post("/api/presentes/:id/contribuir", async (req, res) => {
  const { id } = req.params;
  const { nomes, mensagem, email } = req.body;

  const listaNomes = Array.isArray(nomes)
    ? nomes.map((n) => String(n).trim()).filter((n) => n.length > 0)
    : [];
  const emailLimpo = String(email || "")
    .trim()
    .toLowerCase();
  const emailValido = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailLimpo);

  if (listaNomes.length === 0) {
    return res.status(400).json({ erro: "Informe ao menos um nome." });
  }

  if (!emailValido) {
    return res
      .status(400)
      .json({ erro: "Informe um e-mail válido para gerar o Pix." });
  }

  try {
    const gift = await prisma.gift.findUnique({ where: { id: Number(id) } });

    if (!gift) {
      return res.status(404).json({ erro: "Presente não encontrado." });
    }

    if (!gift.suggestedValue) {
      return res.status(400).json({
        erro: "Este presente ainda não tem valor sugerido para gerar o Pix.",
      });
    }

    if (!mercadoPagoPayment) {
      return res
        .status(500)
        .json({ erro: "O Mercado Pago não está configurado no servidor." });
    }

    const payment = await mercadoPagoPayment.create({
      body: {
        transaction_amount: Number(gift.suggestedValue),
        description: `Contribuição para o presente "${gift.name}"`,
        payment_method_id: "pix",
        external_reference: `gift-${gift.id}-${Date.now()}`,
        payer: {
          email: emailLimpo,
          first_name: listaNomes[0],
        },
        metadata: {
          giftId: gift.id,
          giftName: gift.name,
          contributorNames: listaNomes,
          message: mensagem ? String(mensagem).trim() : "",
        },
      },
      requestOptions: {
        idempotencyKey: randomUUID(),
      },
    });

    await prisma.contribution.create({
      data: {
        giftId: Number(id),
        names: listaNomes,
        email: emailLimpo,
        message: mensagem ? String(mensagem).trim() : null,
        status: "pendente",
      },
    });

    const transactionData =
      payment.point_of_interaction?.transaction_data || {};

    res.json({
      sucesso: true,
      paymentId: payment.id ? String(payment.id) : "",
      qrCode: transactionData.qr_code || "",
      qrCodeBase64: transactionData.qr_code_base64 || "",
      ticketUrl: transactionData.ticket_url || "",
      valorSugerido: gift.suggestedValue ? Number(gift.suggestedValue) : null,
      nomePresente: gift.name,
    });
  } catch (err) {
    console.error(err);
    const mpErro = montarErroMercadoPago(err);
    res.status(mpErro.status).json({ erro: mpErro.erro });
  }
});

app.get("/api/presentes/:id/minhas-contribuicoes", async (req, res) => {
  const { id } = req.params;
  const nomeAtual = req.query.nome ? String(req.query.nome) : null;

  if (!nomeAtual) {
    return res.status(400).json({ erro: "Informe o nome para consultar." });
  }

  try {
    const contribuicoes = await prisma.contribution.findMany({
      where: {
        giftId: Number(id),
        contributorName: { equals: nomeAtual, mode: "insensitive" },
      },
      orderBy: { createdAt: "asc" },
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
    res.status(500).json({ erro: "Não foi possível buscar as contribuições." });
  }
});

app.get("/api/config", (req, res) => {
  res.json({ mapApiKey: process.env.MAP_APIKEY });
});

// --- Rotas administrativas ---

function checarSenhaAdmin(req, res, next) {
  const senha = req.headers["x-admin-password"];
  if (senha !== ADMIN_PASSWORD) {
    return res.status(401).json({ erro: "Senha incorreta." });
  }
  next();
}

app.post("/api/admin/login", (req, res) => {
  const { senha } = req.body;
  if (senha === ADMIN_PASSWORD) {
    res.json({ sucesso: true });
  } else {
    res.status(401).json({ erro: "Senha incorreta." });
  }
});

app.get("/api/admin/presentes", checarSenhaAdmin, async (req, res) => {
  try {
    const dados = await buscarDadosCompletos(null);
    res.json(dados);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: "Não foi possível carregar os presentes." });
  }
});

app.get("/api/admin/contribuicoes", checarSenhaAdmin, async (req, res) => {
  try {
    const contribuicoes = await prisma.contribution.findMany({
      include: { gift: true },
      orderBy: { createdAt: "desc" },
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
    res
      .status(500)
      .json({ erro: "Não foi possível carregar as contribuições." });
  }
});

app.listen(PORT, () => {
  console.log(`\n🎁 MyGift rodando em http://localhost:${PORT}\n`);
});
