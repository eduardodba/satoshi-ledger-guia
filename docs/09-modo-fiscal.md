# 9. Modo fiscal (controle para a Receita)

O projeto tem um “caderno separado” para o que você pretende declarar. Ele é
**independente**: nada do que você faz ali altera saldo, preço médio da carteira
ou patrimônio.

> **Onde está no código**
> - 📄 [`src/Code.gs`](../src/Code.gs) → `setIrpfFlag()` (marca/desmarca uma compra do ledger)
> - 📄 [`src/Code.gs`](../src/Code.gs) → `setIrpfOverride()` / `removeIrpfOverride()` (edita preço/quantidade no painel)
> - 📄 [`src/Code.gs`](../src/Code.gs) → `setIrpfHidden()` / `limparIrpfHidden()` (esconde sem apagar)
> - 📄 [`src/Code.gs`](../src/Code.gs) → `setIrpfPm()` (preço médio declarado manualmente)
> - 📄 [`src/Code.gs`](../src/Code.gs) → `saveIrpfExtra()` / `removeIrpfExtra()` (compras só do caderno fiscal)
> - 📄 [`src/Code.gs`](../src/Code.gs) → `rebuildIrpfSheet_()` (regenera a aba `IRPF`)
> - 📄 [`src/Dashboard.html`](../src/Dashboard.html) → `irpfItems()`, `renderBandit()`
>
> Os dados ficam em **Propriedades do script**: `IRPF_FLAG`, `IRPF_ITEMS`,
> `IRPF_HIDDEN`, `IRPF_EXTRA`, `IRPF_PM`. Não edite a aba `IRPF` à mão: ela é
> sobrescrita por `rebuildIrpfSheet_()`.


## Como abrir

No dashboard, clique no ícone de **máscara** (ao lado do tema). Abre o **painel
fiscal**.

## Duas formas de incluir uma compra

**1. Marcar uma compra que já existe**
Na seção Movimentações, ao editar uma compra, marque **“Reportar para a
Receita”**. Ela passa a aparecer no painel fiscal **e continua** na carteira
(é a mesma compra).

**2. Cadastrar uma compra só do caderno fiscal**
No painel, **+ Nova compra** — informe cotação do BTC (US$) e quantidade. Ela
**nunca** entra na carteira.

## O que o painel mostra

| Campo | Significado |
|---|---|
| **Preço médio fiscal** | média ponderada das compras marcadas |
| **Quantidade** | soma das quantidades declaradas |
| **Total** | Σ (preço × quantidade) |
| **Preço médio declarado** | valor manual, se você quiser fixar outro |

O preço médio declarado manualmente tem prioridade sobre o calculado.

## A aba `IRPF`

O projeto cria (e mantém atualizada) uma aba chamada `IRPF` com **o mesmo formato
da aba `Aportes`** — só com as compras marcadas. Serve para copiar/colar no seu
controle ou entregar ao contador.

Ela é reconstruída sempre que você marca/desmarca algo ou edita um item do
painel. Não edite essa aba à mão: ela é sobrescrita.

## O que NÃO acontece

- o modo fiscal **não** muda o saldo de BTC
- **não** muda o preço médio da carteira
- **não** muda o caixa
- **não** aparece nos gráficos

É um controle paralelo, por desenho.

## Boas práticas

1. Marque apenas o que você realmente vai declarar.
2. Confira o preço médio fiscal contra os informes da corretora.
3. Guarde os comprovantes das compras.
4. Refaça a conferência a cada ano-calendário.

> Este documento explica a **ferramenta**, não a legislação. Regras fiscais
> mudam por país e por ano — confirme com um contador.
