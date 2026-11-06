import https from "node:https";
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

// Runs `once` one time per second for SECS seconds, so every case does the same work.
export async function bench(name: string, once: () => Promise<Run>) {
  const row = { case: name, json: undefined as any, calls: 0, billed: 0, wire: 0, ms: 0 };
  for (let i = 0; i < SECS; i++) {
    const r = await once();
    row.json = r.json; row.calls += r.calls; row.billed += r.billed; row.wire += r.wire; row.ms += r.ms;
    await new Promise((ok) => setTimeout(ok, Math.max(0, 1000 - r.ms)));
  }
  return row;
}

export function report(rows: Awaited<ReturnType<typeof bench>>[]) {
  console.log(`\nEach case runs once per second for ${SECS}s. Day and month are scaled from that. Bill = calls + uncompressed bytes.`);
  console.log("\nFirst row is the baseline without gzip. All other rows use gzip.");
  const base = cost(rows[0].calls, rows[0].billed);
  console.table(rows.map((r) => {
    const c = cost(r.calls, r.billed);
    return {
      case: r.case, calls: r.calls, "billed MB": mb(r.billed), "wire MB": mb(r.wire), "ms/run": Math.round(r.ms / SECS),
      "$/day": usd(c * PER_DAY), "$/month": usd(c * PER_DAY * 30), "cost saved": pct(c, base),
    };
  }));
}
