import { rpc, bench, report } from "./lib.ts";

// All SPL token accounts of one mint. The default mint has about 5.9k token accounts.
const mint = process.argv[2] ?? "9Qh5igeYVb9ZC6s6BfNaffycTiNTqv9KhL432LdqyT4Y";
const TOKEN = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const filters = [{ dataSize: 165 }, { memcmp: { offset: 0, bytes: mint } }];
const amount = { offset: 64, length: 8 }; // u64 token amount inside the 165-byte account

const cases: Record<string, object> = {
  "base64": { encoding: "base64", filters },
  "base64+zstd": { encoding: "base64+zstd", filters },
  "base64 + dataSlice amount": { encoding: "base64", filters, dataSlice: amount },
  "base64+zstd + dataSlice amount": { encoding: "base64+zstd", filters, dataSlice: amount },
};

console.log("Fetches every token account of one mint with getProgramAccounts, with and without zstd and a slice of only the amount field.");
const rows = [await bench("base64, no gzip", () => rpc("getProgramAccounts", [TOKEN, cases.base64], false))];
for (const [name, cfg] of Object.entries(cases)) rows.push(await bench(name, () => rpc("getProgramAccounts", [TOKEN, cfg])));
console.log(`\ngetProgramAccounts on the SPL Token program, filtered to mint ${mint}`);
console.log(`\ntoken accounts returned: ${rows[0].json.result.length}`);
report(rows);
