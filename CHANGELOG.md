# Novidades do Satoshi Ledger

Histórico das atualizações do dashboard e da planilha, da mais recente para a
mais antiga. Cada item diz **o que mudou** e **onde você vê isso** na prática.

Formato: `versão · data`

---

## 2.32 · 20/11/2026 — Projeção com aporte e ganho

- Na **Análise detalhada → Projeção**, a tabela passou a ter: **cenário**,
  **preço do BTC**, **aportado**, **você teria**, **lucro** e **a mais vs hoje**.
- Nova linha **“hoje”** como referência, e o cenário do **topo anterior** destacado.
- No celular a tabela fica compacta (aporte e lucro saem, ficam cenário, preço,
  você teria e a mais vs hoje).

## 2.31 · 20/11/2026 — DCA de venda no layout de compra

- Sell e buy usam **o mesmo card**: muda o conteúdo e os textos, não o layout.
- **Só um aparece por vez**: dentro da janela de venda o card de compra sai de
  cena; fora dela, o de venda.
- Venda **sem caixa especial** e com o **mesmo âmbar** da compra.
- Gráfico **vendido × plano** (acumulado) e **caixa gerado** no card.

## 2.36 · 21/11/2026 — Aposentadoria na análise

- Nova seção **Aposentadoria** na Análise detalhada, baseada no estudo de Smitty
  (BTC necessário para viver de renda, retirada de 4%).
- **Três campos ajustáveis**: idade, meta mensal (R$) e ano alvo — tudo recalcula na hora.
- Mostra o **BTC necessário** para a sua meta e a **sua renda mensal** com a carteira
  atual, além do percentual da meta já conquistado.
- Gráfico com uma **curva por idade** (25 a 65, escala log), a **curva da sua idade
  destacada**, a linha da sua carteira e o marcador do ano escolhido.
- O modal de análise ficou **enxuto**: saíram os cartões de Acumulação e do DCA
  corrente (já aparecem no dashboard) — sobrou carteira, projeção e aposentadoria.

## 2.35 · 21/11/2026 — Projeção e ciclo

- Gráfico da **projeção de patrimônio** abaixo da tabela, com a linha do aporte.
- Bloco **No ciclo** do DCA com cabeçalho centralizado.

## 2.29 · 20/11/2026 — DCA de venda

- Novo card **DCA de venda**: **20% da posição** diluída em **10 semanas**, entre
  **480 e 550 dias depois do halving**.
- Mostra o alvo semanal (BTC e R$/US$), o total, o que já foi vendido na janela e
  uma fita com o andamento das 10 semanas.
- Validado com preços reais: nos ciclos de 2016, 2020 e 2024 o **topo caiu dentro
  da janela** (média de 62%, 80% e 91% do pico).

## 2.28 · 20/11/2026 — Resultado = investido × hoje

- O hero passou a mostrar **Resultado** como a diferença entre **o que você
  investiu** e **o que tem hoje** (posição), com a linha
  `investi $X · tenho $Y`.
- O selo virou **Sobre o investido** e passou a refletir a posição (antes somava
  o lucro das vendas, o que confundia).

## 2.26 · 18/11/2026 — Meta em dinheiro

- **Quanto falta para a meta também em R$ ou US$**, conforme a moeda escolhida no
  dashboard. Ao lado de `Faltam 0,4162 ₿ para 1,5 ₿` aparece `≈ R$ 41.354,00`.
  Na moeda BTC, só a linha em ₿.
  *Onde:* card **Próxima meta**, no topo.
- O valor em dinheiro usa a mesma cor e o mesmo tamanho do texto da meta.

## 2.25 · 18/11/2026 — Modo bandido repensado

- Resumo em **uma faixa com quatro números**: **BTC declarado** (em destaque),
  **total pago**, **total atual** (valor de mercado hoje) e **PM do BTC**.
  Cada um em US$ com o equivalente em R$ logo abaixo.
- Linha de **valorização do período** (`▲ +6,8% · +$2.829,53`) com destaque em
  verde quando o total atual supera o pago e em vermelho quando fica abaixo.
- **Modo privacidade agora cobre o modo bandido**: todos os valores ficam
  desfocados, rótulos e botões continuam visíveis.
- Colunas do resumo **alinhadas na mesma linha** (rótulo, valor e apoio).
- Saiu o cartão “dólar médio”.

## 2.24 · 18/11/2026 — Planilha padronizada e cotação do dólar na mesa

**Planilha**

- Todas as abas seguem o mesmo padrão visual: **Arial 9**, cabeçalho com fundo
  `#111827` e texto branco, linha congelada, altura 32, **zebra** branco/`#F8FAFC`,
  bordas finas `#E2E8F0` e larguras definidas.
- Abas cobertas: `Aportes`, `Histórico Diário`, `Histórico Mensal`, `Moedas`,
  `IRPF` e `Renda Fixa`.
- **Cada aporte novo ou editado já nasce nesse padrão** (inclusive ajustes de
  caixa e de moedas).

**Dashboard**

- **Movimentações** ganhou a coluna **Dólar** com a cotação USD→BRL do dia da
  operação. No celular ela aparece ao lado do preço: `$99.367,42 /BTC · R$ 5,42`.
- **Modo bandido**: nova coluna **Dólar** em cada linha.
- **Nova movimentação**: ao trocar a moeda entre **USD** e **BRL**, a
  *Cotação do BTC* e o *Valor* são **convertidos na hora**, e os rótulos passam a
  mostrar `(R$)`.

## 2.23 · 18/11/2026 — Coluna `Dólar R$` na aba Aportes

- Nova coluna **I — `Dólar R$`** em `Aportes`, com a cotação do dólar **na data de
  cada aporte** (fonte oficial: PTAX do Banco Central, com reserva no Frankfurter).
- **Preenchimento automático**: todo aporte novo grava a cotação do dia sozinho.
- **Backfill** dos aportes antigos: menu **₿ Satoshi Ledger → Preencher cotação do
  dólar (Aportes)** — só preenche células vazias, nunca sobrescreve.
- Fins de semana e feriados herdam a cotação do último dia útil anterior.

## 2.22 · 18/11/2026 — Painel de notificações

- Ícone de **sino** no topo do dashboard (só no computador) abre o painel.
- **Canais:** Telegram (token e chat id configurados ali) e E-mail.
- **Tipos:** alerta de DCA, resumo semanal, relatório mensal e confirmação de
  aporte — cada um com interruptor próprio.
- **Alerta de DCA só chega se ainda faltar aportar na semana.** Semana concluída,
  sem mensagem.
- Novo **resumo semanal** no Telegram (domingo à noite).

## 2.21 · 16/11/2026 — Régua de medição

- Botão **Régua** na tela cheia dos gráficos **Patrimônio × custo** e
  **BTC × preço médio**: clique no início e no fim para ver **%** e **valor** do
  trecho, como a ferramenta de medir de plataformas de gráfico.
- Funciona no celular com dois toques.
- Gráfico do **ciclo de aportes** sem a linha do PM (que usava outra escala e
  cruzava as linhas de valor).

## 2.20 · 15/11/2026 — Histórico inicial de preços

- Menu **₿ Satoshi Ledger → Carregar histórico de preços (1º uso)**: preenche o
  `Histórico Diário` e o `Histórico Mensal` do **primeiro aporte até hoje**, para
  os gráficos não nascerem vazios.
- Preços de fonte pública (Coinbase, com Kraken de reserva); o que não existir cai
  para o preço dos seus próprios aportes.
- Rotina idempotente: só completa o que falta.

## 2.18 · 15/11/2026 — Bases de custo mais legíveis

- **No PC:** cores refeitas — valor com contraste real, cor concentrada no ponto e
  no traço, “seu preço médio” com selo azul discreto.
- **No celular:** régua com os pontos em escala real e **grade 2×3** com nome,
  valor e variação.
- Quando dois pontos ficam muito próximos, eles **alternam acima/abaixo** da régua
  para não se sobrepor.

## 2.17 · 15/11/2026 — Navegação no celular

- Barra superior com **Atualizar · Privacidade · Tema · Modo bandido**.
- Barra inferior com **Resumo · Performance · DCA · Mensal · Ledger**.

---

## Como atualizar

1. Baixe o `src/` deste repositório.
2. `clasp push` (ou cole os arquivos no editor do Apps Script).
3. Recarregue o dashboard com **Ctrl/Cmd + Shift + R**.

> A planilha não precisa ser recriada: rode `setupProject` uma vez para aplicar o
> padrão visual e criar a coluna `Dólar R$`, depois o menu
> **Preencher cotação do dólar** para completar os aportes antigos.
