import { Configuration, PlaidApi, PlaidEnvironments } from "plaid";
import { config } from "./config";

let client: PlaidApi | null = null;

export function getPlaid(): PlaidApi {
  if (!config.plaid.clientId || !config.plaid.secret) throw new Error("Plaid is not configured");
  if (!client) {
    const basePath = PlaidEnvironments[config.plaid.env as keyof typeof PlaidEnvironments] ?? PlaidEnvironments.sandbox;
    client = new PlaidApi(
      new Configuration({
        basePath,
        baseOptions: { headers: { "PLAID-CLIENT-ID": config.plaid.clientId, "PLAID-SECRET": config.plaid.secret, "Plaid-Version": "2020-09-14" }, timeout: 20000 },
      }),
    );
  }
  return client;
}
