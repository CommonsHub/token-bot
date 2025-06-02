import { Guild, GuildMember, PermissionsBitField } from "discord.js";
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
  gracePeriod?: number; // number of days after which the role is removed
  ignoreUsers?: string[]; // if true, the role is not removed
};

async function removeRole(
  guild: Guild,
  targetMember: GuildMember,
  roleId: string
) {
  const botMember = guild.members.me;

  if (!botMember) {
    console.log("❌ Bot is not a member of this guild.");
    return;
  }

  // Check 1: Bot permission
  if (!botMember.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
    console.log("❌ Bot lacks 'Manage Roles' permission.");
    console.log(
      "🔧 Solution: Grant 'Manage Roles' to the bot in the server settings."
    );
    return;
  }

  // Get the role object from the guild
  const roleToRemove = guild.roles.cache.get(roleId);
  if (!roleToRemove) {
    console.log(`❌ Role with ID '${roleId}' not found in guild.`);
    return;
  }

  console.log(
    "🧪 Role to remove:",
    roleToRemove.name,
    "position:",
    roleToRemove.position,
    "for user:",
    `${targetMember.user.displayName} (@${targetMember.user.tag})`,
    "joined at:",
    targetMember.joinedAt
  );

  // Check 2: Role hierarchy (bot vs role)
  if (roleToRemove.position >= botMember.roles.highest.position) {
    console.log(
      `❌ The role '${roleToRemove.name}' is higher or equal to the bot's highest role.`
    );
    console.log(
      "🔧 Solution: Move the bot's role higher than the role you're trying to remove."
    );
    return;
  }

  // Check 3: Role hierarchy (bot vs target member)
  if (
    targetMember.roles.highest.position >= botMember.roles.highest.position &&
    targetMember.id !== botMember.id
  ) {
    console.log(
      `❌ Target member '${targetMember.user.tag}' has a role higher or equal to the bot's highest role.`
    );
    console.log(
      "🔧 Solution: The bot cannot modify members with higher/equal roles. Move the bot role higher."
    );
    return;
  }

  // Check 4: Role existence
  if (!targetMember.roles.cache.has(roleToRemove.id)) {
    console.log(
      `⚠️ Target member does not have the role '${roleToRemove.name}'. Nothing to remove.`
    );
    return;
  }

  // All good — try to remove the role
  try {
    await targetMember.roles.remove(roleToRemove);
    console.log(
      `✅ Successfully removed role '${roleToRemove.name}' from '${targetMember.user.tag}'.`
    );
  } catch (err) {
    console.error("❌ Failed to remove role:", err);
  }
}

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
  const message = `${roleSettings.frequency} contribution for ${roleSettings.name} role`;
  if (roleSettings.ignoreUsers?.includes(user.user.username)) {
    console.log(`Ignoring user ${user.user.username}`);
    return;
  }
  if (burnStatus.status === "burnt") {
    console.error(`${user} has already burned`);
  } else {
    const balanceBigInt = await getAccountBalance(community, cardAddress);

    const balance =
      Number(balanceBigInt) / 10 ** community.primaryToken.decimals;

    if (burnStatus.burntAmount > balance) {
      if (DRY_RUN) {
        console.log(
          `DRYRUN: ${user.user.username} has not enough CHT, removing role ${roleSettings.name}.`
        );
      } else {
        if (
          Date.now() - user.joinedTimestamp >
          1000 * 60 * 60 * 24 * (roleSettings.gracePeriod || 30)
        ) {
          await removeRole(guild, user, roleSettings.id);
        } else {
          console.log(
            `${user.user.displayName} (@${
              user.user.tag
            }) has been in the server for less than ${
              roleSettings.gracePeriod || 30
            } days, not removing role ${roleSettings.name}.`
          );
        }
      }
    } else {
      const bundler = new BundlerService(community);
      const newBalance = balance - burnStatus.burntAmount;

      console.log(
        `\n\n\nDRYRUN: Burning ${burnStatus.burntAmount.toString()} CHT for ${
          user.user.username
        } (balance: ${balance}, new balance: ${newBalance})`,
        message
      );

      try {
        const hash = DRY_RUN
          ? "0x123"
          : await bundler.burnFromERC20Token(
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

        const txUri =
          `ethereum:${community.primaryToken.chain_id}:tx:${hash}` as URI;
        const nostrData = {
          content: message,
          tags: [["role", roleSettings.name]],
        };
        if (DRY_RUN) {
          console.log("DRY RUN:Publishing to Nostr", txUri, nostrData);
        } else {
          await nostr?.publishMetadata(txUri, nostrData);
        }

        const discordMessage = `Burned ${burnStatus.burntAmount.toString()} CHT for <@${
          user.user.id
        }> for ${roleSettings.frequency} contribution for ${
          roleSettings.name
        } role, new balance: ${newBalance} ${
          community.primaryToken.symbol
        } ([View account](<https://txinfo.xyz/celo/address/${cardAddress}>))`;

        if (DRY_RUN) {
          console.log("DRY RUN: Discord log", discordMessage);
        } else {
          await discordLog(discordMessage);
        }
      } catch (e) {
        console.error(
          `Failed to burn ${burnStatus.burntAmount.toString()} CHT for ${
            user.user.username
          } (${e.message})`,
          e
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
