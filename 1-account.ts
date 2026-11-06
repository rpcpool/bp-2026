import { rpc, bench, report } from "./lib.ts";

// Default: Light Protocol v1 address tree, a ~2.2 MB account that updates every few seconds.
const addr = process.argv[2] ?? "amt1Ayt45jfbdw5YSo7iz6WZxUmnZsQTYXy82hVwyC2";
const cases: Record<string, object> = {
  "base64": { encoding: "base64" },
  "base64+zstd": { encoding: "base64+zstd" },
  "base64+zstd + dataSlice 1KB": { encoding: "base64+zstd", dataSlice: { offset: 0, length: 1024 } },
};

console.log("Reads one large account 3 ways (base64, base64+zstd, zstd + 1 KB slice) to show how encoding and slicing cut the bill.");
const rows = [await bench("base64, no gzip", () => rpc("getAccountInfo", [addr, cases.base64], false))];
for (const [name, cfg] of Object.entries(cases)) rows.push(await bench(name, () => rpc("getAccountInfo", [addr, cfg])));
const size = (rows[0].json.result.value.space / 1e6).toFixed(2);
console.log(`\ngetAccountInfo on ${addr}${process.argv[2] ? "" : " (Light Protocol v1 address tree)"}, ${size} MB of data`);
report(rows);
