import { NextRequest } from 'next/server';
import { generateRequestId, successResponse, errorResponse } from '@/lib/api/response';
import { prisma } from '@/lib/db/prisma';
import { integrationManager } from '@/modules/integrations';
import { GmailIntegration } from '@/modules/integrations/gmail';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Persists the integration enabled/disabled state to the database so that a server
 * restart or Next.js cold-start doesn't silently revert the user's preference back
 * to the in-memory default (always true).
 */
async function persistIntegrationState(userId: string, integrationId: string, enabled: boolean): Promise<void> {
  try {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    const prefs = user?.preferences ? JSON.parse(user.preferences) : {};
    if (!prefs.integrations) prefs.integrations = {};
    if (!prefs.integrations[integrationId]) prefs.integrations[integrationId] = {};

    // Only update the enabled flag; never touch credentials or policies here
    prefs.integrations[integrationId].enabled = enabled;

    await prisma.user.upsert({
      where: { id: userId },
      update: { preferences: JSON.stringify(prefs) },
      create: { id: userId, name: 'Sushant', preferences: JSON.stringify(prefs) },
    });
  } catch {
    // Non-fatal — in-memory state still reflects intent
  }
}

export async function GET(req: NextRequest) {
  const requestId = generateRequestId();

  let user = null;
  try {
    // Always use the canonical default-user so policies/credentials are consistent
    user = await prisma.user.findUnique({ where: { id: 'default-user' } });
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

      const storedToolPolicies: Record<string, 'ALLOW' | 'ASK' | 'DENY'> =
        userPrefs?.integrations?.[meta.id]?.toolPolicies || {};

      const toolList = tools.map((t) => {
        const policy: 'ALLOW' | 'ASK' | 'DENY' =
          storedToolPolicies[t.id] ||
          storedToolPolicies[t.name] ||
          policies[t.actionType] ||
          (t.actionType === 'READ' ? 'ALLOW' : 'ASK');

        return {
          id: t.id,
          name: t.name,
          description: t.description,
          actionType: t.actionType,
          riskLevel: t.riskLevel,
          policy,
        };
      });

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
        toolPolicies: storedToolPolicies,
        tools: toolList,
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
      toolPolicies?: Record<string, 'ALLOW' | 'ASK' | 'DENY'>;
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

    // Action: Update Permissions / 3-Way Policy Settings (Action-Level and Tool-Level)
    if (body.action === 'updatePermissions' && (body.policies || body.toolPolicies || body.autoApprove)) {
      // Always upsert on the canonical default-user
      let user = await prisma.user.findUnique({ where: { id: 'default-user' } });
      if (!user) {
        user = await prisma.user.create({
          data: {
            id: 'default-user',
            name: 'Sushant',
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

      const existingToolPolicies = prefs.integrations[int.metadata.id].toolPolicies || {};
      const updatedToolPolicies: Record<string, 'ALLOW' | 'ASK' | 'DENY'> = {
        ...existingToolPolicies,
        ...(body.toolPolicies || {}),
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
      prefs.integrations[int.metadata.id].toolPolicies = updatedToolPolicies;
      prefs.integrations[int.metadata.id].autoApprove = autoApprove;

      await prisma.user.update({
        where: { id: 'default-user' },
        data: { preferences: JSON.stringify(prefs) },
      });

      return successResponse(
        {
          id: int.metadata.id,
          policies: updatedPolicies,
          toolPolicies: updatedToolPolicies,
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
        // Persist enabled state so server restarts don't lose the toggle
        await persistIntegrationState('default-user', int.metadata.id, true);
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
        // Disabling: ONLY clear credentials if the caller explicitly requests it.
        // A simple toggle-off must NEVER wipe OAuth tokens — the user should be able
        // to re-enable without going through a full OAuth consent flow again.
        if (body.clearCredentials === true) {
          await int.disconnect();
        }
        await int.disable();
        // Persist the disabled state so a server restart doesn't silently re-enable
        await persistIntegrationState('default-user', int.metadata.id, false);
        const status = await int.getStatus();

        return successResponse(
          {
            id: int.metadata.id,
            enabled: false,
            status,
            message: body.clearCredentials
              ? `${int.metadata.name} disabled and credentials cleared.`
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
