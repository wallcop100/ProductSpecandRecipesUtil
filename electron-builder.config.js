module.exports = {
  appId: 'com.recipebuilder.app',
  productName: 'Recipe Builder',
  directories: { output: 'dist-electron' },
  files: ['dist/**/*', 'electron/**/*'],
  // Space-free artifact names. The default (`${productName} Setup ...`) has
  // spaces, which GitHub rewrites to dots on the uploaded asset while
  // electron-builder writes the latest.yml URL with hyphens — the mismatch
  // makes the auto-updater 404. `${name}` is the (hyphenated) package name, so
  // the built file, latest.yml and the GitHub asset all agree.
  artifactName: '${name}-${version}-${arch}.${ext}',
  publish: {
    provider: 'github',
    owner: 'wallcop100',
    repo: 'ProductSpecandRecipesUtil',
    releaseType: 'release',
  },
  mac: {
    target: ['dmg', 'zip'],
    extraResources: [{ from: 'dist-python/backend-server', to: 'backend-server' }],
  },
  win: {
    target: ['nsis'],
    artifactName: '${name}-Setup-${version}.${ext}',
    extraResources: [{ from: 'dist-python/backend-server.exe', to: 'backend-server.exe' }],
  },
}
