// Preserve the existing production build stages, then add the read-only view.
// Stage order was checked against deployment dpl_RVqZwzFTD5mU9rc9Xc1i3QqFMXSt.
import {execFileSync} from 'node:child_process';
for(const stage of ['build.mjs','postbuild-132.mjs','version133.mjs','build-account-addon.mjs','build-bot.mjs','build-bot14.mjs','build-ui.mjs','build-revolution20.mjs'])execFileSync(process.execPath,[stage],{stdio:'inherit',timeout:240000});
