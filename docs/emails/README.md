# Templates de e-mail iNutri

HTML transacional no padrão visual da marca (faixa teal, logo, card branco, botão pílula).

- Recibo de pagamento: gerado em runtime por `buildPaymentReceiptEmail`.
- Auth (Supabase): cole os `.html` desta pasta no painel **Authentication → Emails → Templates**.
  Assunto do Confirm signup: `Confirme seu e-mail do iNutri`.
  Remetente **não** fica no template. Vá em **Authentication → SMTP Settings** (ou a aba SMTP na mesma tela de Emails):
  - Sender name: `iNutri`
  - Sender email: `contato@inutri.life`
