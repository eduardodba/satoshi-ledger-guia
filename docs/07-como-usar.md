# 7. Como usar no dia a dia

## Onde está no código

| Ação no dashboard | Arquivo | Função |
|---|---|---|
| Salvar nova movimentação | [`src/Code.gs`](../src/Code.gs) | `saveContribution_()` / `addContribution()` |
| Editar movimentação | [`src/Code.gs`](../src/Code.gs) | `updateContribution()` |
| Excluir movimentação | [`src/Code.gs`](../src/Code.gs) | `deleteContribution()` |
| Ajuste de caixa | [`src/Code.gs`](../src/Code.gs) | `adjustCash()` |
| Ajuste de BTC | [`src/Code.gs`](../src/Code.gs) | `adjustCoin()` |
| Cálculo de posição e preço médio | [`src/Code.gs`](../src/Code.gs) | `calculatePosition_()` |

> A quantidade (`Qtd`) é calculada por `saveContribution_()` como
> `valor ÷ preço`. Se você editar a planilha na mão, é você quem precisa manter
> essa relação — veja a regra de ouro em [`01-planilha.md`](01-planilha.md).

## Fluxo básico
## Fluxo básico

1. **Comprou BTC?** Abra o dashboard → **+ Movimentação** → preencha → Salvar.
2. **Vendeu?** Mesmo caminho, escolhendo “Venda”.
3. **Recebeu sats de taxa/poeira?** Use **Ajuste de BTC** (não é compra).
4. **O caixa não bate?** Use **Ajuste de caixa** (não é compra).

O dashboard recalcula tudo sozinho ao salvar.

## Os campos do formulário

| Campo | Explicação |
|---|---|
| **Data** | dia da operação (não o dia em que você cadastrou) |
| **Tipo** | Compra ou Venda |
| **Moeda informada** | em que moeda você digitou o preço/valor (`USD` ou `BRL`) |
| **Preço** | quanto custou **1 BTC** naquele momento |
| **Valor** | quanto você pagou/recebeu **no total** |
| **Quantidade** | calculada automaticamente (`valor ÷ preço`) |
| **Investidor** | quem fez o aporte (útil se mais de uma pessoa usa a mesma carteira) |
| **Origem** | de onde saiu o dinheiro (veja abaixo) |

## Moeda, cotação e a coluna Dólar

- No formulário, trocar entre **USD** e **BRL** converte a *Cotação do BTC* e o
  *Valor da movimentação* na hora; o rótulo passa a mostrar `(R$)`.
- A tabela de **Movimentações** tem uma coluna **Dólar** com a cotação USD→BRL do
  dia de cada operação. No celular ela aparece junto do preço: `$99.367,42 /BTC · R$ 5,42`.
- No **modo bandido**, o resumo mostra quatro números: **BTC declarado**,
  **total pago**, **total atual** (valor de mercado das mesmas moedas) e **PM do
  BTC** — cada um em US$ e com o equivalente em R$. Abaixo, a valorização do
  período. Cada linha da tabela mostra a cotação do dólar do dia.

## Origem: escolhendo certo

| Situação | Origem |
|---|---|
| Dinheiro novo, vindo do seu salário/banco | `Novo` |
| Você vendeu BTC antes e está usando esse saldo | `Caixa` |
| Oportunidade pontual, com a reserva especial | `Especial` |
| Só corrigindo o caixa (sem comprar BTC) | `Ajuste` |
| Só corrigindo a quantidade de BTC | `Ajuste BTC` |

Escolher errado não “quebra” a carteira, mas distorce o DCA: `Caixa` conta na
cota semanal; `Especial` não conta.

## Régua de medição (gráficos ampliados)

Nos gráficos **Patrimônio × custo** e **BTC × preço médio**, quando você abre em
tela cheia (duplo clique), aparece o botão **Régua** no topo:

1. Clique em **Régua** (o botão fica azul).
2. Clique no **ponto inicial** e depois no **ponto final** do trecho.
3. Aparece uma caixa com o período, a **variação em %** e a diferença em valor.

- Um novo clique recomeça a medição.
- Fechar a tela cheia desliga a régua.
- No celular, use dois toques (o gráfico aparece girado em paisagem).
- Enquanto a régua está ativa, o tooltip do gráfico fica desligado para não
  sobrepor a caixa de medição.

> No gráfico de **patrimônio**, a variação em % inclui os aportes do período — é a
> variação do patrimônio, não a rentabilidade. Para rentabilidade, use o mapa de
> calor mensal.

## Entendendo os números do topo

| Número | O que é |
|---|---|
| **Patrimônio** | quantidade de BTC × preço de agora |
| **Aportado** | soma de tudo que você colocou (compras − vendas) |
| **Lucro** | patrimônio − custo do que você ainda tem |
| **Preço médio** | custo ÷ quantidade (não muda quando você vende) |
| **Caixa** | dinheiro parado na carteira, vindo de vendas |

> O preço médio é **ponderado**: comprar mais barato derruba a média; comprar
> caro sobe. Vender **não** altera o preço médio — só reduz a quantidade e o
> custo na mesma proporção.

## Editando e excluindo

Na seção **Movimentações**:

- **✎** abre a movimentação para edição.
- **🗑** exclui (pede confirmação).
- O filtro por período (7D, 30D, 6M, 1A, Tudo) e por operação ajuda a achar.

Ao editar a data, o app reordena os registros e recalcula tudo.

## Conferindo se está tudo certo

Uma checagem simples, de vez em quando:

```
Qtd  ≈  Aporte $ ÷ Cotação $
```

Se alguma linha não fechar, o preço médio fica levemente errado. O dashboard
permite corrigir pela edição.

## Filtros e visões

- **Período** (7D/30D/6M/1A/Tudo) muda os gráficos.
- **Moeda** (BRL/USD) converte os valores; a quantidade em BTC não muda.
- **Investidor** filtra por pessoa, quando há mais de uma.

## Privacidade

- O botão de **olho** embaralha os valores na tela (útil para mostrar o
  dashboard sem expor números).
- O dashboard é publicado como “Somente eu” — ninguém mais acessa pela URL.

## Rotina sugerida

| Frequência | Tarefa |
|---|---|
| a cada operação | registrar |
| semanal | conferir o card do DCA |
| mensal | olhar o mapa de calor e o resumo |
| trimestral | **Backup + reconstruir históricos** |
