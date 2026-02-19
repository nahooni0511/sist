package com.sistrun.launcher

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RadialGradient
import android.graphics.Shader
import android.util.AttributeSet
import android.view.View
import kotlin.math.min

class CardGlowView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null
) : View(context, attrs) {

    private val glowPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.FILL
    }
    private var glowIntensity = 0f

    fun setGlowIntensity(value: Float) {
        val clamped = value.coerceIn(0f, 1f)
        if (clamped == glowIntensity) {
            return
        }
        glowIntensity = clamped
        invalidate()
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        if (glowIntensity <= 0f || width == 0 || height == 0) {
            return
        }

        val w = width.toFloat()
        val h = height.toFloat()
        val cx = w * 0.5f
        val cy = h * 0.5f
        val majorRadius = min(w, h) * lerp(0.42f, 0.52f, glowIntensity)
        val coreAlpha = lerp(72f, 232f, glowIntensity).toInt()
        val midAlpha = lerp(42f, 146f, glowIntensity).toInt()
        glowPaint.shader = RadialGradient(
            cx,
            cy * 0.98f,
            majorRadius,
            intArrayOf(
                Color.argb(coreAlpha, 86, 188, 255),
                Color.argb(midAlpha, 52, 124, 230),
                Color.argb((midAlpha * 0.45f).toInt(), 35, 84, 176),
                Color.argb((midAlpha * 0.16f).toInt(), 24, 66, 144),
                Color.TRANSPARENT,
                Color.TRANSPARENT
            ),
            floatArrayOf(0f, 0.22f, 0.38f, 0.52f, 0.7f, 1f),
            Shader.TileMode.CLAMP
        )
        canvas.save()
        canvas.scale(1.02f, 1.08f, cx, cy)
        canvas.drawCircle(cx, cy, majorRadius, glowPaint)
        canvas.restore()

        val coreRadius = majorRadius * 0.5f
        val coreGlowAlpha = lerp(44f, 136f, glowIntensity).toInt()
        glowPaint.shader = RadialGradient(
            cx,
            cy * 0.95f,
            coreRadius,
            intArrayOf(
                Color.argb(coreGlowAlpha, 120, 212, 255),
                Color.argb((coreGlowAlpha * 0.56f).toInt(), 82, 168, 255),
                Color.argb((coreGlowAlpha * 0.2f).toInt(), 54, 124, 212),
                Color.TRANSPARENT,
                Color.TRANSPARENT
            ),
            floatArrayOf(0f, 0.24f, 0.4f, 0.56f, 1f),
            Shader.TileMode.CLAMP
        )
        canvas.save()
        canvas.scale(1.01f, 1.04f, cx, cy)
        canvas.drawCircle(cx, cy, coreRadius, glowPaint)
        canvas.restore()

        val lowerRadius = majorRadius * 0.64f
        val lowerGlowAlpha = lerp(30f, 92f, glowIntensity).toInt()
        glowPaint.shader = RadialGradient(
            cx,
            cy * 1.16f,
            lowerRadius,
            intArrayOf(
                Color.argb(lowerGlowAlpha, 72, 148, 245),
                Color.argb((lowerGlowAlpha * 0.44f).toInt(), 42, 94, 192),
                Color.argb((lowerGlowAlpha * 0.16f).toInt(), 28, 68, 146),
                Color.TRANSPARENT,
                Color.TRANSPARENT
            ),
            floatArrayOf(0f, 0.32f, 0.48f, 0.62f, 1f),
            Shader.TileMode.CLAMP
        )
        canvas.save()
        canvas.scale(1.02f, 0.86f, cx, cy)
        canvas.drawCircle(cx, cy, lowerRadius, glowPaint)
        canvas.restore()

        glowPaint.shader = null
    }

    private fun lerp(start: Float, end: Float, fraction: Float): Float {
        val normalized = fraction.coerceIn(0f, 1f)
        return start + ((end - start) * normalized)
    }
}
