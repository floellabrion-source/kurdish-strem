module.exports = {
  apps: [
    {
      name: "kurdish-stream-api",
      script: "index.js",
      cwd: __dirname,
      instances: "max",
      exec_mode: "cluster",
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "production",
        PORT: 3001
      }
    }
  ]
};
