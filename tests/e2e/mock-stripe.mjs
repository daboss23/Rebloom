// A local stand-in for Stripe, for browser tests of the booking deposit (DECISIONS D-065). It answers the calls the
// app makes, in Stripe's wire format: form-encoded requests in, JSON out, with a bearer key. Its "Checkout page" has
// two links, Pay and Back, that send the browser to the success or cancel URL exactly as Stripe's hosted page does.
//
//   POST /v1/checkout/sessions        create a session (metadata[appointmentId], success_url, cancel_url)
//   GET  /v1/checkout/sessions/:id    the session, paid once the test pressed Pay
//   POST /v1/refunds                  refund a payment_intent
//   GET  /pay/:id, /pay/:id/complete  the hosted page and its Pay button
//   GET  /__state                     what happened, for the test to check

import http from "node:http";

const PORT = Number(process.env.MOCK_STRIPE_PORT ?? 3298);
const BASE = `http://localhost:${PORT}`;
const sessions = new Map();
const refunds = [];
let n = 0;

const json = (res, status, body) => {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
};

function readBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => resolve(new URLSearchParams(data)));
  });
}

const view = (s) => ({
  id: s.id,
  object: "checkout.session",
  url: `${BASE}/pay/${s.id}`,
  mode: "payment",
  status: s.paid ? "complete" : "open",
  payment_status: s.paid ? "paid" : "unpaid",
  payment_intent: s.paid ? s.pi : null,
  client_reference_id: s.ref,
  customer_email: s.email,
  metadata: { appointmentId: s.appointmentId },
  amount_total: s.amount,
  success_url: s.success,
  cancel_url: s.cancel,
});

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, BASE);
    if (url.pathname.startsWith("/v1/") && !(req.headers.authorization ?? "").startsWith("Bearer sk_test_")) {
      return json(res, 401, { error: { type: "invalid_request_error", message: "Invalid API Key provided" } });
    }
    if (req.method === "POST" && url.pathname === "/v1/checkout/sessions") {
      const body = await readBody(req);
      const id = `cs_test_${++n}`;
      const s = {
        id,
        appointmentId: body.get("metadata[appointmentId]"),
        ref: body.get("client_reference_id"),
        email: body.get("customer_email"),
        amount: Number(body.get("line_items[0][price_data][unit_amount]")),
        success: body.get("success_url"),
        cancel: body.get("cancel_url"),
        paid: false,
        pi: `pi_test_${n}`,
      };
      if (!s.appointmentId || !s.success?.includes("{CHECKOUT_SESSION_ID}") || !s.cancel || !(s.amount > 0)) {
        return json(res, 400, { error: { type: "invalid_request_error", message: "Missing required parameters." } });
      }
      sessions.set(id, s);
      return json(res, 200, view(s));
    }
    const got = url.pathname.match(/^\/v1\/checkout\/sessions\/([\w]+)$/);
    if (req.method === "GET" && got) {
      const s = sessions.get(got[1]);
      return s ? json(res, 200, view(s)) : json(res, 404, { error: { type: "invalid_request_error", message: "No such checkout.session" } });
    }
    if (req.method === "POST" && url.pathname === "/v1/refunds") {
      const body = await readBody(req);
      const refund = { id: `re_test_${refunds.length + 1}`, object: "refund", status: "succeeded", payment_intent: body.get("payment_intent") };
      refunds.push(refund);
      return json(res, 200, refund);
    }
    const page = url.pathname.match(/^\/pay\/([\w]+)(\/complete)?$/);
    if (req.method === "GET" && page) {
      const s = sessions.get(page[1]);
      if (!s) return json(res, 404, {});
      if (page[2]) {
        s.paid = true;
        res.writeHead(303, { location: s.success.replace("{CHECKOUT_SESSION_ID}", s.id) });
        return res.end();
      }
      res.writeHead(200, { "content-type": "text/html" });
      return res.end(
        `<!doctype html><title>Mock Checkout</title><h1>Pay $${s.amount / 100}</h1><a href="/pay/${s.id}/complete">Pay</a> <a href="${s.cancel}">Back</a>`,
      );
    }
    if (url.pathname === "/__state") return json(res, 200, { sessions: [...sessions.values()].map(view), refunds });
    json(res, 404, { error: { type: "invalid_request_error", message: `Unrecognized request URL (${req.method}: ${url.pathname})` } });
  })
  .listen(PORT, () => console.log(`mock Stripe on ${BASE}`));
