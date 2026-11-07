import { AccountSyncTransports, Connection, PublicKey } from "@triton-one/triton-sdk";
import { rpc, bench, report, countingProxy } from "./lib.ts";

const RATE = 10; // reads per second
const addrs = accounts();
const keys = addrs.map((a) => new PublicKey(a));
const cfg = { encoding: "base64", commitment: "confirmed" };

console.log(`Reads the same ${addrs.length} accounts ${RATE} times a second: by polling RPC, then from Account Sync's local copy.`);
const rows = [
  await bench("polling, no gzip", () => rpc("getMultipleAccounts", [addrs, cfg], false), RATE),
  await bench("polling", () => rpc("getMultipleAccounts", [addrs, cfg]), RATE),
  await bench("polling, base64+zstd", () => rpc("getMultipleAccounts", [addrs, { ...cfg, encoding: "base64+zstd" }]), RATE),
];

// Account Sync bill: HTTP calls (counted through fetch) + gRPC calls and stream bytes (counted by the proxy).
const url = new URL(process.env.RPC_URL!);
const proxy = countingProxy(url.origin);
const sdk = { calls: 0, bytes: 0 };
const realFetch = globalThis.fetch;
globalThis.fetch = async (...args: Parameters<typeof fetch>) => {
  const res = await realFetch(...args);
  sdk.calls++; sdk.bytes += (await res.clone().arrayBuffer()).byteLength;
  return res;
};
const conn = new Connection(process.env.RPC_URL!, {
  accountSync: { transport: AccountSyncTransports.GRPC, subscriptionEndpoint: proxy.url + url.pathname, commitment: "confirmed", initialAccounts: keys },
});
await conn.getMultipleAccountsInfo(keys, "confirmed"); // waits for the first load
console.log(`\nAccount Sync startup, paid once and left out of the table: ${sdk.calls + proxy.streams} calls (${sdk.calls} HTTP, ${proxy.streams} gRPC), ${((sdk.bytes + proxy.rx) / 1e6).toFixed(2)} MB`);

const start = { calls: sdk.calls, bytes: sdk.bytes, rx: proxy.rx, streams: proxy.streams };
const sync = await bench("Account Sync", async () => {
  const t = performance.now();
  await conn.getMultipleAccountsInfo(keys, "confirmed");
  return { calls: 0, billed: 0, wire: 0, ms: performance.now() - t };
}, RATE);
sync.calls = sdk.calls - start.calls + proxy.streams - start.streams;
sync.billed = sdk.bytes - start.bytes + proxy.rx - start.rx;
sync.wire = sync.billed;
rows.push(sync);

report(rows);
await conn.close();
process.exit(0);

function accounts() {
  return `
C2aFPdENg4A2HQsmrd5rTw5TaYBX5Ku887cWjbFKtZpw Hq2wp8uJ9jCPsYgNHex8RtqdvMPfVGoYwjvF1ATiwn2Y 5YxQFdt3Tr9zJLvkFccqXVUwhdTWJQc1fFg2YPbxvxeD HjQjngTDqoHE6aaGhUqfz9aQ7WZcBRjy5xB8PScLSr8i
94qWNrtmfn42h3ZjUZwWvK1MEo9uVmmrBPd2hpNjYDjb FWsW1xNtWscwNmKv6wVsU1iTzRN6wmmk3MjxRP5tT7hz 5cjcW9wExnJJiqgLjq7DEG75Pm6JBgE1hNv4B2vHXUW6 FnzKY6x7entQ1eR3D225dQyT7ybfka4PskBMQhb8L3CC
BmCXK8QFCHgjiqGm7peAtBbZpFPJNsp5fYP5rSRazMS8 CQfwrncb67iboVdGB62naWUFUWutuRfizZ3jncGRNTiR DaXhQ3pfN3J5dQnXxVU8YqW9bwA3RUVxXvq2iBjTDVt4 DWpvfqzGWuVy9jVSKSShdM2733nrEsnnhsUStYbkj6Nn
G5UZAVbAf46s7cKWoyKu8kYTip9DGTpbLZ2qa9Aq69dP CA7v8gHfbquYXyDnDx6QxWW8hmL1H7X6Y2RYDrGLnuck sp1nLqqjVZ1kTusFjJmHp1xHDpH6M4F7KXCr1iJ3xpX FVnv5qH7dsrBzEDwJ8dN2m9PFtKTBAQFtqWF3M9LpwMg
6e7V9eegCHw997T72MxgwwJipZ6GJyZF8NvjkzT1rvpN BprsHVMgdCPP1s8KkwUCx9tkszrHmAEMdJFkynP3NW7N GnyzhweyVAeGhdD9nLrzCUr6T4ZBvnbJoyBEBgN6i5da BT3dV7FbvtHjpahZT9KDN7VSxapJsCAWNMLyMLNTTvs1
FGptqdxjahafaCzpZ1T6EDtCzYMv7Dyn5MgBLyB3VUFW D1ZN9Wj1fRSUQfCjhvnu1hqDMT7hzjzBBpi12nVniYD6 GYH1Gae1wJytMSvMvw8JVcv7nuAbxi8i9erNVbERnzXd H8UKNvUeaqpVT7DZ8TXJVreSQEXDjTA7fEv8hjD3FzHm
8wVKFtBXwUmHTh6ciASMQqTDuJnRRHku4iKMD3zV26Mu 62qc2CNXwrYqQScmEdiZFFAnJR262PxWEuNQtxfafNgV LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo 7GFUN3bWzJMKMRZ34JLsvcqdssDbXnp589SiE33KVwcC
8FnX3xo2yYw3EUE6w3nQA4GfXGS9wpK6oj3veJpbFzLo CebN5WGQ4jvEPvsVU4EoHEpgzq1VV7AbicfhtW4xC9iM CASRL2zkwDnppxEFQ4LgdwgR9pdz5Q8R8nEMKVZ9QoLp FTp1BybZ51NiZKbnZH6MsrV3tUZNauhpQMbBcqYUEr5f
A7hAgCzFw14fejgCp387JUJRMNyz4j89JKnhtKU8piqW xx3geLdL3ZPHpTwHYY61G4TFoAvf1rrGvEt6u9CiSbS HDnrxHXxazavCxsMD8ewE7KLSY2HMVu8pfyUWyKLRTk9 3djF3wyL17qySyQL4PpEYGiQ5WkZpWNT2a3CzqWTjTZD
Cuwi5ExbyqSUdt3dfAjG7wq4eNPWQXUfTWsA2GgNMSQ5 ATRsNGv2nDw7hSMfkUTBoVUDsFDwN7po7KbecyiGWNB4 2Y7HATmn9aJBcxCskE5V2U2epmjvkZmB51zTJBbhj4cU GAFuhgcd328SkkBYHpfadzmef9hTGAFRCi9QoCnsZQug
So11111111111111111111111111111111111111112 J4cGfY61ZMaBD2niXcfaUD7KsNZiDnjMnJsPJficos8J HpR5R42Naputg4zLKXZRykZfjahVZK6WvSYqtcFWAbUo FXnrNMBqkt8moyeRXZ5nrDEUiRaRndZng9EZy5WbNTiF
BdPyJbAPVAYQmEwSq7eu16uBDmDosznnKCxY15hCuQXh qkYdTGRPHbWTWuBMz45bCiU6a23axRqf6sBHm9295WY 4sWPwW2BwGgGX7L4eGe5XCsAe4fLVU8yCjusH1icH6MW D1eLNrD84uxscPR1DWNeJem2C1sPDnNzthsahTgU2DUn
2AwMUDzzZZnwTcttZBYkj6rWXSKeReMN8bWCmhB7axxL 83TSSS7qojPowqrrvH23mCrhEJjnJG2ygaf7FEq9ZgKC 6rVkF4HSgy1jrnC3HogfRgPHrq4CtLg5f11URpsC4i9D AktftA98kSWAxn6kVSoqBXBELUArjKu2H9WmKB48ULFY
stnkwFt5Ao6Kq9QqfuLchMHJDxBSD6sqeJfiqM3aAKr FLckHLGMJy5gEoXWwcE68Nprde1D4araK4TGLw4pQq2n TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr
TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb 1mGRiNd5QgddUpASfGRftpQRKMB2peE5hj1gMF6f5Hp 7xQYoUjUJF1Kg6WVczoTAkaNhn5syQYcbvjmFrhjWpx 28eGXeTNGrhWm4cAL3feEnu5gpuxSsbtxv6iXnrRUfUv
2gYPy7cjhTLBpKfJ2qNqUWQcw74xWW6cXEPF2JscL3cF PvMdLn6ZSXTKeF9sMDEpcrtYjx7jG6baaVtshJfZuRB 7Qk9jBNNwpwg2oH2yRLq8CDqEiT11Evod29dQZgsnYzA J4pc3HHq7r3TrcTTHMXeyo14vKvHU7Xgr4PBVTQY6mpM
HLixVmXdBqzP1sXT9au4BHcvUjDgx5ev16cEJdd9tUSM 96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5 58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2 HLmqeL62xR1QoZ1HKKbXRrdN1p3phKpxRMb2VVopvBBz
DQyrAcCrDXQ7NeoqGgDCZwBvWDcYmFCjSb9JtteuvPpz Bvtgim23rfocUzxVX9j9QFxTbBnH8JZxnaGLCEkXvjKS ste11TMV68LMi1BguM4RQujtbNCZvf1sjsASpqgAvSX ADaUMid9yfUytqMBgopwjb2DTLSokTSzL1zt6iGPaS49
Df5uqevTGHajSLVJ8KziJEBKm88UPrkiT56TBpGPHquD DsCJ5siuJTPQtQa3A9N69azGZaWtUPzi9VPp2G9Jfpx9 DfXygSm4jCyNCybVYYK6DwvWqjKee8pbDmJGcLWNDXjh BhsSqXf2bVz9R7VN7Pu9k6EazDqB8P9vPS4Ve4AbTzLe
HrTBFGGaV1Z6wWhK4kmNNWmuKdUptcL2iRma6rH59H3D Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY HFqU5x63VTqvQss8hp11i4wVV8bD44PvwucfZ2bU7gRe DttWaMuVvTiduZRnguLF7jNxTgiMBZ1hyAumKUiL2KRL
3AVi9Tg9Uo68tJfuvoKvqKNWKkC5wPdSSdeBnizKZ6jT BWXT6RUhit9FfJQM3pBmqeFLPYmuxgmyhMGC5sGr8RbA 8WsuUSoarG8cTKfAcj7wFCRu9fomHiXV1sFtphCKTMiE 5PGhKctym6odbHGo2tKMST2AjmJsb2uZBQrKkn4ZuFT5
HDqS7hJpGc1kP3xDy81uKghf6G1rRVPqzqejuMfYd2WQ FAoxmbgdS56fjbna8bn7QjjrRKr6yAx3qbG3umk2cqTW X5QPJcpph4mBAJDzc4hRziFftSbcygV59kRb2Fu6Je1 ADuUkR4vqLUMWXxW9gh6D6L8pMSawimctcNZ5pGwDcEt
6WJfN1fqrEEMSVKnzZkR4vJTMTxBaqvka2KA7aQHJMfF ECevTTjEoAirXzJa8oMznfCF24f27tENSAPwoq5Dt4N6 LandX3uK1cSUF7hbefKo3oL1j4FhvhxitiMRKut99Z6 GXPFM2caqTtQYC2cJ5yJRi9VDkpsYZXzYdwYpGnLmtDL
EHAAiTxcdDwQ3U4bU6YcMsQGaekdzLS3B5SmYo46kJtL CTBn3yfsrCYno3rKFs4LwprkgrYvhmGeuHFg2sRAYZs4 9M4giFFMxmFGXtc3feFzRai56WbBqehoSeRE5GK7gf7 CXuX9YGBVoY7PTJy2MAYaFd8taxA6Jr5NLUXvuRm37Hz
FireuLYd4yjJBhXQyBs3Mq6ZpNEjyHPNPG2eqhTP9RHV 5RNggkS9hst7FoDcGc1q4fgMDv46XxKvWxtsDbucx77Y BFQhKM3qFF9B85Zfn3duF8dSdCdjQYpNyQ2e3uLaPcXR 3BpXnfJaUTiwXnJNe7Ej1rcbzqTTQUvLShZaWazebsVR
`.trim().split(/\s+/);
}
