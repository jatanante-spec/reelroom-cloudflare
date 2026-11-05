// Cloudflare Pages Function — catches every /api/* request.
// Static files never reach this function (see public/_routes.json), so page
// and asset traffic stays on Cloudflare's free, unlimited static allowance.
import { handler } from "../../lib/api-core.mjs";

export async function onRequest(context) {
  return handler(context.request, context.env);
}
