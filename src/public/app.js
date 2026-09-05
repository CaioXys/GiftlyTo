// ---------- Estado global ----------
let partyData = null
let activeCategory = 'todos'
let selectedGift = null
let scrollBackgroundPosition = 0
let headerFireworks = null
let heroWatcher = null
let copyCooldownTimer = null

const CATEGORY_NAMES = {
  casa: 'Casa',
  experiencia: 'Experiência',
  hobby: 'Hobby',
  pix: 'Pix',
  viagem: 'Viagem',
  outro: 'Outro',
}

// ---------- Inicialização ----------
document.addEventListener('DOMContentLoaded', () => {
  loadGifts()
  setupContributionModal()
  setupHeaderFireworks()
})

function setupHeaderFireworks() {
  const hero = document.querySelector('.hero')
  const fireworkContainer = document.getElementById('heroFogos')
  const fireworksClass = window.Fireworks?.Fireworks || window.Fireworks

  if (!hero || !fireworkContainer || typeof fireworksClass !== 'function') {
    return
  }

  headerFireworks = new fireworksClass(fireworkContainer, {
    autoresize: true,
    sound: { enabled: false },
    ...getSetupFireworks(),
  })

  if (!('IntersectionObserver' in window)) {
    restartHeaderFireworks()
    return
  }

  heroWatcher = new IntersectionObserver(
    ([entry]) => {
      if (entry.isIntersecting) {
        restartHeaderFireworks()
      } else {
        stopHeaderFireworks()
      }
    },
    {
      threshold: 0.2,
    },
  )

  heroWatcher.observe(hero)
}

function getSetupFireworks() {
  const mobile =
    window.matchMedia('(max-width: 768px)').matches || 'ontouchstart' in window

  const lowMemory =
    typeof navigator.deviceMemory === 'number' && navigator.deviceMemory <= 4
  const lowCpu =
    typeof navigator.hardwareConcurrency === 'number' &&
    navigator.hardwareConcurrency <= 4

  const liteMode = mobile && (lowMemory || lowCpu)

  if (liteMode) {
    return {
      opacity: 0.2,
      particles: 16,
      explosion: 7,
      intensity: 9,
      traceLength: 2,
      traceSpeed: 8,
      gravity: 1.1,
      friction: 0.965,
      acceleration: 1.02,
      delay: { min: 42, max: 62 },
      brightness: { min: 58, max: 86 },
      decay: { min: 0.016, max: 0.027 },
      rocketsPoint: { min: 12, max: 88 },
      flickering: 28,
      lineWidth: {
        explosion: { min: 1.4, max: 2.8 },
        trace: { min: 0.8, max: 1.2 },
      },
    }
  }

  if (mobile) {
    return {
      opacity: 0.22,
      particles: 30,
      explosion: 7,
      intensity: 11,
      traceLength: 2,
      traceSpeed: 8,
      gravity: 1.15,
      friction: 0.962,
      acceleration: 1.025,
      delay: { min: 34, max: 54 },
      brightness: { min: 58, max: 88 },
      decay: { min: 0.016, max: 0.028 },
      rocketsPoint: { min: 30, max: 70 },
      flickering: 30,
      lineWidth: {
        explosion: { min: 1.4, max: 2.9 },
        trace: { min: 0.8, max: 1.3 },
      },
    }
  }

  return {
    opacity: 0.22,
    particles: 120,
    explosion: 6,
    intensity: 16,
    traceLength: 2,
    traceSpeed: 9,
    gravity: 1.2,
    friction: 0.96,
    acceleration: 1.03,
    delay: { min: 22, max: 38 },
    brightness: { min: 55, max: 85 },
    decay: { min: 0.016, max: 0.028 },
    rocketsPoint: { min: 8, max: 92 },
    flickering: 35,
    lineWidth: {
      explosion: { min: 1.2, max: 2.6 },
      trace: { min: 0.9, max: 1.4 },
    },
  }
}

function restartHeaderFireworks() {
  if (!headerFireworks) {
    return
  }

  headerFireworks.stop(true)
  headerFireworks.start()
}

function stopHeaderFireworks() {
  if (!headerFireworks) {
    return
  }

  headerFireworks.stop(true)
}

async function loadGifts() {
  try {
    const response = await fetch('/api/presentes')
    if (!response.ok) throw new Error('Falha ao buscar dados')
    partyData = await response.json()

    populateHero(partyData.festa)
    startCountdown(partyData.festa.dataFesta)
    buildFilters(partyData.presentes)
    renderGifts()
  } catch (error) {
    console.error(error)
    document.getElementById('tituloFesta').textContent =
      'Não foi possível carregar a lista 😕'
  }
}

// ---------- Hero ----------
function populateHero(party) {
  document.getElementById('tituloFesta').innerHTML = `
    <span class="hero-nome">${escapeHTML(party.nomeAniversariante)}</span>
    <span class="hero-idade">${escapeHTML(`${party.idade} anos`)}</span>
  `
  document.getElementById('mensagemFesta').textContent = party.mensagem || ''
}

function startCountdown(partyDateStr) {
  const partyDate = new Date(partyDateStr + 'T19:00:00')

  function update() {
    const now = new Date()
    const diff = partyDate - now

    if (diff <= 0) {
      document.getElementById('contagem').innerHTML =
        '<p style="font-weight:600;">🎉 A FESTA CHEGOU! 🎉</p>'
      clearInterval(interval)
      return
    }

    const days = Math.floor(diff / (1000 * 60 * 60 * 24))
    const hours = Math.floor((diff / (1000 * 60 * 60)) % 24)
    const minutes = Math.floor((diff / (1000 * 60)) % 60)
    const seconds = Math.floor((diff / 1000) % 60)

    document.getElementById('dias').textContent = days
    document.getElementById('horas').textContent = hours
    document.getElementById('minutos').textContent = minutes
    document.getElementById('segundos').textContent = seconds
  }

  update()
  const interval = setInterval(update, 1000)
}

// ---------- Filtros ----------
function buildFilters(gifts) {
  const categories = [...new Set(gifts.map((g) => g.categoria))]
  const container = document.getElementById('filtros')

  categories.forEach((category) => {
    const button = document.createElement('button')
    button.className = 'filtro-btn'
    button.dataset.categoria = category
    button.textContent = CATEGORY_NAMES[category] || category
    container.appendChild(button)
  })

  container.addEventListener('click', (e) => {
    const button = e.target.closest('.filtro-btn')
    if (!button) return

    document
      .querySelectorAll('.filtro-btn')
      .forEach((b) => b.classList.remove('ativo'))
    button.classList.add('ativo')
    activeCategory = button.dataset.categoria
    renderGifts()
  })
}

// ---------- Renderização dos cards ----------
function renderGifts() {
  const grid = document.getElementById('gridPresentes')
  const emptyState = document.getElementById('estadoVazio')
  grid.innerHTML = ''

  const list = partyData.presentes.filter(
    (p) => activeCategory === 'todos' || p.categoria === activeCategory,
  )

  if (list.length === 0) {
    emptyState.hidden = false
    return
  }
  emptyState.hidden = true

  list.forEach((gift) => {
    grid.appendChild(createCard(gift))
  })
}

function formatCurrency(value) {
  return Number(value).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
}

function createCard(gift) {
  const card = document.createElement('article')
  card.className = 'card-presente'

  card.innerHTML = `
    <div class="card-fita cat-${gift.categoria}"></div>
    <div class="card-corpo">
      <span class="card-categoria">${CATEGORY_NAMES[gift.categoria] || gift.categoria}</span>
      <h3 class="card-nome">${escapeHTML(gift.nome)}</h3>
      <p class="card-descricao">${escapeHTML(gift.descricao || '')}</p>
      ${gift.valorSugerido ? `<p class="card-preco">${formatCurrency(gift.valorSugerido)} via Pix</p>` : ''}
      <button class="btn-reservar" data-id="${gift.id}">
        Quero dar esse presente
      </button>
    </div>
  `

  const btn = card.querySelector('.btn-reservar')
  btn.addEventListener('click', () => openContributionModal(gift))

  return card
}

function escapeHTML(text) {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

// ---------- Campo dinâmico de nomes (botão "+") ----------
function setupNamesList() {
  const list = document.getElementById('listaNomes')
  const addButton = document.getElementById('btnAdicionarNome')

  // Reseta para 1 campo só, toda vez que o modal abre
  list.innerHTML = `
    <input type="text" class="input-nome" placeholder="Seu nome" />
  `

  list.oninput = (e) => {
    if (e.target?.classList?.contains('input-nome')) {
      e.target.classList.remove('input-nome-erro')
    }
  }

  addButton.onclick = () => {
    const row = document.createElement('div')
    row.className = 'linha-nome-extra'

    const input = document.createElement('input')
    input.type = 'text'
    input.className = 'input-nome'
    input.placeholder = 'Nome da outra pessoa'
    input.addEventListener('input', () => {
      input.classList.remove('input-nome-erro')
    })

    const removeButton = document.createElement('button')
    removeButton.type = 'button'
    removeButton.className = 'btn-remover-nome'
    removeButton.innerHTML = '×'
    removeButton.setAttribute('aria-label', 'Remover')
    removeButton.onclick = () => row.remove()

    row.appendChild(input)
    row.appendChild(removeButton)
    list.appendChild(row)
  }
}

function getFilledNames() {
  const inputs = document.querySelectorAll('#listaNomes .input-nome')
  const names = []
  let hasEmptyField = false

  Array.from(inputs).forEach((input) => {
    const name = input.value.trim()
    if (!name) {
      hasEmptyField = true
      input.classList.add('input-nome-erro')
      return
    }

    input.classList.remove('input-nome-erro')
    names.push(name)
  })

  return hasEmptyField ? null : names
}

function lockBackgroundScroll() {
  scrollBackgroundPosition =
    window.scrollY || document.documentElement.scrollTop || 0
  document.body.classList.add('modal-aberto')
  document.body.style.position = 'fixed'
  document.body.style.top = `-${scrollBackgroundPosition}px`
  document.body.style.left = '0'
  document.body.style.right = '0'
  document.body.style.width = '100%'
}

function unlockBackgroundScroll() {
  document.body.classList.remove('modal-aberto')
  document.body.style.position = ''
  document.body.style.top = ''
  document.body.style.left = ''
  document.body.style.right = ''
  document.body.style.width = ''
  window.scrollTo(0, scrollBackgroundPosition)
}

// ---------- Modal de contribuição ----------
function setupContributionModal() {
  const modal = document.getElementById('modalReserva')
  const closeButton = document.getElementById('modalFechar')
  const confirmButton = document.getElementById('btnConfirmarReserva')
  const successCloseButton = document.getElementById('btnFecharSucesso')
  const copyButton = document.getElementById('copiarPix')

  closeButton.addEventListener('click', () => {
    closeContributionModal()
    selectedGift = null
  })

  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      closeContributionModal()
      selectedGift = null
    }
  })

  confirmButton.addEventListener('click', async () => {
    const error = document.getElementById('erroForm')
    error.hidden = true

    if (!selectedGift) {
      error.textContent =
        'Não identificamos o presente. Feche e tente novamente.'
      error.hidden = false
      return
    }

    const names = getFilledNames()
    if (!names) {
      error.textContent = 'Preencha todos os nomes adicionados.'
      error.hidden = false
      return
    }

    const message = document.getElementById('inputMensagem').value.trim()

    confirmButton.disabled = true
    confirmButton.textContent = 'Confirmando...'

    try {
      const response = await fetch(
        `/api/presentes/${selectedGift.id}/contribuir`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nomes: names, mensagem: message }),
        },
      )

      const data = await response.json()

      if (!response.ok) {
        error.textContent = data.erro || 'Algo deu errado. Tente de novo.'
        error.hidden = false
        return
      }

      showPix(data)
    } catch {
      error.textContent = 'Não foi possível conectar ao servidor.'
      error.hidden = false
    } finally {
      confirmButton.disabled = false
      confirmButton.textContent = 'Confirmar e gerar Pix'
    }
  })

  successCloseButton.addEventListener('click', () => {
    closeContributionModal()
    selectedGift = null
  })

  copyButton.addEventListener('click', async (event) => {
    event.preventDefault()

    if (
      !copyButton.dataset.pixCode ||
      copyButton.classList.contains('copiando')
    ) {
      return
    }

    try {
      await navigator.clipboard.writeText(copyButton.dataset.pixCode)
    } catch {
      return
    }

    copyButton.classList.add('copiando')
    copyButton.setAttribute('aria-disabled', 'true')
    copyButton.textContent = 'Pix copiado'

    clearTimeout(copyCooldownTimer)
    copyCooldownTimer = setTimeout(() => {
      copyButton.classList.remove('copiando')
      copyButton.removeAttribute('aria-disabled')
      copyButton.textContent = 'Copiar Pix 🔗'
    }, 2500)
  })
}

function openContributionModal(gift) {
  selectedGift = gift
  lockBackgroundScroll()

  document.getElementById('modalTitulo').hidden = false
  document.getElementById('modalPresenteNome').hidden = false
  document.getElementById('modalValorPresente').hidden = false
  document.querySelector('.emoji-sucesso').textContent = '🎉'
  document.querySelector('.sucesso-titulo').textContent = 'Combinado!'
  document.querySelector('.sucesso-titulo').classList.remove('resultado-grande')

  document.getElementById('modalPresenteNome').textContent = gift.nome || ''

  const valueText = gift.valorSugerido
    ? `Valor deste presente: ${formatCurrency(gift.valorSugerido)} via Pix`
    : ''
  document.getElementById('modalValorPresente').textContent = valueText

  document.getElementById('inputMensagem').value = ''
  setupNamesList()

  document.getElementById('formReserva').hidden = false
  document.getElementById('modalSucesso').hidden = true
  document.getElementById('erroForm').hidden = true
  document.getElementById('modalReserva').hidden = false
}

function closeContributionModal() {
  document.getElementById('modalReserva').hidden = true
  unlockBackgroundScroll()
}

function showPix(data) {
  document.getElementById('formReserva').hidden = true
  document.getElementById('modalSucesso').hidden = false

  document.getElementById('sucessoTexto').textContent = data.valorSugerido
    ? `Faça um Pix de ${formatCurrency(data.valorSugerido)} para o presente "${data.nomePresente}".`
    : `Obrigado pelo carinho com o presente "${data.nomePresente}"!`

  const copyButton = document.getElementById('copiarPix')
  const qrContainer = document.getElementById('qrcodeContainer')
  qrContainer.innerHTML = ''
  clearTimeout(copyCooldownTimer)
  copyButton.classList.remove('copiando')
  copyButton.removeAttribute('aria-disabled')
  copyButton.textContent = 'Copiar Pix 🔗'

  if (data.qrCode) {
    copyButton.dataset.pixCode = data.qrCode
    copyButton.hidden = false
  } else {
    copyButton.hidden = true
  }

  if (data.qrCodeBase64) {
    const img = document.createElement('img')
    img.alt = 'QR Code do Pix'
    img.src = `data:image/png;base64,${data.qrCodeBase64}`
    qrContainer.appendChild(img)
  } else if (data.qrCode) {
    const qr = qrcode(0, 'M')
    qr.addData(data.qrCode)
    qr.make()
    qrContainer.innerHTML = qr.createSvgTag({ cellSize: 5, margin: 4 })
  }

  if (data.paymentId) {
    monitorPayment(data.paymentId)
  }
}

function monitorPayment(paymentId) {
  const interval = setInterval(async () => {
    try {
      const response = await fetch(`/api/contribuicoes/${paymentId}/status`)
      if (!response.ok) return

      const { status } = await response.json()

      if (status === 'pago') {
        clearInterval(interval)
        showPaymentConfirmation()
      } else if (status === 'falhou') {
        clearInterval(interval)
        showPaymentFailure()
      }
    } catch (err) {
      console.error('Erro ao checar status do pagamento:', err)
    }
  }, 4000)

  setTimeout(() => clearInterval(interval), 10 * 60 * 1000)
}

function showPaymentConfirmation() {
  hideModalHeader()
  document.getElementById('qrcodeContainer').innerHTML = ''
  document.getElementById('copiarPix').hidden = true
  document.getElementById('sucessoTexto').textContent = ''

  const emoji = document.querySelector('.emoji-sucesso')
  const title = document.querySelector('.sucesso-titulo')

  emoji.textContent = '✅'
  title.textContent = 'Concluído!'
  title.classList.add('resultado-grande')
}

function showPaymentFailure() {
  hideModalHeader()
  document.getElementById('qrcodeContainer').innerHTML = ''
  document.getElementById('copiarPix').hidden = true
  document.getElementById('sucessoTexto').textContent = ''

  const emoji = document.querySelector('.emoji-sucesso')
  const title = document.querySelector('.sucesso-titulo')

  emoji.textContent = '❌'
  title.textContent = 'Recusado'
  title.classList.add('resultado-grande')
}

function hideModalHeader() {
  document.getElementById('modalTitulo').hidden = true
  document.getElementById('modalPresenteNome').hidden = true
  document.getElementById('modalValorPresente').hidden = true
}
