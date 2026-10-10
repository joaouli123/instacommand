import { LegalDocument, legalLinkClass, legalPaths, type LegalLang } from "./LegalDocument"

const deletionRequestUrl = "https://wa.me/5541987038339?text=Ol%C3%A1%2C%20quero%20solicitar%20a%20exclus%C3%A3o%20dos%20meus%20dados%20do%20InstaCommand."
const deletionRequestUrlEn = "https://wa.me/5541987038339?text=Hello%2C%20I%20would%20like%20to%20request%20the%20deletion%20of%20my%20InstaCommand%20data."

// Portuguese text: original content of /exclusao-de-dados, unchanged.
const ptBody = <>
    <section>
      <h2>Como solicitar</h2>
      <ol>
        <li>Entre em contato com a equipe da UX Code pelo <a className="font-semibold text-indigo-600 underline underline-offset-2" href={deletionRequestUrl} target="_blank" rel="noreferrer">canal oficial de atendimento</a> e peça “exclusão de dados do InstaCommand”.</li>
        <li>Informe o e-mail usado no InstaCommand e os nomes de usuário das contas sociais conectadas que deseja remover. Se não conseguir acessar o workspace, diga isso no pedido.</li>
        <li>Não envie sua senha, códigos de autenticação nem tokens de acesso. A equipe poderá solicitar informações adicionais para confirmar que você controla a conta.</li>
        <li>Após a verificação, a equipe processará o pedido e confirmará o andamento pelo canal de atendimento. Dados que precisem ser mantidos por obrigação legal ou em cópias de segurança serão isolados e retidos somente pelo período aplicável.</li>
      </ol>
    </section>

    <section>
      <h2>O que será removido</h2>
      <p>O pedido cobre os dados do workspace mantidos pelo InstaCommand, incluindo cadastro, conexões e tokens sociais, conteúdo e arquivos enviados, agendamentos, métricas importadas e configurações e registros de automação. A equipe pode manter registros mínimos quando a lei exigir ou durante os ciclos técnicos de cópias de segurança.</p>
    </section>

    <section>
      <h2>O que não é removido automaticamente</h2>
      <p>Excluir dados do InstaCommand não exclui publicações, comentários ou mensagens que já tenham sido enviados às plataformas sociais. Para remover esse conteúdo, use os controles próprios do Instagram, Facebook ou Threads. Desconectar uma conta no painel ou remover a autorização da Meta impede o uso futuro da integração, mas não substitui o pedido de exclusão dos dados já guardados no InstaCommand.</p>
    </section>

    <section>
      <h2>Relação com a Meta</h2>
      <p>Esta página descreve como pedir a remoção de dados armazenados pelo InstaCommand. A Meta também pode apresentar etapas próprias de desconexão ou remoção de acesso. Para dúvidas sobre dados tratados diretamente pela Meta, consulte os controles e políticas da própria plataforma.</p>
      <p>Para entender quais dados são tratados e por quê, leia a <a className="font-semibold text-indigo-600 underline underline-offset-2" href="/politica-de-privacidade">Política de Privacidade</a>.</p>
    </section>
</>

// English translation of the same content, plus where to revoke access in Meta's settings.
const enBody = (primary: LegalLang) => <>
    <section>
      <h2>How to request deletion</h2>
      <ol>
        <li>Contact the UX Code team through the <a className={legalLinkClass} href={deletionRequestUrlEn} target="_blank" rel="noreferrer">official support channel (WhatsApp)</a> and ask for “InstaCommand data deletion”. You can also reach the team through the contact channel at <a className={legalLinkClass} href="https://uxcode.com.br/#contato" target="_blank" rel="noreferrer">uxcode.com.br/contato</a>, listed at the bottom of this page, or by email at <a className={legalLinkClass} href="mailto:contato@uxcode.com.br">contato@uxcode.com.br</a>.</li>
        <li>Provide the email address you use on InstaCommand and the usernames of the connected social accounts you want removed. If you cannot access your workspace, say so in your request.</li>
        <li>Do not send your password, authentication codes, or access tokens. The team may ask for additional information to confirm that you control the account.</li>
        <li>After verification, the team will process the request and confirm its progress through the support channel. Data that must be kept because of a legal obligation, or that exists in backup copies, will be isolated and retained only for the applicable period.</li>
      </ol>
    </section>

    <section>
      <h2>What will be deleted</h2>
      <p>The request covers the workspace data held by InstaCommand, including your registration data, social connections and tokens, uploaded content and files, scheduled posts, imported metrics, and automation settings and logs. The team may keep minimal records when required by law or during the technical backup cycles.</p>
    </section>

    <section>
      <h2>Timeframe</h2>
      <p>The request is processed once the verification above is complete, and the team confirms its progress through the support channel. Records that must be retained by law and data in backup copies are kept isolated only for the applicable period and are then erased according to the corresponding retention cycles.</p>
    </section>

    <section>
      <h2>What is not deleted automatically</h2>
      <p>Deleting your InstaCommand data does not delete posts, comments, or messages that have already been sent to the social platforms. To remove that content, use the controls provided by Instagram, Facebook, or Threads. Disconnecting an account in the dashboard or removing Meta&apos;s authorization prevents any future use of the integration, but it does not replace a request to delete the data already stored in InstaCommand.</p>
    </section>

    <section>
      <h2>Revoking InstaCommand&apos;s access</h2>
      <p>You can stop InstaCommand from accessing your accounts at any time, in either of these ways:</p>
      <ul>
        <li><strong>In InstaCommand:</strong> open the Accounts page and disconnect the connected account (use the disconnect button next to it).</li>
        <li><strong>In Facebook:</strong> go to Settings &amp; privacy &gt; Settings &gt; Business Integrations (or Apps and Websites), select InstaCommand, and remove it. Instagram and Threads offer similar controls in their own settings.</li>
      </ul>
      <p>Either action revokes access and prevents future use of the integration. As explained above, it does not on its own delete the data already stored in InstaCommand; to have that data deleted, submit a request as described in “How to request deletion”.</p>
    </section>

    <section>
      <h2>Relationship with Meta</h2>
      <p>This page describes how to request the removal of data stored by InstaCommand. Meta may also offer its own steps for disconnecting or removing access. For questions about data processed directly by Meta, refer to the platform&apos;s own controls and policies.</p>
      <p>To understand which data is processed and why, read the <a className={legalLinkClass} href={legalPaths.privacy[primary]}>Privacy Policy</a>.</p>
    </section>
</>

export function DataDeletionDocument({ primary }: { primary: LegalLang }) {
  return <LegalDocument
    doc="deletion"
    primary={primary}
    pt={{ title: "Exclusão de dados", description: "Você pode pedir a exclusão dos dados associados ao seu workspace do InstaCommand a qualquer momento.", body: ptBody }}
    en={{ title: "Data Deletion", description: "You can request the deletion of the data associated with your InstaCommand workspace at any time.", body: enBody(primary) }}
  />
}
