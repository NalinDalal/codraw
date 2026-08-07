/// <reference types="bun-types" />

declare module "bun" {
  interface JWT {
    sign(payload: any, secret: string, algorithm: string): string;
    verify(token: string, secret: string, algorithm: string): any;
  }
  const jwt: JWT;

  interface Password {
    verify(hashed: string, plain: string): Promise<boolean>;
  }
  const password: Password;

  function exit(code: number): never;
  function on(event: string, handler: (...args: any[]) => void): void;
}

interface ServerWebSocket<T = undefined> {
  send(data: string | BufferSource, compress?: boolean): number;
  sendText(data: string, compress?: boolean): number;
  sendBinary(data: BufferSource, compress?: boolean): number;
  ping(data?: string | BufferSource): number;
  pong(data?: string | BufferSource): number;
  close(code?: number, reason?: string): void;
}

export {};
