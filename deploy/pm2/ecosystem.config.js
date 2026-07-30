module.exports = {
  apps: [
    {
      name: "frontend",
      cwd: "./apps/frontend",
      script: "node_modules/.bin/next",
      args: "start -p 3000",
      interpreter: "node",
      env: {
        NODE_ENV: "production",
        PORT: "3000",
      },
    },
    {
      name: "http-backend",
      cwd: "./apps/http-backend",
      interpreter: "bun",
      script: "dist/index.js",
      env: {
        NODE_ENV: "production",
      },
    },
    {
      name: "ws-backend",
      cwd: "./apps/ws-backend",
      interpreter: "bun",
      script: "dist/index.js",
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
