import java.io.File
import org.gradle.api.file.DirectoryProperty
import org.gradle.api.tasks.InputDirectory
import org.gradle.api.tasks.OutputDirectory
import org.gradle.api.tasks.TaskAction

plugins { id("com.android.application") }
val sodiumOutput=providers.gradleProperty("pennySodiumOutput").orNull
    ?: error("Supply -PpennySodiumOutput=/absolute/verified/android/build-output")
require(File(sodiumOutput).isAbsolute)
val negativeFixtures=providers.gradleProperty("pennyNegativeFixtures").orNull
    ?: error("Supply -PpennyNegativeFixtures=/absolute/materialized/negative-files")
require(File(negativeFixtures).isAbsolute && file("$negativeFixtures/negative-manifest.json").isFile)
val peerFixtures=providers.gradleProperty("pennyPeerFixtures").orNull
    ?: error("Supply -PpennyPeerFixtures=/absolute/Swift/native-exports for opposite-native tests")
require(File(peerFixtures).isAbsolute && file("$peerFixtures/native-fixture-manifest.json").isFile)
val logicalFixtures=providers.gradleProperty("pennyLogicalFixtures").orNull
    ?: error("Supply -PpennyLogicalFixtures=/absolute/materialized/logical-fixtures")
require(File(logicalFixtures).isAbsolute && file("$logicalFixtures/fixture-manifest.json").isFile)
abstract class NegativeFixtureAssets : DefaultTask() {
    @get:InputDirectory abstract val sourceDirectory: DirectoryProperty
    @get:OutputDirectory abstract val outputDirectory: DirectoryProperty
    @TaskAction fun prepare() {
        // Materializer also emits the shared positive manifest: exclude that duplicate.
        project.sync {
            from(sourceDirectory) { include("negative-manifest.json", "*.pennyframe") }
            into(outputDirectory)
        }
    }
}
val prepareNegativeAssets by tasks.registering(NegativeFixtureAssets::class) {
    sourceDirectory.set(file(negativeFixtures))
    outputDirectory.set(layout.buildDirectory.dir("negative-fixture-assets"))
}
abstract class LegacyValidatorSources : DefaultTask() {
    @get:InputDirectory abstract val sourceDirectory: DirectoryProperty
    @get:OutputDirectory abstract val outputDirectory: DirectoryProperty
    @TaskAction fun prepare() {
        project.sync {
            from(sourceDirectory) { include("Categories.kt", "Expense.kt", "FinanceModels.kt", "StrictJson.kt", "Attachment.kt", "ReceiptImage.kt") }
            into(outputDirectory)
        }
    }
}
val legacyValidators by tasks.registering(LegacyValidatorSources::class) {
    sourceDirectory.set(file("../../../../../apps/android/app/src/main/java/ca/penny/offline"))
    outputDirectory.set(layout.buildDirectory.dir("legacy-validator-sources"))
}
abstract class LogicalFixtureAssets : DefaultTask() {
    @get:InputDirectory abstract val sourceDirectory: DirectoryProperty
    @get:OutputDirectory abstract val outputDirectory: DirectoryProperty
    @TaskAction fun prepare() {
        project.sync { from(sourceDirectory) { into("logical"); include("fixture-manifest.json", "*.pennylogical") }; into(outputDirectory) }
    }
}
val logicalAssets by tasks.registering(LogicalFixtureAssets::class) {
    sourceDirectory.set(file(logicalFixtures))
    outputDirectory.set(layout.buildDirectory.dir("logical-fixture-assets"))
}
android {
    namespace="ca.penny.v4frameprobe"
    compileSdk=37
    ndkVersion="28.2.13676358"
    defaultConfig {
        applicationId="ca.penny.v4frameprobe"
        minSdk=26; targetSdk=37; versionCode=1; versionName="experimental-frame-only"
        testInstrumentationRunner="androidx.test.runner.AndroidJUnitRunner"
        ndk { abiFilters += listOf("arm64-v8a","armeabi-v7a","x86","x86_64") }
        externalNativeBuild { cmake { arguments += listOf("-DPENNY_SODIUM_OUTPUT=$sodiumOutput","-DANDROID_STL=c++_static","-DANDROID_PLATFORM=android-26") } }
    }
    externalNativeBuild { cmake { path=file("src/main/cpp/CMakeLists.txt");version="3.22.1" } }
    compileOptions { sourceCompatibility=JavaVersion.VERSION_17;targetCompatibility=JavaVersion.VERSION_17 }
    sourceSets.getByName("androidTest").assets.srcDir("../../../../offline-contract/fixtures/v4-frames")
    sourceSets.getByName("androidTest").assets.srcDir(peerFixtures)
}
androidComponents.onVariants(androidComponents.selector().withBuildType("debug")) { variant ->
    variant.androidTest?.sources?.assets?.addGeneratedSourceDirectory(prepareNegativeAssets) { it.outputDirectory }
    variant.androidTest?.sources?.assets?.addGeneratedSourceDirectory(logicalAssets) { it.outputDirectory }
    variant.sources.java?.addGeneratedSourceDirectory(legacyValidators) { it.outputDirectory }
}
dependencies {
    androidTestImplementation("androidx.test.ext:junit:1.3.0")
    androidTestImplementation("androidx.test:runner:1.7.0")
    androidTestImplementation("junit:junit:4.13.2")
}
