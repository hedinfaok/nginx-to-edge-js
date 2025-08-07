/**
 * Core configuration model representing the unified structure
 * that nginx configurations are transformed into before being
 * converted to edge server formats.
 */

export interface NginxConfig {
  servers: ServerBlock[];
  upstreams?: UpstreamBlock[];
  global?: GlobalDirectives;
}

export interface ServerBlock {
  listen: ListenDirective[];
  server_name?: string[];
  ssl?: SSLConfig;
  locations: LocationBlock[];
  directives?: Record<string, string | number | boolean | string[]>;
}

export interface ListenDirective {
  port: number;
  host?: string;
  ssl?: boolean;
  http2?: boolean;
  default_server?: boolean;
}

export interface SSLConfig {
  certificate?: string;
  certificate_key?: string;
  protocols?: string[];
  ciphers?: string;
  prefer_server_ciphers?: boolean;
}

export interface LocationBlock {
  path: string;
  modifier?: LocationModifier;
  directives: LocationDirectives;
}

export type LocationModifier = '=' | '~' | '~*' | '^~';

export interface LocationDirectives {
  proxy_pass?: string;
  root?: string;
  index?: string;
  rewrite?: RewriteRule[];
  return?: ReturnDirective;
  add_header?: Record<string, string>;
  proxy_set_header?: Record<string, string>;
  expires?: string;
  try_files?: string[];
  alias?: string;
  deny?: string[];
  allow?: string[];
  [key: string]: string | number | boolean | string[] | RewriteRule[] | ReturnDirective | Record<string, string> | undefined;
}

export interface RewriteRule {
  regex: string;
  replacement: string;
  flags?: RewriteFlag[];
}

export type RewriteFlag = 'last' | 'break' | 'redirect' | 'permanent';

export interface ReturnDirective {
  code: number;
  url?: string;
  text?: string;
}

export interface UpstreamBlock {
  name: string;
  servers: UpstreamServer[];
  method?: LoadBalancingMethod;
  directives?: Record<string, string | number | boolean>;
}

export interface UpstreamServer {
  address: string;
  port?: number;
  weight?: number;
  max_fails?: number;
  fail_timeout?: string;
  backup?: boolean;
  down?: boolean;
}

export type LoadBalancingMethod = 'round_robin' | 'least_conn' | 'ip_hash' | 'hash' | 'random';

export interface GlobalDirectives {
  worker_processes?: number | 'auto';
  worker_connections?: number;
  sendfile?: boolean;
  tcp_nopush?: boolean;
  tcp_nodelay?: boolean;
  keepalive_timeout?: number;
  gzip?: boolean;
  gzip_comp_level?: number;
  gzip_types?: string[];
  client_max_body_size?: string;
  [key: string]: string | number | boolean | string[] | undefined;
}

export interface ParsedNginxConfig extends NginxConfig {
  metadata: {
    source_file?: string;
    parsed_at: Date;
    parser_version: string;
    warnings?: string[];
  };
}
