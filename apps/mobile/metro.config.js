// pnpm monorepo wiring. Metro has to watch the workspace root so it picks up
// @workspace/sync-core, and it must keep hierarchical lookup ENABLED — Expo's
// monorepo guide tells npm/yarn users to disable it, but pnpm's isolated store
// puts each package's own dependencies in its nested node_modules, so turning
// it off makes expo-modules-core (and everything like it) unresolvable.
const { getDefaultConfig } = require("expo/metro-config")
const path = require("node:path")

const projectRoot = __dirname
const workspaceRoot = path.resolve(projectRoot, "../..")
const config = getDefaultConfig(projectRoot)

config.watchFolders = [workspaceRoot]
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
]

module.exports = config
