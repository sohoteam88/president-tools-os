module.exports = {
  apps: [
    {
      name: "president-tools-web",
      script: "node_modules/.bin/next",
      args: "start",
      cwd: "/var/www/president-tools/staging",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
      },
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "800M",
    },
    {
      name: "transcription-worker",
      script: "node_modules/.bin/tsx",
      args: "jobs/workers/transcription.worker.ts",
      cwd: "/var/www/president-tools/staging",
      env: {
        NODE_ENV: "production",
      },
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "300M",
      // Worker requires REDIS_URL and REDIS_TOKEN in .env.local.
      // If REDIS_TOKEN is not set the worker will start but
      // dequeue operations will fail gracefully and retry.
    },
  ],
};
