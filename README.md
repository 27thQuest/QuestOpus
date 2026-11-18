# Quest Opus — Mobile (Capacitor)

This is the mobile/web version of Quest Opus. It uses the exact same UI as the
Electron desktop app, adapted for phones with a bottom nav bar, touch-friendly
tap targets, safe-area padding, and long-press to rename subjects.

Data is stored in the device's `localStorage` (not a JSON file — that's an
Electron thing). Each phone/browser has its own storage.

---

## Preview on your desktop (browser)

This is the fastest way to test. No Android/iOS tools needed.

```bash
cd quest-opus-mobile
npm install
npm run dev
```

Then open **http://localhost:3000** in Chrome or Edge. In Chrome DevTools
press **Ctrl+Shift+M** (or Cmd+Shift+M on Mac) to switch to mobile view and
pick a phone preset like iPhone 14 or Pixel 7.

---

## Build for Android

### Prerequisites
- [Android Studio](https://developer.android.com/studio) installed
- Java 17+ (`java -version`)
- Android SDK set up through Android Studio

### Steps

```bash
npm install
npx cap add android
npx cap sync android
npx cap run android
```

`cap run android` launches Android Studio and deploys to an emulator or
connected device. Use Android Studio's Device Manager to create a Pixel 7 or
similar emulator if you don't have one.

---

## Build for iOS (Mac only)

### Prerequisites
- Xcode installed from the App Store
- `pod install` (CocoaPods): `sudo gem install cocoapods`

### Steps

```bash
npm install
npx cap add ios
npx cap sync ios
npx cap run ios
```

---

## After changing any web files

Run `npx cap sync` to push the updated `www/` files into the native projects
before re-running on device.

---

## How it differs from the Electron version

| Feature | Electron | Mobile |
| --- | --- | --- |
| Data storage | `data.json` on disk | `localStorage` in browser/WebView |
| Timer state | Main process (Node.js) | `db.js` in-page JS |
| Failsafes (sleep/quit) | `powerMonitor` + `before-quit` | Page `visibilitychange` saves on hide |
| Navigation | Top nav bar | Bottom nav bar with icons |
| Rename | Right-click | Long-press (500ms) |
| Chart.js | Vendored from npm | CDN (cdnjs) |

### Sleep/quit on mobile

The web build listens for `document.visibilitychange` — when the browser/app
goes to background it commits the open timer segment so time isn't lost if
the OS kills the WebView. This is the mobile equivalent of `before-quit`.
