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
  ],
};
