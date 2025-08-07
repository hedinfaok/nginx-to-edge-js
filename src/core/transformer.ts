import { NginxConfig, ServerBlock, LocationBlock, UpstreamBlock, ListenDirective, LocationDirectives } from './config-model';

// Type for raw UCL data structure
type RawUCLConfig = Record<string, unknown>;

export class ConfigTransformer {
  /**
   * Transform raw UCL object to structured nginx configuration
   */
  transformUCLToNginx(rawConfig: RawUCLConfig): NginxConfig {
    const config: NginxConfig = {
      servers: [],
      upstreams: [],
      global: {}
    };

    // Process the raw UCL object
    if (rawConfig.server) {
      config.servers = this.processServers(rawConfig.server);
    }

    if (rawConfig.upstream) {
      config.upstreams = this.processUpstreams(rawConfig.upstream);
    }

    // Process global directives
    config.global = this.processGlobalDirectives(rawConfig);

    return config;
  }

  private processServers(serversData: any): ServerBlock[] {
    if (!Array.isArray(serversData)) {
      serversData = [serversData];
    }

    return serversData.map((serverData: any) => this.processServer(serverData));
  }

  private processServer(serverData: any): ServerBlock {
    const server: ServerBlock = {
      listen: [],
      locations: []
    };

    // Process listen directives
    if (serverData.listen) {
      server.listen = this.processListenDirectives(serverData.listen);
    }

    // Process server_name
    if (serverData.server_name) {
      server.server_name = Array.isArray(serverData.server_name) 
        ? serverData.server_name 
        : [serverData.server_name];
    }

    // Process SSL configuration
    if (serverData.ssl_certificate || serverData.ssl_certificate_key) {
      server.ssl = {
        certificate: serverData.ssl_certificate,
        certificate_key: serverData.ssl_certificate_key,
        protocols: serverData.ssl_protocols ? serverData.ssl_protocols.split(' ') : undefined,
        ciphers: serverData.ssl_ciphers,
        prefer_server_ciphers: serverData.ssl_prefer_server_ciphers === 'on'
      };
    }

    // Process location blocks
    if (serverData.location) {
      server.locations = this.processLocations(serverData.location);
    }

    // Process other server directives
    server.directives = this.extractOtherDirectives(serverData, [
      'listen', 'server_name', 'location', 'ssl_certificate', 'ssl_certificate_key',
      'ssl_protocols', 'ssl_ciphers', 'ssl_prefer_server_ciphers'
    ]);

    return server;
  }

  private processListenDirectives(listenData: any): ListenDirective[] {
    if (!Array.isArray(listenData)) {
      listenData = [listenData];
    }

    return listenData.map((listen: any) => {
      if (typeof listen === 'string' || typeof listen === 'number') {
        return { port: parseInt(listen.toString(), 10) };
      }

      const directive: ListenDirective = {
        port: listen.port || 80
      };

      if (listen.host) directive.host = listen.host;
      if (listen.ssl) directive.ssl = listen.ssl === 'ssl' || listen.ssl === true;
      if (listen.http2) directive.http2 = listen.http2 === 'http2' || listen.http2 === true;
      if (listen.default_server) directive.default_server = true;

      return directive;
    });
  }

  private processLocations(locationsData: any): LocationBlock[] {
    if (!Array.isArray(locationsData)) {
      locationsData = [locationsData];
    }

    return locationsData.map((locationData: any) => this.processLocation(locationData));
  }

  private processLocation(locationData: any): LocationBlock {
    const location: LocationBlock = {
      path: locationData.path || '/',
      directives: {}
    };

    if (locationData.modifier) {
      location.modifier = locationData.modifier as any;
    }

    // Process location directives
    location.directives = this.processLocationDirectives(locationData);

    return location;
  }

  private processLocationDirectives(locationData: any): LocationDirectives {
    const directives: LocationDirectives = {};

    // Process common location directives
    if (locationData.proxy_pass) {
      directives.proxy_pass = locationData.proxy_pass;
    }

    if (locationData.root) {
      directives.root = locationData.root;
    }

    if (locationData.index) {
      directives.index = locationData.index;
    }

    // Process rewrite directives
    if (locationData.rewrite) {
      directives.rewrite = this.processRewriteRules(locationData.rewrite);
    }

    // Process return directive
    if (locationData.return) {
      directives.return = this.processReturnDirective(locationData.return);
    }

    // Process headers
    if (locationData.add_header) {
      directives.add_header = this.processHeaders(locationData.add_header);
    }

    if (locationData.proxy_set_header) {
      directives.proxy_set_header = this.processHeaders(locationData.proxy_set_header);
    }

    // Process other directives
    const excludedKeys = [
      'path', 'modifier', 'proxy_pass', 'root', 'index', 'rewrite', 'return',
      'add_header', 'proxy_set_header'
    ];

    Object.keys(locationData).forEach(key => {
      if (!excludedKeys.includes(key)) {
        directives[key] = locationData[key];
      }
    });

    return directives;
  }

  private processRewriteRules(rewriteData: any): any[] {
    if (!Array.isArray(rewriteData)) {
      rewriteData = [rewriteData];
    }

    return rewriteData.map((rule: any) => {
      if (typeof rule === 'string') {
        const parts = rule.split(/\s+/);
        return {
          regex: parts[0],
          replacement: parts[1],
          flags: parts.slice(2)
        };
      }
      return rule;
    });
  }

  private processReturnDirective(returnData: any): any {
    if (typeof returnData === 'string') {
      const parts = returnData.split(/\s+/, 2);
      const code = parseInt(parts[0], 10);
      const url = parts[1];
      
      return {
        code,
        url: url || undefined
      };
    }
    return returnData;
  }

  private processHeaders(headerData: any): Record<string, string> {
    if (typeof headerData === 'string') {
      // Parse "Header-Name value" format
      const parts = headerData.split(/\s+/, 2);
      return { [parts[0]]: parts[1] || '' };
    }

    if (Array.isArray(headerData)) {
      const headers: Record<string, string> = {};
      headerData.forEach((header: string) => {
        const parts = header.split(/\s+/, 2);
        headers[parts[0]] = parts[1] || '';
      });
      return headers;
    }

    return headerData || {};
  }

  private processUpstreams(upstreamsData: any): UpstreamBlock[] {
    // Handle the case where upstreamsData is an object with upstream names as keys
    if (upstreamsData && typeof upstreamsData === 'object' && !Array.isArray(upstreamsData)) {
      return Object.keys(upstreamsData).map(upstreamName => ({
        name: upstreamName,
        servers: this.processUpstreamServers(upstreamsData[upstreamName].server || []),
        method: upstreamsData[upstreamName].method || 'round_robin',
        directives: this.extractOtherDirectives(upstreamsData[upstreamName], ['name', 'server', 'method'])
      }));
    }
    
    if (!Array.isArray(upstreamsData)) {
      upstreamsData = [upstreamsData];
    }

    return upstreamsData.map((upstreamData: any) => ({
      name: upstreamData.name || 'unnamed',
      servers: this.processUpstreamServers(upstreamData.server || []),
      method: upstreamData.method || 'round_robin',
      directives: this.extractOtherDirectives(upstreamData, ['name', 'server', 'method'])
    }));
  }

  private processUpstreamServers(serversData: any): any[] {
    if (!Array.isArray(serversData)) {
      serversData = [serversData];
    }

    return serversData.map((serverData: any) => {
      if (typeof serverData === 'string') {
        const [address, port] = serverData.split(':');
        return {
          address,
          port: port ? parseInt(port, 10) : undefined
        };
      }
      return serverData;
    });
  }

  private processGlobalDirectives(rawConfig: any): Record<string, any> {
    const global: Record<string, any> = {};
    
    // List of known global directives
    const globalDirectives = [
      'worker_processes', 'worker_connections', 'sendfile', 'tcp_nopush',
      'tcp_nodelay', 'keepalive_timeout', 'gzip', 'gzip_comp_level',
      'gzip_types', 'client_max_body_size'
    ];

    globalDirectives.forEach(directive => {
      if (rawConfig[directive] !== undefined) {
        global[directive] = rawConfig[directive];
      }
    });

    return global;
  }

  private extractOtherDirectives(data: any, excludeKeys: string[]): Record<string, any> | undefined {
    const directives: Record<string, any> = {};
    
    Object.keys(data).forEach(key => {
      if (!excludeKeys.includes(key)) {
        directives[key] = data[key];
      }
    });

    return Object.keys(directives).length > 0 ? directives : undefined;
  }
}
