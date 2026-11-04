// A stand-in for Razorpay's checkout.js, served in its place by the tests
// (see test.ts). The web app's own checkout code runs unchanged: it builds
// `new Razorpay(options)` and calls `open()`, exactly as with the real one.
//
// The window it opens has two buttons:
// - "Pay": the fake gateway (on the test server) takes the payment and
//   signs it with the gateway's secret, and the app's success handler is
//   called with that signed payment, as Razorpay calls it.
// - "Cancel": the learner closes the window; the app's ondismiss is called.
//
// Razorpay's real window lives in a frame from api.razorpay.com, which tells
// the page it has loaded. The tests serve that frame too, so the app's
// "the payment window couldn't open" watch sees a normal opening.
window.Razorpay = class FakeRazorpay {
  constructor(options) {
    this.options = options;
    this.container = null;
  }

  on() {}

  close() {
    if (this.container) this.container.style.display = "none";
  }

  open() {
    const options = this.options;
    const container = document.createElement("div");
    this.container = container;
    container.className = "razorpay-container";
    container.setAttribute("role", "dialog");
    container.setAttribute("aria-label", "Payment window");
    container.style.cssText =
      "position:fixed;inset:0;z-index:2147483647;display:flex;" +
      "align-items:center;justify-content:center;background:rgba(0,0,0,.6)";

    const frame = document.createElement("iframe");
    frame.src = "https://api.razorpay.com/journey-test-window";
    frame.style.display = "none";

    const panel = document.createElement("div");
    panel.style.cssText =
      "background:#fff;color:#000;padding:24px;border-radius:8px;" +
      "font:16px sans-serif;display:grid;gap:12px";
    const amount = document.createElement("p");
    amount.textContent = `Amount: ₹${(options.amount / 100).toLocaleString("en-IN")}`;
    const pay = document.createElement("button");
    pay.textContent = "Pay";
    const cancel = document.createElement("button");
    cancel.textContent = "Cancel";
    panel.append(amount, pay, cancel);
    container.append(frame, panel);
    document.body.append(container);

    pay.addEventListener("click", async () => {
      // Exposed by the test (test.ts): asks the fake gateway to take it.
      const payment = await window.journeyGatewayPay(options.order_id);
      options.handler({
        razorpay_order_id: options.order_id,
        razorpay_payment_id: payment.gatewayPaymentId,
        razorpay_signature: payment.gatewaySignature,
      });
      container.style.display = "none";
    });
    cancel.addEventListener("click", () => {
      container.style.display = "none";
      options.modal?.ondismiss?.();
    });
  }
};
