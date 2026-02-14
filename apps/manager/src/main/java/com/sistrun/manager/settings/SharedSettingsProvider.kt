package com.sistrun.manager.settings

import android.content.ContentProvider
import android.content.ContentValues
import android.content.UriMatcher
import android.database.Cursor
import android.database.MatrixCursor
import android.net.Uri

class SharedSettingsProvider : ContentProvider() {

    override fun onCreate(): Boolean = true

    override fun query(
        uri: Uri,
        projection: Array<out String>?,
        selection: String?,
        selectionArgs: Array<out String>?,
        sortOrder: String?
    ): Cursor {
        val context = requireNotNull(context)
        val settings = ManagerPrefs.sharedSettings(context)
        val cursor = MatrixCursor(arrayOf(COLUMN_KEY, COLUMN_VALUE))

        when (uriMatcher.match(uri)) {
            MATCH_ALL -> {
                settings.forEach { (key, value) ->
                    cursor.addRow(arrayOf(key, value))
                }
            }

            MATCH_ONE -> {
                val key = uri.lastPathSegment.orEmpty()
                settings[key]?.let { value ->
                    cursor.addRow(arrayOf(key, value))
                }
            }

            else -> throw IllegalArgumentException("Unsupported URI: $uri")
        }

        return cursor
    }

    override fun getType(uri: Uri): String {
        return when (uriMatcher.match(uri)) {
            MATCH_ALL -> "vnd.android.cursor.dir/vnd.$AUTHORITY.values"
            MATCH_ONE -> "vnd.android.cursor.item/vnd.$AUTHORITY.value"
            else -> throw IllegalArgumentException("Unsupported URI: $uri")
        }
    }

    override fun insert(uri: Uri, values: ContentValues?): Uri? {
        throw UnsupportedOperationException("Insert is not supported")
    }

    override fun delete(uri: Uri, selection: String?, selectionArgs: Array<out String>?): Int {
        throw UnsupportedOperationException("Delete is not supported")
    }

    override fun update(
        uri: Uri,
        values: ContentValues?,
        selection: String?,
        selectionArgs: Array<out String>?
    ): Int {
        throw UnsupportedOperationException("Update is not supported")
    }

    companion object {
        const val AUTHORITY = "com.sistrun.manager.settings"
        const val COLUMN_KEY = "key"
        const val COLUMN_VALUE = "value"

        private const val MATCH_ALL = 1
        private const val MATCH_ONE = 2

        private val uriMatcher = UriMatcher(UriMatcher.NO_MATCH).apply {
            addURI(AUTHORITY, "values", MATCH_ALL)
            addURI(AUTHORITY, "value/*", MATCH_ONE)
        }

        val CONTENT_URI_ALL: Uri = Uri.parse("content://$AUTHORITY/values")
    }
}
