import 'dotenv/config'
import express, { Request, Response, NextFunction } from 'express'
import path from 'path'
import { PrismaClient, Gift, Contribution, Contributor } from '@prisma/client'
import { randomUUID, createHmac } from 'crypto'
import { MercadoPagoConfig, Order } from 'mercadopago'
import swaggerJsdoc from 'swagger-jsdoc'
import swaggerUi from 'swagger-ui-express'

const prisma = new PrismaClient()
const app = express()
const PORT = 3000
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD

function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

const mpMode = String(process.env.MP_MODE || 'live').toLowerCase()
const mpAccessToken =
  mpMode === 'test'
    ? process.env.MP_TEST_ACCESS_TOKEN || ''
    : process.env.MP_ACCESS_TOKEN || ''

const mpPayerRaw = String(process.env.MP_PAYER || '').trim()
const REGEX_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const mpPayerEmail = REGEX_EMAIL.test(mpPayerRaw)
  ? mpPayerRaw
  : mpMode === 'test'
    ? 'test_user_br@testuser.com'
    : 'convidado@giftlyto.com'

if (mpMode === 'test' && !process.env.MP_TEST_ACCESS_TOKEN) {
  console.warn(
    'MP_MODE=test está ativo, mas MP_TEST_ACCESS_TOKEN não foi definido.',
  )
}

const mercadoPagoClient = mpAccessToken
  ? new MercadoPagoConfig({ accessToken: mpAccessToken })
  : null
const mercadoPagoOrder = mercadoPagoClient ? new Order(mercadoPagoClient) : null

app.use(express.json())
app.use(express.static(path.join(__dirname, '..', 'src', 'public')))
app.use('/assets', express.static(path.join(__dirname, '..', 'src', 'assets')))
app.use(
  '/vendor/fireworks-js',
  express.static(
    path.join(__dirname, '..', 'node_modules', 'fireworks-js', 'dist'),
  ),
)

const ADMIN_PANEL_PATH = String(process.env.ADMIN_PANEL_PATH || '').trim()
if (!ADMIN_PANEL_PATH) {
  console.warn(
    'ADMIN_PANEL_PATH não definido no .env — o painel admin está desativado.',
  )
} else {
  app.get(`/${ADMIN_PANEL_PATH}`, (req: Request, res: Response) => {
    res.sendFile(path.join(__dirname, '..', 'src', 'admin-panel', 'admin.html'))
  })
  app.use(
    `/${ADMIN_PANEL_PATH}`,
    express.static(path.join(__dirname, '..', 'src', 'admin-panel')),
  )
}

const swaggerSpec = swaggerJsdoc({
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'GiftlyTo API',
      version: '1.1.0',
      description: 'Documentação dos endpoints do GiftlyTo.',
    },
    servers: [{ url: `http://localhost:${PORT}` }],
    components: {
      securitySchemes: {
        AdminPassword: {
          type: 'apiKey',
          in: 'header',
          name: 'x-admin-password',
        },
      },
    },
    paths: {
      '/api/presentes': {
        get: {
          tags: ['Presentes'],
          summary: 'Lista os presentes e os dados da festa',
          parameters: [
            {
              in: 'query',
              name: 'nome',
              required: false,
              schema: { type: 'string' },
              description: 'Nome para calcular as contribuições dessa pessoa.',
            },
          ],
          responses: {
            200: { description: 'Dados da festa e lista de presentes.' },
          },
        },
      },
      '/api/presentes/{id}/contribuir': {
        post: {
          tags: ['Presentes'],
          summary: 'Cria uma contribuição Pix para um presente',
          parameters: [
            {
              in: 'path',
              name: 'id',
              required: true,
              schema: { type: 'integer' },
              description: 'ID do presente.',
            },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['nomes'],
                  properties: {
                    nomes: { type: 'array', items: { type: 'string' } },
                    mensagem: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: 'Pix gerado com sucesso.' },
            400: {
              description: 'Dados inválidos ou presente sem valor sugerido.',
            },
            404: { description: 'Presente não encontrado.' },
          },
        },
      },
      '/api/webhooks/mercadopago': {
        post: {
          tags: ['Webhooks'],
          summary: 'Recebe atualizações de pagamento do Mercado Pago',
          responses: { 200: { description: 'Webhook recebido.' } },
        },
      },
      '/api/presentes/{id}/minhas-contribuicoes': {
        get: {
          tags: ['Presentes'],
          summary: 'Lista as contribuições de uma pessoa para um presente',
          parameters: [
            {
              in: 'path',
              name: 'id',
              required: true,
              schema: { type: 'integer' },
            },
            {
              in: 'query',
              name: 'nome',
              required: true,
              schema: { type: 'string' },
            },
          ],
          responses: {
            200: { description: 'Contribuições filtradas pelo nome.' },
            400: { description: 'Nome ausente.' },
          },
        },
      },
      '/api/config': {
        get: {
          tags: ['Configuração'],
          summary: 'Retorna a chave do mapa usada no front-end',
          responses: { 200: { description: 'Configuração pública.' } },
        },
      },
      '/api/contribuicoes/{paymentId}/status': {
        get: {
          tags: ['Contribuições'],
          summary: 'Consulta o status de uma contribuição pelo paymentId',
          parameters: [
            {
              in: 'path',
              name: 'paymentId',
              required: true,
              schema: { type: 'string' },
            },
          ],
          responses: {
            200: { description: 'Status da contribuição.' },
            404: { description: 'Contribuição não encontrada.' },
          },
        },
      },
      '/api/admin/login': {
        post: {
          tags: ['Admin'],
          summary: 'Valida a senha do painel administrativo',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['senha'],
                  properties: { senha: { type: 'string' } },
                },
              },
            },
          },
          responses: {
            200: { description: 'Login aprovado.' },
            401: { description: 'Senha incorreta.' },
          },
        },
      },
      '/api/admin/presentes': {
        get: {
          tags: ['Admin'],
          summary: 'Lista os presentes com dados administrativos',
          security: [{ AdminPassword: [] }],
          responses: {
            200: { description: 'Dados administrativos dos presentes.' },
            401: { description: 'Senha administrativa inválida.' },
          },
        },
        post: {
          tags: ['Admin'],
          summary: 'Cria um novo presente',
          security: [{ AdminPassword: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    nome: { type: 'string' },
                    descricao: { type: 'string' },
                    categoria: { type: 'string' },
                    valorSugerido: {
                      oneOf: [{ type: 'string' }, { type: 'number' }],
                    },
                  },
                },
              },
            },
          },
          responses: {
            201: { description: 'Presente criado.' },
            400: { description: 'Dados inválidos.' },
            401: { description: 'Senha administrativa inválida.' },
          },
        },
      },
      '/api/admin/presentes/{id}': {
        put: {
          tags: ['Admin'],
          summary: 'Atualiza um presente',
          security: [{ AdminPassword: [] }],
          parameters: [
            {
              in: 'path',
              name: 'id',
              required: true,
              schema: { type: 'integer' },
            },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    nome: { type: 'string' },
                    descricao: { type: 'string' },
                    categoria: { type: 'string' },
                    valorSugerido: {
                      oneOf: [{ type: 'string' }, { type: 'number' }],
                    },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: 'Presente atualizado.' },
            401: { description: 'Senha administrativa inválida.' },
            404: { description: 'Presente não encontrado.' },
          },
        },
        delete: {
          tags: ['Admin'],
          summary: 'Remove um presente e suas contribuições',
          security: [{ AdminPassword: [] }],
          parameters: [
            {
              in: 'path',
              name: 'id',
              required: true,
              schema: { type: 'integer' },
            },
          ],
          responses: {
            200: { description: 'Presente removido.' },
            401: { description: 'Senha administrativa inválida.' },
            404: { description: 'Presente não encontrado.' },
          },
        },
      },
      '/api/admin/contribuicoes': {
        get: {
          tags: ['Admin'],
          summary: 'Lista as contribuições com dados completos',
          security: [{ AdminPassword: [] }],
          responses: {
            200: { description: 'Lista de contribuições.' },
            401: { description: 'Senha administrativa inválida.' },
          },
        },
      },
    },
  },
  apis: [path.join(process.cwd(), 'src', 'server.ts')],
})

app.get('/api-docs.json', (_req: Request, res: Response) => {
  res.json(swaggerSpec)
})

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec))

// --- Tipos auxiliares ---

type GiftWithContributions = Gift & {
  contributions: (Contribution & { contributors: Contributor[] })[]
}

interface FormattedGift {
  id: string
  nome: string
  descricao: string | null
  categoria: string
  valorSugerido: number | null
  totalArrecadado: number
  totalContribuicoes: number
  minhasContribuicoes: number
  minhasContribuicoesValor: number
}

interface MercadoPagoError {
  status: number
  erro: string
}

interface MercadoPagoApiError {
  errors?: Array<{ message?: string }>
  data?: {
    transactions?: {
      payments?: Array<{ status_detail?: string }>
    }
  }
  cause?: Array<{ description?: string; message?: string }>
  message?: string
  status?: number
}

// --- Helpers ---

function formatGift(
  gift: GiftWithContributions,
  currentName: string | null,
): FormattedGift {
  const contributions = gift.contributions || []

  const giftValue = gift.suggestedValue ? Number(gift.suggestedValue) : 0
  const paidContributions = contributions.filter((c) => c.status === 'pago')
  const totalRaised = contributions.reduce(
    (sum, c) => (c.status === 'pago' ? sum + giftValue : sum),
    0,
  )

  // Filtra só as contribuições PAGAS da pessoa vendo a página agora —
  // é isso que alimenta o banner "1x enviado / 2x enviado".
  const myContributions = currentName
    ? contributions.filter(
        (c) =>
          c.status === 'pago' &&
          c.contributors.some(
            (contributor) =>
              contributor.name.toLowerCase() === currentName.toLowerCase(),
          ),
      )
    : []

  return {
    id: String(gift.id),
    nome: gift.name,
    descricao: gift.description,
    categoria: gift.category,
    valorSugerido: gift.suggestedValue ? Number(gift.suggestedValue) : null,
    totalArrecadado: totalRaised,
    totalContribuicoes: paidContributions.length,
    minhasContribuicoes: myContributions.length,
    minhasContribuicoesValor: myContributions.length * giftValue,
  }
}

async function fetchAllData(currentName: string | null) {
  const party = await prisma.party.findFirst()
  const gifts = await prisma.gift.findMany({
    include: { contributions: { include: { contributors: true } } },
    orderBy: { id: 'asc' },
  })

  return {
    festa: party
      ? {
          nomeAniversariante: party.honoreeName,
          slug: slugify(party.honoreeName),
          idade: party.age,
          dataFesta: party.partyDate.toISOString().split('T')[0],
          mensagem: party.message || '',
        }
      : null,
    presentes: gifts.map((g) => formatGift(g, currentName)),
  }
}

function buildMercadoPagoError(err: MercadoPagoApiError): MercadoPagoError {
  // Formato de erro da API de Orders: a order é criada com sucesso,
  // mas a transação em si falha. Vem como { errors: [...], data: {...} }.
  if (Array.isArray(err?.errors) && err.errors.length > 0) {
    const statusDetail =
      err.data?.transactions?.payments?.[0]?.status_detail || ''

    if (statusDetail === 'processing_error') {
      return {
        status: 400,
        erro: 'O Pix não pôde ser processado. Confirme se sua conta do Mercado Pago tem uma chave Pix cadastrada em Seu Negócio > Configurações > Pix.',
      }
    }

    const messages = err.errors
      .map((e) => String(e?.message || ''))
      .filter(Boolean)
      .join(' | ')

    return {
      status: 400,
      erro: messages
        ? `O Mercado Pago rejeitou o pagamento: ${messages}`
        : 'O Mercado Pago rejeitou o pagamento.',
    }
  }

  const details = Array.isArray(err?.cause) ? err.cause : []
  const errorMessage = String(err?.message || '')
  const detailsDescription = details
    .map((detail) => String(detail?.description || detail?.message || ''))
    .filter(Boolean)
    .join(' | ')

  const liveCredentialsError =
    err?.status === 401 &&
    (errorMessage.includes('Unauthorized use of live credentials') ||
      details.some((detail) =>
        String(detail?.description || '').includes(
          'Unauthorized use of live credentials',
        ),
      ))

  if (liveCredentialsError) {
    return {
      status: 400,
      erro: 'O Mercado Pago rejeitou a credencial de produção. Para testes locais, use `MP_MODE=test` com `MP_TEST_ACCESS_TOKEN`. Para produção, confirme no painel se a aplicação e o Pix estão habilitados.',
    }
  }

  if (errorMessage || detailsDescription) {
    return {
      status: 400,
      erro: detailsDescription
        ? `O Mercado Pago rejeitou os dados enviados: ${detailsDescription}`
        : `O Mercado Pago rejeitou os dados enviados: ${errorMessage}`,
    }
  }

  return {
    status: 500,
    erro: 'Não foi possível registrar sua mensagem.',
  }
}

function validateWebhookSignature(req: Request): boolean {
  const secret = process.env.MP_WEBHOOK_SECRET
  if (!secret) {
    console.warn(
      'MP_WEBHOOK_SECRET não configurado — pulando validação de assinatura.',
    )
    return true
  }

  const xSignature = req.headers['x-signature'] as string | undefined
  const xRequestId = req.headers['x-request-id'] as string | undefined
  const dataId = (req.query['data.id'] || req.query.id) as string | undefined

  if (!xSignature || !dataId) return false

  const parts = xSignature
    .split(',')
    .reduce<Record<string, string>>((acc, part) => {
      const [key, value] = part.split('=')
      if (key && value) acc[key.trim()] = value.trim()
      return acc
    }, {})

  const ts = parts.ts
  const v1 = parts.v1
  if (!ts || !v1) return false

  const manifest = `id:${dataId.toLowerCase()};request-id:${xRequestId || ''};ts:${ts};`
  const calculatedSignature = createHmac('sha256', secret)
    .update(manifest)
    .digest('hex')

  return calculatedSignature === v1
}

function mapMercadoPagoStatus(
  mpStatus: string,
): 'pago' | 'falhou' | 'pendente' {
  if (mpStatus === 'processed') return 'pago'
  if (['canceled', 'failed', 'expired', 'refunded'].includes(mpStatus)) {
    return 'falhou'
  }
  return 'pendente'
}

// --- Rotas públicas ---

app.get('/api/presentes', async (req: Request, res: Response) => {
  try {
    const currentName = req.query.nome ? String(req.query.nome) : null
    const data = await fetchAllData(currentName)
    res.json(data)
  } catch (err) {
    console.error(err)
    res.status(500).json({ erro: 'Não foi possível carregar os presentes.' })
  }
})

app.post(
  '/api/presentes/:id/contribuir',
  async (req: Request, res: Response) => {
    const { id } = req.params
    const { nomes, mensagem } = req.body as {
      nomes?: unknown
      mensagem?: string
    }

    const namesList = Array.isArray(nomes)
      ? nomes.map((n) => String(n).trim())
      : []
    if (namesList.length === 0) {
      return res.status(400).json({ erro: 'Informe ao menos um nome.' })
    }

    if (namesList.some((name) => name.length === 0)) {
      return res
        .status(400)
        .json({ erro: 'Preencha todos os nomes adicionados.' })
    }

    try {
      const gift = await prisma.gift.findUnique({ where: { id: Number(id) } })

      if (!gift) {
        return res.status(404).json({ erro: 'Presente não encontrado.' })
      }

      if (!gift.suggestedValue) {
        return res.status(400).json({
          erro: 'Este presente ainda não tem valor sugerido para gerar o Pix.',
        })
      }

      if (!mercadoPagoOrder) {
        return res
          .status(500)
          .json({ erro: 'O Mercado Pago não está configurado no servidor.' })
      }

      const value = Number(gift.suggestedValue).toFixed(2)

      const order = await mercadoPagoOrder.create({
        body: {
          type: 'online',
          processing_mode: 'automatic',
          total_amount: value,
          external_reference: `gift-${gift.id}-${Date.now()}`,
          payer: {
            email: mpPayerEmail,
            first_name: mpMode === 'test' ? 'APRO' : namesList[0],
          },
          transactions: {
            payments: [
              {
                amount: value,
                payment_method: { id: 'pix', type: 'bank_transfer' },
              },
            ],
          },
          description: `Contribuição para o presente "${gift.name}"`,
        },
        requestOptions: { idempotencyKey: randomUUID() },
      })

      const paymentMethod = order.transactions?.payments?.[0]?.payment_method

      await prisma.contribution.create({
        data: {
          giftId: Number(id),
          contributors: {
            create: namesList.map((name) => ({ name })),
          },
          email: mpPayerEmail,
          mpPaymentId: order.id ? String(order.id) : null,
          message: mensagem ? String(mensagem).trim() : null,
          status: 'pendente',
        },
      })

      res.json({
        sucesso: true,
        paymentId: order.id ? String(order.id) : '',
        qrCode: paymentMethod?.qr_code || '',
        qrCodeBase64: paymentMethod?.qr_code_base64 || '',
        ticketUrl: paymentMethod?.ticket_url || '',
        valorSugerido: gift.suggestedValue ? Number(gift.suggestedValue) : null,
        nomePresente: gift.name,
      })
    } catch (err) {
      console.error(err)
      const mpError = buildMercadoPagoError(err as MercadoPagoApiError)
      res.status(mpError.status).json({ erro: mpError.erro })
    }
  },
)

// Webhook do Mercado Pago — precisa de URL pública HTTPS configurada
// no painel (Suas integrações > sua aplicação > Webhooks).
app.post('/api/webhooks/mercadopago', async (req: Request, res: Response) => {
  res.sendStatus(200)

  try {
    const type =
      req.query.type || (req.body as { type?: string } | undefined)?.type
    const orderId =
      (req.query['data.id'] as string) ||
      (req.body as { data?: { id?: string } } | undefined)?.data?.id

    if (type !== 'order' || !orderId) return

    if (!validateWebhookSignature(req)) {
      console.warn('Webhook com assinatura inválida, ignorando:', orderId)
      return
    }

    if (!mercadoPagoOrder) return

    const order = await mercadoPagoOrder.get({ id: orderId })
    const internalStatus = mapMercadoPagoStatus(order.status ?? '')

    const contribution = await prisma.contribution.findFirst({
      where: { mpPaymentId: String(orderId) },
    })

    if (!contribution) {
      console.warn('Webhook recebido para order não encontrada:', orderId)
      return
    }

    if (contribution.status !== internalStatus) {
      await prisma.contribution.update({
        where: { id: contribution.id },
        data: { status: internalStatus },
      })
      console.log(
        `Contribuição ${contribution.id} atualizada: ${contribution.status} → ${internalStatus}`,
      )
    }
  } catch (err) {
    console.error('Erro ao processar webhook do Mercado Pago:', err)
  }
})

app.get(
  '/api/presentes/:id/minhas-contribuicoes',
  async (req: Request, res: Response) => {
    const { id } = req.params
    const currentName = req.query.nome ? String(req.query.nome) : null

    if (!currentName) {
      return res.status(400).json({ erro: 'Informe o nome para consultar.' })
    }

    try {
      const contributions = await prisma.contribution.findMany({
        where: { giftId: Number(id) },
        orderBy: { createdAt: 'asc' },
        include: { gift: true, contributors: true },
      })

      const normalizedName = currentName.toLowerCase()
      const myContributions = contributions.filter((c) =>
        c.contributors.some(
          (contributor) => contributor.name.toLowerCase() === normalizedName,
        ),
      )

      res.json({
        contribuicoes: myContributions.map((c) => ({
          id: c.id,
          valor: c.gift.suggestedValue ? Number(c.gift.suggestedValue) : 0,
          status: c.status,
          data: c.createdAt.toISOString(),
        })),
      })
    } catch (err) {
      console.error(err)
      res
        .status(500)
        .json({ erro: 'Não foi possível buscar as contribuições.' })
    }
  },
)

app.get('/api/config', (req: Request, res: Response) => {
  res.json({ mapApiKey: process.env.MAP_APIKEY })
})

app.get(
  '/api/contribuicoes/:paymentId/status',
  async (req: Request, res: Response) => {
    const paymentId = String(req.params.paymentId)
    try {
      const contribution = await prisma.contribution.findFirst({
        where: { mpPaymentId: paymentId },
        select: { status: true },
      })
      if (!contribution) {
        return res.status(404).json({ erro: 'Contribuição não encontrada.' })
      }
      res.json({ status: contribution.status })
    } catch (err) {
      console.error(err)
      res.status(500).json({ erro: 'Não foi possível consultar o status.' })
    }
  },
)

// --- Rotas administrativas ---

function checkAdminPassword(req: Request, res: Response, next: NextFunction) {
  const password = req.headers['x-admin-password']
  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ erro: 'Senha incorreta.' })
  }
  next()
}

app.post('/api/admin/login', (req: Request, res: Response) => {
  const { senha } = req.body as { senha?: string }
  if (senha === ADMIN_PASSWORD) {
    res.json({ sucesso: true })
  } else {
    res.status(401).json({ erro: 'Senha incorreta.' })
  }
})

app.get(
  '/api/admin/presentes',
  checkAdminPassword,
  async (req: Request, res: Response) => {
    try {
      const data = await fetchAllData(null)
      res.json(data)
    } catch (err) {
      console.error(err)
      res.status(500).json({ erro: 'Não foi possível carregar os presentes.' })
    }
  },
)

interface AdminGiftBody {
  nome?: string
  descricao?: string
  categoria?: string
  valorSugerido?: string | number
}

function buildGiftData(body: AdminGiftBody) {
  return {
    name: String(body.nome).trim(),
    description: body.descricao ? String(body.descricao).trim() : null,
    category: body.categoria ? String(body.categoria).trim() : 'outro',
    suggestedValue:
      body.valorSugerido !== undefined &&
      body.valorSugerido !== null &&
      body.valorSugerido !== ''
        ? Number(body.valorSugerido)
        : null,
  }
}

app.post(
  '/api/admin/presentes',
  checkAdminPassword,
  async (req: Request, res: Response) => {
    const body = req.body as AdminGiftBody

    if (!body.nome || String(body.nome).trim().length === 0) {
      return res.status(400).json({ erro: 'O nome do presente é obrigatório.' })
    }

    try {
      const party = await prisma.party.findFirst()
      if (!party) {
        return res.status(400).json({
          erro: 'Configure os dados da festa (Party) antes de criar presentes.',
        })
      }

      const gift = await prisma.gift.create({
        data: {
          ...buildGiftData(body),
          party: { connect: { id: party.id } },
        },
      })
      res.status(201).json({ sucesso: true, id: gift.id })
    } catch (err) {
      console.error(err)
      res.status(500).json({ erro: 'Não foi possível criar o presente.' })
    }
  },
)

app.put(
  '/api/admin/presentes/:id',
  checkAdminPassword,
  async (req: Request, res: Response) => {
    const { id } = req.params
    const body = req.body as AdminGiftBody

    if (!body.nome || String(body.nome).trim().length === 0) {
      return res.status(400).json({ erro: 'O nome do presente é obrigatório.' })
    }

    try {
      await prisma.gift.update({
        where: { id: Number(id) },
        data: buildGiftData(body),
      })
      res.json({ sucesso: true })
    } catch (err: unknown) {
      console.error(err)
      if ((err as { code?: string }).code === 'P2025') {
        return res.status(404).json({ erro: 'Presente não encontrado.' })
      }
      res.status(500).json({ erro: 'Não foi possível editar o presente.' })
    }
  },
)

app.delete(
  '/api/admin/presentes/:id',
  checkAdminPassword,
  async (req: Request, res: Response) => {
    const { id } = req.params

    try {
      await prisma.contribution.deleteMany({ where: { giftId: Number(id) } })
      await prisma.gift.delete({ where: { id: Number(id) } })
      res.json({ sucesso: true })
    } catch (err: unknown) {
      console.error(err)
      if ((err as { code?: string }).code === 'P2025') {
        return res.status(404).json({ erro: 'Presente não encontrado.' })
      }
      res.status(500).json({ erro: 'Não foi possível remover o presente.' })
    }
  },
)

app.get(
  '/api/admin/contribuicoes',
  checkAdminPassword,
  async (req: Request, res: Response) => {
    try {
      const contributions = await prisma.contribution.findMany({
        include: { gift: true, contributors: true },
        orderBy: { createdAt: 'desc' },
      })

      res.json({
        contribuicoes: contributions.map((c) => ({
          id: c.id,
          presente: c.gift.name,
          nomes: c.contributors.map((contributor) => contributor.name),
          payerId: c.email,
          paymentId: c.mpPaymentId,
          status: c.status,
          valor: c.gift.suggestedValue ? Number(c.gift.suggestedValue) : 0,
          data: c.createdAt.toISOString(),
        })),
      })
    } catch (err) {
      console.error(err)
      res
        .status(500)
        .json({ erro: 'Não foi possível carregar as contribuições.' })
    }
  },
)

app.get(
  '/:honoreeName',
  async (req: Request, res: Response, next: NextFunction) => {
    if (req.params.honoreeName.includes('.')) return next()

    const party = await prisma.party.findFirst()
    const expectedSlug = party ? slugify(party.honoreeName) : null

    if (expectedSlug && req.params.honoreeName !== expectedSlug) {
      return res.redirect(301, `/${expectedSlug}`)
    }

    res.sendFile(path.join(__dirname, '..', 'src', 'public', 'index.html'))
  },
)

app.listen(PORT, () => {
  console.log(`\n🎁 GiftlyTo rodando em http://localhost:${PORT}\n`)
  console.log(`Modo Mercado Pago: ${mpMode}`)
})
