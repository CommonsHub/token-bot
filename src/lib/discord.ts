import {
  Guild,
  GuildMember,
  Client,
  GatewayIntentBits,
  TextChannel,
} from "discord.js";

const token = process.env.DISCORD_TOKEN;
const DRY_RUN = ["test", "dev", "dryrun"].includes(process.env.ENV);

// Create a new client instance
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildModeration,
  ],
});

// Add error handling and reconnection logic
client.on("error", (error) => {
  console.error("Discord client error:", error);
  // Attempt to reconnect after a delay
  setTimeout(() => {
    console.log("Attempting to reconnect...");
    client.login(token);
  }, 5000); // Wait 5 seconds before reconnecting
});

client.on("disconnect", () => {
  console.log("Discord client disconnected");
  // Attempt to reconnect after a delay
  setTimeout(() => {
    console.log("Attempting to reconnect...");
    client.login(token);
  }, 5000);
});

client.login(token);

export const getMembers = async (
  guild: Guild,
  roleId: string
): Promise<GuildMember[]> => {
  const members = await guild.members.fetch();
  if (!members) {
    console.log("members not found");
    return [];
  }

  const users = members.filter((member) => member.roles.cache.has(roleId));

  return Array.from(users.values());
};

// Get the role
export const postMessageToChannel = async (
  channelId: string,
  message: string
) => {
  const channel = await client.channels.fetch(channelId);
  if (!channel || !(channel instanceof TextChannel)) {
    console.log("channel not found or is not a text channel");
    return;
  }
  if (!DRY_RUN) {
    await channel.send(message);
  }
};

export const discordLog = async (message: string) => {
  const channelId = process.env.DISCORD_LOG_CHANNEL_ID;
  if (!channelId) {
    console.log("channelId not found");
    return;
  }
  console.log(">>> posting message to discord log channel", message);
  await postMessageToChannel(channelId, message);
};
