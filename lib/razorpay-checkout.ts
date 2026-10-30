'use client';

let checkoutScriptPromise: Promise<void> | null = null;
let paymentAvailabilityPromise: Promise<{ available: boolean; message: string | null }> | null = null;

export function getPublicPaymentAvailability() {
  if (!paymentAvailabilityPromise) {
    paymentAvailabilityPromise = fetch('/api/payments/config', { cache: 'no-store' })
      .then(async (response) => {
        const config = await response.json().catch(() => ({}));
        const available = response.ok && config.enabled === true;
        return {
          available,
          message: available
            ? null
            : typeof config.configurationError === 'string'
              ? config.configurationError
              : 'Online payments are currently unavailable. Please try again later.',
        };
      })
      .catch(() => ({
        available: false,
        message: 'Payment configuration could not be verified. Please try again later.',
      }));
  }
  return paymentAvailabilityPromise;
}

export function loadRazorpayCheckout(): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Razorpay Checkout is only available in a browser.'));
  }
  if (window.Razorpay) return Promise.resolve();
  if (checkoutScriptPromise) return checkoutScriptPromise;

  checkoutScriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.getElementById('razorpay-checkout-sdk') as HTMLScriptElement | null;
    const script = existing ?? document.createElement('script');
    const cleanup = () => {
      script.removeEventListener('load', onLoad);
      script.removeEventListener('error', onError);
    };
    const onLoad = () => {
      cleanup();
      if (window.Razorpay) resolve();
      else reject(new Error('Razorpay Checkout did not initialize correctly.'));
    };
    const onError = () => {
      cleanup();
      script.remove();
      checkoutScriptPromise = null;
      reject(new Error('The Razorpay checkout script could not be loaded.'));
    };

    script.addEventListener('load', onLoad, { once: true });
    script.addEventListener('error', onError, { once: true });
    if (!existing) {
      script.id = 'razorpay-checkout-sdk';
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.async = true;
      document.body.appendChild(script);
    }
  }).catch((error: unknown) => {
    checkoutScriptPromise = null;
    throw error;
  });

  return checkoutScriptPromise;
}
