export declare const inject: string[]

export declare function apply(ctx: {
  effect(fn: () => (() => void) | void, label?: string): (() => void) | void
  slots: {
    inject(
      name: string,
      register: () => () => void,
    ): () => void
    register(
      def: { name: string; key: string },
      component: unknown,
    ): () => void
  }
}): void
