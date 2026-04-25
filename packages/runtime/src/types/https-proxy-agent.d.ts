declare module 'https-proxy-agent' {
  import { Agent } from 'http';

  interface HttpsProxyAgentOptions {
    host: string;
    port: number | string;
    secureProxy?: boolean;
    headers?: Record<string, string>;
  }

  class HttpsProxyAgent extends Agent {
    constructor(proxy: string | URL, opts?: HttpsProxyAgentOptions);
    proxy: URL;
  }

  export { HttpsProxyAgent };
}
