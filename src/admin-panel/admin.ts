// admin.ts — roda no navegador. Compilado separadamente do backend
// (ver tsconfig.client.json), sem tipos de Node, só tipos de DOM.

interface AdminGift {
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

interface GiftsResponse {
  festa: unknown
  presentes: AdminGift[]
}

type ContributionStatus = 'pago' | 'pendente' | 'falhou'

interface AdminContribution {
  id: number
  presente: string
  nomes: string[]
  payerId: string | null
  paymentId: string | null
  status: ContributionStatus
  valor: number
  data: string
}

interface ContributionsResponse {
  contribuicoes: AdminContribution[]
}

interface GiftFormBody {
  nome: string
  descricao: string
  categoria: string
  valorSugerido: string
}

const CATEGORY_NAMES: Record<string, string> = {
  casa: 'Casa',
  experiencia: 'Experiência',
  hobby: 'Hobby',
  pix: 'Pix',
  outro: 'Outro',
}

let adminPassword = ''
let giftsCache: AdminGift[] = []
let editingId: string | null = null

// Pequeno helper pra pegar elementos do DOM com tipo certo, sem
// precisar de "as HTMLInputElement" espalhado pelo código todo.
function el<T extends HTMLElement = HTMLElement>(id: string): T {
  const element = document.getElementById(id)
  if (!element) throw new Error(`Elemento #${id} não encontrado.`)
  return element as T
}

// ---------- Login ----------
el<HTMLFormElement>('formLogin').addEventListener('submit', async (e) => {
  e.preventDefault()
  const password = el<HTMLInputElement>('inputSenha').value
  const error = el('erroLogin')
  error.hidden = true

  try {
    const response = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ senha: password }),
    })
    if (!response.ok) {
      error.textContent = 'Senha incorreta.'
      error.hidden = false
      return
    }
    adminPassword = password
    el('telaLogin').hidden = true
    el('telaPainel').hidden = false
    loadGifts()
  } catch {
    error.textContent = 'Não foi possível conectar ao servidor.'
    error.hidden = false
  }
})

function adminHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'x-admin-password': adminPassword,
  }
}

// ---------- Abas ----------
document.querySelectorAll<HTMLButtonElement>('.aba').forEach((button) => {
  button.addEventListener('click', () => {
    document
      .querySelectorAll('.aba')
      .forEach((b) => b.classList.remove('ativa'))
    button.classList.add('ativa')
    const tab = button.dataset.aba
    el('painelPresentes').hidden = tab !== 'presentes'
    el('painelContribuicoes').hidden = tab !== 'contribuicoes'
    if (tab === 'contribuicoes') loadContributions()
  })
})

// ---------- Listar presentes ----------
async function loadGifts(): Promise<void> {
  try {
    const response = await fetch('/api/admin/presentes', {
      headers: adminHeaders(),
    })
    const data = (await response.json()) as GiftsResponse
    giftsCache = data.presentes || []
    renderAdminGifts()
  } catch (err) {
    console.error(err)
  }
}

function formatCurrency(value: number): string {
  return Number(value).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
}

function renderAdminGifts(): void {
  const grid = el('gridPresentesAdmin')
  const empty = el('vazioPresentes')
  grid.innerHTML = ''

  if (giftsCache.length === 0) {
    empty.hidden = false
    return
  }
  empty.hidden = true

  giftsCache.forEach((gift) => {
    const card = document.createElement('article')
    card.className = 'card-admin'
    card.innerHTML = `
      <span class="categoria">${CATEGORY_NAMES[gift.categoria] || gift.categoria}</span>
      <h3>${escapeHTML(gift.nome)}</h3>
      <p class="descricao">${escapeHTML(gift.descricao || 'Sem descrição.')}</p>
      <div class="rodape-card">
        <span class="valor">${gift.valorSugerido ? formatCurrency(gift.valorSugerido) : 'Sem valor'}</span>
        <span class="contagem">${gift.totalContribuicoes || 0} contribuição(ões)</span>
      </div>
    `
    card.addEventListener('click', () => openEditModal(gift))
    grid.appendChild(card)
  })
}

function escapeHTML(text: string): string {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

// ---------- Modal criar/editar ----------
const modal = el('modalPresente')
const form = el<HTMLFormElement>('formPresente')

el('btnNovoPresente').addEventListener('click', () => openCreateModal())
el('modalFechar').addEventListener('click', closeModal)
el('btnCancelar').addEventListener('click', closeModal)
modal.addEventListener('click', (e) => {
  if (e.target === modal) closeModal()
})

function openCreateModal(): void {
  editingId = null
  el('modalTitulo').textContent = 'Novo presente'
  el('btnExcluir').hidden = true
  form.reset()
  el('erroForm').hidden = true
  modal.hidden = false
}

function openEditModal(gift: AdminGift): void {
  editingId = gift.id
  el('modalTitulo').textContent = 'Editar presente'
  el('btnExcluir').hidden = false
  el<HTMLInputElement>('campoNome').value = gift.nome || ''
  el<HTMLTextAreaElement>('campoDescricao').value = gift.descricao || ''
  el<HTMLSelectElement>('campoCategoria').value = gift.categoria || 'outro'
  el<HTMLInputElement>('campoValor').value =
    gift.valorSugerido !== null ? String(gift.valorSugerido) : ''
  el('erroForm').hidden = true
  modal.hidden = false
}

function closeModal(): void {
  modal.hidden = true
}

form.addEventListener('submit', async (e) => {
  e.preventDefault()
  const error = el('erroForm')
  error.hidden = true

  const body: GiftFormBody = {
    nome: el<HTMLInputElement>('campoNome').value.trim(),
    descricao: el<HTMLTextAreaElement>('campoDescricao').value.trim(),
    categoria: el<HTMLSelectElement>('campoCategoria').value,
    valorSugerido: el<HTMLInputElement>('campoValor').value,
  }

  try {
    const response = await fetch(
      editingId ? `/api/admin/presentes/${editingId}` : '/api/admin/presentes',
      {
        method: editingId ? 'PUT' : 'POST',
        headers: adminHeaders(),
        body: JSON.stringify(body),
      },
    )
    const data = (await response.json()) as {
      sucesso?: boolean
      id?: string
      erro?: string
    }
    if (!response.ok) {
      error.textContent = data.erro || 'Algo deu errado.'
      error.hidden = false
      return
    }
    closeModal()
    loadGifts()
  } catch {
    error.textContent = 'Não foi possível conectar ao servidor.'
    error.hidden = false
  }
})

el('btnExcluir').addEventListener('click', async () => {
  if (!editingId) return
  if (
    !confirm(
      'Remover este presente? As contribuições ligadas a ele também serão apagadas.',
    )
  )
    return

  try {
    const response = await fetch(`/api/admin/presentes/${editingId}`, {
      method: 'DELETE',
      headers: adminHeaders(),
    })
    if (!response.ok) {
      const data = (await response.json()) as { erro?: string }
      alert(data.erro || 'Não foi possível remover.')
      return
    }
    closeModal()
    loadGifts()
  } catch {
    alert('Não foi possível conectar ao servidor.')
  }
})

// ---------- Contribuições ----------
async function loadContributions(): Promise<void> {
  try {
    const response = await fetch('/api/admin/contribuicoes', {
      headers: adminHeaders(),
    })
    const data = (await response.json()) as ContributionsResponse
    renderContributions(data.contribuicoes || [])
  } catch (err) {
    console.error(err)
  }
}

function renderContributions(list: AdminContribution[]): void {
  const tableBody = el('corpoContribuicoes')
  const empty = el('vazioContribuicoes')
  tableBody.innerHTML = ''

  if (list.length === 0) {
    empty.hidden = false
    return
  }
  empty.hidden = true

  list.forEach((contribution) => {
    const tr = document.createElement('tr')
    const date = new Date(contribution.data).toLocaleDateString('pt-BR')
    tr.innerHTML = `
      <td>${escapeHTML(contribution.presente)}</td>
      <td>${escapeHTML((contribution.nomes || []).join(', '))}</td>
      <td><span class="status-badge ${contribution.status}">${contribution.status}</span></td>
      <td>${formatCurrency(contribution.valor)}</td>
      <td>${date}</td>
    `
    tableBody.appendChild(tr)
  })
}
