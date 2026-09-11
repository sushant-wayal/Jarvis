import { z } from 'zod';
import { BaseIntegrationTool } from '../../integration-tool';
import { SerenityClient, SerenitySettings } from '../SerenityClient';

export class GetSettingsTool extends BaseIntegrationTool<
  Record<string, never>,
  SerenitySettings
> {
  constructor(client: SerenityClient) {
    super({
      id: 'serenity.get_settings',
      name: 'serenity.get_settings',
      description:
        'Fetches Serenity pipeline engine settings (TTS voiceover provider and visual scene render method).',
      integrationId: 'serenity',
      category: 'PRODUCTIVITY',
      actionType: 'READ',
      riskLevel: 'SAFE',
      requiresConfirmation: false,
      inputSchema: z.object({}),
      executor: async () => {
        const settings = await client.getSettings();
        return {
          success: true,
          data: settings,
          message: `Voiceover provider: "${settings.voiceoverProvider}", Scene render method: "${settings.sceneRenderMethod}".`,
        };
      },
    });
  }
}
