# Design System Strategy: The Orchestration Ether

## 1. Overview & Creative North Star
**Creative North Star: "The Neon Observatory"**

This design system moves away from the cluttered, "boxy" feel of legacy developer tools. Instead, it treats the AI agent orchestration space as a high-fidelity observatory—a place of absolute clarity, depth, and precision. We are building a "Powerful IDE for AI," which requires a balance between dense information and breathable, premium aesthetics. 

The visual soul of this system lies in **Atmospheric Depth**. By rejecting traditional borders and harsh dividers, we create an environment where logic flows through "ether" rather than rigid containers. We utilize intentional asymmetry in the sidebar layouts and overlapping canvas elements to ensure the platform feels like a bespoke instrument, not a generic SaaS template.

---

## 2. Colors & Surface Philosophy
The palette is rooted in a deep, nocturnal foundation, allowing the vibrant node accents to act as functional "light sources" within the interface.

### The "No-Line" Rule
**Borders are prohibited for sectioning.** To define the transition from the Navigation Rail to the Canvas or the Inspector Panel, use background color shifts only. 
- Use `surface` (#0b1326) for the main application background.
- Use `surface-container-low` (#131b2e) for the Canvas area.
- Use `surface-container-high` (#222a3d) for persistent side panels.
This creates a natural "carved" look rather than a "sketched" look.

### Surface Hierarchy & Nesting
Depth is achieved through the physical stacking of tones:
1.  **Level 0 (Base):** `surface` - The vastness of the workspace.
2.  **Level 1 (Panels):** `surface-container` - Integrated functional areas.
3.  **Level 2 (Active Elements):** `surface-container-highest` - Modals or active node inspectors.

### The "Glass & Gradient" Rule
Floating elements (like node context menus or floating action buttons) must use **Glassmorphism**. Combine `surface-variant` (#2d3449) at 60% opacity with a `backdrop-blur` of 12px. 
For primary actions, apply a subtle linear gradient: `primary-container` (#2243ea) to `primary` (#bbc3ff) at a 135-degree angle. This provides a "glow" that feels powered by the underlying AI logic.

---

## 3. Typography
The typography system pairs the technical precision of **Inter** with the editorial authority of **Space Grotesk**.

*   **Display & Headlines (Space Grotesk):** Used for high-level dashboard metrics and flow titles. Space Grotesk’s geometric quirks evoke a high-tech, futuristic feel.
*   **Body & Labels (Inter):** The workhorse. Used for node configurations, code snippets, and metadata. Inter provides maximum legibility at small scales (e.g., `label-sm`).

**Hierarchy Strategy:**
Use `headline-sm` for panel titles to command attention, but keep node titles at `title-sm` with a `medium` weight to maintain a clean canvas. Use `on-surface-variant` (#c5c5d4) for secondary metadata to create a clear visual "quietness" around the active code logic.

---

## 4. Elevation & Depth
We eschew the "drop shadow" of the early web. Our depth is ambient and tonal.

*   **The Layering Principle:** A "Worker Node" card does not sit *on* the canvas; it is *part* of the canvas. Achieve lift by placing a `surface-container-highest` node on a `surface-container-low` grid.
*   **Ambient Shadows:** For floating dialogs, use an ultra-diffused shadow: `0 20px 40px rgba(6, 14, 32, 0.4)`. The shadow is a darker tint of our background, making it feel like a natural occlusion of light.
*   **The "Ghost Border" Fallback:** If a node requires a boundary for accessibility (e.g., a selected state), use the `outline-variant` (#454652) at **20% opacity**. It should be a whisper of a line, never a shout.

---

## 5. Components

### The Orchestration Node (The Signature Component)
Nodes are the heart of the system. They should not have a 1px border. 
- **Body:** `surface-container-highest` (#2d3449).
- **Header Accent:** A 4px left-hand vertical "status bar" using the functional colors:
    - **Worker:** `secondary` (#4edea3)
    - **Logic:** `tertiary` (#ffb95f)
    - **Control:** `primary` (#bbc3ff)
- **Active State:** Instead of a border, add a 4px outer "aura" (glow) using the `surface-tint` color.

### Buttons
- **Primary:** `primary-container` background, `on-primary-container` text. Roundedness: `md` (0.375rem).
- **Secondary:** Ghost style. No background, `outline` color for text. On hover, transition to `surface-container-highest`.
- **Tertiary/Icon:** `surface-bright` (#31394d) with 0.5 opacity.

### Inputs & Code Editors
- **Fields:** Use `surface-container-lowest` (#060e20) for input backgrounds to create a "sunken" feel, suggesting data entry. 
- **Focus State:** The label shifts to `primary` (#bbc3ff), and the "Ghost Border" increases to 40% opacity.

### Canvas Grid
The background grid should use `outline-variant` (#454652) at **10% opacity**. Use dots instead of lines to maintain an open, airy feel that doesn't compete with the node connections.

---

## 6. Do's and Don'ts

### Do:
*   **Use Asymmetric Padding:** When designing the inspector panel, use `spacing-8` for the top padding and `spacing-5` for the sides to create an editorial, high-end feel.
*   **Embrace Negative Space:** Allow the nodes to "breathe" on the canvas. Use the `spacing-20` scale for default node separation.
*   **Leverage Tonal Transitions:** Use `surface-dim` for inactive states and `surface-bright` for hover states.

### Don't:
*   **No Pure Black:** Never use `#000000`. It kills the depth of the "Ether" aesthetic. Stick to `surface-container-lowest`.
*   **No High-Contrast Dividers:** Never use a 100% opaque `outline` color to separate list items. Use vertical white space (`spacing-3`) or a subtle background shift.
*   **No Standard Shadows:** Avoid the default "Material Design" shadows. They feel too "utility-app." Stick to our ambient, low-opacity layered approach.