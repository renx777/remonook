plugins {
 id("com.android.library") version "8.9.1"
 id("org.jetbrains.kotlin.android") version "2.2.10"
}
android {
 namespace="com.remonook.app"
 compileSdk=36
 defaultConfig {minSdk=24;testInstrumentationRunner="androidx.test.runner.AndroidJUnitRunner"}
 sourceSets["main"].apply {
  manifest.srcFile("src/main/AndroidManifest.xml")
  res.srcDirs("../../src-tauri/gen/android/app/src/main/res")
  java.srcDirs("build/widget-sources")

  java.srcDirs("src/main/java")
 }
 testOptions.unitTests.isIncludeAndroidResources=true
 compileOptions {sourceCompatibility=JavaVersion.VERSION_17;targetCompatibility=JavaVersion.VERSION_17}
 kotlinOptions {jvmTarget="17"}
}
dependencies {
 androidTestImplementation("androidx.test.ext:junit:1.2.1")
 androidTestImplementation("androidx.test:runner:1.6.2")
 testImplementation("junit:junit:4.13.2")
 testImplementation("org.robolectric:robolectric:4.16.1")
 implementation("androidx.core:core-ktx:1.15.0")
 implementation("androidx.appcompat:appcompat:1.7.1")
 implementation("com.google.android.material:material:1.12.0")
}

val widgetSources by tasks.registering(Copy::class) {
 from("../../src-tauri/gen/android/app/src/main/java")
 include("**/StudyWidget*.kt","**/WidgetPaint.kt","**/WidgetSuite*.kt")
 into(layout.buildDirectory.dir("widget-sources"))
}
tasks.named("preBuild") {dependsOn(widgetSources)}


tasks.withType<Test>().configureEach {
 testLogging { events("failed"); exceptionFormat=org.gradle.api.tasks.testing.logging.TestExceptionFormat.FULL }
}
