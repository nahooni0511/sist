package com.sistrun.core_dpc.install

import android.content.Context

class ManagedAppRegistry(context: Context) {

    private val prefs = context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)

    @Synchronized
    fun register(packageName: String) {
        val set = prefs.getStringSet(KEY_PACKAGES, emptySet()).orEmpty().toMutableSet()
        set.add(packageName)
        prefs.edit().putStringSet(KEY_PACKAGES, set).apply()
    }

    @Synchronized
    fun unregister(packageName: String) {
        val set = prefs.getStringSet(KEY_PACKAGES, emptySet()).orEmpty().toMutableSet()
        set.remove(packageName)
        prefs.edit().putStringSet(KEY_PACKAGES, set).apply()
    }

    @Synchronized
    fun listManagedPackages(): List<String> {
        return prefs.getStringSet(KEY_PACKAGES, emptySet()).orEmpty().toList().sorted()
    }

    companion object {
        private const val PREF_NAME = "core_dpc_managed_apps"
        private const val KEY_PACKAGES = "managed_packages"
    }
}
