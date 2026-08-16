const { withAppDelegate } = require('@expo/config-plugins');
const { mergeContents } = require('@expo/config-plugins/build/utils/generateCode');

/**
 * Expo SDK 53 moved iOS to a Swift AppDelegate whose template dropped the
 * `self.moduleName = "..."` line that @react-native-firebase/app@21's config
 * plugin anchors on. So that plugin can't find its insertion point, warns
 * ("Unable to determine correct Firebase insertion point in AppDelegate.swift.
 * Skipping Firebase addition."), and leaves out `FirebaseApp.configure()`. The
 * app then builds fine but Firebase never initialises — and every sign-in fails
 * at runtime looking like a code bug.
 *
 * The native FirebaseCore pod is still linked by RNFirebase; only this one call
 * is missing. Rather than jump five major versions of RNFirebase (whose newer
 * native SDKs target a newer Expo/RN than SDK 53), we insert the call ourselves
 * using the SAME anchor the fixed upstream plugin uses — `factory.startReactNative(`,
 * which the SDK 53 template does contain. Runs after @react-native-firebase/app
 * in app.json, so the import it already adds isn't duplicated.
 *
 * If the Expo template ever drops that anchor too, this throws (fails prebuild)
 * rather than silently skipping — the failure mode we're fixing must never be quiet.
 */
module.exports = function withFirebaseAppDelegate(config) {
  return withAppDelegate(config, (cfg) => {
    // The Objective-C AppDelegate is handled correctly by RNFirebase's own plugin.
    if (cfg.modResults.language !== 'swift') return cfg;

    let contents = cfg.modResults.contents;
    if (contents.includes('FirebaseApp.configure()')) return cfg; // already wired

    if (!contents.includes('import FirebaseCore')) {
      contents = contents.replace(/import Expo\b/, 'import Expo\nimport FirebaseCore');
    }

    const merged = mergeContents({
      tag: 'af1-firebase-configure',
      src: contents,
      newSrc: '    FirebaseApp.configure()',
      anchor: /factory\.startReactNative\(/,
      offset: 0, // insert immediately above the anchor line
      comment: '//',
    });

    if (!merged.didMerge) {
      throw new Error(
        "withFirebaseAppDelegate: couldn't find `factory.startReactNative(` in AppDelegate.swift. " +
          'The Expo template changed — update this plugin\'s anchor so Firebase still initialises.',
      );
    }

    cfg.modResults.contents = merged.contents;
    return cfg;
  });
};
