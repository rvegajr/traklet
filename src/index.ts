/**
 * Traklet - Backend-agnostic issue tracking widget
 * Main entry point
 */

// Export contracts (interfaces)
export * from './contracts';

// Export models
export * from './models';

// Export core managers
export * from './core';

// Export adapters
export * from './adapters';

// Export presenters
export * from './presenters';

// Export builder (wizard-driven configuration)
export * from './builder';

// Export main orchestrator
export { Traklet } from './Traklet';

// Version
export const VERSION = '0.1.0';
