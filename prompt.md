Title: “God’s Hand” – Real-Time 3D Particle Universe with Gesture Control (Three.js)

Goal:
Create a real-time, interactive 3D particle system in Three.js called **“God’s Hand”**, where the user controls particles with **bare-hand gestures** captured from the camera. The system should feature **modern, cinematic particle design**, **real-world-inspired physics** (gravity, inertia, centrifugal force, collisions), and **gesture-based creation and destruction of planets**.

Core Requirements:

1. Tech Stack & Performance
- Use **Three.js** + **WebGL2** for rendering.
- Use **GPU-accelerated particles** (e.g., shader-based / instanced meshes / points with custom shaders) to support **tens of thousands** of particles at 60 FPS where possible.
- Structure the code in a clean, modular way (e.g., `SceneManager`, `ParticleSystem`, `GestureController`, `UIController`).

2. Real-World Physics Simulation
- Implement a **basic but believable physics engine** for the particles:
  - Gravity (global gravitational acceleration; later extensible to planetary gravity wells).
  - Inertia (particles keep moving unless influenced by forces).
  - Centrifugal / centripetal effects when particles orbit a center (e.g., planets).
  - Elastic and/or inelastic **particle collisions** with:
    - Energy transfer
    - Optional bounce or merging
  - Adjustable parameters: mass, velocity, drag, gravity strength, and force falloff (e.g., inverse-square).
- Make physics **tunable via config** so we can tweak realism vs. visual appeal.

3. Hand Tracking & Gesture Control (via Camera)
- Integrate **real-time hand tracking** using a webcam (you can assume using something like MediaPipe Hands, TensorFlow.js, or any common browser-based hand-tracking framework).
- Track at least:
  - The position of both hands in normalized screen/world coordinates.
  - The distance and relative orientation between the hands.
  - Basic gestures: open palm, closed fist, hands approaching, hands forming a circle.

4. Particle Control with Hands (“God’s Hand” Concept)
- The user’s hands act like **fields of force** on the particles:
  - When hands move apart, the main particle group **expands / scales up**.
  - When hands move closer together, the particle group **compresses / condenses**.
- Use **hand tension/closure**:
  - Open hands → gentle influence, particles flow smoothly.
  - Closed fists → stronger gravity/attraction or compression.
- Particles should respond in **real time** with smooth interpolation and no jittery movement.

5. Special Gestures & Events
- **Circle Gesture → Create Planet:**
  - Detect when both hands form a rough circle/loop in camera view (e.g., distance and angle between fingers/hand centers suggest a ring).
  - When a circle gesture is held for a short threshold time:
    - Aggregate nearby particles into a **spherical planet**.
    - Animate particles spiraling in and forming a dense, glowing sphere.
    - Give the planet:
      - A simple orbiting behavior
      - Gravity that influences nearby particles
    - Optionally add a subtle **ring** (like Saturn) if a “Saturn template” is chosen.
- **Collapse Gesture → Explosion:**
  - When both hands **suddenly collapse** toward each other (fast movement + small distance):
    - Trigger a **shockwave/explosion** event:
      - All or selected particles rapidly fly outward with high velocity.
      - Apply radial force, fading out over distance and time.
      - Add visual effects: glow, bloom, flicker, and color shift.
- Ensure that the gesture recognition has:
  - Basic **debouncing** and thresholds to avoid accidental triggers.
  - Visual feedback (small icons/indicators) when a gesture is recognized.

6. Particle Visual Design (Modern & Cool)
- Style:
  - Minimalist, **modern**, and **cinematic** aesthetic.
  - Use **soft glows, bloom, depth of field**, and subtle motion blur if possible.
- Particle appearance:
  - Use **shader materials** for particles with:
    - Size attenuation based on depth.
    - Soft, glowing edges.
    - Optional additive blending for light-like effects.
- Support **multiple visual templates** selectable via a UI panel:
  - Hearts: particles form a heart shape or emit from a heart-shaped emitter.
  - Flowers: petal-like formations, flower silhouettes.
  - Saturn: ringed planet template with orbiting ring particles.
  - Buddha Statues: particles outline or “sculpt” a Buddha silhouette.
  - Fireworks: burst patterns, trails, and fading sparks.
- Templates should:
  - Define initial positions, emitters, and animation behavior.
  - Still be **influenced by physics and hand gestures**.

7. Color & Appearance Controls
- Provide a **color picker UI**:
  - Adjust base particle color.
  - Optionally adjust:
    - Highlight/glow color
    - Background gradient or space-like backdrop
- Allow quick preset themes: e.g., “Cosmic Blue”, “Solar Gold”, “Neon Pink”, “Zen White”.

8. User Interface (Simple & Modern)
- UI Requirements:
  - Clean, minimal sidebar or top bar.
  - Controls:
    - Template selector (hearts / flowers / Saturn / Buddha / fireworks / default).
    - Color picker for particle color.
    - Toggles/sliders for:
      - Gravity strength
      - Particle count
      - Collision on/off
      - Explosion intensity
  - Use simple icons and labels, flat design, spacing, and smooth transitions.
- The main canvas should dominate the screen; UI should never clutter the view.

9. Interaction & Feedback
- Always show:
  - Subtle marker/ghost for **detected hand positions** (e.g., small circles or tracers).
  - Optional overlay hint text like “Form a circle to create a planet” / “Collapse hands to trigger explosion”.
- Provide **smooth transitions**:
  - Interpolate physics parameters and visual states to avoid sudden jumps.
- Include basic **camera controls**:
  - OrbitControls or custom:
    - Rotate around the scene
    - Zoom in/out
    - Reset view

10. Code Quality & Extensibility
- Organize the code for readability:
  - Clear separation of:
    - Rendering (Three.js scene, camera, renderer)
    - Physics update loop
    - Gesture recognition
    - UI controls
  - Comment critical sections explaining:
    - Physics model
    - Gesture thresholds
    - Shader logic for particles
- Design the system so new templates, gestures, and particle behaviors can be easily added.

Deliverables:
- A complete Three.js implementation (with pseudocode or real code) demonstrating:
  - Hand-tracked particle control
  - Circle gesture → planet creation
  - Collapse gesture → explosion
  - Multiple visual templates
  - Real-time color and parameter adjustment
- Instructions or brief notes on any external libraries used for hand tracking or UI.