// admin.ts — roda no navegador. Compilado separadamente do backend
// (ver tsconfig.client.json), sem tipos de Node, só tipos de DOM.

interface PresenteAdmin {
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

interface RespostaPresentes {
  festa: unknown;
  presentes: PresenteAdmin[];
}

type StatusContribuicao = "pago" | "pendente" | "falhou";

interface ContribuicaoAdmin {
  id: number;
  presente: string;
  nomes: string[];
  payerId: string | null;
  paymentId: string | null;
  status: StatusContribuicao;
  valor: number;
  data: string;
}

interface RespostaContribuicoes {
  contribuicoes: ContribuicaoAdmin[];
}

interface CorpoPresenteForm {
  nome: string;
  descricao: string;
  categoria: string;
  valorSugerido: string;
  imagem: string;
}

const NOMES_CATEGORIA: Record<string, string> = {
  casa: "Casa",
  experiencia: "Experiência",
  hobby: "Hobby",
  pix: "Pix",
  outro: "Outro",
};

let senhaAdmin = "";
let presentesCache: PresenteAdmin[] = [];
let idEmEdicao: string | null = null;

// Pequeno helper pra pegar elementos do DOM com tipo certo, sem
// precisar de "as HTMLInputElement" espalhado pelo código todo.
function el<T extends HTMLElement = HTMLElement>(id: string): T {
  const elemento = document.getElementById(id);
  if (!elemento) throw new Error(`Elemento #${id} não encontrado.`);
  return elemento as T;
}

// ---------- Login ----------
el<HTMLFormElement>("formLogin").addEventListener("submit", async (e) => {
  e.preventDefault();
  const senha = el<HTMLInputElement>("inputSenha").value;
  const erro = el("erroLogin");
  erro.hidden = true;

  try {
    const resp = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ senha }),
    });
    if (!resp.ok) {
      erro.textContent = "Senha incorreta.";
      erro.hidden = false;
      return;
    }
    senhaAdmin = senha;
    el("telaLogin").hidden = true;
    el("telaPainel").hidden = false;
    carregarPresentes();
  } catch {
    erro.textContent = "Não foi possível conectar ao servidor.";
    erro.hidden = false;
  }
});

function headersAdmin(): Record<string, string> {
  return { "Content-Type": "application/json", "x-admin-password": senhaAdmin };
}

// ---------- Abas ----------
document.querySelectorAll<HTMLButtonElement>(".aba").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".aba").forEach((b) => b.classList.remove("ativa"));
    btn.classList.add("ativa");
    const aba = btn.dataset.aba;
    el("painelPresentes").hidden = aba !== "presentes";
    el("painelContribuicoes").hidden = aba !== "contribuicoes";
    if (aba === "contribuicoes") carregarContribuicoes();
  });
});

// ---------- Listar presentes ----------
async function carregarPresentes(): Promise<void> {
  try {
    const resp = await fetch("/api/admin/presentes", { headers: headersAdmin() });
    const dados = (await resp.json()) as RespostaPresentes;
    presentesCache = dados.presentes || [];
    renderizarPresentesAdmin();
  } catch (err) {
    console.error(err);
  }
}

function formatarMoeda(valor: number): string {
  return Number(valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function renderizarPresentesAdmin(): void {
  const grid = el("gridPresentesAdmin");
  const vazio = el("vazioPresentes");
  grid.innerHTML = "";

  if (presentesCache.length === 0) {
    vazio.hidden = false;
    return;
  }
  vazio.hidden = true;

  presentesCache.forEach((p) => {
    const card = document.createElement("article");
    card.className = "card-admin";
    card.innerHTML = `
      <span class="categoria">${NOMES_CATEGORIA[p.categoria] || p.categoria}</span>
      <h3>${escapeHTML(p.nome)}</h3>
      <p class="descricao">${escapeHTML(p.descricao || "Sem descrição.")}</p>
      <div class="rodape-card">
        <span class="valor">${p.valorSugerido ? formatarMoeda(p.valorSugerido) : "Sem valor"}</span>
        <span class="contagem">${p.totalContribuicoes || 0} contribuição(ões)</span>
      </div>
    `;
    card.addEventListener("click", () => abrirModalEdicao(p));
    grid.appendChild(card);
  });
}

function escapeHTML(texto: string): string {
  const div = document.createElement("div");
  div.textContent = texto;
  return div.innerHTML;
}

// ---------- Modal criar/editar ----------
const modal = el("modalPresente");
const form = el<HTMLFormElement>("formPresente");

el("btnNovoPresente").addEventListener("click", () => abrirModalCriacao());
el("modalFechar").addEventListener("click", fecharModal);
el("btnCancelar").addEventListener("click", fecharModal);
modal.addEventListener("click", (e) => {
  if (e.target === modal) fecharModal();
});

function abrirModalCriacao(): void {
  idEmEdicao = null;
  el("modalTitulo").textContent = "Novo presente";
  el("btnExcluir").hidden = true;
  form.reset();
  el("erroForm").hidden = true;
  modal.hidden = false;
}

function abrirModalEdicao(presente: PresenteAdmin): void {
  idEmEdicao = presente.id;
  el("modalTitulo").textContent = "Editar presente";
  el("btnExcluir").hidden = false;
  el<HTMLInputElement>("campoNome").value = presente.nome || "";
  el<HTMLTextAreaElement>("campoDescricao").value = presente.descricao || "";
  el<HTMLSelectElement>("campoCategoria").value = presente.categoria || "outro";
  el<HTMLInputElement>("campoValor").value =
    presente.valorSugerido !== null ? String(presente.valorSugerido) : "";
  el<HTMLInputElement>("campoImagem").value = presente.imagem || "";
  el("erroForm").hidden = true;
  modal.hidden = false;
}

function fecharModal(): void {
  modal.hidden = true;
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const erro = el("erroForm");
  erro.hidden = true;

  const corpo: CorpoPresenteForm = {
    nome: el<HTMLInputElement>("campoNome").value.trim(),
    descricao: el<HTMLTextAreaElement>("campoDescricao").value.trim(),
    categoria: el<HTMLSelectElement>("campoCategoria").value,
    valorSugerido: el<HTMLInputElement>("campoValor").value,
    imagem: el<HTMLInputElement>("campoImagem").value.trim(),
  };

  try {
    const resp = await fetch(
      idEmEdicao ? `/api/admin/presentes/${idEmEdicao}` : "/api/admin/presentes",
      {
        method: idEmEdicao ? "PUT" : "POST",
        headers: headersAdmin(),
        body: JSON.stringify(corpo),
      },
    );
    const dados = (await resp.json()) as { sucesso?: boolean; id?: string; erro?: string };
    if (!resp.ok) {
      erro.textContent = dados.erro || "Algo deu errado.";
      erro.hidden = false;
      return;
    }
    fecharModal();
    carregarPresentes();
  } catch {
    erro.textContent = "Não foi possível conectar ao servidor.";
    erro.hidden = false;
  }
});

el("btnExcluir").addEventListener("click", async () => {
  if (!idEmEdicao) return;
  if (!confirm("Remover este presente? As contribuições ligadas a ele também serão apagadas.")) return;

  try {
    const resp = await fetch(`/api/admin/presentes/${idEmEdicao}`, {
      method: "DELETE",
      headers: headersAdmin(),
    });
    if (!resp.ok) {
      const dados = (await resp.json()) as { erro?: string };
      alert(dados.erro || "Não foi possível remover.");
      return;
    }
    fecharModal();
    carregarPresentes();
  } catch {
    alert("Não foi possível conectar ao servidor.");
  }
});

// ---------- Contribuições ----------
async function carregarContribuicoes(): Promise<void> {
  try {
    const resp = await fetch("/api/admin/contribuicoes", { headers: headersAdmin() });
    const dados = (await resp.json()) as RespostaContribuicoes;
    renderizarContribuicoes(dados.contribuicoes || []);
  } catch (err) {
    console.error(err);
  }
}

function renderizarContribuicoes(lista: ContribuicaoAdmin[]): void {
  const corpo = el("corpoContribuicoes");
  const vazio = el("vazioContribuicoes");
  corpo.innerHTML = "";

  if (lista.length === 0) {
    vazio.hidden = false;
    return;
  }
  vazio.hidden = true;

  lista.forEach((c) => {
    const tr = document.createElement("tr");
    const data = new Date(c.data).toLocaleDateString("pt-BR");
    tr.innerHTML = `
      <td>${escapeHTML(c.presente)}</td>
      <td>${escapeHTML((c.nomes || []).join(", "))}</td>
      <td><span class="status-badge ${c.status}">${c.status}</span></td>
      <td>${formatarMoeda(c.valor)}</td>
      <td>${data}</td>
    `;
    corpo.appendChild(tr);
  });
}