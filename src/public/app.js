// ---------- Estado global ----------
let dadosFesta = null;
let categoriaAtiva = "todos";
let presenteAtual = null;
let posicaoScrollFundo = 0;

const NOMES_CATEGORIA = {
  casa: "Casa",
  experiencia: "Experiência",
  hobby: "Hobby",
  pix: "Pix",
  viagem: "Viagem",
  outro: "Outro",
};

// ---------- Inicialização ----------
document.addEventListener("DOMContentLoaded", () => {
  carregarPresentes();
  configurarModalContribuicao();
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
  const dataFesta = new Date(dataFestaStr + "T19:00:00");

  function atualizar() {
    const agora = new Date();
    const diff = dataFesta - agora;

    if (diff <= 0) {
      document.getElementById("contagem").innerHTML =
        '<p style="font-weight:600;">🎉 A FESTA CHEGOU! 🎉</p>';
      clearInterval(intervalo);
      return;
    }

    const dias = Math.floor(diff / (1000 * 60 * 60 * 24));
    const horas = Math.floor((diff / (1000 * 60 * 60)) % 24);
    const minutos = Math.floor((diff / (1000 * 60)) % 60);
    const segundos = Math.floor((diff / 1000) % 60);

    document.getElementById("dias").textContent = dias;
    document.getElementById("horas").textContent = horas;
    document.getElementById("minutos").textContent = minutos;
    document.getElementById("segundos").textContent = segundos;
  }

  atualizar();
  const intervalo = setInterval(atualizar, 1000);
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

function formatarMoeda(valor) {
  return Number(valor).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function criarCard(presente) {
  const card = document.createElement("article");
  card.className = "card-presente";

  card.innerHTML = `
    <div class="card-fita cat-${presente.categoria}"></div>
    <div class="card-corpo">
      <span class="card-categoria">${NOMES_CATEGORIA[presente.categoria] || presente.categoria}</span>
      <h3 class="card-nome">${escapeHTML(presente.nome)}</h3>
      <p class="card-descricao">${escapeHTML(presente.descricao || "")}</p>
      ${presente.valorSugerido ? `<p class="card-preco">${formatarMoeda(presente.valorSugerido)} via Pix</p>` : ""}
      <button class="btn-reservar" data-id="${presente.id}">
        Quero dar esse presente
      </button>
    </div>
  `;

  const btn = card.querySelector(".btn-reservar");
  btn.addEventListener("click", () => abrirModalContribuicao(presente));

  return card;
}

function escapeHTML(texto) {
  const div = document.createElement("div");
  div.textContent = texto;
  return div.innerHTML;
}

// ---------- Campo dinâmico de nomes (botão "+") ----------
function configurarListaNomes() {
  const lista = document.getElementById("listaNomes");
  const btnAdicionar = document.getElementById("btnAdicionarNome");

  // Reseta para 1 campo só, toda vez que o modal abre
  lista.innerHTML = `
    <input type="text" class="input-nome" placeholder="Seu nome" />
  `;

  btnAdicionar.onclick = () => {
    const linha = document.createElement("div");
    linha.className = "linha-nome-extra";

    const input = document.createElement("input");
    input.type = "text";
    input.className = "input-nome";
    input.placeholder = "Nome da outra pessoa";

    const btnRemover = document.createElement("button");
    btnRemover.type = "button";
    btnRemover.className = "btn-remover-nome";
    btnRemover.innerHTML = "×";
    btnRemover.setAttribute("aria-label", "Remover");
    btnRemover.onclick = () => linha.remove();

    linha.appendChild(input);
    linha.appendChild(btnRemover);
    lista.appendChild(linha);
  };
}

function obterNomesPreenchidos() {
  const inputs = document.querySelectorAll("#listaNomes .input-nome");
  return Array.from(inputs)
    .map((input) => input.value.trim())
    .filter((nome) => nome.length > 0);
}

function bloquearScrollFundo() {
  posicaoScrollFundo =
    window.scrollY || document.documentElement.scrollTop || 0;
  document.body.classList.add("modal-aberto");
  document.body.style.position = "fixed";
  document.body.style.top = `-${posicaoScrollFundo}px`;
  document.body.style.left = "0";
  document.body.style.right = "0";
  document.body.style.width = "100%";
}

function desbloquearScrollFundo() {
  document.body.classList.remove("modal-aberto");
  document.body.style.position = "";
  document.body.style.top = "";
  document.body.style.left = "";
  document.body.style.right = "";
  document.body.style.width = "";
  window.scrollTo(0, posicaoScrollFundo);
}

// ---------- Modal de contribuição ----------
function configurarModalContribuicao() {
  const modal = document.getElementById("modalReserva");
  const fechar = document.getElementById("modalFechar");
  const btnConfirmar = document.getElementById("btnConfirmarReserva");
  const btnFecharSucesso = document.getElementById("btnFecharSucesso");

  fechar.addEventListener("click", () => {
    fecharModalContribuicao();
    presenteAtual = null;
  });

  modal.addEventListener("click", (e) => {
    if (e.target === modal) {
      fecharModalContribuicao();
      presenteAtual = null;
    }
  });

  btnConfirmar.addEventListener("click", async () => {
    const erro = document.getElementById("erroForm");
    erro.hidden = true;

    if (!presenteAtual) {
      erro.textContent =
        "Não identificamos o presente. Feche e tente novamente.";
      erro.hidden = false;
      return;
    }

    const nomes = obterNomesPreenchidos();
    if (nomes.length === 0) {
      erro.textContent = "Informe ao menos um nome.";
      erro.hidden = false;
      return;
    }

    const mensagem = document.getElementById("inputMensagem").value.trim();

    btnConfirmar.disabled = true;
    btnConfirmar.textContent = "Confirmando...";

    try {
      const resposta = await fetch(
        `/api/presentes/${presenteAtual.id}/contribuir`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nomes, mensagem }),
        },
      );

      const dados = await resposta.json();

      if (!resposta.ok) {
        erro.textContent = dados.erro || "Algo deu errado. Tente de novo.";
        erro.hidden = false;
        return;
      }

      mostrarPix(dados);
    } catch (err) {
      erro.textContent = "Não foi possível conectar ao servidor.";
      erro.hidden = false;
    } finally {
      btnConfirmar.disabled = false;
      btnConfirmar.textContent = "Confirmar e gerar Pix";
    }
  });

  btnFecharSucesso.addEventListener("click", () => {
    fecharModalContribuicao();
    presenteAtual = null;
  });
}

function abrirModalContribuicao(presente) {
  presenteAtual = presente;
  bloquearScrollFundo();

  document.getElementById("modalPresenteNome").textContent =
    presente.nome || "";

  const valorTexto = presente.valorSugerido
    ? `Valor deste presente: ${formatarMoeda(presente.valorSugerido)} via Pix`
    : "";
  document.getElementById("modalValorPresente").textContent = valorTexto;

  document.getElementById("inputMensagem").value = "";
  configurarListaNomes();

  document.getElementById("formReserva").hidden = false;
  document.getElementById("modalSucesso").hidden = true;
  document.getElementById("erroForm").hidden = true;
  document.getElementById("modalReserva").hidden = false;
}

function fecharModalContribuicao() {
  document.getElementById("modalReserva").hidden = true;
  desbloquearScrollFundo();
}

function mostrarPix(dados) {
  document.getElementById("formReserva").hidden = true;
  document.getElementById("modalSucesso").hidden = false;

  document.getElementById("sucessoTexto").textContent = dados.valorSugerido
    ? `Faça um Pix de ${formatarMoeda(dados.valorSugerido)} para o presente "${dados.nomePresente}".`
    : `Obrigado pelo carinho com o presente "${dados.nomePresente}"!`;

  const linkBtn = document.getElementById("linkAbrirPix");
  const qrContainer = document.getElementById("qrcodeContainer");
  qrContainer.innerHTML = "";

  if (dados.ticketUrl) {
    linkBtn.href = dados.ticketUrl;
    linkBtn.hidden = false;

    if (dados.qrCodeBase64) {
      const img = document.createElement("img");
      img.alt = "QR Code do Pix";
      img.src = `data:image/png;base64,${dados.qrCodeBase64}`;
      qrContainer.appendChild(img);
    } else if (dados.qrCode) {
      const qr = qrcode(0, "M");
      qr.addData(dados.qrCode);
      qr.make();
      qrContainer.innerHTML = qr.createSvgTag({ cellSize: 5, margin: 4 });
    }
  } else {
    linkBtn.hidden = true;
  }
}
