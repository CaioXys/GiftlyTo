import "dotenv/config";
import express, { Request, Response, NextFunction } from "express";
import path from "path";
import { PrismaClient, Gift, Contribution } from "@prisma/client";
import { randomUUID, createHmac } from "crypto";
import { MercadoPagoConfig, Order } from "mercadopago";
import swaggerJsdoc from "swagger-jsdoc";
import swaggerUi from "swagger-ui-express";

const prisma = new PrismaClient();
const app = express();
const PORT = 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD; // <-- troque essa senha como quiser

const mpMode = String(process.env.MP_MODE || "live").toLowerCase();
const mpAccessToken =
  mpMode === "test"
    ? process.env.MP_TEST_ACCESS_TOKEN || ""
    : process.env.MP_ACCESS_TOKEN || "";

const mpPayerRaw = String(process.env.MP_PAYER || "").trim();
const REGEX_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const mpPayerEmail = REGEX_EMAIL.test(mpPayerRaw)
  ? mpPayerRaw
  : mpMode === "test"
    ? "test_user_br@testuser.com"
    : "convidado@giftlyto.com";

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
app.use(express.static(path.join(__dirname, "..", "src", "public")));
app.use("/assets", express.static(path.join(__dirname, "..", "src", "assets")));
app.use(
  "/vendor/fireworks-js",
  express.static(
    path.join(__dirname, "..", "node_modules", "fireworks-js", "dist"),
  ),
);

// Painel admin — só fica acessível se ADMIN_PANEL_PATH estiver definida
// no .env. É uma URL secreta (ex: "painel-b60b1afce25122c9"), não
// linkada em nenhum lugar do site público. Gere a sua com:
// node -e "console.log(require('crypto').randomBytes(12).toString('hex'))"
const ADMIN_PANEL_PATH = String(process.env.ADMIN_PANEL_PATH || "").trim();
if (!ADMIN_PANEL_PATH) {
  console.warn(
    "ADMIN_PANEL_PATH não definido no .env — o painel admin está desativado.",
  );
} else {
  app.get(`/${ADMIN_PANEL_PATH}`, (req: Request, res: Response) => {
    res.sendFile(
      path.join(__dirname, "..", "src", "admin-panel", "admin.html"),
    );
  });
  app.use(
    `/${ADMIN_PANEL_PATH}`,
    express.static(path.join(__dirname, "..", "src", "admin-panel")),
  );
}

const swaggerSpec = swaggerJsdoc({
  definition: {
    openapi: "3.0.3",
    info: {
      title: "MyGift API",
      version: "1.1.0",
      description: "Documentação dos endpoints do MyGift.",
    },
    servers: [{ url: `http://localhost:${PORT}` }],
    components: {
      securitySchemes: {
        AdminPassword: {
          type: "apiKey",
          in: "header",
          name: "x-admin-password",
        },
      },
    },
    paths: {
      "/api/presentes": {
        get: {
          tags: ["Presentes"],
          summary: "Lista os presentes e os dados da festa",
          parameters: [
            {
              in: "query",
              name: "nome",
              required: false,
              schema: { type: "string" },
              description: "Nome para calcular as contribuições dessa pessoa.",
            },
          ],
          responses: {
            200: { description: "Dados da festa e lista de presentes." },
          },
        },
      },
      "/api/presentes/{id}/contribuir": {
        post: {
          tags: ["Presentes"],
          summary: "Cria uma contribuição Pix para um presente",
          parameters: [
            {
              in: "path",
              name: "id",
              required: true,
              schema: { type: "integer" },
              description: "ID do presente.",
            },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["nomes"],
                  properties: {
                    nomes: { type: "array", items: { type: "string" } },
                    mensagem: { type: "string" },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: "Pix gerado com sucesso." },
            400: {
              description: "Dados inválidos ou presente sem valor sugerido.",
            },
            404: { description: "Presente não encontrado." },
          },
        },
      },
      "/api/webhooks/mercadopago": {
        post: {
          tags: ["Webhooks"],
          summary: "Recebe atualizações de pagamento do Mercado Pago",
          responses: { 200: { description: "Webhook recebido." } },
        },
      },
      "/api/presentes/{id}/minhas-contribuicoes": {
        get: {
          tags: ["Presentes"],
          summary: "Lista as contribuições de uma pessoa para um presente",
          parameters: [
            {
              in: "path",
              name: "id",
              required: true,
              schema: { type: "integer" },
            },
            {
              in: "query",
              name: "nome",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: {
            200: { description: "Contribuições filtradas pelo nome." },
            400: { description: "Nome ausente." },
          },
        },
      },
      "/api/config": {
        get: {
          tags: ["Configuração"],
          summary: "Retorna a chave do mapa usada no front-end",
          responses: { 200: { description: "Configuração pública." } },
        },
      },
      "/api/contribuicoes/{paymentId}/status": {
        get: {
          tags: ["Contribuições"],
          summary: "Consulta o status de uma contribuição pelo paymentId",
          parameters: [
            {
              in: "path",
              name: "paymentId",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: {
            200: { description: "Status da contribuição." },
            404: { description: "Contribuição não encontrada." },
          },
        },
      },
      "/api/admin/login": {
        post: {
          tags: ["Admin"],
          summary: "Valida a senha do painel administrativo",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["senha"],
                  properties: { senha: { type: "string" } },
                },
              },
            },
          },
          responses: {
            200: { description: "Login aprovado." },
            401: { description: "Senha incorreta." },
          },
        },
      },
      "/api/admin/presentes": {
        get: {
          tags: ["Admin"],
          summary: "Lista os presentes com dados administrativos",
          security: [{ AdminPassword: [] }],
          responses: {
            200: { description: "Dados administrativos dos presentes." },
            401: { description: "Senha administrativa inválida." },
          },
        },
        post: {
          tags: ["Admin"],
          summary: "Cria um novo presente",
          security: [{ AdminPassword: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    nome: { type: "string" },
                    descricao: { type: "string" },
                    categoria: { type: "string" },
                    imagem: { type: "string" },
                    valorSugerido: {
                      oneOf: [{ type: "string" }, { type: "number" }],
                    },
                  },
                },
              },
            },
          },
          responses: {
            201: { description: "Presente criado." },
            400: { description: "Dados inválidos." },
            401: { description: "Senha administrativa inválida." },
          },
        },
      },
      "/api/admin/presentes/{id}": {
        put: {
          tags: ["Admin"],
          summary: "Atualiza um presente",
          security: [{ AdminPassword: [] }],
          parameters: [
            {
              in: "path",
              name: "id",
              required: true,
              schema: { type: "integer" },
            },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    nome: { type: "string" },
                    descricao: { type: "string" },
                    categoria: { type: "string" },
                    imagem: { type: "string" },
                    valorSugerido: {
                      oneOf: [{ type: "string" }, { type: "number" }],
                    },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: "Presente atualizado." },
            401: { description: "Senha administrativa inválida." },
            404: { description: "Presente não encontrado." },
          },
        },
        delete: {
          tags: ["Admin"],
          summary: "Remove um presente e suas contribuições",
          security: [{ AdminPassword: [] }],
          parameters: [
            {
              in: "path",
              name: "id",
              required: true,
              schema: { type: "integer" },
            },
          ],
          responses: {
            200: { description: "Presente removido." },
            401: { description: "Senha administrativa inválida." },
            404: { description: "Presente não encontrado." },
          },
        },
      },
      "/api/admin/contribuicoes": {
        get: {
          tags: ["Admin"],
          summary: "Lista as contribuições com dados completos",
          security: [{ AdminPassword: [] }],
          responses: {
            200: { description: "Lista de contribuições." },
            401: { description: "Senha administrativa inválida." },
          },
        },
      },
    },
  },
  apis: [path.join(process.cwd(), "src", "server.ts")],
});

app.get("/api-docs.json", (_req: Request, res: Response) => {
  res.json(swaggerSpec);
});

app.get("/api-docs", swaggerUi.setup(swaggerSpec));
app.use("/api-docs", swaggerUi.serve);

// --- Tipos auxiliares ---

type GiftComContribuicoes = Gift & { contributions: Contribution[] };

interface PresenteFormatado {
  id: string;
  nome: string;
  descricao: string | null;
  categoria: string;
  imagem: string;
  valorSugerido: number | null;
  totalArrecadado: number;
  totalContribuicoes: number;
  minhasContribuicoes: number;
  minhasContribuicoesValor: number;
}

interface ErroMercadoPago {
  status: number;
  erro: string;
}

// --- Helpers ---

function formatarPresente(
  gift: GiftComContribuicoes,
  nomeAtual: string | null,
): PresenteFormatado {
  const contributions = gift.contributions || [];

  const valorPresente = gift.suggestedValue ? Number(gift.suggestedValue) : 0;
  const contribuicoesPagas = contributions.filter((c) => c.status === "pago");
  const totalArrecadado = contributions.reduce(
    (soma, c) => (c.status === "pago" ? soma + valorPresente : soma),
    0,
  );

  // Filtra só as contribuições PAGAS da pessoa vendo a página agora —
  // é isso que alimenta o banner "1x enviado / 2x enviado".
  const minhasContribuicoes = nomeAtual
    ? contributions.filter(
        (c) =>
          c.status === "pago" &&
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
    valorSugerido: gift.suggestedValue ? Number(gift.suggestedValue) : null,
    totalArrecadado,
    totalContribuicoes: contribuicoesPagas.length,
    minhasContribuicoes: minhasContribuicoes.length,
    minhasContribuicoesValor: minhasContribuicoes.length * valorPresente,
  };
}

async function buscarDadosCompletos(nomeAtual: string | null) {
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

function montarErroMercadoPago(err: any): ErroMercadoPago {
  // Formato de erro da API de Orders: a order é criada com sucesso,
  // mas a transação em si falha. Vem como { errors: [...], data: {...} }.
  if (Array.isArray(err?.errors) && err.errors.length > 0) {
    const statusDetail =
      err.data?.transactions?.payments?.[0]?.status_detail || "";

    if (statusDetail === "processing_error") {
      return {
        status: 400,
        erro: "O Pix não pôde ser processado. Confirme se sua conta do Mercado Pago tem uma chave Pix cadastrada em Seu Negócio > Configurações > Pix.",
      };
    }

    const mensagens = err.errors
      .map((e: any) => String(e?.message || ""))
      .filter(Boolean)
      .join(" | ");

    return {
      status: 400,
      erro: mensagens
        ? `O Mercado Pago rejeitou o pagamento: ${mensagens}`
        : "O Mercado Pago rejeitou o pagamento.",
    };
  }

  const detalhes = Array.isArray(err?.cause) ? err.cause : [];
  const mensagemErro = String(err?.message || "");
  const descricaoDetalhes = detalhes
    .map((item: any) => String(item?.description || item?.message || ""))
    .filter(Boolean)
    .join(" | ");

  const liveCredentialsError =
    err?.status === 401 &&
    (mensagemErro.includes("Unauthorized use of live credentials") ||
      detalhes.some((item: any) =>
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

function validarAssinaturaWebhook(req: Request): boolean {
  const secret = process.env.MP_WEBHOOK_SECRET;
  if (!secret) {
    console.warn(
      "MP_WEBHOOK_SECRET não configurado — pulando validação de assinatura.",
    );
    return true;
  }

  const xSignature = req.headers["x-signature"] as string | undefined;
  const xRequestId = req.headers["x-request-id"] as string | undefined;
  const dataId = (req.query["data.id"] || req.query.id) as string | undefined;

  if (!xSignature || !dataId) return false;

  const partes = xSignature
    .split(",")
    .reduce<Record<string, string>>((acc, parte) => {
      const [chave, valor] = parte.split("=");
      if (chave && valor) acc[chave.trim()] = valor.trim();
      return acc;
    }, {});

  const ts = partes.ts;
  const v1 = partes.v1;
  if (!ts || !v1) return false;

  const manifest = `id:${dataId.toLowerCase()};request-id:${xRequestId || ""};ts:${ts};`;
  const assinaturaCalculada = createHmac("sha256", secret)
    .update(manifest)
    .digest("hex");

  return assinaturaCalculada === v1;
}

function statusInternoParaStatus(
  statusMp: string,
): "pago" | "falhou" | "pendente" {
  if (statusMp === "processed") return "pago";
  if (["canceled", "failed", "expired", "refunded"].includes(statusMp)) {
    return "falhou";
  }
  return "pendente";
}

// --- Rotas públicas ---

app.get("/api/presentes", async (req: Request, res: Response) => {
  try {
    const nomeAtual = req.query.nome ? String(req.query.nome) : null;
    const dados = await buscarDadosCompletos(nomeAtual);
    res.json(dados);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: "Não foi possível carregar os presentes." });
  }
});

app.post(
  "/api/presentes/:id/contribuir",
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const { nomes, mensagem } = req.body as {
      nomes?: unknown;
      mensagem?: string;
    };

    const listaNomes = Array.isArray(nomes)
      ? nomes.map((n) => String(n).trim())
      : [];
    if (listaNomes.length === 0) {
      return res.status(400).json({ erro: "Informe ao menos um nome." });
    }

    if (listaNomes.some((nome) => nome.length === 0)) {
      return res
        .status(400)
        .json({ erro: "Preencha todos os nomes adicionados." });
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
            first_name: mpMode === "test" ? "APRO" : listaNomes[0],
          },
          transactions: {
            payments: [
              {
                amount: valor,
                payment_method: { id: "pix", type: "bank_transfer" },
              },
            ],
          },
          description: `Contribuição para o presente "${gift.name}"`,
        },
        requestOptions: { idempotencyKey: randomUUID() },
      });

      const pagamento = (order as any).transactions?.payments?.[0] || {};
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
  },
);

// Webhook do Mercado Pago — precisa de URL pública HTTPS configurada
// no painel (Suas integrações > sua aplicação > Webhooks).
app.post("/api/webhooks/mercadopago", async (req: Request, res: Response) => {
  res.sendStatus(200);

  try {
    const tipo = req.query.type || (req.body as any)?.type;
    const orderId =
      (req.query["data.id"] as string) || (req.body as any)?.data?.id;

    if (tipo !== "order" || !orderId) return;

    if (!validarAssinaturaWebhook(req)) {
      console.warn("Webhook com assinatura inválida, ignorando:", orderId);
      return;
    }

    if (!mercadoPagoOrder) return;

    const order = await mercadoPagoOrder.get({ id: orderId });
    const statusInterno = statusInternoParaStatus((order as any).status);

    const contribuicao = await prisma.contribution.findFirst({
      where: { mpPaymentId: String(orderId) },
    });

    if (!contribuicao) {
      console.warn("Webhook recebido para order não encontrada:", orderId);
      return;
    }

    if (contribuicao.status !== statusInterno) {
      await prisma.contribution.update({
        where: { id: contribuicao.id },
        data: { status: statusInterno },
      });
      console.log(
        `Contribuição ${contribuicao.id} atualizada: ${contribuicao.status} → ${statusInterno}`,
      );
    }
  } catch (err) {
    console.error("Erro ao processar webhook do Mercado Pago:", err);
  }
});

app.get(
  "/api/presentes/:id/minhas-contribuicoes",
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const nomeAtual = req.query.nome ? String(req.query.nome) : null;

    if (!nomeAtual) {
      return res.status(400).json({ erro: "Informe o nome para consultar." });
    }

    try {
      const contribuicoes = await prisma.contribution.findMany({
        where: { giftId: Number(id) },
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
      res
        .status(500)
        .json({ erro: "Não foi possível buscar as contribuições." });
    }
  },
);

app.get("/api/config", (req: Request, res: Response) => {
  res.json({ mapApiKey: process.env.MAP_APIKEY });
});

app.get(
  "/api/contribuicoes/:paymentId/status",
  async (req: Request, res: Response) => {
    const paymentId = String(req.params.paymentId);
    try {
      const contribuicao = await prisma.contribution.findFirst({
        where: { mpPaymentId: paymentId },
        select: { status: true },
      });
      if (!contribuicao) {
        return res.status(404).json({ erro: "Contribuição não encontrada." });
      }
      res.json({ status: contribuicao.status });
    } catch (err) {
      console.error(err);
      res.status(500).json({ erro: "Não foi possível consultar o status." });
    }
  },
);

// --- Rotas administrativas ---

function checarSenhaAdmin(req: Request, res: Response, next: NextFunction) {
  const senha = req.headers["x-admin-password"];
  if (senha !== ADMIN_PASSWORD) {
    return res.status(401).json({ erro: "Senha incorreta." });
  }
  next();
}

app.post("/api/admin/login", (req: Request, res: Response) => {
  const { senha } = req.body as { senha?: string };
  if (senha === ADMIN_PASSWORD) {
    res.json({ sucesso: true });
  } else {
    res.status(401).json({ erro: "Senha incorreta." });
  }
});

app.get(
  "/api/admin/presentes",
  checarSenhaAdmin,
  async (req: Request, res: Response) => {
    try {
      const dados = await buscarDadosCompletos(null);
      res.json(dados);
    } catch (err) {
      console.error(err);
      res.status(500).json({ erro: "Não foi possível carregar os presentes." });
    }
  },
);

interface CorpoPresenteAdmin {
  nome?: string;
  descricao?: string;
  categoria?: string;
  imagem?: string;
  valorSugerido?: string | number;
}

function montarDadosPresente(corpo: CorpoPresenteAdmin) {
  return {
    name: String(corpo.nome).trim(),
    description: corpo.descricao ? String(corpo.descricao).trim() : null,
    category: corpo.categoria ? String(corpo.categoria).trim() : "outro",
    image: corpo.imagem ? String(corpo.imagem).trim() : "",
    suggestedValue:
      corpo.valorSugerido !== undefined &&
      corpo.valorSugerido !== null &&
      corpo.valorSugerido !== ""
        ? Number(corpo.valorSugerido)
        : null,
  };
}

app.post(
  "/api/admin/presentes",
  checarSenhaAdmin,
  async (req: Request, res: Response) => {
    const corpo = req.body as CorpoPresenteAdmin;

    if (!corpo.nome || String(corpo.nome).trim().length === 0) {
      return res
        .status(400)
        .json({ erro: "O nome do presente é obrigatório." });
    }

    try {
      const party = await prisma.party.findFirst();
      if (!party) {
        return res.status(400).json({
          erro: "Configure os dados da festa (Party) antes de criar presentes.",
        });
      }

      const gift = await prisma.gift.create({
        data: {
          ...montarDadosPresente(corpo),
          party: { connect: { id: party.id } },
        },
      });
      res.status(201).json({ sucesso: true, id: gift.id });
    } catch (err) {
      console.error(err);
      res.status(500).json({ erro: "Não foi possível criar o presente." });
    }
  },
);

app.put(
  "/api/admin/presentes/:id",
  checarSenhaAdmin,
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const corpo = req.body as CorpoPresenteAdmin;

    if (!corpo.nome || String(corpo.nome).trim().length === 0) {
      return res
        .status(400)
        .json({ erro: "O nome do presente é obrigatório." });
    }

    try {
      await prisma.gift.update({
        where: { id: Number(id) },
        data: montarDadosPresente(corpo),
      });
      res.json({ sucesso: true });
    } catch (err: any) {
      console.error(err);
      if (err.code === "P2025") {
        return res.status(404).json({ erro: "Presente não encontrado." });
      }
      res.status(500).json({ erro: "Não foi possível editar o presente." });
    }
  },
);

app.delete(
  "/api/admin/presentes/:id",
  checarSenhaAdmin,
  async (req: Request, res: Response) => {
    const { id } = req.params;

    try {
      await prisma.contribution.deleteMany({ where: { giftId: Number(id) } });
      await prisma.gift.delete({ where: { id: Number(id) } });
      res.json({ sucesso: true });
    } catch (err: any) {
      console.error(err);
      if (err.code === "P2025") {
        return res.status(404).json({ erro: "Presente não encontrado." });
      }
      res.status(500).json({ erro: "Não foi possível remover o presente." });
    }
  },
);

app.get(
  "/api/admin/contribuicoes",
  checarSenhaAdmin,
  async (req: Request, res: Response) => {
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
  },
);

app.listen(PORT, () => {
  console.log(`\n🎁 GiftlyTo rodando em http://localhost:${PORT}\n`);
  console.log(`Modo Mercado Pago: ${mpMode}`);
});
