import type { Metadata } from "next"
import { LegalDocument } from "@/components/legal/LegalDocument"

export const metadata: Metadata = {
  title: "Termos de Serviço | InstaCommand",
  description: "Regras de acesso e uso do InstaCommand, incluindo integrações com redes sociais, publicações e automações.",
  robots: { index: true, follow: true },
}

export default function TermsOfServicePage() {
  return <LegalDocument title="Termos de Serviço" description="Estes termos explicam as condições para acessar e usar o InstaCommand, plataforma operada pela UX Code.">
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
  </LegalDocument>
}
