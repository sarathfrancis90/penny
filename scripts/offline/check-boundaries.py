#!/usr/bin/env python3
"""Static native-only dependency and category gate; not a network traffic test."""
import json
from pathlib import Path
import re
import sys
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[2]
failures = []
categories = json.loads((ROOT / "packages/offline-contract/categories.json").read_text())
for relative in ("apps/ios/PennyOffline/Categories.swift", "apps/android/app/src/main/java/ca/penny/offline/Categories.kt"):
    values = re.findall(r'^\s+"([^"\n]+)",?$', (ROOT / relative).read_text(), re.M)
    if values != categories:
        failures.append(f"{relative}: category values/order differ from the portable contract")

sources = list((ROOT / "apps/ios/PennyOffline").glob("*.swift"))
sources += list((ROOT / "apps/android/app/src/main/java").rglob("*.kt"))
sources += [ROOT / "apps/android/app/build.gradle.kts"]
for source in sources:
    text = source.read_text()
    if re.search(r'^\s*(?:import|implementation|api)\b.*(?:[Ff]irebase|[Ff]lutter|[Dd]io\b|com\.google\.genai|generativeai|PrivateCloudCompute)', text, re.M):
        failures.append(f"{source.relative_to(ROOT)}: cloud/legacy runtime dependency in native core")
    if re.search(r'^\s*(?:import|implementation|api)\b.*(?:[Ss]entry|[Pp]ost[Hh]og|[Cc]rashlytics|[Dd]atadog)', text, re.M):
        failures.append(f"{source.relative_to(ROOT)}: unapproved remote diagnostics dependency")
    # Retry policy may classify TLS failures without owning a network client.
    network_scan = re.sub(r'javax\.net\.ssl\.(?:SSLException|SSLHandshakeException|SSLPeerUnverifiedException)\b', '', text)
    if source.name != "DriveTransport.kt" and re.search(r'\b(?:java\.net\.|javax\.net\.|okhttp3\.|io\.ktor\.client\.)', network_scan):
        failures.append(f"{source.relative_to(ROOT)}: Android networking must stay in the explicit Drive transport")
    if source.suffix == ".swift" and source.name != "CloudKitTransport.swift" and re.search(r'^\s*(?:@preconcurrency\s+)?import\s+CloudKit\b|\bURLSession\b', text, re.M):
        failures.append(f"{source.relative_to(ROOT)}: iOS networking must stay in the explicit CloudKit transport")
    if re.search(r'https?://[^\s"\']+(?:/api/|a\.run\.app|generativelanguage)', text):
        failures.append(f"{source.relative_to(ROOT)}: remote data/AI endpoint in native core")

android_ns = "{http://schemas.android.com/apk/res/android}"
tools_ns = "{http://schemas.android.com/tools}"
manifest = ET.parse(ROOT / "apps/android/app/src/main/AndroidManifest.xml").getroot()
app = manifest.find("application")
if app is None or app.get(android_ns + "allowBackup") != "false":
    failures.append("Android must disable automatic OS backup of the device-bound local vault")
for name, required_node in (("android.permission.INTERNET", None), ("android.permission.ACCESS_NETWORK_STATE", None)):
    entries = [p for p in manifest.findall("uses-permission") if p.get(android_ns + "name") == name]
    if len(entries) != 1 or entries[0].get(tools_ns + "node") != required_node:
        failures.append(f"Android optional Drive permission policy differs for {name}")
if app is None or app.get(android_ns + "usesCleartextTraffic") != "false" or app.get(android_ns + "networkSecurityConfig") != "@xml/network_security_config":
    failures.append("Android must disable cleartext and use the explicit provider network policy")
network = ET.parse(ROOT / "apps/android/app/src/main/res/xml/network_security_config.xml").getroot()
base, domains = network.find("base-config"), network.findall("domain-config")
if base is None or base.get("cleartextTrafficPermitted") != "false" or [c.get("src") for c in base.findall("trust-anchors/certificates")] != ["@raw/penny_network_deny_ca"]:
    failures.append("Android default TLS trust must use only the dedicated non-public deny anchor")
if len(domains) != 1:
    failures.append("Android must have exactly one provider trust override")
else:
    domain = domains[0]
    hosts = domain.findall("domain")
    if domain.get("cleartextTrafficPermitted") != "false" or len(hosts) != 1 or hosts[0].text != "www.googleapis.com" or hosts[0].get("includeSubdomains") != "false" or [c.get("src") for c in domain.findall("trust-anchors/certificates")] != ["system"] or domain.findall("domain-config"):
        failures.append("Android system TLS trust must be restricted to the exact Drive host")
if network.find("debug-overrides") is not None:
    failures.append("Android provider network policy must not add debug trust overrides")
anchors = list((ROOT / "apps/android/app/src/main/res/raw").glob("penny_network_deny_ca.*"))
if len(anchors) != 1 or "-----BEGIN CERTIFICATE-----" not in anchors[0].read_text() or "PRIVATE KEY" in anchors[0].read_text():
    failures.append("Android deny anchor must contain only the dedicated public certificate")

if failures:
    print("Native boundary gate failed:\n" + "\n".join(failures), file=sys.stderr)
    sys.exit(1)
print(f"Native static boundary gate passed: {len(sources)} source/build files; {len(categories)} matching categories.")
print("Scope: source dependencies and platform TLS/manifest policy only; custom SDK/system-service traffic and physical-device content egress remain separate release gates.")
