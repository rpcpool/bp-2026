Breakpoint 2026 demos

O almighty demo gods, may blessings to this demo be thy will—and may the Wi-Fi actually cooperate

## Scripts

These scripts show how to lower your Triton bill. Each one runs the same request in a few ways and prints a table with the data size and the cost per day and per month.

- `lib.ts`: Shared code. It sends RPC calls, counts the bytes, and prints the cost table.
- `1-account.ts`: Reads one large account (a Light Protocol tree, about 2.2 MB). Shows how zstd and a data slice make the response smaller.
- `2-gpa.ts`: Gets all token accounts for one mint with `getProgramAccounts`. Shows the effect of zstd and of asking only for the amount field.
- `3-block.ts`: Gets one block in full, then again with only the signatures and no rewards.
- `4-history.ts`: Gets the last 20 transactions of an address. Compares 21 separate calls with one `getTransactionsForAddress` call.
- `5-grpc.ts`: Streams transactions over Yellowstone gRPC. Compares no compression, zstd, and zstd with a filter for one program.

## Run

Install the packages once:

```bash
npm install
```

Put your endpoints in a `.env` file:

```bash
RPC_URL=https://<your-endpoint>/<token>
GRPC_URL=https://<your-grpc-endpoint>
GRPC_TOKEN=<token>
```

Run a script:

```bash
npx tsx --env-file=.env 1-account.ts
npx tsx --env-file=.env 2-gpa.ts
npx tsx --env-file=.env 3-block.ts
npx tsx --env-file=.env 4-history.ts
npx tsx --env-file=.env 5-grpc.ts
```
