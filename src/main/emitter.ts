type Listener<T> = (value: T) => void;

export interface Emitter<T> {
  on(cb: Listener<T>): () => void;
  emit(value: T): void;
}

export function createEmitter<T>(): Emitter<T> {
  const listeners = new Set<Listener<T>>();
  return {
    on(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    emit(value) {
      for (const l of listeners) l(value);
    },
  };
}
