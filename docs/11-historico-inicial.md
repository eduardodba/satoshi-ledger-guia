# 11. Histórico inicial — deixar os gráficos completos no primeiro uso

> **Onde está no código**
> - 📄 [`src/Code.gs`](../src/Code.gs) → `preencherHistoricoDiario()` (o que o menu chama)
> - 📄 [`src/Code.gs`](../src/Code.gs) → `preencherHistoricoDiario_(dryRun)` (a rotina)
> - 📄 [`src/Code.gs`](../src/Code.gs) → `buscarFechamentosDiarios_()` (busca os preços)
> - 📄 [`src/Code.gs`](../src/Code.gs) → `testarPreenchimentoHistorico()` (simulação, não grava)

---

## O problema que isso resolve

Você cadastrou seus aportes na aba `Aportes`, tudo certo — mas as abas
**`Histórico Diário`** e **`Histórico Mensal`** estão vazias, e por isso:

- o gráfico **“Crescimento com contexto”** (patrimônio × custo) fica vazio;
- o gráfico **“BTC × preço médio”** fica vazio;
- o mapa de calor **“Rentabilidade mensal”** fica vazio.

**Por quê?** O histórico é montado **um dia por vez**, pelo gatilho diário. Quem
acabou de instalar só tem o dia de hoje — não existe “passado” para desenhar.

## A solução: preencher o passado de uma vez

Existe uma rotina que **completa todas as datas faltantes**, do **primeiro
aporte até hoje**, buscando o fechamento diário do BTC em uma fonte pública
gratuita.

### Como rodar (uma vez)

1. Abra a planilha.
2. Menu **₿ Satoshi Ledger → Carregar histórico de preços (1º uso)**.
3. Aguarde de 5 a 20 segundos (depende de quantos anos de histórico).
4. Vai aparecer um aviso: *“N dia(s) adicionado(s) ao Histórico Diário e resumo
   mensal recalculado”*.

Pronto. Volte ao dashboard e atualize: os três gráficos aparecem completos.

### Antes de rodar (opcional): simular

No editor do Apps Script, rode a função **`testarPreenchimentoHistorico`**.
Ela calcula tudo e **não escreve nada** — só registra no log quantos dias seriam
adicionados, a primeira e a última data.

---

## O que a rotina faz (e o que não faz)

| Faz | Não faz |
|---|---|
| adiciona as datas **que faltam** | não sobrescreve linha existente |
| grava data, valor em USD e BRL, quantidade, PM e cotação | não mexe na aba `Aportes` |
| recalcula a aba `Histórico Mensal` | não apaga histórico antigo |
| pode ser rodada de novo (só completa o que falta) | não altera preço médio nem caixa |

É **idempotente**: rodar duas vezes não duplica nada.

---

## De onde vêm os preços

| Ordem | Fonte | Observação |
|---|---|---|
| 1 | **Coinbase Exchange** | candles diários, 300 por chamada — cobre ~5 anos em 6 chamadas |
| 2 | **Kraken** | reserva, 720 candles por chamada |
| 3 | **seus próprios aportes** | se as duas falharem, usa o preço de cada compra e mantém o último valor conhecido |

> A Binance **não** é usada: ela responde `451` (bloqueio regional) a partir dos
> servidores do Google, então a chamada falharia sempre.

O preço usado é o **fechamento** do dia (00:00 UTC). É o mesmo tipo de número que
a coluna `COTAÇÃO BTC` da sua planilha guarda.

---

## Qual período tem histórico

O guia usa como referência a série que começa em **18/02/2022**:

```
18/02/2022  $40.210,00   ← primeira data com preço de referência
19/02/2022  $40.210,00
20/02/2022  $38.383,00
...
14/11/2026  $64.049,17   ← exemplo de fechamento recente
```

Regras práticas:

- **Primeiro aporte depois de 18/02/2022** → o histórico cobre tudo, do aporte
  até hoje.
- **Primeiro aporte antes de 18/02/2022** → o app tenta buscar mesmo assim
  (a fonte tem dados desde 2015), mas se não houver preço para aquela data o
  gráfico **começa na primeira data com preço disponível**. Ou seja: os dias
  anteriores ao primeiro preço obtido **não aparecem** no gráfico — é esperado.
- **Aportes com data futura** são ignorados no preenchimento.

---

## Como conferir se deu certo

1. Aba `Histórico Diário`: deve ter **uma linha por dia**, da data do primeiro
   aporte até hoje, com as 6 colunas preenchidas.
2. Aba `Histórico Mensal`: deve ter **uma linha por mês**.
3. No dashboard:
   - **Crescimento com contexto** → as duas linhas (patrimônio e custo) aparecem;
   - **BTC × preço médio** → a linha do BTC e o PM aparecem;
   - **Rentabilidade mensal** → o mapa de calor ganha os 12 meses.

> Se o gráfico começar “no meio”, confira a data do seu **primeiro aporte** na
> aba `Aportes`. O histórico começa nela.

---

## Problemas comuns

| Sintoma | Causa | Solução |
|---|---|---|
| “Cadastre pelo menos um aporte antes…” | aba `Aportes` vazia | cadastre uma compra |
| “O histórico já está completo” | todas as datas já existem | nada a fazer |
| “Não foi possível obter preços” | as duas fontes falharam | rode de novo em alguns minutos |
| Adicionou poucos dias | a maior parte das datas já existia | normal |
| Gráfico ainda vazio depois | cache do navegador | recarregue a página (Ctrl/Cmd + Shift + R) |

### Rodou e quer desfazer?

Como a rotina só **adiciona**, desfazer é apagar as linhas extras na aba
`Histórico Diário` — ou restaurar pelo menu
**₿ Satoshi Ledger → Backup + reconstruir históricos** (que faz uma cópia antes).

---

## Resumo em uma frase

Se os gráficos estão vazios porque a planilha é nova, rode
**₿ Satoshi Ledger → Carregar histórico de preços (1º uso)** uma vez: ele
preenche o passado do primeiro aporte até hoje e libera todas as visualizações.
