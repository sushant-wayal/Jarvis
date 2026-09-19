import { NextRequest } from 'next/server';
import { generateRequestId, successResponse, errorResponse } from '@/lib/api/response';
import { prisma } from '@/lib/db/prisma';
import { integrationManager } from '@/modules/integrations';
import { GmailIntegration } from '@/modules/integrations/gmail';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const requestId = generateRequestId();

  let user = null;
  try {
    user = await prisma.user.findFirst();
  } catch {
    // fallback if db is unreachable
  }
  const userPrefs = user?.preferences ? JSON.parse(user.preferences) : {};

  const allIntegrations = integrationManager.getAllIntegrations();
  const list = await Promise.all(
    allIntegrations.map(async (int) => {
      const status = await int.getStatus();
      const meta = int.metadata;
      let connectedAccount: string | null = null;

      if (int instanceof GmailIntegration) {
        connectedAccount = int.getAuth().getConnectedEmail();
      }

      const tools = int.getTools();
      // Collect all non-READ action types supported by this integration
      const actionTypesSet = new Set<string>();
      for (const t of tools) {
        if (t.actionType && t.actionType !== 'READ') {
          actionTypesSet.add(t.actionType);
        }
      }
      const supportedActionTypes = Array.from(actionTypesSet);

      const storedAutoApprove = userPrefs?.integrations?.[meta.id]?.autoApprove || {};
      const autoApprove: Record<string, boolean> = {
        WRITE: Boolean(storedAutoApprove.WRITE),
        EXTERNAL_ACTION: Boolean(storedAutoApprove.EXTERNAL_ACTION),
        DESTRUCTIVE: Boolean(storedAutoApprove.DESTRUCTIVE),
      };

      return {
        id: meta.id,
        name: meta.name,
        description: meta.description,
        version: meta.version,
        enabled: int.isEnabled(),
        status,
        authType: meta.authRequirements.type,
        isConfigured: meta.authRequirements.isConfigured,
        connectedAccount,
        toolCount: tools.length,
        permissions: meta.permissions,
        supportedActionTypes,
        autoApprove,
      };
    })
  );

  return successResponse(list, requestId);
}

export async function POST(req: NextRequest) {
  const requestId = generateRequestId();

  try {
    const body = (await req.json()) as {
      id?: string;
      enabled?: boolean;
      action?: 'toggle' | 'disconnect' | 'updatePermissions';
      autoApprove?: Record<string, boolean>;
      clearCredentials?: boolean;
    };

    if (!body.id) {
      return errorResponse('INVALID_PARAMETERS', 'Integration id is required.', requestId, 400);
    }

    const int = integrationManager.getIntegration(body.id);
    if (!int) {
      return errorResponse('NOT_FOUND', `Integration "${body.id}" not found.`, requestId, 404);
    }

    // Action: Update Permissions / Auto-Approve Settings
    if (body.action === 'updatePermissions' && body.autoApprove) {
      let user = await prisma.user.findFirst();
      if (!user) {
        user = await prisma.user.create({
          data: {
            id: 'user_default',
            name: 'User',
            preferences: '{}',
          },
        });
      }

      const prefs = user.preferences ? JSON.parse(user.preferences) : {};
      if (!prefs.integrations) prefs.integrations = {};
      if (!prefs.integrations[int.metadata.id]) prefs.integrations[int.metadata.id] = {};

      prefs.integrations[int.metadata.id].autoApprove = {
        ...prefs.integrations[int.metadata.id].autoApprove,
        ...body.autoApprove,
      };

      await prisma.user.update({
        where: { id: user.id },
        data: { preferences: JSON.stringify(prefs) },
      });

      return successResponse(
        {
          id: int.metadata.id,
          autoApprove: prefs.integrations[int.metadata.id].autoApprove,
          message: `Permissions updated for ${int.metadata.name}.`,
        },
        requestId
      );
    }

    // Action: Disconnect
    if (body.action === 'disconnect') {
      await int.disconnect();
      const status = await int.getStatus();
      return successResponse(
        {
          id: int.metadata.id,
          enabled: int.isEnabled(),
          status,
          message: `Disconnected ${int.metadata.name}. Credentials have been cleared.`,
        },
        requestId
      );
    }

    // Action: Toggle Enabled/Disabled
    if (typeof body.enabled === 'boolean') {
      if (body.enabled) {
        await int.enable();
        const status = await int.getStatus();
        const requiresAuth = status === 'CONFIG_REQUIRED';

        return successResponse(
          {
            id: int.metadata.id,
            enabled: true,
            status,
            requiresAuth,
            message: requiresAuth
              ? `${int.metadata.name} enabled but requires authentication.`
              : `${int.metadata.name} is now active.`,
          },
          requestId
        );
      } else {
        // Disabling: If OAuth or explicit clearCredentials requested, clear credentials
        const isOAuth = int.metadata.authRequirements.type === 'OAUTH';
        if (isOAuth || body.clearCredentials) {
          await int.disconnect();
        }
        await int.disable();
        const status = await int.getStatus();

        return successResponse(
          {
            id: int.metadata.id,
            enabled: false,
            status,
            message: isOAuth
              ? `${int.metadata.name} disabled and credentials wiped.`
              : `${int.metadata.name} disabled.`,
          },
          requestId
        );
      }
    }

    return errorResponse('INVALID_PARAMETERS', 'Missing "enabled" or "action" parameter.', requestId, 400);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return errorResponse('INTERNAL_ERROR', msg, requestId, 500);
  }
}
