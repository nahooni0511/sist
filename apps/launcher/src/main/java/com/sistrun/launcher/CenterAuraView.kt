package com.sistrun.launcher

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RadialGradient
import android.graphics.Shader
import android.util.AttributeSet
import android.view.View
import kotlin.math.max

class CenterAuraView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null
) : View(context, attrs) {

    private val auraPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.FILL
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        if (width == 0 || height == 0) {
            return
        }

        val w = width.toFloat()
        val h = height.toFloat()
        val cx = w * 0.5f
        val cy = h * 0.46f
        val radius = max(w, h) * 0.86f

        auraPaint.shader = RadialGradient(
            cx,
            cy,
            radius,
            intArrayOf(
                Color.argb(146, 98, 182, 255),
                Color.argb(92, 56, 116, 219),
                Color.argb(44, 34, 72, 148),
                Color.TRANSPARENT,
                Color.TRANSPARENT
            ),
            floatArrayOf(0f, 0.3f, 0.52f, 0.76f, 1f),
            Shader.TileMode.CLAMP
        )
        canvas.save()
        canvas.scale(1.18f, 0.98f, cx, cy)
        canvas.drawCircle(cx, cy, radius, auraPaint)
        canvas.restore()

        val coreRadius = radius * 0.62f
        auraPaint.shader = RadialGradient(
            cx,
            cy * 0.98f,
            coreRadius,
            intArrayOf(
                Color.argb(156, 124, 210, 255),
                Color.argb(96, 78, 148, 236),
                Color.argb(34, 44, 90, 176),
                Color.TRANSPARENT,
                Color.TRANSPARENT
            ),
            floatArrayOf(0f, 0.34f, 0.58f, 0.78f, 1f),
            Shader.TileMode.CLAMP
        )
        canvas.save()
        canvas.scale(1.08f, 0.9f, cx, cy)
        canvas.drawCircle(cx, cy, coreRadius, auraPaint)
        canvas.restore()

        val spillRadius = radius * 0.94f
        auraPaint.shader = RadialGradient(
            cx,
            cy * 1.3f,
            spillRadius,
            intArrayOf(
                Color.argb(98, 66, 140, 236),
                Color.argb(52, 42, 92, 184),
                Color.argb(20, 24, 54, 128),
                Color.TRANSPARENT,
                Color.TRANSPARENT
            ),
            floatArrayOf(0f, 0.44f, 0.64f, 0.84f, 1f),
            Shader.TileMode.CLAMP
        )
        canvas.save()
        canvas.scale(1.28f, 0.62f, cx, cy)
        canvas.drawCircle(cx, cy, spillRadius, auraPaint)
        canvas.restore()

        auraPaint.shader = null
    }
}
