const fs = require("fs");
const path = require("path");
const { withDangerousMod, withXcodeProject } = require("expo/config-plugins");

const SWIFT_FILE = "AddToGroceryListIntent.swift";

function findAppDir(iosRoot) {
  const appDir = fs
    .readdirSync(iosRoot)
    .map((name) => path.join(iosRoot, name))
    .find(
      (abs) =>
        fs.statSync(abs).isDirectory() &&
        fs.existsSync(path.join(abs, "AppDelegate.swift")),
    );
  if (!appDir) {
    throw new Error(
      "withSiriAddToList: could not find an iOS app folder with AppDelegate.swift",
    );
  }
  return appDir;
}

function copyIntentIntoIosProject(iosRoot) {
  const appDir = findAppDir(iosRoot);
  const src = path.join(__dirname, SWIFT_FILE);
  const dest = path.join(appDir, SWIFT_FILE);
  fs.copyFileSync(src, dest);
  donateShortcutsOnLaunch(path.join(appDir, "AppDelegate.swift"));
  return path.relative(iosRoot, dest).split(path.sep).join("/");
}

function donateShortcutsOnLaunch(appDelegatePath) {
  let src = fs.readFileSync(appDelegatePath, "utf8");
  if (!src.includes("import AppIntents")) {
    src = src.replace(/^import Expo/m, "import AppIntents\nimport Expo");
  }
  if (!src.includes("TimepleteShortcuts.updateAppShortcutParameters()")) {
    src = src.replace(
      "bindReactNativeFactory(factory)\n",
      "bindReactNativeFactory(factory)\n\n    if #available(iOS 16.0, *) {\n      TimepleteShortcuts.updateAppShortcutParameters()\n    }\n",
    );
  }
  fs.writeFileSync(appDelegatePath, src);
}

/**
 * Copies the App Intent into the app target so Siri can discover
 * "Add X to my grocery list in Timeplete". Intents in Expo pods are ignored.
 */
function withSiriAddToList(config) {
  config = withDangerousMod(config, [
    "ios",
    async (cfg) => {
      copyIntentIntoIosProject(cfg.modRequest.platformProjectRoot);
      return cfg;
    },
  ]);

  config = withXcodeProject(config, (cfg) => {
    const project = cfg.modResults;
    const destRel = `${cfg.modRequest.projectName || "Timeplete"}/${SWIFT_FILE}`;
    const already = Object.values(project.hash.project.objects.PBXFileReference || {})
      .some((ref) => typeof ref === "object" && ref.path && String(ref.path).endsWith(SWIFT_FILE));
    if (already) return cfg;

    const groupKey = project.findPBXGroupKey({ name: cfg.modRequest.projectName || "Timeplete" });
    project.addSourceFile(destRel, null, groupKey);
    return cfg;
  });

  return config;
}

module.exports = withSiriAddToList;
