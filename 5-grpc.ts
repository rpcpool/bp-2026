import Client, { CommitmentLevel } from "@triton-one/yellowstone-grpc";
import http2 from "node:http2";
import type { AddressInfo } from "node:net";
import { SECS, PER_DAY, cost, usd, pct } from "./lib.ts";

const program = process.argv[2] ?? "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4"; // Jupiter v6
const target = process.env.GRPC_URL!;

// Local HTTP/2 proxy to Triton. rx counts gRPC body bytes as sent, so after server compression.
let rx = 0;
const sessions = new Set<http2.ClientHttp2Session>();
const proxy = http2.createServer().listen(0);
proxy.on("stream", (down, headers) => {
  const session = http2.connect(target);
  sessions.add(session);
  const up = session.request({ ...headers, ":authority": new URL(target).host });
  down.pipe(up);
  up.on("response", (h) => down.respond(h, { waitForTrailers: true }));
  up.on("data", (d) => { rx += d.length; down.write(d); });
  up.on("trailers", (t) => down.once("wantTrailers", () => down.sendTrailers(t)));
  up.on("end", () => down.end());
  up.on("error", () => down.destroy()); down.on("error", () => up.destroy());
});
const local = `http://127.0.0.1:${(proxy.address() as AddressInfo).port}`;

async function run(name: string, compression: number | undefined, accountInclude: string[]) {
  const opts = compression === undefined ? {} : { grpcDefaultCompressionAlgorithm: compression };
  const client = new Client(local, process.env.GRPC_TOKEN, opts);
  await client.connect();
  const stream = await client.subscribe({
    transactions: { t: { vote: false, failed: false, accountInclude, accountExclude: [], accountRequired: [] } },
    accounts: {}, slots: {}, transactionsStatus: {}, blocks: {}, blocksMeta: {}, entry: {}, blockFooter: {},
    accountsDataSlice: [], commitment: CommitmentLevel.CONFIRMED,
  });
  let msgs = 0;
  stream.on("data", () => msgs++);
  stream.on("error", () => {});
  const start = rx;
  await new Promise((r) => setTimeout(r, SECS * 1000));
  const bytes = rx - start;
  stream.destroy();
  for (const s of sessions) s.destroy(); // stop this case's upstream so it can't leak into the next one
  sessions.clear();
  return { case: name, msgs, bytes };
}

console.log("Streams transactions over Yellowstone gRPC: no compression, then zstd, then zstd filtered to one program.");
const rows = [
  await run("all txs, no compression", undefined, []),
  await run("all txs, zstd", 1, []),
  await run("one program, zstd", 1, [program]),
];
const base = cost(0, rows[0].bytes);
console.log(`\n${SECS}s per case. Day and month are scaled from that. Bill = bytes after compression only.`);
console.table(rows.map((r) => ({
  case: r.case, msgs: r.msgs, "billed MB": +(r.bytes / 1e6).toFixed(2), "bytes/msg": Math.round(r.bytes / r.msgs),
  "$/day": usd(cost(0, r.bytes) * PER_DAY), "$/month": usd(cost(0, r.bytes) * PER_DAY * 30), "cost saved": pct(cost(0, r.bytes), base),
})));
process.exit(0);
