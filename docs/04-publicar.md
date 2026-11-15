# 4. Publicar o dashboard (web app)

O dashboard é um **app da Web** do Apps Script: uma URL que abre a página e fala
com a planilha por baixo.

> **Onde está no código**
> - 📄 [`src/Code.gs`](../src/Code.gs) → `doGet()` (entrega a página `Dashboard`)
> - 📄 [`src/Email.gs`](../src/Email.gs) → `urlDashboard_()` (usa a URL atual da
>   implantação; **não** tem URL fixa — não é preciso substituir nada ao publicar)


## Publicando

1. No editor do Apps Script: **Implantar → Nova implantação**.
2. Ícone de engrenagem → **App da Web**.
3. Preencha:

| Campo | Valor |
|---|---|
| Descrição | `dashboard` (livre) |
| Executar como | **Eu** (seu e-mail) |
| Quem tem acesso | **Somente eu** |

4. **Implantar** → copie a **URL do app da Web**
   (algo como `https://script.google.com/macros/s/SEU_ID_AQUI/exec`).

> **Por que “Somente eu”?** Porque o app executa na sua conta e enxerga sua
> planilha. Se você escolher “Qualquer pessoa”, quem tiver o link vê tudo.

## Abrindo no celular

1. Abra a URL no navegador do celular.
2. Menu do navegador → **Adicionar à tela de início**.
3. Pronto: vira um ícone, abre em tela cheia e funciona como app.

O layout se adapta sozinho (barra inferior com Resumo, Performance, DCA, Análise,
Mensal e Ledger).

## Atualizando depois de mexer no código

Duas formas:

**a) Teste rápido (URL de teste):**
**Implantar → Testar implantações** — usa a URL `/dev` e mostra sempre a última
versão do código.

**b) Publicar de verdade (URL `/exec`):**
**Implantar → Gerenciar implantações → editar (lápis) → Versão: Nova versão →
Implantar**. A URL continua a mesma.

> Se você editar o código e a URL `/exec` continuar mostrando a versão antiga, é
> porque faltou criar uma **nova versão**. Isso é o comportamento normal do
> Apps Script.

## Limite de versões

O Apps Script guarda no máximo **200 versões** por projeto. Se você publica
muitas atualizações, esse limite chega. Duas saídas:

- usar a **implantação de teste** (`/dev`) durante o desenvolvimento;
- manter uma única implantação e sempre criar “Nova versão” nela.

## Checklist

- [ ] implantação criada como “App da Web”
- [ ] executar como **Eu**
- [ ] acesso **Somente eu**
- [ ] URL `/exec` abrindo o dashboard
- [ ] atalho criado no celular
