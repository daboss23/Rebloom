// A local stand-in for YouCam's API, for browser tests of live mode. It follows the wire format
// recorded from the real v2.1 API (DECISIONS D-041) and is strict where YouCam is strict:
// exact presigned-upload headers, no API key on the upload, all-SD or all-HD actions (never mixed), JSON format.
// HD results carry "hd_" types and wrinkle scores by area (DECISIONS D-046).
//
// Scenarios are chosen by the uploaded photo's average colour:
//   very dark            -> the task fails with error_lighting_dark
//   magenta (#ff00ff)    -> starting the task fails with CreditInsufficiency
//   anything else        -> success, with masks at the uploaded photo's size (and skin type III)
// Every task blips once (HTTP 503) on its first status check, then reports running, then finishes.

import http from "node:http";
import sharp from "sharp";

const PORT = Number(process.env.MOCK_YOUCAM_PORT ?? 3299);
const KEY = process.env.MOCK_YOUCAM_KEY ?? "e2e-key";
const BASE = `http://localhost:${PORT}`;

const SD_ACTIONS = new Set([
  "wrinkle", "droopy_upper_eyelid", "droopy_lower_eyelid", "firmness", "acne", "moisture", "eye_bag", "dark_circle_v2",
  "age_spot", "radiance", "redness", "oiliness", "pore", "texture", "tear_trough", "skin_type",
]);
const SIM_CONCERNS = new Set(["radiance", "acne", "oiliness", "eye_bag", "dark_circle", "spot", "pore", "texture", "wrinkle", "redness"]);
const hdName = (a) => (a === "dark_circle_v2" ? "hd_dark_circle" : `hd_${a}`);
const HD_ACTIONS = new Set([...SD_ACTIONS].map(hdName));
// Distinct scores, so the report's priorities are unambiguous: eye bags, lower eyelid, moisture.
const SCORES = {
  tear_trough: [70, 56.07], eye_bag: [58, 27.28], firmness: [84, 86.63], redness: [97, 98.3], droopy_lower_eyelid: [63, 39.8],
  droopy_upper_eyelid: [81, 80.84], pore: [79, 76.49], oiliness: [66, 44.69], texture: [74, 64], age_spot: [72, 74.18],
  radiance: [77, 72.01], wrinkle: [71, 64.96], dark_circle_v2: [73, 68.3], acne: [99, 100], moisture: [64, 37.05],
};

let units = 1000;
let seq = 0;
const files = new Map();
const tasks = new Map();
const events = [];

const send = (res, status, body) => {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
};
const readBody = (req) =>
  new Promise((resolve) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
  });
const authed = (req) => req.headers.authorization === `Bearer ${KEY}`;
const unauthorized = (res) => send(res, 401, { status: 401, error: "Unauthorized", error_code: "InvalidAccessToken" });

function outputFor(taskId, engine) {
  const mask = (name) => [`${BASE}/masks/${taskId}/${name}.png?X-Amz-Expires=7200&X-Amz-Signature=mock`];
  const name = (type) => (engine === "hd" ? hdName(type) : type);
  return [
    ...Object.entries(SCORES).map(([type, [ui, raw]]) => ({ type: name(type), ui_score: ui, raw_score: raw, mask_urls: mask(type), url: null })),
    ...(engine === "hd"
      ? [
          { type: "hd_wrinkle", area: "forehead", ui_score: 88, raw_score: 84.2, mask_urls: mask("wrinkle_forehead") },
          { type: "hd_wrinkle", area: "crowfeet", ui_score: 62, raw_score: 51.7, mask_urls: mask("wrinkle_crowfeet") },
        ]
      : []),
    ...["whole", "t_zone", "u_zone"].map((region) => ({ type: name("skin_type"), region, skin_type: region === "u_zone" ? "Normal" : "Oily", mask_urls: mask(`skin_type_${region}`) })),
    { type: "all", score: 74.6 },
    { type: "skin_age", score: 34 },
    { type: "resize_image", mask_urls: mask("resize_image") },
  ];
}

async function maskPng(file, name) {
  // A raw YouCam-style mask: coloured marks on transparent, at the uploaded photo's exact size.
  const { width, height } = file;
  const i = Object.keys(SCORES).indexOf(name) + 1;
  const cx = (width * (0.25 + 0.5 * ((i * 37) % 10) / 10)).toFixed(0);
  const cy = (height * (0.3 + 0.4 * ((i * 53) % 10) / 10)).toFixed(0);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><ellipse cx="${cx}" cy="${cy}" rx="${width / 8}" ry="${height / 14}" fill="#d0443c" fill-opacity="0.8"/></svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, BASE);
  const route = `${req.method} ${url.pathname}`;
  events.push({ route, auth: Boolean(req.headers.authorization) });
  try {
    if (route === "GET /__mock/health") return send(res, 200, { ok: true });
    if (route === "GET /__mock/state") {
      return send(res, 200, { units, files: [...files.values()].map((f) => ({ ...f, bytes: undefined })), tasks: [...tasks.values()], events });
    }

    if (route === "POST /s2s/v2.0/file") {
      if (!authed(req)) return unauthorized(res);
      const body = JSON.parse((await readBody(req)).toString() || "{}");
      const f = body.files?.[0];
      if (!f || typeof f.content_type !== "string" || typeof f.file_size !== "number" || typeof f.file_name !== "string") {
        return send(res, 400, { status: 400, error: "files[0] needs content_type, file_name and file_size", error_code: "InvalidParameters" });
      }
      // Real file ids contain "/" and "+".
      const fileId = `mock/${++seq}+file==`;
      files.set(fileId, { fileId, contentType: f.content_type, size: f.file_size, uploaded: false });
      const token = encodeURIComponent(fileId);
      return send(res, 200, {
        status: 200,
        data: {
          files: [
            {
              content_type: f.content_type,
              file_name: f.file_name,
              file_id: fileId,
              requests: [
                {
                  method: "PUT",
                  url: `${BASE}/upload/${token}?X-Amz-Signature=mock`,
                  headers: { "Content-Type": f.content_type, "Content-Length": String(f.file_size) },
                },
              ],
            },
          ],
        },
      });
    }

    if (req.method === "PUT" && url.pathname.startsWith("/upload/")) {
      const file = files.get(decodeURIComponent(url.pathname.slice("/upload/".length)));
      const bytes = await readBody(req);
      // S3 rejects a presigned request that also carries another credential.
      if (!file || req.headers.authorization) return send(res, 400, { error: "presigned upload must not carry an Authorization header" });
      if (req.headers["content-type"] !== file.contentType) return send(res, 403, { error: "SignatureDoesNotMatch: Content-Type" });
      if (Number(req.headers["content-length"]) !== file.size || bytes.length !== file.size) {
        return send(res, 403, { error: "SignatureDoesNotMatch: Content-Length" });
      }
      const meta = await sharp(bytes).metadata();
      const stats = await sharp(bytes).stats();
      const [r, g, b] = stats.channels.map((c) => c.mean);
      Object.assign(file, { uploaded: true, bytes, width: meta.width, height: meta.height, format: meta.format, mean: [r, g, b] });
      res.writeHead(200);
      return res.end();
    }

    if (route === "POST /s2s/v2.1/task/skin-analysis") {
      if (!authed(req)) return unauthorized(res);
      const body = JSON.parse((await readBody(req)).toString() || "{}");
      const file = files.get(body.src_file_id);
      const actions = body.dst_actions;
      const bad = (error) => send(res, 400, { status: 400, error, error_code: "InvalidParameters" });
      if (!file?.uploaded) return bad("src_file_id was never uploaded");
      if (!Array.isArray(actions) || actions.length === 0 || actions.length > 16) return bad("dst_actions must list 1 to 16 actions");
      const engine = actions.every((a) => SD_ACTIONS.has(a)) ? "sd" : actions.every((a) => HD_ACTIONS.has(a)) ? "hd" : null;
      if (!engine) return bad("cannot mix HD and SD dst_actions, or unknown action");
      if (body.format !== "json") return bad("this stand-in only serves format json");
      if (body.miniserver_args?.enable_mask_overlay !== false) return bad("expected raw masks (enable_mask_overlay false)");
      const [r, g, b] = file.mean;
      if (r > 200 && g < 60 && b > 200) return send(res, 400, { status: 400, error: "Not enough credit", error_code: "CreditInsufficiency" });
      const taskId = `task_${++seq}`;
      const outcome = (r + g + b) / 3 < 40 ? "error_lighting_dark" : "success";
      tasks.set(taskId, { taskId, fileId: file.fileId, actions, engine, outcome, polls: 0, deleted: false });
      return send(res, 200, { status: 200, data: { task_id: taskId } });
    }

    if (req.method === "GET" && url.pathname.startsWith("/s2s/v2.1/task/skin-analysis/")) {
      if (!authed(req)) return unauthorized(res);
      const task = tasks.get(url.pathname.split("/").pop());
      if (!task || task.deleted) return send(res, 400, { status: 400, error: "Invalid task ID" });
      task.polls++;
      if (task.polls === 1) return send(res, 503, { status: 503, error: "Service Unavailable" });
      if (task.polls === 2) return send(res, 200, { status: 200, data: { task_status: "running", results: null, error: null } });
      if (task.outcome !== "success") {
        return send(res, 200, { status: 200, data: { task_status: "error", results: null, error: task.outcome, error_message: "Lighting too dark" } });
      }
      if (!task.charged) {
        const n = task.actions.length;
        task.cost = task.engine === "hd" ? (n <= 4 ? 12 : n <= 8 ? 16 : n <= 12 ? 20 : 22) : n <= 4 ? 9 : n <= 8 ? 12 : n <= 12 ? 14 : 16;
        units -= task.cost;
        task.charged = true;
      }
      return send(res, 200, { status: 200, data: { task_status: "success", error: null, results: { output: outputFor(task.taskId, task.engine) } } });
    }

    if (req.method === "GET" && url.pathname.startsWith("/masks/")) {
      const [, , taskId, name] = url.pathname.split("/");
      const task = tasks.get(taskId);
      if (!task || task.deleted) return send(res, 404, { error: "NoSuchKey" });
      const png = await maskPng(files.get(task.fileId), name.replace(/\.png$/, ""));
      res.writeHead(200, { "content-type": "image/png" });
      return res.end(png);
    }

    // Skin simulation (DECISIONS D-047): a 0.0 to 1.0 intensity per concern, at least one above 0.
    if (route === "POST /s2s/v2.0/task/skin-simulation") {
      if (!authed(req)) return unauthorized(res);
      const body = JSON.parse((await readBody(req)).toString() || "{}");
      const file = files.get(body.src_file_id);
      const bad = (error) => send(res, 400, { status: 400, error, error_code: "InvalidParameters" });
      if (!file?.uploaded) return bad("src_file_id was never uploaded");
      const params = Object.entries(body).filter(([k]) => k !== "src_file_id");
      if (params.some(([k, v]) => !SIM_CONCERNS.has(k) || typeof v !== "number" || v < 0 || v > 1)) return bad("unknown concern or intensity");
      if (!params.some(([, v]) => v > 0)) return bad("at least one intensity must be above 0");
      const taskId = `sim_${++seq}`;
      tasks.set(taskId, { taskId, kind: "simulation", fileId: file.fileId, params: Object.fromEntries(params), polls: 0, deleted: false });
      return send(res, 200, { status: 200, data: { task_id: taskId } });
    }

    if (req.method === "GET" && url.pathname.startsWith("/s2s/v2.0/task/skin-simulation/")) {
      if (!authed(req)) return unauthorized(res);
      const task = tasks.get(url.pathname.split("/").pop());
      if (!task || task.deleted) return send(res, 400, { status: 400, error: "Invalid task ID" });
      if (++task.polls === 1) return send(res, 200, { status: 200, data: { task_status: "running", results: null, error: null } });
      if (!task.charged) {
        task.cost = Object.keys(task.params).length <= 4 ? 4 : 6;
        units -= task.cost;
        task.charged = true;
      }
      return send(res, 200, { status: 200, data: { task_status: "success", error: null, results: { url: `${BASE}/sim/${task.taskId}.jpg?X-Amz-Signature=mock` } } });
    }

    if (req.method === "GET" && url.pathname.startsWith("/sim/")) {
      const task = tasks.get(url.pathname.slice("/sim/".length).replace(/\.jpg$/, ""));
      if (!task || task.deleted) return send(res, 404, { error: "NoSuchKey" });
      // A softened copy of the upload stands in for the simulated face.
      const jpg = await sharp(files.get(task.fileId).bytes).modulate({ brightness: 1.06 }).blur(1.2).jpeg().toBuffer();
      res.writeHead(200, { "content-type": "image/jpeg" });
      return res.end(jpg);
    }

    // Fitzpatrick skin type (DECISIONS D-094), as its OpenAPI description sets out: a source file and version "1.0";
    // the type arrives in results.fitzpatrick_scale. Running on the first check, then type III, 10 units on success.
    // A very dark photo fails, as YouCam does with error_insufficient_lighting, and costs nothing.
    if (route === "POST /s2s/v2.0/task/fitzpatrick-scale-analyzer") {
      if (!authed(req)) return unauthorized(res);
      const body = JSON.parse((await readBody(req)).toString() || "{}");
      const file = files.get(body.src_file_id);
      const bad = (error) => send(res, 400, { status: 400, error, error_code: "InvalidParameters" });
      if (!file?.uploaded) return bad("src_file_id was never uploaded");
      if (body.version !== "1.0") return bad("version must be 1.0");
      const taskId = `fz_${++seq}`;
      const [r, g, b] = file.mean;
      const outcome = (r + g + b) / 3 < 40 ? "error_insufficient_lighting" : "success";
      tasks.set(taskId, { taskId, kind: "fitzpatrick", fileId: file.fileId, outcome, polls: 0, deleted: false });
      return send(res, 200, { status: 200, data: { task_id: taskId } });
    }

    if (req.method === "GET" && url.pathname.startsWith("/s2s/v2.0/task/fitzpatrick-scale-analyzer/")) {
      if (!authed(req)) return unauthorized(res);
      const task = tasks.get(url.pathname.split("/").pop());
      if (!task || task.deleted) return send(res, 400, { status: 400, error: "Invalid task ID" });
      if (++task.polls === 1) return send(res, 200, { status: 200, data: { task_status: "running", error: null } });
      if (task.outcome !== "success") {
        return send(res, 200, { status: 200, data: { task_status: "error", error: task.outcome, error_message: "The lighting is too dim" } });
      }
      if (!task.charged) {
        task.cost = 10;
        units -= task.cost;
        task.charged = true;
      }
      return send(res, 200, { status: 200, data: { task_status: "success", error: null, results: { fitzpatrick_scale: "III", timed: 0.8 } } });
    }

    if (route === "POST /s2s/v2.0/task/delete") {
      if (!authed(req)) return unauthorized(res);
      const body = JSON.parse((await readBody(req)).toString() || "{}");
      const task = tasks.get(body.task_id);
      if (!task) return send(res, 400, { status: 400, error: "Invalid task ID" });
      task.deleted = true;
      return send(res, 200, { status: 200 });
    }

    if (route === "GET /s2s/v1.0/client/credit") {
      if (!authed(req)) return unauthorized(res);
      return send(res, 200, { status: 200, results: [{ id: "mock", type: "ApiSubsToken", amount: units, expiry: Date.now() + 86_400_000 }] });
    }

    send(res, 404, { error: `no route for ${route}` });
  } catch (error) {
    send(res, 500, { error: String(error) });
  }
});

server.listen(PORT, () => console.log(`Mock YouCam listening on ${BASE}`));
