# 🎁 MyGift — Lista de Presentes

Site para a festa de 70 anos, onde as pessoas escolhem e reservam um presente da lista.

## Como rodar no seu computador

1. Abra o terminal dentro da pasta `mygift`
2. Instale as dependências (só precisa fazer isso uma vez):
   ```
   npm install
   ```
3. Inicie o site:
   ```
   node server.js
   ```
4. Abra no navegador: **http://localhost:3000**

Para parar o site, volte ao terminal e aperte `Ctrl + C`.

---

## Como editar a lista de presentes

Abra o arquivo `data/presentes.json` em qualquer editor de texto (Bloco de Notas, VS Code, etc).

Cada presente segue este formato:

```json
{
  "id": "005",
  "nome": "Nome do presente",
  "descricao": "Uma frase curta explicando o presente",
  "categoria": "casa",
  "imagem": "",
  "linkLoja": "",
  "preco": "",
  "reservado": false,
  "reservadoPor": "",
  "dataReserva": ""
}
```

**Dicas importantes:**

- `id` precisa ser **único** (não repita o mesmo id em dois presentes). Pode ser "005", "006", etc.
- `categoria` pode ser: `casa`, `experiencia`, `hobby`, `pix`, ou crie a sua (ela aparecerá automaticamente como um filtro no site e gera uma fitinha colorida no card — categorias novas usam a cor coral por padrão).
- Não precisa preencher `imagem`, `linkLoja` ou `preco` — pode deixar como `""` (vazio).
- **Nunca edite manualmente** `reservado`, `reservadoPor` ou `dataReserva` de um presente já reservado — isso é atualizado automaticamente pelo site. Só edite esses campos se quiser "destravar" um presente reservado por engano (mude `reservado` para `false` e `reservadoPor` para `""`).
- Depois de editar e salvar o arquivo, **reinicie o servidor** (`Ctrl + C` e rode `node server.js` de novo) para garantir que o site carregue as mudanças. _(Obs: como o navegador busca os dados a cada vez que a página recarrega, às vezes nem precisa reiniciar — só atualizar a página no navegador já basta. Reinicie se notar algo estranho.)_

### Editando informações da festa

No topo do mesmo arquivo `presentes.json`, tem o bloco `"festa"`:

```json
"festa": {
  "nomeAniversariante": "Gilson",
  "idade": 70,
  "dataFesta": "2026-09-12",
  "mensagem": "Sua mensagem aqui"
}
```

Troque `nomeAniversariante`, `idade`, `dataFesta` (formato AAAA-MM-DD) e a `mensagem` como quiser. A contagem regressiva no topo do site é calculada automaticamente a partir de `dataFesta`.

---

## Sobre o Pix

O fluxo de Pix agora usa o **Mercado Pago** para gerar o QR code no momento da contribuição.

Para isso, você precisa manter no `.env` a variável `MP_ACCESS_TOKEN` com a chave privada da aplicação e informar um e-mail válido no modal do site, porque o Mercado Pago exige esse dado para criar o pagamento.

Se o token estiver ausente ou inválido, a API vai retornar erro ao tentar gerar o Pix.

Se estiver testando localmente e o Mercado Pago acusar credencial live, defina `MP_MODE=test` e preencha `MP_TEST_ACCESS_TOKEN` no `.env`.

---

## Painel simples de administração

Existe uma rota de API protegida por senha para você visualizar todos os presentes e reservas:

- Senha padrão: `vovo70anos` (troque no arquivo `server.js`, na linha `ADMIN_PASSWORD`)
- Por enquanto essa rota não tem uma tela visual própria — se quiser, posso criar uma página de admin completa depois.

A forma mais simples de ver as reservas por agora é abrir o arquivo `data/presentes.json` diretamente — lá já aparece quem reservou cada item.

---

## Próximos passos possíveis

- [ ] Adicionar fotos reais dos presentes (campo `imagem`)
- [ ] Criar uma tela de admin visual (sem precisar editar JSON)
- [x] Integrar pagamento real via Pix no Mercado Pago
- [ ] Publicar o site online (Vercel/Netlify) para acesso de qualquer lugar
