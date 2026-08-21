// Shared between the desktop daemon (apps/sync) and the mobile app
// (apps/mobile). Only genuinely platform-independent logic belongs here — the
// filesystem and network layers differ far too much between Node and Expo to
// be worth abstracting over.
export * from "./decide.js"
