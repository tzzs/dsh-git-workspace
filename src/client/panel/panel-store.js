let open = false
const listeners = new Set()

export function isOpen() {
  return open
}

export function setOpen(value) {
  open = value
  listeners.forEach((l) => l(open))
}

export function toggle() {
  setOpen(!open)
}

export function subscribe(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
