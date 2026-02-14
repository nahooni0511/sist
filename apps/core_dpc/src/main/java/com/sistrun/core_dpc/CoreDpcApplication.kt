package com.sistrun.core_dpc

import android.app.Application
import com.sistrun.core_dpc.idle.IdleCoordinator

class CoreDpcApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        IdleCoordinator.initialize(this)
    }
}
