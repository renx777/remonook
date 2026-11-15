#!/usr/bin/env bash
# The pagination model has no Android dependencies. Test the exact app/test
# sources directly, independent of Tauri's generated flavor/task names.
set -euo pipefail
cd "$(dirname "$0")/.."
widget_test_dir=$(mktemp -d "${RUNNER_TEMP:-${TMPDIR:-/tmp}}/remonook-widget-tests.XXXXXX")
trap 'rm -rf "$widget_test_dir"' EXIT
fetch() { curl --fail --silent --show-error --location --retry 3 "$1" -o "$widget_test_dir/$2"; }
fetch https://github.com/JetBrains/kotlin/releases/download/v2.2.10/kotlin-compiler-2.2.10.zip kotlin.zip
fetch https://repo.maven.apache.org/maven2/junit/junit/4.13.2/junit-4.13.2.jar junit.jar
fetch https://repo.maven.apache.org/maven2/org/hamcrest/hamcrest-core/1.3/hamcrest-core-1.3.jar hamcrest.jar
(
 cd "$widget_test_dir"
 echo '302d1d8e671e5c3207e6ed62ff11fb555462a628e22a1158254dcaaf7e7394bc  kotlin.zip' | sha256sum --check --status
 echo '8e495b634469d64fb8acfa3495a065cbacc8a0fff55ce1e31007be4c16dc57d3  junit.jar' | sha256sum --check --status
 echo '66fdef91e9739348df7a096aa384a5685f4e875584cce89386a7a47251c4d8e9  hamcrest.jar' | sha256sum --check --status
 unzip -q kotlin.zip
)
bash "$widget_test_dir/kotlinc/bin/kotlinc" \
 -classpath "$widget_test_dir/junit.jar:$widget_test_dir/hamcrest.jar" \
 -d "$widget_test_dir/classes" \
 src-tauri/gen/android/app/src/main/java/com/remonook/app/StudyWidgetPages.kt \
 src-tauri/gen/android/app/src/test/java/com/remonook/app/StudyWidgetPagesTest.kt
java -classpath "$widget_test_dir/classes:$widget_test_dir/kotlinc/lib/kotlin-stdlib.jar:$widget_test_dir/junit.jar:$widget_test_dir/hamcrest.jar" \
 org.junit.runner.JUnitCore com.remonook.app.StudyWidgetPagesTest
