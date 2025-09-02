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
import { burn, DiscordRoleSettings, mint } from "../lib/token";

const roles: DiscordRoleSettings[] = [
  {
    id: "1356972890540736725",
    name: "shifters",
    burnAmount: 10,
    frequency: "monthly",
    gracePeriod: 30,
    ignoreUsers: [],
  },
  {
    id: "1356973314794328254",
    name: "coworker",
    burnAmount: 3,
    frequency: "monthly",
    gracePeriod: 30,
  },
  {
    id: "1359965350846009526",
    name: "Note taker steward",
    mintAmount: 1,
    frequency: "weekly",
  },
  {
    id: "1359965220944220190",
    name: "Toilet steward 1st floor",
    mintAmount: 2,
    frequency: "weekly",
  },
  {
    id: "1412341727985143889",
    name: "Toilet steward 2nd floor",
    mintAmount: 2,
    frequency: "weekly",
  },
  {
    id: "1412341733362241537",
    name: "Trash steward Sunday",
    mintAmount: 1,
    frequency: "weekly",
  },
  {
    id: "1412341738365915197",
    name: "Trash steward Wednesday",
    mintAmount: 1,
    frequency: "weekly",
  },
  {
    id: "1359964607803949250",
    name: "Kitchen steward",
    mintAmount: 2,
    frequency: "weekly",
  },
  {
    id: "1412341338367852616",
    name: "Diswasher and sink steward",
    mintAmount: 1,
    frequency: "weekly",
  },
  {
    id: "1359964755930120295",
    name: "Plant steward",
    mintAmount: 2,
    frequency: "weekly",
  },
  {
    id: "1359964918605942885",
    name: "Carpet steward",
    mintAmount: 2,
    frequency: "weekly",
  },
  {
    id: "1384167690951725096",
    name: "Backside (1st floor) steward",
    mintAmount: 2,
    frequency: "weekly",
  },
  {
    id: "1412339166506651668",
    name: "Backside (1.5 floor) steward",
    mintAmount: 2,
    frequency: "weekly",
  },
  {
    id: "1369303976679571537",
    name: "Backside (2nd floor) steward",
    mintAmount: 2,
    frequency: "weekly",
  },
  {
    id: "1359966155145482431",
    name: "Communication steward",
    mintAmount: 2,
    frequency: "weekly",
  },
  {
    id: "1366460956250476655",
    name: "Surfaces steward",
    mintAmount: 2,
    frequency: "weekly",
  },
  {
    id: "1366461641226453093",
    name: "Growth steward",
    mintAmount: 1,
    frequency: "weekly",
  },
  {
    id: "1359965976199823560",
    name: "Token steward",
    mintAmount: 1,
    frequency: "weekly",
  },
  {
    id: "1377753360140075279",
    name: "Laundry steward",
    mintAmount: 1,
    frequency: "weekly",
  },
  {
    id: "1384166466315882628",
    name: "Groceries steward",
    mintAmount: 1,
    frequency: "weekly",
  },
  {
    id: "1384167297068957806",
    name: "Shifters steward",
    mintAmount: 1,
    frequency: "weekly",
  },
  {
    id: "1384167425011875991",
    name: "Stairs steward",
    mintAmount: 2,
    frequency: "weekly",
  },
];

const main = async () => {
  const token = process.env.DISCORD_TOKEN;

  const date = new Date();
  const day = date.getDate();
  const dayOfWeek = date.getDay();

  console.log(`Running on ${day} of the month and ${dayOfWeek} of the week`);

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

  const GUILD_ID = process.env.DISCORD_GUILD_ID;
  if (!GUILD_ID) {
    console.error("DISCORD_GUILD_ID env variable is not set");
    return;
  }
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
      for (const user of users) {
        if (role.frequency === "monthly") {
          if (day !== 1) {
            return;
          }
        } else if (role.frequency === "weekly") {
          if (dayOfWeek !== 1) {
            return;
          }
        }
        if (role.burnAmount) {
          await burn(
            role,
            user,
            community,
            guild,
            signer,
            signerAccountAddress
          );
        } else if (role.mintAmount) {
          await mint(
            role,
            user,
            community,
            guild,
            signer,
            signerAccountAddress
          );
          // wait for 1 second to avoid rate limiting
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }
    })
  );
  console.log(">>> done");
  process.exit(0);
};
main();
