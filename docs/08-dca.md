# 8. Como o DCA funciona

DCA (*Dollar Cost Averaging*) é aportar um valor fixo em intervalos regulares,
ignorando o preço. Aqui o DCA é organizado em **ciclos de halving**.

> **Onde está no código**
> - 📄 [`src/Code.gs`](../src/Code.gs) → `var DCA_PLAN` (as três constantes que definem a janela)
> - 📄 [`src/Code.gs`](../src/Code.gs) → `buildAccumulationPlan_()` (calcula cota, caixa e janela)
> - 📄 [`src/Code.gs`](../src/Code.gs) → `cashBuysThisWeekUsd_()` (quanto já foi aportado na semana)
> - 📄 [`src/Code.gs`](../src/Code.gs) → `getWeeklyFixedUsd_()` / `recomputeWeeklyFixed_()` (cota fixa)
> - 📄 [`src/Dashboard.html`](../src/Dashboard.html) → `buildDca()`, `renderDcaPlan()`, `renderDcaChart()`

## O que você pode SUBSTITUIR

Todas as regras do DCA estão em três números, no topo do `Code.gs`:

```js
var DCA_PLAN = Object.freeze({
  START_DAYS_BEFORE_HALVING: 725,   // início da janela
  END_DAYS_BEFORE_HALVING: 500,     // fim da janela
  SPECIAL_PCT: 0.20                 // 20% do caixa vai para o caixa especial
});
```

| Constante | Efeito de mudar |
|---|---|
| `START_DAYS_BEFORE_HALVING` | antecipa/atrasa o começo do ciclo (janela maior = cota menor) |
| `END_DAYS_BEFORE_HALVING` | antecipa/atrasa o fim do ciclo |
| `SPECIAL_PCT` | quanto do caixa fica reservado para oportunidade |

Depois de mudar, salve, rode `setupProject` e recarregue o dashboard.


## A janela do ciclo

```
        início                                          fim
halving − 725 dias  ──────────────────────  halving − 500 dias
        (23/04/2026)                            (04/12/2026)
        └────────────── 225 dias = 32 semanas ──────────────┘
```

- O ciclo **começa** 725 dias antes do próximo halving.
- O ciclo **termina** 500 dias antes do próximo halving.
- Duração: **32 semanas** (pouco mais de 7 meses).

A data do halving é estimada pela altura do bloco (fonte pública gratuita), então
ela pode andar alguns dias — e a janela anda junto.

## A cota da semana

```
cota da semana = caixa normal ÷ semanas restantes
```

- **Caixa normal** = caixa total − caixa especial.
- O valor é **fixo** durante o ciclo: não muda quando o preço cai ou sobe.
- Se você aportar menos que a cota, a semana fica “em aberto”.
- A semana vai de **domingo a sábado**.

O card mostra:

| Campo | Significado |
|---|---|
| **Aporte da semana** | quanto falta para fechar a semana |
| **Semana concluída** | você já aportou a cota; volta ao valor cheio no domingo |
| **No ciclo** | aportado → valor atual, com a variação |
| **BTC no ciclo** | quantidade comprada desde o início da janela |
| **PM do ciclo** | preço médio dessas compras |
| **Caixa especial** | reserva fora do DCA |

## Caixa especial

Uma parte do caixa separada para **oportunidades** (padrão 20%):

- não entra na cota semanal;
- compras com origem `Especial` consomem esse caixa;
- você define o percentual (ou um valor fixo) no próprio card.

## O gráfico do ciclo

Três linhas e uma faixa:

| Elemento | O que é |
|---|---|
| **Aportado** (violeta tracejado) | quanto você já colocou no ciclo |
| **Valor atual** (âmbar) | quanto vale hoje o BTC comprado no ciclo |
| **PM do ciclo** (ciano) | preço médio das compras do ciclo |
| **Faixa verde/vermelha** | verde onde o valor está acima do aportado; vermelho onde está abaixo |

Passando o mouse em qualquer ponto, aparecem os três valores do dia.

## Quando o ciclo termina

- Passados **7 dias do fim da janela**, o card esconde “aporte da semana” e
  “caixa especial” e passa a mostrar só o resumo do ciclo.
- O ciclo continua visível até um novo ciclo começar (quando o próximo halving
  entrar na janela de 725 dias) — aí a contagem reinicia.

## Exemplo prático

```
Caixa normal:  R$ 12.000
Semanas restantes: 30
Cota da semana: 12.000 ÷ 30 = R$ 400
```

Se você aportar R$ 400, a semana fecha. Se aportar R$ 250, faltam R$ 150. Se você
vender BTC e o dinheiro cair no caixa, a cota das próximas semanas **sobe** (mais
caixa ÷ menos semanas).

## Perguntas frequentes

**A cota muda se o BTC cair?** Não. É fixa por definição.

**Posso aportar mais que a cota?** Sim — o excedente entra no ciclo normalmente.

**Comprar com o caixa conta como aporte?** Conta para a cota (origem `Caixa`),
mas não é dinheiro novo.

**E a compra especial?** Não conta para a cota; consome o caixa especial.

---

## DCA de venda (saída planejada)

O DCA de compra acumula; o **DCA de venda** planeja a saída.

**A regra:** vender **20% da posição**, diluído em **10 semanas** (uma venda por
semana), na janela de **480 a 550 dias depois do halving**.

### Por que essa janela

O topo dos últimos ciclos aconteceu **dentro** dela:

| Ciclo | Janela (480→550 dias) | Preço médio na janela | Topo do ciclo | Média ÷ topo |
|---|---|---|---|---|
| 2016 | 01/11/2017 → 10/01/2018 | $12.116 | $19.650 (16/12/17) | 62% |
| 2020 | 03/09/2021 → 12/11/2021 | $54.060 | $67.555 (08/11/21) | 80% |
| 2024 | 13/08/2025 → 22/10/2025 | $114.028 | $124.720 (06/10/25) | 91% |

Nos três ciclos o **pico caiu dentro da janela**. Vender diluído capturou mais do
que uma venda única no 500º dia (que pegaria $8.109 / $44.898 / $111.248).

> O ciclo de 2013 é a exceção: o topo veio 371 dias após o halving, antes da
> janela. Como em qualquer padrão com 3 amostras, não é garantia.

### O que o card mostra

- **Vender nesta semana** — a quantidade de BTC da semana e o valor em R$/US$
- **Total a vender** — 20% da posição
- **Já vendido na janela** — soma das vendas registradas dentro do período
- **Janela** e **semanas** (a começar / em andamento / encerradas)
- Uma fita de 10 marcas mostrando o andamento

Quando a janela ainda não começou, o card já mostra o **alvo semanal** para você
planejar. Quando termina, mostra quanto foi vendido.
