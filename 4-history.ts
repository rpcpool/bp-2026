import { rpc, bench, report } from "./lib.ts";

const addr = process.argv[2] ?? "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4"; // Jupiter v6 program
const n = Number(process.argv[3] ?? 20);
const txCfg = { encoding: "json", maxSupportedTransactionVersion: 1 };

console.log(`Gets the last ${n} transactions of an address: ${n + 1} calls the usual way, then 1 getTransactionsForAddress call.`);
// Before: 1 getSignaturesForAddress + N getTransaction calls, one after another.
const nPlusOne = (gzip: boolean) => async () => {
  const sigs = await rpc("getSignaturesForAddress", [addr, { limit: n }], gzip);
  const sum = { calls: 1, billed: sigs.billed, wire: sigs.wire, ms: sigs.ms };
  for (const { signature } of sigs.json.result) {
    const tx = await rpc("getTransaction", [signature, txCfg], gzip);
    sum.calls++; sum.billed += tx.billed; sum.wire += tx.wire; sum.ms += tx.ms;
  }
  return sum;
};
const plain = await bench("getSignatures + N x getTransaction, no gzip", nPlusOne(false));
const before = await bench("getSignatures + N x getTransaction", nPlusOne(true));

// After: one call returns the same N full transactions.
const after = await bench("getTransactionsForAddress", () =>
  rpc("getTransactionsForAddress", [addr, { ...txCfg, transactionDetails: "full", limit: n }]));

console.log(`\nlast ${n} full transactions for ${addr}${process.argv[2] ? "" : " (Jupiter v6 program)"}`);
report([plain, before, after]);
