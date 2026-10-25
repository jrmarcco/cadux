type Listener<T> = (payload: T) => void

/** 极简类型化事件总线, 用于跨层单向通知 ( 如登录态失效 ) */
export function createEventBus<T>() {
  const listeners = new Set<Listener<T>>()

  return {
    on(listener: Listener<T>): () => void {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    emit(payload: T): void {
      for (const listener of [...listeners]) listener(payload)
    }
  }
}
