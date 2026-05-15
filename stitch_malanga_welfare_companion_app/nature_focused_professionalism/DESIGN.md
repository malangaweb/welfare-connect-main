---
name: Nature-Focused Professionalism
colors:
  surface: '#f9f9ff'
  surface-dim: '#cfdaf2'
  surface-bright: '#f9f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f0f3ff'
  surface-container: '#e7eeff'
  surface-container-high: '#dee8ff'
  surface-container-highest: '#d8e3fb'
  on-surface: '#111c2d'
  on-surface-variant: '#434840'
  inverse-surface: '#263143'
  inverse-on-surface: '#ecf1ff'
  outline: '#73796f'
  outline-variant: '#c3c8bd'
  surface-tint: '#456641'
  primary: '#1b3a19'
  on-primary: '#ffffff'
  primary-container: '#31512e'
  on-primary-container: '#9ec396'
  inverse-primary: '#abd0a3'
  secondary: '#565e74'
  on-secondary: '#ffffff'
  secondary-container: '#dae2fd'
  on-secondary-container: '#5c647a'
  tertiary: '#4b2c00'
  on-tertiary: '#ffffff'
  tertiary-container: '#6a4000'
  on-tertiary-container: '#eaad64'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#c7edbe'
  primary-fixed-dim: '#abd0a3'
  on-primary-fixed: '#022105'
  on-primary-fixed-variant: '#2e4e2b'
  secondary-fixed: '#dae2fd'
  secondary-fixed-dim: '#bec6e0'
  on-secondary-fixed: '#131b2e'
  on-secondary-fixed-variant: '#3f465c'
  tertiary-fixed: '#ffddb9'
  tertiary-fixed-dim: '#f9ba70'
  on-tertiary-fixed: '#2b1700'
  on-tertiary-fixed-variant: '#663e00'
  background: '#f9f9ff'
  on-background: '#111c2d'
  surface-variant: '#d8e3fb'
typography:
  display-lg:
    fontFamily: Manrope
    fontSize: 40px
    fontWeight: '800'
    lineHeight: 48px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Manrope
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Manrope
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 32px
  title-lg:
    fontFamily: Manrope
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  body-lg:
    fontFamily: Manrope
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Manrope
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-lg:
    fontFamily: Manrope
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
    letterSpacing: 0.1px
  label-sm:
    fontFamily: Manrope
    fontSize: 11px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.5px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base_unit: 8px
  margin_edge: 24px
  gutter: 16px
  card_padding: 20px
  section_gap: 32px
---

## Brand & Style

The visual identity of this design system centers on a "Modern Organic" aesthetic. It bridges the gap between high-trust professional services and the nurturing essence of welfare work. The design language evokes a sense of calm, growth, and reliability, specifically tailored for a mobile-first experience where clarity and approachability are paramount.

The chosen style is **Corporate / Modern** with a focus on **Tactile** depth. While it follows the functional logic of Material 3, it softens the experience through an earth-toned palette, substantial corner radii, and gradient surfaces that mimic the natural diffusion of light. The interface should feel grounded and stable, avoiding the coldness of traditional enterprise software in favor of a warm, human-centric interface.

## Colors

The color strategy utilizes deep, desaturated greens and navies to establish authority, punctuated by Golden Amber for call-to-action elements. 

- **Primary Forest Green** serves as the anchor for headers and primary interactions.
- **Medium Sage** is used for decorative elements, icon backgrounds, and secondary accents.
- **Golden Amber** is reserved for high-importance highlights and secondary buttons to ensure they stand out against the cool background.
- **The Background** is not a flat white but a soft, vertical linear gradient that reduces eye strain and provides a premium, paper-like feel.
- **Status Colors** are slightly muted to remain harmonious with the nature-themed palette while maintaining high legibility and semantic clarity.

## Typography

This design system utilizes **Manrope** exclusively to maintain a modern, streamlined look. Manrope’s geometric yet friendly letterforms are highly legible on mobile screens and convey a sense of professional warmth.

- **Headlines:** Use heavy weights (700-800) with slight negative letter spacing to create a strong visual hierarchy.
- **Body Text:** Set at 16px for primary readability, using the 400 weight to ensure the interface feels airy and uncluttered.
- **Labels & Captions:** Use 500-600 weights to differentiate functional text from content, ensuring that even at small sizes, the text remains accessible.
- **Line Heights:** Generous line heights (1.4x to 1.5x) are applied to all body levels to improve the scanning experience during mobile usage.

## Layout & Spacing

The layout follows a **fluid grid** model tailored for mobile viewports, utilizing an 8px base scaling unit. This ensures all elements align to a consistent rhythmic cadence.

- **Margins:** A standard side margin of 24px is enforced to provide a spacious "breathable" frame around content.
- **Gutters:** 16px spacing between internal elements like grid cards or list items.
- **Structure:** Content is organized into clear vertical stacks. Hero elements should span the full width (minus margins), while supporting information should be grouped into cards to maintain a clean visual separation.

## Elevation & Depth

This design system uses **Ambient Shadows** and **Tonal Layers** to create depth without visual noise.

- **Surfaces:** Use tinted shadows (hex `#0F172A` at 8-12% opacity) instead of pure black to keep the shadows "soft" and integrated with the background.
- **Hero Cards:** Use a subtle gradient (Deep Forest Green to Medium Sage) with a larger shadow spread to denote high priority.
- **Standard Cards:** Use a flat background color (White or very light Slate) with a low-elevation shadow (4px-8px blur) to suggest interactivity.
- **Modals & Overlays:** Use a backdrop blur (12px-20px) to maintain context while focusing the user's attention on the foreground task.

## Shapes

The shape language is defined by a "High Radii" approach, moving away from sharp edges to create a friendly and approachable feel.

- **Base Components:** Standard components like input fields and small buttons use a 16px radius.
- **Cards & Containers:** Prominent containers use a 24px radius to create a distinct, nested look.
- **Hero Elements:** Large top-level cards or bottom sheets utilize a 30px radius for a premium, modern mobile appearance.
- **Icons:** Should follow a rounded cap and corner style to match the UI's softness.

## Components

### Buttons
- **Primary:** Forest Green background, White text, 16px rounded corners. Heavy weight typography.
- **Secondary:** Transparent background with Sage borders or Golden Amber background for urgent actions.
- **Ghost:** No background, Navy Slate text for low-emphasis actions like "Cancel."

### Cards
- **Gradient Hero:** Linear gradient from #31512E to #628A49. Used for dashboard summaries or featured welfare programs.
- **Information Card:** Solid white background, subtle 1px border (#E9EEF5), 24px radius.

### Input Fields
- Filled style with a light Slate Navy tint at 5% opacity. 
- 16px rounded corners.
- Bottom-border only when focused, using the Forest Green color.

### Chips & Badges
- **Status Chips:** Small, pill-shaped (full rounding) with 10% opacity backgrounds of the status color and 100% opacity text.
- **Category Chips:** Sage Green background with white text for active states; Slate Blue for inactive.

### Lists
- Grouped list style with subtle dividers that do not touch the screen edges. 
- Large leading icons inside circular containers (Medium Sage tint).

### Navigation
- **Bottom Bar:** Blur background effect with active icons in Forest Green and a Golden Amber dot indicator for the current page.