import { LegalDocument, legalLinkClass, legalPaths, type LegalLang } from "./LegalDocument"

// Portuguese text: original content of /termos-de-servico, unchanged.
const ptBody = <>
    <section>
      <h2>1. Aceitação e escopo</h2>
      <p>Ao criar uma conta ou usar o InstaCommand, você concorda com estes termos e com a <a className="font-semibold text-indigo-600 underline underline-offset-2" href="/politica-de-privacidade">Política de Privacidade</a>. Se não concordar, não use o serviço. O InstaCommand oferece ferramentas para preparar, agendar e acompanhar conteúdo de contas profissionais conectadas.</p>
    </section>

    <section>
      <h2>2. Sua conta e segurança</h2>
      <p>Forneça informações corretas, mantenha suas credenciais em segurança e avise o suporte se suspeitar de acesso não autorizado. Você é responsável pelas atividades feitas no seu workspace e por limitar o acesso de pessoas autorizadas por você.</p>
    </section>

    <section>
      <h2>3. Contas sociais e permissões</h2>
      <p>Você só pode conectar contas e Páginas que administra ou para as quais tem autorização. Ao conectar uma plataforma, você autoriza o InstaCommand a usar os dados e executar as ações correspondentes às permissões que concedeu, conforme os recursos escolhidos. A conexão pode depender de aprovação da Meta, tipo de conta compatível, configuração correta e disponibilidade da API.</p>
      <p>Seu uso também precisa cumprir os termos, padrões e limites do Instagram, Facebook, Threads e demais serviços conectados. Essas plataformas são operadas por terceiros e podem alterar ou interromper suas APIs, permissões, formatos ou regras sem controle da UX Code.</p>
    </section>

    <section>
      <h2>4. Publicações, automações e conteúdo</h2>
      <p>Você é responsável por revisar o conteúdo, os arquivos, direitos de uso, informações, destinatários, horários e configurações antes de publicar ou ativar uma automação. Um agendamento ou regra ativada pode executar a ação configurada quando as condições técnicas e as regras da plataforma permitirem.</p>
      <p>Você deve ter os direitos e autorizações necessários para todo material enviado e não pode usar o serviço para spam, assédio, fraude, violação de direitos, automação abusiva ou qualquer finalidade proibida por lei ou pelas plataformas. Curtidas e novos seguidores não são gatilhos oferecidos pelas automações atuais; as opções disponíveis aparecem na própria plataforma.</p>
    </section>

    <section>
      <h2>5. Sugestões de inteligência artificial</h2>
      <p>As respostas, textos, análises e ideias gerados por IA são sugestões para revisão humana. Podem conter erros, omissões ou informações desatualizadas; confira antes de usar ou publicar. Você continua responsável por qualquer conteúdo publicado ou resposta enviada. O uso de IA também está sujeito à <a className="font-semibold text-indigo-600 underline underline-offset-2" href="/politica-de-privacidade">Política de Privacidade</a> e às condições do provedor configurado.</p>
    </section>

    <section>
      <h2>6. Disponibilidade e condições comerciais</h2>
      <p>Buscamos manter o serviço disponível, mas não garantimos operação ininterrupta nem resultados específicos em redes sociais. Recursos podem ficar indisponíveis durante manutenção, falhas de terceiros ou mudanças de API. Qualquer preço ou condição comercial aplicável será apresentado separadamente antes da contratação; estes termos não autorizam cobrança automática que não tenha sido apresentada e aceita.</p>
    </section>

    <section>
      <h2>7. Suspensão, encerramento e exclusão</h2>
      <p>Podemos limitar ou suspender o acesso quando necessário para proteger o serviço, cumprir a lei ou responder a uso que viole estes termos. Você pode parar de usar o serviço e pedir a exclusão dos seus dados conforme as <a className="font-semibold text-indigo-600 underline underline-offset-2" href="/exclusao-de-dados">instruções de exclusão</a>. A remoção de dados do InstaCommand não apaga automaticamente conteúdos já publicados nas plataformas sociais.</p>
    </section>

    <section>
      <h2>8. Alterações e contato</h2>
      <p>Estes termos podem ser atualizados para refletir mudanças no produto ou na legislação. A versão vigente ficará nesta URL. Dúvidas sobre estes termos podem ser encaminhadas à UX Code pelo canal de contato apresentado abaixo.</p>
    </section>
</>

// English translation of the same content.
const enBody = (primary: LegalLang) => <>
    <section>
      <h2>1. Acceptance and scope</h2>
      <p>By creating an account or using InstaCommand, you agree to these terms and to the <a className={legalLinkClass} href={legalPaths.privacy[primary]}>Privacy Policy</a>. If you do not agree, do not use the service. InstaCommand provides tools to prepare, schedule, and monitor content for connected professional accounts.</p>
    </section>

    <section>
      <h2>2. Your account and security</h2>
      <p>Provide accurate information, keep your credentials secure, and notify support if you suspect unauthorized access. You are responsible for the activities carried out in your workspace and for limiting access to the people you authorize.</p>
    </section>

    <section>
      <h2>3. Social accounts and permissions</h2>
      <p>You may only connect accounts and Pages that you manage or are authorized to use. When you connect a platform, you authorize InstaCommand to use the data and perform the actions corresponding to the permissions you granted, according to the features you choose. The connection may depend on Meta&apos;s approval, a compatible account type, correct configuration, and API availability.</p>
      <p>Your use must also comply with the terms, standards, and limits of Instagram, Facebook, Threads, and any other connected services. These platforms are operated by third parties and may change or discontinue their APIs, permissions, formats, or rules without UX Code having any control over them.</p>
    </section>

    <section>
      <h2>4. Posts, automations, and content</h2>
      <p>You are responsible for reviewing the content, files, usage rights, information, recipients, times, and settings before publishing or enabling an automation. A scheduled post or an enabled rule may perform the configured action when the technical conditions and the platform&apos;s rules allow it.</p>
      <p>You must hold the rights and authorizations required for all material you upload, and you may not use the service for spam, harassment, fraud, infringement of rights, abusive automation, or any purpose prohibited by law or by the platforms. Likes and new followers are not triggers offered by the current automations; the available options are shown within the platform itself.</p>
    </section>

    <section>
      <h2>5. Artificial intelligence suggestions</h2>
      <p>Replies, texts, analyses, and ideas generated by AI are suggestions for human review. They may contain errors, omissions, or outdated information; check them before using or publishing them. You remain responsible for any content published or reply sent. The use of AI is also subject to the <a className={legalLinkClass} href={legalPaths.privacy[primary]}>Privacy Policy</a> and to the terms of the configured provider.</p>
    </section>

    <section>
      <h2>6. Availability and commercial terms</h2>
      <p>We strive to keep the service available, but we do not guarantee uninterrupted operation or specific results on social networks. Features may become unavailable during maintenance, third-party outages, or API changes. Any applicable price or commercial terms will be presented separately before you sign up for them; these terms do not authorize any automatic charge that has not been presented and accepted.</p>
    </section>

    <section>
      <h2>7. Suspension, termination, and deletion</h2>
      <p>We may limit or suspend access when necessary to protect the service, comply with the law, or respond to use that violates these terms. You may stop using the service and request deletion of your data by following the <a className={legalLinkClass} href={legalPaths.deletion[primary]}>data deletion instructions</a>. Removing data from InstaCommand does not automatically delete content already published on social platforms.</p>
    </section>

    <section>
      <h2>8. Changes and contact</h2>
      <p>These terms may be updated to reflect changes in the product or in the law. The current version will remain at this URL. Questions about these terms can be sent to UX Code through the contact channel shown below.</p>
    </section>
</>

export function TermsOfServiceDocument({ primary }: { primary: LegalLang }) {
  return <LegalDocument
    doc="terms"
    primary={primary}
    pt={{ title: "Termos de Serviço", description: "Estes termos explicam as condições para acessar e usar o InstaCommand, plataforma operada pela UX Code.", body: ptBody }}
    en={{ title: "Terms of Service", description: "These terms explain the conditions for accessing and using InstaCommand, a platform operated by UX Code.", body: enBody(primary) }}
  />
}
