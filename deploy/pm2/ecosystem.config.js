module.exports = {
  apps: [
    {
      name: "frontend",
      cwd: "./apps/frontend",
      interpreter: "bun",
      script: "next",
      args: "start -p 3000",
      env: {
        NODE_ENV: "production",
        PORT: "3000",
      },
    },
    {
      name: "http-backend",
      cwd: "./apps/http-backend",
      interpreter: "bun",
      script: "index.ts",
      env: {
        NODE_ENV: "production",
      },
    },
    {
      name: "ws-backend",
      cwd: "./apps/ws-backend",
      interpreter: "bun",
      script: "index.ts",
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
