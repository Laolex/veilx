import type { ZamaSDKEvent } from "@zama-fhe/react-sdk";

// Minimal pub/sub bridge for the Zama SDK's lifecycle event stream.
//
// The SDK only surfaces events through the single `onEvent` callback on
// <ZamaProvider>. That callback is global and set once, but components need to
// react to events for *their* in-flight operation (e.g. WrapModal wants the
// encrypt:start/encrypt:end window that useUnshield's callbacks don't expose).
// So we fan the one provider-level callback out to any number of subscribers.

type Listener = (event: ZamaSDKEvent) => void;

const listeners = new Set<Listener>();

/** Wire this as <ZamaProvider onEvent={publishFheEvent}>. */
export function publishFheEvent(event: ZamaSDKEvent): void {
  for (const l of listeners) {
    try {
      l(event);
    } catch (e) {
      // A misbehaving subscriber must never break the SDK's event emission.
      console.error("[VeilX] fhe event listener threw:", e);
    }
  }
}

/** Subscribe to SDK lifecycle events; returns an unsubscribe fn. */
export function subscribeFheEvent(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
