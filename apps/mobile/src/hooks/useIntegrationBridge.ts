/**
 * useIntegrationBridge
 * React hook that initializes the IntegrationManager and exposes
 * action execution to the rest of the UI layer.
 *
 * Usage:
 *   const { executeAction, buildPhoneContext, capabilities } = useIntegrationBridge();
 */

import * as React from 'react';
import {
  ActionResult,
  IntegrationCapabilities,
  JarvisPhoneAction,
  PhoneContext,
} from '@jarvis/shared';
import { integrationManager } from '../integrations/IntegrationManager';

export interface IntegrationBridgeValue {
  /** Whether the integration layer has finished initializing */
  ready: boolean;
  /** Current device capabilities snapshot */
  capabilities: IntegrationCapabilities | null;
  /** Execute a phone action returned by the brain */
  executeAction: (action: JarvisPhoneAction) => Promise<ActionResult>;
  /** Build a fresh PhoneContext snapshot for the next brain request */
  buildPhoneContext: () => Promise<PhoneContext>;
  /** Request contacts permission explicitly (e.g. from settings) */
  requestContactsPermission: () => Promise<'granted' | 'denied'>;
}

const DEFAULT_CAPABILITIES: IntegrationCapabilities = {
  contacts: false,
  phoneCall: false,
  sms: false,
  notificationListener: false,
  notificationReply: false,
  openApp: true,
};

export function useIntegrationBridge(): IntegrationBridgeValue {
  const [ready, setReady] = React.useState(false);
  const [capabilities, setCapabilities] = React.useState<IntegrationCapabilities | null>(null);

  React.useEffect(() => {
    let cancelled = false;

    (async () => {
      await integrationManager.initialize();
      if (cancelled) return;

      const caps = await integrationManager.getCapabilities();
      setCapabilities(caps);
      setReady(true);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const executeAction = React.useCallback(
    async (action: JarvisPhoneAction): Promise<ActionResult> => {
      return integrationManager.executeAction(action);
    },
    []
  );

  const buildPhoneContext = React.useCallback(
    async (): Promise<PhoneContext> => {
      return integrationManager.buildPhoneContext();
    },
    []
  );

  const requestContactsPermission = React.useCallback(
    async (): Promise<'granted' | 'denied'> => {
      const { contactsIntegration } = await import('../integrations/ContactsIntegration');
      const result = await contactsIntegration.requestPermission();
      // Refresh capabilities after permission change
      const caps = await integrationManager.getCapabilities();
      setCapabilities(caps);
      return result;
    },
    []
  );

  return {
    ready,
    capabilities: capabilities ?? DEFAULT_CAPABILITIES,
    executeAction,
    buildPhoneContext,
    requestContactsPermission,
  };
}
