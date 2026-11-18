# 6. Bot do Telegram (do zero)

Opcional. Serve para receber o alerta do aporte da semana e o resumo do mês no
celular.

> **Onde está no código**
> - 📄 [`src/Code.gs`](../src/Code.gs) → `telegramSendMessage_()` (envia mensagens)
> - 📄 [`src/Code.gs`](../src/Code.gs) → `sendWeeklyDcaAlert()` (alerta de quarta)
> - 📄 [`src/Code.gs`](../src/Code.gs) → `saveIntegrationSettings()` e `getIntegrationStatus()`
>   (gravam/lêem token e chat id nas Propriedades do script)
> - 📄 [`src/ResumoMensal.gs`](../src/ResumoMensal.gs) → envio do resumo com gráficos
>
> **Nada de token no código.** O que você digita nas Configurações vai para
> `TELEGRAM_TOKEN` e `TELEGRAM_CHAT_ID` nas Propriedades do script.


## 1. Criar o bot

1. No Telegram, procure **@BotFather** (é o oficial, com selo azul).
2. Envie `/newbot`.
3. Ele pede um **nome** (aparece para você) — ex.: `Minha Carteira BTC`.
4. Depois um **usuário**, que precisa terminar em `bot` — ex.: `minhacarteira_btc_bot`.
5. Ele responde com o **token**, algo assim:

```
<SEU_TOKEN>
```

O formato é `números:letras` (ex.: uma sequência longa depois dos dois pontos).

> Trate esse token como senha: quem tem o token controla o bot. Se vazar, use
> `/revoke` no BotFather para gerar outro.

## 2. Descobrir seu chat id

1. Abra uma conversa com o seu bot e mande `oi` (o bot precisa de pelo menos uma
   mensagem sua para poder te responder).
2. Abra no navegador:

```
https://api.telegram.org/bot<SEU_TOKEN>/getUpdates
```

3. Procure por `"chat":{"id":123456789,...}`. Esse número é o seu **chat id**.

> Se vier vazio, mande outra mensagem para o bot e recarregue a página.

## 3. Configurar no dashboard

1. Abra o dashboard.
2. Clique no ícone de **engrenagem** (Configurações).
3. Cole o **token** e o **chat id**.
4. Salve.

O dashboard grava essas informações nas **Propriedades do script** — não vão para
a planilha e não aparecem no código.

## 4. Testar

Pela planilha: menu **₿ Satoshi Ledger → Enviar relatório mensal por email**
(valida a configuração) ou, no editor do Apps Script, rode `sendWeeklyDcaAlert`.

Se a mensagem chegar, está pronto.

## Painel de notificações (no dashboard)

Clique no ícone de **sino** no topo do dashboard. O painel tem duas partes:

**Canais**

| Canal | O que faz |
|---|---|
| **Telegram** | alertas curtos no celular (token + chat id ficam aqui) |
| **E-mail** | relatório mensal completo (endereço configurável) |

**Tipos de aviso**

| Tipo | Canal | Quando |
|---|---|---|
| **Alerta de DCA** | Telegram | quarta — **só se ainda faltar aportar na semana** |
| **Resumo semanal** | Telegram | domingo à noite, com patrimônio e aportes da semana |
| **Relatório mensal** | E-mail | dia 1º, fechamento do mês |
| **Confirmação de aporte** | Telegram | a cada movimentação registrada |

Padrões de fábrica: DCA e mensal **ligados**; resumo semanal e confirmação de
aporte **desligados**.

> Desligar o canal **Telegram** desativa de uma vez todos os avisos que passam por
> ele, mesmo que o tipo esteja ligado. O mesmo vale para o e-mail.

Onde está no código:

- 📄 [`src/Code.gs`](../src/Code.gs) → `getNotificationSettings()` e `saveNotificationSettings()`
- 📄 [`src/Code.gs`](../src/Code.gs) → `notifLigada_()` (usado por cada envio)
- 📄 [`src/Code.gs`](../src/Code.gs) → `sendWeeklyDcaAlert()`, `sendWeeklySummary()`, `notifyAporte_()`
- 📄 [`src/Dashboard.html`](../src/Dashboard.html) → `openNotif()`, `renderNotif()`, `saveNotif()`

## O que o bot envia

| Mensagem | Quando |
|---|---|
| Aporte da semana (valor, BTC estimado, prazo) | toda quarta ~13h, se estiver na janela de DCA |
| Relatório mensal | dia 1º de cada mês |

## Problemas comuns

| Erro | Causa | Solução |
|---|---|---|
| `chat not found` | chat id errado ou bot nunca recebeu mensagem | mande `oi` para o bot e reconfira o id |
| `Unauthorized` | token inválido/revogado | gere novo token no BotFather |
| `Forbidden: bot was blocked` | você bloqueou o bot | desbloqueie no Telegram |
| nada chega | gatilho não criado | rode `setupProject` e confira em Gatilhos |

---

## Alternativa sem Telegram

Se não quiser bot, simplesmente ignore esta página: o dashboard e a planilha
funcionam iguais. O único recurso perdido são os alertas automáticos.
