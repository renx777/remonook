pluginManagement { repositories { google(); mavenCentral(); gradlePluginPortal() } }
// Same Maven Central artifacts through Google's public mirror; hosted CI can
// receive 429 from repo.maven.apache.org during native runtime downloads.
dependencyResolutionManagement { repositories {google();maven {url=uri("https://maven-central.storage-download.googleapis.com/maven2")};mavenCentral()} }
rootProject.name="widget-screenshots"
