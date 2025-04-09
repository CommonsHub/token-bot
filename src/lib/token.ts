import { Guild, GuildMember } from "discord.js/typings";
import {
  BundlerService,
  CommunityConfig,
  getAccountBalance,
  getCardAddress,
} from "@citizenwallet/sdk";
import { keccak256, toUtf8Bytes, Wallet, formatUnits } from "ethers";

const DRY_RUN = true;

export type DiscordRoleSettings = {
  id: string;
  name: string;
  burnAmount?: number;
  mintAmount?: number;
  frequency: string;
};

export const burn = async (
  roleSettings: DiscordRoleSettings,
  user: GuildMember,
  community: CommunityConfig,
  guild: Guild,
  signer: Wallet,
  signerAccountAddress: string
) => {
  const hashedUserId = keccak256(toUtf8Bytes(user.user.id));

  const cardAddress = await getCardAddress(community, hashedUserId);
  if (!cardAddress) {
    console.error(
      `Could not find an account to send to for user ${user.user.displayName}!`
    );
    return;
  }
  // check user status
  const burnStatus = { status: "new", remainingBurns: roleSettings.burnAmount }; //await getBurnStatus(user, role);
  const message = `Burning tokens for ${roleSettings.name} role`;
  if (burnStatus.status === "burnt") {
    console.error(`${user} has already burned`);
  } else {
    const balance = await getAccountBalance(community, cardAddress);

    if (burnStatus.remainingBurns > balance) {
      if (DRY_RUN) {
        console.log(
          `DRYRUN: ${user} has not enough CHT, removing role ${roleSettings.id}.`
        );
      } else {
        await guild.members.removeRole({
          user: user,
          role: roleSettings.id,
        });
        console.log(
          `${user} has not enough CHT, removed role ${roleSettings.id}.`
        );
      }
    } else {
      const bundler = new BundlerService(community);

      if (DRY_RUN) {
        console.log(
          `DRYRUN: Burning ${burnStatus.remainingBurns.toString()} CHT for ${
            user.user.username
          } (balance: ${formatUnits(
            balance,
            community.primaryToken.decimals
          )})`,
          message
        );
        return;
      }

      try {
        const hash = await bundler.burnFromERC20Token(
          signer,
          community.primaryToken.address,
          signerAccountAddress,
          cardAddress,
          burnStatus.remainingBurns.toString(),
          message
        );
        console.log(
          `Burnt ${burnStatus.remainingBurns.toString()} CHT for ${user}: ${hash}`
        );
      } catch (e) {
        console.error(
          `Failed to burnt ${burnStatus.remainingBurns.toString()} CHT for ${user} (${
            e.message
          })`
        );
      }
    }
  }
};
