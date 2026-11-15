const { getDefaultConfig } = require('expo/metro-config');
const { resolve } = require('node:path');

const config = getDefaultConfig(__dirname);
config.watchFolders = [...config.watchFolders, resolve(__dirname, '../../apps/mobile')];
module.exports = config;
