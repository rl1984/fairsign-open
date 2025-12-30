# Design Guidelines: Internal E-Signature Service MVP

## Design Approach

**Selected System**: Material Design  
**Rationale**: This is a utility-focused, mobile-first application for document signing. Material Design provides robust patterns for document workflows, mobile interactions, and form-heavy interfaces while maintaining clarity and usability.

---

## Core Design Elements

### Typography

**Font Family**: Roboto (via Google Fonts CDN)

**Hierarchy**:
- Page titles: 24px, Medium (500)
- Section headers: 18px, Medium (500)
- Body text: 16px, Regular (400)
- Helper text/labels: 14px, Regular (400)
- Button text: 16px, Medium (500)

**Line Heights**: 1.5 for body text, 1.2 for headings

---

### Layout System

**Spacing Units**: Tailwind units of 2, 4, 6, and 8
- Component padding: p-4 or p-6
- Section margins: mb-6 or mb-8
- Element gaps: gap-4
- Page margins: px-4 (mobile), px-6 (tablet+)

**Container Strategy**:
- Mobile: Full width with px-4 padding
- Desktop: max-w-4xl centered for document viewing
- Signing canvas: max-w-2xl for optimal drawing area

---

## Component Library

### PDF Viewer Container
- Full-width scrollable container
- Sticky header with document title and progress indicator
- Shadow elevation (shadow-lg) to separate from background
- Border radius: rounded-lg on desktop, none on mobile

### Signature Spot Checklist
- Card-based list with rounded-lg borders
- Each spot displays: icon (checkmark/pending), spot label, action button
- Completed spots show success state with checkmark icon
- Pending spots show outlined state with "Sign" button
- Spacing: gap-4 between items, p-4 internal padding

### Canvas Signature Pad
- Full-width on mobile (100%), max-w-xl on desktop
- Aspect ratio: 3:2 for signature, 2:1 for initials
- Border: 2px solid with rounded-lg corners
- Clear "Clear" and "Save" action buttons below canvas
- Buttons: full-width on mobile (w-full gap-2), inline on desktop

### Navigation & Actions
- Fixed bottom bar on mobile with primary action button
- Floating on desktop: sticky top navigation
- Primary button: large touch target (h-12 minimum)
- Secondary actions: ghost buttons with icon+text

### Progress Indicator
- Linear progress bar showing completion status
- Display: "X of Y signatures completed"
- Position: top of screen, sticky on scroll

### Forms & Inputs
- Labels above inputs, 14px Medium
- Input fields: h-12 with p-4, border with focus ring
- Checkbox for e-sign consent: large touch target (24px minimum)
- Consistent rounded-md borders

### Status & Feedback
- Toast notifications for upload success/errors
- Inline validation messages below inputs
- Loading states: skeleton screens for PDF, spinner for uploads

### PDF Controls
- Floating toolbar with zoom in/out, page navigation
- Page counter: "Page X of Y"
- Icon buttons: 40px × 40px touch targets

---

## Signing Flow Layout

### Step 1: Document Review
- PDF viewer occupies 60% of viewport height (desktop) or full scroll area (mobile)
- Sidebar/bottom panel shows signature checklist
- "Begin Signing" CTA prominently placed

### Step 2: Signature Capture
- Modal overlay on desktop, full-screen on mobile
- Canvas centered with ample padding (p-8)
- Instructions above canvas: "Sign with your finger or stylus"
- Action buttons: Cancel (ghost) and Save (primary) with gap-4

### Step 3: Completion
- Confirmation screen with:
  - Summary of signed spots (checkmark list)
  - E-sign consent checkbox with legal text
  - "Complete Signing" primary button (disabled until consent checked)

---

## Mobile-First Considerations

**Touch Targets**: Minimum 44px height for all interactive elements  
**Spacing**: Increase tap-area padding - use p-6 instead of p-4 on mobile  
**Navigation**: Bottom-fixed action bar, avoiding header conflicts  
**Scrolling**: Natural scroll behavior, no fixed-height containers that trap content  
**Canvas**: Full-width drawing area with large "Clear" and "Save" buttons

---

## Accessibility

- Focus rings on all interactive elements (ring-2 ring-offset-2)
- ARIA labels for icon-only buttons
- High contrast ratios for text
- Keyboard navigation support
- Screen reader announcements for upload status

---

## Animations

Use sparingly:
- Fade-in for toast notifications (150ms)
- Smooth scroll to signature spots when selected
- Subtle scale transform on button press (scale-95)
- No decorative animations

---

## Icons

**Library**: Heroicons (via CDN)
- Check circle for completed signatures
- Pencil for signature actions
- X mark for clear/cancel
- Arrow path for loading states
- Document icon for PDF representation