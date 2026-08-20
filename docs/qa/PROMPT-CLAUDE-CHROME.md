# Prompt para colar no Claude do Chrome

Antes de começar:

1. Deixe **aberta** uma aba do e-mail de teste (Gmail/Outlook/Mailinator) — o agente precisa clicar em “Confirmar e-mail” duas vezes (C1 e C2).
2. Abra `https://inutri.life`.
3. Cole o bloco abaixo, **já preenchido**.
4. Anexe `docs/qa/e2e-claude-chrome.md` (ou cole o playbook). Sem o playbook o agente não tem os passos.

Cobrança real desta sessão: **C1** Essencial mensal (~R$ 49) + upgrade pró-rata para Pro; **C2** Pro mensal (~R$ 99). Não cancele as assinaturas no fim.

```
Você é QA sênior da aplicação web iNutri. Teste de ponta a ponta no Chrome. Não escreva código e não tente consertar nada — só navegue, clique, preencha, observe e registre bugs.

Siga o playbook docs/qa/e2e-claude-chrome.md na ordem da seção 7.

OBJETIVO
Criar DUAS contas novas de nutricionista e testar cadastro, e-mail, trial e pagamento de verdade.

- C1: signup → confirmar e-mail → teste grátis 7 dias (trial = Pro) → testar o app → assinar Essencial MENSAL → testar cadeados de Essencial (Silhueta, transcrição, funcionários) → upgrade para Pro MENSAL → testar de novo como Pro.
- C2: signup → confirmar e-mail → NÃO iniciar trial → pagar Pro MENSAL na hora → testar o app como Pro pago.

CONFIG
- BASE_URL: https://inutri.life
- MARKETING_URL: https://inutri.life
- Viewports: 1440×900 e 390×844
- EMAIL_BASE: paulo.h.mendes25@gmail.com
- EMAIL_PLUS_ADDRESSING: sim
- INBOX: aba já aberta em https://mail.google.com/mail/u/0/?tab=rm&ogbl#inbox
- SENHA_NOVAS_CONTAS: QaInutri!2026a
- PAGAMENTO: CREDIT_CARD
- CARTÃO_NÚMERO: 4444444444444444
- CARTÃO_NOME: Paulo Mendes
- CARTÃO_VALIDADE: 12/2035
- CARTÃO_CVV: 123
- CPF: 70791944158
- CEP: 75389334
- ENDERECO_NUMERO: 1
- TELEFONE: 62996969516
- PODE_PAGAR: sim
- PODE_GERAR_PLANO_IA: sim (1 por conta)
- NÃO cancele assinatura. NÃO apague as contas.

REGRAS
- Não pare no primeiro bug.
- Confirmação: após /verify-email vá à INBOX (até 120s), abra o e-mail iNutri, clique Confirmar. Destino correto = /assinatura logado.
- Pague só com o cartão do CONFIG. Não invente número. Recusa = S1 daquela jornada de billing.
- Trial libera Pro. Essencial deve bloquear Silhueta/transcrição/funcionários. Pro libera de novo.
- Compare preços da landing com /assinatura e com o valor cobrado (Essencial 49 / Pro 99).
- Prefixo de achado: [suíte][S1-S4][viewport][C1|C2/fase] URL=… | ação | esperado | obtido
- Relatório final = seção 13 do playbook, com os dois e-mails criados e os valores cobrados.

Comece agora pela S00 em MARKETING_URL, deslogado.
```
