/**
 * @format
 */

import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';
import { configureRtl } from './src/i18n/rtl';

// Dari and Pashto are right-to-left, so the whole app is RTL from the first launch.
configureRtl();

AppRegistry.registerComponent(appName, () => App);
