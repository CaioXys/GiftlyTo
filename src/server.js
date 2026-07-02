require("dotenv").config();
const express = require("express");
const path = require("path");
const { PrismaClient } = require("@prisma/client");
const { randomUUID } = require("crypto");
const { MercadoPagoConfig, Order } = require("mercadopago");

const prisma = new PrismaClient();
const app = express();
const PORT = 3000;
const ADMIN_PASSWORD = "vovo70anos"; // <-- troque essa senha como quiser
const mpMode = String(process.env.MP_MODE || "live").toLowerCase();
const mpAccessToken =
  mpMode === "test"
    ? process.env.MP_TEST_ACCESS_TOKEN || ""
    : process.env.MP_ACCESS_TOKEN || "";

// Em modo de teste, a API de Orders exige o payer.first_name = "APRO"
// para simular o Pix em sandbox (retorna status "action_required" e depois
// muda automaticamente para aprovado). Em produção usamos o nome real.
const mpPayerRaw = String(process.env.MP_PAYER || "").trim();
const REGEX_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const mpPayerEmail = REGEX_EMAIL.test(mpPayerRaw)
  ? mpPayerRaw
  : mpMode === "test"
    ? "test_user_br@testuser.com"
    : "convidado@mygift.com";

if (mpMode === "test" && !process.env.MP_TEST_ACCESS_TOKEN) {
  console.warn(
    "MP_MODE=test está ativo, mas MP_TEST_ACCESS_TOKEN não foi definido.",
  );
}

const mercadoPagoClient = mpAccessToken
  ? new MercadoPagoConfig({ accessToken: mpAccessToken })
  : null;
const mercadoPagoOrder = mercadoPagoClient
  ? new Order(mercadoPagoClient)
  : null;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// --- Helpers ---

// Converte um Gift do Prisma (com suas contribuições) para o formato que o front-end espera
function formatarPresente(gift, nomeAtual) {
  const contributions = gift.contributions || [];

  const valorPresente = gift.suggestedValue ? Number(gift.suggestedValue) : 0;
  const contribuicoesPagas = contributions.filter((c) => c.status === "pago");
  const totalArrecadado = contributions.reduce(
    (soma, c) => (c.status === "pago" ? soma + valorPresente : soma),
    0,
  );

  // Filtra só as contribuições da pessoa que está vendo a página agora
  const minhasContribuicoes = nomeAtual
    ? contributions.filter(
        (c) =>
          Array.isArray(c.names) &&
          c.names.some(
            (nome) => nome.toLowerCase() === nomeAtual.toLowerCase(),
          ),
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
    totalContribuicoes: contribuicoesPagas.length,
    minhasContribuicoes: minhasContribuicoes.length,
    minhasContribuicoesValor:
      minhasContribuicoes.filter((c) => c.status === "pago").length *
      valorPresente,
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
  const descricaoDetalhes = detalhes
    .map((item) => String(item?.description || item?.message || ""))
    .filter(Boolean)
    .join(" | ");

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

  if (mensagemErro || descricaoDetalhes) {
    return {
      status: 400,
      erro: descricaoDetalhes
        ? `O Mercado Pago rejeitou os dados enviados: ${descricaoDetalhes}`
        : `O Mercado Pago rejeitou os dados enviados: ${mensagemErro}`,
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

// Registrar uma nova contribuição e gerar o Pix pelo Mercado Pago (API de Orders)
app.post("/api/presentes/:id/contribuir", async (req, res) => {
  const { id } = req.params;
  const { nomes, mensagem } = req.body;

  const listaNomes = Array.isArray(nomes)
    ? nomes.map((n) => String(n).trim()).filter((n) => n.length > 0)
    : [];
  if (listaNomes.length === 0) {
    return res.status(400).json({ erro: "Informe ao menos um nome." });
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

    if (!mercadoPagoOrder) {
      return res
        .status(500)
        .json({ erro: "O Mercado Pago não está configurado no servidor." });
    }

    const valor = Number(gift.suggestedValue).toFixed(2);

    const order = await mercadoPagoOrder.create({
      body: {
        type: "online",
        processing_mode: "automatic",
        total_amount: valor,
        external_reference: `gift-${gift.id}-${Date.now()}`,
        payer: {
          email: mpPayerEmail,
          // Em modo teste, "APRO" é o valor mágico que simula um Pix
          // aprovado em sandbox. Em produção, usamos o nome de verdade.
          first_name: mpMode === "test" ? "APRO" : listaNomes[0],
        },
        transactions: {
          payments: [
            {
              amount: valor,
              payment_method: {
                id: "pix",
                type: "bank_transfer",
              },
            },
          ],
        },
        description: `Contribuição para o presente "${gift.name}"`,
      },
      requestOptions: {
        idempotencyKey: randomUUID(),
      },
    });

    const pagamento = order.transactions?.payments?.[0] || {};
    const metodoPagamento = pagamento.payment_method || {};

    await prisma.contribution.create({
      data: {
        giftId: Number(id),
        names: listaNomes,
        email: mpPayerEmail,
        mpPaymentId: order.id ? String(order.id) : null,
        message: mensagem ? String(mensagem).trim() : null,
        status: "pendente",
      },
    });

    res.json({
      sucesso: true,
      paymentId: order.id ? String(order.id) : "",
      qrCode: metodoPagamento.qr_code || "",
      qrCodeBase64: metodoPagamento.qr_code_base64 || "",
      ticketUrl: metodoPagamento.ticket_url || "",
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
      },
      orderBy: { createdAt: "asc" },
      include: { gift: true },
    });

    const nomeNormalizado = nomeAtual.toLowerCase();
    const minhasContribuicoes = contribuicoes.filter(
      (c) =>
        Array.isArray(c.names) &&
        c.names.some((nome) => nome.toLowerCase() === nomeNormalizado),
    );

    res.json({
      contribuicoes: minhasContribuicoes.map((c) => ({
        id: c.id,
        valor: c.gift.suggestedValue ? Number(c.gift.suggestedValue) : 0,
        status: c.status,
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
        nomes: c.names,
        payerId: c.email,
        paymentId: c.mpPaymentId,
        status: c.status,
        valor: c.gift.suggestedValue ? Number(c.gift.suggestedValue) : 0,
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
  console.log(`\n🎁 GiftlyTo rodando em http://localhost:${PORT}\n`);
  console.log(`Modo Mercado Pago: ${mpMode}`);
});