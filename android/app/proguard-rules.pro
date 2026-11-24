# Keep ManageDataLauncherActivity since androidbrowserhelper's LauncherActivity.onCreate()
# passes ManageDataLauncherActivity.class to PackageManager.setComponentEnabledSetting().
-keep class com.google.androidbrowserhelper.trusted.ManageDataLauncherActivity { *; }
