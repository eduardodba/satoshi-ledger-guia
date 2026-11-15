/**
 * ============================================================================
 *  RELATÓRIO MENSAL POR EMAIL
 *
 *  Regra de segurança (inegociável): o destino é SEMPRE o dono da conta que
 *  executa o script. Nenhuma função deste arquivo aceita um endereço de
 *  destinatário — não existe parâmetro "to". O email é montado a partir da
 *  planilha e enviado via MailApp para Session.getActiveUser().getEmail().
 *
 *  Uso:
 *    enviarEmailRelatorioMensal()            → último mês fechado
 *    enviarEmailRelatorioMensal('2026-09')   → mês específico
 *    enviarEmailRelatorioMensalTeste()       → envia o último mês fechado e loga
 *
 *  Automatização: crie um gatilho diário para enviarEmailRelatorioMensalSePreciso
 *  (envia uma única vez, no primeiro dia após o fechamento do mês).
 * ============================================================================
 */

var EMAIL_MENSAL = Object.freeze({
  MESES: ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
          'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'],
  MESES_CURTO: ['jan', 'fev', 'mar', 'abr', 'mai', 'jun',
                'jul', 'ago', 'set', 'out', 'nov', 'dez'],
  COR_BRL: '#0f9d6e',
  COR_USD: '#f7931a',
  PROP_ULTIMO_ENVIO: 'LAST_EMAIL_REPORT',
  PROP_DESTINO: 'EMAIL_DESTINO'
});

// ---------------------------------------------------------------------------
// Entradas públicas
// ---------------------------------------------------------------------------

/** Envia o relatório de um mês (padrão: último mês fechado). */
function enviarEmailRelatorioMensal(mes) {
  var alvo = mes || mesFechadoAnterior_();
  var dados = dadosDoMes_(alvo);
  if (!dados.ok) throw new Error(dados.erro);
  var carta = montarEmailMensal_(dados);
  var destino = donoDaConta_();
  assertDestinoPermitido_(destino);

  MailApp.sendEmail({
    to: destino,
    subject: carta.assunto,
    htmlBody: carta.html,
    inlineImages: carta.imagens,
    name: 'Satoshi Ledger'
  });

  PropertiesService.getScriptProperties().setProperty(EMAIL_MENSAL.PROP_ULTIMO_ENVIO, alvo);
  return { ok: true, enviadoPara: destino, mes: alvo, assunto: carta.assunto };
}

/** Atalho para rodar no editor e conferir o log. */
function enviarEmailRelatorioMensalTeste() {
  var r = enviarEmailRelatorioMensal();
  Logger.log(JSON.stringify(r));
  return r;
}

/**
 * Roda diariamente (gatilho) e envia uma única vez por mês, no primeiro dia
 * após o fechamento. Idempotente via Script Property.
 */
function enviarEmailRelatorioMensalSePreciso() {
  var alvo = mesFechadoAnterior_();
  var ultimo = PropertiesService.getScriptProperties().getProperty(EMAIL_MENSAL.PROP_ULTIMO_ENVIO);
  if (ultimo === alvo) return { ok: true, pulado: true, motivo: 'já enviado', mes: alvo };
  return enviarEmailRelatorioMensal(alvo);
}

// ---------------------------------------------------------------------------
// Segurança do destinatário
// ---------------------------------------------------------------------------

/**
 * Destino do relatório. Só pode ser o dono da conta.
 *
 * O Apps Script só devolve o email em Session.getEffectiveUser().getEmail()
 * quando o projeto tem o escopo userinfo.email; sem ele, a chamada volta
 * vazia (foi exatamente o erro de 21/10). Para não depender desse escopo,
 * o endereço é fixado na Script Property EMAIL_DESTINO — que só o dono do
 * script consegue alterar. Se o Session devolver um email diferente do
 * configurado, o envio é bloqueado.
 */
function donoDaConta_() {
  var sessao = '';
  try { sessao = String(Session.getEffectiveUser().getEmail() || '').trim(); } catch (e) {}
  try { if (!sessao) sessao = String(Session.getActiveUser().getEmail() || '').trim(); } catch (e2) {}

  var props = PropertiesService.getScriptProperties();
  var configurado = String(props.getProperty(EMAIL_MENSAL.PROP_DESTINO) || '').trim();

  if (sessao && configurado && sessao.toLowerCase() !== configurado.toLowerCase()) {
    throw new Error('Envio bloqueado: EMAIL_DESTINO (' + configurado + ') difere do dono da conta (' + sessao + ').');
  }

  var destino = configurado || sessao;
  if (!destino) {
    throw new Error('Destino não configurado. Defina a propriedade de script EMAIL_DESTINO com o seu email.');
  }
  return destino;
}

/** Bloqueia qualquer destino que não seja o próprio dono. */
function assertDestinoPermitido_(destino) {
  var dono = donoDaConta_();
  if (String(destino || '').trim().toLowerCase() !== dono.toLowerCase()) {
    throw new Error('Envio bloqueado: este relatório só pode ir para ' + dono + '.');
  }
  return dono;
}

// ---------------------------------------------------------------------------
// Dados do mês
// ---------------------------------------------------------------------------

/** Primeiro dia do mês seguinte ao último mês fechado → mês anterior. */
function mesFechadoAnterior_() {
  var agora = new Date();
  var d = new Date(agora.getFullYear(), agora.getMonth() - 1, 1);
  return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2);
}

function dadosDoMes_(mes) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var contribuicoes = readContributions_(ss);
  var diario = readDailyHistory_(ss);
  var linhas = diario.filter(function (d) { return d.date.slice(0, 7) === mes; });
  if (!linhas.length) return { ok: false, erro: 'Sem histórico diário para ' + mes + '.' };

  var primeiro = linhas[0], ultimo = linhas[linhas.length - 1];
  var anterior = null;
  for (var i = diario.length - 1; i >= 0; i--) {
    if (diario[i].date < mes + '-01') { anterior = diario[i]; break; }
  }
  if (!anterior) return { ok: false, erro: 'Sem fechamento do mês anterior a ' + mes + '.' };

  var fxFim = ultimo.balanceUsd > 0 ? ultimo.balanceBrl / ultimo.balanceUsd : 0;
  var fxIni = anterior.balanceUsd > 0 ? anterior.balanceBrl / anterior.balanceUsd : fxFim;

  var doMes = contribuicoes.filter(function (c) {
    return c.date.slice(0, 7) === mes && !c.isAdjustment;
  });
  var compras = doMes.filter(function (c) { return c.amountUsd > 0; });
  var vendas = doMes.filter(function (c) { return c.amountUsd < 0; });
  var externos = compras.filter(function (c) { return c.origin === CONTRIBUTION_ORIGIN.NEW; });

  var caixaFim = caixaAte_(contribuicoes, ultimo.date);
  var caixaIni = caixaAte_(contribuicoes, anterior.date);

  var retorno = retornoDoMes_(anterior, ultimo, externos);

  return {
    ok: true,
    mes: mes,
    ref: ultimo.date,
    inicio: anterior.date,
    precoUsdIni: anterior.btcPrice,
    precoUsdFim: ultimo.btcPrice,
    fxIni: fxIni,
    fxFim: fxFim,
    qtd: ultimo.quantityBtc,
    pmUsd: ultimo.averagePrice,
    pmBrl: ultimo.averagePrice * fxFim,
    valorUsd: ultimo.balanceUsd,
    valorBrl: ultimo.balanceBrl,
    caixaUsd: caixaFim,
    caixaBrl: caixaFim * fxFim,
    caixaIniUsd: caixaIni,
    aportesN: compras.length,
    aportesUsd: compras.reduce(function (a, c) { return a + c.amountUsd; }, 0),
    aportesBrl: compras.reduce(function (a, c) { return a + c.amountUsd * cambialDaLinha_(c, fxFim); }, 0),
    resgatesN: vendas.length,
    resgatesUsd: Math.abs(vendas.reduce(function (a, c) { return a + c.amountUsd; }, 0)),
    retornoBrl: retorno.brl,
    retornoUsd: retorno.usd,
    resultadoBrl: retorno.resultadoBrl,
    resultadoUsd: retorno.resultadoUsd,
    btcBrlIni: anterior.btcPrice * fxIni,
    btcBrlFim: ultimo.btcPrice * fxFim,
    btcBrlVar: anterior.btcPrice > 0 ? ((ultimo.btcPrice * fxFim) / (anterior.btcPrice * fxIni) - 1) * 100 : 0,
    btcUsdVar: anterior.btcPrice > 0 ? (ultimo.btcPrice / anterior.btcPrice - 1) * 100 : 0,
    meta: getGoalBtc_() > 0 ? getGoalBtc_() : 1,
    serie: linhas.map(function (d) {
      return { dia: Number(d.date.slice(8, 10)), usd: d.balanceUsd, brl: d.balanceBrl };
    })
  };
}

function cambialDaLinha_(c, fallback) {
  var fx = (c.priceBrl && c.priceUsd) ? c.priceBrl / c.priceUsd : 0;
  return fx > 0 ? fx : fallback;
}

/** Saldo de caixa considerando todos os lançamentos até a data. */
function caixaAte_(contribuicoes, iso) {
  var saldo = 0;
  contribuicoes.forEach(function (c) {
    if (c.date > iso) return;
    if (c.isAdjustment) saldo += c.amountUsd;
    else if (c.amountUsd < 0) saldo += Math.abs(c.amountUsd);
    else if (c.origin === CONTRIBUTION_ORIGIN.CASH || c.origin === CONTRIBUTION_ORIGIN.CASH_SPECIAL) saldo -= c.amountUsd;
  });
  return saldo;
}

/** Modified Dietz em USD e em BRL (fluxos externos = aportes de dinheiro novo). */
function retornoDoMes_(anterior, ultimo, externos) {
  var d0 = new Date(anterior.date + 'T12:00:00');
  var d1 = new Date(ultimo.date + 'T12:00:00');
  var dias = (d1 - d0) / 86400000 + 1;
  var fxFim = ultimo.balanceUsd > 0 ? ultimo.balanceBrl / ultimo.balanceUsd : 0;

  var fluxoUsd = 0, fluxoBrl = 0, pondUsd = 0, pondBrl = 0;
  externos.forEach(function (c) {
    var fx = cambialDaLinha_(c, fxFim);
    var decorridos = Math.max(0, Math.min(dias, (new Date(c.date + 'T12:00:00') - d0) / 86400000));
    var peso = (dias - decorridos) / dias;
    fluxoUsd += c.amountUsd;
    fluxoBrl += c.amountUsd * fx;
    pondUsd += c.amountUsd * peso;
    pondBrl += c.amountUsd * fx * peso;
  });

  var resUsd = ultimo.balanceUsd - anterior.balanceUsd - fluxoUsd;
  var resBrl = ultimo.balanceBrl - anterior.balanceBrl - fluxoBrl;
  var denUsd = anterior.balanceUsd + pondUsd;
  var denBrl = anterior.balanceBrl + pondBrl;

  return {
    usd: denUsd > 0 ? (resUsd / denUsd) * 100 : 0,
    brl: denBrl > 0 ? (resBrl / denBrl) * 100 : 0,
    resultadoUsd: resUsd,
    resultadoBrl: resBrl
  };
}

// ---------------------------------------------------------------------------
// Montagem do email
// ---------------------------------------------------------------------------

function montarEmailMensal_(d) {
  var nomeMes = nomeDoMes_(d.mes);
  var assunto = 'Satoshi Ledger · ' + nomeMes + ': ' + pctEmail_(d.retornoBrl) + ' no mês';

  var graficoBrl = graficoBlob_(d.serie.map(function (p) { return p.dia; }),
    d.serie.map(function (p) { return Math.round(p.brl / 1000); }), EMAIL_MENSAL.COR_BRL);
  var graficoUsd = graficoBlob_(d.serie.map(function (p) { return p.dia; }),
    d.serie.map(function (p) { return Math.round(p.usd / 1000); }), EMAIL_MENSAL.COR_USD);

  var html = [
    '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">',
    '<title>' + esc_(assunto) + '</title></head>',
    '<body style="margin:0;padding:0;background:#eef1f6;">',
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#eef1f6;padding:28px 12px;">',
    '<tr><td align="center">',
    '<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif;color:#0f172a;">',

    header_(nomeMes, d.ref),

    '<tr><td style="background:#fff;padding:26px 26px 4px;">',
    '<div style="font-size:10px;letter-spacing:1.2px;text-transform:uppercase;color:#8a97a8;font-weight:700;">Patrimônio em ' + dataCurta_(d.ref) + '</div>',
    '<table role="presentation" width="100%" style="margin-top:10px;"><tr>',
    '<td width="50%" style="vertical-align:top;">',
    '<div style="font-size:33px;font-weight:800;letter-spacing:-1.4px;line-height:1.05;">' + brl_(d.valorBrl + d.caixaBrl, 2) + '</div>',
    '<div style="font-size:11px;color:#7c8899;margin-top:6px;">em reais · câmbio ' + numero_(d.fxFim, 4) + '</div>',
    '</td>',
    '<td width="1" style="background:#eef2f7;"></td>',
    '<td width="50%" style="vertical-align:top;padding-left:18px;">',
    '<div style="font-size:33px;font-weight:800;letter-spacing:-1.4px;line-height:1.05;color:#334155;">' + usd_(d.valorUsd + d.caixaUsd, 2) + '</div>',
    '<div style="font-size:11px;color:#7c8899;margin-top:6px;">em dólar · ' + btc_(d.qtd) + ' BTC + ' + usd_(d.caixaUsd, 0) + '</div>',
    '</td></tr></table>',
    '<div style="margin-top:14px;font-size:11.5px;color:#64748b;">Câmbio no mês: <b style="color:#0f172a;">' +
      numero_(d.fxIni, 4) + ' → ' + numero_(d.fxFim, 4) + '</b> <span style="color:#94a3b8;">(' +
      pctEmail_(d.fxIni > 0 ? (d.fxFim / d.fxIni - 1) * 100 : 0) + ')</span></div>',
    '</td></tr>',

    '<tr><td style="background:#fff;padding:18px 26px 4px;">',
    '<table role="presentation" width="100%"><tr>',
    card_('Resultado do mês', pctEmail_(d.retornoBrl), pctEmail_(d.retornoUsd) + ' em dólar',
      brl_(d.resultadoBrl, 0) + ' <span style="color:#b6c0cd;">(inclui câmbio)</span> · ' + usd_(d.resultadoUsd, 0), '#0f9d6e'),
    '<td width="12"></td>',
    card_('Contra o Bitcoin', pctEmail_(d.retornoBrl - d.btcBrlVar) + ' p.p.',
      pctEmail_(d.retornoUsd - d.btcUsdVar) + ' p.p. em dólar',
      'BTC fez ' + pctEmail_(d.btcBrlVar) + ' / ' + pctEmail_(d.btcUsdVar), '#0f9d6e'),
    '</tr></table>',
    '</td></tr>',

    '<tr><td style="background:#fff;padding:22px 26px 4px;">',
    '<div style="font-size:11px;font-weight:700;">Evolução no mês</div>',
    '<div style="font-size:10px;color:#8a97a8;margin-top:2px;">valor de mercado da posição, em cada moeda</div>',
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:10px;"><tr>',
    '<td width="49%" style="vertical-align:top;">',
    '<div style="font-size:10.5px;font-weight:700;color:#0f172a;">Em reais <span style="font-weight:500;color:#94a3b8;">· milhares</span></div>',
    '<div style="font-size:9.5px;color:#94a3b8;">' + brl_(d.serie[0].brl, 0) + ' → ' + brl_(d.valorBrl, 0) + '</div>',
    '<img src="cid:graficoBrl" width="250" alt="Evolução em reais" style="display:block;width:100%;max-width:250px;height:auto;border:0;margin-top:6px;">',
    '</td>',
    '<td width="2%"></td>',
    '<td width="49%" style="vertical-align:top;">',
    '<div style="font-size:10.5px;font-weight:700;color:#0f172a;">Em dólar <span style="font-weight:500;color:#94a3b8;">· milhares</span></div>',
    '<div style="font-size:9.5px;color:#94a3b8;">' + usd_(d.serie[0].usd, 0) + ' → ' + usd_(d.valorUsd, 0) + '</div>',
    '<img src="cid:graficoUsd" width="250" alt="Evolução em dólar" style="display:block;width:100%;max-width:250px;height:auto;border:0;margin-top:6px;">',
    '</td></tr></table>',
    '</td></tr>',

    '<tr><td style="background:#fff;padding:22px 26px 6px;">',
    '<div style="font-size:11px;font-weight:700;margin-bottom:8px;">O que aconteceu no mês</div>',
    '<table role="presentation" width="100%" style="font-size:12px;color:#475569;">',
    linha_(d.aportesN + (d.aportesN === 1 ? ' aporte' : ' aportes'), '',
      brl_(d.aportesBrl, 0) + ' <span style="color:#94a3b8;font-weight:500;">· ' + usd_(d.aportesUsd, 0) + '</span>', '#0f172a'),
    linha_(d.resgatesN + (d.resgatesN === 1 ? ' resgate' : ' resgates'), '',
      d.resgatesN ? brl_(d.resgatesUsd * d.fxFim, 0) + ' <span style="color:#94a3b8;font-weight:500;">· ' + usd_(d.resgatesUsd, 0) + '</span>' : '—', '#0f172a'),
    linha_('Bitcoin', '', pctEmail_(d.btcBrlVar) + ' <span style="color:#94a3b8;font-weight:500;">· ' + pctEmail_(d.btcUsdVar) + '</span>', '#0f9d6e'),
    '</table>',
    '</td></tr>',

    '<tr><td style="background:#fff;padding:16px 26px 6px;">',
    '<table role="presentation" width="100%"><tr>',
    '<td width="50%" style="padding:14px 16px;border:1px solid #eef2f7;border-radius:12px;vertical-align:top;">',
    '<div style="font-size:9px;letter-spacing:.7px;text-transform:uppercase;color:#8a97a8;font-weight:700;">Posição</div>',
    '<div style="font-size:18px;font-weight:800;margin-top:6px;letter-spacing:-.3px;">' + btc_(d.qtd) + ' BTC</div>',
    '<div style="font-size:11.5px;color:#64748b;margin-top:3px;">' + brl_(d.pmBrl, 0) + ' · ' + usd_(d.pmUsd, 0) + '</div>',
    '<div style="font-size:9.5px;color:#94a3b8;margin-top:2px;">preço médio</div>',
    '</td>',
    '<td width="12"></td>',
    '<td width="50%" style="padding:14px 16px;border:1px solid #eef2f7;border-radius:12px;vertical-align:top;">',
    '<div style="font-size:9px;letter-spacing:.7px;text-transform:uppercase;color:#8a97a8;font-weight:700;">Meta de ' + btc_(d.meta, 0) + ' ₿</div>',
    '<div style="font-size:18px;font-weight:800;color:#f7931a;margin-top:6px;letter-spacing:-.3px;">' +
      numero_((d.qtd / d.meta) * 100, 1) + '%</div>',
    '<div style="font-size:11.5px;color:#64748b;margin-top:3px;">faltam ' + btc_(Math.max(0, d.meta - d.qtd)) + ' BTC</div>',
    barra_((d.qtd / d.meta) * 100),
    '</td></tr></table>',
    '</td></tr>',

    '<tr><td style="background:#fff;padding:22px 26px 28px;text-align:center;" align="center">',
    '<a href="' + urlDashboard_() + '" style="display:inline-block;background:#f7931a;color:#231503;text-decoration:none;font-weight:700;font-size:13px;padding:12px 22px;border-radius:10px;">Abrir o dashboard</a>',
    '</td></tr>',

    '<tr><td style="background:#f8fafc;border-top:1px solid #e8eef5;border-radius:0 0 16px 16px;padding:18px 26px;">',
    '<div style="font-size:10.5px;color:#8a97a8;line-height:1.6;">Gerado automaticamente a partir da planilha <b style="color:#64748b;">' +
      esc_(SpreadsheetApp.getActiveSpreadsheet().getName()) + '</b>.<br>Valores informativos, não constituem recomendação financeira.</div>',
    '</td></tr>',

    '</table></td></tr></table></body></html>'
  ].join('');

  return { assunto: assunto, html: html, imagens: { graficoBrl: graficoBrl, graficoUsd: graficoUsd } };
}

// ---------------------------------------------------------------------------
// Peças de HTML
// ---------------------------------------------------------------------------

function header_(nomeMes, ref) {
  return '<tr><td style="background:#0d1117;border-radius:16px 16px 0 0;padding:22px 26px;">' +
    '<table role="presentation" width="100%"><tr><td style="vertical-align:middle;">' +
    '<table role="presentation"><tr>' +
    '<td style="width:38px;height:38px;background:#f7931a;border-radius:11px;text-align:center;vertical-align:middle;font-size:21px;font-weight:800;color:#1a1206;">₿</td>' +
    '<td style="padding-left:11px;vertical-align:middle;">' +
    '<div style="color:#fff;font-size:15px;font-weight:700;">Satoshi Ledger</div>' +
    '<div style="color:#7d8998;font-size:10px;letter-spacing:1.1px;text-transform:uppercase;margin-top:2px;">Relatório mensal</div>' +
    '</td></tr></table></td>' +
    '<td align="right" style="vertical-align:middle;">' +
    '<div style="color:#f7931a;font-size:13px;font-weight:700;">' + esc_(nomeMes) + '</div>' +
    '<div style="color:#5d6a7a;font-size:10px;margin-top:2px;">fechamento ' + dataCurta_(ref) + '</div>' +
    '</td></tr></table></td></tr>';
}

function card_(titulo, valor, sub, rodape, cor) {
  return '<td width="50%" style="padding:14px 16px;background:#f6f8fb;border-radius:12px;">' +
    '<div style="font-size:9px;letter-spacing:.7px;text-transform:uppercase;color:#8a97a8;font-weight:700;">' + esc_(titulo) + '</div>' +
    '<div style="font-size:22px;font-weight:800;color:' + cor + ';letter-spacing:-.6px;margin-top:6px;">' + valor + '</div>' +
    '<div style="font-size:12px;color:#64748b;margin-top:2px;">' + sub + '</div>' +
    '<div style="font-size:10.5px;color:#94a3b8;margin-top:5px;">' + rodape + '</div></td>';
}

function linha_(rotulo, detalhe, valor, cor) {
  return '<tr><td style="padding:9px 0;border-top:1px solid #eef2f7;">' +
    '<span style="color:#0f172a;font-weight:600;">' + esc_(rotulo) + '</span>' +
    (detalhe ? ' <span style="color:#94a3b8;">· ' + esc_(detalhe) + '</span>' : '') +
    '</td><td align="right" style="padding:9px 0;border-top:1px solid #eef2f7;font-weight:700;color:' + cor + ';">' + valor + '</td></tr>';
}

function barra_(pct) {
  var w = Math.max(0, Math.min(100, pct));
  return '<div style="height:6px;background:#eef2f7;border-radius:99px;margin-top:9px;overflow:hidden;">' +
    '<div style="height:6px;width:' + w.toFixed(1) + '%;background:#f7931a;border-radius:99px;"></div></div>';
}

// ---------------------------------------------------------------------------
// Gráficos (QuickChart — mesma engine já usada no relatório do Telegram)
// ---------------------------------------------------------------------------

function graficoBlob_(labels, valores, cor) {
  var cfg = {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        data: valores,
        borderColor: cor,
        backgroundColor: rgba_(cor, 0.15),
        fill: true,
        borderWidth: 2.5,
        pointRadius: 0,
        tension: 0.25
      }]
    },
    options: {
      legend: { display: false },
      layout: { padding: { left: 2, right: 8, top: 6, bottom: 0 } },
      scales: {
        xAxes: [{ gridLines: { display: false, drawBorder: false },
                  ticks: { fontSize: 9, fontColor: '#94a3b8', maxTicksLimit: 4, autoSkip: true } }],
        yAxes: [{ gridLines: { color: '#eef2f7', drawBorder: false, zeroLineColor: '#eef2f7' },
                  ticks: { fontSize: 9, fontColor: '#94a3b8', maxTicksLimit: 4 } }]
      }
    }
  };
  var url = 'https://quickchart.io/chart?w=520&h=200&bkg=white&f=png&c=' + encodeURIComponent(JSON.stringify(cfg));
  var resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  if (resp.getResponseCode() !== 200) throw new Error('QuickChart respondeu ' + resp.getResponseCode());
  return resp.getBlob().setName('grafico.png');
}

function rgba_(hex, alpha) {
  var h = hex.replace('#', '');
  return 'rgba(' + parseInt(h.slice(0, 2), 16) + ',' + parseInt(h.slice(2, 4), 16) + ',' + parseInt(h.slice(4, 6), 16) + ',' + alpha + ')';
}


// ---------------------------------------------------------------------------
// Formatação
// ---------------------------------------------------------------------------

function numero_(v, d) {
  var n = Number(v) || 0;
  var negativo = n < 0;
  var partes = Math.abs(n).toFixed(d).split('.');
  partes[0] = partes[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return (negativo ? '-' : '') + partes.join(',');
}
function brl_(v, d) { return 'R$ ' + numero_(v, d === undefined ? 2 : d); }
function usd_(v, d) { return 'US$ ' + numero_(v, d === undefined ? 2 : d); }
function btc_(v, d) { return numero_(v, d === undefined ? 6 : d); }
function pctEmail_(v) {
  var n = Number(v) || 0;
  return (n >= 0 ? '+' : '') + n.toFixed(2).replace('.', ',') + '%';
}
function dataCurta_(iso) {
  var p = String(iso).split('-');
  return p[2] + '/' + p[1] + '/' + p[0];
}
function nomeDoMes_(mes) {
  var p = String(mes).split('-');
  var m = Number(p[1]) - 1;
  return EMAIL_MENSAL.MESES[m].charAt(0).toUpperCase() + EMAIL_MENSAL.MESES[m].slice(1) + ' de ' + p[0];
}
function esc_(s) {
  return String(s === undefined || s === null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function urlDashboard_() {
  // URL da implantação ATUAL (nunca fixa no código: muda a cada publicação).
  try {
    var url = ScriptApp.getService().getUrl();
    if (url) return url;
  } catch (e) {}
  return '';
}
