/**
 * Fórmula custom COTACAO(symbol) para usar em células da planilha.
 *
 * IMPORTANTE (performance / cota de UrlFetch):
 * Fórmulas custom são recalculadas com frequência pelo Sheets. Se cada célula
 * com =COTACAO(...) fizer uma chamada de rede, estoura a cota de UrlFetch e deixa
 * a planilha lenta. Por isso esta função usa CACHE (CacheService), compartilhado
 * entre recálculos, com TTL curto. Em caso de falha, devolve o último valor em
 * cache; se não houver, devolve um ERRO de célula (#N/A) em vez da string "Erro"
 * — assim fórmulas que dependem do número não quebram silenciosamente com texto.
 *
 * Recomendação de uso: mantenha UMA célula com =COTACAO("BTC") e referencie essa
 * célula nas demais, em vez de espalhar a fórmula por muitas células.
 */
function COTACAO(symbol) {
  var sym = String(symbol || 'BTC').toUpperCase().trim();
  var cache = CacheService.getScriptCache();
  var cacheKey = 'cotacao_' + sym;

  var cached = cache.get(cacheKey);
  if (cached !== null) return Number(cached);

  try {
    var response = UrlFetchApp.fetch(
      'https://api.coinbase.com/v2/prices/' + encodeURIComponent(sym) + '-USD/spot',
      { muteHttpExceptions: true }
    );
    if (response.getResponseCode() !== 200) throw new Error('HTTP ' + response.getResponseCode());

    var data = JSON.parse(response.getContentText());
    var amount = Number(data && data.data && data.data.amount);
    if (!isFinite(amount) || amount <= 0) throw new Error('Cotação inválida');

    // Cache de 60s para recálculos imediatos + 6h como "último conhecido" (fallback).
    cache.put(cacheKey, String(amount), 60);
    cache.put(cacheKey + '_last', String(amount), 21600);
    return amount;
  } catch (e) {
    // Fallback: último valor conhecido (TTL maior), para não devolver erro numa
    // oscilação momentânea da API.
    var lastKnown = cache.get(cacheKey + '_last');
    if (lastKnown !== null) return Number(lastKnown);
    // Sem valor algum: devolve erro de célula (#N/A), não a string "Erro".
    throw new Error('Cotação indisponível para ' + sym);
  }
}

/** Teste manual no editor (não é fórmula de planilha). */
function testeCoinbase() {
  var response = UrlFetchApp.fetch('https://api.coinbase.com/v2/prices/BTC-USD/spot', { muteHttpExceptions: true });
  var data = JSON.parse(response.getContentText());
  console.log(data);
  return Number(data.data.amount);
}
