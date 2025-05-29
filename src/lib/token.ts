import { Guild, GuildMember } from "discord.js/typings";
import {
  BundlerService,
  CommunityConfig,
  getAccountBalance,
  getCardAddress,
} from "@citizenwallet/sdk";
import { keccak256, toUtf8Bytes, Wallet, formatUnits } from "ethers";

import { Nostr, URI } from "./nostr";
import { discordLog } from "./discord";

const nostr = Nostr.getInstance();

const DRY_RUN = ["test", "dev", "dryrun"].includes(process.env.ENV);

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
  const burnStatus = { status: "new", burntAmount: roleSettings.burnAmount }; //await getBurnStatus(user, role);
  const message = `Burning tokens for ${roleSettings.name} role`;
  if (burnStatus.status === "burnt") {
    console.error(`${user} has already burned`);
  } else {
    const balanceBigInt = await getAccountBalance(community, cardAddress);

    const balance =
      Number(balanceBigInt) / 10 ** community.primaryToken.decimals;

    console.log(
      `DRYRUN: Burning ${burnStatus.burntAmount.toString()} CHT for ${
        user.user.username
      } (balance: ${formatUnits(
        balanceBigInt,
        community.primaryToken.decimals
      )})`,
      message
    );

    if (burnStatus.burntAmount > balance) {
      if (DRY_RUN) {
        console.log(
          `DRYRUN: ${user.user.username} has not enough CHT, removing role ${roleSettings.name}.`
        );
      } else {
        await guild.members.removeRole({
          user: user,
          role: roleSettings.id,
        });
        console.log(
          `${user.user.username} has not enough CHT, removed role ${roleSettings.name}.`
        );
      }
    } else {
      const bundler = new BundlerService(community);

      if (DRY_RUN) {
        return;
      }

      try {
        const hash = await bundler.burnFromERC20Token(
          signer,
          community.primaryToken.address,
          signerAccountAddress,
          cardAddress,
          burnStatus.burntAmount.toString(),
          message
        );
        console.log(
          `Burnt ${burnStatus.burntAmount.toString()} CHT for ${
            user.user.username
          }: ${hash}`
        );
        await nostr?.publishMetadata(
          `ethereum:${community.primaryToken.chain_id}:tx:${hash}` as URI,
          {
            content: message,
            tags: [["role", roleSettings.name]],
          }
        );
        await discordLog(
          `Burned ${burnStatus.burntAmount.toString()} CHT for <@${
            user.user.id
          }> for ${roleSettings.name} role`
        );
      } catch (e) {
        console.error(
          `Failed to burn ${burnStatus.burntAmount.toString()} CHT for ${
            user.user.username
          } (${e.message})`
        );
      }
    }
  }
};

export const mint = async (
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
  const mintStatus = { status: "new", mintedAmount: roleSettings.mintAmount };
  const message = `Minting tokens for ${roleSettings.name} role`;
  if (mintStatus.status === "mint") {
    console.error(`${user} has already minted`);
  } else {
    const bundler = new BundlerService(community);

    if (DRY_RUN) {
      const balanceBigInt = await getAccountBalance(community, cardAddress);
      console.log(
        `DRYRUN: Minting ${mintStatus.mintedAmount.toString()} CHT for ${
          user.user.username
        } (balance: ${formatUnits(
          balanceBigInt,
          community.primaryToken.decimals
        )})`,
        message
      );
      return;
    }

    try {
      console.log(
        `Minting ${mintStatus.mintedAmount.toString()} CHT for ${
          user.user.username
        }`
      );
      const hash = await bundler.mintERC20Token(
        signer,
        community.primaryToken.address,
        signerAccountAddress,
        cardAddress,
        mintStatus.mintedAmount.toString(),
        message
      );
      console.log(`Minted hash: ${hash}`);
      await nostr?.publishMetadata(
        `ethereum:${community.primaryToken.chain_id}:tx:${hash}` as URI,
        {
          content: message,
          tags: [["role", roleSettings.name]],
        }
      );
      const explorer = community.explorer;
      await discordLog(
        `Minted ${mintStatus.mintedAmount.toString()} CHT for <@${
          user.user.id
        }> for ${roleSettings.name} role ([View Transaction](<${
          explorer.url
        }/tx/${hash}>))`
      );
    } catch (e) {
      console.error(
        `Failed to mint ${mintStatus.mintedAmount.toString()} CHT for ${
          user.user.username
        } (${e.message})`,
        e
      );
    }
  }
};
