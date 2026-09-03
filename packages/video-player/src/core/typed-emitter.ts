export type TypedEventListener<Event> = (event: Event) => void;

export class TypedEventEmitter<Events extends object> {
  readonly #listeners = new Map<
    keyof Events,
    Set<TypedEventListener<Events[keyof Events]>>
  >();

  on<Type extends keyof Events>(
    type: Type,
    listener: TypedEventListener<Events[Type]>,
  ): () => void {
    let listeners = this.#listeners.get(type);

    if (!listeners) {
      listeners = new Set<TypedEventListener<Events[keyof Events]>>();
      this.#listeners.set(type, listeners);
    }

    const normalizedListener = listener as TypedEventListener<
      Events[keyof Events]
    >;
    listeners.add(normalizedListener);

    return () => {
      this.off(type, listener);
    };
  }

  once<Type extends keyof Events>(
    type: Type,
    listener: TypedEventListener<Events[Type]>,
  ): () => void {
    const unsubscribe = this.on(type, (event) => {
      unsubscribe();
      listener(event);
    });

    return unsubscribe;
  }

  off<Type extends keyof Events>(
    type: Type,
    listener: TypedEventListener<Events[Type]>,
  ): void {
    const listeners = this.#listeners.get(type);
    if (!listeners) {
      return;
    }

    listeners.delete(
      listener as TypedEventListener<Events[keyof Events]>,
    );

    if (listeners.size === 0) {
      this.#listeners.delete(type);
    }
  }

  emit<Type extends keyof Events>(type: Type, event: Events[Type]): void {
    const listeners = this.#listeners.get(type);
    if (!listeners) {
      return;
    }

    for (const listener of [...listeners]) {
      listener(event);
    }
  }

  clear(type?: keyof Events): void {
    if (type === undefined) {
      this.#listeners.clear();
      return;
    }

    this.#listeners.delete(type);
  }

  listenerCount(type: keyof Events): number {
    return this.#listeners.get(type)?.size ?? 0;
  }
}
