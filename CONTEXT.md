# iNutri

Software de nutrição: o nutricionista conduz a ficha e o plano; o paciente usa o app quando tem conta.

## Language

**Paciente**:
A ficha clínica de uma pessoa acompanhada pelo nutricionista. Existe sem conta. Nome, telefone e e-mail moram na ficha.
_Avoid_: User, conta, cadastro (quando a pessoa ainda não foi convidada)

**Conta**:
Identidade de login (`User` + Supabase). Nutricionista, funcionário e paciente convidado têm conta. Paciente sem convite não tem.
_Avoid_: User como sinônimo de paciente

**Convite**:
Ato explícito do nutricionista que cria a conta do paciente a partir do e-mail da ficha e envia o e-mail do Supabase. Nunca é efeito colateral de criar ou importar a ficha.
_Avoid_: cadastro, create patient (no sentido antigo de invite-on-create)

**Importação de pacientes**:
Entrada em lote de fichas a partir de planilha (modelo iNutri ou qualquer Excel/CSV), com mapeamento de colunas confirmado pelo nutricionista. Grava ficha, avaliação e anamnese. Não envia convite.
_Avoid_: migração de sistema, sync, integração Dietbox
