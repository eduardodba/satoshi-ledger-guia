function gravarHistoricoMensal() {

  const planilha = SpreadsheetApp.getActiveSpreadsheet();

  const abaHistorico = planilha.getSheetByName("Histórico Diário");
  const abaMensal = planilha.getSheetByName("Histórico Mensal");
  const abaAportes = planilha.getSheetByName("Aportes");

  if (!abaHistorico || !abaMensal) {
    throw new Error("Abas não encontradas.");
  }

  const dadosHistorico = abaHistorico.getDataRange().getValues();

  if (dadosHistorico.length <= 1) {
    return;
  }

  // Formato do mês: 6/26
  const hoje = new Date();
  const mesAtual =
    (hoje.getMonth() + 1) + "/" +
    String(hoje.getFullYear()).slice(-2);

  const registrosMes = [];

  // Histórico Diário:
  // A = Data
  // B = Saldo USD
  // C = Saldo R$
  for (let i = 1; i < dadosHistorico.length; i++) {

    const linha = dadosHistorico[i];

    if (!linha[0]) continue;

    const data = new Date(linha[0]);

    const mesRegistro =
      (data.getMonth() + 1) + "/" +
      String(data.getFullYear()).slice(-2);

    if (mesRegistro === mesAtual) {

      registrosMes.push({
        data: data,
        saldoUSD: Number(linha[1]) || 0,
        saldoBRL: Number(linha[2]) || 0
      });
    }
  }

  if (registrosMes.length === 0) {
    return;
  }

  registrosMes.sort((a, b) => a.data - b.data);

  const primeiroDia = registrosMes[0];
  const ultimoDia = registrosMes[registrosMes.length - 1];

  // Aportes / Resgates do mês
  let aporteResgate = 0;

  if (abaAportes) {

    const dadosAportes = abaAportes.getDataRange().getValues();

    for (let i = 1; i < dadosAportes.length; i++) {

      const dataAporte = dadosAportes[i][0];

      if (!dataAporte) continue;

      // Coluna H (índice 7) = Origem. Ficam fora do fluxo mensal (Aporte/Resgate):
      //  - "Ajuste": apenas corrige o saldo do caixa, não é aporte nem resgate.
      //  - "Caixa": compra paga com o caixa (capital reciclado, já contabilizado na
      //    venda que abasteceu o caixa) — não é dinheiro novo entrando na carteira.
      const origem = String(dadosAportes[i][7] || "").trim().toLowerCase();
      if (origem === "ajuste" || origem === "caixa") continue;

      const data = new Date(dataAporte);

      const mesAporte =
        (data.getMonth() + 1) + "/" +
        String(data.getFullYear()).slice(-2);

      if (mesAporte === mesAtual) {
        aporteResgate += Number(dadosAportes[i][2]) || 0;
      }
    }
  }

  const ultimaLinha = abaMensal.getLastRow();

  let linhaMes;

  // Se só existe cabeçalho
  if (ultimaLinha <= 1) {

    abaMensal.appendRow([
      mesAtual,
      primeiroDia.saldoUSD,
      ultimoDia.saldoUSD,
      primeiroDia.saldoBRL,
      ultimoDia.saldoBRL,
      aporteResgate
    ]);

    linhaMes = abaMensal.getLastRow();

  } else {

    const mesUltimaLinha = String(
      abaMensal.getRange(ultimaLinha, 1).getDisplayValue()
    ).trim();

    if (mesUltimaLinha === mesAtual) {

      linhaMes = ultimaLinha;

      // Atualiza somente os valores variáveis
      abaMensal.getRange(linhaMes, 3).setValue(
        ultimoDia.saldoUSD
      );

      abaMensal.getRange(linhaMes, 5).setValue(
        ultimoDia.saldoBRL
      );

      abaMensal.getRange(linhaMes, 6).setValue(
        aporteResgate
      );

    } else {

      abaMensal.appendRow([
        mesAtual,
        primeiroDia.saldoUSD,
        ultimoDia.saldoUSD,
        primeiroDia.saldoBRL,
        ultimoDia.saldoBRL,
        aporteResgate
      ]);

      linhaMes = abaMensal.getLastRow();
    }
  }

  // ==========================
  // FORMATAÇÃO
  // ==========================

  const rangeLinha = abaMensal.getRange(
    linhaMes,
    1,
    1,
    6
  );

  rangeLinha
    .setFontFamily("Arial")
    .setFontSize(8);

  rangeLinha.setBorder(
    true,
    true,
    true,
    true,
    true,
    true,
    "#D9D9D9",
    SpreadsheetApp.BorderStyle.SOLID
  );

// ==========================
// CORES USD
// B = Primeiro Dia
// C = Último Dia
// ==========================

const saldoUSDPrimeiro =
  Number(abaMensal.getRange(linhaMes, 2).getValue()) || 0;

const saldoUSDUltimo =
  Number(abaMensal.getRange(linhaMes, 3).getValue()) || 0;

const celulaUSD =
  abaMensal.getRange(linhaMes, 3);

if (saldoUSDUltimo > saldoUSDPrimeiro) {

  celulaUSD.setBackground("#D9EAD3"); // Verde

} else if (saldoUSDUltimo < saldoUSDPrimeiro) {

  celulaUSD.setBackground("#F4CCCC"); // Vermelho

} else {

  celulaUSD.setBackground("#FFF2CC"); // Amarelo
}

// ==========================
// CORES BRL
// D = Primeiro Dia
// E = Último Dia
// ==========================

const saldoBRPrimeiro =
  Number(abaMensal.getRange(linhaMes, 4).getValue()) || 0;

const saldoBRUltimo =
  Number(abaMensal.getRange(linhaMes, 5).getValue()) || 0;

const celulaBRL =
  abaMensal.getRange(linhaMes, 5);

if (saldoBRUltimo > saldoBRPrimeiro) {

  celulaBRL.setBackground("#D9EAD3"); // Verde

} else if (saldoBRUltimo < saldoBRPrimeiro) {

  celulaBRL.setBackground("#F4CCCC"); // Vermelho

} else {

  celulaBRL.setBackground("#FFF2CC"); // Amarelo
}

  Logger.log("Histórico Mensal atualizado com sucesso.");
}