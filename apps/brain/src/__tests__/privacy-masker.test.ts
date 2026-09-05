import { describe, it, expect } from 'vitest';
import { privacyMasker } from '../modules/brain/privacy-masker';

describe('PrivacyMasker Module', () => {
  it('masks phone numbers, email addresses, and secret tokens', () => {
    const rawText =
      'Call my mom at +91 98765 43210 or email me at sushant@example.com. My token is ghp_1234567890abcdef1234567890abcdef1234.';

    const { maskedText, tokenMap } = privacyMasker.mask(rawText);

    expect(maskedText).toContain('[PHONE_1]');
    expect(maskedText).toContain('[EMAIL_1]');
    expect(maskedText).toContain('[SECRET_1]');

    expect(maskedText).not.toContain('+91 98765 43210');
    expect(maskedText).not.toContain('sushant@example.com');
    expect(maskedText).not.toContain('ghp_1234567890abcdef1234567890abcdef1234');

    // Unmask test
    const unmasked = privacyMasker.unmask(maskedText, tokenMap);
    expect(unmasked).toBe(rawText);
  });

  it('masks contacts list without exposing phone numbers', () => {
    const rawContacts = [
      { name: "Darshan's mom", number: '+919876543210', label: 'mobile' },
      { name: 'Mom', number: '+15551234567', label: 'home' },
    ];

    const { maskedContacts, tokenMap } = privacyMasker.maskContacts(rawContacts);

    expect(maskedContacts[0].name).toBe("Darshan's mom");
    expect(maskedContacts[0].maskedNumber).toBe('[PHONE_1]');
    expect(maskedContacts[1].maskedNumber).toBe('[PHONE_2]');

    // Unmask number
    const restoredNum = privacyMasker.unmask(maskedContacts[0].maskedNumber, tokenMap);
    expect(restoredNum).toBe('+919876543210');
  });

  it('masks generic items like tasks or memories', () => {
    const tasks = [
      { id: 't1', title: 'Call Rahul at 9876543210 about project' },
      { id: 't2', title: 'Email priya@work.com regarding budget' },
    ];

    const { maskedItems, tokenMap } = privacyMasker.maskItems(
      tasks,
      (t) => t.title,
      (t) => t.id
    );

    expect(maskedItems[0].maskedText).toContain('[PHONE_1]');
    expect(maskedItems[0].maskedText).not.toContain('9876543210');

    expect(maskedItems[1].maskedText).toContain('[EMAIL_1]');
    expect(maskedItems[1].maskedText).not.toContain('priya@work.com');

    // Restoration
    const restoredTitle = privacyMasker.unmask(maskedItems[0].maskedText, tokenMap);
    expect(restoredTitle).toBe('Call Rahul at 9876543210 about project');
  });
});
