package com.sistrun.manager.ipc

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.ServiceConnection
import android.os.IBinder
import android.util.Log
import com.sistrun.core_dpc.ipc.ICoreDpcService
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

class CoreDpcClient(private val context: Context) {

    @Volatile
    private var service: ICoreDpcService? = null
    private var bound = false

    private val connection = object : ServiceConnection {
        override fun onServiceConnected(name: ComponentName?, binder: IBinder?) {
            service = ICoreDpcService.Stub.asInterface(binder)
            Log.i(TAG, "Connected to core_dpc")
        }

        override fun onServiceDisconnected(name: ComponentName?) {
            service = null
            Log.w(TAG, "Disconnected from core_dpc")
        }
    }

    fun bind(): Boolean {
        if (bound) {
            return true
        }
        val intent = Intent(ACTION_BIND_CORE_DPC).setPackage(CORE_DPC_PACKAGE)
        bound = context.bindService(intent, connection, Context.BIND_AUTO_CREATE)
        return bound
    }

    fun unbind() {
        if (!bound) {
            return
        }
        runCatching {
            context.unbindService(connection)
        }
        bound = false
        service = null
    }

    fun withService(block: (ICoreDpcService) -> Unit): Boolean {
        val target = service ?: return false
        return runCatching {
            block(target)
            true
        }.getOrElse {
            Log.e(TAG, "IPC call failed", it)
            false
        }
    }

    fun isReady(): Boolean = service != null

    companion object {
        private const val TAG = "IPC"
        const val CORE_DPC_PACKAGE = "com.sistrun.core_dpc"
        const val ACTION_BIND_CORE_DPC = "com.sistrun.core_dpc.BIND"
    }
}

object CoreDpcBlockingClient {
    private const val TAG = "IPC"

    fun <T> call(context: Context, timeoutMs: Long = 5000L, block: (ICoreDpcService) -> T): T? {
        val latch = CountDownLatch(1)
        var service: ICoreDpcService? = null

        val connection = object : ServiceConnection {
            override fun onServiceConnected(name: ComponentName?, binder: IBinder?) {
                service = ICoreDpcService.Stub.asInterface(binder)
                latch.countDown()
            }

            override fun onServiceDisconnected(name: ComponentName?) {
                service = null
            }
        }

        val intent = Intent(CoreDpcClient.ACTION_BIND_CORE_DPC).setPackage(CoreDpcClient.CORE_DPC_PACKAGE)
        val bound = context.bindService(intent, connection, Context.BIND_AUTO_CREATE)
        if (!bound) {
            Log.w(TAG, "Failed to bind core_dpc in blocking call")
            return null
        }

        return try {
            if (!latch.await(timeoutMs, TimeUnit.MILLISECONDS)) {
                Log.w(TAG, "Timeout while waiting for core_dpc bind")
                return null
            }
            val target = service ?: return null
            block(target)
        } catch (e: Exception) {
            Log.e(TAG, "Blocking IPC call failed", e)
            null
        } finally {
            runCatching { context.unbindService(connection) }
        }
    }
}
