import java.io.File
import org.gradle.api.file.DirectoryProperty
import org.gradle.api.file.RegularFileProperty
import org.gradle.api.tasks.InputDirectory
import org.gradle.api.tasks.InputFile
import org.gradle.api.tasks.OutputDirectory
import org.gradle.api.tasks.TaskAction

plugins { id("com.android.application"); id("org.jetbrains.kotlin.plugin.compose") }
val sodiumOutput = providers.gradleProperty("pennySodiumOutput").orElse(providers.environmentVariable("PENNY_SODIUM_OUTPUT")).orNull
    ?: error("Supply -PpennySodiumOutput or PENNY_SODIUM_OUTPUT with the absolute authenticated Android sodium build output")
require(File(sodiumOutput).isAbsolute && file("$sodiumOutput/build-result.json").isFile) { "Verified sodium build report is required" }
val pennyRelease = providers.gradleProperty("pennyRelease").orNull == "true"
val pennySandbox = providers.gradleProperty("pennyTestSandbox").orNull == "true"
require(!(pennyRelease && pennySandbox)) { "Production and test sandbox profiles cannot be combined" }
val signingNames = listOf("PENNY_ANDROID_KEYSTORE","PENNY_ANDROID_KEY_ALIAS","PENNY_ANDROID_STORE_PASSWORD","PENNY_ANDROID_KEY_PASSWORD")
val signingValues = signingNames.map { providers.environmentVariable(it).orNull }
require(signingValues.all { it.isNullOrEmpty() } || signingValues.all { !it.isNullOrEmpty() }) { "Supply all four signing environment fields or none" }
android {
    namespace = "ca.penny.offline"
    compileSdk = 37
    ndkVersion = "28.2.13676358"
    defaultConfig {
        applicationId = if(pennyRelease) "com.penny.penny_mobile" else if(pennySandbox) "ca.penny.offline.dev.test" else "ca.penny.offline.dev"
        ndk { abiFilters += listOf("arm64-v8a", "armeabi-v7a", "x86", "x86_64") }
        externalNativeBuild { cmake { arguments += listOf("-DPENNY_SODIUM_OUTPUT=$sodiumOutput", "-DANDROID_STL=c++_static", "-DANDROID_PLATFORM=android-26") } }
        minSdk = 26
        targetSdk = 37
        versionCode = if(pennyRelease) checkNotNull(providers.gradleProperty("pennyVersionCode").orNull) { "Production profile requires an explicit fresh version code" }.also { require(Regex("[1-9][0-9]*").matches(it)) }.toInt().also { require(it in 1..2100000000) } else 1
        versionName = if(pennyRelease) checkNotNull(providers.gradleProperty("pennyVersionName").orNull) { "Production profile requires an explicit version name" }.also { require(Regex("[0-9]+\\.[0-9]+\\.[0-9]+").matches(it)) } else "0.1.0-dev"
        val driveClient = providers.gradleProperty("pennyDriveAndroidClientId").orNull.orEmpty()
        val driveSigner = providers.gradleProperty("pennyDriveSigningSha256").orNull.orEmpty().lowercase()
        require(!pennyRelease || (driveClient.isNotEmpty() && driveSigner.isNotEmpty())) { "Production profile requires public Drive client and signer configuration" }
        require(driveClient.isEmpty() || Regex("[0-9]+-[a-z0-9]+\\.apps\\.googleusercontent\\.com").matches(driveClient))
        require(driveSigner.isEmpty() || Regex("[0-9a-f]{64}").matches(driveSigner))
        buildConfigField("String", "DRIVE_ANDROID_CLIENT_ID", "\"$driveClient\"")
        buildConfigField("String", "DRIVE_SIGNING_SHA256", "\"$driveSigner\"")
        manifestPlaceholders["driveClientId"] = driveClient
        manifestPlaceholders["driveSigningSha256"] = driveSigner
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }
    if(pennyRelease && signingValues.all { !it.isNullOrEmpty() }) {
        val configured = signingConfigs.create("pennyProduction") {
            storeFile = file(checkNotNull(signingValues[0])).also { require(it.isFile) { "Signing keystore is not available" } }
            keyAlias = signingValues[1];storePassword = signingValues[2];keyPassword = signingValues[3]
        }
        buildTypes.getByName("release").signingConfig = configured
    }
    buildFeatures { compose = true; buildConfig = true }
    externalNativeBuild { cmake { path = file("../../../packages/offline-crypto/android/codec/cpp/CMakeLists.txt"); version = "3.22.1" } }
    compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
    testOptions { unitTests.isReturnDefaultValues = true }
    sourceSets.getByName("test").resources.srcDir("../../../packages/offline-contract/fixtures")
    sourceSets.getByName("androidTest").assets.srcDir("../../../packages/offline-contract/fixtures")
    sourceSets.getByName("androidTest").assets.srcDir("../evidence/interoperability")
}
dependencies {
    implementation(platform("androidx.compose:compose-bom:2026.06.01"))
    implementation("androidx.activity:activity-compose:1.13.0")
    implementation("androidx.compose.material3:material3:1.4.0")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.9.4")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.9.4")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-play-services:1.10.2")
    implementation("androidx.camera:camera-camera2:1.6.2")
    implementation("androidx.camera:camera-lifecycle:1.6.2")
    implementation("androidx.camera:camera-view:1.6.2")
    implementation("com.google.android.gms:play-services-auth:21.6.0")
    implementation("androidx.work:work-runtime-ktx:2.11.2")
    implementation("com.google.mlkit:text-recognition:16.0.1")
    implementation("com.google.mlkit:genai-prompt:1.0.0-beta4")
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.json:json:20250517")
    androidTestImplementation("androidx.test.ext:junit:1.3.0")
    androidTestImplementation("androidx.test:runner:1.7.0")
    androidTestImplementation("androidx.test.espresso:espresso-core:3.7.0")
    androidTestImplementation(platform("androidx.compose:compose-bom:2026.06.01"))
    androidTestImplementation("androidx.compose.ui:ui-test-junit4")
    debugImplementation("androidx.compose.ui:ui-test-manifest")
    debugImplementation("androidx.compose.ui:ui-tooling")
}

androidComponents.onVariants { variant -> variant.sources.kotlin?.addStaticSourceDirectory("../../../packages/offline-crypto/android/codec/kotlin") }

abstract class SodiumLicenseAssets : DefaultTask() {
    @get:InputFile abstract val license: RegularFileProperty
    @get:OutputDirectory abstract val outputDirectory: DirectoryProperty
    @TaskAction fun prepare() { project.sync { from(license); into(outputDirectory) } }
}
val sodiumLicenseAssets by tasks.registering(SodiumLicenseAssets::class) {
    license.set(file("../../../packages/offline-crypto/LICENSE.libsodium"))
    outputDirectory.set(layout.buildDirectory.dir("sodium-license-assets"))
}
abstract class V4ReaderTestAssets : DefaultTask() {
    @get:InputDirectory abstract val sourceDirectory: DirectoryProperty
    @get:OutputDirectory abstract val outputDirectory: DirectoryProperty
    @TaskAction fun prepare() { project.sync {
        from(sourceDirectory) {
            include("v4-frame-negatives/negative-manifest.json", "v4-frame-negatives/*.pennyframe",
                "v4-logical-materialized/fixture-manifest.json", "v4-logical-materialized/*.pennylogical")
        }
        into(outputDirectory)
    } }
}
val v4TestSource = providers.gradleProperty("pennyV4TestAssets").orNull
val v4ReaderAssets = v4TestSource?.let { source ->
    require(File(source).isAbsolute && file(source).isDirectory)
    tasks.register<V4ReaderTestAssets>("prepareV4ReaderTestAssets") {
        sourceDirectory.set(file(source)); outputDirectory.set(layout.buildDirectory.dir("v4-reader-test-assets"))
    }
}
androidComponents.onVariants { variant ->
    variant.sources.assets?.addGeneratedSourceDirectory(sodiumLicenseAssets) { it.outputDirectory }
    v4ReaderAssets?.let { task -> variant.androidTest?.sources?.assets?.addGeneratedSourceDirectory(task) { it.outputDirectory } }
}
