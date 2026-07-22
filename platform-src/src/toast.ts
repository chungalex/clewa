/** The demo's toast, made real: transient feedback for every meaningful action. */
export function toast(message: string) {
  const el = document.createElement('div')
  el.className = 'toast'
  el.textContent = message
  document.body.appendChild(el)
  requestAnimationFrame(() => el.classList.add('show'))
  setTimeout(() => {
    el.classList.remove('show')
    setTimeout(() => el.remove(), 400)
  }, 2600)
}
