import { hasRole as hasRoleSdk, MINTER_ROLE } from "@citizenwallet/sdk";
import { JsonRpcProvider } from "ethers";

const provider = new JsonRpcProvider(
  process.env.RPC_URL || "https://forno.celo.org"
);

export async function getNativeBalance(address: string) {
  const balance = await provider.getBalance(address);
  return Number(balance) / 10 ** 18;
}

export async function hasRole(
  tokenAddress: string,
  role: string,
  address: string
) {
  if (role === "minter") {
    return await hasRoleSdk(tokenAddress, MINTER_ROLE, address, provider);
  }
  return await hasRoleSdk(tokenAddress, role, address, provider);
}
