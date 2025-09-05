import { getAccountAddress } from "@citizenwallet/sdk";
import { ChatInputCommandInteraction, Client } from "discord.js";
import { Wallet, Contract, JsonRpcProvider } from "ethers";
import { getCommunity } from "../cw";
import { createDiscordMention } from "../utils/address";
import { ContentResponse } from "../utils/content";
import { createProgressSteps } from "../utils/progress";
import { getAddressFromUserInputWithReplies } from "./conversion/address";
import { BurnTaskArgs } from "./do/tasks";
import { discordLog } from "../lib/discord";
import { Nostr, URI } from "../lib/nostr";

const nostr = Nostr.getInstance();

interface BurnParams {
  user: string;
  amount: number;
  message?: string;
  address: string;
  profile?: any;
  userId?: string;
}

interface BurnResult {
  success: boolean;
  hash?: string;
  error?: string;
}

const executeBurnTransaction = async (
  params: BurnParams
): Promise<BurnResult> => {
  const { user, amount, address } = params;

  const community = getCommunity(process.env.COMMUNITY_SLUG);
  const token = community.primaryToken;

  const privateKey = process.env.BOT_PRIVATE_KEY;
  if (!privateKey) {
    return {
      success: false,
      error: "Private key is not set",
    };
  }

  const signer = new Wallet(privateKey);

  const signerAccountAddress = await getAccountAddress(
    community,
    signer.address
  );
  if (!signerAccountAddress) {
    return {
      success: false,
      error: "Could not find an account for you!",
    };
  }

  try {
    // Create provider and contract instance
    const provider = new JsonRpcProvider(community.primaryRPCUrl);
    const connectedSigner = signer.connect(provider);

    // ERC20 ABI with burnFrom function
    const erc20Abi = [
      "function burnFrom(address account, uint256 amount) external",
      "function balanceOf(address account) external view returns (uint256)",
      "function decimals() external view returns (uint8)",
      "function symbol() external view returns (string)",
      "function name() external view returns (string)",
      "function allowance(address owner, address spender) external view returns (uint256)",
      "function approve(address spender, uint256 amount) external returns (bool)",
    ];

    const tokenContract = new Contract(
      token.address,
      erc20Abi,
      connectedSigner
    );

    // Convert amount to proper decimals
    const burnAmount = BigInt(amount * 10 ** token.decimals);

    // Call burnFrom function directly
    const tx = await tokenContract.burnFrom(address, burnAmount);
    const hash = tx.hash;

    // Wait for transaction to be mined
    await tx.wait();

    return {
      success: true,
      hash,
    };
  } catch (error) {
    console.error("Failed to burn", error);
    return {
      success: false,
      error: "Failed to burn",
    };
  }
};

const sendDiscordNotifications = async (
  client: Client,
  interaction: ChatInputCommandInteraction,
  params: BurnParams,
  hash: string
): Promise<void> => {
  const { user, amount, message, userId } = params;
  const community = getCommunity(process.env.COMMUNITY_SLUG);
  const token = community.primaryToken;
  const explorer = community.explorer;

  // Send DM to the user whose tokens were burned
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

  // Send confirmation message to the interaction
  await interaction.editReply({
    content: `✅ Burned **${amount} ${token.symbol}** from ${
      params.profile?.name ?? params.profile?.username ?? user
    } ([tx](${explorer.url}/tx/${hash}))`,
  });
};

const sendNostrNotification = async (
  params: BurnParams,
  hash: string
): Promise<void> => {
  const { message } = params;
  const community = getCommunity(process.env.COMMUNITY_SLUG);

  nostr?.publishMetadata(
    `ethereum:${community.primaryToken.chain_id}:tx:${hash}` as URI,
    { content: message, tags: [] }
  );
};

const sendDiscordLog = async (
  params: BurnParams,
  hash: string
): Promise<void> => {
  const { user, amount, message } = params;
  const community = getCommunity(process.env.COMMUNITY_SLUG);
  const token = community.primaryToken;

  discordLog(`Burned ${amount} ${token.symbol} from ${user} for ${message}`);
};

const handleBurnWithNotifications = async (
  client: Client,
  interaction: ChatInputCommandInteraction,
  params: BurnParams
): Promise<void> => {
  await interaction.editReply(createProgressSteps(2));

  // Execute the burn transaction
  const burnResult = await executeBurnTransaction(params);

  if (!burnResult.success) {
    await interaction.editReply({
      content: `❌ ${burnResult.error}`,
    });
    return;
  }

  await interaction.editReply(createProgressSteps(3));

  // Send all notifications
  await Promise.all([
    sendDiscordNotifications(client, interaction, params, burnResult.hash!),
    sendNostrNotification(params, burnResult.hash!),
    sendDiscordLog(params, burnResult.hash!),
  ]);
};

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

  await handleBurnWithNotifications(client, interaction, {
    user,
    amount,
    message,
    address,
    profile,
    userId,
  });
};

export const burnCommand = async (
  client: Client,
  interaction: ChatInputCommandInteraction,
  burnTaskArgs: BurnTaskArgs
) => {
  const { user, amount, message } = burnTaskArgs;

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

  // Reuse the same logic as handleBurnCommand
  await handleBurnWithNotifications(client, interaction, {
    user,
    amount,
    message,
    address,
    profile,
    userId,
  });
};
