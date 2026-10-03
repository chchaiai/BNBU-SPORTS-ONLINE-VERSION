# ElectricLogo

Adapted from the React Bits ElectricLogo source supplied by the user on 2026-10-02. Original project: https://github.com/DavidHDev/react-bits . License: REACT-BITS-LICENSE (MIT + Commons Clause). OGL 1.0.11: https://github.com/oframe/ogl . License: OGL-LICENSE (Unlicense).

Local ESM bundle: Renderer, Program, Mesh, Triangle, Texture. Registry SHA-512: sha512-kUpC154AFfxi16pmZUK4jk3J+8zxwTWGPo03EoYA8QPbzikHoaC82n6pNTbd+oEaJonaE8aPWBlX7ad9zrqLsA==

Adaptation: plain JavaScript lifecycle, shared 240px shape cache for small icons, 30fps cap, visibility pause, context-loss fallback, and light/dark appearance updates. The React shader and outline-tracing algorithm are retained. The source is the existing complete BNBU + SPORTS logo mask, with a silver static gradient. Reduced-motion users keep this static transparent mark without loading WebGL. Pointer and keyboard feedback follows the surrounding button even when the application replaces that button during rendering.
