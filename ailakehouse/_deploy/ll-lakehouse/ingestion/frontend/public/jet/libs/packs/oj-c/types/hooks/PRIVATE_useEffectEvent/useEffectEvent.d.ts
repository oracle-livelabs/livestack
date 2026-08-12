/**
 * A polyfill for react's experimental_useEffectEvent
 * See https://react.dev/reference/react/experimental_useEffectEvent
 *
 * @param callback The event function that needs to be wrapped
 * @returns A non-reactive function that always “sees” the latest values of your props and state.
 */
export declare function useEffectEvent<T extends Function>(callback: T): T;
