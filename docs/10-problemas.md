# 10. Problemas comuns

## Dashboard

| Sintoma | Causa | Solução |
|---|---|---|
| Página em branco | arquivo HTML com nome errado | precisa se chamar `Dashboard` |
| “Script function not found: doGet” | `Code.gs` vazio | cole o código novamente |
| Abre, mas sem dados | nenhuma compra na aba `Aportes` | cadastre uma movimentação |
| Valores em R$ errados | cotação do dólar desatualizada | clique em Atualizar (cache de 5 min) |
| Gráficos vazios | período filtrado sem dados | troque para “Tudo” |
| “Aba Aportes não encontrada” | abas não criadas | rode `setupProject` |

## Planilha

| Sintoma | Causa | Solução |
|---|---|---|
| Histórico diário parado | gatilho não roda | rode `recordDailySnapshot` na mão; confira Gatilhos |
| Números “estranhos” no PM | linha com `Qtd ≠ valor ÷ preço` | edite a linha e corrija |
| Aba `IRPF` não aparece | nenhuma compra marcada | marque uma compra no painel fiscal |
| Dados duplicados | linha cadastrada duas vezes | exclua a duplicada em Movimentações |

## Autorização e implantação

| Erro | Causa | Solução |
|---|---|---|
| “Precisa de autorização” a cada execução | permissões revogadas | rode `setupProject` e autorize de novo |
| URL `/exec` mostra versão antiga | nova versão não publicada | Implantar → Gerenciar → Nova versão |
| “Limite de 200 versões” | muitas implantações | use a URL `/dev` e mantenha uma só implantação |
| “Você não tem permissão” ao abrir a URL | acesso não é “Somente eu” | edite a implantação |

## APIs

| Sintoma | Causa | Solução |
|---|---|---|
| Preço congelado | API fora do ar / limite | aguarde; o app usa o último valor do cache |
| Régua on-chain vazia | API de dados on-chain indisponível | normal; o resto continua funcionando |
| Data do halving mudando | estimativa por altura de bloco | é esperado (varia alguns dias) |

## Telegram

| Erro | Solução |
|---|---|
| `chat not found` | mande uma mensagem para o bot e confira o chat id |
| `Unauthorized` | gere novo token no @BotFather |
| Mensagem não chega | confira token/chat id no dashboard e rode o teste |

## Como recomeçar do zero (sem perder dados)

1. **Backup + reconstruir históricos** (menu da planilha).
2. Se algo continuar errado, edite a linha problemática na aba `Aportes`.
3. Rode **Reconstruir históricos**.
4. Recarregue o dashboard.

## Como pedir ajuda

Ao abrir uma issue neste repositório, informe:

- o que você fez;
- o que esperava;
- o que aconteceu (mensagem de erro completa);
- a versão mostrada no rodapé do dashboard.

**Nunca** cole token do Telegram, URL da sua implantação ou dados pessoais.
