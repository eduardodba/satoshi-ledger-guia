function gravarHistoricoDiario() {

  const planilha = SpreadsheetApp.getActiveSpreadsheet();

  const abaDashboard = planilha.getSheetByName("Dashboard");
  const abaMoedas = planilha.getSheetByName("Moedas");
  const abaHistorico = planilha.getSheetByName("Histórico Diário") ||
                       planilha.insertSheet("Histórico Diário");

  SpreadsheetApp.flush();

  // Data atual
  const data = new Date();

  // Dados do Dashboard
  const saldoUSD = abaDashboard.getRange("C13").getValue();
  const saldoBRL = abaDashboard.getRange("D13").getValue();

  const qtdBTC =
    Number(abaDashboard.getRange("H12").getValue()) +
    Number(abaDashboard.getRange("H13").getValue());

  const pmBTC = abaDashboard.getRange("C15").getValue();

  // Cotação BTC
  const cotacaoBTC = abaMoedas.getRange("B1").getValue();

  // Cria cabeçalho se não existir
  if (abaHistorico.getLastRow() === 0) {

    abaHistorico.appendRow([
      "Data",
      "Saldo USD",
      "Saldo R$",
      "QTD BTC",
      "PM BTC",
      "COTACAO BTC"
    ]);

    const cabecalho = abaHistorico.getRange(1, 1, 1, 6);

    cabecalho
      .setFontFamily("Arial")
      .setFontSize(8)
      .setFontWeight("bold")
      .setBackground("#F3F3F3");

    cabecalho.setBorder(
      true, true, true, true, true, true,
      "#D9D9D9",
      SpreadsheetApp.BorderStyle.SOLID
    );
  }

  // Adiciona a linha
  abaHistorico.appendRow([
    data,
    saldoUSD,
    saldoBRL,
    qtdBTC,
    pmBTC,
    cotacaoBTC
  ]);

  const ultimaLinha = abaHistorico.getLastRow();

  const rangeLinha = abaHistorico.getRange(ultimaLinha, 1, 1, 6);

  // Fonte Arial 8
  rangeLinha
    .setFontFamily("Arial")
    .setFontSize(8);

  // Borda cinza
  rangeLinha.setBorder(
    true, true, true, true, true, true,
    "#D9D9D9",
    SpreadsheetApp.BorderStyle.SOLID
  );

  // Formatação das colunas
  abaHistorico.getRange(ultimaLinha, 1)
    .setNumberFormat("dd/MM/yyyy");

  abaHistorico.getRange(ultimaLinha, 2)
    .setNumberFormat('$#,##0.00');

  abaHistorico.getRange(ultimaLinha, 3)
    .setNumberFormat('"R$" #,##0.00');

  abaHistorico.getRange(ultimaLinha, 4)
    .setNumberFormat('0.00000000');

  abaHistorico.getRange(ultimaLinha, 5)
    .setNumberFormat('$#,##0.00');

  abaHistorico.getRange(ultimaLinha, 6)
    .setNumberFormat('$#,##0.00');

  // Destacar PM BTC
  const celulaPM = abaHistorico.getRange(ultimaLinha, 5);

  const valorPM = Number(pmBTC);
  const valorCotacao = Number(cotacaoBTC);

  if (valorCotacao > valorPM) {

    // Lucro - verde claro
    celulaPM.setBackground("#D9EAD3");

  } else if (valorCotacao < valorPM) {

    // Prejuízo - vermelho claro
    celulaPM.setBackground("#F4CCCC");

  } else {

    // Empate - amarelo claro
    celulaPM.setBackground("#FFF2CC");
  }

  Logger.log("Saldo USD: " + saldoUSD);
  Logger.log("Saldo BRL: " + saldoBRL);
  Logger.log("QTD BTC: " + qtdBTC);
  Logger.log("PM BTC: " + pmBTC);
  Logger.log("Cotação BTC: " + cotacaoBTC);
  Logger.log("Histórico gravado com sucesso.");
}