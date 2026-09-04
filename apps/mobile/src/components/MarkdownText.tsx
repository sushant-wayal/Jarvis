import * as React from 'react';
import {
  StyleProp,
  StyleSheet,
  Text,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import { colors, rounded, typography } from '../theme/tokens';

export interface MarkdownTextProps {
  content: string;
  style?: StyleProp<ViewStyle>;
  baseTextStyle?: StyleProp<TextStyle>;
}

/**
 * Parses inline markdown: **bold**, *italic*, and `inline code`
 */
function parseInlineMarkdown(
  text: string,
  baseStyle?: StyleProp<TextStyle>
): React.ReactNode[] {
  if (!text) return [];

  // Match inline tokens:
  // 1: `code`
  // 2: **bold** or __bold__
  // 3: *italic* or _italic_
  const regex = /(`[^`]+`|\*\*[^*]+\*\*|__[^_]+__|(?<!\*)\*[^*]+(?!\*)|(?<!_)_[^_]+(?!_))/g;
  const parts = text.split(regex);

  return parts.map((part, index) => {
    if (!part) return null;

    if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) {
      return (
        <Text key={index} style={[styles.inlineCode, baseStyle]}>
          {part.slice(1, -1)}
        </Text>
      );
    }

    if (
      (part.startsWith('**') && part.endsWith('**') && part.length >= 4) ||
      (part.startsWith('__') && part.endsWith('__') && part.length >= 4)
    ) {
      return (
        <Text key={index} style={[styles.boldText, baseStyle]}>
          {part.slice(2, -2)}
        </Text>
      );
    }

    if (
      (part.startsWith('*') && part.endsWith('*') && part.length >= 2) ||
      (part.startsWith('_') && part.endsWith('_') && part.length >= 2)
    ) {
      return (
        <Text key={index} style={[styles.italicText, baseStyle]}>
          {part.slice(1, -1)}
        </Text>
      );
    }

    return (
      <Text key={index} style={baseStyle}>
        {part}
      </Text>
    );
  });
}

/**
 * Lightweight, zero-dependency Markdown renderer tailored for mobile Jarvis responses.
 * Renders headers, bullet lists, numbered lists, blockquotes, code blocks,
 * and bold/italic/inline code with high-readability typography.
 */
export function MarkdownText({
  content,
  style,
  baseTextStyle,
}: MarkdownTextProps): React.ReactElement {
  if (!content) {
    return <View style={style} />;
  }

  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const elements: React.ReactNode[] = [];
  let inCodeBlock = false;
  let codeBlockBuffer: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    // Code block toggle
    if (trimmed.startsWith('```')) {
      if (inCodeBlock) {
        elements.push(
          <View key={`code-${i}`} style={styles.codeBlock}>
            <Text style={styles.codeBlockText}>{codeBlockBuffer.join('\n')}</Text>
          </View>
        );
        codeBlockBuffer = [];
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockBuffer.push(rawLine);
      continue;
    }

    // Empty line spacer
    if (trimmed.length === 0) {
      elements.push(<View key={`spacer-${i}`} style={styles.paragraphSpacer} />);
      continue;
    }

    // Heading 1
    if (trimmed.startsWith('# ')) {
      elements.push(
        <Text key={`h1-${i}`} style={[styles.h1, baseTextStyle]}>
          {parseInlineMarkdown(trimmed.slice(2), [styles.h1, baseTextStyle])}
        </Text>
      );
      continue;
    }

    // Heading 2
    if (trimmed.startsWith('## ')) {
      elements.push(
        <Text key={`h2-${i}`} style={[styles.h2, baseTextStyle]}>
          {parseInlineMarkdown(trimmed.slice(3), [styles.h2, baseTextStyle])}
        </Text>
      );
      continue;
    }

    // Heading 3
    if (trimmed.startsWith('### ')) {
      elements.push(
        <Text key={`h3-${i}`} style={[styles.h3, baseTextStyle]}>
          {parseInlineMarkdown(trimmed.slice(4), [styles.h3, baseTextStyle])}
        </Text>
      );
      continue;
    }

    // Blockquote
    if (trimmed.startsWith('> ')) {
      elements.push(
        <View key={`quote-${i}`} style={styles.quoteContainer}>
          <Text style={[styles.quoteText, baseTextStyle]}>
            {parseInlineMarkdown(trimmed.slice(2), [styles.quoteText, baseTextStyle])}
          </Text>
        </View>
      );
      continue;
    }

    // Bullet List (- or * or •)
    const bulletMatch = trimmed.match(/^[-*•]\s+(.*)$/);
    if (bulletMatch) {
      elements.push(
        <View key={`bullet-${i}`} style={styles.listItemRow}>
          <View style={styles.bulletDot} />
          <Text style={[styles.paragraphText, styles.listContentText, baseTextStyle]}>
            {parseInlineMarkdown(bulletMatch[1], [styles.paragraphText, baseTextStyle])}
          </Text>
        </View>
      );
      continue;
    }

    // Numbered List (1. or 2.)
    const numberMatch = trimmed.match(/^(\d+)[.)]\s+(.*)$/);
    if (numberMatch) {
      elements.push(
        <View key={`num-${i}`} style={styles.listItemRow}>
          <View style={styles.numberBadge}>
            <Text style={styles.numberBadgeText}>{numberMatch[1]}</Text>
          </View>
          <Text style={[styles.paragraphText, styles.listContentText, baseTextStyle]}>
            {parseInlineMarkdown(numberMatch[2], [styles.paragraphText, baseTextStyle])}
          </Text>
        </View>
      );
      continue;
    }

    // Standard Paragraph
    elements.push(
      <Text key={`p-${i}`} style={[styles.paragraphText, baseTextStyle]}>
        {parseInlineMarkdown(trimmed, [styles.paragraphText, baseTextStyle])}
      </Text>
    );
  }

  // Flush open code block if any
  if (inCodeBlock && codeBlockBuffer.length > 0) {
    elements.push(
      <View key="code-unclosed" style={styles.codeBlock}>
        <Text style={styles.codeBlockText}>{codeBlockBuffer.join('\n')}</Text>
      </View>
    );
  }

  return <View style={[styles.container, style]}>{elements}</View>;
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  paragraphSpacer: {
    height: 8,
  },
  paragraphText: {
    fontSize: 16,
    lineHeight: 24,
    color: colors.onSurface,
    fontWeight: '400',
    marginBottom: 4,
  },
  boldText: {
    fontWeight: '700',
    color: colors.primaryFixed,
  },
  italicText: {
    fontStyle: 'italic',
    color: colors.onSurfaceVariant,
  },
  inlineCode: {
    fontFamily: 'monospace',
    fontSize: 14,
    color: colors.primaryFixedDim,
    backgroundColor: 'rgba(125, 244, 255, 0.08)',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: rounded.sm,
    borderColor: 'rgba(125, 244, 255, 0.2)',
    borderWidth: 1,
  },
  h1: {
    fontSize: 20,
    lineHeight: 28,
    fontWeight: '700',
    color: colors.primaryFixed,
    letterSpacing: 0.3,
    marginTop: 8,
    marginBottom: 6,
  },
  h2: {
    fontSize: 18,
    lineHeight: 26,
    fontWeight: '600',
    color: colors.primaryFixed,
    marginTop: 6,
    marginBottom: 4,
  },
  h3: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '600',
    color: colors.primaryFixedDim,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginTop: 6,
    marginBottom: 4,
  },
  listItemRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 6,
    paddingLeft: 2,
  },
  bulletDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.primaryFixed,
    marginTop: 9,
    marginRight: 10,
    shadowColor: colors.primaryFixed,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
  },
  numberBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: 'rgba(125, 244, 255, 0.12)',
    borderColor: 'rgba(125, 244, 255, 0.3)',
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 3,
    marginRight: 10,
    paddingHorizontal: 4,
  },
  numberBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.primaryFixed,
  },
  listContentText: {
    flex: 1,
    marginBottom: 0,
  },
  quoteContainer: {
    borderLeftWidth: 3,
    borderLeftColor: colors.primaryFixedDim,
    paddingLeft: 12,
    marginVertical: 6,
    backgroundColor: 'rgba(125, 244, 255, 0.03)',
    paddingVertical: 6,
    borderRadius: rounded.sm,
  },
  quoteText: {
    fontSize: 15,
    lineHeight: 22,
    fontStyle: 'italic',
    color: colors.onSurfaceVariant,
  },
  codeBlock: {
    backgroundColor: colors.surfaceContainerLowest,
    borderColor: 'rgba(125, 244, 255, 0.15)',
    borderWidth: 1,
    borderRadius: rounded.md,
    padding: 12,
    marginVertical: 8,
  },
  codeBlockText: {
    fontFamily: 'monospace',
    fontSize: 13,
    lineHeight: 18,
    color: colors.primaryFixed,
  },
});
