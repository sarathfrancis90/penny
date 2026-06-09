fastlane documentation
----

# Installation

Make sure you have the latest version of the Xcode command line tools installed:

```sh
xcode-select --install
```

For _fastlane_ installation instructions, see [Installing _fastlane_](https://docs.fastlane.tools/#installing-fastlane)

# Available Actions

## iOS

### ios register

```sh
[bundle exec] fastlane ios register
```

Register the app on App Store Connect

### ios beta

```sh
[bundle exec] fastlane ios beta
```

Build release IPA and upload to TestFlight

### ios internal

```sh
[bundle exec] fastlane ios internal
```

Internal-first release: build IPA and upload to TestFlight only

### ios repair_and_submit

```sh
[bundle exec] fastlane ios repair_and_submit
```

Repair v2.2.1: drop the stray en-US localization, set release notes on en-CA, attach build, submit for review

### ios build

```sh
[bundle exec] fastlane ios build
```

Build release IPA only

### ios ship

```sh
[bundle exec] fastlane ios ship
```

Legacy full publish: build IPA, upload to TestFlight, then submit to App Store with auto-release

### ios promote

```sh
[bundle exec] fastlane ios promote
```

Submit an already validated TestFlight build to App Store review

----


## Android

### android beta

```sh
[bundle exec] fastlane android beta
```

Build release AAB and upload to Google Play internal testing

### android internal

```sh
[bundle exec] fastlane android internal
```

Internal-first release: build AAB and upload to Play internal testing

### android ship

```sh
[bundle exec] fastlane android ship
```

Deprecated alias: build AAB and upload to Play internal testing

### android promote

```sh
[bundle exec] fastlane android promote
```

Promote the validated Play internal release to production

### android metadata

```sh
[bundle exec] fastlane android metadata
```

Upload metadata, screenshots, and images only (no build)

### android build

```sh
[bundle exec] fastlane android build
```

Build release AAB only (no upload)

----

This README.md is auto-generated and will be re-generated every time [_fastlane_](https://fastlane.tools) is run.

More information about _fastlane_ can be found on [fastlane.tools](https://fastlane.tools).

The documentation of _fastlane_ can be found on [docs.fastlane.tools](https://docs.fastlane.tools).
