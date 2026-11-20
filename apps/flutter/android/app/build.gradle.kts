import java.util.Properties

plugins {
    id("com.android.application")
    id("kotlin-android")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

// Firma: keystore.properties y el .jks viven solo en el equipo que compila (están en .gitignore).
// Es la misma llave de la app anterior, así el APK nuevo se instala encima como una actualización.
val firma = rootProject.file("keystore.properties")
val datosFirma = Properties().apply { if (firma.exists()) firma.inputStream().use { load(it) } }

android {
    namespace = "ec.clinicasparedes.clinagenda"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = JavaVersion.VERSION_17.toString()
    }

    defaultConfig {
        applicationId = "ec.clinicasparedes.agenda"
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName
        // http:// solo para probar en la red de la clínica; para las tiendas: PERMITIR_HTTP=false (solo https).
        manifestPlaceholders["permitirHttp"] = System.getenv("PERMITIR_HTTP") ?: "true"
    }

    signingConfigs {
        create("release") {
            if (firma.exists()) {
                storeFile = rootProject.file(datosFirma.getProperty("storeFile"))
                storePassword = datosFirma.getProperty("storePassword")
                keyAlias = datosFirma.getProperty("keyAlias")
                keyPassword = datosFirma.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        release {
            signingConfig = if (firma.exists()) signingConfigs.getByName("release") else signingConfigs.getByName("debug")
        }
    }
}

flutter {
    source = "../.."
}
