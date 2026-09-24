'use server';

import { prisma } from '@ai-reviewer/db';
import { RepoConfig, RepoConfigSchema } from '@ai-reviewer/shared';
import { revalidatePath } from 'next/cache';

export async function updateRepoConfig(repoId: number, newConfig: RepoConfig) {
  try {
    // Validate config with Zod
    const validatedConfig = RepoConfigSchema.parse(newConfig);

    await prisma.repository.update({
      where: { id: repoId },
      data: {
        config: validatedConfig,
      },
    });

    revalidatePath('/repositories');
    revalidatePath(`/repositories/${repoId}`);
    return { success: true };
  } catch (error) {
    console.error('Failed to update repository configuration:', error);
    return { success: false, error: (error as Error).message };
  }
}
