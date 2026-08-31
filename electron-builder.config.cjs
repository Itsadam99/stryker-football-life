const packageJson = require("./package.json");

const configuredUrl = String(process.env.STRYKER_UPDATE_URL || "").trim().replace(/\/+$/, "");
const updateUrl = configuredUrl || "https://updates.stryker.invalid/windows";

module.exports = {
  ...packageJson.build,
  publish: [
    {
      provider: "generic",
      url: updateUrl,
      channel: "latest",
    },
  ],
};
