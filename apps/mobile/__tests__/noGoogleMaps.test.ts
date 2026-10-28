export {}; // keeps this file's declarations out of the global scope

// The app has no @types/node (it is a React Native project); this test only needs a few Node calls.
type Entry = { name: string; isDirectory(): boolean };
type NodeFs = {
  readdirSync(dir: string, opts: { withFileTypes: true }): Entry[];
  readFileSync(file: string, encoding: 'utf8'): string;
};
type NodePath = {
  resolve(...parts: string[]): string;
  join(...parts: string[]): string;
  relative(from: string, to: string): string;
  sep: string;
};
declare const __dirname: string;
const fs = require('node:fs') as NodeFs;
const path = require('node:path') as NodePath;

const root = path.resolve(__dirname, '..');

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx|js|json|xml|gradle|kt|swift|plist|md|pbxproj|rb)$/.test(
      entry.name,
    )
      ? [full]
      : [];
  });
}

describe('no Google Maps dependency', () => {
  it('does not depend on react-native-maps (it is Google Maps on Android)', () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(root, 'package.json'), 'utf8'),
    );
    const all = { ...pkg.dependencies, ...pkg.devDependencies };
    expect(Object.keys(all)).not.toContain('react-native-maps');
    // The map is Mapbox's (@rnmapbox/maps), on purpose: what stays out is Google's SDKs.
    expect(
      Object.keys(all).filter(name => /google|gms/i.test(name)),
    ).toEqual([]);
  });

  it('keeps Google keys and SDKs out of the app code and native projects', () => {
    const offenders = [
      ...sourceFiles(path.join(root, 'src')),
      ...sourceFiles(path.join(root, 'android')),
      ...sourceFiles(path.join(root, 'ios')),
    ].filter(file => {
      if (
        file.includes(`${path.sep}Pods${path.sep}`) ||
        file.includes(`${path.sep}build${path.sep}`)
      )
        return false;
      const text = fs.readFileSync(file, 'utf8');
      return /react-native-maps|REPLACE_WITH_GOOGLE_MAPS_API_KEY|com\.google\.android\.geo\.API_KEY|GMSServices|maps\.googleapis\.com/.test(
        text,
      );
    });
    expect(offenders.map(f => path.relative(root, f))).toEqual([]);
  });
});
