import { LegalDocument, legalLinkClass, legalPaths, type LegalLang } from "./LegalDocument"

// Portuguese text: original content of /politica-de-privacidade, unchanged.
const ptBody = <>
    <section>
      <h2>1. Quem opera o InstaCommand</h2>
      <p>O InstaCommand é operado pela UX Code Desenvolvimento Web (CNPJ 66.650.579/0001-46), com endereço comercial em Curitiba/PR. Para dúvidas ou solicitações sobre dados pessoais, use o canal de contato indicado no final desta página. Esta política se aplica ao site e ao serviço InstaCommand.</p>
    </section>

    <section>
      <h2>2. Dados que podemos tratar</h2>
      <ul>
        <li><strong>Cadastro e acesso:</strong> nome, e-mail, senha armazenada como hash, foto de perfil quando fornecida e identificadores de sessão.</li>
        <li><strong>Contas conectadas:</strong> identificadores, nomes de usuário, nome e imagem pública do perfil, dados básicos da Página vinculada e tokens de acesso necessários à integração. Tokens sociais são armazenados criptografados; não recebemos sua senha do Instagram ou do Facebook.</li>
        <li><strong>Conteúdo e agendamentos:</strong> legendas, arquivos de imagem/vídeo enviados, hashtags, datas, configurações e resultados de publicação.</li>
        <li><strong>Métricas e informações públicas:</strong> insights disponibilizados pelas plataformas, dados de audiência agregados e informações públicas de perfis que você decide acompanhar.</li>
        <li><strong>Comunidade e automações:</strong> regras, respostas, instruções e base de conhecimento configuradas por você; quando você ativa automações, eventos de comentários ou mensagens recebidos, identificadores relacionados, texto do evento, resposta e estado do processamento.</li>
        <li><strong>Suporte e segurança:</strong> mensagens que você envia ao suporte e registros técnicos de acesso e requisições necessários para manter o serviço e investigar falhas ou abuso.</li>
      </ul>
    </section>

    <section>
      <h2>3. Para que usamos esses dados</h2>
      <p>Usamos as informações para criar e proteger seu workspace, conectar as contas autorizadas, preparar e agendar publicações, apresentar métricas, oferecer os recursos de comunidade e automação que você ativar, responder ao suporte e cumprir obrigações legais. Não usamos dados das APIs da Meta para vender listas ou direcionar publicidade própria.</p>
    </section>

    <section>
      <h2>4. Recursos de inteligência artificial</h2>
      <p>Quando você escolhe um recurso de IA — por exemplo, gerar ou revisar uma legenda, analisar uma imagem ou sugerir uma resposta — o texto, contexto, comentário/mensagem ou imagem necessário para aquela solicitação é enviado ao provedor configurado para a conta ou para o serviço (como Google Gemini ou um provedor compatível com a API da OpenAI). O provedor recebe apenas os dados incluídos naquela solicitação; evite enviar informações que não queira compartilhar com ele. O tratamento pelo provedor segue os termos e configurações aplicáveis desse fornecedor.</p>
      <p>O envio automático de respostas de IA não fica ativado por padrão. Quando esse recurso estiver disponível e for ativado por você, as regras e limites da Meta também se aplicam.</p>
    </section>

    <section>
      <h2>5. Compartilhamento e operadores técnicos</h2>
      <p>Compartilhamos dados somente quando necessário para prestar o serviço: com Meta/Instagram/Facebook/Threads para realizar as operações que você autorizou; com o provedor de IA escolhido quando você solicita um recurso de IA; e com fornecedores de infraestrutura que hospedam ou processam o banco de dados, arquivos e filas técnicas do InstaCommand. Esses fornecedores recebem os dados necessários à sua função e podem estar sujeitos a políticas próprias.</p>
      <p>Não vendemos dados pessoais. Não publicamos conteúdo por conta própria: qualquer publicação ou resposta automatizada depende de uma ação/configuração da conta e da disponibilidade e autorização concedida pelas plataformas.</p>
    </section>

    <section>
      <h2>6. Armazenamento, retenção e segurança</h2>
      <p>Mantemos os dados enquanto sua conta e os recursos correspondentes estiverem em uso, pelo tempo necessário para operar o serviço e atender obrigações legais. Senhas são armazenadas em formato de hash e tokens de acesso sociais são criptografados no banco de dados. Sessões são usadas para manter você conectado. Nenhum sistema conectado à internet pode garantir risco zero.</p>
      <p>Quando uma conexão social é desativada, isso interrompe o uso daquela conexão pelo workspace, mas não apaga automaticamente o histórico já salvo. Para solicitar a exclusão dos dados, siga as instruções em <a className="font-semibold text-indigo-600 underline underline-offset-2" href="/exclusao-de-dados">Exclusão de dados</a>. Cópias técnicas de segurança e registros sujeitos a retenção legal podem permanecer pelo período necessário e são eliminados conforme os ciclos de retenção aplicáveis.</p>
    </section>

    <section>
      <h2>7. Seus direitos e contato</h2>
      <p>Nos termos da legislação aplicável, incluindo a LGPD, você pode solicitar confirmação de tratamento, acesso, correção, informação sobre compartilhamento, oposição quando cabível e eliminação ou anonimização de dados. Para fazer um pedido, use o canal da UX Code indicado abaixo e informe o e-mail do workspace e o assunto “Privacidade — InstaCommand”. Podemos pedir informações razoáveis para confirmar que o pedido é seu. Não envie senhas nem tokens.</p>
    </section>

    <section>
      <h2>8. Alterações nesta política</h2>
      <p>Podemos atualizar este texto quando o serviço, as integrações ou a legislação mudarem. A versão vigente ficará publicada nesta URL com a data da última atualização.</p>
    </section>
</>

// English translation of the same content.
const enBody = (primary: LegalLang) => <>
    <section>
      <h2>1. Who operates InstaCommand</h2>
      <p>InstaCommand is operated by UX Code Desenvolvimento Web (Brazilian company registration CNPJ 66.650.579/0001-46), with a business address in Curitiba, Paraná, Brazil. For questions or requests about personal data, use the contact channel listed at the end of this page. This policy applies to the InstaCommand website and service.</p>
    </section>

    <section>
      <h2>2. Data we may process</h2>
      <ul>
        <li><strong>Registration and access:</strong> name, email address, password stored as a hash, profile photo when provided, and session identifiers.</li>
        <li><strong>Connected accounts:</strong> identifiers, usernames, public profile name and picture, basic data of the linked Page, and the access tokens required for the integration. Social tokens are stored encrypted; we never receive your Instagram or Facebook password.</li>
        <li><strong>Content and scheduling:</strong> captions, uploaded image/video files, hashtags, dates, settings, and publishing results.</li>
        <li><strong>Metrics and public information:</strong> insights made available by the platforms, aggregated audience data, and public information from profiles you choose to monitor.</li>
        <li><strong>Community and automations:</strong> rules, replies, instructions, and knowledge base configured by you; when you enable automations, the comment or message events received, related identifiers, the event text, the reply, and the processing status.</li>
        <li><strong>Support and security:</strong> messages you send to support and technical access and request logs needed to maintain the service and investigate failures or abuse.</li>
      </ul>
    </section>

    <section>
      <h2>3. How we use this data</h2>
      <p>We use this information to create and protect your workspace, connect the accounts you authorize, prepare and schedule posts, display metrics, provide the community and automation features you enable, respond to support requests, and comply with legal obligations. We do not use data obtained from Meta APIs to sell lists or to target our own advertising.</p>
    </section>

    <section>
      <h2>4. Artificial intelligence features</h2>
      <p>When you choose an AI feature — for example, generating or reviewing a caption, analyzing an image, or suggesting a reply — the text, context, comment/message, or image needed for that request is sent to the provider configured for the account or for the service (such as Google Gemini or a provider compatible with the OpenAI API). The provider receives only the data included in that request; avoid sending information you do not want to share with it. Processing by the provider is governed by that provider&apos;s applicable terms and settings.</p>
      <p>Automatic sending of AI-generated replies is not enabled by default. When this feature is available and you enable it, Meta&apos;s rules and limits also apply.</p>
    </section>

    <section>
      <h2>5. Sharing and technical service providers</h2>
      <p>We share data only when necessary to provide the service: with Meta/Instagram/Facebook/Threads to perform the operations you authorized; with the AI provider you chose when you request an AI feature; and with infrastructure providers that host or process InstaCommand&apos;s database, files, and technical queues. These providers receive the data required for their function and may be subject to their own policies.</p>
      <p>We do not sell personal data. We do not publish content on our own initiative: any post or automated reply depends on an action or configuration made in the account and on the availability and authorization granted by the platforms.</p>
    </section>

    <section>
      <h2>6. Storage, retention, and security</h2>
      <p>We keep data while your account and the corresponding features are in use, for as long as necessary to operate the service and meet legal obligations. Passwords are stored as hashes and social access tokens are encrypted in the database. Sessions are used to keep you signed in. No system connected to the internet can guarantee zero risk.</p>
      <p>When a social connection is deactivated, the workspace stops using that connection, but the history already saved is not automatically erased. To request deletion of your data, follow the instructions on the <a className={legalLinkClass} href={legalPaths.deletion[primary]}>Data Deletion</a> page. Technical backup copies and records subject to legal retention may remain for the necessary period and are erased according to the applicable retention cycles.</p>
    </section>

    <section>
      <h2>7. Your rights and contact</h2>
      <p>Under applicable law, including the Brazilian General Data Protection Law (LGPD), you may request confirmation of processing, access, correction, information about sharing, objection where applicable, and deletion or anonymization of data. To make a request, use the UX Code channel listed below and provide your workspace email address and the subject “Privacy — InstaCommand” (“Privacidade — InstaCommand”). We may ask for reasonable information to confirm that the request is yours. Do not send passwords or tokens.</p>
    </section>

    <section>
      <h2>8. Changes to this policy</h2>
      <p>We may update this text when the service, the integrations, or the law change. The current version will remain published at this URL with the date of the last update.</p>
    </section>
</>

export function PrivacyPolicyDocument({ primary }: { primary: LegalLang }) {
  return <LegalDocument
    doc="privacy"
    primary={primary}
    pt={{ title: "Política de Privacidade", description: "Explicamos de forma direta quais informações são usadas para operar o InstaCommand e como exercer seus direitos de privacidade.", body: ptBody }}
    en={{ title: "Privacy Policy", description: "A straightforward explanation of which information is used to operate InstaCommand and how to exercise your privacy rights.", body: enBody(primary) }}
  />
}
