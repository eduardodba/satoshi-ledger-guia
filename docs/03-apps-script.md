# 3. O projeto no Apps Script

O Apps Script é o “servidor” do projeto: um arquivo com as funções (`Code.gs`) e
outro com a tela (`Dashboard.html`). Tudo roda na infraestrutura do Google.

## Abrir o editor

Na planilha: **Extensões → Apps Script**. Abre uma nova aba com o editor.

## Os dois arquivos

1. **`Código.gs`** (ou `Code.gs`)
   Apague o conteúdo padrão e cole o conteúdo de [`src/Code.gs`](../src/Code.gs).

2. **`Dashboard.html`**
   Menu **Arquivos → + → HTML**. Nome: `Dashboard` (sem `.html`).
   Cole o conteúdo de [`src/Dashboard.html`](../src/Dashboard.html).

> O nome importa: `doGet()` chama `HtmlService.createHtmlOutputFromFile('Dashboard')`.
> Se o arquivo se chamar `Dashboard.html` no nome (com extensão), o Apps Script
> cria `Dashboard.html.html` e a página não abre.

## Rodar a configuração

1. Na barra superior do editor, escolha a função **`setupProject`**.
2. Clique em **Executar**.
3. Autorize (na primeira vez):
   - **Revisar permissões** → sua conta
   - **Avançado** → **Acessar (não seguro)** — o alerta é porque o script não é
     verificado pelo Google; ele é seu, roda na sua conta
   - **Permitir**

O que o `setupProject` faz:

- cria/ajusta as abas e os cabeçalhos
- formata as colunas (datas, moedas, larguras)
- garante a coluna `Origem`
- instala os gatilhos automáticos
- reconstrói os históricos diário e mensal
- mostra um aviso na planilha

## Menu da planilha

Depois de rodar uma vez, aparece o menu **₿ Satoshi Ledger** na planilha:

| Item | O que faz |
|---|---|
| Configurar / atualizar projeto | repete o setup (não apaga dados) |
| Registrar snapshot agora | grava o dia no `Histórico Diário` |
| Reconstruir históricos | recalcula as abas automáticas |
| Backup + reconstruir históricos | copia a planilha antes de recalcular |
| Enviar relatório mensal por email | testa o envio do resumo |

## Propriedades do script

O projeto guarda configurações em **Configurações do projeto → Propriedades do
script** (e o dashboard grava algumas sozinho):

| Propriedade | Para que |
|---|---|
| `TELEGRAM_TOKEN` | token do bot (opcional) |
| `TELEGRAM_CHAT_ID` | para quem enviar (opcional) |
| `GOAL_BTC` | meta de acumulação (opcional) |
| `CASH_SPECIAL` | valor do caixa especial (o dashboard controla) |
| `DCA_WEEKLY_FIXED` | cota semanal fixada (o dashboard controla) |

> Nunca coloque dados sensíveis no código. Token e chat id vão nas propriedades,
> que ficam privadas na sua conta.

## Usando `clasp` (opcional, para quem programa)

Se você prefere editar o código no VS Code:

```bash
npm install -g @google/clasp
clasp login
clasp clone <SCRIPT_ID>      # o ID está em Configurações do projeto
# copie src/Code.gs e src/Dashboard.html para a pasta clonada
clasp push
```

O arquivo `src/appsscript.json` deste repositório já traz o manifesto pronto
(runtime V8, webapp executando como o usuário).

## Fuso horário

**Arquivo → Configurações do projeto → Fuso horário.** Use o seu (ex.:
`America/Sao_Paulo`). Isso afeta a data dos snapshots e o horário dos gatilhos.

## Checklist

- [ ] `Code.gs` colado
- [ ] `Dashboard.html` criado com o nome exato
- [ ] `setupProject` executado sem erro
- [ ] menu “₿ Satoshi Ledger” aparecendo na planilha
