// node --import ./tools/tune-hook.mjs ...  -> sets globalThis.RLTUNE from env RLTUNE_JSON before physics loads
globalThis.RLTUNE = process.env.RLTUNE_JSON ? JSON.parse(process.env.RLTUNE_JSON) : {};
