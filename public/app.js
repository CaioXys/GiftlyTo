// ---------- Estado global ----------
let dadosFesta = null;
let categoriaAtiva = "todos";
let presenteAtual = null; // guarda o objeto do presente aberto no modal de reserva

const CHAVE_NOME = "mygift_nome_convidado";

const NOMES_CATEGORIA = {
  casa: "Casa",
  experiencia: "Experiência",
  hobby: "Hobby",
  pix: "Pix",
  outro: "Outro",
};

// ---------- Inicialização ----------
document.addEventListener("DOMContentLoaded", () => {
  carregarPresentes();
  configurarModalBoasVindas();
  configurarModalReserva();

  // Se não tem nome salvo, mostra o modal de boas-vindas
  if (!obterNomeSalvo()) {
    setTimeout(() => {
      abrirModalBoasVindas();
    }, 500);
  }
});

async function carregarPresentes() {
  try {
    const resposta = await fetch("/api/presentes");
    if (!resposta.ok) throw new Error("Falha ao buscar dados");
    dadosFesta = await resposta.json();

    preencherHero(dadosFesta.festa);
    iniciarContagem(dadosFesta.festa.dataFesta);
    montarFiltros(dadosFesta.presentes);
    renderizarPresentes();
  } catch (erro) {
    console.error(erro);
    document.getElementById("tituloFesta").textContent =
      "Não foi possível carregar a lista 😕";
  }
}

// ---------- Hero ----------
function preencherHero(festa) {
  document.getElementById("tituloFesta").textContent =
    `${festa.idade} anos de ${festa.nomeAniversariante}`;
  document.getElementById("mensagemFesta").textContent = festa.mensagem || "";
}

function iniciarContagem(dataFestaStr) {
  const dataFesta = new Date("2026-10-24T19:00:00");

  function atualizar() {
    const agora = new Date();
    const diff = dataFesta - agora;

    if (diff <= 0) {
      document.getElementById("contagem").innerHTML =
        '<p style="font-weight:600;">🎉 A festa é hoje (ou já passou)! 🎉</p>';
      clearInterval(intervalo);
      return;
    }

    const dias = Math.floor(diff / (1000 * 60 * 60 * 24));
    const horas = Math.floor((diff / (1000 * 60 * 60)) % 24);
    const minutos = Math.floor((diff / (1000 * 60)) % 60);

    document.getElementById("dias").textContent = dias;
    document.getElementById("horas").textContent = horas;
    document.getElementById("minutos").textContent = minutos;
  }

  atualizar();
  const intervalo = setInterval(atualizar, 1000 * 30);
}

// ---------- Filtros ----------
function montarFiltros(presentes) {
  const categorias = [...new Set(presentes.map((p) => p.categoria))];
  const container = document.getElementById("filtros");

  categorias.forEach((cat) => {
    const btn = document.createElement("button");
    btn.className = "filtro-btn";
    btn.dataset.categoria = cat;
    btn.textContent = NOMES_CATEGORIA[cat] || cat;
    container.appendChild(btn);
  });

  container.addEventListener("click", (e) => {
    const btn = e.target.closest(".filtro-btn");
    if (!btn) return;

    document
      .querySelectorAll(".filtro-btn")
      .forEach((b) => b.classList.remove("ativo"));
    btn.classList.add("ativo");
    categoriaAtiva = btn.dataset.categoria;
    renderizarPresentes();
  });
}

// ---------- Renderização dos cards ----------
function renderizarPresentes() {
  const grid = document.getElementById("gridPresentes");
  const estadoVazio = document.getElementById("estadoVazio");
  grid.innerHTML = "";

  const lista = dadosFesta.presentes.filter(
    (p) => categoriaAtiva === "todos" || p.categoria === categoriaAtiva,
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
  const card = document.createElement("article");
  card.className = `card-presente ${presente.reservado ? "reservado" : ""}`;

  card.innerHTML = `
    <div class="card-fita cat-${presente.categoria}"></div>
    ${presente.reservado ? '<div class="tag-reservado">Reservado</div>' : ""}
    <div class="card-corpo">
      <span class="card-categoria">${NOMES_CATEGORIA[presente.categoria] || presente.categoria}</span>
      <h3 class="card-nome">${escapeHTML(presente.nome)}</h3>
      <p class="card-descricao">${escapeHTML(presente.descricao || "")}</p>
      ${presente.preco ? `<p class="card-preco">${escapeHTML(presente.preco)}</p>` : ""}
      <button class="btn-reservar ${presente.reservado ? "btn-reservado-disabled" : ""}"
        ${presente.reservado ? "disabled" : ""}
        data-id="${presente.id}">
        ${presente.reservado ? "Presente já reservado" : "Quero dar esse presente"}
      </button>
    </div>
  `;

  const btn = card.querySelector(".btn-reservar");
  if (!presente.reservado) {
    btn.addEventListener("click", () => tentarAbrirModalReserva(presente));
  }

  return card;
}

function escapeHTML(texto) {
  const div = document.createElement("div");
  div.textContent = texto;
  return div.innerHTML;
}

// ---------- Nome do convidado (salvo no navegador) ----------
function obterNomeSalvo() {
  return localStorage.getItem(CHAVE_NOME) || "";
}

function salvarNome(nome) {
  localStorage.setItem(CHAVE_NOME, nome.trim());
}

// ---------- Modal de boas-vindas (pede nome 1x) ----------
function configurarModalBoasVindas() {
  const modal = document.getElementById("modalBoasVindas");
  const form = document.getElementById("formBoasVindas");
  const input = document.getElementById("inputNomeBoasVindas");

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const nome = input.value.trim();
    if (!nome) {
      input.focus();
      return;
    }

    salvarNome(nome);
    modal.hidden = true;

    // Se a pessoa estava tentando reservar algo, continua o fluxo agora.
    if (presenteAtual) {
      abrirModalReserva(presenteAtual);
    }
  });

  // Previne fechar o modal enquanto não preencher o nome
  modal.addEventListener("mousedown", (e) => {
    // Se clicar no overlay (fundo), não fecha
    if (e.target === modal) {
      e.preventDefault();
      input.focus();
    }
  });
}

function abrirModalBoasVindas() {
  const modal = document.getElementById("modalBoasVindas");
  const input = document.getElementById("inputNomeBoasVindas");
  input.value = "";
  modal.hidden = false;
  input.focus();
}

// ---------- Modal de reserva ----------
function configurarModalReserva() {
  const modal = document.getElementById("modalReserva");
  const fechar = document.getElementById("modalFechar");
  const conteudoModal = modal.querySelector(".modal");
  const btnConfirmar = document.getElementById("btnConfirmarReserva");
  const btnMudarNome = document.getElementById("btnMudarNome");
  const btnFecharSucesso = document.getElementById("btnFecharSucesso");

  // Botão X para fechar
  fechar.addEventListener("click", () => {
    fecharModalReserva();
    presenteAtual = null;
  });

  // Clique no fundo (overlay) para fechar
  modal.addEventListener("click", (e) => {
    if (e.target === modal) {
      fecharModalReserva();
      presenteAtual = null;
    }
  });

  btnMudarNome.addEventListener("click", () => {
    abrirModalBoasVindas();
  });

  btnConfirmar.addEventListener("click", async () => {
    const erro = document.getElementById("erroForm");
    erro.hidden = true;

    if (!presenteAtual) {
      erro.textContent =
        "Não identificamos o presente. Feche e tente reservar novamente.";
      erro.hidden = false;
      return;
    }

    const nome = obterNomeSalvo();
    if (!nome) {
      abrirModalBoasVindas();
      return;
    }

    btnConfirmar.disabled = true;
    btnConfirmar.textContent = "Confirmando...";

    try {
      const resposta = await fetch(
        `/api/presentes/${presenteAtual.id}/reservar`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nome }),
        },
      );

      const dados = await resposta.json();

      if (!resposta.ok) {
        erro.textContent = dados.erro || "Algo deu errado. Tente de novo.";
        erro.hidden = false;
        return;
      }

      // Atualiza estado local
      const presenteLocal = dadosFesta.presentes.find(
        (p) => p.id === presenteAtual.id,
      );
      if (presenteLocal) {
        presenteLocal.reservado = true;
        presenteLocal.reservadoPor = nome;
      }

      mostrarSucesso(presenteLocal || presenteAtual);
    } catch (err) {
      erro.textContent = "Não foi possível conectar ao servidor.";
      erro.hidden = false;
    } finally {
      btnConfirmar.disabled = false;
      btnConfirmar.textContent = "Confirmar reserva";
    }
  });

  btnFecharSucesso.addEventListener("click", () => {
    fecharModalReserva();
    presenteAtual = null;
    renderizarPresentes();
  });
}

// Decide se mostra direto o modal de reserva, ou pede o nome primeiro
function tentarAbrirModalReserva(presente) {
  presenteAtual = presente;

  if (!obterNomeSalvo()) {
    abrirModalBoasVindas();
    return;
  }

  abrirModalReserva(presente);
}

function abrirModalReserva(presente) {
  if (!presente || !presente.id) {
    console.error("Presente inválido para abrir modal de reserva");
    return;
  }

  presenteAtual = presente;

  document.getElementById("modalPresenteNome").textContent =
    presente.nome || "";
  document.getElementById("nomeConfirmado").textContent =
    obterNomeSalvo() || "";

  document.getElementById("formReserva").hidden = false;
  document.getElementById("modalSucesso").hidden = true;
  document.getElementById("erroForm").hidden = true;
  document.getElementById("modalReserva").hidden = false;
}

function fecharModalReserva() {
  document.getElementById("modalReserva").hidden = true;
}

function mostrarSucesso(presente) {
  document.getElementById("formReserva").hidden = true;
  document.getElementById("modalSucesso").hidden = false;

  const ehPix = presente.categoria === "pix";
  document.getElementById("sucessoTexto").textContent = ehPix
    ? "Obrigado! Em breve alguém vai combinar com você os detalhes do Pix."
    : "Obrigado por escolher esse presente! Avisaremos o aniversariante sobre a surpresa (sem contar qual é 😉).";
}
