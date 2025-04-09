/**
 * This script is used to burn tokens from the community
 * This script will be run as a cron job to fetch all the users of a given role
 * and burn the number of tokens that this role requires.
 * If the balance is not enough, we revoke the role.
 */
import "dotenv/config";
import { Client, GatewayIntentBits } from "discord.js";
import { getMembers } from "../lib/discord";
import { getAccountAddress } from "@citizenwallet/sdk";
import { getCommunity } from "../cw";
import { Wallet } from "ethers";
import { burn, DiscordRoleSettings } from "../lib/token";

const roles: DiscordRoleSettings[] = [
  {
    id: "1356972890540736725",
    name: "shifters",
    burnAmount: 10,
    frequency: "monthly",
  },
  {
    id: "1356973314794328254",
    name: "coworker",
    burnAmount: 3,
    frequency: "monthly",
  },
];

const main = async () => {
  const token = process.env.DISCORD_TOKEN;

  // Create a new client instance
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.DirectMessages,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.GuildMembers,
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

  const GUILD_ID = process.env.DISCORD_GUILD_ID;
  const guild = await client.guilds.fetch(GUILD_ID);

  const community = getCommunity(process.env.COMMUNITY_SLUG);

  const privateKey = process.env.BOT_PRIVATE_KEY;
  if (!privateKey) {
    console.error("Private key is not set");
    return;
  }

  const signer = new Wallet(privateKey);

  const signerAccountAddress = await getAccountAddress(
    community,
    signer.address
  );
  if (!signerAccountAddress) {
    console.error("Could not find an account for you!");
    return;
  }

  await Promise.all(
    roles.map(async (role) => {
      const users = await getMembers(guild, role.id);
      await Promise.all(
        users.map(async (user) => {
          await burn(
            role,
            user,
            community,
            guild,
            signer,
            signerAccountAddress
          );
        })
      );
    })
  );
  console.log(">>> done");
  process.exit(0);
};
main();
