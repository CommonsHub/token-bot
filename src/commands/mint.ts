import { BundlerService, getAccountAddress } from "@citizenwallet/sdk";
import { ChatInputCommandInteraction, Client } from "discord.js";
import { Wallet } from "ethers";
import { getCommunity } from "../cw";
import { createDiscordMention, isDiscordMention } from "../utils/address";
import { ContentResponse, generateContent } from "../utils/content";
import { createProgressSteps } from "../utils/progress";
import { getAddressFromUserInputWithReplies } from "./conversion/address";
import { MintTaskArgs } from "./do/tasks";
import { Nostr, URI } from "../lib/nostr";
import { discordLog } from "../lib/discord";

const nostr = Nostr.getInstance();

export const handleMintCommand = async (
  client: Client,
  interaction: ChatInputCommandInteraction
) => {
  await interaction.reply({
    content: createProgressSteps(0),
    ephemeral: true,
  });

  const users = interaction.options.getString("user");
  if (!users) {
    await interaction.editReply("You need to specify a user!");
    return;
  }

  console.log(">>> mint command users", users);

  const amount = interaction.options.getNumber("amount");
  if (!amount) {
    await interaction.editReply("You need to specify an amount!");
    return;
  }

  const message = interaction.options.getString("message");

  await mintCommand(client, interaction, {
    name: "mint",
    alias: process.env.COMMUNITY_SLUG,
    users: users.match(/<@\d+>/g),
    amount,
    message,
  });
};

export const mintCommand = async (
  client: Client,
  interaction: ChatInputCommandInteraction,
  mintTaskArgs: MintTaskArgs
) => {
  const { users, amount, message } = mintTaskArgs;

  const community = getCommunity(process.env.COMMUNITY_SLUG);

  const token = community.primaryToken;

  const content: ContentResponse = {
    header: "",
    content: [],
  };

  let userIndex = 0;

  for (let user of users) {
    user = user.trim();

    const {
      address: receiverAddress,
      userId: receiverUserId,
      profile,
    } = await getAddressFromUserInputWithReplies(
      user,
      community,
      content,
      interaction
    );

    content.header = createProgressSteps(1, `${userIndex + 1}/${users.length}`);
    await interaction.editReply({
      content: generateContent(content),
    });

    const privateKey = process.env.BOT_PRIVATE_KEY;
    if (!privateKey) {
      content.content.push("Private key is not set");
      await interaction.editReply({
        content: generateContent(content),
      });
      continue;
    }

    const signer = new Wallet(privateKey);

    const signerAccountAddress = await getAccountAddress(
      community,
      signer.address
    );
    if (!signerAccountAddress) {
      content.content.push("Could not find an account for you!");
      await interaction.editReply({
        content: generateContent(content),
      });
      continue;
    }

    content.header = createProgressSteps(2, `${userIndex + 1}/${users.length}`);
    await interaction.editReply({
      content: generateContent(content),
    });

    const bundler = new BundlerService(community);

    try {
      const hash = await bundler.mintERC20Token(
        signer,
        token.address,
        signerAccountAddress,
        receiverAddress,
        amount.toString(),
        message
      );

      content.header = createProgressSteps(
        3,
        `${userIndex + 1}/${users.length}`
      );
      await interaction.editReply({
        content: generateContent(content),
      });

      const explorer = community.explorer;

      if (receiverUserId) {
        try {
          console.log(">>> sending DM to", receiverUserId);
          const receiver = await client.users.fetch(receiverUserId);

          const dmChannel = await receiver.createDM();

          await dmChannel.send(
            `${createDiscordMention(interaction.user.id)} minted **${amount} ${
              token.symbol
            }** to your account ([View Transaction](${
              explorer.url
            }/tx/${hash}))`
          );

          if (message) {
            await dmChannel.send(`*${message}*`);
          }

          nostr.publishMetadata(
            `ethereum:${community.primaryToken.chain_id}:address:${receiverAddress}` as URI,
            {
              content: receiver.displayName,
              tags: [
                ["username", receiver.username],
                ["picture", receiver.avatarURL({ size: 128 })],
                ["picture_large", receiver.avatarURL({ size: 2048 })],
              ],
            }
          );
        } catch (error) {
          console.error("Failed to send message to receiver", error);
        }
      }

      content.header = `✅ Minted ${userIndex + 1}/${users.length}`;
      content.content.push(
        `**${amount} ${token.symbol}** to ${
          profile?.name ?? profile?.username ?? user
        } ([tx](${explorer.url}/tx/${hash}))`
      );

      await interaction.editReply({
        content: generateContent(content),
      });

      nostr?.publishMetadata(
        `ethereum:${community.primaryToken.chain_id}:tx:${hash}` as URI,
        { content: message, tags: [] }
      );

      discordLog(
        `Minted ${amount} ${token.symbol} to ${user} for ${message} ([View Transaction](<${explorer.url}/tx/${hash}>))`
      );
    } catch (error) {
      console.error("Failed to mint", error);
      content.content.push("❌ Failed to mint");
      await interaction.editReply({
        content: generateContent(content),
      });
    }

    userIndex++;
  }
};
