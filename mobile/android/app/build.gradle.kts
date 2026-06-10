import org.jetbrains.kotlin.gradle.dsl.JvmTarget
import java.util.Properties

plugins {
    id("com.android.application")
    id("com.google.gms.google-services")
    id("kotlin-android")
    id("dev.flutter.flutter-gradle-plugin")
}

// Load keystore properties for release signing
val keystorePropertiesFile = rootProject.file("key.properties")
val keystoreProperties = Properties()
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(keystorePropertiesFile.inputStream())
}

fun releaseTaskRequested(): Boolean =
    gradle.startParameter.taskNames.any { taskName ->
        taskName.contains("release", ignoreCase = true)
    }

fun requireReleaseSigningProperty(name: String): String {
    val value = keystoreProperties.getProperty(name)?.trim()
    if (value.isNullOrEmpty()) {
        throw GradleException("Release signing requires $name in mobile/android/key.properties")
    }
    return value
}

fun validateReleaseSigning() {
    if (!keystorePropertiesFile.exists()) {
        throw GradleException("Release signing requires mobile/android/key.properties")
    }

    val storeFilePath = requireReleaseSigningProperty("storeFile")
    requireReleaseSigningProperty("storePassword")
    requireReleaseSigningProperty("keyAlias")
    requireReleaseSigningProperty("keyPassword")

    if (!file(storeFilePath).exists()) {
        throw GradleException("Release signing storeFile does not exist: $storeFilePath")
    }
}

if (releaseTaskRequested()) {
    validateReleaseSigning()
}

android {
    namespace = "com.penny.penny_mobile"
    compileSdk = 36
    ndkVersion = flutter.ndkVersion

    compileOptions {
        isCoreLibraryDesugaringEnabled = true
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    defaultConfig {
        applicationId = "com.penny.penny_mobile"
        minSdk = flutter.minSdkVersion
        targetSdk = 35
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    signingConfigs {
        create("release") {
            if (keystorePropertiesFile.exists()) {
                keyAlias = requireReleaseSigningProperty("keyAlias")
                keyPassword = requireReleaseSigningProperty("keyPassword")
                storeFile = file(requireReleaseSigningProperty("storeFile"))
                storePassword = requireReleaseSigningProperty("storePassword")
            }
        }
    }

    buildTypes {
        release {
            signingConfig = signingConfigs.getByName("release")
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }
}

tasks.configureEach {
    if (name.contains("release", ignoreCase = true)) {
        doFirst {
            validateReleaseSigning()
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget.set(JvmTarget.JVM_17)
    }
}

dependencies {
    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.1.4")
}

flutter {
    source = "../.."
}
