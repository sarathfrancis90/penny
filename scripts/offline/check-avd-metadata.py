#!/usr/bin/env python3
"""Check the selected image before repairing the known SDK 37.0 android-0 AVD metadata bug."""
import argparse
import json
import os
from pathlib import Path
import sys


def properties(path):
    return dict(line.split("=", 1) for line in path.read_text().splitlines() if "=" in line and not line.startswith("#"))


def check(avd_root, sdk_root, name, expected_api):
    if not name.replace("_", "").isalnum():
        raise ValueError("Use a simple AVD name")
    metadata = avd_root / f"{name}.ini"
    info = properties(metadata)
    config = properties(Path(info["path"]) / "config.ini")
    image = (sdk_root / config["image.sysdir.1"]).resolve()
    if not image.is_relative_to((sdk_root / "system-images").resolve()):
        raise ValueError("AVD image is outside the selected SDK system-images directory")
    image_info = properties(image / "source.properties")
    if image_info.get("AndroidVersion.ApiLevel") not in (str(expected_api), f"{expected_api}.0"):
        raise ValueError("Installed image API differs from the requested runtime")
    target = f"android-{expected_api}"
    repaired = info.get("target") == "android-0" and expected_api == 37
    if repaired:
        # Older avdmanager parses the SDK 37.0 platform string as API zero.
        # Only repair after the installed image itself proves API 37.
        text = metadata.read_text()
        metadata.write_text("\n".join(f"target={target}" if line.startswith("target=") else line
                                      for line in text.splitlines()) + "\n")
    elif info.get("target") not in (target, f"{target}.0"):
        raise ValueError("AVD target disagrees with the verified system image")
    return {"avd": name, "api": expected_api, "imageTag": image_info.get("SystemImage.TagId"), "repairedAndroidZero": repaired}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--name", required=True)
    parser.add_argument("--expected-api", type=int, required=True)
    args = parser.parse_args()
    try:
        avd_root = Path(os.environ.get("ANDROID_AVD_HOME", str(Path.home() / ".android/avd")))
        sdk = os.environ.get("ANDROID_HOME") or os.environ.get("ANDROID_SDK_ROOT")
        if not sdk:
            raise ValueError("Set ANDROID_HOME to the selected Android SDK")
        print(json.dumps(check(avd_root, Path(sdk), args.name, args.expected_api)))
        return 0
    except (OSError, KeyError, ValueError) as error:
        print(json.dumps({"passed": False, "error": str(error)}))
        return 1


if __name__ == "__main__":
    sys.exit(main())
