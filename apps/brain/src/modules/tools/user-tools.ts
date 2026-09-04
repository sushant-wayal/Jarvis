import { z } from 'zod';
import { prisma } from '@/lib/db/prisma';
import { JarvisTool } from './types';

const GetUserProfileInputSchema = z.object({});

export const getUserProfileTool: JarvisTool<
  z.infer<typeof GetUserProfileInputSchema>,
  { name: string; preferences: Record<string, unknown> }
> = {
  name: 'user_profile_get',
  description: 'Retrieves the user profile, including their preferred name and custom settings.',
  category: 'PERSONAL',
  riskLevel: 'SAFE',
  inputSchema: GetUserProfileInputSchema,
  async execute(_input, context) {
    const user = await prisma.user.findUnique({ where: { id: context.userId } });
    const prefs = user?.preferences ? JSON.parse(user.preferences) : {};
    return {
      name: user?.name || 'Sushant',
      preferences: prefs,
    };
  },
};

const UpdateUserProfileInputSchema = z.object({
  name: z.string().optional().describe('Preferred name to call the user (e.g. "Sushant", "Chief")'),
  preferences: z.record(z.unknown()).optional().describe('Custom user preferences dictionary (e.g. { brevity: "high", tone: "concise" })'),
});

export const updateUserProfileTool: JarvisTool<
  z.infer<typeof UpdateUserProfileInputSchema>,
  { success: boolean; name: string; message: string }
> = {
  name: 'user_profile_update',
  description: 'Updates user profile details, name, or custom preferences (e.g. "Call me Sushant", "Set my response preference to concise").',
  category: 'PERSONAL',
  riskLevel: 'LOW_RISK',
  inputSchema: UpdateUserProfileInputSchema,
  async execute(input, context) {
    const existing = await prisma.user.findUnique({ where: { id: context.userId } });
    const existingPrefs = existing?.preferences ? JSON.parse(existing.preferences) : {};
    const mergedPrefs = input.preferences ? { ...existingPrefs, ...input.preferences } : existingPrefs;

    const updated = await prisma.user.upsert({
      where: { id: context.userId },
      update: {
        ...(input.name ? { name: input.name } : {}),
        preferences: JSON.stringify(mergedPrefs),
      },
      create: {
        id: context.userId,
        name: input.name || 'Sushant',
        preferences: JSON.stringify(mergedPrefs),
      },
    });

    return {
      success: true,
      name: updated.name,
      message: `Updated profile. User will be addressed as "${updated.name}".`,
    };
  },
};
