const hasArg = (flag) => process.argv.includes(flag);

const getTargetPlatform = () => {
  if (hasArg("--mac")) return "darwin";
  if (hasArg("--win")) return "win32";
  if (hasArg("--linux")) return "linux";
  return process.platform;
};

const getTargetArchs = () => {
  const archs = [];
  if (hasArg("--x64")) archs.push("x64");
  if (hasArg("--arm64")) archs.push("arm64");
  if (hasArg("--ia32")) archs.push("ia32");
  return archs;
};

const getUvExtraResources = () => {
  const platform = getTargetPlatform();
  const targetArchs = getTargetArchs();

  if (platform === "darwin") {
    const archs = targetArchs.length > 0 ? targetArchs : [process.arch];
    return archs.map((arch) => ({
      from: `resources/uv/darwin-${arch}`,
      to: `uv/darwin-${arch}`,
    }));
  }

  if (platform === "win32") {
    const archs = targetArchs.length > 0 ? targetArchs : ["x64", "arm64"];
    return archs.map((arch) => ({
      from: `resources/uv/win32-${arch}`,
      to: `uv/win32-${arch}`,
    }));
  }

  return [];
};

module.exports = {
  appId: "com.picaptain.app",
  productName: "PiCaptain",
  icon: "resources/icon.png",
  files: [
    "dist-electron",
    "dist-renderer",
    "package.json",
    "backend/python",
    "resources",
    "!resources/uv/**",
    "!**/.uv",
    "!**/__pycache__",
  ],
  extraResources: getUvExtraResources(),
  asarUnpack: [
    "backend/python/**",
    "node_modules/better-sqlite3/**",
    "node_modules/sqlite-vec/**",
  ],
  mac: {
    target: {
      target: "dmg",
      arch: ["x64", "arm64"],
    },
  },
  publish: [
    {
      provider: "generic",
      url: "https://mirror.ghproxy.com/https://github.com/anhaohui/RroRef/releases/latest/download/",
    },
  ],
  nsis: {
    include: "build/installer.nsh",
    oneClick: false,
    allowToChangeInstallationDirectory: true,
  },
};
