import { BundlerService, getAccountAddress } from "@citizenwallet/sdk";
import { ChatInputCommandInteraction, Client } from "discord.js";
import { Wallet } from "ethers";
import { getCommunity } from "../cw";
import { createDiscordMention } from "../utils/address";
import { ContentResponse } from "../utils/content";
import { createProgressSteps } from "../utils/progress";
import { getAddressFromUserInputWithReplies } from "./conversion/address";
import { BurnTaskArgs } from "./do/tasks";
import { discordLog } from "../lib/discord";
import { Nostr, URI } from "../lib/nostr";

const nostr = Nostr.getInstance();

export const handleBurnCommand = async (
  client: Client,
  interaction: ChatInputCommandInteraction
) => {
  await interaction.reply({
    content: createProgressSteps(0),
    ephemeral: true,
  });

  const user = interaction.options.getString("user");
  if (!user) {
    await interaction.editReply("You need to specify a user!");
    return;
  }

  const usersArray = user.split(",");
  if (usersArray.length > 1) {
    await interaction.editReply("You can only burn from one user at a time");
    return;
  }

  const amount = interaction.options.getNumber("amount");
  if (!amount) {
    await interaction.editReply("You need to specify an amount!");
    return;
  }

  const message = interaction.options.getString("message");

  const community = getCommunity(process.env.COMMUNITY_SLUG);

  const token = community.primaryToken;

  const content: ContentResponse = {
    header: "",
    content: [],
  };

  const { address, profile, userId } = await getAddressFromUserInputWithReplies(
    user,
    community,
    content,
    interaction
  );

  await interaction.editReply(createProgressSteps(1));

  const privateKey = process.env.BOT_PRIVATE_KEY;
  if (!privateKey) {
    await interaction.editReply({
      content: "Private key is not set",
    });
    return;
  }

  const signer = new Wallet(privateKey);

  const signerAccountAddress = await getAccountAddress(
    community,
    signer.address
  );
  if (!signerAccountAddress) {
    await interaction.editReply({
      content: "Could not find an account for you!",
    });
    return;
  }

  await interaction.editReply(createProgressSteps(2));

  const bundler = new BundlerService(community);

  try {
    const hash = await bundler.burnFromERC20Token(
      signer,
      token.address,
      signerAccountAddress,
      address,
      amount.toString(),
      message
    );

    await interaction.editReply(createProgressSteps(3));

    const explorer = community.explorer;

    if (userId) {
      try {
        const receiver = await client.users.fetch(userId);

        const dmChannel = await receiver.createDM();

        await dmChannel.send(
          `${createDiscordMention(interaction.user.id)} burned **${amount} ${
            token.symbol
          }** from your account ([tx](${explorer.url}/tx/${hash}))`
        );

        if (message) {
          await dmChannel.send(`*${message}*`);
        }
      } catch (error) {
        console.error("Failed to send message to receiver", error);
      }
    }

    interaction.editReply({
      content: `✅ Burned **${amount} ${token.symbol}** from ${
        profile?.name ?? profile?.username ?? user
      } ([tx](${explorer.url}/tx/${hash}))`,
    });

    nostr?.publishMetadata(
      `ethereum:${community.primaryToken.chain_id}:tx:${hash}` as URI,
      { content: message, tags: [] }
    );

    discordLog(`Burned ${amount} ${token.symbol} from ${user} for ${message}`);
  } catch (error) {
    console.error("Failed to burn", error);
    await interaction.editReply({
      content: "❌ Failed to burn",
    });
  }
};

export const burnCommand = async (
  client: Client,
  interaction: ChatInputCommandInteraction,
  burnTaskArgs: BurnTaskArgs
) => {
  const community = getCommunity(process.env.COMMUNITY_SLUG);
  const user = burnTaskArgs.user;
  const amount = burnTaskArgs.amount;
  const message = burnTaskArgs.message;

  const token = community.primaryToken;

  const content: ContentResponse = {
    header: "",
    content: [],
  };

  const { address, profile, userId } = await getAddressFromUserInputWithReplies(
    user,
    community,
    content,
    interaction
  );

  await interaction.editReply(createProgressSteps(1));

  const privateKey = process.env.BOT_PRIVATE_KEY;
  if (!privateKey) {
    await interaction.editReply({
      content: "Private key is not set",
    });
    return;
  }

  const signer = new Wallet(privateKey);

  const signerAccountAddress = await getAccountAddress(
    community,
    signer.address
  );
  if (!signerAccountAddress) {
    await interaction.editReply({
      content: "Could not find an account for you!",
    });
    return;
  }

  await interaction.editReply(createProgressSteps(2));

  const bundler = new BundlerService(community);

  try {
    const hash = await bundler.burnFromERC20Token(
      signer,
      token.address,
      signerAccountAddress,
      address,
      amount.toString(),
      message
    );

    await interaction.editReply(createProgressSteps(3));

    const explorer = community.explorer;

    if (userId) {
      try {
        const receiver = await client.users.fetch(userId);

        const dmChannel = await receiver.createDM();

        await dmChannel.send(
          `${createDiscordMention(interaction.user.id)} burned **${amount} ${
            token.symbol
          }** from your account ([tx](${explorer.url}/tx/${hash}))`
        );

        if (message) {
          await dmChannel.send(`*${message}*`);
        }
      } catch (error) {
        console.error("Failed to send message to receiver", error);
      }
    }

    await interaction.editReply({
      content: `✅ Burned **${amount} ${token.symbol}** from ${
        profile?.name ?? profile?.username ?? user
      } ([tx](${explorer.url}/tx/${hash}))`,
    });

    return;
  } catch (error) {
    console.error("Failed to burn", error);
    await interaction.editReply({
      content: "❌ Failed to burn",
    });
  }
};
