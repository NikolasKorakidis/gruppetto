// Extends app.json. EXPO_BASE_URL lets the web build live under a sub-path,
// e.g. GitHub Pages at https://<user>.github.io/gruppetto (see .github/workflows).
module.exports = ({ config }) => ({
  ...config,
  experiments: {
    ...config.experiments,
    ...(process.env.EXPO_BASE_URL ? { baseUrl: process.env.EXPO_BASE_URL } : {}),
  },
});
