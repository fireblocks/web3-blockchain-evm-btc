"use strict";
/**
 * Token Standard Registry
 *
 * This file re-exports from the auto-generated registry.
 * Token standards are automatically discovered from the chains/ directory structure.
 *
 * To add a new token standard:
 * 1. Create the standard implementation in src/chains/<blockchain>/tokenStandards/<standard>.ts
 * 2. Export it from src/chains/<blockchain>/index.ts
 * 3. Run `pnpm run generate:registry` to regenerate the registry
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
__exportStar(require("./tokenStandardRegistry.generated"), exports);
