module.exports = {
  apps: [
    {
      name: "avances-backend",
      script: "src/index.ts",
      interpreter: "bun",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
