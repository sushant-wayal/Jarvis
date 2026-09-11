import { z } from 'zod';
import { BaseIntegrationTool } from '../../integration-tool';
import { SerenityClient, SerenitySettings } from '../SerenityClient';

export class UpdateSettingsTool extends BaseIntegrationTool<
  { voiceoverProvider?: 'gemini' | 'f5'; sceneRenderMethod?: 'code' | 'ai' },
  SerenitySettings
> {
  constructor(client: SerenityClient) {
    super({
      id: 'serenity.update_settings',
      name: 'serenity.update_settings',
      description:
        'Updates Serenity pipeline engine settings (TTS voiceover provider: gemini/f5, scene render method: code/ai) (requires user confirmation).',
      integrationId: 'serenity',
      category: 'PRODUCTIVITY',
      actionType: 'WRITE',
      riskLevel: 'HIGH_RISK',
      requiresConfirmation: true,
      inputSchema: z.object({
        voiceoverProvider: z
          .enum(['gemini', 'f5'])
          .optional()
          .describe('TTS voiceover provider to use ("gemini" or "f5").'),
        sceneRenderMethod: z
          .enum(['code', 'ai'])
          .optional()
          .describe('Visual scene render method ("code" for Remotion/code-rendered or "ai" for image diffusion).'),
      }),
      executor: async (input) => {
        const settings = await client.updateSettings(input);
        return {
          success: true,
          data: settings,
          message: `Successfully updated Serenity settings. Voiceover: ${settings.voiceoverProvider}, Scene render: ${settings.sceneRenderMethod}.`,
        };
      },
    });
  }
}
