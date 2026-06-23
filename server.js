const express = require('express');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = 3000;
const DATA_PATH = path.join(__dirname, 'data', 'presentes.json');
const ADMIN_PASSWORD = 'vovo70anos'; // <-- troque essa senha como quiser

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- Helpers ---
function lerDados() {
  const raw = fs.readFileSync(DATA_PATH, 'utf-8');
  return JSON.parse(raw);
}

function salvarDados(dados) {
  fs.writeFileSync(DATA_PATH, JSON.stringify(dados, null, 2), 'utf-8');
}

// --- Rotas públicas ---

// Retorna dados da festa + lista de presentes
app.get('/api/presentes', (req, res) => {
  try {
    const dados = lerDados();
    res.json(dados);
  } catch (err) {
    res.status(500).json({ erro: 'Não foi possível carregar os presentes.' });
  }
});

// Reservar um presente
app.post('/api/presentes/:id/reservar', (req, res) => {
  const { id } = req.params;
  const { nome } = req.body;

  if (!nome || !nome.trim()) {
    return res.status(400).json({ erro: 'Informe seu nome para reservar.' });
  }

  try {
    const dados = lerDados();
    const presente = dados.presentes.find((p) => p.id === id);

    if (!presente) {
      return res.status(404).json({ erro: 'Presente não encontrado.' });
    }
    if (presente.reservado) {
      return res.status(409).json({ erro: 'Esse presente já foi reservado por outra pessoa.' });
    }

    presente.reservado = true;
    presente.dataReserva = new Date().toISOString();

    salvarDados(dados);
    res.json({ sucesso: true, presente });
  } catch (err) {
    res.status(500).json({ erro: 'Não foi possível reservar o presente.' });
  }
});

// Cancelar uma reserva (caso a própria pessoa desista)
app.post('/api/presentes/:id/cancelar', (req, res) => {
  const { id } = req.params;

  try {
    const dados = lerDados();
    const presente = dados.presentes.find((p) => p.id === id);

    if (!presente) {
      return res.status(404).json({ erro: 'Presente não encontrado.' });
    }

    presente.reservado = false;
    presente.reservadoPor = '';
    presente.dataReserva = '';

    salvarDados(dados);
    res.json({ sucesso: true, presente });
  } catch (err) {
    res.status(500).json({ erro: 'Não foi possível cancelar a reserva.' });
  }
});

// --- Rotas administrativas (protegidas por senha simples) ---

function checarSenhaAdmin(req, res, next) {
  const senha = req.headers['x-admin-password'];
  if (senha !== ADMIN_PASSWORD) {
    return res.status(401).json({ erro: 'Senha incorreta.' });
  }
  next();
}

app.post('/api/admin/login', (req, res) => {
  const { senha } = req.body;
  if (senha === ADMIN_PASSWORD) {
    res.json({ sucesso: true });
  } else {
    res.status(401).json({ erro: 'Senha incorreta.' });
  }
});

app.get('/api/admin/presentes', checarSenhaAdmin, (req, res) => {
  const dados = lerDados();
  res.json(dados);
});

app.get('/api/config', (req, res) => {
  res.json({ mapApiKey: process.env.MAP_APIKEY });
});

app.listen(PORT, () => {
  console.log(`\n🎁 MyGift rodando em http://localhost:${PORT}\n`);
});
