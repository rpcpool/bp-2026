import { rpc, bench, report } from "./lib.ts";

const slot = Number(process.argv[2] ?? (await rpc("getSlot", [{ commitment: "finalized" }])).json.result - 100);
const base = { encoding: "json", maxSupportedTransactionVersion: 1 };

console.log("Fetches one block in full, then again with only signatures and no rewards.");
const plain = await bench("full block, no gzip", () => rpc("getBlock", [slot, { ...base, transactionDetails: "full", rewards: true }], false));
const full = await bench("full block", () => rpc("getBlock", [slot, { ...base, transactionDetails: "full", rewards: true }]));
const trim = await bench("signatures, no rewards", () => rpc("getBlock", [slot, { ...base, transactionDetails: "signatures", rewards: false }]));

console.log(`\nslot ${slot}, ${trim.json.result.signatures.length} transactions`);
report([plain, full, trim]);
