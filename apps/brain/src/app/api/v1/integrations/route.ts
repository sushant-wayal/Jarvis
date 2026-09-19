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
      // Collect all action types supported by this integration
      const actionTypesSet = new Set<string>();
      for (const t of tools) {
        if (t.actionType) {
          actionTypesSet.add(t.actionType);
        }
      }
      const supportedActionTypes = Array.from(actionTypesSet);

      const storedPolicies = userPrefs?.integrations?.[meta.id]?.policies || {};
      const storedAutoApprove = userPrefs?.integrations?.[meta.id]?.autoApprove || {};

      const policies: Record<string, 'ALLOW' | 'ASK' | 'DENY'> = {
        READ: storedPolicies.READ || (storedAutoApprove.READ === false ? 'DENY' : 'ALLOW'),
        WRITE: storedPolicies.WRITE || (storedAutoApprove.WRITE === true ? 'ALLOW' : 'ASK'),
        EXTERNAL_ACTION: storedPolicies.EXTERNAL_ACTION || (storedAutoApprove.EXTERNAL_ACTION === true ? 'ALLOW' : 'ASK'),
        DESTRUCTIVE: storedPolicies.DESTRUCTIVE || (storedAutoApprove.DESTRUCTIVE === true ? 'ALLOW' : 'ASK'),
      };

      const autoApprove: Record<string, boolean> = {
        READ: policies.READ === 'ALLOW',
        WRITE: policies.WRITE === 'ALLOW',
        EXTERNAL_ACTION: policies.EXTERNAL_ACTION === 'ALLOW',
        DESTRUCTIVE: policies.DESTRUCTIVE === 'ALLOW',
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
        policies,
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
      policies?: Record<string, 'ALLOW' | 'ASK' | 'DENY'>;
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

    // Action: Update Permissions / 3-Way Policy Settings
    if (body.action === 'updatePermissions' && (body.policies || body.autoApprove)) {
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

      const existingPolicies = prefs.integrations[int.metadata.id].policies || {};
      const updatedPolicies: Record<string, 'ALLOW' | 'ASK' | 'DENY'> = {
        ...existingPolicies,
        ...(body.policies || {}),
      };

      // If legacy autoApprove was sent, map it to policies
      if (body.autoApprove) {
        for (const [action, allowed] of Object.entries(body.autoApprove)) {
          if (!body.policies?.[action]) {
            updatedPolicies[action] = allowed ? 'ALLOW' : 'ASK';
          }
        }
      }

      // Sync autoApprove map
      const autoApprove: Record<string, boolean> = {
        READ: updatedPolicies.READ === 'ALLOW',
        WRITE: updatedPolicies.WRITE === 'ALLOW',
        EXTERNAL_ACTION: updatedPolicies.EXTERNAL_ACTION === 'ALLOW',
        DESTRUCTIVE: updatedPolicies.DESTRUCTIVE === 'ALLOW',
      };

      prefs.integrations[int.metadata.id].policies = updatedPolicies;
      prefs.integrations[int.metadata.id].autoApprove = autoApprove;

      await prisma.user.update({
        where: { id: user.id },
        data: { preferences: JSON.stringify(prefs) },
      });

      return successResponse(
        {
          id: int.metadata.id,
          policies: updatedPolicies,
          autoApprove,
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
