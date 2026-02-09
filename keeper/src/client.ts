import "dotenv/config";
import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { decodeSuiPrivateKey } from "@mysten/sui/cryptography";

const network = (process.env.SUI_NETWORK as "testnet" | "mainnet" | "devnet") ?? "testnet";

export const client = new SuiClient({ url: getFullnodeUrl(network) });

function loadKeypair(): Ed25519Keypair {
  const raw = process.env.SECRET_KEY;
  if (!raw) throw new Error("SECRET_KEY not set in .env");

  // Support both `suiprivkey1...` (bech32) and raw base64/hex
  if (raw.startsWith("suiprivkey")) {
    const { schema, secretKey } = decodeSuiPrivateKey(raw);
    if (schema !== "ED25519") throw new Error(`Unsupported key schema: ${schema}`);
    return Ed25519Keypair.fromSecretKey(secretKey);
  }
  return Ed25519Keypair.fromSecretKey(raw);
}

export const keypair = loadKeypair();
export const address = keypair.getPublicKey().toSuiAddress();

console.log(`[client] network=${network}  address=${address}`);
