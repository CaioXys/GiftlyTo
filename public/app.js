// ---------- Estado global ----------
let dadosFesta = null;
let categoriaAtiva = 'todos';

const NOMES_CATEGORIA = {
  casa: 'Casa',
  experiencia: 'Experiência',
  hobby: 'Hobby',
  pix: 'Pix',
  outro: 'Outro',
};

// ---------- Inicialização ----------
document.addEventListener('DOMContentLoaded', () => {
  carregarPresentes();
  configurarModal();
});

async function carregarPresentes() {
  try {
    const resposta = await fetch('/api/presentes');
    if (!resposta.ok) throw new Error('Falha ao buscar dados');
    dadosFesta = await resposta.json();

    preencherHero(dadosFesta.festa);
    iniciarContagem(dadosFesta.festa.dataFesta);
    montarFiltros(dadosFesta.presentes);
    renderizarPresentes();
  } catch (erro) {
    console.error(erro);
    document.getElementById('tituloFesta').textContent = 'Não foi possível carregar a lista 😕';
  }
}

// ---------- Hero ----------
function preencherHero(festa) {
  document.getElementById('tituloFesta').textContent =
    `${festa.idade} anos de ${festa.nomeAniversariante}`;
  document.getElementById('mensagemFesta').textContent = festa.mensagem || '';
}

function iniciarContagem(dataFestaStr) {
  const dataFesta = new Date(dataFestaStr + 'T12:00:00');

  function atualizar() {
    const agora = new Date();
    const diff = dataFesta - agora;

    if (diff <= 0) {
      document.getElementById('contagem').innerHTML =
        '<p style="font-weight:600;">🎉 A festa é hoje (ou já passou)! 🎉</p>';
      clearInterval(intervalo);
      return;
    }

    const dias = Math.floor(diff / (1000 * 60 * 60 * 24));
    const horas = Math.floor((diff / (1000 * 60 * 60)) % 24);
    const minutos = Math.floor((diff / (1000 * 60)) % 60);

    document.getElementById('dias').textContent = dias;
    document.getElementById('horas').textContent = horas;
    document.getElementById('minutos').textContent = minutos;
  }

  atualizar();
  const intervalo = setInterval(atualizar, 1000 * 30);
}

// ---------- Filtros ----------
function montarFiltros(presentes) {
  const categorias = [...new Set(presentes.map((p) => p.categoria))];
  const container = document.getElementById('filtros');

  categorias.forEach((cat) => {
    const btn = document.createElement('button');
    btn.className = 'filtro-btn';
    btn.dataset.categoria = cat;
    btn.textContent = NOMES_CATEGORIA[cat] || cat;
    container.appendChild(btn);
  });

  container.addEventListener('click', (e) => {
    const btn = e.target.closest('.filtro-btn');
    if (!btn) return;

    document.querySelectorAll('.filtro-btn').forEach((b) => b.classList.remove('ativo'));
    btn.classList.add('ativo');
    categoriaAtiva = btn.dataset.categoria;
    renderizarPresentes();
  });
}

// ---------- Renderização dos cards ----------
function renderizarPresentes() {
  const grid = document.getElementById('gridPresentes');
  const estadoVazio = document.getElementById('estadoVazio');
  grid.innerHTML = '';

  const lista = dadosFesta.presentes.filter(
    (p) => categoriaAtiva === 'todos' || p.categoria === categoriaAtiva
  );

  if (lista.length === 0) {
    estadoVazio.hidden = false;
    return;
  }
  estadoVazio.hidden = true;

  lista.forEach((presente) => {
    grid.appendChild(criarCard(presente));
  });
}

function criarCard(presente) {
  const card = document.createElement('article');
  card.className = `card-presente ${presente.reservado ? 'reservado' : ''}`;

  const catClasse = `cat-${presente.categoria}` in {} ? '' : '';

  card.innerHTML = `
    <div class="card-fita cat-${presente.categoria}"></div>
    ${presente.reservado ? '<div class="tag-reservado">Reservado</div>' : ''}
    <div class="card-corpo">
      <span class="card-categoria">${NOMES_CATEGORIA[presente.categoria] || presente.categoria}</span>
      <h3 class="card-nome">${escapeHTML(presente.nome)}</h3>
      <p class="card-descricao">${escapeHTML(presente.descricao || '')}</p>
      ${presente.preco ? `<p class="card-preco">${escapeHTML(presente.preco)}</p>` : ''}
      <button class="btn-reservar ${presente.reservado ? 'btn-reservado-disabled' : ''}"
        ${presente.reservado ? 'disabled' : ''}
        data-id="${presente.id}">
        ${presente.reservado ? `Reservado por ${escapeHTML(presente.reservadoPor)}` : 'Quero dar esse presente'}
      </button>
    </div>
  `;

  const btn = card.querySelector('.btn-reservar');
  if (!presente.reservado) {
    btn.addEventListener('click', () => abrirModal(presente));
  }

  return card;
}

function escapeHTML(texto) {
  const div = document.createElement('div');
  div.textContent = texto;
  return div.innerHTML;
}

// ---------- Modal de reserva ----------
function configurarModal() {
  const modal = document.getElementById('modalReserva');
  const fechar = document.getElementById('modalFechar');
  const form = document.getElementById('formReserva');
  const btnFecharSucesso = document.getElementById('btnFecharSucesso');
  const conteudoModal = modal.querySelector('.modal');

  fechar.addEventListener('click', fecharModal);

  // Só fecha se o clique foi realmente no fundo escuro (overlay),
  // nunca em algo dentro da caixinha do modal (input, botão, texto etc).
  modal.addEventListener('mousedown', (e) => {
    if (!conteudoModal.contains(e.target)) {
      fecharModal();
    }
  });

  btnFecharSucesso.addEventListener('click', () => {
    fecharModal();
    renderizarPresentes();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const nomeInput = document.getElementById('inputNome');
    const erro = document.getElementById('erroForm');
    erro.hidden = true;

    // Lê o id direto do atributo do formulário (mais confiável que variável solta)
    const idAlvo = form.dataset.presenteId;

    if (!idAlvo) {
      erro.textContent = 'Não identificamos o presente. Feche e tente reservar novamente.';
      erro.hidden = false;
      return;
    }

    try {
      const resposta = await fetch(`/api/presentes/${idAlvo}/reservar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome: nomeInput.value }),
      });

      const dados = await resposta.json();

      if (!resposta.ok) {
        erro.textContent = dados.erro || 'Algo deu errado. Tente de novo.';
        erro.hidden = false;
        return;
      }

      // Atualiza estado local
      const presente = dadosFesta.presentes.find((p) => p.id === idAlvo);
      if (presente) {
        presente.reservado = true;
        presente.reservadoPor = nomeInput.value.trim();
      }

      mostrarSucesso(presente);
      nomeInput.value = '';
    } catch (err) {
      erro.textContent = 'Não foi possível conectar ao servidor.';
      erro.hidden = false;
    }
  });
}

function abrirModal(presente) {
  document.getElementById('formReserva').dataset.presenteId = presente.id;
  document.getElementById('modalPresenteNome').textContent = presente.nome;
  document.getElementById('formReserva').hidden = false;
  document.getElementById('modalSucesso').hidden = true;
  document.getElementById('erroForm').hidden = true;
  document.getElementById('modalReserva').hidden = false;
  document.getElementById('inputNome').focus();
}

function fecharModal() {
  document.getElementById('modalReserva').hidden = true;
}

function mostrarSucesso(presente) {
  document.getElementById('formReserva').hidden = true;
  document.getElementById('modalSucesso').hidden = false;

  const ehPix = presente.categoria === 'pix';
  document.getElementById('sucessoTexto').textContent = ehPix
    ? 'Obrigado! Em breve alguém vai combinar com você os detalhes do Pix.'
    : 'Obrigado por escolher esse presente! Avisaremos o aniversariante sobre a surpresa (sem contar qual é 😉).';
}
