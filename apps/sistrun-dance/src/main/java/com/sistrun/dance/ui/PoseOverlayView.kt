package com.sistrun.dance.ui

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.util.AttributeSet
import android.view.View
import com.sistrun.dance.net.PosePoint

class PoseOverlayView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
    defStyleAttr: Int = 0
) : View(context, attrs, defStyleAttr) {

    private val linePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.parseColor("#47E0FF")
        strokeWidth = 6f
        style = Paint.Style.STROKE
    }

    private val pointPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.parseColor("#F9FF70")
        style = Paint.Style.FILL
    }

    @Volatile
    private var points: List<PosePoint> = emptyList()

    fun setLandmarks(newPoints: List<PosePoint>) {
        points = newPoints
        postInvalidateOnAnimation()
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        if (points.isEmpty()) {
            return
        }

        drawConnections(canvas)
        drawPoints(canvas)
    }

    private fun drawConnections(canvas: Canvas) {
        for ((start, end) in CONNECTIONS) {
            if (start >= points.size || end >= points.size) {
                continue
            }
            val from = points[start]
            val to = points[end]
            if (from.visibility < MIN_VISIBILITY || to.visibility < MIN_VISIBILITY) {
                continue
            }

            canvas.drawLine(
                from.x * width,
                from.y * height,
                to.x * width,
                to.y * height,
                linePaint
            )
        }
    }

    private fun drawPoints(canvas: Canvas) {
        points.forEach { point ->
            if (point.visibility < MIN_VISIBILITY) {
                return@forEach
            }
            canvas.drawCircle(point.x * width, point.y * height, 9f, pointPaint)
        }
    }

    companion object {
        private const val MIN_VISIBILITY = 0.25f

        private val CONNECTIONS = listOf(
            0 to 1, 1 to 2, 2 to 3, 3 to 7,
            0 to 4, 4 to 5, 5 to 6, 6 to 8,
            9 to 10,
            11 to 12,
            11 to 13, 13 to 15, 15 to 17, 15 to 19, 15 to 21,
            12 to 14, 14 to 16, 16 to 18, 16 to 20, 16 to 22,
            11 to 23, 12 to 24, 23 to 24,
            23 to 25, 25 to 27, 27 to 29, 29 to 31,
            24 to 26, 26 to 28, 28 to 30, 30 to 32,
            27 to 31, 28 to 32
        )
    }
}
