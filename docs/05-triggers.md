# 5. Gatilhos (automação)

> **Onde está no código**
> - 📄 [`src/Code.gs`](../src/Code.gs) → função **`installTriggers_()`** (cria os gatilhos)
> - 📄 [`src/Code.gs`](../src/Code.gs) → funções executadas: **`recordDailySnapshot`**, **`sendMonthlyReportIfNeeded`**, **`sendWeeklyDcaAlert`**
> - 📄 [`src/ResumoMensal.gs`](../src/ResumoMensal.gs) → função **`configurarGatilhoAutom()`** (gatilho opcional extra)

Gatilhos são “despertadores” do Google: rodam uma função do seu script num
horário definido, mesmo com o navegador fechado.

## O que é criado automaticamente

Quando você roda **`setupProject`** (passo E do [`03-apps-script.md`](03-apps-script.md)),
a função `installTriggers_()` cria três gatilhos:

| Função executada | Quando roda | O que faz |
|---|---|---|
| `recordDailySnapshot` | todo dia ~21h | grava a linha do dia no `Histórico Diário` |
| `sendMonthlyReportIfNeeded` | todo dia ~22h | no dia 1º, envia o resumo do mês por email |
| `sendWeeklyDcaAlert` | toda quarta ~13h | manda o aporte da semana no Telegram (**só se faltar aportar**) |
| `sendWeeklySummary` | todo domingo ~20h | resumo da semana no Telegram (se ativado no painel) |

> O horário é aproximado: o Google escolhe o minuto dentro daquela hora. O fuso
> é o das **Configurações do projeto** (veja [`03`](03-apps-script.md)).

Você **não precisa criar nada à mão** se usou o `setupProject`. Os quatro já estão
ativos (o resumo semanal só envia se estiver ligado no painel de notificações).

## Como conferir

No editor do Apps Script: ícone de **relógio (⏰) → Gatilhos**.
Devem aparecer exatamente estes três.

Se faltar algum, rode `setupProject` de novo — a função é **idempotente** (não
duplica o que já existe; veja `ensureTrigger_` em `Code.gs`).

## Como rodar na mão (para testar)

No editor, escolha a função no seletor superior e clique em **Executar**:

| Função | O que acontece |
|---|---|
| `recordDailySnapshot` | grava o snapshot de hoje agora |
| `sendWeeklyDcaAlert` | envia o alerta do DCA agora (se estiver na janela) |
| `sendMonthlyReportIfNeeded` | força o envio do relatório do mês |
| `rebuildHistories` | recalcula `Histórico Diário` e `Mensal` a partir de `Aportes` |

Pela planilha, o menu **₿ Satoshi Ledger** dá acesso aos mesmos comandos.

## Quer mudar o horário? (SUBSTITUIR)

Os horários estão em `Code.gs`, dentro de `installTriggers_()`:

```js
// ⏰ 21h — snapshot diário
ensureTrigger_('recordDailySnapshot', function () {
  ScriptApp.newTrigger('recordDailySnapshot').timeBased().everyDays(1).atHour(21).create();
});

// ⏰ 22h — relatório mensal
ensureTrigger_('sendMonthlyReportIfNeeded', function () {
  ScriptApp.newTrigger('sendMonthlyReportIfNeeded').timeBased().everyDays(1).atHour(22).create();
});

// ⏰ quarta 13h — alerta do DCA
ensureTrigger_('sendWeeklyDcaAlert', function () {
  ScriptApp.newTrigger('sendWeeklyDcaAlert').timeBased().onWeekDay(ScriptApp.WeekDay.WEDNESDAY).atHour(13).create();
});
```

Para mudar:

1. **SUBSTITUA** o número em `.atHour(21)` pelo horário desejado (formato 24h).
   Para trocar o dia: `ScriptApp.WeekDay.WEDNESDAY` → `TUESDAY`, `MONDAY`, etc.
2. **Apague o gatilho antigo** em ⏰ → Gatilhos (senão ficam dois).
3. Rode `setupProject` (ou `installTriggers_`) para criar o novo.

> `installTriggers_` só cria o que não existe. Se você mudou o horário e não
> apagou o antigo, os dois continuam ativos — por isso o passo 2.

## Gatilho extra (opcional) — resumo com gráficos no Telegram

O arquivo [`src/ResumoMensal.gs`](../src/ResumoMensal.gs) traz a função
**`configurarGatilhoAutom()`**, que cria um gatilho para enviar o **resumo mensal
com gráficos** no Telegram.

**COMO FAZER:** no editor, selecione `configurarGatilhoAutom` e clique em
**Executar** uma vez. Ela usa as mesmas propriedades `TELEGRAM_TOKEN` e
`TELEGRAM_CHAT_ID` (veja [`06-telegram.md`](06-telegram.md)).

## Limites que você deve conhecer

| Limite | Valor | Impacto aqui |
|---|---|---|
| Tempo de execução por chamada | 6 min (conta gratuita) | recálculo muito longo pode precisar rodar em partes |
| Gatilhos por projeto | ~20 | não é problema |
| Emails por dia | 100 | o relatório mensal usa 1 |
| Chamadas de URL externa | 20.000/dia | o app usa poucas (cache de 5 min a 6 h) |

## Quando o snapshot não grava

Sintomas: o gráfico fica “parado” no último dia.

1. Confira em **⏰ → Gatilhos** se `recordDailySnapshot` existe.
2. Rode `recordDailySnapshot` na mão e veja se aparece linha nova.
3. Se a aba `Histórico Diário` estiver **protegida**, o script não escreve —
   remova a proteção.
4. Autorização revogada (troca de senha, por exemplo) derruba os gatilhos: rode
   `setupProject` e autorize de novo.

## Backup automático

Não existe gatilho de backup embutido. O menu
**Backup + reconstruir históricos** cria uma cópia antes de recalcular. Para
backup periódico, use **Arquivo → Fazer uma cópia** ou o histórico de versões do
Sheets.
