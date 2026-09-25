import type { Metadata } from "next"
import { LegalDocument } from "@/components/legal/LegalDocument"

const deletionRequestUrl = "https://wa.me/5541987038339?text=Ol%C3%A1%2C%20quero%20solicitar%20a%20exclus%C3%A3o%20dos%20meus%20dados%20do%20InstaCommand."

export const metadata: Metadata = {
  title: "Exclusão de Dados | InstaCommand",
  description: "Veja como solicitar a remoção dos dados do InstaCommand e o que acontece com conteúdo publicado nas redes sociais.",
  robots: { index: true, follow: true },
}

export default function DataDeletionPage() {
  return <LegalDocument title="Exclusão de dados" description="Você pode pedir a exclusão dos dados associados ao seu workspace do InstaCommand a qualquer momento.">
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
  </LegalDocument>
}
