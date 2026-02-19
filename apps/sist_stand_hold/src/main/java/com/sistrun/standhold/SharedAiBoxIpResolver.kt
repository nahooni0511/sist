package com.sistrun.standhold

import android.content.Context
import android.net.Uri

object SharedAiBoxIpResolver {
    fun read(context: Context): String? {
        return runCatching {
            context.contentResolver.query(
                CONTENT_URI_AI_BOX_IP,
                arrayOf(COLUMN_VALUE),
                null,
                null,
                null
            )?.use { cursor ->
                if (!cursor.moveToFirst()) {
                    return@use null
                }
                val valueIndex = cursor.getColumnIndex(COLUMN_VALUE)
                if (valueIndex >= 0) {
                    cursor.getString(valueIndex)?.trim()?.takeIf(String::isNotBlank)
                } else {
                    cursor.getString(0)?.trim()?.takeIf(String::isNotBlank)
                }
            }
        }.getOrNull()
    }

    private const val COLUMN_VALUE = "value"
    private val CONTENT_URI_AI_BOX_IP: Uri =
        Uri.parse("content://com.sistrun.manager.settings/value/AI_BOX_IP")
}
