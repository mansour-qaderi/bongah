module.exports = {
  preset: '@react-native/jest-preset',
  setupFiles: ['<rootDir>/jest.setup.js'],
  setupFilesAfterEnv: ['<rootDir>/jest.afterEnv.js'],
  // The preset's pattern assumes npm's flat node_modules. With pnpm every package sits under
  // node_modules/.pnpm/<name>@<version>/node_modules/<name>, so allow that prefix too and
  // let the packages that ship untranspiled ES modules (React Native ones, navigation,
  // AsyncStorage v3) through Babel.
  transformIgnorePatterns: [
    'node_modules/(?!(?:\\.pnpm/)?((jest-)?react-native|@react-native(-community)?|@react-native-async-storage|@react-navigation))',
  ],
};
