import { useEffect, useState } from 'react'
import { Sheet } from './Sheet'
import { Button } from './primitives'

/* Confirmação no visual do app (no lugar do confirm() do navegador, que alguns navegadores embutidos bloqueiam).
   Uso: if (!(await confirmSheet({ title, text, ok: 'Apagar', danger: true }))) return */
interface Ask { title: string; text?: string; ok?: string; danger?: boolean }
let show: ((a: Ask, done: (v: boolean) => void) => void) | null = null
export const confirmSheet = (a: Ask) => new Promise<boolean>((res) => (show ? show(a, res) : res(window.confirm(a.title))))

export function ConfirmHost() {
  const [cur, setCur] = useState<{ a: Ask; done: (v: boolean) => void } | null>(null)
  useEffect(() => { show = (a, done) => setCur({ a, done }); return () => { show = null } }, [])
  const close = (v: boolean) => { cur?.done(v); setCur(null) }
  return (
    <Sheet open={!!cur} onClose={() => close(false)}>
      {cur && (
        <div role="alertdialog" aria-label={cur.a.title}>
          <p className="font-serif text-[28px] leading-tight">{cur.a.title}</p>
          {cur.a.text && <p className="mt-2 text-[14px] text-mute">{cur.a.text}</p>}
          <div className="mt-6 grid gap-2">
            <Button size="lg" className={cur.a.danger ? 'w-full !bg-[#ff6b6b] !text-black' : 'w-full'} onClick={() => close(true)}>{cur.a.ok ?? 'Confirmar'}</Button>
            <Button size="lg" variant="ghost" className="w-full" onClick={() => close(false)}>Cancelar</Button>
          </div>
        </div>
      )}
    </Sheet>
  )
}
