/*
 * Bitcoin Portfolio OS — Google Apps Script backend
 * Versão 2.0.0
 *
 * Planilhas preservadas:
 * Aportes: A Data | B Token | C Aporte USD | D Cotação USD | E Cotação BRL | F Qtd | G Investidor
 * Histórico Diário: A Data | B Saldo USD | C Saldo BRL | D QTD BTC | E PM BTC | F Cotação BTC
 * Histórico Mensal: A Mês | B USD início | C USD fim | D BRL início | E BRL fim | F Aporte/Resgate
 * Moedas: A Ativo | B Cotação | C Símbolo
 */

var APP = Object.freeze({
  VERSION: '2.37.0',
  SHEETS: {
    IRPF: 'IRPF',
    CONTRIBUTIONS: 'Aportes',
    DAILY: 'Histórico Diário',
    MONTHLY: 'Histórico Mensal',
    CURRENCIES: 'Moedas'
  },
  HEADERS: {
    CONTRIBUTIONS: ['Aporte', 'Token', 'Aporte $', 'Cotação $', 'Cotação R$', 'Qtd', 'Investidor', 'Origem'],
    DAILY: ['Data', 'Saldo USD', 'Saldo R$', 'QTD BTC', 'PM BTC', 'COTAÇÃO BTC'],
    MONTHLY: ['Mês', 'Saldo USD Primeiro Dia (Mês)', 'Saldo USD Último Dia (Mês)', 'Saldo R$ Primeiro Dia (Mês)', 'Saldo R$ Último Dia (Mês)', 'Aporte / Resgate'],
    CURRENCIES: ['Ativo', 'Cotação', 'Símbolo']
  },
  CACHE: {
    MARKET: 'btc_market_v2',
    ONCHAIN: 'btc_onchain_v2',
    HALVING: 'btc_halving_v1',
    MARKET_SECONDS: 300,
    ONCHAIN_SECONDS: 21600,
    HALVING_SECONDS: 900,
  },
  PROPERTIES: {
    TELEGRAM_TOKEN: 'TELEGRAM_TOKEN',
    TELEGRAM_CHAT_ID: 'TELEGRAM_CHAT_ID',
    LAST_MONTHLY_REPORT: 'LAST_MONTHLY_REPORT',
    CASH_SPECIAL: 'CASH_SPECIAL',
    DCA_WEEKLY_FIXED: 'DCA_WEEKLY_FIXED',
    WEEKLY_MIDCYCLE_FIX: 'WEEKLY_MIDCYCLE_FIX_V1',
    SPECIAL_INITIALIZED: 'SPECIAL_INITIALIZED',
    LAST_SPECIAL_REBALANCE: 'LAST_SPECIAL_REBALANCE',
    GOAL_BTC: 'GOAL_BTC',
    NOTIFY_TELEGRAM: 'NOTIFY_TELEGRAM',
    NOTIFY_EMAIL: 'NOTIFY_EMAIL',
    NOTIFY_DCA: 'NOTIFY_DCA',
    NOTIFY_WEEKLY: 'NOTIFY_WEEKLY',
    NOTIFY_MONTHLY: 'NOTIFY_MONTHLY',
    NOTIFY_APORTES: 'NOTIFY_APORTES',
    SELL_TARGET_BTC: 'SELL_TARGET_BTC',
    SELL_TARGET_ISO: 'SELL_TARGET_ISO',
    LAST_FX: 'LAST_FX'
  }
});

// -----------------------------------------------------------------------------
// PLANO DE DCA FIXO + CAIXA ESPECIAL
// -----------------------------------------------------------------------------
// Janela: começa 725 dias antes do halving; o caixa NORMAL deve zerar 500 dias
// antes (fundos de ciclo historicamente ~510–540 dias antes do halving).
// DCA FIXO: cota semanal = caixa normal ÷ semanas restantes (independe do preço).
// CAIXA ESPECIAL: 20% do caixa total, reservado para uma oportunidade escolhida
// por você. Rebalanceado automaticamente no dia 725 (início do ciclo) para ficar
// exatamente em 20% — completa pra cima ou devolve o excedente ao caixa normal.
// Coluna I da aba "Aportes": cotação do dólar (USD→BRL) na data do aporte.
// A coluna H (Origem) já era usada; a I estava livre desde que a flag do IRPF
// passou a viver nas Propriedades do script.
var FX_COLUMN = 9;
var FX_HEADER = 'Dólar R$';

// DCA de venda: 20% da posição, diluída semanalmente entre 480 e 550 dias
// depois do halving (70 dias = 10 semanas).
var SELL_PLAN = Object.freeze({
  START_DAYS_AFTER_HALVING: 480,
  END_DAYS_AFTER_HALVING: 550,
  PCT_OF_POSITION: 0.20
});

var DCA_PLAN = Object.freeze({
  START_DAYS_BEFORE_HALVING: 725,
  END_DAYS_BEFORE_HALVING: 500,
  SPECIAL_PCT: 0.20
});

// Origem do aporte (coluna H da aba Aportes):
//  - 'Novo'     : dinheiro novo entrando na carteira (default; conta no DCA).
//  - 'Caixa'    : compra usando o caixa NORMAL (DCA). Conta na cota semanal.
//  - 'Especial' : compra usando o caixa ESPECIAL (oportunidade). Consome o caixa
//                 como 'Caixa', mas NÃO conta na cota semanal do DCA.
//  - 'Ajuste'   : linha que apenas corrige o saldo do CAIXA; NÃO é compra nem venda
//                 de BTC (qty = 0) e é ignorada em posição, históricos e relatórios.
//  - 'Ajuste BTC': linha que apenas corrige a QUANTIDADE de BTC (sats perdidos em
//                 taxas, poeira, erro de digitação). Valor = 0, não mexe no caixa
//                 nem no custo investido; só a quantidade (e portanto o PM).
var CONTRIBUTION_ORIGIN = Object.freeze({
  NEW: 'Novo',
  CASH: 'Caixa',
  CASH_SPECIAL: 'Especial',
  ADJUSTMENT: 'Ajuste',
  COIN_ADJUSTMENT: 'Ajuste BTC'
});

/** Normaliza o texto da coluna Origem para um dos valores canônicos. Vazio => 'Novo'. */
function normalizeOrigin_(value) {
  var str = String(value || '').trim().toLowerCase();
  if (str === 'especial' || str === 'special') return CONTRIBUTION_ORIGIN.CASH_SPECIAL;
  if (str === 'caixa' || str === 'cash') return CONTRIBUTION_ORIGIN.CASH;
  // Ajuste de moeda precisa ser testado antes do ajuste de caixa.
  if (str === 'ajuste btc' || str === 'ajuste moeda' || str === 'ajuste de moedas' ||
      str === 'ajuste sats' || str === 'coin' || str === 'sats') return CONTRIBUTION_ORIGIN.COIN_ADJUSTMENT;
  if (str === 'ajuste' || str === 'adjustment') return CONTRIBUTION_ORIGIN.ADJUSTMENT;
  return CONTRIBUTION_ORIGIN.NEW;
}

// Parâmetros do ciclo de halving. A âncora mantém um fallback determinístico
// mesmo quando a API de altura do bloco estiver temporariamente indisponível.
var HALVING_INTERVAL = 210000;
var HALVING_ANCHOR_BLOCK = 840000;
var HALVING_ANCHOR_DATE = new Date('2024-04-20T00:09:27.000Z');
var HALVING_BLOCK_MINUTES = 10;

// -----------------------------------------------------------------------------
// WEB APP E MENU
// -----------------------------------------------------------------------------

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Dashboard')
    .setTitle('Satoshi Ledger')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover');
}

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('₿ Satoshi Ledger')
    .addItem('Configurar / atualizar projeto', 'setupProject')
    .addItem('Registrar snapshot agora', 'recordDailySnapshot')
    .addItem('Carregar histórico de preços (1º uso)', 'preencherHistoricoDiario')
    .addItem('Preencher cotação do dólar (Aportes)', 'preencherDolarAportes')
    .addItem('Reconstruir históricos', 'rebuildHistories')
    .addItem('Backup + reconstruir históricos', 'backupAndRebuildHistories')
    .addSeparator()
    .addItem('Enviar relatório mensal por email', 'enviarEmailRelatorioMensalTeste')
    .addToUi();
}

/** Cria/ajusta abas, formatos e gatilhos sem apagar os dados existentes. */
function setupProject() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ensureSheet_(ss, APP.SHEETS.CONTRIBUTIONS, APP.HEADERS.CONTRIBUTIONS);
  ensureSheet_(ss, APP.SHEETS.DAILY, APP.HEADERS.DAILY);
  ensureSheet_(ss, APP.SHEETS.MONTHLY, APP.HEADERS.MONTHLY);
  ensureSheet_(ss, APP.SHEETS.CURRENCIES, APP.HEADERS.CURRENCIES);
  ensureOriginColumn_(ss);
  ensureDolarColumn_(ss);
  formatSheets_(ss);
  installTriggers_();
  rebuildHistories();
  ss.toast('Projeto configurado. Publique novamente o web app para aplicar alterações.', 'Satoshi Ledger', 8);
  return { success: true, message: 'Projeto configurado com sucesso.' };
}

function installTriggers_() {
  // Handlers OBSOLETOS a remover sempre (não devem ter trigger).
  var obsolete = ['checkDcaIntensityHourly', 'rebalanceSpecialCashIfDue'];
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (obsolete.indexOf(trigger.getHandlerFunction()) !== -1) {
      try { ScriptApp.deleteTrigger(trigger); } catch (e) {}
    }
  });

  // Conjunto de handlers que JÁ têm trigger, para criação idempotente (não duplica).
  var existing = {};
  ScriptApp.getProjectTriggers().forEach(function (t) { existing[t.getHandlerFunction()] = true; });

  // Cada criação é isolada: a falha de uma NÃO impede as demais (antes, uma exceção
  // no meio deixava os triggers seguintes — ex.: sendWeeklyDcaAlert — sem serem criados).
  var created = [];
  var failed = [];
  function ensureTrigger_(name, build) {
    if (existing[name]) return;                 // idempotente: já existe, não recria
    try { build(); created.push(name); }
    catch (e) { failed.push(name + ': ' + e.message); }
  }

  ensureTrigger_('recordDailySnapshot', function () {
    ScriptApp.newTrigger('recordDailySnapshot').timeBased().everyDays(1).atHour(21).create();
  });
  ensureTrigger_('sendMonthlyReportIfNeeded', function () {
    ScriptApp.newTrigger('sendMonthlyReportIfNeeded').timeBased().everyDays(1).atHour(22).create();
  });
  // DCA fixo: aporte da semana toda quarta às 13h.
  ensureTrigger_('sendWeeklyDcaAlert', function () {
    ScriptApp.newTrigger('sendWeeklyDcaAlert').timeBased().onWeekDay(ScriptApp.WeekDay.WEDNESDAY).atHour(13).create();
  });
  ensureTrigger_('sendWeeklySummary', function () {
    ScriptApp.newTrigger('sendWeeklySummary').timeBased().onWeekDay(ScriptApp.WeekDay.SUNDAY).atHour(20).create();
  });
  // Caixa especial é manual (botões no card) — sem trigger de rebalanceamento.

  if (failed.length) {
    console.warn('installTriggers_: falha ao criar ' + failed.join(' | '));
  }
  return { created: created, failed: failed };
}

function ensureSheet_(ss, name, headers) {
  var sheet = ss.getSheetByName(name) || ss.insertSheet(name);
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
  return sheet;
}

/**
 * Garante a coluna H "Origem" na aba Aportes sem tocar nas colunas A–G (que as
 * rotinas de histórico e as triggers usam). Preenche o cabeçalho e classifica as
 * linhas já existentes: retroativos viram 'Novo' e vendas ficam sem origem de
 * caixa (também 'Novo', pois a origem só se aplica a compras). Idempotente.
 */
function ensureOriginColumn_(ss) {
  var sheet = ss.getSheetByName(APP.SHEETS.CONTRIBUTIONS);
  if (!sheet) return;
  var originCol = 8;
  var header = String(sheet.getRange(1, originCol).getValue() || '').trim();
  if (!header) sheet.getRange(1, originCol).setValue('Origem');

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return;
  var range = sheet.getRange(2, originCol, lastRow - 1, 1);
  var values = range.getValues();
  var changed = false;
  for (var i = 0; i < values.length; i++) {
    var current = String(values[i][0] || '').trim();
    if (!current) { values[i][0] = CONTRIBUTION_ORIGIN.NEW; changed = true; }
  }
  if (changed) range.setValues(values);
}

// -----------------------------------------------------------------------------
// PADRÃO VISUAL DAS ABAS
// -----------------------------------------------------------------------------
//
// Uma única definição para todas as abas: mesma fonte, mesmo tamanho, mesmo
// cabeçalho, mesmo espaçamento e zebra. Tanto o setup quanto o cadastro de um
// aporte novo passam por aqui — assim a planilha não sai do padrão com o tempo.

var SHEET_STD = Object.freeze({
  font: 'Arial',
  bodySize: 9,
  headerSize: 9,
  headerBg: '#111827',
  headerColor: '#FFFFFF',
  bandA: '#FFFFFF',
  bandB: '#F8FAFC',
  border: '#E2E8F0',
  headerHeight: 32
});

/** Aplica o padrão visual a uma aba inteira. */
function applySheetStandard_(sheet, opts) {
  if (!sheet) return;
  opts = opts || {};
  var cols = Math.max(1, opts.columns || sheet.getLastColumn() || 1);
  var lastRow = Math.max(1, sheet.getLastRow());

  sheet.setFrozenRows(1);

  var head = sheet.getRange(1, 1, 1, cols);
  head.setBackground(SHEET_STD.headerBg)
    .setFontColor(SHEET_STD.headerColor)
    .setFontWeight('bold')
    .setFontFamily(SHEET_STD.font)
    .setFontSize(SHEET_STD.headerSize)
    .setVerticalAlignment('middle')
    .setHorizontalAlignment('left')
    .setWrap(false);
  sheet.setRowHeight(1, SHEET_STD.headerHeight);

  if (lastRow > 1) {
    var body = sheet.getRange(2, 1, lastRow - 1, cols);
    body.setFontFamily(SHEET_STD.font)
      .setFontSize(SHEET_STD.bodySize)
      .setVerticalAlignment('middle')
      .setHorizontalAlignment('left')
      .setBorder(true, true, true, true, true, true, SHEET_STD.border, SpreadsheetApp.BorderStyle.SOLID);

    var zebra = [];
    for (var r = 2; r <= lastRow; r++) {
      var linha = [];
      for (var c = 1; c <= cols; c++) linha.push(r % 2 === 0 ? SHEET_STD.bandA : SHEET_STD.bandB);
      zebra.push(linha);
    }
    body.setBackgrounds(zebra);
  }

  (opts.formats || []).forEach(function (f) {
    if (f.col > cols || lastRow < 2) return;
    sheet.getRange(2, f.col, lastRow - 1, 1).setNumberFormat(f.fmt);
  });
  (opts.widths || []).forEach(function (w, i) { sheet.setColumnWidth(i + 1, w); });
}

/** Formata uma única linha de aporte (usada ao salvar/editar). */
function formatContributionRow_(sheet, row) {
  if (!sheet || !row || row < 2) return;
  var rng = sheet.getRange(row, 1, 1, FX_COLUMN);
  rng.setFontFamily(SHEET_STD.font)
    .setFontSize(SHEET_STD.bodySize)
    .setVerticalAlignment('middle')
    .setHorizontalAlignment('left')
    .setBorder(true, true, true, true, true, true, SHEET_STD.border, SpreadsheetApp.BorderStyle.SOLID)
    .setBackground(row % 2 === 0 ? SHEET_STD.bandA : SHEET_STD.bandB);
  sheet.getRange(row, 1).setNumberFormat('dd/MM/yyyy');
  sheet.getRange(row, 3).setNumberFormat('$#,##0.00;-$#,##0.00');
  sheet.getRange(row, 4).setNumberFormat('$#,##0.00');
  sheet.getRange(row, 5).setNumberFormat('"R$" #,##0.00');
  sheet.getRange(row, 6).setNumberFormat('0.00000000');
  sheet.getRange(row, FX_COLUMN).setNumberFormat('"R$" #,##0.0000');
}

function formatSheets_(ss) {
  var aportes = ss.getSheetByName(APP.SHEETS.CONTRIBUTIONS);
  applySheetStandard_(aportes, {
    columns: FX_COLUMN,
    formats: [
      { col: 1, fmt: 'dd/MM/yyyy' },
      { col: 3, fmt: '$#,##0.00;-$#,##0.00' },
      { col: 4, fmt: '$#,##0.00' },
      { col: 5, fmt: '"R$" #,##0.00' },
      { col: 6, fmt: '0.00000000' },
      { col: FX_COLUMN, fmt: '"R$" #,##0.0000' }
    ],
    widths: [96, 62, 118, 112, 122, 122, 112, 96, 104]
  });

  var daily = ss.getSheetByName(APP.SHEETS.DAILY);
  applySheetStandard_(daily, {
    columns: 6,
    formats: [
      { col: 1, fmt: 'dd/MM/yyyy' },
      { col: 2, fmt: '$#,##0.00' },
      { col: 3, fmt: '"R$" #,##0.00' },
      { col: 4, fmt: '0.00000000' },
      { col: 5, fmt: '$#,##0.00' },
      { col: 6, fmt: '$#,##0.00' }
    ],
    widths: [96, 122, 128, 122, 112, 112]
  });

  var monthly = ss.getSheetByName(APP.SHEETS.MONTHLY);
  applySheetStandard_(monthly, {
    columns: 6,
    formats: [
      { col: 1, fmt: 'M/yy' },
      { col: 2, fmt: '$#,##0.00;-$#,##0.00' },
      { col: 3, fmt: '$#,##0.00;-$#,##0.00' },
      { col: 4, fmt: '"R$" #,##0.00;-"R$" #,##0.00' },
      { col: 5, fmt: '"R$" #,##0.00;-"R$" #,##0.00' },
      { col: 6, fmt: '$#,##0.00;-$#,##0.00' }
    ],
    widths: [78, 128, 128, 136, 136, 128]
  });

  var currencies = ss.getSheetByName(APP.SHEETS.CURRENCIES);
  applySheetStandard_(currencies, { columns: Math.max(3, currencies ? currencies.getLastColumn() : 3) });

  // Aba pessoal de renda fixa (fora do app): mesma linguagem visual, colunas
  // preservadas. Datas em texto não são convertidas para não mexer nos dados.
  var rendaFixa = ss.getSheetByName('Renda Fixa');
  applySheetStandard_(rendaFixa, {
    columns: Math.max(6, rendaFixa ? rendaFixa.getLastColumn() : 6),
    formats: [
      { col: 3, fmt: '"R$" #,##0.00' },
      { col: 4, fmt: '"R$" #,##0.00' },
      { col: 5, fmt: '0.00000000' }
    ],
    widths: [96, 130, 130, 130, 110, 118]
  });

  var irpf = ss.getSheetByName('IRPF');
  applySheetStandard_(irpf, {
    columns: 8,
    formats: [
      { col: 1, fmt: 'dd/MM/yyyy' },
      { col: 3, fmt: '$#,##0.00;-$#,##0.00' },
      { col: 4, fmt: '$#,##0.00' },
      { col: 5, fmt: '"R$" #,##0.00' },
      { col: 6, fmt: '0.00000000' }
    ],
    widths: [96, 62, 118, 112, 122, 122, 112, 96]
  });
}

// -----------------------------------------------------------------------------
// CONFIGURAÇÕES SEGURAS// -----------------------------------------------------------------------------
// CONFIGURAÇÕES SEGURAS
// -----------------------------------------------------------------------------

// -----------------------------------------------------------------------------
// PREFERÊNCIAS DE NOTIFICAÇÃO
// -----------------------------------------------------------------------------
//
// Cada tipo de aviso pode ser ligado/desligado, e cada canal (Telegram/email)
// também. Padrão: Telegram e email ligados; DCA e mensal ligados; resumo semanal
// e confirmação de aporte desligados (para não encher a caixa de entrada).

var NOTIF_DEFAULTS = { telegram: true, email: true, dca: true, weekly: false, monthly: true, aportes: false };

function notifBool_(prop, padrao) {
  var raw = PropertiesService.getScriptProperties().getProperty(prop);
  if (raw === null || raw === undefined || raw === '') return padrao;
  return String(raw) === 'on';
}
function notifLigada_(tipo) {
  var P = APP.PROPERTIES, d = NOTIF_DEFAULTS;
  if (tipo === 'dca' && !notifBool_(P.NOTIFY_DCA, d.dca)) return false;
  if (tipo === 'weekly' && !notifBool_(P.NOTIFY_WEEKLY, d.weekly)) return false;
  if (tipo === 'monthly' && !notifBool_(P.NOTIFY_MONTHLY, d.monthly)) return false;
  if (tipo === 'aportes' && !notifBool_(P.NOTIFY_APORTES, d.aportes)) return false;
  if (tipo === 'monthly') return notifBool_(P.NOTIFY_EMAIL, d.email);
  return notifBool_(P.NOTIFY_TELEGRAM, d.telegram);
}

/** Estado completo das notificações (usado pelo painel). */
function getNotificationSettings() {
  var P = APP.PROPERTIES, d = NOTIF_DEFAULTS;
  var props = PropertiesService.getScriptProperties();
  var chatId = props.getProperty(P.TELEGRAM_CHAT_ID) || '';
  var token = props.getProperty(P.TELEGRAM_TOKEN) || '';
  var emailTo = '';
  try { emailTo = donoDaConta_(); } catch (e) { emailTo = props.getProperty('EMAIL_DESTINO') || ''; }
  return {
    telegram: {
      enabled: notifBool_(P.NOTIFY_TELEGRAM, d.telegram),
      configured: Boolean(token && chatId),
      chatMasked: chatId ? maskValue_(chatId) : '',
      hasToken: Boolean(token)
    },
    email: { enabled: notifBool_(P.NOTIFY_EMAIL, d.email), to: emailTo },
    types: {
      dca: notifBool_(P.NOTIFY_DCA, d.dca),
      weekly: notifBool_(P.NOTIFY_WEEKLY, d.weekly),
      monthly: notifBool_(P.NOTIFY_MONTHLY, d.monthly),
      aportes: notifBool_(P.NOTIFY_APORTES, d.aportes)
    }
  };
}

/** Salva as preferências vindas do painel. */
function saveNotificationSettings(payload) {
  payload = payload || {};
  var P = APP.PROPERTIES;
  var props = PropertiesService.getScriptProperties();
  var liga = function (prop, valor) { props.setProperty(prop, valor ? 'on' : 'off'); };

  if (payload.telegramEnabled !== undefined) liga(P.NOTIFY_TELEGRAM, !!payload.telegramEnabled);
  if (payload.emailEnabled !== undefined) liga(P.NOTIFY_EMAIL, !!payload.emailEnabled);
  if (payload.dca !== undefined) liga(P.NOTIFY_DCA, !!payload.dca);
  if (payload.weekly !== undefined) liga(P.NOTIFY_WEEKLY, !!payload.weekly);
  if (payload.monthly !== undefined) liga(P.NOTIFY_MONTHLY, !!payload.monthly);
  if (payload.aportes !== undefined) liga(P.NOTIFY_APORTES, !!payload.aportes);

  if (payload.telegramToken) {
    var token = String(payload.telegramToken).trim();
    if (!/^\d+:[A-Za-z0-9_-]{20,}$/.test(token)) throw new Error('Token do Telegram inválido.');
    props.setProperty(P.TELEGRAM_TOKEN, token);
  }
  if (payload.telegramChatId) {
    var chatId = String(payload.telegramChatId).trim();
    if (!/^-?\d+$/.test(chatId)) throw new Error('Chat ID do Telegram inválido.');
    props.setProperty(P.TELEGRAM_CHAT_ID, chatId);
  }
  if (payload.emailTo !== undefined && String(payload.emailTo).trim() !== '') {
    var email = String(payload.emailTo).trim();
    if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(email)) throw new Error('E-mail inválido.');
    props.setProperty('EMAIL_DESTINO', email);
  }
  return { success: true, message: 'Notificações atualizadas.', settings: getNotificationSettings() };
}

function getIntegrationStatus() {
  var props = PropertiesService.getScriptProperties();
  var chatId = props.getProperty(APP.PROPERTIES.TELEGRAM_CHAT_ID) || '';
  return {
    telegramConfigured: Boolean(props.getProperty(APP.PROPERTIES.TELEGRAM_TOKEN) && chatId),
    telegramChatMasked: chatId ? maskValue_(chatId) : '',
    goalBtc: getGoalBtc_(),
    version: APP.VERSION
  };
}

/** Meta de acúmulo em BTC configurável. 0 = automática (próximo inteiro acima da posição). */
function getGoalBtc_() {
  var raw = PropertiesService.getScriptProperties().getProperty(APP.PROPERTIES.GOAL_BTC);
  var value = cleanNumber_(raw);
  return value > 0 ? value : 0;
}

/** Recebe segredos pelo painel e os armazena em Script Properties; nunca os devolve ao navegador. */
function saveIntegrationSettings(settings) {
  settings = settings || {};
  var props = PropertiesService.getScriptProperties();

  if (settings.telegramToken) {
    var token = String(settings.telegramToken).trim();
    if (!/^\d+:[A-Za-z0-9_-]{20,}$/.test(token)) throw new Error('Token do Telegram inválido.');
    props.setProperty(APP.PROPERTIES.TELEGRAM_TOKEN, token);
  }
  if (settings.telegramChatId) {
    var chatId = String(settings.telegramChatId).trim();
    if (!/^-?\d+$/.test(chatId)) throw new Error('Chat ID do Telegram inválido.');
    props.setProperty(APP.PROPERTIES.TELEGRAM_CHAT_ID, chatId);
  }
  if (settings.goalBtc !== undefined && settings.goalBtc !== null && String(settings.goalBtc) !== '') {
    var goal = cleanNumber_(settings.goalBtc);
    if (!(goal >= 0) || goal > 21000000) throw new Error('Meta de BTC inválida.');
    props.setProperty(APP.PROPERTIES.GOAL_BTC, String(goal));
  }
  CacheService.getScriptCache().remove(APP.CACHE.ONCHAIN);
  return { success: true, message: 'Integrações salvas com segurança.', status: getIntegrationStatus() };
}

function maskValue_(value) {
  var str = String(value);
  if (str.length <= 4) return '••••';
  return '••••' + str.slice(-4);
}

// -----------------------------------------------------------------------------
// DASHBOARD DATA
// -----------------------------------------------------------------------------

function getDashboardData() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var market = getMarketSnapshot_();
  var contributions = readContributions_(ss);
  var daily = readDailyHistory_(ss);
  var monthly = readMonthlyHistory_(ss, daily, contributions);
  var currentState = calculatePosition_(contributions, market.btcUsd);
  var halving = getCachedHalvingData_();
  var cash = calculateCash_(contributions, market);

  // O plano NUNCA pode derrubar o dashboard: qualquer falha vira plano inativo.
  var plan;
  try {
    plan = buildAccumulationPlan_(market, cash, halving, contributions);
  } catch (planError) {
    console.warn('Plano de acúmulo indisponível: ' + planError.message);
    plan = { active: false, reason: 'error' };
  }

  return {
    version: APP.VERSION,
    generatedAt: new Date().toISOString(),
    market: market,
    halving: halving,
    onchain: getCachedOnChainSnapshot_(),
    contributions: contributions,
    sellPlan: (function(){ try { return buildSellPlan_(market, halving, contributions); } catch (e) { console.warn('Plano de venda indisponível: ' + e.message); return { active:false, reason:'error' }; } })(),
    dailyHistory: daily,
    monthlyHistory: monthly,
    position: currentState,
    cash: cash,
    irpfPm: cleanNumber_(PropertiesService.getScriptProperties().getProperty('IRPF_PM')),
    irpfOverrides: lerIrpfOverrides_(),
    irpfHidden: lerIrpfHidden_(),
    irpfExtra: lerIrpfExtra_(),
    accumulationPlan: plan,
    integrationStatus: getIntegrationStatus()
  };
}

function readContributions_(ss) {
  var sheet = ss.getSheetByName(APP.SHEETS.CONTRIBUTIONS);
  if (!sheet || sheet.getLastRow() < 2) return [];
  var values = sheet.getRange(2, 1, sheet.getLastRow() - 1, FX_COLUMN).getValues();
  var marcadas = lerIrpfFlag_();
  var rows = [];
  values.forEach(function (row, index) {
    if (!row[0]) return;
    var origin = normalizeOrigin_(row[7]);
    rows.push({
      row: index + 2,
      date: toIsoDate_(row[0]),
      token: String(row[1] || 'BTC').toUpperCase(),
      amountUsd: cleanNumber_(row[2]),
      priceUsd: cleanNumber_(row[3]),
      priceBrl: cleanNumber_(row[4]),
      quantity: cleanNumber_(row[5]),
      investor: String(row[6] || 'Principal').trim(),
      origin: origin,
      usdBrl: cleanNumber_(row[8]),
      isAdjustment: origin === CONTRIBUTION_ORIGIN.ADJUSTMENT,
      isCoinAdjustment: origin === CONTRIBUTION_ORIGIN.COIN_ADJUSTMENT,
      irpf: marcadas.indexOf(index + 2) >= 0
    });
  });
  rows.sort(function (a, b) { return a.date.localeCompare(b.date) || a.row - b.row; });
  return rows;
}

function readDailyHistory_(ss) {
  var sheet = ss.getSheetByName(APP.SHEETS.DAILY);
  if (!sheet || sheet.getLastRow() < 2) return [];
  var values = sheet.getRange(2, 1, sheet.getLastRow() - 1, 6).getValues();
  var rows = [];
  values.forEach(function (row) {
    if (!row[0]) return;
    rows.push({
      date: toIsoDate_(row[0]),
      balanceUsd: cleanNumber_(row[1]),
      balanceBrl: cleanNumber_(row[2]),
      quantityBtc: cleanNumber_(row[3]),
      averagePrice: cleanNumber_(row[4]),
      btcPrice: cleanNumber_(row[5])
    });
  });
  rows.sort(function (a, b) { return a.date.localeCompare(b.date); });
  return dedupeByDate_(rows);
}

function readMonthlyHistory_(ss, daily, contributions) {
  var calculated = buildMonthlyAnalytics_(daily, contributions);
  if (calculated.length) return calculated;

  var sheet = ss.getSheetByName(APP.SHEETS.MONTHLY);
  if (!sheet || sheet.getLastRow() < 2) return [];
  var values = sheet.getRange(2, 1, sheet.getLastRow() - 1, 6).getValues();
  return values.filter(function (row) { return row[0]; }).map(function (row) {
    return {
      month: toIsoDate_(row[0]).slice(0, 7),
      startUsd: cleanNumber_(row[1]),
      endUsd: cleanNumber_(row[2]),
      startBrl: cleanNumber_(row[3]),
      endBrl: cleanNumber_(row[4]),
      netFlowUsd: cleanNumber_(row[5]),
      modifiedDietz: null
    };
  });
}

function dedupeByDate_(rows) {
  var map = {};
  rows.forEach(function (row) { map[row.date] = row; });
  return Object.keys(map).sort().map(function (date) { return map[date]; });
}

// -----------------------------------------------------------------------------
// MERCADO E ON-CHAIN
// -----------------------------------------------------------------------------

function getMarketSnapshot_() {
  var cache = CacheService.getScriptCache();
  var cached = cache.get(APP.CACHE.MARKET);
  if (cached) return JSON.parse(cached);

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var currencySheet = ss.getSheetByName(APP.SHEETS.CURRENCIES);
  var sheetBtc = currencySheet ? cleanNumber_(currencySheet.getRange('B1').getValue()) : 0;
  var sheetUsdBrl = currencySheet ? cleanNumber_(currencySheet.getRange('B2').getValue()) : 0;
  var btcUsd = sheetBtc;
  var usdBrl = sheetUsdBrl;
  var source = sheetBtc ? ['Planilha'] : [];

  // A planilha é a fonte primária para o primeiro carregamento. APIs são apenas fallback.
  if (!btcUsd) {
    try {
      var spot = fetchJson_('https://api.coinbase.com/v2/prices/BTC-USD/spot');
      btcUsd = cleanNumber_(spot.data.amount);
      if (btcUsd) source.push('Coinbase');
    } catch (e) {
      console.warn('Coinbase BTC/USD indisponível: ' + e.message);
    }
  }

  if (!usdBrl) {
    try {
      var rates = fetchJson_('https://api.coinbase.com/v2/exchange-rates?currency=USD');
      usdBrl = cleanNumber_(rates.data.rates.BRL);
    } catch (e2) {
      console.warn('Coinbase USD/BRL indisponível: ' + e2.message);
    }
  }

  // Fallback do câmbio: em vez de 5.5 fixo (defasado), usa o último câmbio válido conhecido.
  if (!usdBrl) usdBrl = getLastKnownFx_();
  if (!btcUsd) throw new Error('Não foi possível obter a cotação BTC/USD.');
  if (usdBrl > 0) rememberFx_(usdBrl);

  var result = {
    btcUsd: btcUsd,
    btcBrl: btcUsd * usdBrl,
    usdBrl: usdBrl,
    source: source.join(' + ') || 'Fallback',
    updatedAt: new Date().toISOString()
  };
  cache.put(APP.CACHE.MARKET, JSON.stringify(result), APP.CACHE.MARKET_SECONDS);
  return result;
}

/** Persiste o último câmbio USD/BRL válido para servir de fallback quando a API falhar. */
function rememberFx_(fx) {
  try { PropertiesService.getScriptProperties().setProperty(APP.PROPERTIES.LAST_FX, String(fx)); } catch (e) {}
}

/** Recupera o último câmbio conhecido: Script Property, senão histórico diário, senão 5.5. */
function getLastKnownFx_() {
  var stored = cleanNumber_(PropertiesService.getScriptProperties().getProperty(APP.PROPERTIES.LAST_FX));
  if (stored > 0) return stored;
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(APP.SHEETS.DAILY);
    if (sheet && sheet.getLastRow() >= 2) {
      var values = sheet.getRange(2, 2, sheet.getLastRow() - 1, 2).getValues();
      for (var i = values.length - 1; i >= 0; i--) {
        var usd = cleanNumber_(values[i][0]);
        var brl = cleanNumber_(values[i][1]);
        if (usd > 0 && brl > 0) return brl / usd;
      }
    }
  } catch (e) {}
  return 5.5;
}

/**
 * Endpoint chamado pelo cliente APÓS o carregamento inicial. Este é o único ponto
 * autorizado a fazer chamada de rede para o halving, evitando travar o getDashboardData.
 */
function getHalvingData() {
  var cache = CacheService.getScriptCache();
  var cached = cache.get(APP.CACHE.HALVING);
  if (cached) {
    try {
      var parsed = JSON.parse(cached);
      parsed.cached = true;
      return parsed;
    } catch (cacheError) {
      cache.remove(APP.CACHE.HALVING);
    }
  }

  var now = new Date();
  var result;
  try {
    result = fetchLiveHalvingData_(now);
  } catch (liveError) {
    console.warn('Altura do bloco indisponível; usando estimativa determinística: ' + liveError.message);
    result = createHalvingFallback_(now);
  }
  cache.put(APP.CACHE.HALVING, JSON.stringify(result), APP.CACHE.HALVING_SECONDS);
  return result;
}

/**
 * Usado no carregamento inicial (getDashboardData). NUNCA faz chamada de rede:
 * devolve o cache se existir, senão uma estimativa determinística instantânea.
 * A busca ao vivo fica por conta de getHalvingData(), chamado depois pelo cliente.
 */
function getCachedHalvingData_() {
  var cached = CacheService.getScriptCache().get(APP.CACHE.HALVING);
  if (cached) {
    try {
      var parsed = JSON.parse(cached);
      parsed.cached = true;
      return parsed;
    } catch (cacheError) {}
  }
  return createHalvingFallback_(new Date());
}

/**
 * Projeta a data do próximo halving a partir de fontes públicas e gratuitas
 * (sem chave de API):
 *   1) blockchain.info — altura do bloco + carimbo de tempo de 2.016 blocos atrás
 *      para medir o ritmo REAL de blocos (não assume 10 min fixos);
 *   2) mempool.space — altura do bloco (ritmo padrão de 10 min);
 *   3) estimativa determinística (âncora do bloco 840.000).
 */
function fetchLiveHalvingData_(now) {
  var porBloco = null;
  try {
    porBloco = fetchHalvingBlockchainInfo_();
  } catch (erroBc) {
    console.warn('blockchain.info indisponível: ' + erroBc.message);
  }
  if (porBloco) return porBloco;
  try {
    return fetchHalvingMempool_(now);
  } catch (erroMp) {
    console.warn('mempool.space indisponível: ' + erroMp.message);
    throw erroMp;
  }
}

/** Fonte primária: blockchain.info (grátis, sem chave). */
function fetchHalvingBlockchainInfo_() {
  var agora = new Date();
  var tip = fetchJson_('https://blockchain.info/latestblock');
  var height = Number(tip && tip.height);
  var tipTime = Number(tip && tip.time);
  if (!(height > 0) || !isFinite(height)) throw new Error('altura inválida');
  if (!(tipTime > 0)) throw new Error('timestamp do topo inválido');

  // Ritmo médio desde o último halving (bloco 840.000): é o horizonte certo para
  // projetar 2 anos à frente. Medir só as últimas 2 semanas é ruidoso demais e
  // desloca a data em semanas.
  var minutos = HALVING_BLOCK_MINUTES;
  var blocosDesdeAncora = height - HALVING_ANCHOR_BLOCK;
  var segundosAncora = HALVING_ANCHOR_DATE.getTime() / 1000;
  if (blocosDesdeAncora > 1000 && tipTime > segundosAncora) {
    var medidoLongo = (tipTime - segundosAncora) / blocosDesdeAncora / 60;
    if (medidoLongo > 8 && medidoLongo < 13) minutos = medidoLongo;  // faixa de sanidade
  }
  // Referência secundária: últimas 2 semanas (usada só se a longa falhar).
  if (minutos === HALVING_BLOCK_MINUTES) {
    try {
      var antigo = fetchJson_('https://blockchain.info/block-height/' + (height - 2016) + '?format=json');
      var bloco = antigo && antigo.blocks && antigo.blocks[0];
      var t0 = Number(bloco && bloco.time);
      if (t0 > 0 && tipTime > t0) {
        var medido = (tipTime - t0) / 2016 / 60;
        if (medido > 8 && medido < 13) minutos = medido;
      }
    } catch (erroJanela) {
      console.warn('Ritmo de blocos indisponível; usando 10 min: ' + erroJanela.message);
    }
  }

  return montarProjecaoHalving_(agora, height, minutos, 'blockchain.info');
}

/** Fonte secundária: mempool.space (só a altura). */
function fetchHalvingMempool_(now) {
  var response = UrlFetchApp.fetch('https://mempool.space/api/blocks/tip/height', {
    muteHttpExceptions: true,
    followRedirects: true,
    headers: { 'Accept': 'text/plain', 'User-Agent': 'Satoshi-Ledger-Apps-Script/2.1' }
  });
  var status = response.getResponseCode();
  var body = String(response.getContentText() || '').trim();
  if (status < 200 || status >= 300) throw new Error('HTTP ' + status + ' em mempool.space');
  if (!/^\d+$/.test(body)) throw new Error('Resposta inválida da altura do bloco.');
  var height = Number(body);
  if (!(height > 0) || !isFinite(height)) throw new Error('Altura do bloco inválida.');
  return montarProjecaoHalving_(now, height, HALVING_BLOCK_MINUTES, 'mempool.space');
}

/** Monta o objeto do halving a partir da altura e do ritmo médio de blocos. */
function montarProjecaoHalving_(agora, height, minutosPorBloco, fonte) {
  var halvingBlock = (Math.floor(height / HALVING_INTERVAL) + 1) * HALVING_INTERVAL;
  var blocksRemaining = halvingBlock - height;
  var targetDate = new Date(agora.getTime() + blocksRemaining * minutosPorBloco * 60000);
  return {
    status: 'live',
    days: Math.ceil((targetDate.getTime() - agora.getTime()) / 86400000),
    targetDate: targetDate.toISOString(),
    source: fonte,
    blockHeight: height,
    halvingBlock: halvingBlock,
    blocksRemaining: blocksRemaining,
    avgBlockMinutes: Math.round(minutosPorBloco * 1000) / 1000,
    cached: false,
    updatedAt: agora.toISOString()
  };
}

/**
 * Projeta o próximo ciclo a partir do halving do bloco 840.000.
 * O ciclo avança automaticamente a cada 210.000 blocos estimados em 10 min/bloco.
 */
function createHalvingFallback_(now) {
  var cycleMs = HALVING_INTERVAL * HALVING_BLOCK_MINUTES * 60000;
  var elapsedMs = now.getTime() - HALVING_ANCHOR_DATE.getTime();
  var cyclesAhead = elapsedMs < 0 ? 0 : Math.floor(elapsedMs / cycleMs) + 1;
  var targetDate = new Date(HALVING_ANCHOR_DATE.getTime() + cyclesAhead * cycleMs);
  var halvingBlock = HALVING_ANCHOR_BLOCK + cyclesAhead * HALVING_INTERVAL;
  return {
    status: 'estimated',
    days: Math.ceil((targetDate.getTime() - now.getTime()) / 86400000),
    targetDate: targetDate.toISOString(),
    source: 'deterministic-date',
    blockHeight: null,
    halvingBlock: halvingBlock,
    blocksRemaining: null,
    cached: false,
    updatedAt: now.toISOString()
  };
}

// -----------------------------------------------------------------------------
// DCA FIXO + CAIXA ESPECIAL
// -----------------------------------------------------------------------------

/** Valor reservado no caixa especial (Script Property). Nunca maior que o caixa total. */
function getSpecialCashUsd_(totalCashUsd) {
  var v = cleanNumber_(PropertiesService.getScriptProperties().getProperty(APP.PROPERTIES.CASH_SPECIAL));
  if (!(v > 0)) return 0;
  // Nunca pode exceder o caixa total disponível.
  if (totalCashUsd !== undefined && v > totalCashUsd) return Math.max(0, totalCashUsd);
  return v;
}

function setSpecialCashUsd_(v) {
  PropertiesService.getScriptProperties().setProperty(APP.PROPERTIES.CASH_SPECIAL, String(Math.max(0, cleanNumber_(v))));
}

/**
 * Soma (USD) dos aportes do caixa NORMAL feitos na semana corrente (domingo→sábado).
 * Conta só origem 'Caixa' (DCA). Ignora 'Especial', 'Ajuste' e dinheiro novo.
 */
/**
 * Plano de venda: 20% da posição diluída nas 10 semanas entre 480 e 550 dias
 * depois do próximo halving. Só informativo — não mexe em saldo nem em PM.
 */
function buildSellPlan_(market, halving, contributions) {
  var plan = {
    active: false, reason: 'inactive', pctOfPosition: SELL_PLAN.PCT_OF_POSITION,
    weeksTotal: Math.round((SELL_PLAN.END_DAYS_AFTER_HALVING - SELL_PLAN.START_DAYS_AFTER_HALVING) / 7)
  };
  var daysToHalving = (halving && typeof halving.days === 'number' && isFinite(halving.days)) ? halving.days : null;
  if (daysToHalving === null) { plan.reason = 'no-halving'; return plan; }

  var halvingDate = halving && halving.targetDate ? new Date(halving.targetDate) : null;
  if (!halvingDate || isNaN(halvingDate.getTime())) { plan.reason = 'no-halving'; return plan; }

  var windowStartIso = toIsoDate_(new Date(halvingDate.getTime() + SELL_PLAN.START_DAYS_AFTER_HALVING * 86400000));
  var windowEndIso = toIsoDate_(new Date(halvingDate.getTime() + SELL_PLAN.END_DAYS_AFTER_HALVING * 86400000));
  plan.windowStartIso = windowStartIso;
  plan.windowEndIso = windowEndIso;
  plan.daysToHalving = daysToHalving;
  plan.daysToWindow = daysToHalving + SELL_PLAN.START_DAYS_AFTER_HALVING; // >0 = ainda não começou

  var pos = calculatePosition_(contributions || [], cleanNumber_(market.btcUsd));
  var priceUsd = cleanNumber_(market.btcUsd);
  var fx = cleanNumber_(market.usdBrl) || 1;

  // O alvo de venda é CONGELADO no primeiro dia da janela: 20% da posição
  // naquele momento. Depois disso, compras ou vendas não mexem mais no plano.
  var props = PropertiesService.getScriptProperties();
  var hojeIso = toIsoDate_(new Date());
  var congelado = cleanNumber_(props.getProperty(APP.PROPERTIES.SELL_TARGET_BTC));
  var congeladoEm = props.getProperty(APP.PROPERTIES.SELL_TARGET_ISO) || '';
  var janelaComecou = daysToHalving <= -SELL_PLAN.START_DAYS_AFTER_HALVING;
  if (janelaComecou && !(congelado > 0)) {
    congelado = Math.max(0, pos.quantityBtc * SELL_PLAN.PCT_OF_POSITION);
    props.setProperty(APP.PROPERTIES.SELL_TARGET_BTC, String(congelado));
    props.setProperty(APP.PROPERTIES.SELL_TARGET_ISO, hojeIso);
    congeladoEm = hojeIso;
  }
  var targetBtc = congelado > 0 ? congelado : Math.max(0, pos.quantityBtc * SELL_PLAN.PCT_OF_POSITION);
  plan.targetFrozen = congelado > 0;
  plan.targetFrozenIso = congeladoEm;
  plan.targetBtc = targetBtc;
  plan.targetUsd = round2_(targetBtc * priceUsd);
  plan.positionBtc = pos.quantityBtc;

  // Vendas já feitas dentro da janela (compras negativas, excl. ajustes).
  var soldBtc = 0, soldUsd = 0, weeksDone = 0;
  (contributions || []).forEach(function (c) {
    if (c.isAdjustment || c.isCoinAdjustment) return;
    if (c.date < windowStartIso || c.date > windowEndIso) return;
    if (c.quantity < 0 || c.amountUsd < 0) {
      soldBtc += Math.abs(c.quantity);
      soldUsd += Math.abs(c.amountUsd);
    }
  });
  plan.soldBtc = soldBtc;
  plan.soldUsd = round2_(soldUsd);
  plan.soldPct = targetBtc > 0 ? Math.min(100, soldBtc / targetBtc * 100) : 0;

  var totalWeeks = plan.weeksTotal;
  if (daysToHalving > -SELL_PLAN.START_DAYS_AFTER_HALVING) {
    plan.reason = 'before-window';
    plan.weeksRemaining = totalWeeks;
    plan.weeklyBtc = totalWeeks > 0 ? targetBtc / totalWeeks : 0;
    plan.weeklyUsd = round2_(plan.weeklyBtc * priceUsd);
    plan.weeklyBrl = round2_(plan.weeklyBtc * priceUsd * fx);
    return plan;
  }
  if (daysToHalving < -SELL_PLAN.END_DAYS_AFTER_HALVING) {
    plan.reason = 'after-window';
    plan.weeksRemaining = 0;
    plan.weeklyBtc = 0; plan.weeklyUsd = 0; plan.weeklyBrl = 0;
    return plan;
  }

  plan.active = true;
  plan.reason = 'in-window';
  var diasDentro = Math.max(0, Math.floor(-daysToHalving - SELL_PLAN.START_DAYS_AFTER_HALVING));
  weeksDone = Math.min(totalWeeks, Math.floor(diasDentro / 7));
  var weeksRemaining = Math.max(1, totalWeeks - weeksDone);
  var remainingBtc = Math.max(0, targetBtc - soldBtc);
  plan.weeksDone = weeksDone;
  plan.weeksRemaining = weeksRemaining;
  plan.remainingBtc = remainingBtc;
  plan.weeklyBtc = remainingBtc / weeksRemaining;
  plan.weeklyUsd = round2_(plan.weeklyBtc * priceUsd);
  plan.weeklyBrl = round2_(plan.weeklyBtc * priceUsd * fx);
  plan.priceUsd = round2_(priceUsd);
  plan.usdBrl = fx;
  return plan;
}

function cashBuysThisWeekUsd_(contributions, market) {
  if (!contributions || !contributions.length) return 0;
  var now = new Date();
  var dow = now.getDay(); // 0 = domingo
  var sunday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dow);
  var sundayIso = toIsoDate_(sunday);
  var saturdayIso = toIsoDate_(new Date(sunday.getTime() + 6 * 86400000));
  var sum = 0;
  contributions.forEach(function (c) {
    if (c.origin === CONTRIBUTION_ORIGIN.CASH && !c.isAdjustment && c.amountUsd > 0 &&
        c.date >= sundayIso && c.date <= saturdayIso) {
      sum += c.amountUsd;
    }
  });
  return sum;
}

/** Aporte semanal FIXO (USD), calculado 1x no início do ciclo e guardado. */
function getWeeklyFixedUsd_() {
  return cleanNumber_(PropertiesService.getScriptProperties().getProperty(APP.PROPERTIES.DCA_WEEKLY_FIXED));
}
function setWeeklyFixedUsd_(v) {
  PropertiesService.getScriptProperties().setProperty(APP.PROPERTIES.DCA_WEEKLY_FIXED, String(Math.max(0, cleanNumber_(v))));
}

/**
 * Grava o aporte semanal fixo dividindo o caixa normal por um número de semanas.
 *   aporte fixo = (caixa total − especial) ÷ weeks
 */
function setWeeklyFromWeeks_(totalCashUsd, specialUsd, weeks) {
  var w = Math.max(1, Math.round(weeks));
  var normal = Math.max(0, totalCashUsd - specialUsd);
  var weekly = normal / w;
  setWeeklyFixedUsd_(weekly);
  return weekly;
}

/**
 * INÍCIO DO CICLO (dia 725): divide o caixa normal pelo TOTAL de semanas da janela
 * (START−END dias). Usado no init único e no rebalanceamento do dia 725.
 */
function recomputeWeeklyFixed_(totalCashUsd, specialUsd) {
  var totalWeeks = Math.max(1, Math.round((DCA_PLAN.START_DAYS_BEFORE_HALVING - DCA_PLAN.END_DAYS_BEFORE_HALVING) / 7));
  return setWeeklyFromWeeks_(totalCashUsd, specialUsd, totalWeeks);
}

/**
 * RECÁLCULO PONTUAL (meio do ciclo): divide o caixa normal pelas semanas que
 * FALTAM até os 500 dias antes do halving, para o caixa durar exatamente até lá.
 * Grava como novo aporte fixo (fica constante até o próximo recálculo).
 */
function recomputeWeeklyFromRemaining_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var market = getMarketSnapshot_();
  var cash = calculateCash_(readContributions_(ss), market);
  var totalCashUsd = cleanNumber_(cash.balanceUsd);
  var specialUsd = getSpecialCashUsd_(totalCashUsd);
  var halving = getCachedHalvingData_();
  var days = halving && typeof halving.days === 'number' && isFinite(halving.days) ? halving.days : null;
  if (days === null) return { success: false, message: 'Halving indeterminado.' };
  var daysToEnd = days - DCA_PLAN.END_DAYS_BEFORE_HALVING;
  var weeksRemaining = Math.max(1, Math.ceil(daysToEnd / 7));
  var weekly = setWeeklyFromWeeks_(totalCashUsd, specialUsd, weeksRemaining);
  return { success: true, weeklyUsd: weekly, weeksRemaining: weeksRemaining, normalUsd: Math.max(0, totalCashUsd - specialUsd) };
}

/**
 * Endpoint do dashboard: reserva o caixa especial MANUALMENTE.
 * payload:
 *   { mode: 'pct', pct: 20 }                      → especial = 20% do caixa total
 *   { mode: 'fixed', amount: 1000, currency:'USD'} → especial = valor fixo (USD/BRL)
 * O valor fica travado (não reajusta sozinho). Nunca excede o caixa total.
 * Recalcula o aporte semanal fixo (caixa normal ÷ semanas restantes).
 */
function reserveSpecialCash(payload) {
  payload = payload || {};
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var market = getMarketSnapshot_();
    var cash = calculateCash_(readContributions_(ss), market);
    var totalUsd = cleanNumber_(cash.balanceUsd);
    var fx = market.usdBrl || getExchangeRate_();

    var specialUsd;
    var mode = String(payload.mode || 'pct').toLowerCase();
    if (mode === 'fixed') {
      var amount = cleanNumber_(payload.amount);
      if (!(amount > 0)) throw new Error('Informe um valor válido.');
      var cur = String(payload.currency || 'USD').toUpperCase();
      specialUsd = cur === 'BRL' ? (fx > 0 ? amount / fx : 0) : amount;
    } else {
      var pct = cleanNumber_(payload.pct);
      if (!(pct >= 0) || pct > 100) throw new Error('Porcentagem inválida.');
      specialUsd = totalUsd * (pct / 100);
    }

    // Nunca pode exceder o caixa total disponível.
    specialUsd = Math.max(0, Math.min(specialUsd, totalUsd));
    setSpecialCashUsd_(specialUsd);
    PropertiesService.getScriptProperties().setProperty(APP.PROPERTIES.SPECIAL_INITIALIZED, '1');

    // Reajusta o aporte semanal fixo pelas semanas que FALTAM (meio do ciclo) ou
    // pelo total da janela (fora/início) — usa o que estiver disponível.
    try { recomputeWeeklyFromRemaining_(); } catch (e) { recomputeWeeklyFixed_(totalUsd, specialUsd); }

    return {
      success: true,
      message: 'Caixa especial definido em US$ ' + round2_(specialUsd).toFixed(2) + '.',
      specialUsd: round2_(specialUsd),
      totalCashUsd: round2_(totalUsd),
      pctOfTotal: totalUsd > 0 ? Math.round(specialUsd / totalUsd * 1000) / 10 : 0
    };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Plano de DCA FIXO da semana. O caixa é dividido em NORMAL (DCA) e ESPECIAL (20%).
 * Cota semanal fixa = caixa normal ÷ semanas restantes até os 500 dias.
 * Payload só com campos finitos (ver RCA: nada de Infinity/NaN).
 */
function buildAccumulationPlan_(market, cash, halving, contributions) {
  var plan = { active: false, reason: 'inactive' };
  var daysToHalving = (halving && typeof halving.days === 'number' && isFinite(halving.days)) ? halving.days : null;
  if (daysToHalving === null) { plan.reason = 'no-halving'; return plan; }

  var halvingDate = halving && halving.targetDate ? new Date(halving.targetDate) : null;
  var windowStartIso = null, windowEndIso = null;
  if (halvingDate && !isNaN(halvingDate.getTime())) {
    windowStartIso = toIsoDate_(new Date(halvingDate.getTime() - DCA_PLAN.START_DAYS_BEFORE_HALVING * 86400000));
    windowEndIso = toIsoDate_(new Date(halvingDate.getTime() - DCA_PLAN.END_DAYS_BEFORE_HALVING * 86400000));
  }

  var totalCashUsd = cash ? cleanNumber_(cash.balanceUsd) : 0;
  // O caixa especial é 100% manual (botões no card). Começa em 0 até o usuário reservar.
  var specialUsd = getSpecialCashUsd_(totalCashUsd);
  var normalUsd = Math.max(0, totalCashUsd - specialUsd);

  if (daysToHalving > DCA_PLAN.START_DAYS_BEFORE_HALVING) { plan.reason = 'before-window'; plan.daysToHalving = daysToHalving; plan.windowStartIso = windowStartIso; plan.windowEndIso = windowEndIso; plan.specialUsd = round2_(specialUsd); return plan; }
  if (daysToHalving < DCA_PLAN.END_DAYS_BEFORE_HALVING) { plan.reason = 'after-window'; plan.daysToHalving = daysToHalving; plan.specialUsd = round2_(specialUsd); return plan; }

  var totalWeeks = Math.max(1, Math.round((DCA_PLAN.START_DAYS_BEFORE_HALVING - DCA_PLAN.END_DAYS_BEFORE_HALVING) / 7));
  var daysToEnd = daysToHalving - DCA_PLAN.END_DAYS_BEFORE_HALVING;
  var weeksRemaining = Math.max(1, Math.ceil(daysToEnd / 7));
  var weeksDone = Math.max(0, totalWeeks - weeksRemaining);
  var priceUsd = cleanNumber_(market.btcUsd);

  // Aportes já feitos dentro da janela (compras reais, excl. ajustes).
  var buysInWindow = 0;
  if (contributions && windowStartIso) {
    contributions.forEach(function (c) {
      if (!c.isAdjustment && c.quantity > 0 && c.amountUsd > 0 && c.date >= windowStartIso) buysInWindow++;
    });
  }

  var base = {
    daysToHalving: daysToHalving,
    totalWeeks: totalWeeks,
    weeksDone: weeksDone,
    weeksRemaining: weeksRemaining,
    buysInWindow: buysInWindow,
    windowStartIso: windowStartIso,
    windowEndIso: windowEndIso,
    cashUsd: round2_(normalUsd),
    specialUsd: round2_(specialUsd),
    specialPctOfTotal: totalCashUsd > 0 ? Math.round(specialUsd / totalCashUsd * 1000) / 10 : 0,
    totalCashUsd: round2_(totalCashUsd),
    priceUsd: round2_(priceUsd),
    usdBrl: cleanNumber_(market.usdBrl)
  };

  if (!(normalUsd > 0)) {
    base.active = false; base.reason = 'no-cash'; base.inWindow = true;
    base.suggestedUsd = 0; base.suggestedBtc = 0;
    return base;
  }

  // DCA FIXO: valor calculado 1x no início do ciclo e guardado. NÃO recalcula a
  // cada semana. Fallback: se ainda não houver valor fixo, calcula e grava agora.
  var weekly = getWeeklyFixedUsd_();
  if (!(weekly > 0)) weekly = recomputeWeeklyFixed_(totalCashUsd, specialUsd);
  weekly = Math.min(weekly, normalUsd);  // nunca mais que o caixa normal (resíduo final)

  // Quanto já foi aportado NESTA semana (domingo→sábado) com o caixa NORMAL (DCA).
  // Aportes 'Especial' NÃO contam. Tolerância de US$1 para fechar a semana.
  var doneThisWeek = cashBuysThisWeekUsd_(contributions, market);
  var remainingWeek = weekly - doneThisWeek;
  if (remainingWeek < 1) remainingWeek = 0;           // já cumpriu a cota desta semana
  var suggestedUsd = Math.min(remainingWeek, normalUsd);

  base.active = true;
  base.reason = 'active';
  base.inWindow = true;
  base.weeklyTargetUsd = round2_(weekly);             // cota cheia da semana
  base.doneThisWeekUsd = round2_(doneThisWeek);       // já aportado nesta semana
  base.weekComplete = (suggestedUsd <= 0);            // semana concluída?
  base.suggestedUsd = round2_(suggestedUsd);          // quanto FALTA aportar
  base.suggestedBtc = priceUsd > 0 ? suggestedUsd / priceUsd : 0;
  return base;
}

function round2_(v) {
  var x = Number(v);
  return isFinite(x) ? Math.round(x * 100) / 100 : 0;
}

function getOnChainData() {
  return getOnChainSnapshot_(getMarketSnapshot_());
}

function getCachedOnChainSnapshot_() {
  var cached = CacheService.getScriptCache().get(APP.CACHE.ONCHAIN);
  return cached ? JSON.parse(cached) : createEmptyOnChainSnapshot_();
}

function createEmptyOnChainSnapshot_() {
  return {
    realizedPrice: null,
    sthRealizedPrice: null,
    lthRealizedPrice: null,
    asOf: null,
    mvrv: null,
    activeAddresses: null,
    hashRateEh: null,
    difficulty: null,
    fees: null,
    sources: [],
    updatedAt: null
  };
}

function getOnChainSnapshot_(market) {
  var cache = CacheService.getScriptCache();
  var cached = cache.get(APP.CACHE.ONCHAIN);
  if (cached) return JSON.parse(cached);

  var result = createEmptyOnChainSnapshot_();
  result.updatedAt = new Date().toISOString();

  // BGeometrics (bitcoin-data.com): API pública, sem chave.
  // Limite do plano gratuito: 10 requisições/hora e atraso de até 7 dias.
  // Fazemos 4 chamadas e guardamos por 6h; se falhar, reaproveita a última leitura.
  var props = PropertiesService.getScriptProperties();
  try {
    var rp = bgMetric_('realized-price', 'realizedPrice');
    var sth = bgMetric_('sth-realized-price', 'sthRealizedPrice');
    var lth = bgMetric_('lth-realized-price', 'lthRealizedPrice');
    var mv = bgMetric_('mvrv', 'mvrv');
    if (!rp && !sth && !lth) throw new Error('sem dados (limite de requisições?)');
    if (rp) { result.realizedPrice = rp.value; result.asOf = rp.date; }
    if (sth) result.sthRealizedPrice = sth.value;
    if (lth) result.lthRealizedPrice = lth.value;
    if (mv) result.mvrv = mv.value;
    result.sources.push('BGeometrics');
    props.setProperty('ONCHAIN_LAST', JSON.stringify(result));
  } catch (bgError) {
    console.warn('BGeometrics indisponível: ' + bgError.message);
    var ultima = props.getProperty('ONCHAIN_LAST');
    if (ultima) {
      try { result = JSON.parse(ultima); result.sources.push('cache'); } catch (e2) {}
    }
  }

  try {
    var feeData = fetchJson_('https://mempool.space/api/v1/fees/recommended');
    result.fees = {
      fastest: cleanNumber_(feeData.fastestFee),
      halfHour: cleanNumber_(feeData.halfHourFee),
      hour: cleanNumber_(feeData.hourFee),
      economy: cleanNumber_(feeData.economyFee)
    };
    result.sources.push('mempool.space');
  } catch (feeError) {
    console.warn('Taxas mempool indisponíveis: ' + feeError.message);
  }

  try {
    var mining = fetchJson_('https://mempool.space/api/v1/mining/hashrate/1m');
    result.hashRateEh = cleanNumber_(mining.currentHashrate) / 1e18;
    result.difficulty = cleanNumber_(mining.currentDifficulty);
    if (result.sources.indexOf('mempool.space') === -1) result.sources.push('mempool.space');
  } catch (hashError) {
    console.warn('Hashrate indisponível: ' + hashError.message);
  }

  if (result.realizedPrice && !result.mvrv) result.mvrv = market.btcUsd / result.realizedPrice;
  cache.put(APP.CACHE.ONCHAIN, JSON.stringify(result), APP.CACHE.ONCHAIN_SECONDS);
  return result;
}

/** Lê uma métrica da BGeometrics. Devolve { value, date } ou null. */
function bgMetric_(slug, campo) {
  var json = fetchJson_('https://bitcoin-data.com/v1/' + slug + '/last');
  var valor = cleanNumber_(json && json[campo]);
  if (!(valor > 0)) return null;
  return { value: valor, date: json.d || null };
}

function fetchJson_(url, options) {
  var requestOptions = options || {};
  requestOptions.muteHttpExceptions = true;
  requestOptions.followRedirects = true;
  requestOptions.headers = Object.assign({
    'Accept': 'application/json',
    'User-Agent': 'Satoshi-Ledger-Apps-Script/2.0'
  }, requestOptions.headers || {});
  var response = UrlFetchApp.fetch(url, requestOptions);
  var status = response.getResponseCode();
  var body = response.getContentText();
  if (status < 200 || status >= 300) throw new Error('HTTP ' + status + ' em ' + url.split('?')[0]);
  return JSON.parse(body);
}

// -----------------------------------------------------------------------------
// POSIÇÃO, HISTÓRICOS E SNAPSHOTS
// -----------------------------------------------------------------------------

function calculatePosition_(contributions, currentPrice) {
  var quantity = 0;
  var costBasis = 0;
  var costBasisBrl = 0;
  var grossInvested = 0;
  var totalWithdrawn = 0;
  var realizedPnl = 0;
  var firstDate = null;

  contributions.forEach(function (item) {
    // Linhas de ajuste de caixa não são compra/venda de BTC: não afetam posição.
    if (item.isAdjustment || item.origin === CONTRIBUTION_ORIGIN.ADJUSTMENT) return;

    // Ajuste de MOEDA: corrige a quantidade (sats perdidos em taxas, poeira...).
    // O custo investido não muda — só a quantidade, e portanto o preço médio.
    if (item.isCoinAdjustment || item.origin === CONTRIBUTION_ORIGIN.COIN_ADJUSTMENT) {
      var deltaMoeda = Number(item.quantity) || 0;
      quantity = Math.max(0, quantity + deltaMoeda);
      return;
    }
    var qty = Number(item.quantity) || 0;
    var amount = Number(item.amountUsd) || 0;
    // Câmbio implícito do próprio aporte (Cotação R$ / Cotação $), com fallback.
    var fx = (item.priceBrl && item.priceUsd) ? item.priceBrl / item.priceUsd : 0;
    if (item.date && !firstDate) firstDate = item.date;
    if (qty > 0 && amount > 0) {
      quantity += qty;
      costBasis += amount;
      costBasisBrl += fx ? amount * fx : 0;
      grossInvested += amount;
    } else if (qty < 0 || amount < 0) {
      var soldQty = Math.min(Math.abs(qty), Math.max(0, quantity));
      var proceeds = Math.abs(amount);
      var averageCost = quantity > 0 ? costBasis / quantity : 0;
      var averageCostBrl = quantity > 0 ? costBasisBrl / quantity : 0;
      var removedCost = averageCost * soldQty;
      var removedCostBrl = averageCostBrl * soldQty;
      realizedPnl += proceeds - removedCost;
      totalWithdrawn += proceeds;
      quantity = Math.max(0, quantity - soldQty);
      costBasis = Math.max(0, costBasis - removedCost);
      costBasisBrl = Math.max(0, costBasisBrl - removedCostBrl);
    }
  });

  var marketValue = quantity * currentPrice;
  var unrealizedPnl = marketValue - costBasis;
  return {
    quantityBtc: quantity,
    costBasisUsd: costBasis,
    costBasisBrl: costBasisBrl,
    averagePrice: quantity > 0 ? costBasis / quantity : 0,
    averagePriceBrl: quantity > 0 ? costBasisBrl / quantity : 0,
    marketValueUsd: marketValue,
    grossInvestedUsd: grossInvested,
    totalWithdrawnUsd: totalWithdrawn,
    netInvestedUsd: grossInvested - totalWithdrawn,
    realizedPnlUsd: realizedPnl,
    unrealizedPnlUsd: unrealizedPnl,
    totalPnlUsd: realizedPnl + unrealizedPnl,
    unrealizedPnlPct: costBasis > 0 ? unrealizedPnl / costBasis * 100 : 0,
    firstContributionDate: firstDate
  };
}

/** Registra no máximo uma linha por dia; se já existir, atualiza. */
function recordDailySnapshot() {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(APP.SHEETS.DAILY) || ensureSheet_(ss, APP.SHEETS.DAILY, APP.HEADERS.DAILY);
    var market = getMarketSnapshot_();
    var contributions = readContributions_(ss);
    var position = calculatePosition_(contributions, market.btcUsd);
    var today = toIsoDate_(new Date());
    var targetRow = sheet.getLastRow() + 1;

    if (sheet.getLastRow() >= 2) {
      var dates = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
      for (var i = dates.length - 1; i >= 0; i--) {
        if (dates[i][0] && toIsoDate_(dates[i][0]) === today) {
          targetRow = i + 2;
          break;
        }
      }
    }

    sheet.getRange(targetRow, 1, 1, 6).setValues([[
      fromIsoDate_(today),
      position.marketValueUsd,
      position.marketValueUsd * market.usdBrl,
      position.quantityBtc,
      position.averagePrice,
      market.btcUsd
    ]]);
    formatDailyRow_(sheet, targetRow);
    // Salvaguarda: renormaliza as linhas recentes com a lógica atual (evita "degraus"
    // de versões antigas) SEM varrer todo o histórico — o que cresceria O(n) e poderia
    // estourar o limite de 6 min. O rebuild COMPLETO fica no menu (rebuildHistories /
    // Backup + reconstruir), para quando for preciso reprocessar tudo.
    rebuildRecentDailyUnlocked_(ss, 60);
    SpreadsheetApp.flush();
    return { success: true, message: 'Snapshot diário registrado e histórico recente normalizado.', date: today };
  } finally {
    lock.releaseLock();
  }
}

function formatDailyRow_(sheet, row) {
  sheet.getRange(row, 1).setNumberFormat('dd/MM/yyyy');
  sheet.getRange(row, 2, 1, 2).setNumberFormat('$#,##0.00');
  sheet.getRange(row, 4).setNumberFormat('0.00000000');
  sheet.getRange(row, 5, 1, 2).setNumberFormat('$#,##0.00');
  sheet.getRange(row, 1, 1, 6).setFontFamily('Arial').setFontSize(9)
    .setBorder(true, true, true, true, true, true, '#E5E7EB', SpreadsheetApp.BorderStyle.SOLID);
  var average = cleanNumber_(sheet.getRange(row, 5).getValue());
  var price = cleanNumber_(sheet.getRange(row, 6).getValue());
  sheet.getRange(row, 5).setBackground(price > average ? '#D1FAE5' : price < average ? '#FEE2E2' : '#FEF3C7');
}

/**
 * Duplica a aba "Histórico Diário" para uma aba de backup com data/hora no nome.
 * Retorna o nome da aba criada. Usado antes de reprocessar o histórico.
 */
function backupDailyHistory_(ss) {
  ss = ss || SpreadsheetApp.getActiveSpreadsheet();
  var source = ss.getSheetByName(APP.SHEETS.DAILY);
  if (!source) throw new Error('Aba "' + APP.SHEETS.DAILY + '" não encontrada.');
  var stamp = Utilities.formatDate(new Date(), getTimeZone_(), 'yyyy-MM-dd_HH-mm-ss');
  var name = 'BKP Diário ' + stamp;
  // Nome de aba limitado a 100 chars; o nosso é curto, mas garantimos unicidade.
  if (ss.getSheetByName(name)) name = name + '_' + Math.floor(Math.random() * 1000);
  var copy = source.copyTo(ss);
  copy.setName(name);
  // Move o backup para o fim para não atrapalhar a navegação.
  ss.setActiveSheet(copy);
  ss.moveActiveSheet(ss.getNumSheets());
  ss.setActiveSheet(source);
  return name;
}

/** Endpoint de menu: gera backup da aba Diário e só então reconstrói os históricos. */
function backupAndRebuildHistories() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var backupName = backupDailyHistory_(ss);
  var res = rebuildHistories();
  var msg = 'Backup criado em "' + backupName + '". Históricos reconstruídos (' +
    (res && res.rows != null ? res.rows + ' dias' : 'ok') + '). ' +
    'Confira o dashboard; depois pode excluir a aba de backup.';
  try { ss.toast(msg, 'Satoshi Ledger', 12); } catch (e) {}
  return { success: true, message: msg, backupSheet: backupName };
}

/** Recalcula saldo, quantidade e PM em cada data, preservando preço BTC e câmbio histórico implícito. */
// -----------------------------------------------------------------------------
// COTAÇÃO DO DÓLAR (USD→BRL) POR DATA
// -----------------------------------------------------------------------------
//
// A coluna I da aba "Aportes" guarda o câmbio do dia de cada aporte. Fontes
// públicas gratuitas, sem chave: PTAX do Banco Central (oficial) e Frankfurter
// (Banco Central Europeu) como reserva. Fins de semana e feriados usam a cotação
// do último dia útil anterior.

/** Série diária USD→BRL: { 'yyyy-mm-dd': taxa } — só dias úteis. */
function buscarCotacoesDolar_(inicioIso, fimIso) {
  var out = {};
  var ini = String(inicioIso).slice(0, 10), fim = String(fimIso).slice(0, 10);
  var p = ini.split('-'), f = fim.split('-');
  var br = function (a) { return a[1] + '-' + a[2] + '-' + a[0]; };  // MM-DD-YYYY

  // 1) PTAX (Banco Central)
  try {
    var url = 'https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoDolarPeriodo'
      + '(dataInicial=@dataInicial,dataFinalCotacao=@dataFinalCotacao)'
      + '?@dataInicial=%27' + br(p) + '%27&@dataFinalCotacao=%27' + br(f) + '%27'
      + '&$format=json&$top=10000';
    var resp = fetchJson_(url);
    (resp && resp.value ? resp.value : []).forEach(function (r) {
      var v = Number(r.cotacaoVenda) || Number(r.cotacaoCompra) || 0;
      var d = String(r.dataHoraCotacao || '').slice(0, 10);
      if (v > 0 && d) out[d] = v;
    });
  } catch (e) {
    console.warn('PTAX indisponível: ' + e.message);
  }
  if (Object.keys(out).length) return out;

  // 2) Frankfurter (BCE)
  try {
    var r2 = fetchJson_('https://api.frankfurter.app/' + ini + '..' + fim + '?from=USD&to=BRL');
    var taxas = (r2 && r2.rates) ? r2.rates : {};
    Object.keys(taxas).forEach(function (d) {
      var v = Number(taxas[d].BRL) || 0;
      if (v > 0) out[d] = v;
    });
  } catch (e2) {
    console.warn('Frankfurter indisponível: ' + e2.message);
  }
  return out;
}

/** Preenche as datas sem cotação com a do último dia útil anterior (e a primeira para trás). */
function completarSerieDolar_(serie, inicioIso, fimIso) {
  var datas = Object.keys(serie).sort();
  if (!datas.length) return serie;
  var out = {}, ultimo = serie[datas[0]];
  var d = fromIsoDate_(inicioIso);
  var fim = fromIsoDate_(fimIso);
  while (d <= fim) {
    var iso = toIsoDate_(d);
    if (serie[iso]) ultimo = serie[iso];
    out[iso] = ultimo;
    d = new Date(d.getTime() + 86400000);
  }
  return out;
}

/** Cotação do dólar numa data específica (com cache de 6 h). */
function cotacaoDolarDoDia_(iso) {
  iso = String(iso).slice(0, 10);
  var cache = CacheService.getScriptCache();
  var chave = 'fx_' + iso;
  var salvo = cache.get(chave);
  if (salvo) return Number(salvo) || 0;

  var inicio = toIsoDate_(new Date(fromIsoDate_(iso).getTime() - 7 * 86400000));
  var serie = completarSerieDolar_(buscarCotacoesDolar_(inicio, iso), inicio, iso);
  var valor = Number(serie[iso]) || 0;
  if (!(valor > 0)) {
    try { valor = cleanNumber_(getExchangeRate_()) || 0; } catch (e) { valor = 0; }
  }
  if (valor > 0) cache.put(chave, String(valor), 21600);
  return valor;
}

/** Garante a coluna "Dólar R$" na aba Aportes. */
function ensureDolarColumn_(ss) {
  ss = ss || SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(APP.SHEETS.CONTRIBUTIONS);
  if (!sheet) return;
  if (String(sheet.getRange(1, FX_COLUMN).getValue() || '').trim() !== FX_HEADER) {
    sheet.getRange(1, FX_COLUMN).setValue(FX_HEADER).setFontWeight('bold');
  }
}

/**
 * Preenche a coluna "Dólar R$" dos aportes que estiverem vazios.
 * Use pelo menu: ₿ Satoshi Ledger → Preencher cotação do dólar.
 */
function preencherDolarAportes() {
  var res = preencherDolarAportes_(false);
  try { SpreadsheetApp.getActiveSpreadsheet().toast(res.message, 'Satoshi Ledger', 8); } catch (e) {}
  return res;
}

/** Versão de teste: simula sem gravar. */
function testarPreenchimentoDolar() {
  var r = preencherDolarAportes_(true);
  Logger.log(JSON.stringify({ preenchidos: r.preenchidos, primeira: r.primeira, ultima: r.ultima, exemplo: r.exemplo, message: r.message }, null, 2));
  return r;
}

function preencherDolarAportes_(dryRun) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(APP.SHEETS.CONTRIBUTIONS);
  if (!sheet || sheet.getLastRow() < 2) return { success: false, preenchidos: 0, message: 'Nenhum aporte cadastrado.' };
  ensureDolarColumn_(ss);

  var n = sheet.getLastRow() - 1;
  var rows = sheet.getRange(2, 1, n, FX_COLUMN).getValues();
  var vazios = [], primeira = null, ultima = null;
  rows.forEach(function (r, i) {
    if (!r[0]) return;
    if (!cleanNumber_(r[8])) vazios.push(i + 2);
    var d = toIsoDate_(r[0]);
    if (d && (!primeira || d < primeira)) primeira = d;
    if (d && (!ultima || d > ultima)) ultima = d;
  });
  if (!vazios.length) return { success: true, preenchidos: 0, message: 'Todos os aportes já têm a cotação do dólar.' };

  var serie = completarSerieDolar_(buscarCotacoesDolar_(primeira, ultima), primeira, ultima);
  var valores = vazios.map(function (linha) {
    var iso = toIsoDate_(rows[linha - 2][0]);
    var v = Number(serie[iso]) || 0;
    if (!(v > 0)) { try { v = cleanNumber_(getExchangeRate_()) || 0; } catch (e) { v = 0; } }
    return [v];
  });

  if (!dryRun) {
    // grava a coluna inteira de uma vez (1 chamada, em vez de N)
    var coluna = rows.map(function (r) { return [cleanNumber_(r[8]) || 0]; });
    vazios.forEach(function (linha, i) { coluna[linha - 2][0] = valores[i][0]; });
    var rng = sheet.getRange(2, FX_COLUMN, coluna.length, 1);
    rng.setValues(coluna);
    rng.setNumberFormat('"R$" #,##0.0000');
    SpreadsheetApp.flush();
  }
  var exemplo = vazios.length ? [toIsoDate_(rows[vazios[0] - 2][0]), valores[0][0]] : null;
  return {
    success: true,
    preenchidos: vazios.length,
    primeira: primeira,
    ultima: ultima,
    exemplo: exemplo,
    message: (dryRun ? '[TESTE] ' : '') + vazios.length + ' aporte(s) com a cotação do dólar preenchida.'
  };
}

// -----------------------------------------------------------------------------
// HISTÓRICO INICIAL DE PREÇOS
// -----------------------------------------------------------------------------
//
// Quem acabou de montar a planilha só tem a aba "Aportes" preenchida. O
// "Histórico Diário" começa vazio e só passa a crescer depois que o gatilho
// diário roda — por isso os gráficos de patrimônio e de preço médio ficam sem
// passado. Esta rotina completa as datas FALTANTES do primeiro aporte até hoje,
// usando o fechamento diário do BTC de uma fonte pública gratuita.
//
// Regras:
//  - nunca sobrescreve linha existente (só adiciona datas que faltam);
//  - roda quantas vezes quiser (idempotente);
//  - se a fonte de preço falhar, usa o preço do próprio aporte mais próximo.

/** ISO (yyyy-MM-dd) a partir de um timestamp UTC — o candle diário é fechado em UTC. */
function isoUtc_(ms) {
  var d = new Date(Number(ms));
  var p = function (v) { return (v < 10 ? '0' : '') + v; };
  return d.getUTCFullYear() + '-' + p(d.getUTCMonth() + 1) + '-' + p(d.getUTCDate());
}

/**
 * Fechamentos diários do BTC entre duas datas ISO: { 'yyyy-mm-dd': close }.
 * Fontes públicas gratuitas, sem chave: Coinbase Exchange (principal) e Kraken
 * (reserva). A Binance responde 451 a partir dos servidores do Google, por isso
 * não é usada.
 */
function buscarFechamentosDiarios_(inicioIso, fimIso) {
  var out = {};
  // começa 1 dia antes: a corretora não devolve o candle do dia inicial
  var inicio = fromIsoDate_(inicioIso).getTime() - 86400000;
  var fim = fromIsoDate_(fimIso).getTime() + 86400000;

  // --- 1) Coinbase: até 300 candles por chamada ---
  try {
    var cursor = inicio, voltas = 0;
    while (cursor < fim && voltas < 20) {
      voltas++;
      var blocoFim = Math.min(fim, cursor + 300 * 86400000);
      var url = 'https://api.exchange.coinbase.com/products/BTC-USD/candles?granularity=86400'
        + '&start=' + new Date(cursor).toISOString()
        + '&end=' + new Date(blocoFim).toISOString();
      var data = fetchJson_(url);
      if (!data || !data.length) break;
      data.forEach(function (k) {
        var preco = Number(k[4]);                 // [time, low, high, open, close, volume]
        if (preco > 0) out[isoUtc_(Number(k[0]) * 1000)] = preco;
      });
      cursor = blocoFim;
    }
  } catch (e) {
    console.warn('Coinbase indisponível: ' + e.message);
  }
  if (Object.keys(out).length) return out;

  // --- 2) Kraken: até 720 candles por chamada ---
  try {
    var since = Math.floor(inicio / 1000) - 86400, voltasK = 0;
    while (voltasK < 8) {
      voltasK++;
      var resp = fetchJson_('https://api.kraken.com/0/public/OHLC?pair=XBTUSD&interval=1440&since=' + since);
      var serie = resp && resp.result ? (resp.result.XXBTZUSD || resp.result.XBTUSD) : null;
      if (!serie || !serie.length) break;
      var ultimo = 0;
      serie.forEach(function (k) {
        var preco = Number(k[4]);                 // [time, open, high, low, close, ...]
        if (preco > 0) out[isoUtc_(Number(k[0]) * 1000)] = preco;
        ultimo = Number(k[0]);
      });
      if (!ultimo || ultimo <= since) break;
      since = ultimo;
      if (ultimo * 1000 >= fim) break;
    }
  } catch (e) {
    console.warn('Kraken indisponível: ' + e.message);
  }
  return out;
}

/**
 * Completa o Histórico Diário (e o Mensal) do primeiro aporte até hoje.
 * Use pelo menu: ₿ Satoshi Ledger → Carregar histórico de preços (1º uso).
 */
function preencherHistoricoDiario() {
  var resultado = preencherHistoricoDiario_(false);
  try {
    SpreadsheetApp.getActiveSpreadsheet().toast(resultado.message, 'Satoshi Ledger', 8);
  } catch (e) {}
  return resultado;
}

/** Versão de teste: calcula tudo e NÃO escreve na planilha. */
function testarPreenchimentoHistorico() {
  var r = preencherHistoricoDiario_(true);
  Logger.log(JSON.stringify({ adicionados: r.adicionados, primeiraData: r.primeiraData, ultimaData: r.ultimaData, exemplo: r.exemplo, fonte: r.fonte, message: r.message }, null, 2));
  return r;
}

function preencherHistoricoDiario_(dryRun) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var contributions = readContributions_(ss).filter(function (c) { return !c.isAdjustment; });
    if (!contributions.length) {
      return { success: false, adicionados: 0, message: 'Cadastre pelo menos um aporte antes de carregar o histórico.' };
    }

    var sheet = ss.getSheetByName(APP.SHEETS.DAILY) || ensureSheet_(ss, APP.SHEETS.DAILY, APP.HEADERS.DAILY);

    // datas que já existem
    var existentes = {};
    if (sheet.getLastRow() > 1) {
      sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues().forEach(function (r) {
        if (r[0]) existentes[toIsoDate_(r[0])] = true;
      });
    }

    var inicioIso = contributions[0].date;
    var hojeIso = toIsoDate_(new Date());

    // datas faltantes (na ordem)
    var faltantes = [];
    for (var d = fromIsoDate_(inicioIso); toIsoDate_(d) <= hojeIso; d = new Date(d.getTime() + 86400000)) {
      var iso = toIsoDate_(d);
      if (!existentes[iso]) faltantes.push(iso);
      if (faltantes.length > 4000) break;   // trava de segurança
    }
    if (!faltantes.length) {
      return { success: true, adicionados: 0, message: 'O histórico já está completo — nada a fazer.' };
    }

    // preços: API pública; se falhar, cai para os preços dos próprios aportes
    var precos = {};
    var fonte = 'binance';
    try { precos = buscarFechamentosDiarios_(inicioIso, hojeIso); } catch (e) { precos = {}; }
    var porAporte = {};
    contributions.forEach(function (c) { if (c.priceUsd > 0) porAporte[c.date] = c.priceUsd; });
    if (!Object.keys(precos).length) fonte = 'aportes';

    var fx = getExchangeRate_();
    if (!(fx > 0)) fx = 1;

    // posição incremental (O(dias + aportes))
    var ordenados = contributions.slice().sort(function (a, b) { return a.date.localeCompare(b.date); });
    var idx = 0, qtd = 0, custo = 0, ultimoPreco = 0;
    var linhas = [];
    var faltantesSet = {};
    faltantes.forEach(function (iso) { faltantesSet[iso] = true; });

    for (var dia = fromIsoDate_(inicioIso); ; dia = new Date(dia.getTime() + 86400000)) {
      var isoDia = toIsoDate_(dia);
      if (isoDia > hojeIso) break;

      // aplica aportes do dia
      while (idx < ordenados.length && ordenados[idx].date <= isoDia) {
        var c = ordenados[idx];
        var q = Number(c.quantity) || 0;
        var v = Number(c.amountUsd) || 0;
        if (c.isCoinAdjustment) {
          qtd = Math.max(0, qtd + q);
        } else if (q > 0 && v > 0) {
          qtd += q; custo += v;
        } else if (q < 0 || v < 0) {
          var vendido = Math.min(Math.abs(q), qtd);
          var pm = qtd > 0 ? custo / qtd : 0;
          qtd = Math.max(0, qtd - vendido);
          custo = Math.max(0, custo - pm * vendido);
        }
        if (c.priceUsd > 0) ultimoPreco = Number(c.priceUsd);
        idx++;
      }

      var preco = precos[isoDia];
      if (!(preco > 0)) preco = porAporte[isoDia];
      if (!(preco > 0)) preco = ultimoPreco;
      if (!(preco > 0)) continue;   // sem preço nenhum: pula o dia
      ultimoPreco = preco;

      if (faltantesSet[isoDia]) {
        var valor = qtd * preco;
        linhas.push([fromIsoDate_(isoDia), valor, valor * fx, qtd, qtd > 0 ? custo / qtd : 0, preco]);
      }
    }

    if (!linhas.length) {
      return { success: false, adicionados: 0, message: 'Não foi possível obter preços para preencher o histórico.' };
    }

    if (!dryRun) {
      var alvo = sheet.getLastRow() + 1;
      sheet.getRange(alvo, 1, linhas.length, 6).setValues(linhas);
      // formata o bloco inteiro de uma vez (rápido) e colore a coluna do PM
      var rng = sheet.getRange(alvo, 1, linhas.length, 6);
      rng.setFontFamily('Arial').setFontSize(9)
        .setBorder(true, true, true, true, true, true, '#E5E7EB', SpreadsheetApp.BorderStyle.SOLID);
      sheet.getRange(alvo, 1, linhas.length, 1).setNumberFormat('dd/MM/yyyy');
      sheet.getRange(alvo, 2, linhas.length, 2).setNumberFormat('$#,##0.00');
      sheet.getRange(alvo, 4, linhas.length, 1).setNumberFormat('0.00000000');
      sheet.getRange(alvo, 5, linhas.length, 2).setNumberFormat('$#,##0.00');
      // mantém a aba ordenada por data
      var total = sheet.getLastRow() - 1;
      if (total > 1) sheet.getRange(2, 1, total, 6).sort([{ column: 1, ascending: true }]);
      rebuildMonthlyHistory_(ss);
      SpreadsheetApp.flush();
    }

    var msg = (dryRun ? '[TESTE] ' : '') + linhas.length + ' dia(s) adicionado(s) ao Histórico Diário'
      + (dryRun ? '' : ' e resumo mensal recalculado')
      + ' · preços: ' + (fonte === 'binance' ? 'fechamento diário (fonte pública)' : 'seus próprios aportes');
    return {
      success: true,
      adicionados: linhas.length,
      primeiraData: faltantes[0],
      ultimaData: faltantes[faltantes.length - 1],
      fonte: fonte,
      exemplo: linhas[linhas.length - 1],
      message: msg
    };
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

function rebuildHistories() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var dailySheet = ss.getSheetByName(APP.SHEETS.DAILY);
  if (!dailySheet || dailySheet.getLastRow() < 2) {
    return recordDailySnapshot();
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var contributions = readContributions_(ss);
    var values = dailySheet.getRange(2, 1, dailySheet.getLastRow() - 1, 6).getValues();
    var output = [];

    values.forEach(function (row) {
      if (!row[0]) return;
      var date = toIsoDate_(row[0]);
      var price = cleanNumber_(row[5]);
      if (!price) return;
      var existingUsd = cleanNumber_(row[1]);
      var existingBrl = cleanNumber_(row[2]);
      var impliedFx = existingUsd > 0 && existingBrl > 0 ? existingBrl / existingUsd : 0;
      var state = calculatePosition_(contributions.filter(function (c) { return c.date <= date; }), price);
      var fx = impliedFx || getExchangeRate_();
      output.push([fromIsoDate_(date), state.marketValueUsd, state.marketValueUsd * fx, state.quantityBtc, state.averagePrice, price]);
    });

    output.sort(function (a, b) { return a[0] - b[0]; });
    if (dailySheet.getLastRow() > 1) dailySheet.getRange(2, 1, dailySheet.getLastRow() - 1, 6).clearContent();
    if (output.length) dailySheet.getRange(2, 1, output.length, 6).setValues(output);
    rebuildMonthlyHistory_(ss);
    formatSheets_(ss);
    SpreadsheetApp.flush();
    return { success: true, message: 'Históricos reconstruídos.', rows: output.length };
  } finally {
    lock.releaseLock();
  }
}

function rebuildMonthlyHistory_(ss) {
  var monthlySheet = ss.getSheetByName(APP.SHEETS.MONTHLY) || ensureSheet_(ss, APP.SHEETS.MONTHLY, APP.HEADERS.MONTHLY);
  var daily = readDailyHistory_(ss);
  var contributions = readContributions_(ss);
  var analytics = buildMonthlyAnalytics_(daily, contributions);
  var rows = analytics.map(function (item) {
    // Coluna "Mês" gravada como string M/yy (ex.: 10/26), mesmo formato da geração
    // legada (gravarHistoricoMensal), para a aba não misturar datas e strings.
    return [monthLabel_(item.month), item.startUsd, item.endUsd, item.startBrl, item.endBrl, item.netFlowUsd];
  });

  if (monthlySheet.getLastRow() > 1) monthlySheet.getRange(2, 1, monthlySheet.getLastRow() - 1, 6).clearContent();
  if (rows.length) monthlySheet.getRange(2, 1, rows.length, 6).setValues(rows);
}

function buildMonthlyAnalytics_(daily, contributions) {
  if (!daily || !daily.length) return [];
  var groups = {};
  daily.forEach(function (row) {
    var month = row.date.slice(0, 7);
    if (!groups[month]) groups[month] = [];
    groups[month].push(row);
  });

  var months = Object.keys(groups).sort();
  var previousEndUsd = null;
  var previousEndBrl = null;
  return months.map(function (month) {
    var rows = groups[month].sort(function (a, b) { return a.date.localeCompare(b.date); });
    var first = rows[0];
    var last = rows[rows.length - 1];
    // Fluxo mensal considera apenas dinheiro NOVO. Ajustes de caixa e aportes
    // pagos com o caixa (capital reciclado, já contabilizado na venda que abasteceu
    // o caixa) NÃO são fluxo novo e ficam de fora do Modified Dietz / aporte-resgate.
    var flows = contributions.filter(function (item) {
      return item.date.slice(0, 7) === month && !item.isAdjustment && item.origin !== CONTRIBUTION_ORIGIN.CASH;
    });
    var netFlow = flows.reduce(function (sum, item) { return sum + item.amountUsd; }, 0);
    var initialFlows = contributions.filter(function (item) {
      return item.date <= first.date && !item.isAdjustment && item.origin !== CONTRIBUTION_ORIGIN.CASH;
    }).reduce(function (sum, item) { return sum + item.amountUsd; }, 0);
    var firstFx = first.balanceUsd > 0 ? first.balanceBrl / first.balanceUsd : 0;
    var startUsd = previousEndUsd === null ? Math.max(0, first.balanceUsd - initialFlows) : previousEndUsd;
    var startBrl = previousEndBrl === null ? Math.max(0, first.balanceBrl - initialFlows * firstFx) : previousEndBrl;
    var dietz = calculateModifiedDietz_(startUsd, last.balanceUsd, flows, month);
    previousEndUsd = last.balanceUsd;
    previousEndBrl = last.balanceBrl;
    // Retorno do mês = variação do preço do BTC (time-weighted). Como a carteira é
    // 100% BTC, é o retorno real do período e não é afetado por aportes/resgates.
    // O Modified Dietz fica como referência.
    var p0 = cleanNumber_(first.btcPrice), p1 = cleanNumber_(last.btcPrice);
    var ret = (p0 > 0 && p1 > 0) ? ((p1 / p0) - 1) * 100 : dietz;
    return {
      month: month,
      startUsd: startUsd,
      endUsd: last.balanceUsd,
      startBrl: startBrl,
      endBrl: last.balanceBrl,
      netFlowUsd: netFlow,
      ret: ret,
      modifiedDietz: dietz,
      pnlExFlowsUsd: last.balanceUsd - startUsd - netFlow
    };
  });
}

function calculateModifiedDietz_(startValue, endValue, flows, month) {
  var parts = month.split('-');
  var start = new Date(Number(parts[0]), Number(parts[1]) - 1, 1);
  var end = new Date(Number(parts[0]), Number(parts[1]), 0);
  var totalDays = Math.max(1, (end - start) / 86400000 + 1);
  var netFlow = 0;
  var weightedFlow = 0;
  flows.forEach(function (flow) {
    var date = fromIsoDate_(flow.date);
    var amount = Number(flow.amountUsd) || 0;
    var elapsed = Math.max(0, Math.min(totalDays, (date - start) / 86400000));
    var weight = (totalDays - elapsed) / totalDays;
    netFlow += amount;
    weightedFlow += amount * weight;
  });
  var denominator = startValue + weightedFlow;
  if (!denominator) return null;
  return (endValue - startValue - netFlow) / denominator * 100;
}

// -----------------------------------------------------------------------------
// CRUD DE APORTES
// -----------------------------------------------------------------------------

function addContribution(payload) {
  return saveContribution_(payload, null);
}

function updateContribution(payload) {
  if (!payload || !payload.row || Number(payload.row) < 2) throw new Error('Linha inválida.');
  return saveContribution_(payload, Number(payload.row));
}

// Compatibilidade com o dashboard anterior.
function addAporte(payload) { return addContribution(normalizeLegacyPayload_(payload)); }
function updateAporte(payload) { return updateContribution(normalizeLegacyPayload_(payload)); }
function deleteAporte(row) { return deleteContribution(row); }

function normalizeLegacyPayload_(payload) {
  payload = payload || {};
  return {
    row: payload.row,
    date: payload.date || payload.data,
    type: payload.type || payload.tipo,
    currency: payload.currency || payload.moeda,
    price: payload.price || payload.cotacao,
    amount: payload.amount || payload.valor,
    investor: payload.investor || payload.investidor,
    origin: payload.origin || payload.origem,
    special: payload.special,
    irpf: payload.irpf !== undefined ? payload.irpf : payload.reportar
  };
}

function saveContribution_(payload, rowNumber) {
  payload = normalizeLegacyPayload_(payload);
  validateContributionPayload_(payload);
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(APP.SHEETS.CONTRIBUTIONS);
    if (!sheet) throw new Error('Aba "Aportes" não encontrada. Execute setupProject().');
    if (rowNumber && rowNumber > sheet.getLastRow()) throw new Error('Registro não encontrado.');

    var market = getMarketSnapshot_();
    var currency = String(payload.currency || 'USD').toUpperCase();
    var type = String(payload.type || 'buy').toLowerCase();
    var enteredPrice = cleanNumber_(payload.price);
    var enteredAmount = cleanNumber_(payload.amount);
    var priceUsd = currency === 'BRL' ? enteredPrice / market.usdBrl : enteredPrice;
    var amountUsd = currency === 'BRL' ? enteredAmount / market.usdBrl : enteredAmount;
    var priceBrl = currency === 'BRL' ? enteredPrice : enteredPrice * market.usdBrl;
    var sign = type === 'sell' || type === 'venda' ? -1 : 1;
    amountUsd = Math.abs(amountUsd) * sign;
    var quantity = Math.abs(amountUsd / priceUsd) * sign;

    // Origem só faz sentido para compras. Vendas são sempre 'Novo' (não vêm do caixa)
    // e alimentam o caixa por serem valores negativos.
    var origin = sign > 0 ? normalizeOrigin_(payload.origin) : CONTRIBUTION_ORIGIN.NEW;
    // Ajuste não é criado por aqui; se vier, rebaixa para 'Novo' por segurança.
    if (origin === CONTRIBUTION_ORIGIN.ADJUSTMENT) origin = CONTRIBUTION_ORIGIN.NEW;
    // Compra do caixa marcada como especial é gravada com origem 'Especial'
    // (consome o caixa como Caixa, mas não conta na cota semanal do DCA).
    var isSpecialBuy = sign > 0 && (payload.special === true || String(payload.special) === 'true');
    if (isSpecialBuy && origin === CONTRIBUTION_ORIGIN.CASH) origin = CONTRIBUTION_ORIGIN.CASH_SPECIAL;

    var targetRow = rowNumber || sheet.getLastRow() + 1;
    var date = fromIsoDate_(payload.date);
    var investor = sanitizeText_(payload.investor || 'Principal', 50);

    var ledger = readContributions_(ss);
    var candidateLedger = ledger.filter(function (item) {
      return item.row !== rowNumber;
    });
    candidateLedger.push({
      row: targetRow,
      date: payload.date,
      amountUsd: amountUsd,
      quantity: quantity,
      investor: investor,
      origin: origin,
      isAdjustment: false
    });
    validateLedgerBalances_(candidateLedger);

    // Uso do caixa especial: debita a reserva (property). Origem já é 'Especial'.
    var useSpecial = origin === CONTRIBUTION_ORIGIN.CASH_SPECIAL;

    // Aporte pago com o caixa (normal ou especial) não pode exceder o caixa total.
    if (origin === CONTRIBUTION_ORIGIN.CASH || origin === CONTRIBUTION_ORIGIN.CASH_SPECIAL) {
      var cashAfter = calculateCash_(candidateLedger, market);
      if (cashAfter.balanceUsd < -1e-6) {
        var available = calculateCash_(ledger.filter(function (item) { return item.row !== rowNumber; }), market);
        throw new Error('Saldo do caixa insuficiente. Disponível: ' + formatMoney_(available.balanceUsd, 'USD') + '.');
      }
      if (useSpecial) {
        var curTotal = calculateCash_(ledger.filter(function (item) { return item.row !== rowNumber; }), market);
        var special = getSpecialCashUsd_(cleanNumber_(curTotal.balanceUsd));
        if (Math.abs(amountUsd) > special + 1e-6) {
          throw new Error('Caixa especial insuficiente. Disponível: ' + formatMoney_(special, 'USD') + '.');
        }
      }
    }

    // Cotação do dólar do dia do aporte (coluna I) — preenchida sozinha.
    var dolarDia = cotacaoDolarDoDia_(payload.date);
    if (!(dolarDia > 0)) dolarDia = market.usdBrl;

    sheet.getRange(targetRow, 1, 1, FX_COLUMN).setValues([[
      date, 'BTC', amountUsd, priceUsd, priceBrl, quantity, investor, origin, dolarDia
    ]]);
    formatContributionRow_(sheet, targetRow);

    if (useSpecial) {
      var after = calculateCash_(readContributions_(ss), market);
      var remaining = Math.max(0, getSpecialCashUsd_() - Math.abs(amountUsd));
      // O especial nunca pode exceder o caixa total atual.
      setSpecialCashUsd_(Math.min(remaining, Math.max(0, cleanNumber_(after.balanceUsd))));
    }

    // Marcação "Reportar para a Receita" (vive em IRPF_FLAG, não na planilha).
    if (payload.irpf !== undefined) {
      var querIrpf = payload.irpf === true || String(payload.irpf) === 'true';
      var marcadas = lerIrpfFlag_();
      var pos = marcadas.indexOf(targetRow);
      if (querIrpf && pos < 0) marcadas.push(targetRow);
      if (!querIrpf && pos >= 0) marcadas.splice(pos, 1);
      salvarIrpfFlag_(marcadas);
    }

    rebuildHistoriesUnlocked_(ss);
    rebuildIrpfSheet_(ss);

    // Aviso opcional no Telegram (só em movimentação nova, não em edição).
    if (!rowNumber) {
      var novas = readContributions_(ss);
      var criada = novas.filter(function (c) { return c.row === targetRow; })[0];
      if (criada && criada.amountUsd) notificarAporte_(novas, criada);
    }
    return { success: true, message: rowNumber ? 'Movimentação atualizada.' : 'Movimentação registrada.' };
  } finally {
    lock.releaseLock();
  }
}

function deleteContribution(row) {
  row = Number(row);
  if (!row || row < 2) throw new Error('Linha inválida.');
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(APP.SHEETS.CONTRIBUTIONS);
    if (!sheet || row > sheet.getLastRow()) throw new Error('Registro não encontrado.');
    sheet.deleteRow(row);

    // Ao excluir, as linhas abaixo sobem uma posição. Os ajustes fiscais são
    // guardados por número de linha, então precisam acompanhar o deslocamento —
    // senão um ajuste passaria a apontar para a compra errada.
    var mapa = lerIrpfOverrides_();
    var novoMapa = {};
    Object.keys(mapa).forEach(function (chave) {
      var n = Number(chave);
      if (n === row) return;              // ajuste da linha excluída: descarta
      novoMapa[String(n > row ? n - 1 : n)] = mapa[chave];
    });
    salvarIrpfOverrides_(novoMapa);

    var ocultas = lerIrpfHidden_().filter(function (n) { return Number(n) !== row; })
      .map(function (n) { return Number(n) > row ? Number(n) - 1 : Number(n); });
    salvarIrpfHidden_(ocultas);

    var marcadas = lerIrpfFlag_().filter(function (n) { return n !== row; })
      .map(function (n) { return n > row ? n - 1 : n; });
    salvarIrpfFlag_(marcadas);

    rebuildHistoriesUnlocked_(ss);
    rebuildIrpfSheet_(ss);
    return { success: true, message: 'Movimentação excluída.' };
  } finally {
    lock.releaseLock();
  }
}

function rebuildHistoriesUnlocked_(ss) {
  var dailySheet = ss.getSheetByName(APP.SHEETS.DAILY);
  if (!dailySheet || dailySheet.getLastRow() < 2) return;
  var contributions = readContributions_(ss);
  var values = dailySheet.getRange(2, 1, dailySheet.getLastRow() - 1, 6).getValues();
  var output = [];
  values.forEach(function (row) {
    if (!row[0] || !cleanNumber_(row[5])) return;
    var date = toIsoDate_(row[0]);
    var oldUsd = cleanNumber_(row[1]);
    var oldBrl = cleanNumber_(row[2]);
    var fx = oldUsd > 0 && oldBrl > 0 ? oldBrl / oldUsd : getExchangeRate_();
    var price = cleanNumber_(row[5]);
    var state = calculatePosition_(contributions.filter(function (c) { return c.date <= date; }), price);
    output.push([fromIsoDate_(date), state.marketValueUsd, state.marketValueUsd * fx, state.quantityBtc, state.averagePrice, price]);
  });
  output.sort(function (a, b) { return a[0] - b[0]; });
  dailySheet.getRange(2, 1, dailySheet.getLastRow() - 1, 6).clearContent();
  if (output.length) dailySheet.getRange(2, 1, output.length, 6).setValues(output);
  rebuildMonthlyHistory_(ss);
  SpreadsheetApp.flush();
}

/**
 * Reprocessa APENAS as últimas `days` linhas do Histórico Diário (padrão 60),
 * em vez do histórico inteiro. Mantém a mesma lógica do rebuild completo, mas
 * reescreve só o range recente — evita custo O(n) e risco de timeout no snapshot
 * diário. O recálculo de cada dia usa todos os aportes com data <= aquele dia,
 * então os valores ficam idênticos ao do rebuild completo.
 */
function rebuildRecentDailyUnlocked_(ss, days) {
  var dailySheet = ss.getSheetByName(APP.SHEETS.DAILY);
  if (!dailySheet || dailySheet.getLastRow() < 2) return;
  var lastRow = dailySheet.getLastRow();
  var window = Math.max(1, Math.round(days || 60));
  var startRow = Math.max(2, lastRow - window + 1);   // primeira linha a recalcular
  var count = lastRow - startRow + 1;
  var contributions = readContributions_(ss);
  var values = dailySheet.getRange(startRow, 1, count, 6).getValues();
  var output = [];
  values.forEach(function (row) {
    if (!row[0] || !cleanNumber_(row[5])) { output.push(row); return; }
    var date = toIsoDate_(row[0]);
    var oldUsd = cleanNumber_(row[1]);
    var oldBrl = cleanNumber_(row[2]);
    var fx = oldUsd > 0 && oldBrl > 0 ? oldBrl / oldUsd : getExchangeRate_();
    var price = cleanNumber_(row[5]);
    var state = calculatePosition_(contributions.filter(function (c) { return c.date <= date; }), price);
    output.push([fromIsoDate_(date), state.marketValueUsd, state.marketValueUsd * fx, state.quantityBtc, state.averagePrice, price]);
  });
  dailySheet.getRange(startRow, 1, count, 6).setValues(output);
  rebuildMonthlyHistory_(ss);
  SpreadsheetApp.flush();
}

function validateContributionPayload_(payload) {
  if (!payload.date || !/^\d{4}-\d{2}-\d{2}$/.test(String(payload.date))) throw new Error('Informe uma data válida.');
  var date = fromIsoDate_(payload.date);
  if (isNaN(date.getTime())) throw new Error('Data inválida.');
  var price = cleanNumber_(payload.price);
  var amount = cleanNumber_(payload.amount);
  if (!(price > 0) || !(amount > 0)) throw new Error('Cotação e valor devem ser positivos.');
  var currency = String(payload.currency || 'USD').toUpperCase();
  if (['USD', 'BRL'].indexOf(currency) === -1) throw new Error('Moeda inválida.');
  var type = String(payload.type || 'buy').toLowerCase();
  if (['buy', 'sell', 'compra', 'venda'].indexOf(type) === -1) throw new Error('Tipo inválido.');
}

function validateLedgerBalances_(items) {
  var balances = {};
  items.slice().sort(function (a, b) {
    return a.date.localeCompare(b.date) || a.row - b.row;
  }).forEach(function (item) {
    // Correções (caixa/moeda) não são operações: não entram nesta validação.
    // Elas guardam a observação na coluna Investidor, então não podem ser
    // tratadas como se fossem um investidor com cotas negativas.
    if (item.isAdjustment || item.isCoinAdjustment ||
        item.origin === CONTRIBUTION_ORIGIN.ADJUSTMENT ||
        item.origin === CONTRIBUTION_ORIGIN.COIN_ADJUSTMENT) return;
    var investor = item.investor || 'Principal';
    balances[investor] = (balances[investor] || 0) + (Number(item.quantity) || 0);
    if (balances[investor] < -1e-10) {
      throw new Error('A movimentação deixaria ' + investor + ' com saldo negativo em ' + item.date + '.');
    }
  });
}

// -----------------------------------------------------------------------------
// CAIXA
// -----------------------------------------------------------------------------
//
// O caixa é o dinheiro disponível para novos aportes, derivado inteiramente da
// aba Aportes (nenhuma outra fonte de verdade). Fórmula:
//
//   Caixa = Σ(vendas)  −  Σ(aportes com Origem "Caixa")  +  Σ(ajustes manuais)
//
//  - Venda de BTC (amountUsd < 0) abastece o caixa com o valor recebido.
//  - Aporte com Origem "Caixa" consome o caixa (é compra de BTC paga com o caixa).
//  - Linha de Origem "Ajuste" (qty = 0) soma/subtrai direto no caixa para corrigir
//    o saldo real (ex.: sacou parte do caixa para outra finalidade).
//
// Valores são mantidos em USD internamente (mesma base do resto do sistema) e o
// câmbio BRL vem do câmbio implícito de cada linha, com fallback no câmbio atual.

/** Calcula o saldo do caixa em USD e BRL a partir das linhas da aba Aportes. */
function calculateCash_(contributions, market) {
  var fxNow = market && market.usdBrl ? market.usdBrl : getExchangeRate_();
  var usd = 0;
  var brl = 0;
  var salesUsd = 0;
  var usedUsd = 0;
  var adjustmentsUsd = 0;

  contributions.forEach(function (item) {
    // Ajuste de moeda não movimenta caixa (valor é sempre 0).
    if (item.isCoinAdjustment) return;
    var amount = Number(item.amountUsd) || 0;
    var lineFx = (item.priceBrl && item.priceUsd) ? item.priceBrl / item.priceUsd : fxNow;

    if (item.isAdjustment) {
      // Ajuste: o valor (com sinal) vai direto para o caixa.
      usd += amount;
      brl += amount * lineFx;
      adjustmentsUsd += amount;
    } else if (amount < 0) {
      // Venda: proceeds entram no caixa.
      var proceeds = Math.abs(amount);
      usd += proceeds;
      brl += proceeds * lineFx;
      salesUsd += proceeds;
    } else if ((item.origin === CONTRIBUTION_ORIGIN.CASH || item.origin === CONTRIBUTION_ORIGIN.CASH_SPECIAL) && amount > 0) {
      // Aporte pago com o caixa (normal ou especial): consome o saldo total.
      usd -= amount;
      brl -= amount * lineFx;
      usedUsd += amount;
    }
  });

  // balanceUsd é a fonte de verdade. balanceBrl aqui usa o câmbio histórico por
  // linha (informativo); o dashboard NÃO usa este campo — ele reconverte o
  // balanceUsd pelo câmbio atual, para refletir o "caixa disponível hoje" em BRL.
  return {
    balanceUsd: usd,
    balanceBrl: brl,
    salesUsd: salesUsd,
    usedUsd: usedUsd,
    adjustmentsUsd: adjustmentsUsd,
    usdBrl: fxNow
  };
}

/** Endpoint: saldo atual do caixa (usado pelo dashboard). */
/**
 * Ajusta a QUANTIDADE de BTC para casar com a carteira real.
 * Use quando alguns sats se perdem em taxas de transferência (ou sobram de poeira)
 * e a posição do ledger divergir do saldo on-chain.
 *
 * payload: { targetQty?: number, deltaQty?: number, note?: string }
 * Grava uma linha com Origem 'Ajuste BTC', Aporte $ = 0 e Qtd = diferença.
 * Não mexe no caixa, não conta como compra/venda e não altera o custo investido.
 */
function adjustCoin(payload) {
  payload = payload || {};
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(APP.SHEETS.CONTRIBUTIONS);
    if (!sheet) throw new Error('Aba "Aportes" não encontrada. Execute setupProject().');

    var market = getMarketSnapshot_();
    var fx = market.usdBrl || getExchangeRate_();
    var atual = calculatePosition_(readContributions_(ss), market.btcUsd);
    var qtdAtual = atual.quantityBtc;

    var deltaBtc;
    if (payload.targetQty !== undefined && payload.targetQty !== null && String(payload.targetQty) !== '') {
      var alvo = cleanNumber_(payload.targetQty);
      if (alvo < 0) throw new Error('A quantidade não pode ser negativa.');
      deltaBtc = alvo - qtdAtual;
    } else if (payload.deltaQty !== undefined && payload.deltaQty !== null && String(payload.deltaQty) !== '') {
      deltaBtc = cleanNumber_(payload.deltaQty);
    } else {
      throw new Error('Informe a quantidade real de BTC ou o ajuste.');
    }

    if (!isFinite(deltaBtc) || Math.abs(deltaBtc) < 1e-8) {
      return {
        success: true,
        message: 'A quantidade já estava com esse valor.',
        position: { quantityBtc: qtdAtual, averagePrice: atual.averagePrice, costBasisUsd: atual.costBasisUsd },
        deltaBtc: 0
      };
    }
    if (qtdAtual + deltaBtc < 0) throw new Error('O ajuste deixaria a posição negativa.');

    var priceUsd = market.btcUsd || 0;
    var priceBrl = priceUsd ? priceUsd * fx : 0;
    var note = sanitizeText_(payload.note || 'Ajuste de moedas', 50);
    var targetRow = sheet.getLastRow() + 1;

    sheet.getRange(targetRow, 1, 1, FX_COLUMN).setValues([[
      fromIsoDate_(toIsoDate_(new Date())),
      'BTC',
      0,
      priceUsd,
      priceBrl,
      deltaBtc,
      note,
      CONTRIBUTION_ORIGIN.COIN_ADJUSTMENT,
      fx
    ]]);
    formatContributionRow_(sheet, targetRow);

    rebuildHistoriesUnlocked_(ss);
    var novo = calculatePosition_(readContributions_(ss), market.btcUsd);
    return {
      success: true,
      message: 'Quantidade ajustada em ' + (deltaBtc >= 0 ? '+' : '') + deltaBtc.toFixed(8) + ' BTC (' +
        Math.round(Math.abs(deltaBtc) * 1e8).toLocaleString('pt-BR') + ' sats).',
      position: {
        quantityBtc: novo.quantityBtc,
        averagePrice: novo.averagePrice,
        costBasisUsd: novo.costBasisUsd
      },
      deltaBtc: deltaBtc
    };
  } finally {
    lock.releaseLock();
  }
}

// ---------------------------------------------------------------------------
// Modo bandido: caderno fiscal SEPARADO do ledger.
// Guardamos aqui os ajustes feitos na visão fiscal (valor, cotação, quantidade,
// data, observação) e as linhas ocultadas. Nada disso entra em calculatePosition_,
// calculateCash_ ou em qualquer outro cálculo da carteira.
// ---------------------------------------------------------------------------
function lerIrpfFlag_() {
  var raw = PropertiesService.getScriptProperties().getProperty('IRPF_FLAG');
  if (!raw) return [];
  try { var arr = JSON.parse(raw); return Array.isArray(arr) ? arr.map(Number) : []; } catch (e) { return []; }
}
function salvarIrpfFlag_(arr) {
  PropertiesService.getScriptProperties().setProperty('IRPF_FLAG', JSON.stringify((arr || []).map(Number)));
}

function lerIrpfOverrides_() {
  var raw = PropertiesService.getScriptProperties().getProperty('IRPF_ITEMS');
  if (!raw) return {};
  try { return JSON.parse(raw) || {}; } catch (e) { return {}; }
}
function salvarIrpfOverrides_(mapa) {
  PropertiesService.getScriptProperties().setProperty('IRPF_ITEMS', JSON.stringify(mapa || {}));
}
function lerIrpfHidden_() {
  var raw = PropertiesService.getScriptProperties().getProperty('IRPF_HIDDEN');
  if (!raw) return [];
  try { var arr = JSON.parse(raw); return Array.isArray(arr) ? arr : []; } catch (e) { return []; }
}
/**
 * Reconstrói a aba IRPF no MESMO formato da aba Aportes.
 * É um espelho somente-leitura do que está marcado para a Receita:
 * compras/vendas do ledger marcadas + lançamentos criados no painel.
 * Não é fonte de verdade e não entra em nenhum cálculo da carteira.
 */
function rebuildIrpfSheet_(ss) {
  ss = ss || SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('IRPF') || ss.insertSheet('IRPF');
  var fxAtual = cleanNumber_(getExchangeRate_()) || 0;
  var marcadas = lerIrpfFlag_();
  var overrides = lerIrpfOverrides_();
  var ocultas = lerIrpfHidden_().map(Number);

  var linhas = [];
  readContributions_(ss).forEach(function (t) {
    if (marcadas.indexOf(t.row) < 0) return;
    if (ocultas.indexOf(t.row) >= 0) return;
    var o = overrides[String(t.row)] || {};
    var preco = (o.priceUsd !== undefined && o.priceUsd !== null) ? o.priceUsd : t.priceUsd;
    var qtd = (o.quantity !== undefined && o.quantity !== null) ? o.quantity : t.quantity;
    var data = o.date || t.date;
    var fxLinha = (t.priceBrl && t.priceUsd) ? (t.priceBrl / t.priceUsd) : fxAtual;
    linhas.push([
      data, 'BTC', preco * qtd, preco, preco * fxLinha, qtd,
      t.investor || 'Principal', t.origin
    ]);
  });
  lerIrpfExtra_().forEach(function (x) {
    var preco = cleanNumber_(x.priceUsd);
    var qtd = cleanNumber_(x.quantity);
    var fxLinha = cleanNumber_(x.fx) > 0 ? cleanNumber_(x.fx) : fxAtual;
    linhas.push([
      x.date, 'BTC', preco * qtd, preco, preco * fxLinha, qtd,
      x.note || 'Fiscal', 'Fiscal'
    ]);
  });
  linhas.sort(function (a, b) { return String(a[0]).localeCompare(String(b[0])); });

  sheet.clearContents();
  sheet.clearFormats();
  var total = linhas.length;
  if (total > 0) {
    sheet.getRange(1, 1, total + 1, 8).setValues([APP.HEADERS.CONTRIBUTIONS].concat(linhas));
    sheet.getRange(1, 1, 1, 8).setFontWeight('bold');
    sheet.getRange(2, 1, total, 1).setNumberFormat('dd/MM/yyyy');
    sheet.getRange(2, 3, total, 2).setNumberFormat('$#,##0.00;-$#,##0.00');
    sheet.getRange(2, 5, total, 1).setNumberFormat('"R$" #,##0.00');
    sheet.getRange(2, 6, total, 1).setNumberFormat('0.00000000');
    sheet.setFrozenRows(1);
  }
  return { linhas: total };
}

function lerIrpfExtra_() {
  var raw = PropertiesService.getScriptProperties().getProperty('IRPF_EXTRA');
  if (!raw) return [];
  try { var arr = JSON.parse(raw); return Array.isArray(arr) ? arr : []; } catch (e) { return []; }
}
function salvarIrpfExtra_(arr) {
  PropertiesService.getScriptProperties().setProperty('IRPF_EXTRA', JSON.stringify(arr || []));
}

function salvarIrpfHidden_(arr) {
  PropertiesService.getScriptProperties().setProperty('IRPF_HIDDEN', JSON.stringify(arr || []));
}

/**
 * Salva um ajuste FISCAL de uma compra (não altera a linha da aba Aportes).
 * payload: { row, date?, amountUsd?, priceUsd?, quantity?, note? }
 */
function setIrpfOverride(payload) {
  payload = payload || {};
  var row = Number(payload.row);
  if (!row || row < 2) throw new Error('Registro inválido.');
  var mapa = lerIrpfOverrides_();
  var atual = mapa[String(row)] || {};
  var prox = {
    date: payload.date ? String(payload.date) : atual.date,
    amountUsd: payload.amountUsd !== undefined && payload.amountUsd !== '' ? cleanNumber_(payload.amountUsd) : atual.amountUsd,
    priceUsd: payload.priceUsd !== undefined && payload.priceUsd !== '' ? cleanNumber_(payload.priceUsd) : atual.priceUsd,
    quantity: payload.quantity !== undefined && payload.quantity !== '' ? cleanNumber_(payload.quantity) : atual.quantity,
    note: payload.note !== undefined ? sanitizeText_(payload.note, 60) : atual.note
  };
  mapa[String(row)] = prox;
  salvarIrpfOverrides_(mapa);
  rebuildIrpfSheet_();
  return { success: true, message: 'Ajuste fiscal salvo. Sua carteira não foi alterada.', irpfOverrides: mapa };
}

/** Remove o ajuste fiscal de uma compra (volta ao que está no ledger). */
function removeIrpfOverride(row) {
  var mapa = lerIrpfOverrides_();
  delete mapa[String(Number(row))];
  salvarIrpfOverrides_(mapa);
  rebuildIrpfSheet_();
  return { success: true, message: 'Ajuste fiscal removido.', irpfOverrides: mapa };
}

/**
 * Cria ou atualiza uma compra que existe SÓ no caderno fiscal.
 * Não entra na aba Aportes, não altera saldo, posição, PM nem históricos.
 * payload: { id?, date, amountUsd, priceUsd, quantity?, note? }
 */
function saveIrpfExtra(payload) {
  payload = payload || {};
  var data = String(payload.date || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) throw new Error('Informe uma data válida.');
  var preco = cleanNumber_(payload.priceUsd);
  var qtd = cleanNumber_(payload.quantity);
  if (!(preco > 0)) throw new Error('Informe a cotação do BTC.');
  if (!(qtd > 0)) throw new Error('Informe a quantidade comprada.');
  // O valor pago é sempre derivado: cotação × quantidade.
  var valor = preco * qtd;

  var lista = lerIrpfExtra_();
  var id = String(payload.id || '').trim();
  var item = {
    id: id || ('x' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)),
    date: data,
    amountUsd: valor,
    priceUsd: preco,
    quantity: qtd,
    fx: cleanNumber_((getMarketSnapshot_() || {}).usdBrl) || cleanNumber_(getExchangeRate_()),
    note: sanitizeText_(payload.note || '', 60)
  };
  var achou = false;
  for (var i = 0; i < lista.length; i++) {
    if (String(lista[i].id) === item.id) { lista[i] = item; achou = true; break; }
  }
  if (!achou) lista.push(item);
  salvarIrpfExtra_(lista);
  rebuildIrpfSheet_();
  return { success: true, message: achou ? 'Compra fiscal atualizada.' : 'Compra fiscal registrada. Sua carteira não foi alterada.', irpfExtra: lista, id: item.id };
}

/** Remove uma compra do caderno fiscal (não toca no ledger). */
function removeIrpfExtra(id) {
  var alvo = String(id || '');
  var lista = lerIrpfExtra_().filter(function (x) { return String(x.id) !== alvo; });
  salvarIrpfExtra_(lista);
  rebuildIrpfSheet_();
  return { success: true, message: 'Compra fiscal removida.', irpfExtra: lista };
}

/** Oculta (ou mostra) uma compra apenas na visão fiscal. */
function setIrpfHidden(row, hidden) {
  var arr = lerIrpfHidden_().map(Number);
  var alvo = Number(row);
  var idx = arr.indexOf(alvo);
  if (hidden === false || String(hidden) === 'false') {
    if (idx >= 0) arr.splice(idx, 1);
  } else if (idx < 0) {
    arr.push(alvo);
  }
  salvarIrpfHidden_(arr);
  rebuildIrpfSheet_();
  return { success: true, message: 'Visão fiscal atualizada.', irpfHidden: arr };
}

/** Restaura todas as compras ocultas na visão fiscal. */
function limparIrpfHidden() {
  salvarIrpfHidden_([]);
  rebuildIrpfSheet_();
  return { success: true, message: 'Compras restauradas.', irpfHidden: [] };
}

/**
 * Marca ou desmarca uma compra como "Reportar para a Receita" (coluna I).
 * Só controle fiscal: não altera nenhum cálculo.
 */
function setIrpfFlag(row, flag) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(APP.SHEETS.CONTRIBUTIONS);
    if (!sheet) throw new Error('Aba "Aportes" não encontrada.');
    var linha = Number(row);
    if (!linha || linha < 2 || linha > sheet.getLastRow()) throw new Error('Registro não encontrado.');
    var desmarcar = flag === false || String(flag) === 'false';
    var marcadas = lerIrpfFlag_();
    var pos = marcadas.indexOf(linha);
    if (desmarcar) { if (pos >= 0) marcadas.splice(pos, 1); }
    else if (pos < 0) { marcadas.push(linha); }
    salvarIrpfFlag_(marcadas);
    if (desmarcar) {
      var mapa = lerIrpfOverrides_();
      delete mapa[String(linha)];
      salvarIrpfOverrides_(mapa);
      var ocultas = lerIrpfHidden_().filter(function (r) { return Number(r) !== linha; });
      salvarIrpfHidden_(ocultas);
    }
    rebuildIrpfSheet_(ss);
    return { success: true, message: 'Marca atualizada.' };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Define (ou limpa) o preço médio declarado do conjunto marcado.
 * Guardado em Script Property: não toca no ledger. Vazio = usar o calculado.
 */
function setIrpfPm(value) {
  var props = PropertiesService.getScriptProperties();
  var limpo = String(value === undefined || value === null ? '' : value).trim();
  if (limpo === '') {
    props.deleteProperty('IRPF_PM');
    rebuildIrpfSheet_();
    return { success: true, message: 'Preço médio declarado voltou ao calculado.', irpfPm: 0 };
  }
  var numero = cleanNumber_(limpo.replace(/\./g, '').replace(',', '.'));
  if (!(numero > 0)) throw new Error('Informe um preço médio válido.');
  props.setProperty('IRPF_PM', String(numero));
  rebuildIrpfSheet_();
  return { success: true, message: 'Preço médio declarado salvo.', irpfPm: numero };
}

function getCashBalance() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  return calculateCash_(readContributions_(ss), getMarketSnapshot_());
}

/**
 * Registra um ajuste de caixa. O usuário informa o VALOR FINAL desejado do caixa
 * (na moeda escolhida); gravamos uma linha de Origem "Ajuste" com a diferença
 * necessária para o saldo bater. Também aceita um delta direto via {delta,...}.
 *
 * payload: { targetBalance?: number, delta?: number, currency?: 'USD'|'BRL', note?: string }
 */
function adjustCash(payload) {
  payload = payload || {};
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(APP.SHEETS.CONTRIBUTIONS);
    if (!sheet) throw new Error('Aba "Aportes" não encontrada. Execute setupProject().');

    var market = getMarketSnapshot_();
    var fx = market.usdBrl || getExchangeRate_();
    var currency = String(payload.currency || 'USD').toUpperCase();
    if (['USD', 'BRL'].indexOf(currency) === -1) throw new Error('Moeda inválida.');

    var current = calculateCash_(readContributions_(ss), market);
    var deltaUsd;

    if (payload.targetBalance !== undefined && payload.targetBalance !== null && String(payload.targetBalance) !== '') {
      var target = cleanNumber_(payload.targetBalance);
      var targetUsd = currency === 'BRL' ? (fx > 0 ? target / fx : 0) : target;
      deltaUsd = targetUsd - current.balanceUsd;
    } else if (payload.delta !== undefined && payload.delta !== null && String(payload.delta) !== '') {
      var delta = cleanNumber_(payload.delta);
      deltaUsd = currency === 'BRL' ? (fx > 0 ? delta / fx : 0) : delta;
    } else {
      throw new Error('Informe o novo valor do caixa ou um ajuste.');
    }

    if (!isFinite(deltaUsd) || Math.abs(deltaUsd) < 1e-9) {
      return { success: true, message: 'Caixa já estava com esse valor.', cash: current };
    }

    var deltaBrl = deltaUsd * fx;
    var priceUsd = market.btcUsd || 0;
    var priceBrl = priceUsd ? priceUsd * fx : 0;
    var note = sanitizeText_(payload.note || 'Ajuste de caixa', 50);
    var targetRow = sheet.getLastRow() + 1;

    // Linha de ajuste: qty = 0 e Origem = 'Ajuste'. Não afeta posição/PM/histórico;
    // a coluna C (Aporte $) carrega o delta apenas para o cálculo do caixa.
    sheet.getRange(targetRow, 1, 1, FX_COLUMN).setValues([[
      fromIsoDate_(toIsoDate_(new Date())),
      'BTC',
      deltaUsd,
      priceUsd,
      priceBrl,
      0,
      note,
      CONTRIBUTION_ORIGIN.ADJUSTMENT,
      fx
    ]]);
    formatContributionRow_(sheet, targetRow);

    // Ajuste não muda posição, mas mantém os históricos consistentes na mesma via.
    rebuildHistoriesUnlocked_(ss);
    var updated = calculateCash_(readContributions_(ss), market);
    return {
      success: true,
      message: 'Caixa ajustado em ' + (deltaUsd >= 0 ? '+' : '') + formatMoney_(deltaUsd, 'USD') + '.',
      cash: updated
    };
  } finally {
    lock.releaseLock();
  }
}

// -----------------------------------------------------------------------------
// ALERTAS DE DCA NO TELEGRAM
// -----------------------------------------------------------------------------

/** Monta o plano "ao vivo" (DCA fixo + caixa especial). */
function buildLiveDcaPlan_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var market = getMarketSnapshot_();
  var contributions = readContributions_(ss);
  var cash = calculateCash_(contributions, market);
  return { plan: buildAccumulationPlan_(market, cash, getCachedHalvingData_(), contributions), market: market };
}

/** Mensagem do aporte fixo da semana (em R$ e US$). */
function dcaWeeklyMessage_(plan, market) {
  var fx = market.usdBrl || getExchangeRate_();
  if (plan.weekComplete) {
    return [
      '<b>₿ SATOSHI LEDGER · APORTE DA SEMANA</b>',
      '',
      '✅ Você já concluiu o aporte desta semana.',
      'Cota semanal: <code>' + formatMoney_(plan.weeklyTargetUsd * fx, 'BRL') + ' · ' + formatMoney_(plan.weeklyTargetUsd, 'USD') + '</code>',
      '',
      'Caixa normal restante: <code>' + formatMoney_(plan.cashUsd * fx, 'BRL') + ' · ' + formatMoney_(plan.cashUsd, 'USD') + '</code>'
    ].join('\n');
  }
  return [
    '<b>₿ SATOSHI LEDGER · APORTE DA SEMANA</b>',
    '',
    'Falta aportar esta semana (DCA fixo):',
    '<b>' + formatMoney_(plan.suggestedUsd * fx, 'BRL') + '</b>  ·  <b>' + formatMoney_(plan.suggestedUsd, 'USD') + '</b>',
    '≈ <code>' + plan.suggestedBtc.toFixed(8) + ' BTC</code>',
    (plan.doneThisWeekUsd > 0 ? 'Já aportado nesta semana: <code>' + formatMoney_(plan.doneThisWeekUsd * fx, 'BRL') + '</code>' : null),
    '',
    'Caixa normal restante: <code>' + formatMoney_(plan.cashUsd * fx, 'BRL') + ' · ' + formatMoney_(plan.cashUsd, 'USD') + '</code>',
    'Caixa especial reservado: <code>' + formatMoney_(plan.specialUsd * fx, 'BRL') + ' · ' + formatMoney_(plan.specialUsd, 'USD') + '</code>',
    '',
    '<i>Aporte semanal de valor fixo (domingo a sábado).</i>'
  ].filter(function (l) { return l !== null; }).join('\n');
}

/**
 * Alerta do aporte fixo da semana. A TRIGGER é criada manualmente pelo usuário
 * (terça 13h). TODA a decisão de "quando enviar" fica AQUI:
 *  - Só envia se o Telegram estiver configurado.
 *  - Só envia DENTRO da janela de DCA (entre START e END dias antes do halving).
 *  - FORA da janela: não envia nada (fail-safe: se o halving não for determinável,
 *    também não envia).
 *  - Dentro da janela sem caixa normal: envia o aviso "sem caixa".
 * Usa o halving AO VIVO (altura real do bloco) para a decisão de período.
 */
function sendWeeklyDcaAlert() {
  if (!notifLigada_('dca')) return { skipped: true, message: 'Alerta de DCA desativado nas notificações.' };
  var config = getTelegramConfig_();
  if (!config.token || !config.chatId) return { skipped: true, message: 'Telegram não configurado.' };

  // Halving ao vivo (fail-safe: sem halving confiável, não envia).
  var halving;
  try { halving = getHalvingData(); } catch (e) { halving = getCachedHalvingData_(); }
  var days = halving && typeof halving.days === 'number' && isFinite(halving.days) ? halving.days : null;
  if (days === null) return { skipped: true, message: 'Halving indeterminado — alerta não enviado.' };

  // Regra de período: só dentro da janela START..END dias antes do halving.
  if (days > DCA_PLAN.START_DAYS_BEFORE_HALVING) return { skipped: true, message: 'Antes da janela de DCA (faltam ' + days + ' dias para o halving).' };
  if (days < DCA_PLAN.END_DAYS_BEFORE_HALVING) return { skipped: true, message: 'Após a janela de DCA.' };

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var market = getMarketSnapshot_();
  var contributions = readContributions_(ss);
  var cash = calculateCash_(contributions, market);
  var plan = buildAccumulationPlan_(market, cash, halving, contributions);

  // Dentro da janela, mas sem caixa normal: avisa para registrar o caixa.
  if (plan.reason === 'no-cash' && plan.inWindow) {
    telegramSendMessage_([
      '<b>₿ SATOSHI LEDGER · DCA SEM CAIXA</b>',
      '',
      'Você está em período de DCA, mas o <b>caixa normal está zerado</b>.',
      'Cadastre ou ajuste o caixa no dashboard para o aporte da semana.'
    ].join('\n'));
    return { success: true, message: 'Aviso de caixa vazio enviado.' };
  }
  if (!plan.active) return { skipped: true, message: 'Fora da janela de DCA (' + plan.reason + ').' };

  // Semana já cumprida (ou nada pendente): não incomoda.
  if (plan.weekComplete === true || !(plan.suggestedUsd > 0)) {
    return { skipped: true, message: 'Semana já concluída — alerta não enviado.' };
  }

  telegramSendMessage_(dcaWeeklyMessage_(plan, market));
  return { success: true, message: 'Aporte da semana enviado.' };
}

/** Resumo semanal (domingo à noite) — Telegram. Respeita o interruptor do tipo. */
function sendWeeklySummary() {
  if (!notifLigada_('weekly')) return { skipped: true, message: 'Resumo semanal desativado nas notificações.' };
  var config = getTelegramConfig_();
  if (!config.token || !config.chatId) return { skipped: true, message: 'Telegram não configurado.' };

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var market = getMarketSnapshot_();
  var contributions = readContributions_(ss);
  var pos = calculatePosition_(contributions, market.btcUsd);

  // variação do patrimônio nos últimos 7 dias (histórico diário)
  var diario = readDailyHistory_(ss);
  var semanaAtras = diario.length ? diario[Math.max(0, diario.length - 8)] : null;
  var base = semanaAtras ? Number(semanaAtras.balanceUsd) : 0;
  var varPct = base > 0 ? (pos.marketValueUsd / base - 1) * 100 : null;

  // aportes dos últimos 7 dias
  var hoje = toIsoDate_(new Date());
  var limite = toIsoDate_(new Date(Date.now() - 7 * 86400000));
  var semana = contributions.filter(function (c) {
    return c.date >= limite && c.date <= hoje && !c.isAdjustment && !c.isCoinAdjustment && c.amountUsd > 0;
  });
  var aportado = semana.reduce(function (s2, c) { return s2 + Number(c.amountUsd); }, 0);

  // status do DCA
  var dcaTxt = 'fora da janela';
  try {
    var cash = calculateCash_(contributions, market);
    var plan = buildAccumulationPlan_(market, cash, getCachedHalvingData_(), contributions);
    if (plan.active) {
      dcaTxt = plan.weekComplete ? 'semana concluída ✓' : 'faltam ' + formatMoney_(plan.suggestedUsd, 'USD');
    } else if (plan.reason === 'no-cash') {
      dcaTxt = 'sem caixa';
    }
  } catch (e) {}

  var linhas = [
    '<b>₿ SATOSHI LEDGER · RESUMO DA SEMANA</b>',
    '',
    'Patrimônio: <b>' + formatMoney_(pos.marketValueUsd, 'USD') + '</b>' + (varPct === null ? '' : '  (' + (varPct >= 0 ? '+' : '') + varPct.toFixed(1) + '% na semana)'),
    'BTC: <code>' + pos.quantityBtc.toFixed(8) + '</code> · PM <code>' + formatMoney_(pos.averagePrice, 'USD') + '</code>',
    '',
    'Aportado na semana: <b>' + formatMoney_(aportado, 'USD') + '</b>' + (semana.length ? ' em ' + semana.length + (semana.length === 1 ? ' aporte' : ' aportes') : ''),
    'DCA: ' + dcaTxt
  ];
  telegramSendMessage_(linhas.join('\n'));
  return { success: true, message: 'Resumo semanal enviado.' };
}

/** Confirmação curta no Telegram a cada movimentação registrada (opcional). */
function notificarAporte_(contributions, item) {
  try {
    if (!notifLigada_('aportes')) return;
    var market = getMarketSnapshot_();
    var pos = calculatePosition_(contributions, market.btcUsd);
    var venda = Number(item.amountUsd) < 0;
    telegramSendMessage_([
      '<b>₿ SATOSHI LEDGER · ' + (venda ? 'VENDA REGISTRADA' : 'APORTE REGISTRADO') + '</b>',
      '',
      (venda ? '−' : '+') + formatMoney_(Math.abs(item.amountUsd), 'USD') + '  ·  <code>' + Math.abs(item.quantity).toFixed(8) + ' BTC</code>',
      'Preço: <code>' + formatMoney_(item.priceUsd, 'USD') + '</code>',
      '',
      'Novo patrimônio: <b>' + formatMoney_(pos.marketValueUsd, 'USD') + '</b>'
    ].join('\n'));
  } catch (e) {
    console.warn('notificarAporte_ falhou: ' + e.message);
  }
}

/** Botão de teste do modal de ajuda: envia uma mensagem de teste ao Telegram. */
function sendDcaTestAlert() {
  var config = getTelegramConfig_();
  if (!config.token || !config.chatId) return { success: false, message: 'Configure o Telegram no painel de Integrações primeiro.' };
  var r = buildLiveDcaPlan_();
  var plan = r.plan;
  if (plan.active) {
    telegramSendMessage_('<b>₿ SATOSHI LEDGER · TESTE</b>\n\n' + dcaWeeklyMessage_(plan, r.market));
  } else {
    telegramSendMessage_('<b>₿ SATOSHI LEDGER · TESTE</b>\n\nAlerta de teste. Status do DCA: <code>' + plan.reason + '</code>.');
  }
  return { success: true, message: 'Alerta de teste enviado ao Telegram.' };
}

// -----------------------------------------------------------------------------
// TELEGRAM E RELATÓRIO MENSAL
// -----------------------------------------------------------------------------

function sendMonthlyReportIfNeeded() {
  if (!notifLigada_('monthly')) return { success: true, skipped: true, message: 'Relatório mensal desativado nas notificações.' };
  var now = new Date();
  var tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  if (tomorrow.getDate() !== 1) return { success: true, skipped: true, message: 'Hoje não é o último dia do mês.' };

  var monthKey = Utilities.formatDate(now, getTimeZone_(), 'yyyy-MM');
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty(APP.PROPERTIES.LAST_MONTHLY_REPORT) === monthKey) {
    return { success: true, skipped: true, message: 'Relatório já enviado.' };
  }
  var result = sendMonthlyReport(monthKey);
  props.setProperty(APP.PROPERTIES.LAST_MONTHLY_REPORT, monthKey);
  return result;
}

/**
 * Relatório mensal — enviado por EMAIL.
 * Substitui o antigo envio pelo Telegram (texto + gráficos via QuickChart).
 * Mantém o mesmo nome para não quebrar o gatilho e o menu existentes.
 */
function sendMonthlyReport(mes) {
  var alvo = mes || Utilities.formatDate(new Date(), getTimeZone_(), 'yyyy-MM');
  var envio = enviarEmailRelatorioMensal(alvo);
  return {
    success: true,
    message: 'Relatório de ' + alvo + ' enviado por email para ' + envio.enviadoPara + '.',
    email: envio
  };
}

function telegramSendMessage_(text) {
  telegramRequest_('sendMessage', {
    chat_id: getTelegramConfig_().chatId,
    text: text,
    parse_mode: 'HTML',
    disable_web_page_preview: true
  }, true);
}

function telegramRequest_(method, payload, asJson) {
  var config = getTelegramConfig_();
  var options = { method: 'post', muteHttpExceptions: true };
  if (asJson) {
    options.contentType = 'application/json';
    options.payload = JSON.stringify(payload);
  } else {
    options.payload = payload;
  }
  var response = UrlFetchApp.fetch('https://api.telegram.org/bot' + config.token + '/' + method, options);
  var result = JSON.parse(response.getContentText());
  if (!result.ok) throw new Error('Telegram: ' + (result.description || 'erro desconhecido'));
  return result;
}

function getTelegramConfig_() {
  var props = PropertiesService.getScriptProperties();
  return {
    token: props.getProperty(APP.PROPERTIES.TELEGRAM_TOKEN),
    chatId: props.getProperty(APP.PROPERTIES.TELEGRAM_CHAT_ID)
  };
}

function assertTelegramConfigured_() {
  var config = getTelegramConfig_();
  if (!config.token || !config.chatId) throw new Error('Configure o token e o Chat ID do Telegram no painel.');
}

// -----------------------------------------------------------------------------
// HELPERS
// -----------------------------------------------------------------------------

var TIME_ZONE_CACHE_ = null;

function getTimeZone_() {
  if (TIME_ZONE_CACHE_) return TIME_ZONE_CACHE_;
  try {
    TIME_ZONE_CACHE_ = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
  } catch (e) {
    TIME_ZONE_CACHE_ = 'America/Sao_Paulo';
  }
  return TIME_ZONE_CACHE_;
}

function getExchangeRate_() {
  try { return getMarketSnapshot_().usdBrl; } catch (e) { return getLastKnownFx_(); }
}

function cleanNumber_(value) {
  if (typeof value === 'number') return isFinite(value) ? value : 0;
  if (value === null || value === undefined || value === '') return 0;
  var str = String(value).trim().replace(/\s/g, '').replace(/R\$|US\$|\$/gi, '');
  var lastComma = str.lastIndexOf(',');
  var lastDot = str.lastIndexOf('.');
  if (lastComma > lastDot) str = str.replace(/\./g, '').replace(',', '.');
  else if (lastDot > lastComma && lastComma >= 0) str = str.replace(/,/g, '');
  else if (lastComma >= 0) str = str.replace(',', '.');
  str = str.replace(/[^0-9.\-]/g, '');
  var number = Number(str);
  return isFinite(number) ? number : 0;
}

function toIsoDate_(value) {
  var date;
  if (value instanceof Date) date = value;
  else {
    var str = String(value || '').trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.slice(0, 10);
    var parts = str.split('/');
    if (parts.length === 3) date = new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
    else if (parts.length === 2) date = new Date(2000 + Number(parts[1]), Number(parts[0]) - 1, 1);
    else date = new Date(str);
  }
  if (!date || isNaN(date.getTime())) return '';
  return Utilities.formatDate(date, getTimeZone_(), 'yyyy-MM-dd');
}

function fromIsoDate_(iso) {
  var parts = String(iso).slice(0, 10).split('-').map(Number);
  return new Date(parts[0], parts[1] - 1, parts[2]);
}

/** Converte 'yyyy-MM' no rótulo de mês M/yy usado na aba Histórico Mensal (ex.: 2026-10 -> 10/26). */
function monthLabel_(yyyyMm) {
  var parts = String(yyyyMm).split('-');
  var year = parts[0] || '';
  var month = Number(parts[1]) || 0;
  return month + '/' + year.slice(-2);
}

function sanitizeText_(value, maxLength) {
  return String(value || '').replace(/[<>]/g, '').trim().slice(0, maxLength || 100);
}

function escapeHtml_(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatMoney_(value, currency) {
  return Number(value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: currency || 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function signedMoney_(value) {
  var number = Number(value) || 0;
  return (number >= 0 ? '+' : '-') + formatMoney_(Math.abs(number), 'USD');
}

function signedPercent_(value) {
  var number = Number(value) || 0;
  return (number >= 0 ? '+' : '') + number.toFixed(2) + '%';
}

function formatMonthPt_(month) {
  var months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  var parts = month.split('-');
  return months[Number(parts[1]) - 1] + ' de ' + parts[0];
}
