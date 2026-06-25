module.exports = {
  appId: 'com.ideaworks.recipe-builder',
  productName: 'Recipe Builder',
  directories: { output: 'dist-electron' },
  files: ['dist/**/*', 'electron/**/*', 'backend/**/*'],
  publish: {
    provider: 'github',
    owner: 'wallcop100',
    repo: 'ProductSpecandRecipesUtil',
    releaseType: 'release',
  },
  mac: { target: ['dmg', 'zip'] },
  win: { target: ['nsis'] },
  linux: { target: ['AppImage'] },
}
