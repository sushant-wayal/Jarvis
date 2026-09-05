import { earbudService } from '../services/earbudService';
import { EarbudEventType } from '@jarvis/shared';

describe('EarbudService', () => {
  it('subscribes and receives emitted earbud tap events', () => {
    const receivedEvents: EarbudEventType[] = [];
    const unsubscribe = earbudService.subscribe((event) => {
      receivedEvents.push(event);
    });

    earbudService.triggerSimulatedTap('SINGLE_TAP');
    earbudService.triggerSimulatedTap('MEDIA_PLAY');
    earbudService.triggerSimulatedTap('MEDIA_PAUSE');
    earbudService.triggerSimulatedTap('DOUBLE_TAP');

    expect(receivedEvents).toEqual(['SINGLE_TAP', 'MEDIA_PLAY', 'MEDIA_PAUSE', 'DOUBLE_TAP']);

    unsubscribe();
    earbudService.triggerSimulatedTap('SINGLE_TAP');
    expect(receivedEvents.length).toBe(4);
  });

  it('updates and retrieves earbud settings', async () => {
    await earbudService.updateSettings({
      singleTapAction: 'ACTIVATE_LISTENING',
      playFeedbackChimes: false,
    });

    const settings = earbudService.getSettings();
    expect(settings.singleTapAction).toBe('ACTIVATE_LISTENING');
    expect(settings.playFeedbackChimes).toBe(false);
  });

  it('reports current status with last event metadata', () => {
    earbudService.triggerSimulatedTap('SINGLE_TAP');
    const status = earbudService.getStatus();

    expect(status.lastEvent).toBe('SINGLE_TAP');
    expect(typeof status.lastEventTimestamp).toBe('number');
  });
});
