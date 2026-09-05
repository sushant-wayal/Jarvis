/**
 * Universal Privacy Masker
 *
 * Anonymizes sensitive Personal Identifiable Information (PII) including
 * phone numbers, email addresses, and secret tokens before sending data to
 * auxiliary LLM decision prompts, and allows bidirectional restoration.
 */

export interface MaskResult {
  maskedText: string;
  tokenMap: Record<string, string>;
}

export interface MaskedContact {
  id: string;
  name: string;
  maskedNumber: string;
  label?: string;
}

export interface MaskedItem<T = unknown> {
  id: string;
  maskedText: string;
  originalItem: T;
}

export class PrivacyMasker {
  // Common regex patterns for PII
  private static readonly PHONE_REGEX =
    /(?:\+?\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,5}[-.\s]?\d{3,5}/g;
  private static readonly EMAIL_REGEX =
    /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  private static readonly SECRET_REGEX =
    /\b(?:ghp_[a-zA-Z0-9]{36}|sk-[a-zA-Z0-9]{20,}|AIzaSy[a-zA-Z0-9_-]{33})\b/g;

  /**
   * Masks PII in arbitrary string text and returns the masked text and token mapping.
   */
  mask(text: string, existingTokenMap: Record<string, string> = {}): MaskResult {
    const tokenMap = { ...existingTokenMap };
    let maskedText = text;

    let phoneIndex = Object.keys(tokenMap).filter((k) => k.startsWith('[PHONE_')).length + 1;
    let emailIndex = Object.keys(tokenMap).filter((k) => k.startsWith('[EMAIL_')).length + 1;
    let secretIndex = Object.keys(tokenMap).filter((k) => k.startsWith('[SECRET_')).length + 1;

    // Mask secrets first
    maskedText = maskedText.replace(PrivacyMasker.SECRET_REGEX, (match) => {
      const token = `[SECRET_${secretIndex++}]`;
      tokenMap[token] = match;
      return token;
    });

    // Mask emails
    maskedText = maskedText.replace(PrivacyMasker.EMAIL_REGEX, (match) => {
      const token = `[EMAIL_${emailIndex++}]`;
      tokenMap[token] = match;
      return token;
    });

    // Mask phone numbers (ensuring match is at least 7 digits to prevent false matching on dates/years)
    maskedText = maskedText.replace(PrivacyMasker.PHONE_REGEX, (match) => {
      const digitCount = match.replace(/\D/g, '').length;
      if (digitCount < 7) {
        return match; // Not a phone number, likely a year or small count
      }
      const token = `[PHONE_${phoneIndex++}]`;
      tokenMap[token] = match;
      return token;
    });

    return { maskedText, tokenMap };
  }

  /**
   * Restores masked text using the token map.
   */
  unmask(maskedText: string, tokenMap: Record<string, string>): string {
    let result = maskedText;
    for (const [token, original] of Object.entries(tokenMap)) {
      result = result.split(token).join(original);
    }
    return result;
  }

  /**
   * Masks a list of contacts while retaining names and labels for relational reasoning.
   */
  maskContacts(contacts: Array<{ id?: string; name: string; number: string; label?: string }>): {
    maskedContacts: MaskedContact[];
    tokenMap: Record<string, string>;
  } {
    const tokenMap: Record<string, string> = {};
    let phoneIndex = 1;

    const maskedContacts: MaskedContact[] = contacts.map((c, i) => {
      const token = `[PHONE_${phoneIndex++}]`;
      tokenMap[token] = c.number;
      return {
        id: c.id || `contact_${i}`,
        name: c.name,
        maskedNumber: token,
        label: c.label,
      };
    });

    return { maskedContacts, tokenMap };
  }

  /**
   * Masks a list of generic items (e.g. tasks, events, memories).
   */
  maskItems<T>(
    items: T[],
    getText: (item: T) => string,
    getId: (item: T) => string
  ): {
    maskedItems: MaskedItem<T>[];
    tokenMap: Record<string, string>;
  } {
    let combinedTokenMap: Record<string, string> = {};
    const maskedItems: MaskedItem<T>[] = [];

    for (const item of items) {
      const rawText = getText(item);
      const { maskedText, tokenMap } = this.mask(rawText, combinedTokenMap);
      combinedTokenMap = tokenMap;
      maskedItems.push({
        id: getId(item),
        maskedText,
        originalItem: item,
      });
    }

    return { maskedItems, tokenMap: combinedTokenMap };
  }
}

export const privacyMasker = new PrivacyMasker();
