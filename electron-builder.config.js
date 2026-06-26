module.exports = {
  appId: 'com.recipebuilder.app',
  productName: 'Recipe Builder',
  directories: { output: 'dist-electron' },
  files: ['dist/**/*', 'electron/**/*'],
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
    extraResources: [{ from: 'dist-python/backend-server.exe', to: 'backend-server.exe' }],
  },
}
