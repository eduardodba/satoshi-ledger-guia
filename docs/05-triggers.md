# 5. Gatilhos (automação)

Gatilhos são “despertadores” do Google: eles rodam uma função do seu script em um
horário definido, mesmo com o navegador fechado.

## O que o projeto instala

O `setupProject` cria três, sem duplicar:

| Função | Quando roda | Para que |
|---|---|---|
| `recordDailySnapshot` | todo dia ~21h | grava a linha do dia no `Histórico Diário` |
| `sendMonthlyReportIfNeeded` | todo dia ~22h | no dia 1º, envia o resumo do mês |
| `sendWeeklyDcaAlert` | toda quarta ~13h | manda o aporte da semana no Telegram |

> O horário é aproximado: o Google escolhe o minuto dentro daquela hora. O fuso
> usado é o das Configurações do projeto.

## Gatilho extra (opcional) — resumo no Telegram

O arquivo `ResumoMensal.gs` traz a função `configurarGatilhoAutom`, que cria um
gatilho para enviar o **resumo mensal com gráficos** no Telegram. Ela não é
chamada automaticamente: rode uma vez no editor se quiser esse recurso. Ele
depende das mesmas propriedades `TELEGRAM_TOKEN` e `TELEGRAM_CHAT_ID`.

## Como conferir

No editor do Apps Script: ícone de **relógio (⏰) → Gatilhos**. Devem aparecer os
três. Se algum estiver faltando, rode `setupProject` de novo (é idempotente).

## Como rodar na mão

No editor, selecione a função na barra superior e clique em **Executar**:

- `recordDailySnapshot` — grava o snapshot de hoje agora
- `sendWeeklyDcaAlert` — envia o alerta do DCA agora (se estiver na janela)
- `sendMonthlyReportIfNeeded` — força o envio do relatório
- `rebuildHistories` — recalcula diário e mensal a partir de `Aportes`

Pela planilha, o menu **₿ Satoshi Ledger** dá acesso aos mesmos comandos.

## Limites que você deve conhecer

| Limite | Valor | Impacto |
|---|---|---|
| Tempo de execução por chamada | 6 min (conta gratuita) | recálculo de histórico muito longo pode precisar rodar em partes |
| Gatilhos por projeto | ~20 | não é problema aqui |
| E-mails por dia | 100 (gratuito) | o relatório mensal usa 1 |
| Chamadas de URL externa | 20.000/dia | o app usa poucas por dia (cache) |

## Quando o snapshot não grava

Sintomas: o gráfico fica “parado” no último dia.

1. Confira em **Gatilhos** se `recordDailySnapshot` existe.
2. Rode `recordDailySnapshot` na mão e veja se aparece linha nova.
3. Se a planilha estiver com a aba `Histórico Diário` protegida, o script não
   consegue escrever — remova a proteção.
4. Autorização revogada (troca de senha, por exemplo) derruba os gatilhos: rode
   `setupProject` e autorize de novo.

## Backup automático

Não existe gatilho de backup embutido. O menu
**Backup + reconstruir históricos** cria uma cópia da planilha antes de
recalcular. Para backup periódico, use **Arquivo → Fazer uma cópia** ou o
histórico de versões do próprio Sheets.
