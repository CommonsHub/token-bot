import { Guild, GuildMember } from "discord.js";

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
