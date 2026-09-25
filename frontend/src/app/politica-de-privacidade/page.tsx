import type { Metadata } from "next"
import { LegalDocument } from "@/components/legal/LegalDocument"

export const metadata: Metadata = {
  title: "Política de Privacidade | InstaCommand",
  description: "Saiba quais dados o InstaCommand trata, para que são usados, com quem podem ser compartilhados e como pedir sua exclusão.",
  robots: { index: true, follow: true },
}

export default function PrivacyPolicyPage() {
  return <LegalDocument title="Política de Privacidade" description="Explicamos de forma direta quais informações são usadas para operar o InstaCommand e como exercer seus direitos de privacidade.">
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
  </LegalDocument>
}
