import React from 'react';
import { EtherealOrb, EtherealOrbProps, OrbState } from './EtherealOrb';

export { EtherealOrb, OrbState };
export type VoiceOrbProps = EtherealOrbProps;

/**
 * VoiceOrb wraps and proxies EtherealOrb for backwards compatibility across the application.
 */
export function VoiceOrb(props: EtherealOrbProps): React.ReactElement {
  return <EtherealOrb {...props} />;
}
