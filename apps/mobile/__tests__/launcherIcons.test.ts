// The launcher icons are plain files, so these tests read them: every size the stores and the phones ask for must be
// there, at the right pixel size, opaque where the App Store insists, and wired up in the native projects.
// (Like noGoogleMaps.test.ts, this needs the `android/` and `ios/` folders.)
declare const __dirname: string;

const fs = require('node:fs') as {
  readFileSync(p: string): Uint8Array & { readUInt32BE(o: number): number };
  readFileSync(p: string, e: 'utf8'): string;
  existsSync(p: string): boolean;
};
const path = require('node:path') as { join(...p: string[]): string };

const root = path.join(__dirname, '..');
const res = path.join(root, 'android', 'app', 'src', 'main', 'res');
const appIconSet = path.join(
  root,
  'ios',
  'BongahMobile',
  'Images.xcassets',
  'AppIcon.appiconset',
);

/** Width, height and PNG colour type (2 = RGB, 6 = RGBA) from the file header. */
function png(file: string) {
  const bytes = fs.readFileSync(file) as unknown as {
    length: number;
    readUInt32BE(o: number): number;
    [i: number]: number;
  };
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  signature.forEach((b, i) => expect(bytes[i]).toBe(b));
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
    colorType: bytes[25],
  };
}

describe('the master icon', () => {
  it('is a 1024 x 1024 PNG with no transparency', () => {
    expect(png(path.join(root, 'assets', 'icon.png'))).toEqual({
      width: 1024,
      height: 1024,
      colorType: 2,
    });
  });
});

describe('Android launcher icons', () => {
  const densities: [string, number][] = [
    ['mdpi', 1],
    ['hdpi', 1.5],
    ['xhdpi', 2],
    ['xxhdpi', 3],
    ['xxxhdpi', 4],
  ];

  it.each(densities)(
    '%s has the plain icons (48 dp), the round one, and the 108 dp adaptive layers',
    (density, scale) => {
      const dir = path.join(res, `mipmap-${density}`);
      const legacy = 48 * scale;
      const layer = 108 * scale;
      for (const name of ['ic_launcher', 'ic_launcher_round']) {
        const { width, height } = png(path.join(dir, `${name}.png`));
        expect([width, height]).toEqual([legacy, legacy]);
      }
      // The square one is opaque; the round one is transparent outside its circle.
      expect(png(path.join(dir, 'ic_launcher.png')).colorType).toBe(2);
      expect(png(path.join(dir, 'ic_launcher_round.png')).colorType).toBe(6);
      for (const name of ['ic_launcher_foreground', 'ic_launcher_monochrome']) {
        const info = png(path.join(dir, `${name}.png`));
        expect([info.width, info.height]).toEqual([layer, layer]);
        expect(info.colorType).toBe(6);
      }
    },
  );

  it('wires the adaptive icon to a transparent background (no plate behind the mark), the foreground and the themed-icon layer', () => {
    for (const name of ['ic_launcher', 'ic_launcher_round']) {
      const xml = fs.readFileSync(
        path.join(res, 'mipmap-anydpi-v26', `${name}.xml`),
        'utf8',
      );
      expect(xml).toContain('<adaptive-icon');
      expect(xml).toContain('@color/ic_launcher_background');
      expect(xml).toContain('@mipmap/ic_launcher_foreground');
      expect(xml).toContain('@mipmap/ic_launcher_monochrome');
    }
    const colors = fs.readFileSync(
      path.join(res, 'values', 'ic_launcher_background.xml'),
      'utf8',
    );
    expect(colors).toMatch(
      /<color name="ic_launcher_background">#00000000<\/color>/,
    );
  });

  it('is what the manifest asks for', () => {
    const manifest = fs.readFileSync(
      path.join(root, 'android', 'app', 'src', 'main', 'AndroidManifest.xml'),
      'utf8',
    );
    expect(manifest).toContain('android:icon="@mipmap/ic_launcher"');
    expect(manifest).toContain('android:roundIcon="@mipmap/ic_launcher_round"');
  });
});

describe('iOS app icon set', () => {
  const contents = JSON.parse(
    fs.readFileSync(path.join(appIconSet, 'Contents.json'), 'utf8'),
  ) as {
    images: {
      filename?: string;
      idiom: string;
      scale: string;
      size: string;
    }[];
  };

  it('has an opaque PNG of exactly the right size for every slot, iPhone and iPad', () => {
    expect(contents.images.length).toBeGreaterThanOrEqual(18);
    for (const image of contents.images) {
      expect(image.filename).toBeTruthy();
      const points = Number(image.size.split('x')[0]);
      const scale = Number(image.scale.replace('x', ''));
      const px = Math.round(points * scale);
      expect(image.filename).toBe(`AppIcon-${px}.png`);
      expect(png(path.join(appIconSet, image.filename!))).toEqual({
        width: px,
        height: px,
        colorType: 2, // RGB: the App Store rejects an icon with an alpha channel
      });
    }
  });

  it('covers every idiom the project builds for, and the 1024 marketing icon', () => {
    const idioms = new Set(contents.images.map(i => i.idiom));
    expect(idioms).toEqual(new Set(['iphone', 'ipad', 'ios-marketing']));
    const project = fs.readFileSync(
      path.join(root, 'ios', 'BongahMobile.xcodeproj', 'project.pbxproj'),
      'utf8',
    );
    expect(project).toContain('TARGETED_DEVICE_FAMILY = "1,2"');
    expect(project).toContain('ASSETCATALOG_COMPILER_APPICON_NAME = AppIcon;');
  });
});
