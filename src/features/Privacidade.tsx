import { Page, TopBar } from '../ui/primitives'

/** Aviso de privacidade (LGPD) — linguagem simples, o que o rolê guarda, pra quê e como apagar. */
export function PrivacidadePage() {
  const S = ({ t, children }: { t: string; children: React.ReactNode }) => (
    <section className="mt-7">
      <h2 className="text-[13px] uppercase tracking-[0.14em] text-mute">{t}</h2>
      <div className="mt-2 grid gap-2 text-[14px] leading-relaxed text-ink/85">{children}</div>
    </section>
  )
  return (
    <Page>
      <TopBar title="Privacidade" />
      <div className="px-5 pb-16">
        <h1 className="font-serif text-[40px] leading-[0.95] tracking-tight">Aviso de <em className="text-accent">privacidade</em></h1>
        <p className="mt-3 text-[13px] text-mute">Versão de teste (MVP) · atualizado em 26/11/2026</p>

        <S t="O que guardamos">
          <p><b className="font-medium">Perfil:</b> nome, @, gosto (estilos e vibes) e sua região arredondada a ~1 km. Nunca o endereço, o CEP ou a localização exata.</p>
          <p><b className="font-medium">Conta Google (se você entrar com ela):</b> e-mail e o identificador da conta, só pra você entrar de outro celular.</p>
          <p><b className="font-medium">O que você faz no app:</b> pedidos, votos, sugestões, avaliações de lugares ("quem foi"), lugares que indicou e as turmas de que participa.</p>
          <p><b className="font-medium">Uso:</b> eventos anônimos de navegação (telas, cliques principais) pra melhorar o app.</p>
        </S>
        <S t="Pra quê">
          <p>Montar recomendações pro seu gosto e perto de você, fazer as votações com a sua turma, formar a nota da comunidade e mostrar onde falta curadoria.</p>
          <p>Não vendemos dados e não usamos pra anúncio.</p>
        </S>
        <S t="Quem vê o quê">
          <p>Seu nome aparece pra quem participa das mesmas votações e turmas, e junto das suas avaliações públicas. Gosto e região não aparecem pra ninguém.</p>
          <p>Comentários passam por moderação automática antes de ficarem públicos.</p>
        </S>
        <S t="Onde fica">
          <p>No seu aparelho e, durante a fase de testes, num servidor do responsável pelo projeto. Fotos, notas e horários do Google aparecem ao vivo e não são guardados.</p>
        </S>
        <S t="Seus direitos (LGPD)">
          <p>Você pode ver, corrigir (Perfil → editar gosto) e <b className="font-medium">apagar tudo</b> (Perfil → Seus dados → Apagar meus dados). Ao apagar, seu perfil, avaliações e participação em turmas saem do servidor; nos votos antigos seu nome vira "Alguém".</p>
          <p>Dúvidas: fale com o responsável pelo teste pelo botão de feedback.</p>
        </S>
      </div>
    </Page>
  )
}
