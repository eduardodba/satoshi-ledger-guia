// ============================================================
// RESUMO MENSAL + GRÁFICOS (IMAGENS) VIA TELEGRAM
// ============================================================

// Os segredos NÃO ficam no código. São lidos das Script Properties do projeto
// (mesmas chaves usadas pelo Code.js): TELEGRAM_TOKEN e TELEGRAM_CHAT_ID.
// Configure pelo painel de Integrações do dashboard ou em
// Configurações do projeto > Propriedades do script.
var CONFIG = (function () {
  var props = PropertiesService.getScriptProperties();
  return {
    get TELEGRAM_TOKEN() {
      var token = props.getProperty('TELEGRAM_TOKEN');
      if (!token) throw new Error('TELEGRAM_TOKEN não configurado nas Script Properties.');
      return token;
    },
    get AUTHORIZED_CHAT_ID() {
      var chatId = props.getProperty('TELEGRAM_CHAT_ID');
      if (!chatId) throw new Error('TELEGRAM_CHAT_ID não configurado nas Script Properties.');
      return chatId;
    }
  };
})();

/**
 * FUNÇÃO PRINCIPAL: envia resumo textual + gráficos
 */
function enviarResumoMensalTelegram() {
  enviarTextoResumo();
  Utilities.sleep(800);
  enviarGraficoPatrimonio();
  Utilities.sleep(800);
  enviarGraficoPrecoETransacoes();
}

// ============================================================
// RESUMO TEXTUAL (idêntico ao original)
// ============================================================
function enviarTextoResumo() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var dash = ss.getSheetByName("Dashboard");
    var mensal = ss.getSheetByName("Histórico Mensal");

    if (!dash || !mensal) {
      throw new Error("Planilha Dashboard ou Histórico Mensal não encontrada.");
    }

    var saldoUSD = dash.getRange("C13").getValue() || 0;
    var saldoBRL = dash.getRange("D13").getValue() || 0;
    var aporteTotal = dash.getRange("C12").getValue() || 1;
    var lucroUSD = dash.getRange("C14").getValue() || 0;
    var precoMedio = dash.getRange("C15").getValue() || 0;
    var qtdBTC = dash.getRange("Z2").getValue() || 0;
    var lucroPercent = (lucroUSD / aporteTotal) * 100;

    var lastRow = mensal.getLastRow();
    if (lastRow < 2) throw new Error("Aba Histórico Mensal está vazia.");

    var mesRef = mensal.getRange(lastRow, 1).getValue();
    var saldoInicio = mensal.getRange(lastRow, 2).getValue() || 0;
    var saldoFim = mensal.getRange(lastRow, 3).getValue() || 0;
    var evolucaoMes = saldoFim - saldoInicio;
    var evolucaoPercent = saldoInicio !== 0 ? (evolucaoMes / saldoInicio) * 100 : 0;

    function formatar(v, simbolo) {
      return simbolo + " " + Number(v).toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2});
    }

    var msg = "<b>📊 RELATÓRIO MENSAL CRIPTO</b>\n";
    msg += "📅 <i>Período: " + mesRef + "</i>\n\n";
    msg += "<b>💰 PATRIMÔNIO ATUAL</b>\n";
    msg += "• <b>USD:</b> <code>" + formatar(saldoUSD, "$") + "</code>\n";
    msg += "• <b>BRL:</b> <code>" + formatar(saldoBRL, "R$") + "</code>\n";
    msg += "• <b>Lucro Total:</b> <code>" + (lucroUSD >= 0 ? "+" : "") + formatar(lucroUSD, "$") + " (" + lucroPercent.toFixed(2) + "%)</code>\n\n";
    msg += "<b>📈 PERFORMANCE DO MÊS</b>\n";
    msg += "• <b>Variação:</b> <code>" + (evolucaoMes >= 0 ? "+" : "") + formatar(evolucaoMes, "$") + " (" + evolucaoPercent.toFixed(2) + "%)</code>\n\n";
    msg += "<b>₿ POSIÇÃO EM BTC</b>\n";
    msg += "• <b>Total:</b> <code>" + qtdBTC.toFixed(8) + " BTC</code>\n";
    msg += "• <b>PM:</b> <code>" + formatar(precoMedio, "$") + "</code>\n\n";
    msg += "✨ <i>Enviado por Carteira Cripto Bot</i>";

    enviarParaTelegram(msg);
  } catch (e) {
    Logger.log("Erro: " + e.message);
    enviarParaTelegram("⚠️ <b>Erro no Script:</b> " + e.message);
  }
}

// ============================================================
// GRÁFICO 1: EVOLUÇÃO DO PATRIMÔNIO
// ============================================================
function enviarGraficoPatrimonio() {
  try {
    var data = getDashboardData();
    if (!data || !data.dailyHistory || data.dailyHistory.length === 0) return;

    var hoje = new Date();
    var inicio = new Date(hoje.getTime() - 30 * 24 * 60 * 60 * 1000);
    var periodo = data.dailyHistory.filter(d => new Date(d.data + 'T00:00:00') >= inicio);
    if (periodo.length < 2) return;

    var labels = periodo.map(d => {
      var dt = new Date(d.data + 'T00:00:00');
      return dt.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
    });
    var balances = periodo.map(d => Number(d.saldoUSD) || 0);

    var config = {
      width: 800,
      height: 400,
      backgroundColor: '#0a0e17',
      chart: {
        type: 'line',
        data: {
          labels: labels,
          datasets: [{
            label: 'Saldo USD',
            data: balances,
            borderColor: '#60a5fa',
            backgroundColor: 'rgba(96,165,250,0.25)',
            borderWidth: 2.5,
            fill: true,
            tension: 0.4,
            pointRadius: 0,
            pointStyle: 'circle'      // ← círculo na legenda
          }]
        },
        options: {
          plugins: {
            title: { display: true, text: 'Evolução do Patrimônio', color: '#f0f4ff', font: { size: 14 } },
            legend: {
              display: true,
              labels: {
                color: '#e2e8f0',
                usePointStyle: true,
                pointStyleWidth: 10,
                font: { size: 10 }
              }
            }
          },
          scales: {
            x: { grid: { display: false }, ticks: { color: '#94a3b8', maxTicksLimit: 10, font: { size: 9 } } },
            y: { grid: { color: 'rgba(148,163,184,0.1)' }, ticks: { color: '#94a3b8', font: { size: 9 }, callback: 'function(v){ return "$" + (v/1000).toFixed(1) + "k"; }' } }
          }
        }
      }
    };

    var blob = gerarGraficoQuickChart(config);
    enviarFotoTelegram(blob, '📈 <b>Evolução do Patrimônio</b>');
  } catch (e) {
    Logger.log('Erro gráfico patrimônio: ' + e);
  }
}

// ============================================================
// GRÁFICO 2: PREÇO BTC & TRANSAÇÕES
// ============================================================
function enviarGraficoPrecoETransacoes() {
  try {
    var data = getDashboardData();
    if (!data || !data.dailyHistory || data.dailyHistory.length === 0) return;

    var hoje = new Date();
    var inicio = new Date(hoje.getTime() - 30 * 24 * 60 * 60 * 1000);
    var periodo = data.dailyHistory.filter(d => new Date(d.data + 'T00:00:00') >= inicio);
    if (periodo.length < 2) return;

    var labels = periodo.map(d => {
      var dt = new Date(d.data + 'T00:00:00');
      return dt.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
    });

    var precos = periodo.map(d => Number(d.cotacaoBTC) || 0);
    var dateToIndex = {};
    periodo.forEach((d, i) => { dateToIndex[d.data] = i; });

    var trades = data.aportes.filter(a => {
      var d = new Date(a.data + 'T00:00:00');
      return d >= inicio && d <= hoje;
    });

    var compras = new Array(labels.length).fill(null);
    var vendas = new Array(labels.length).fill(null);

    trades.forEach(t => {
      var idx = dateToIndex[t.data];
      if (idx !== undefined) {
        var price = Number(t.cotacaoUSD) || 0;
        var value = Number(t.aporteUSD);
        if (value > 0) compras[idx] = price;
        else if (value < 0) vendas[idx] = price;
      }
    });

    var datasets = [{
      label: 'Preço BTC',
      data: precos,
      borderColor: '#f59e0b',
      backgroundColor: 'rgba(245,158,11,0.05)',
      borderWidth: 2.5,
      fill: true,
      tension: 0.3,
      pointRadius: 0,
      pointStyle: 'line'            // ← traço na legenda
    }];

    // Compras (pontos verdes) – círculo
    datasets.push({
      label: 'Compra',
      data: compras,
      type: 'line',
      showLine: false,
      pointRadius: 6,
      pointBackgroundColor: '#2dd4bf',
      pointBorderColor: '#ffffff',
      pointBorderWidth: 2,
      pointStyle: 'circle',
      backgroundColor: '#2dd4bf'
    });

    // Vendas (pontos vermelhos) – círculo
    datasets.push({
      label: 'Venda',
      data: vendas,
      type: 'line',
      showLine: false,
      pointRadius: 6,
      pointBackgroundColor: '#fb7185',
      pointBorderColor: '#ffffff',
      pointBorderWidth: 2,
      pointStyle: 'circle',
      backgroundColor: '#fb7185'
    });

    var config = {
      width: 800,
      height: 400,
      backgroundColor: '#0a0e17',
      chart: {
        type: 'line',
        data: { labels: labels, datasets: datasets },
        options: {
          plugins: {
            title: { display: true, text: 'Preço BTC & Transações', color: '#f0f4ff', font: { size: 14 } },
            legend: {
              display: true,
              position: 'top',
              align: 'center',
              labels: {
                color: '#e2e8f0',
                usePointStyle: true,
                pointStyleWidth: 10,
                padding: 20,
                font: { size: 10 }
              }
            }
          },
          scales: {
            x: { grid: { display: false }, ticks: { color: '#94a3b8', maxTicksLimit: 12, font: { size: 9 } } },
            y: { grid: { color: 'rgba(148,163,184,0.1)' }, ticks: { color: '#94a3b8', font: { size: 9 }, callback: 'function(v){ return "$" + v; }' } }
          }
        }
      }
    };

    var blob = gerarGraficoQuickChart(config);
    enviarFotoTelegram(blob, '📉 <b>Preço BTC + Compras/Vendas</b>');
  } catch (e) {
    Logger.log('Erro gráfico preço: ' + e);
  }
}
// ============================================================
// FUNÇÕES AUXILIARES (QuickChart + Telegram)
// ============================================================
function gerarGraficoQuickChart(config) {
  var response = UrlFetchApp.fetch('https://quickchart.io/chart', {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(config),
    muteHttpExceptions: true
  });
  var blob = response.getBlob();
  if (!blob || blob.getBytes().length === 0) throw new Error('QuickChart não retornou imagem.');
  blob.setName('chart.png');
  return blob;
}

function enviarFotoTelegram(blob, legenda) {
  var url = 'https://api.telegram.org/bot' + CONFIG.TELEGRAM_TOKEN + '/sendPhoto';
  var formData = {
    chat_id: String(CONFIG.AUTHORIZED_CHAT_ID),
    photo: blob,
    caption: legenda || '',
    parse_mode: 'HTML'
  };
  var resp = UrlFetchApp.fetch(url, { method: 'post', payload: formData, muteHttpExceptions: true });
  var result = JSON.parse(resp.getContentText());
  if (!result.ok) {
    Logger.log('Erro ao enviar foto: ' + result.description);
    enviarParaTelegram('❌ Falha ao enviar imagem: ' + result.description);
  }
}

function enviarParaTelegram(texto) {
  var url = "https://api.telegram.org/bot" + CONFIG.TELEGRAM_TOKEN + "/sendMessage";
  var options = {
    "method": "post",
    "contentType": "application/json",
    "payload": JSON.stringify({
      "chat_id": CONFIG.AUTHORIZED_CHAT_ID,
      "text": texto,
      "parse_mode": "HTML"
    }),
    "muteHttpExceptions": true
  };
  UrlFetchApp.fetch(url, options);
}

// ============================================================
// AUTOMAÇÃO MENSAL (mantida do script original)
// ============================================================
function configurarGatilhoAutomático() {
  var triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(t => { if(t.getHandlerFunction() === "verificarUltimoDia") ScriptApp.deleteTrigger(t); });

  ScriptApp.newTrigger("verificarUltimoDia")
    .timeBased()
    .everyDays(1)
    .atHour(22)
    .create();
    
  SpreadsheetApp.getUi().alert("✅ Automação configurada! O script verificará todo dia às 22h se é o fim do mês.");
}

function verificarUltimoDia() {
  var hoje = new Date();
  var amanha = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + 1);

  if (amanha.getDate() === 1) {
    enviarResumoMensalTelegram();  // agora envia texto + gráficos
  }
}