import { describe, it, expect } from 'vitest';
import { semanticEntityResolver } from '../modules/brain/semantic-entity-resolver';

describe('SemanticEntityResolver & Relational Disambiguation', () => {
  const contacts = [
    { name: "Darshan's mom", number: '+919876543210', label: 'mobile' },
    { name: 'Rahul', number: '+919123456780', label: 'work' },
    { name: 'Mom', number: '+919988776655', label: 'home' },
    { name: "Sushant's Mom", number: '+919988776655', label: 'mobile' },
  ];

  it('resolves direct exact match for "mom" without confusion', async () => {
    const res = await semanticEntityResolver.resolveContact(
      'mom',
      'Sushant',
      contacts
    );

    expect(res.found).toBe(true);
    expect(res.status).toBe('EXACT_MATCH');
    expect(res.contact?.name).toBe('Mom');
    expect(res.contact?.number).toBe('+919988776655');
  });

  it('resolves user own possessive "Sushant\'s Mom" when user is Sushant', async () => {
    const subset = [
      { name: "Sushant's Mom", number: '+919988776655', label: 'mobile' },
      { name: 'Rahul', number: '+919123456780', label: 'work' },
    ];

    const res = await semanticEntityResolver.resolveContact(
      'mom',
      'Sushant',
      subset
    );

    expect(res.found).toBe(true);
    expect(res.status).toBe('EXACT_MATCH');
    expect(res.contact?.name).toBe("Sushant's Mom");
  });

  it('rejects assuming "Darshan\'s mom" is user mom when user is Sushant', async () => {
    const thirdPartyContactsOnly = [
      { name: "Darshan's mom", number: '+919876543210', label: 'mobile' },
      { name: 'Rahul', number: '+919123456780', label: 'work' },
      { name: 'Priya', number: '+919555443322', label: 'mobile' },
    ];

    const res = await semanticEntityResolver.resolveContact(
      'mom',
      'Sushant',
      thirdPartyContactsOnly
    );

    // Must NOT be an exact match for Sushant's mom
    expect(res.status).not.toBe('EXACT_MATCH');
    if (res.status === 'AMBIGUOUS') {
      expect(res.found).toBe(false);
      expect(res.disambiguationMessage).toBeDefined();
    } else {
      expect(res.found).toBe(false);
    }
  });

  it('resolves configured aliases via fast-path', async () => {
    const res = await semanticEntityResolver.resolveContact(
      'mummy',
      'Sushant',
      contacts,
      { mummy: 'Mom' }
    );

    expect(res.found).toBe(true);
    expect(res.status).toBe('EXACT_MATCH');
    expect(res.contact?.name).toBe('Mom');
  });
});
