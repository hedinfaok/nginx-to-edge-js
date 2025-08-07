// Main exports for the nginx-to-edge-js library
export { NginxParser } from './parser/nginx-parser';
export { ConfigTransformer } from './core/transformer';
export { BaseGenerator } from './generators/base-generator';
export { CloudFlareGenerator } from './generators/cloudflare';
export { NextJSGenerator } from './generators/nextjs-middleware';

// Export types
export type {
  NginxConfig,
  ParsedNginxConfig,
  ServerBlock,
  LocationBlock,
  UpstreamBlock,
  ListenDirective,
  LocationDirectives,
  RewriteRule,
  ReturnDirective,
  SSLConfig,
  UpstreamServer,
  GlobalDirectives,
  LocationModifier,
  LoadBalancingMethod,
  RewriteFlag
} from './core/config-model';
