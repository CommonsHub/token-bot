import { CommunityConfig } from "@citizenwallet/sdk/dist/src";
import { JsonRpcProvider } from "ethers";

export async function getNativeBalance(address: string) {
  const provider = new JsonRpcProvider(
    process.env.RPC_URL || "https://forno.celo.org"
  );
  const balance = await provider.getBalance(address);
  return Number(balance) / 10 ** 18;
}
