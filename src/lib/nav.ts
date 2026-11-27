/** voltar de verdade: só volta no histórico se a tela anterior é do app (o react-router numera em history.state.idx).
 *  Quem chegou por link (zap, Instagram) não tem tela anterior do app: o "voltar"/"x" ia pra página de redirecionamento
 *  (v/), que mandava de volta pra mesma tela, e parecia que o botão não funcionava. */
export function canGoBack() {
  try { return ((window.history.state as { idx?: number } | null)?.idx ?? 0) > 0 } catch { return false }
}

