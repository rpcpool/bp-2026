import http2 from "node:http2";
import https from "node:https";
import type { AddressInfo } from "node:net";
import { gunzipSync } from "node:zlib";

export const SECS = 10;
export const PER_DAY = 86400 / SECS; // 10s windows in a day
// Triton pricing: $25 per million calls, $0.08 per GB. Streaming pays bandwidth only (calls = 0).
export const cost = (calls: number, bytes: number) => (calls * 25) / 1e6 + (bytes * 0.08) / 1e9;
export const usd = (n: number) => `$${n.toFixed(2)}`;
export const pct = (n: number, base: number) => `${((1 - n / base) * 100).toFixed(1)}%`;
const mb = (n: number) => +(n / 1e6).toFixed(2);

type Run = { json?: any; calls: number; billed: number; wire: number; ms: number };

// billed = uncompressed body (what Triton bills for JSON-RPC); wire = bytes actually received.
export function rpc(method: string, params: unknown[], gzip = true): Promise<Run> {
  const t = performance.now();
  return new Promise((ok) => {
    const headers = { "content-type": "application/json", "accept-encoding": gzip ? "gzip" : "identity" };
    https.request(process.env.RPC_URL!, { method: "POST", headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const raw = Buffer.concat(chunks);
        const body = res.headers["content-encoding"] === "gzip" ? gunzipSync(raw) : raw;
        ok({ json: JSON.parse(body.toString()), calls: 1, billed: body.length, wire: raw.length, ms: performance.now() - t });
      });
    }).end(JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }));
  });
}

// Runs `once` perSec times a second for SECS seconds, so every case does the same work.
export async function bench(name: string, once: () => Promise<Run>, perSec = 1) {
  const row = { case: name, json: undefined as any, runs: 0, calls: 0, billed: 0, wire: 0, ms: 0 };
  for (; row.runs < SECS * perSec; row.runs++) {
    const r = await once();
    row.json = r.json; row.calls += r.calls; row.billed += r.billed; row.wire += r.wire; row.ms += r.ms;
    await new Promise((ok) => setTimeout(ok, Math.max(0, 1000 / perSec - r.ms)));
  }
  return row;
}

// Local HTTP/2 proxy to `target`. streams counts gRPC calls opened; rx counts response bytes after compression.
export function countingProxy(target: string) {
  const sessions = new Set<http2.ClientHttp2Session>();
  const server = http2.createServer().listen(0);
  const proxy = {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    rx: 0,
    streams: 0,
    closeAll() { for (const s of sessions) s.destroy(); sessions.clear(); },
  };
  server.on("stream", (down, headers) => {
    proxy.streams++;
    const session = http2.connect(target);
    sessions.add(session);
    const up = session.request({ ...headers, ":authority": new URL(target).host });
    down.pipe(up);
    up.on("response", (h) => down.respond(h, { waitForTrailers: true }));
    up.on("data", (d) => { proxy.rx += d.length; down.write(d); });
    up.on("trailers", (t) => down.once("wantTrailers", () => down.sendTrailers(t)));
    up.on("end", () => down.end());
    up.on("error", () => down.destroy()); down.on("error", () => up.destroy());
  });
  return proxy;
}

export function report(rows: Awaited<ReturnType<typeof bench>>[]) {
  const rate = rows[0].runs / SECS;
  console.log(`\nEach case runs ${rate === 1 ? "once" : `${rate} times`} per second for ${SECS}s. Day and month are scaled from that. Bill = calls + uncompressed bytes.`);
  console.log("\nFirst row is the baseline without gzip. All other rows use gzip.");
  const base = cost(rows[0].calls, rows[0].billed);
  console.table(rows.map((r) => {
    const c = cost(r.calls, r.billed);
    return {
      case: r.case, calls: r.calls, "billed MB": mb(r.billed), "wire MB": mb(r.wire), "ms/run": r.ms / r.runs < 1 ? +(r.ms / r.runs).toFixed(3) : Math.round(r.ms / r.runs),
      "$/day": usd(c * PER_DAY), "$/month": usd(c * PER_DAY * 30), "cost saved": pct(c, base),
    };
  }));
}
