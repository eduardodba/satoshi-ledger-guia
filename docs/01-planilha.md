# 1. A planilha: abas, colunas e o que é automático

A planilha é o **banco de dados** do projeto. Tudo que o dashboard mostra vem
dela. Existem 5 abas, mas você só mexe em **uma**.

> **Onde está no código**
> - 📄 [`src/Code.gs`](../src/Code.gs) → `var APP` (bloco `SHEETS` e `HEADERS`)
> - 📄 [`src/Code.gs`](../src/Code.gs) → `setupProject()` (cria as abas e formata)
> - 📄 [`src/Code.gs`](../src/Code.gs) → `var CONTRIBUTION_ORIGIN` (as origens válidas)
>
> **Atalho:** você **não precisa criar as abas à mão**. Se rodar `setupProject`
> com a planilha vazia, ele cria as 4 abas com os cabeçalhos corretos. A tabela
> abaixo serve para conferir (ou para recriar manualmente).


| Aba | Quem escreve | Para que serve |
|---|---|---|
| `Aportes` | **você** (ou o dashboard) | cada compra, venda ou ajuste |
| `Histórico Diário` | automático | foto do patrimônio a cada dia |
| `Histórico Mensal` | automático | resumo por mês |
| `Moedas` | automático | cotações (BTC/USD, USD/BRL) |
| `IRPF` | automático | cópia do que você marcou para declarar |

> Não renomeie as abas. O código procura por esses nomes exatos.

---

## Aba `Aportes` — a única que você preenche

| Coluna | Nome | O que colocar |
|---|---|---|
| A | `Aporte` | data da operação (`15/01/2025`) |
| B | `Token` | sempre `BTC` |
| C | `Aporte $` | valor em **dólar**. Positivo = compra, negativo = venda |
| D | `Cotação $` | preço de 1 BTC em dólar no momento da operação |
| E | `Cotação R$` | preço de 1 BTC em reais (opcional, usado para o PM em R$) |
| F | `Qtd` | quantidade de BTC. Positiva = compra, negativa = venda |
| G | `Investidor` | nome/apelido de quem aportou (ex.: `Principal`) |
| H | `Origem` | `Novo`, `Caixa`, `Especial`, `Ajuste` ou `Ajuste BTC` |
| I | `Dólar R$` | cotação do dólar (USD→BRL) **na data do aporte** — o app preenche sozinho |

### Coluna I — Dólar R$ (automática)

A coluna I guarda **quanto estava o dólar no dia de cada aporte** (cotação de
venda, PTAX do Banco Central). Você não precisa digitar nada:

- **aportes novos** — o app busca a cotação da data e grava na linha;
- **aportes antigos** — menu **₿ Satoshi Ledger → Preencher cotação do dólar
  (Aportes)** preenche só as células vazias;
- fins de semana e feriados usam a cotação do último dia útil anterior.

Serve para saber quanto o aporte custou em reais **na época** (e conferir a
declaração), sem depender do dólar de hoje.

### Regra de ouro

```
Qtd  =  Aporte $  ÷  Cotação $
```

Se você cadastra pelo dashboard, ele calcula sozinho. Só cuide disso se editar a
planilha na mão — uma linha com valores que não “fecham” distorce o preço médio.

### Exemplos

**Compra de $500 a $95.000:**
```
Aporte     Token  Aporte $  Cotação $  Cotação R$  Qtd          Investidor  Origem  Dólar R$
15/01/2025 BTC    500       95000      515000     0,00526316   Principal   Novo    5,3791
```

**Venda de $1.000 a $110.000:**
```
10/06/2025 BTC    -1000     110000     0          -0,00909091  Principal   Novo
```

**Ajuste de caixa** (não é compra — só corrige o saldo):
```
20/06/2025 BTC    250       0          0          0            Principal   Ajuste
```

**Ajuste de BTC** (sats perdidos em taxa; não mexe no caixa nem no custo):
```
21/06/2025 BTC    0         0          0          -0,00001234  Principal   Ajuste BTC
```

### Origens em detalhe

| Origem | Conta como compra? | Entra no caixa? | Conta na cota do DCA? |
|---|---|---|---|
| `Novo` | sim | não | sim |
| `Caixa` | sim | **sai** do caixa | sim |
| `Especial` | sim | **sai** do caixa | **não** |
| `Ajuste` | não | sim (corrige) | não |
| `Ajuste BTC` | não | não | não |

---

## Aba `Histórico Diário` — gerada sozinha

| Coluna | O que é |
|---|---|
| `Data` | dia do snapshot |
| `Saldo USD` | quantidade de BTC × preço do dia, em dólar |
| `Saldo R$` | o mesmo em reais |
| `QTD BTC` | quantidade acumulada naquele dia |
| `PM BTC` | preço médio acumulado naquele dia |
| `COTAÇÃO BTC` | preço do BTC naquele dia |

> A coluna `COTAÇÃO BTC` alimenta os gráficos e a média de 200 semanas. Não edite.

---

## Aba `Histórico Mensal` — gerada sozinha

Um resumo por mês (saldo no primeiro e no último dia, e o fluxo de aportes).
Serve para o mapa de calor da rentabilidade mensal.

---

## Aba `Moedas` — gerada sozinha

Guarda as cotações usadas: `BTC` (em USD e BRL) e `USD` (em BRL). É daqui que o
dashboard lê o preço quando está sem internet para as APIs.

---

## Aba `IRPF` — gerada sozinha

Cópia, no formato da aba `Aportes`, das compras que você marcou como
“Reportar para a Receita”. Detalhes em [`09-modo-fiscal.md`](09-modo-fiscal.md).

---

## Dicas de formatação

- Datas: use o formato que o Sheets reconhece (`15/01/2025` ou `2025-01-15`).
- Números: **não** use separador de milhar com ponto na mesma célula de decimal
  em formato americano. O ideal é digitar só números (`95000`, `0.00526316`) e
  deixar a formatação para o Sheets.
- Não deixe linhas em branco no meio da aba `Aportes` — o código lê até a última
  linha preenchida.

---

## Checklist desta etapa

- [ ] 4 abas criadas com os cabeçalhos exatos
- [ ] nenhuma linha preenchida em `Histórico Diário`/`Mensal`/`Moedas`
- [ ] pronto para colar o código (próximo passo)
