---
name: Ethereal Intelligence
colors:
  surface: '#131314'
  surface-dim: '#131314'
  surface-bright: '#3a393a'
  surface-container-lowest: '#0e0e0f'
  surface-container-low: '#1c1b1c'
  surface-container: '#201f20'
  surface-container-high: '#2a2a2b'
  surface-container-highest: '#353436'
  on-surface: '#e5e2e3'
  on-surface-variant: '#b9cacb'
  inverse-surface: '#e5e2e3'
  inverse-on-surface: '#313031'
  outline: '#849495'
  outline-variant: '#3b494b'
  surface-tint: '#00dbe9'
  primary: '#dbfcff'
  on-primary: '#00363a'
  primary-container: '#00f0ff'
  on-primary-container: '#006970'
  inverse-primary: '#006970'
  secondary: '#ddb7ff'
  on-secondary: '#490080'
  secondary-container: '#6f00be'
  on-secondary-container: '#d6a9ff'
  tertiary: '#fff5de'
  on-tertiary: '#3b2f00'
  tertiary-container: '#fed639'
  on-tertiary-container: '#715d00'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#7df4ff'
  primary-fixed-dim: '#00dbe9'
  on-primary-fixed: '#002022'
  on-primary-fixed-variant: '#004f54'
  secondary-fixed: '#f0dbff'
  secondary-fixed-dim: '#ddb7ff'
  on-secondary-fixed: '#2c0051'
  on-secondary-fixed-variant: '#6900b3'
  tertiary-fixed: '#ffe179'
  tertiary-fixed-dim: '#eac324'
  on-tertiary-fixed: '#231b00'
  on-tertiary-fixed-variant: '#554500'
  background: '#131314'
  on-background: '#e5e2e3'
  surface-variant: '#353436'
typography:
  display-lg:
    fontFamily: Hanken Grotesk
    fontSize: 48px
    fontWeight: '600'
    lineHeight: 56px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Hanken Grotesk
    fontSize: 32px
    fontWeight: '500'
    lineHeight: 40px
    letterSpacing: -0.01em
  headline-lg-mobile:
    fontFamily: Hanken Grotesk
    fontSize: 28px
    fontWeight: '500'
    lineHeight: 36px
  body-xl:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '400'
    lineHeight: 32px
    letterSpacing: 0.01em
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  label-caps:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.1em
rounded:
  sm: 0.5rem
  DEFAULT: 1rem
  md: 1.5rem
  lg: 2rem
  xl: 3rem
  full: 9999px
spacing:
  safe-margin: 24px
  gutter: 16px
  stack-sm: 8px
  stack-md: 24px
  stack-lg: 48px
  container-padding: 20px
---

## Brand & Style

The design system is centered on a **Premium Minimalist / Futuristic** aesthetic, intentionally moving away from the crowded, high-density interfaces of legacy voice assistants. It evokes a sense of calm, precision, and hyper-intelligence through a "less is more" philosophy. 

The visual narrative is built on **translucent layers** and **expansive whitespace**, creating a feeling of digital air. Instead of physical metaphors, the UI uses light and ethereal blurs to suggest depth. The personality is personal and unobtrusive, acting as a sophisticated companion rather than a tool. 

Key stylistic pillars include:
- **Quiet Luxury:** High-quality typography and restricted color usage.
- **Dynamic Presence:** The interface feels alive through soft glowing orbs and subtle motion.
- **Glassmorphism:** Elements appear as frosted lenses over a deep void.

## Colors

The palette is rooted in an **Obsidian** base to minimize eye strain and maximize the impact of the glowing accent. 

- **The Void (#0A0A0B):** The primary background color, representing the deep space of the AI's mind.
- **Ethereal Accents:** Electric Cyan is the primary indicator of active intelligence and "listening" states. Ethereal Violet is reserved for deep processing or "memory" states.
- **Translucent Grays:** Used for container surfaces to maintain a sense of hierarchy without breaking the dark aesthetic.
- **Pure White:** Used strictly for primary text and high-contrast iconography.

## Typography

This design system prioritizes legibility and "breathing room." **Hanken Grotesk** provides a sharp, contemporary edge for headlines, while **Inter** ensures that long-form AI responses are effortless to read.

A signature element of the system is the **generous tracking** (letter spacing) on body text and labels, which reinforces the premium, airy feel. Conversations do not use bubbles; instead, they rely on typographic weight and alignment to distinguish between the user and the assistant. Use `body-xl` for primary dialogue to create an intimate, readable experience.

## Layout & Spacing

The layout follows a **Fluid Mobile Grid** with high internal breathing room. 

- **Margins:** A strict 24px side margin ensures content never feels cramped against the device edges.
- **Vertical Rhythm:** Use large 48px gaps between major functional groups (e.g., the Orb and the conversation cards).
- **Alignment:** Conversation text is typically centered or left-aligned with significant leading to emphasize a "typography-first" approach.
- **Gestural Zone:** The bottom 80px of the screen is reserved for gesture-based navigation, keeping the area clear of buttons to allow for natural thumb swipes.

## Elevation & Depth

Depth is communicated through **translucency (glassmorphism)** rather than traditional drop shadows.

- **Surface Layers:** Surfaces use a background blur (20px–40px) and a semi-transparent fill (e.g., White at 5% opacity).
- **Inner Glows:** Instead of outer shadows, use subtle 1px inner borders (strokes) with a 10% white opacity to define the edges of cards against the obsidian background.
- **Active States:** The "Jarvis Orb" utilizes a multi-layered radial gradient with a soft outer glow (bloom effect) to appear as if it is projecting light onto the UI.

## Shapes

The shape language is **ultra-organic and soft**. 

- **Cards:** All contextual cards must use a minimum corner radius of 24px.
- **Interactive Elements:** Buttons and input fields use a pill-shape (fully rounded) to contrast against the rectangular screen edges.
- **The Orb:** A perfect circle, serving as the focal point of the identity. It should never have sharp edges, even during animation phases.

## Components

### Ambient 'Jarvis' Orb
The central interaction point. It is a 120px–180px circular gradient. It pulses slowly when idle, expands and glows intensely when listening, and "vibrates" with liquid-like motion when speaking.

### Contextual Cards
Translucent containers for data (weather, calendar, search results). They feature 24px corners, a subtle 1px border, and no heavy drop shadows. Content inside cards should follow the same high-whitespace rules.

### Typography-First Conversation
Ditch the chat bubbles. User input is displayed in `body-xl` (White). Assistant responses are displayed in `body-xl` (Cyan tint or White) with slightly more line height. Use simple metadata labels (e.g., "JARVIS") in `label-caps` above the text.

### Inputs & Fields
Input fields are "ghost" style—transparent backgrounds with a thin 1px border that glows Cyan when focused. Icons within inputs should be thin-stroke (1.5pt) to match the futuristic aesthetic.

### Gesture Navigation
A single, horizontal bar (40px wide, 4px tall) at the bottom. Minimalist icons for "History" and "Settings" only appear when the user swipes up or interacts with the bottom zone.