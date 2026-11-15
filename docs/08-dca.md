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
