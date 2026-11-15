# 3. O projeto no Apps Script — o que criar e o que colar

O Apps Script é o “servidor” do projeto. Ele tem **7 arquivos de código** e todos
precisam ser criados **na mão**, colando o conteúdo de `src/` deste repositório.

> Nada é instalado automaticamente. O papel de cada arquivo está na tabela
> abaixo — siga de cima para baixo.

## Mapa de colagem

| # | Nome do arquivo no editor | Tipo | Obrigatório? | Cole o conteúdo de | Para que serve |
|---|---|---|---|---|---|
| 1 | `Code` | Script | **sim** | [`src/Code.gs`](../src/Code.gs) | motor: menus, gatilhos, preços, posição, DCA |
| 2 | `Dashboard` | HTML | **sim** | [`src/Dashboard.html`](../src/Dashboard.html) | a interface (dashboard) |
| 3 | `Email` | Script | **sim** | [`src/Email.gs`](../src/Email.gs) | relatório mensal por email |
| 4 | `ResumoMensal` | Script | opcional | [`src/ResumoMensal.gs`](../src/ResumoMensal.gs) | resumo mensal com gráficos no Telegram |
| 5 | `GravaHistoricoDario` | Script | opcional | [`src/GravaHistoricoDario.gs`](../src/GravaHistoricoDario.gs) | grava o histórico do dia à mão |
| 6 | `GravaHistoricoMensal` | Script | opcional | [`src/GravaHistoricoMensal.gs`](../src/GravaHistoricoMensal.gs) | grava o histórico do mês à mão |
| 7 | `Cotacao` | Script | opcional | [`src/Cotacao.gs`](../src/Cotacao.gs) | teste da cotação (`COTACAO`) |

> ⚠️ Sem o `Email`, o item **“Enviar relatório mensal por email”** do menu dá
> erro `function not found`, porque quem chama essa função é o `Code`.

## Passo A — abrir o editor

Na planilha: **Extensões → Apps Script**. Abre uma nova aba do navegador.

## Passo B — arquivo 1: `Code`

1. O editor já cria um arquivo chamado `Código.gs` (ou `Code.gs`).
2. **Selecione todo o conteúdo** (Ctrl/Cmd + A) e **apague**.
3. Abra [`src/Code.gs`](../src/Code.gs), copie tudo e cole no editor.
4. Salve (Ctrl/Cmd + S).

**Não precisa renomear.** Se o arquivo se chama `Código.gs`, está ótimo — o nome
do arquivo não importa para o `Code`, só o nome do HTML importa.

## Passo C — arquivo 2: `Dashboard` (HTML)

1. **Arquivos → + → HTML**.
2. Digite o nome **`Dashboard`** — **sem** `.html`.
   O editor acrescenta a extensão sozinho; se você digitar `Dashboard.html`, ele
   cria `Dashboard.html.html` e o dashboard **não abre**.
3. Apague o conteúdo de exemplo (`<!DOCTYPE html>...`).
4. Cole o conteúdo de [`src/Dashboard.html`](../src/Dashboard.html).
5. Salve.

## Passo D — arquivos 3 a 7 (scripts)

Para **cada** um dos cinco restantes:

1. **Arquivos → + → Script**.
2. Digite o nome **exato** da tabela (`Email`, `ResumoMensal`,
   `GravaHistoricoDario`, `GravaHistoricoMensal`, `Cotacao`).
3. Apague o conteúdo padrão (`function myFunction() {}`).
4. Cole o arquivo correspondente de `src/`.
5. Salve.

> A grafia `GravaHistoricoDario` (sem o “i” em “Diário”) é a original do projeto.
> Mantenha assim para não confundir quem for te ajudar depois.

## Passo E — rodar a configuração

1. Na barra superior do editor, no seletor de funções, escolha **`setupProject`**.
2. Clique em **Executar**.
3. Autorize:
   - **Revisar permissões** → sua conta
   - **Avançado** → **Acessar (não seguro)** — o alerta aparece porque o script
     não é verificado pelo Google; ele é seu e roda na sua conta
   - **Permitir**
4. Volte na planilha: as abas estão formatadas e o menu **₿ Satoshi Ledger**
   apareceu.

O que o `setupProject` faz (em `Code.gs`):

- cria/ajusta as abas e os cabeçalhos (`APP.SHEETS` e `APP.HEADERS`)
- formata datas, moedas e larguras
- garante a coluna `Origem`
- instala os três gatilhos (`installTriggers_`)
- reconstrói os históricos diário e mensal

## Passo F — conferir o que foi criado

No editor, o painel de arquivos deve mostrar **7 arquivos**:

```
Code
Dashboard (HTML)
Email
ResumoMensal
GravaHistoricoDario
GravaHistoricoMensal
Cotacao
```

Se faltar algum, repita o passo correspondente. Arquivo faltando = função não
encontrada quando você clicar no menu.

## O que você pode querer SUBSTITUIR

Depois de colar, três ajustes são comuns — todos em `Code.gs`:

| O quê | Onde (procure por) | Valor original | Como saber o certo |
|---|---|---|---|
| Fuso horário | **Arquivo → Configurações do projeto** (não é no código) | `America/Sao_Paulo` | o seu fuso |
| Início da janela do DCA | `var DCA_PLAN` → `START_DAYS_BEFORE_HALVING` | `725` | veja [`08-dca.md`](08-dca.md) |
| Fim da janela do DCA | `var DCA_PLAN` → `END_DAYS_BEFORE_HALVING` | `500` | veja [`08-dca.md`](08-dca.md) |
| Percentual do caixa especial | `var DCA_PLAN` → `SPECIAL_PCT` | `0.20` (20%) | o seu critério |

> Não mexa em mais nada no código. O resto é configurado pela interface do
> dashboard ou pelas **Propriedades do script**.

## Propriedades do script

**Configurações do projeto → Propriedades do script.** O dashboard grava algumas
sozinho; outras você pode criar:

| Propriedade | Para que | Quem grava |
|---|---|---|
| `TELEGRAM_TOKEN` | token do bot | o dashboard (Configurações) |
| `TELEGRAM_CHAT_ID` | destinatário | o dashboard (Configurações) |
| `GOAL_BTC` | meta de acumulação | o dashboard |
| `CASH_SPECIAL` | caixa especial | o dashboard |
| `DCA_WEEKLY_FIXED` | cota fixa da semana | o dashboard |

> Nunca coloque token no código. Use as propriedades — elas ficam privadas na
> sua conta e não vão para o Git.

## Usando `clasp` (opcional, para quem programa)

```bash
npm install -g @google/clasp
clasp login
clasp clone <SCRIPT_ID>       # ID em Configurações do projeto
cp src/Code.gs src/Dashboard.html <pasta-clonada>/
clasp push
```

O `src/appsscript.json` deste repositório já traz o manifesto pronto (V8, webapp
executando como o usuário). Se você usar `clasp`, ele substitui o manifesto.

## Checklist desta etapa

- [ ] `Code` colado
- [ ] `Dashboard` criado como **HTML** (nome exato)
- [ ] `Email`, `ResumoMensal`, `GravaHistoricoDario`, `GravaHistoricoMensal`,
      `Cotacao` criados e colados
- [ ] 7 arquivos aparecendo no editor
- [ ] `setupProject` executado sem erro
- [ ] menu “₿ Satoshi Ledger” na planilha
