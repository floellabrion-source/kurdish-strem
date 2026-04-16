module.exports = {
  apps: [
    {
      name: "kurdish-stream-api",
      script: "index.js",
      cwd: __dirname,
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
        PORT: 3001
      }
    }
  ]
};
