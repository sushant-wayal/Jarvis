import { z } from 'zod';
import { BaseIntegrationTool } from '../../integration-tool';
import { SerenityClient, SerenityScriptPreview } from '../SerenityClient';

export class GenerateScriptPreviewTool extends BaseIntegrationTool<
  { videoIdea: string; sceneRenderMethod?: 'code' | 'ai' },
  SerenityScriptPreview
> {
  constructor(client: SerenityClient) {
    super({
      id: 'serenity.generate_script_preview',
      name: 'serenity.generate_script_preview',
      description:
        'Generates an on-demand script and storyboard preview for a video idea without compiling or publishing a video.',
      integrationId: 'serenity',
      category: 'PRODUCTIVITY',
      actionType: 'READ',
      riskLevel: 'SAFE',
      requiresConfirmation: false,
      inputSchema: z.object({
        videoIdea: z.string().min(1).describe('Topic idea to draft a script and storyboard for.'),
        sceneRenderMethod: z
          .enum(['code', 'ai'])
          .optional()
          .describe('Visual scene render method ("code" or "ai").'),
      }),
      executor: async (input) => {
        const script = await client.generateScriptPreview(input);
        return {
          success: true,
          data: script,
          message: `Generated script preview "${script.title}" with ${script.scenes?.length || 0} scenes and ${script.shorts?.length || 0} short hook(s).`,
        };
      },
    });
  }
}
