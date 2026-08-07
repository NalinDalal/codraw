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

export {};
