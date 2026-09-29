import Link from 'next/link';

// Vai nos metadados do cadastro (termsVersion): mudar o texto de forma
// relevante exige nova versão, para saber qual texto cada conta aceitou.
export const TERMS_VERSION = '2026-09-29';

const UPDATED_AT = '29 de setembro de 2026';
const CONTACT_EMAIL = 'contato@inutri.life';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h3 className="font-heading text-base font-semibold text-foreground">{title}</h3>
      <div className="mt-2 space-y-3 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </section>
  );
}

export function TermsOfUseContent() {
  return (
    <div>
      <p className="text-xs text-muted-foreground">Última atualização: {UPDATED_AT}</p>

      <Section title="1. Aceitação">
        <p>
          Estes Termos de Uso regem o uso da plataforma iNutri (site, sistema web e aplicativo). Ao
          criar uma conta, você declara que leu, entendeu e concorda com estes termos e com a{' '}
          <Link href="/privacy" target="_blank" className="font-medium text-primary underline">
            Política de Privacidade
          </Link>
          . Se não concordar, não utilize a plataforma.
        </p>
      </Section>

      <Section title="2. Quem somos">
        <p>
          O iNutri é oferecido por P H M DE SOUZA TECNOLOGIA (nome fantasia Paulo Mendes
          Tecnologia), inscrita no CNPJ sob o nº 46.894.998/0001-16, com sede em Goiânia/GO. Contato:{' '}
          <a className="font-medium text-primary underline" href={`mailto:${CONTACT_EMAIL}`}>
            {CONTACT_EMAIL}
          </a>
          .
        </p>
      </Section>

      <Section title="3. O serviço">
        <p>
          O iNutri é uma ferramenta de gestão para nutricionistas: cadastro e ficha de pacientes,
          anamnese, avaliações, planos alimentares, recordatórios, agenda, controle financeiro e
          recursos com inteligência artificial. Os pacientes podem acessar gratuitamente o aplicativo
          para acompanhar seus planos e registrar informações.
        </p>
      </Section>

      <Section title="4. Conta e cadastro">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            A conta de nutricionista é destinada a profissionais maiores de 18 anos, legalmente
            habilitados a exercer a profissão.
          </li>
          <li>Você deve informar dados verdadeiros e mantê-los atualizados.</li>
          <li>
            Você é responsável pela guarda da sua senha e por toda atividade realizada na sua conta,
            inclusive a de funcionários a quem você der acesso.
          </li>
        </ul>
      </Section>

      <Section title="5. Responsabilidade profissional">
        <p>
          O iNutri é uma ferramenta de apoio e não substitui o julgamento profissional. Diagnósticos,
          prescrições e condutas são de responsabilidade exclusiva do nutricionista.
        </p>
        <p>
          Conteúdos gerados por inteligência artificial (como sugestões de planos alimentares,
          transcrições de consultas e estimativas do Silhueta) podem conter erros e devem ser
          revisados antes de qualquer uso com o paciente. As estimativas do Silhueta servem para
          acompanhamento e não são diagnóstico nem substituem exames como bioimpedância ou DEXA.
        </p>
      </Section>

      <Section title="6. Dados dos pacientes e LGPD">
        <p>
          Em relação aos dados dos seus pacientes, você atua como controlador e o iNutri como
          operador, nos termos da Lei Geral de Proteção de Dados (Lei 13.709/2018). Tratamos esses
          dados apenas para prestar o serviço, conforme suas instruções e a Política de Privacidade.
        </p>
        <p>
          Cabe a você garantir uma base legal para o tratamento e obter os consentimentos
          necessários, em especial antes de gravar consultas ou enviar fotos do paciente para
          análise.
        </p>
        <p>
          Para prestar o serviço, utilizamos fornecedores de hospedagem, processamento de pagamentos
          e inteligência artificial, que recebem somente os dados necessários para cada função.
        </p>
      </Section>

      <Section title="7. Planos, pagamento e teste grátis">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            Os planos, preços e limites de uso (como a quantidade mensal de gerações por IA) são os
            informados na página de planos no momento da contratação.
          </li>
          <li>
            Novas assinaturas podem incluir um período de teste grátis de 7 dias. Se você cancelar
            antes do fim do teste, nada será cobrado.
          </li>
          <li>
            A cobrança é recorrente (mensal ou anual, conforme o plano escolhido) e processada pelo
            Asaas.
          </li>
          <li>
            Em caso de falta de pagamento, o acesso aos recursos pagos pode ser suspenso até a
            regularização.
          </li>
          <li>Alterações de preço serão comunicadas com pelo menos 30 dias de antecedência.</li>
        </ul>
      </Section>

      <Section title="8. Cancelamento">
        <p>
          Você pode cancelar a assinatura a qualquer momento, sem multa e sem fidelidade. O acesso
          continua até o fim do período já pago, e não há reembolso proporcional desse período.
        </p>
        <p>
          Se a sua primeira cobrança ocorrer sem período de teste, você pode desistir em até 7 dias e
          receber o valor de volta, conforme o art. 49 do Código de Defesa do Consumidor, pedindo
          pelo e-mail de contato.
        </p>
      </Section>

      <Section title="9. Uso permitido">
        <p>Não é permitido:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>compartilhar sua conta ou revender o acesso à plataforma;</li>
          <li>inserir dados de terceiros sem base legal para isso;</li>
          <li>
            tentar acessar áreas ou dados de outros usuários, burlar limites de uso ou sobrecarregar
            a plataforma com acessos automatizados;
          </li>
          <li>copiar, modificar ou fazer engenharia reversa do software.</li>
        </ul>
        <p>O descumprimento pode levar à suspensão ou ao encerramento da conta.</p>
      </Section>

      <Section title="10. Disponibilidade">
        <p>
          Trabalhamos para manter a plataforma disponível e segura, mas não garantimos funcionamento
          ininterrupto. Podem ocorrer manutenções e falhas de terceiros (como provedores de
          hospedagem ou de internet).
        </p>
      </Section>

      <Section title="11. Propriedade intelectual">
        <p>
          O software, a marca e o conteúdo do iNutri pertencem aos seus titulares. Os dados que você
          cadastra continuam sendo seus, e você nos autoriza a tratá-los apenas para prestar o
          serviço.
        </p>
      </Section>

      <Section title="12. Limitação de responsabilidade">
        <p>
          Na extensão permitida pela lei, o iNutri não responde por decisões clínicas tomadas com
          base na plataforma, por danos indiretos ou lucros cessantes, nem por falhas causadas por
          uso indevido da conta. Eventual responsabilidade fica limitada ao valor pago por você nos
          12 meses anteriores ao fato.
        </p>
      </Section>

      <Section title="13. Encerramento da conta">
        <p>
          Você pode pedir o encerramento da conta e a exclusão dos seus dados pelo e-mail de
          contato. Alguns dados podem ser mantidos pelo prazo exigido por lei, como registros
          fiscais e de acesso.
        </p>
      </Section>

      <Section title="14. Alterações destes termos">
        <p>
          Podemos atualizar estes termos. Mudanças relevantes serão avisadas por e-mail ou na
          própria plataforma, e o uso continuado após o aviso significa concordância com a nova
          versão.
        </p>
      </Section>

      <Section title="15. Lei aplicável e foro">
        <p>
          Estes termos são regidos pelas leis brasileiras. Fica eleito o foro da comarca de
          Goiânia/GO, ressalvado o direito do consumidor de ajuizar ação no foro do seu domicílio.
        </p>
      </Section>
    </div>
  );
}
