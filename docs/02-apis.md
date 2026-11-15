# 2. APIs usadas (todas gratuitas, sem chave)

O dashboard precisa de três coisas da internet: **preço do BTC**, **preço do
dólar** e alguns **dados on-chain**. Todas as fontes abaixo são públicas e
gratuitas, e **nenhuma exige cadastro ou chave** — com uma exceção: o Telegram,
que precisa de um token que *você* cria (veja [`06-telegram.md`](06-telegram.md)).

| Serviço | Para que | Precisa de chave? | Limite |
|---|---|---|---|
| Coinbase | preço do BTC em USD | não | ~10 req/min (o app usa cache de 5 min) |
| Coinbase | cotação USD → BRL | não | idem |
| mempool.space | altura do bloco, taxas, hashrate | não | generoso |
| blockchain.info | altura do bloco (fallback) | não | generoso |
| bitcoin-data.com | realized price, STH, LTH, MVRV | não | moderado (cache de 6 h) |
| Telegram | enviar alertas | **sim** (token do seu bot) | ~30 msg/s |

## Onde está no código

| Assunto | Arquivo | Função |
|---|---|---|
| Preço do BTC e do dólar | [`src/Code.gs`](../src/Code.gs) | `getMarketSnapshot_()` |
| Altura do bloco / halving | [`src/Code.gs`](../src/Code.gs) | `fetchLiveHalvingData_()`, `fetchHalvingBlockchainInfo_()`, `fetchHalvingMempool_()`, `montarProjecaoHalving_()` |
| Dados on-chain (realized, STH, LTH, MVRV) | [`src/Code.gs`](../src/Code.gs) | `getOnChainSnapshot_()`, `getCachedOnChainSnapshot_()` |
| Envio ao Telegram | [`src/Code.gs`](../src/Code.gs) | `telegramSendMessage_()` |

> Para **substituir** uma fonte, edite só a função correspondente. Mantenha o
> cache (`APP.CACHE`) e o `try/catch` com fallback, senão o dashboard fica sem
> número quando a API falha.

## Como o app se protege de falhas

Cada chamada tem **cache** e **fallback**:

- preço: 5 minutos de cache; se a API falhar, usa a última cotação da aba `Moedas`
- on-chain: 6 horas de cache (esses dados mudam devagar)
- halving: 15 minutos; se a fonte principal falhar, tenta a secundária e, por
  último, um cálculo determinístico pela âncora do último halving

Ou seja: se uma fonte cair, o dashboard continua abrindo com o último valor
conhecido.

## Preço do BTC (Coinbase)

```
GET https://api.coinbase.com/v2/prices/BTC-USD/spot
→ { "data": { "amount": "99367.42", "currency": "USD" } }
```

Teste no navegador: cole a URL acima e veja o JSON. Se abrir, a fonte está ok.

## Dólar (Coinbase)

```
GET https://api.coinbase.com/v2/exchange-rates?currency=USD
→ { "data": { "rates": { "BRL": "5.42", ... } } }
```

## Altura do bloco (mempool.space / blockchain.info)

```
GET https://mempool.space/api/blocks/tip/height   → 975717
GET https://blockchain.info/latestblock          → JSON com height e time
```

A altura serve para estimar a data do próximo halving:

```
bloco do halving = (altura ÷ 210000 + 1) × 210000      → 1.050.000
data estimada    = agora + (blocos restantes × minutos por bloco)
```

O app mede o **ritmo real** de blocos desde o último halving (bloco 840.000) em
vez de assumir 10 minutos — por isso a data pode variar alguns dias.

## On-chain (bitcoin-data.com)

```
GET https://bitcoin-data.com/v1/realized-price/last
GET https://bitcoin-data.com/v1/sth-realized-price/last
GET https://bitcoin-data.com/v1/lth-realized-price/last
GET https://bitcoin-data.com/v1/mvrv/last
```

Esses valores aparecem na régua “Onde o preço está nas bases de custo”. Se a API
não responder, a régua mostra só o seu preço médio, o PM de 200 semanas e o spot
— o dashboard continua funcionando.

## E se eu quiser trocar a fonte de preço?

No arquivo `Code.gs`, procure por `coinbase` (função `getMarketSnapshot_`).
Qualquer API que devolva o preço em JSON serve — basta ajustar a URL e o caminho
do número. Mantenha o cache para não estourar limites.

---

## Resumo prático

Você **não precisa criar nada** para as APIs de preço e on-chain: elas já
funcionam sem cadastro. A única coisa que você cria é o **bot do Telegram**, e
somente se quiser receber alertas.
