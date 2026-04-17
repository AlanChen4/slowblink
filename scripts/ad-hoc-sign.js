// Ad-hoc sign the packaged .app so downloaded arm64 builds will launch.
// electron-builder's `identity: null` skips all signing, including the ad-hoc
// fallback. Apple Silicon refuses to launch an entirely-unsigned app that
// carries the com.apple.quarantine attribute, showing the misleading
// "app is damaged and can't be opened" error. An ad-hoc signature is enough
// to clear that bar; users still see the "unidentified developer" prompt on
// first launch.
const { execFileSync } = require('node:child_process');
const path = require('node:path');

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return;
  const appPath = path.join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`,
  );
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], {
    stdio: 'inherit',
  });
};
